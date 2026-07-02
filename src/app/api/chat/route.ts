import { NextRequest, NextResponse } from 'next/server';
import { getQwenConfig, callQwenChat, callQwenImageGeneration, type QwenCallError, type QwenConfig } from '@/lib/qwen-client';
import type { CreativeWorkflowPlan, GenerationModelRouting, GenerativeUIComponent, PromptOverrides, ProjectSettings, ReusableAssetPlan, Scene, VideoBrief, VideoScript } from '@/core/types';
import {
  detectPlanApproval,
  detectChatIntent,
  extractConceptFromMessages,
  buildBriefFromProject,
  buildStoryboardScenes,
  buildCreativeWorkflowPlanWithPrompts,
  BRAINSTORM_SYSTEM_PROMPT,
  shouldPresentPlan,
  getConversationSuggestions,
  buildFallbackConversation,
  shouldPresentScript,
  detectScriptApproval,
  isSkipToWorkflow,
  wantsInfluencerStep,
  wantsBackgroundStep,
  wantsFramesStep,
  buildFallbackVideoScriptFromPlan,
  getScriptFromJson,
} from '@/features/chat';
import { resolvePrompt } from '@/core/prompts';

function framePrompt(scene: Scene, kind: 'start' | 'end', plan: CreativeWorkflowPlan, promptOverrides?: PromptOverrides): string {
  const assetNotes = plan.reusableAssets
    .filter((asset) => scene.assetsUsed?.includes(asset.id))
    .map((asset) => `${asset.name}: ${asset.description}. ${asset.consistencyNotes}`)
    .join('\n');
  const referenceNotes = (plan.consistencyReferences ?? [])
    .filter((ref) => ref.reusePolicy === 'always' || ref.appliesToSceneIds.includes(scene.id))
    .map((ref) => `${ref.name} (${ref.type}, ${ref.reusePolicy}): ${ref.consistencyNotes}`)
    .join('\n');
  const base = kind === 'start' ? scene.startFramePrompt : scene.endFramePrompt;
  return resolvePrompt(kind === 'start' ? 'frame.start.consistency' : 'frame.end.consistency', {
    base,
    style: plan.toneAndStyle,
    mode: plan.videoMode,
    continuity: plan.consistencyRequirements.join(' '),
    assets: assetNotes || 'No reusable asset assigned.',
    references: referenceNotes || 'Use project visual direction and scene prompt only.',
    camera: scene.cameraMovement,
    lighting: scene.lighting,
    avoid: scene.negativePrompt || scene.avoid || '',
  }, promptOverrides);
}

function withGenerationModels(config: QwenConfig, generationModels?: Partial<GenerationModelRouting>): QwenConfig {
  if (!generationModels) return config;
  return {
    ...config,
    model: generationModels.plannerModel || config.model,
    imageModel: generationModels.imageModel || config.imageModel,
    frameModel: generationModels.frameModel || config.frameModel,
    videoModel: generationModels.videoModel || config.videoModel,
    motionControlModel: generationModels.motionControlModel || config.motionControlModel,
    directorModel: generationModels.directorModel || config.directorModel,
    effort: generationModels.effort || config.effort,
  };
}

function isRateLimit(error: unknown): boolean {
  const err = error as Partial<QwenCallError>;
  return Boolean(
    err?.message?.toLowerCase().includes('rate') ||
    err?.message?.toLowerCase().includes('throttling')
  );
}

async function generateImageWithRetry(
  config: QwenConfig,
  prompt: string,
  options: { model: string; negativePrompt?: string },
): Promise<{ url: string; model: string }> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await callQwenImageGeneration(config, prompt, options);
    } catch (error) {
      lastError = error;
      if (!isRateLimit(error) || attempt === 2) break;
      await new Promise((resolve) => setTimeout(resolve, 4000 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function hydratePlanImages(plan: CreativeWorkflowPlan, config: QwenConfig, promptOverrides?: PromptOverrides): Promise<CreativeWorkflowPlan> {
  const next: CreativeWorkflowPlan = structuredClone(plan);
  next.approvalStatus = 'approved';

  for (const asset of next.reusableAssets) {
    try {
      const result = await generateImageWithRetry(config, asset.referenceImagePrompt, {
        model: config.imageModel,
        negativePrompt: asset.negativePrompt,
      });
      asset.generatedImageUrl = result.url;
      asset.generationStatus = 'generated';
      asset.generationModel = result.model;
      asset.generationError = undefined;
    } catch (error) {
      const err = error as QwenCallError;
      asset.generationStatus = 'failed';
      asset.generationModel = config.imageModel;
      asset.generationError = err.message;
    }
  }

  for (const scene of next.scenes) {
    try {
      const start = await generateImageWithRetry(config, framePrompt(scene, 'start', next, promptOverrides), {
          model: config.frameModel,
          negativePrompt: scene.negativePrompt || scene.avoid,
      });
      const end = await generateImageWithRetry(config, framePrompt(scene, 'end', next, promptOverrides), {
          model: config.frameModel,
          negativePrompt: scene.negativePrompt || scene.avoid,
      });
      scene.startFrameUrl = start.url;
      scene.endFrameUrl = end.url;
      scene.generatedStartFrameUrl = start.url;
      scene.generatedEndFrameUrl = end.url;
      scene.frameGenerationStatus = 'generated';
      scene.frameGenerationModel = start.model;
      scene.frameGenerationError = undefined;
    } catch (error) {
      const err = error as QwenCallError;
      scene.frameGenerationStatus = 'failed';
      scene.frameGenerationModel = config.frameModel;
      scene.frameGenerationError = err.message;
    }
  }

  next.approvalStatus = 'assets_generated';
  next.consistencyReferences = next.consistencyReferences.map((ref) => {
    const asset = next.reusableAssets.find((item) => `ref-${item.id}` === ref.id || item.id === ref.id.replace(/^ref-/, ''));
    return asset
      ? {
          ...ref,
          imageUrl: asset.generatedImageUrl ?? ref.imageUrl,
          prompt: asset.referenceImagePrompt,
          negativePrompt: asset.negativePrompt,
          consistencyNotes: asset.consistencyNotes,
        }
      : ref;
  });

  return next;
}

function getInfluencerAsset(plan: CreativeWorkflowPlan): ReusableAssetPlan | undefined {
  return plan.reusableAssets.find((a) => a.type === 'influencer');
}

function getBackgroundAsset(plan: CreativeWorkflowPlan): ReusableAssetPlan | undefined {
  return plan.reusableAssets.find((a) => a.type === 'background' || a.type === 'environment');
}

async function generateSingleAsset(
  asset: ReusableAssetPlan,
  config: QwenConfig | null,
): Promise<ReusableAssetPlan> {
  if (!config) {
    return { ...asset, generationStatus: 'pending', generationError: undefined };
  }
  try {
    const result = await generateImageWithRetry(config, asset.referenceImagePrompt, {
      model: config.imageModel,
      negativePrompt: asset.negativePrompt,
    });
    return {
      ...asset,
      generatedImageUrl: result.url,
      generationStatus: 'generated',
      generationModel: result.model,
      generationError: undefined,
    };
  } catch (error) {
    const err = error as QwenCallError;
    return {
      ...asset,
      generationStatus: 'failed',
      generationModel: config.imageModel,
      generationError: err.message,
    };
  }
}

async function generateSceneFrames(
  scene: Scene,
  plan: CreativeWorkflowPlan,
  config: QwenConfig | null,
  promptOverrides?: PromptOverrides,
): Promise<Scene> {
  if (!config) {
    return { ...scene, frameGenerationStatus: 'pending' };
  }
  try {
    const start = await generateImageWithRetry(config, framePrompt(scene, 'start', plan, promptOverrides), {
      model: config.frameModel,
      negativePrompt: scene.negativePrompt || scene.avoid,
    });
    const end = await generateImageWithRetry(config, framePrompt(scene, 'end', plan, promptOverrides), {
      model: config.frameModel,
      negativePrompt: scene.negativePrompt || scene.avoid,
    });
    return {
      ...scene,
      startFrameUrl: start.url,
      endFrameUrl: end.url,
      generatedStartFrameUrl: start.url,
      generatedEndFrameUrl: end.url,
      frameGenerationStatus: 'generated',
      frameGenerationModel: start.model,
      frameGenerationError: undefined,
    };
  } catch (error) {
    const err = error as QwenCallError;
    return {
      ...scene,
      frameGenerationStatus: 'failed',
      frameGenerationModel: config.frameModel,
      frameGenerationError: err.message,
    };
  }
}

function settingsFromProject(project: any): { aspectRatio?: string; duration?: number } {
  const s = (project?.settings ?? {}) as Partial<ProjectSettings>;
  const briefDuration = project?.videoBrief?.duration as number | undefined;
  return {
    aspectRatio: s.aspectRatio,
    duration: briefDuration,
  };
}

function stagedSuggestions(step: 'script' | 'influencer' | 'background' | 'frames' | 'workflow'): string[] {
  switch (step) {
    case 'script':
      return [
        'Approve the script and generate the influencer next',
        'Make the opening hook more dramatic',
        'Tighten the dialogue in scene 2',
        'Add one more scene before approving',
      ];
    case 'influencer':
      return [
        'Approve the influencer and generate the background',
        'Regenerate the influencer with a different look',
        'Soften the expression',
        'Try a different outfit',
      ];
    case 'background':
      return [
        'Approve the background and generate the frames',
        'Regenerate the background',
        'Make the lighting warmer',
        'Use a cleaner environment',
      ];
    case 'frames':
      return [
        'Approve all frames and open Workflow',
        'Regenerate scene 1 frames',
        'Make the start frame more dynamic',
        'Adjust the end frame composition',
      ];
    default:
      return [];
  }
}

function stagedConversationResponse(content: string, step: 'script' | 'influencer' | 'background' | 'frames' | 'workflow', metadata: Record<string, unknown> = {}, config?: QwenConfig | null) {
  const suggestions = stagedSuggestions(step);
  return NextResponse.json({
    content,
    phase: 'brainstorm',
    generativeUI: suggestions.length
      ? [{ type: 'chat_suggestions', data: { suggestions } } satisfies GenerativeUIComponent]
      : undefined,
    metadata: {
      model: config?.model || 'local',
      intent: 'staged_conversation',
      productionStep: step,
      ...metadata,
    },
  });
}

function conversationResponse(
  content: string,
  convo: { role: string; content: string }[],
  refs: string[],
  metadata: Record<string, unknown> = {},
  config?: QwenConfig | null,
) {
  const suggestions = getConversationSuggestions(convo, refs);
  return NextResponse.json({
    content,
    phase: 'brainstorm',
    generativeUI: suggestions.length
      ? [{ type: 'chat_suggestions', data: { suggestions } } satisfies GenerativeUIComponent]
      : undefined,
    metadata: {
      model: config?.model || 'local',
      intent: 'conversation',
      ...metadata,
    },
  });
}

function scriptResponse(script: VideoScript, metadata: Record<string, unknown> = {}, config?: QwenConfig | null) {
  return NextResponse.json({
    content: resolvePrompt('planning.script.response', {
      sceneCount: script.sceneCount,
      duration: script.durationSeconds,
    }),
    phase: 'script_ready',
    generativeUI: [{ type: 'script_card', data: script } satisfies GenerativeUIComponent],
    metadata: {
      model: config?.model || 'local',
      intent: 'script',
      productionStep: 'script',
      ...metadata,
    },
  });
}

function influencerCardResponse(asset: ReusableAssetPlan, content: string, metadata: Record<string, unknown> = {}) {
  return NextResponse.json({
    content,
    phase: 'influencer_ready',
    generativeUI: [{ type: 'influencer_card', data: asset } satisfies GenerativeUIComponent],
    metadata: {
      intent: 'influencer_step',
      productionStep: 'influencer',
      ...metadata,
    },
  });
}

function backgroundCardResponse(asset: ReusableAssetPlan, content: string, metadata: Record<string, unknown> = {}) {
  return NextResponse.json({
    content,
    phase: 'background_ready',
    generativeUI: [{ type: 'background_card', data: asset } satisfies GenerativeUIComponent],
    metadata: {
      intent: 'background_step',
      productionStep: 'background',
      ...metadata,
    },
  });
}

function framesCardResponse(scenes: Scene[], content: string, metadata: Record<string, unknown> = {}) {
  return NextResponse.json({
    content,
    phase: 'frames_ready',
    generativeUI: [{ type: 'frames_card', data: { scenes } } satisfies GenerativeUIComponent],
    metadata: {
      intent: 'frames_step',
      productionStep: 'frames',
      ...metadata,
    },
  });
}

function workflowHandoffResponse(metadata: Record<string, unknown> = {}) {
  return NextResponse.json({
    content: `Everything is approved — script, influencer identity, background, and start/end frames for every scene.\n\nOpening **Workflow** now with all nodes seeded. You can fine-tune any prompt or motion there before final render.`,
    phase: 'workflow',
    seedFromPlan: true,
    metadata: {
      intent: 'workflow_handoff',
      productionStep: 'workflow',
      ...metadata,
    },
  });
}

function skipToWorkflowResponse(metadata: Record<string, unknown> = {}) {
  return NextResponse.json({
    content: `Skipping to **Workflow**. You'll get a blank canvas — add scenes, scripts, assets, and frames manually, or use the workflow's AI actions to generate from scratch.`,
    phase: 'workflow',
    skipToWorkflow: true,
    metadata: {
      intent: 'skip_to_workflow',
      productionStep: 'workflow',
      ...metadata,
    },
  });
}

function planReviewResponse(plan: CreativeWorkflowPlan, metadata: Record<string, unknown> = {}, config?: QwenConfig | null, promptOverrides?: PromptOverrides) {
  return NextResponse.json({
    content: resolvePrompt('scenario.plan.response', {
      sceneCount: plan.scenes.length,
      assetCount: plan.reusableAssets.length,
    }, promptOverrides),
    phase: 'plan_ready',
    generativeUI: [{ type: 'creative_workflow_plan', data: plan } satisfies GenerativeUIComponent],
    metadata: {
      model: config?.model || 'local',
      imageModel: config?.imageModel,
      frameModel: config?.frameModel,
      videoModel: config?.videoModel,
      directorModel: config?.directorModel,
      intent: 'creative_plan',
      ...metadata,
    },
  });
}

async function approvedAssetsResponse(plan: CreativeWorkflowPlan, metadata: Record<string, unknown> = {}, config?: QwenConfig | null, promptOverrides?: PromptOverrides) {
  const hydrated = config ? await hydratePlanImages(plan, config, promptOverrides) : { ...plan, approvalStatus: 'approved' as const };
  const firstAsset = hydrated.reusableAssets[0]?.name ?? 'reusable visual asset';
  const generatedAssets = hydrated.reusableAssets.filter((asset) => asset.generationStatus === 'generated').length;
  const generatedFramePairs = hydrated.scenes.filter((scene) => scene.frameGenerationStatus === 'generated').length;
  const imageNote = config
    ? `Generated ${generatedAssets}/${hydrated.reusableAssets.length} reusable image asset${hydrated.reusableAssets.length === 1 ? '' : 's'} with **${config.imageModel}** and ${generatedFramePairs}/${hydrated.scenes.length} start/end frame pair${hydrated.scenes.length === 1 ? '' : 's'} with **${config.frameModel}**.`
    : `Image generation is not configured, so I prepared the approved prompts and marked the assets/frames as pending instead of showing fake generated images.`;
  return NextResponse.json({
    content: `Plan approved. I prepared the **${firstAsset}** first so every shot can stay consistent. ${imageNote}\n\nConfirm the generated assets, number of scenes, length, aspect ratio, visual style, main subject, negative prompts, output format, and any manual preferences before generating videos in Workflow.`,
    phase: 'assets_ready',
    generativeUI: [{ type: 'creative_workflow_plan', data: hydrated } satisfies GenerativeUIComponent],
    metadata: {
      model: config?.model || 'local',
      imageModel: config?.imageModel,
      frameModel: config?.frameModel,
      videoModel: config?.videoModel,
      directorModel: config?.directorModel,
      intent: 'approved_asset_generation',
      ...metadata,
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const { messages, project, referenceImageUrls = [], generationModels, promptOverrides = {} } = await req.json();

    const convo = (messages || [])
      .filter((m: { role: string; content: string }) => m.role !== 'system' && m.content)
      .map((m: { role: string; content: string }) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      }));

    const lastUser = convo.filter((m: { role: string }) => m.role === 'user').pop()?.content || '';
    const intent = detectChatIntent(lastUser);
    const approved = detectPlanApproval(lastUser);
    const refs: string[] = referenceImageUrls || project?.referenceImageUrls || [];
    const concept = extractConceptFromMessages(convo);

    // --- Create Brief ---
    if (intent === 'create_brief' && project) {
      const briefData = buildBriefFromProject(project, concept);
      return NextResponse.json({
        content: `Here's a structured brief based on the creative plan. It stays available for later editing, but the current flow will continue through **Workflow** first.`,
        phase: 'brief',
        generativeUI: [{ type: 'video_brief_form', data: briefData }],
        metadata: { model: 'local', intent: 'create_brief' },
      });
    }

    // --- Generate Storyboard (kept for future sections, not required in current flow) ---
    if (intent === 'generate_storyboard' && project) {
      const brief = buildBriefFromProject(project, concept) as VideoBrief;
      const scenes = buildStoryboardScenes(brief, concept, refs);
      return NextResponse.json({
        content: `I've built **${scenes.length} scenes** with prompts ready for the workflow editor. Each scene includes your reference images where attached. Click **Accept All & Continue** to open the n8n-style flow where you can edit every prompt.`,
        generativeUI: [{ type: 'scene_suggestion', data: scenes }],
        metadata: { model: 'local', intent: 'generate_storyboard' },
      });
    }

    const rawConfig = await getQwenConfig();
    const config = rawConfig ? withGenerationModels(rawConfig, generationModels) : null;
    const existingPlan = project?.creativePlan as CreativeWorkflowPlan | undefined;
    const existingScript = project?.videoScript as VideoScript | undefined;
    const scriptApproved = existingScript?.approvalStatus === 'approved';
    const settings = settingsFromProject(project);

    // --- Skip to Workflow (blank canvas) ---
    if (isSkipToWorkflow(lastUser)) {
      return skipToWorkflowResponse({ model: config?.model || 'local' });
    }

    if (approved && existingPlan) {
      return approvedAssetsResponse(
        { ...existingPlan, approvalStatus: 'approved' },
        { model: config ? config.model : 'unconfigured', needsConfig: !config },
        config,
        promptOverrides,
      );
    }

    // --- Staged production flow (default path) ---
    const planForStaged = existingPlan ?? buildCreativeWorkflowPlanWithPrompts(concept || lastUser, refs, promptOverrides);
    const presentScript = shouldPresentScript(lastUser, convo, refs);
    const wantsInfluencer = wantsInfluencerStep(lastUser);
    const wantsBackground = wantsBackgroundStep(lastUser);
    const wantsFrames = wantsFramesStep(lastUser);
    const scriptApprovalClicked = detectScriptApproval(lastUser);

    // 1) Script approval: mark approved, then nudge to influencer (or generate if user combined)
    if (scriptApprovalClicked && existingScript && !scriptApproved) {
      const approvedScript: VideoScript = { ...existingScript, approvalStatus: 'approved' };
      if (wantsInfluencer) {
        const asset = getInfluencerAsset(planForStaged);
        if (asset) {
          const generated = await generateSingleAsset(asset, config);
          return influencerCardResponse(generated, `Script locked. Now generating the **influencer identity** — one stable face, hairstyle, and outfit we'll reuse in every scene.`, {
            model: config?.model || 'local',
            imageModel: config?.imageModel,
            approvedScript,
          });
        }
      }
      return stagedConversationResponse(
        `Script locked. Next I'll generate the **influencer identity** — one stable face, hairstyle, and outfit we'll reuse in every scene. Say "generate the influencer" when you're ready.`,
        'influencer',
        { model: config?.model || 'local', approvedScript },
        config,
      );
    }

    // 2) Generate the script (no images yet)
    if (presentScript && !existingScript) {
      const sceneCount = planForStaged.scenes.length;
      const durationSeconds = settings.duration || planForStaged.suggestedDuration || planForStaged.scenes.reduce((s, sc) => s + sc.duration, 0);
      const aspectRatio = settings.aspectRatio || planForStaged.suggestedAspectRatio || '9:16';
      if (config) {
        try {
          const scriptSystem = resolvePrompt(
            'planning.script.system',
            { sceneCount, durationSeconds, aspectRatio, videoMode: planForStaged.videoMode },
            promptOverrides,
          );
          const result = await callQwenChat(
            config,
            [
              { role: 'system', content: scriptSystem },
              { role: 'user', content: `Concept: ${concept || lastUser}\n\nReturn the JSON script now.` },
            ],
            { jsonMode: true, maxTokens: 1800 },
          );
          const parsed = getScriptFromJson(result.content);
          if (parsed) {
            return scriptResponse(parsed, { model: config.model, tokens: result.usage?.total_tokens, planId: planForStaged.id });
          }
          const fallback = buildFallbackVideoScriptFromPlan(concept || lastUser, planForStaged, settings);
          return scriptResponse(fallback, { model: 'fallback', reason: 'json_parse' });
        } catch (err) {
          const qErr = err as QwenCallError;
          const fallback = buildFallbackVideoScriptFromPlan(concept || lastUser, planForStaged, settings);
          return scriptResponse(fallback, { model: 'fallback', error: qErr.kind, notice: qErr.message });
        }
      }
      const fallback = buildFallbackVideoScriptFromPlan(concept || lastUser, planForStaged, settings);
      return scriptResponse(fallback, { model: 'unconfigured', needsConfig: true });
    }

    // 3) Generate the influencer
    if (scriptApproved && wantsInfluencer) {
      const asset = getInfluencerAsset(planForStaged);
      if (asset) {
        const generated = await generateSingleAsset(asset, config);
        return influencerCardResponse(generated, `Here's the locked influencer identity. Review it, then say "generate the background" to build the environment.`, {
          model: config?.model || 'local',
          imageModel: config?.imageModel,
        });
      }
    }

    // 4) Generate the background
    if (scriptApproved && (wantsBackground || (existingPlan && getInfluencerAsset(existingPlan)?.generatedImageUrl && !getBackgroundAsset(existingPlan)?.generatedImageUrl && /approv|next|generate|background/i.test(lastUser)))) {
      const asset = getBackgroundAsset(planForStaged);
      if (asset) {
        const generated = await generateSingleAsset(asset, config);
        return backgroundCardResponse(generated, `Background locked. Next I'll generate the start and end frames for every scene. Say "generate the frames" when ready.`, {
          model: config?.model || 'local',
          imageModel: config?.imageModel,
        });
      }
    }

    // 5) Generate per-scene frames
    if (scriptApproved && wantsFrames) {
      const scenesWithFrames: Scene[] = [];
      for (const scene of planForStaged.scenes) {
        scenesWithFrames.push(await generateSceneFrames(scene, planForStaged, config, promptOverrides));
      }
      return framesCardResponse(scenesWithFrames, `Start and end frames for all ${scenesWithFrames.length} scenes. Review them, then approve to open Workflow with everything seeded.`, {
        model: config?.model || 'local',
        frameModel: config?.frameModel,
      });
    }

    // 6) Workflow handoff after frames approved
    if (scriptApproved && existingPlan?.approvalStatus === 'assets_generated') {
      return workflowHandoffResponse({ model: config?.model || 'local' });
    }

    const presentPlan = shouldPresentPlan(lastUser, convo, refs);
    const refNote = refs.length
      ? `The user attached ${refs.length} reference image(s). Treat user-provided images as source-of-truth references where relevant.`
      : '';

    if (config) {
      try {
        const result = await callQwenChat(
          config,
          [
            { role: 'system', content: resolvePrompt('planning.chat.system', { referenceCount: refs.length, referenceNote: refNote }, promptOverrides) || BRAINSTORM_SYSTEM_PROMPT },
            ...convo,
          ],
          { jsonMode: false, maxTokens: presentPlan ? 800 : 600 }
        );

        if (!presentPlan && !presentScript) {
          return conversationResponse(result.content, convo, refs, {
            model: config.model,
            tokens: result.usage?.total_tokens,
          }, config);
        }
        if (presentScript && !existingScript) {
          // conversation mode but script is warranted — ask the model to summarize intent, then return fallback script
          const fallback = buildFallbackVideoScriptFromPlan(concept || lastUser, planForStaged, settings);
          return scriptResponse(fallback, { model: config.model, aiPlanningNotes: result.content });
        }

        const plan = buildCreativeWorkflowPlanWithPrompts(concept || lastUser, refs, promptOverrides);
        return planReviewResponse(plan, {
          model: config.model,
          aiPlanningNotes: result.content,
          intent: 'creative_plan',
          tokens: result.usage?.total_tokens,
        }, config, promptOverrides);
      } catch (err) {
        const qErr = err as QwenCallError;
        if (!presentPlan && !presentScript) {
          return conversationResponse(
            buildFallbackConversation(lastUser, convo, refs),
            convo,
            refs,
            { model: 'fallback', error: qErr.kind, notice: qErr.message },
            config,
          );
        }
        if (presentScript && !existingScript) {
          const fallback = buildFallbackVideoScriptFromPlan(concept || lastUser, planForStaged, settings);
          return scriptResponse(fallback, { model: 'fallback', error: qErr.kind, notice: qErr.message });
        }
        const plan = buildCreativeWorkflowPlanWithPrompts(concept || lastUser, refs, promptOverrides);
        return planReviewResponse(plan, { model: 'fallback', error: qErr.kind, notice: qErr.message }, config, promptOverrides);
      }
    }

    if (!presentPlan && !presentScript) {
      return conversationResponse(
        buildFallbackConversation(lastUser, convo, refs),
        convo,
        refs,
        { model: 'unconfigured', needsConfig: true },
        null,
      );
    }
    if (presentScript && !existingScript) {
      const fallback = buildFallbackVideoScriptFromPlan(concept || lastUser, planForStaged, settings);
      return scriptResponse(fallback, { model: 'unconfigured', needsConfig: true });
    }

    const plan = buildCreativeWorkflowPlanWithPrompts(concept || lastUser, refs, promptOverrides);
    return planReviewResponse(plan, { model: 'unconfigured', needsConfig: true }, null, promptOverrides);
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}
