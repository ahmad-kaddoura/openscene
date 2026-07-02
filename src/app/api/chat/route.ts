import { NextRequest, NextResponse } from 'next/server';
import { getQwenConfig, callQwenChat, callQwenImageGeneration, type QwenCallError, type QwenConfig } from '@/lib/qwen-client';
import type {
  AgentConfig,
  AgentType,
  AttachmentAnalysis,
  CreativeWorkflowPlan,
  GenerationModelRouting,
  GenerativeUIComponent,
  NodeAssistantOperation,
  NodeContext,
  PromptOverrides,
  ProjectSettings,
  ReusableAssetPlan,
  Scene,
  VideoBrief,
  VideoScript,
} from '@/core/types';
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
  resolvePreferredSceneCount,
  clampScriptToSceneCount,
  extractSceneCountFromText,
} from '@/features/chat';
import { resolvePrompt } from '@/core/prompts';
import {
  resolveAgent,
  parsePlannerJson,
  normalizePlannerPlan,
  normalizePlannerQuestions,
  summarizeAttachments,
  analyzeNewAttachments,
  runConsistencyCheck,
  runPostGenerationFrameCheck,
  runNodeAssistant,
  buildNodeContextPayload,
} from '@/core/ai';
import type { ClarifyingParameterKey, ClarifyingQuestion } from '@/core/types';

interface ResolvedParameterValue {
  value: string;
  label: string;
}

type ProjectSettingsLike = { aspectRatio?: string; duration?: number; numberOfScenes?: number };

function buildPlanOptions(project: any, convo: { role: string; content: string }[]) {
  const settings = settingsFromProject(project);
  return {
    sceneCount: resolvePreferredSceneCount(convo, project),
    durationSeconds: settings.duration || 20,
  };
}

function isRealFrameUrl(url?: string): boolean {
  return Boolean(url && !url.startsWith('data:image/svg+xml'));
}

// Resolves the current "set" value for a parameter question, so the UI can show
// a "use the set value" button. Falls back to project settings when the plan
// hasn't been drafted yet.
function resolveParameterValue(
  key: ClarifyingParameterKey,
  plan: CreativeWorkflowPlan | undefined,
  settings: ProjectSettingsLike | undefined,
  scenes: Scene[] | undefined,
): ResolvedParameterValue | null {
  if (key === 'sceneCount') {
    const briefCount = settings?.numberOfScenes;
    if (briefCount && briefCount > 0) return { value: `${briefCount} scenes`, label: `${briefCount} scenes (from brief)` };
    const count = scenes?.length ?? plan?.scenes?.length;
    if (count && count > 0) return { value: `${count} scenes`, label: `${count} scenes (from current plan)` };
    return null;
  }
  if (key === 'duration') {
    const seconds = plan?.suggestedDuration ?? settings?.duration;
    if (seconds && seconds > 0) return { value: `${seconds} seconds`, label: `${seconds}s (set on plan/settings)` };
    return null;
  }
  if (key === 'aspectRatio') {
    const ratio = plan?.suggestedAspectRatio ?? settings?.aspectRatio;
    if (ratio && ratio !== 'custom') return { value: ratio, label: `${ratio} (set in settings/plan)` };
    return null;
  }
  if (key === 'videoMode') {
    const mode = plan?.videoMode;
    if (mode) return { value: mode, label: `${mode} (set on plan)` };
    return null;
  }
  if (key === 'startEndFrames') {
    const allScenes = scenes ?? plan?.scenes ?? [];
    if (!allScenes.length) return null;
    const wantsFrames = allScenes.some((s) => Boolean(s.startFramePrompt || s.endFramePrompt));
    return wantsFrames
      ? { value: 'Yes, start and end frames for each scene', label: 'Use current frame settings' }
      : { value: 'No, generate video directly', label: 'Use current frame settings' };
  }
  return null;
}

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
    // Never regenerate an asset that already has an image — reuse it unless the
    // user explicitly asks for a regeneration elsewhere.
    if (asset.generationStatus === 'generated' && asset.generatedImageUrl) continue;
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
    if (scene.frameGenerationStatus === 'generated' && scene.generatedStartFrameUrl) {
      continue;
    }
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

/**
 * Missing-asset gate: any critical asset without a generated image must be
 * generated (or requested) before frames. Returns the list of missing critical
 * assets so the route can decide what to do.
 */
function missingCriticalAssets(plan: CreativeWorkflowPlan): ReusableAssetPlan[] {
  return plan.reusableAssets.filter(
    (a) => a.criticality === 'critical' && a.generationStatus !== 'generated' && !a.generatedImageUrl,
  );
}

async function generateSingleAsset(
  asset: ReusableAssetPlan,
  config: QwenConfig | null,
): Promise<ReusableAssetPlan> {
  if (!config) {
    return { ...asset, generationStatus: 'pending', generationError: undefined };
  }
  if (asset.generationStatus === 'generated' && asset.generatedImageUrl) {
    return asset;
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
  priorEndFrameUrl?: string,
): Promise<Scene> {
  if (!config) {
    return { ...scene, frameGenerationStatus: 'pending' };
  }
  if (scene.frameGenerationStatus === 'generated' && scene.generatedStartFrameUrl) {
    return scene;
  }

  const frameReq = plan.progress?.sceneFrameRequirements.find((r) => r.sceneId === scene.id);
  const needsStartFrame = frameReq?.needsStartFrame ?? true;
  const needsEndFrame = frameReq?.needsEndFrame ?? true;

  try {
    let startUrl: string | undefined;
    if (needsStartFrame) {
      const startPrompt = priorEndFrameUrl
        ? `${framePrompt(scene, 'start', plan, promptOverrides)}\n\nVisual continuity: continue naturally from the previous scene's end frame composition.`
        : framePrompt(scene, 'start', plan, promptOverrides);
      const start = await generateImageWithRetry(config, startPrompt, {
        model: config.frameModel,
        negativePrompt: scene.negativePrompt || scene.avoid,
      });
      startUrl = start.url;
    }

    let endUrl: string | undefined;
    if (needsEndFrame) {
      const endPrompt = startUrl
        ? `${framePrompt(scene, 'end', plan, promptOverrides)}\n\nVisual continuity: this end frame must be a natural continuation of the start frame — same subject, outfit, background, and lighting. The video model will interpolate between them.`
        : framePrompt(scene, 'end', plan, promptOverrides);
      const end = await generateImageWithRetry(config, endPrompt, {
        model: config.frameModel,
        negativePrompt: scene.negativePrompt || scene.avoid,
      });
      endUrl = end.url;
    }

    return {
      ...scene,
      startFrameUrl: startUrl,
      endFrameUrl: endUrl,
      generatedStartFrameUrl: startUrl,
      generatedEndFrameUrl: endUrl,
      frameGenerationStatus: 'generated',
      frameGenerationModel: config.frameModel,
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

function settingsFromProject(project: any): ProjectSettingsLike {
  const s = (project?.settings ?? {}) as Partial<ProjectSettings>;
  const brief = project?.videoBrief as Partial<VideoBrief> | undefined;
  const briefDuration = brief?.duration as number | undefined;
  return {
    aspectRatio: s.aspectRatio,
    duration: briefDuration,
    numberOfScenes: brief?.numberOfScenes,
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

// ============= Node assistant =============

const NODE_ACTIONS: { label: string; prompt: string }[] = [
  { label: 'Edit this prompt', prompt: 'Edit this node\'s prompt to be more cinematic and production-ready.' },
  { label: 'Regenerate this frame', prompt: 'Regenerate this frame while preserving identity and product consistency.' },
  { label: 'Improve consistency', prompt: 'Improve consistency between this frame and the rest of the scene.' },
  { label: 'Replace the asset', prompt: 'Replace this asset with a different look, keeping the same role in the scene.' },
  { label: 'Create a variation', prompt: 'Create a variation of this node.' },
  { label: 'Generate video from this frame', prompt: 'Generate the video for this scene from the current frame.' },
  { label: 'Connect this node to another node', prompt: 'Connect this node to another node in the workflow.' },
  { label: 'Update scene details', prompt: 'Update this scene\'s details: mood, camera, lighting, and timing.' },
];

function applyNodeOperation(op: NodeAssistantOperation, ctx: NodeContext, project: any): { updates?: Partial<Scene>; assetPatch?: ReusableAssetPlan; connection?: { source: string; sourceHandle: string; target: string; targetHandle: string } } {
  const scene = ctx.sceneId ? (project?.creativePlan?.scenes ?? []).find((s: Scene) => s.id === ctx.sceneId) : undefined;
  switch (op.type) {
    case 'update_prompt':
      if (!scene) return {};
      return { updates: { [op.field]: op.value } as Partial<Scene> };
    case 'update_scene_field':
      if (!scene) return {};
      return { updates: { [op.field]: op.value } as Partial<Scene> };
    case 'update_scene_details':
      if (!scene) return {};
      return { updates: op.updates };
    case 'replace_asset': {
      const asset = (project?.creativePlan?.reusableAssets ?? []).find((a: ReusableAssetPlan) => a.id === op.assetId);
      if (!asset) return {};
      return { assetPatch: { ...asset, referenceImagePrompt: op.newPrompt, generationStatus: 'pending', generatedImageUrl: undefined } };
    }
    case 'connect_node':
      return {
        connection: {
          source: ctx.nodeId,
          sourceHandle: op.sourceHandle,
          target: op.targetNodeId,
          targetHandle: op.targetHandle,
        },
      };
    default:
      return {};
  }
}

async function handleNodeContext(
  ctx: NodeContext,
  userMessage: string,
  config: QwenConfig | null,
  agentConfigs: Record<AgentType, AgentConfig> | undefined,
  generationModels: GenerationModelRouting | undefined,
  promptOverrides: PromptOverrides | undefined,
  project: any,
  workflowConnections: { source: string; sourceHandle?: string; target: string; targetHandle?: string }[],
): Promise<NextResponse> {
  const scene = ctx.sceneId ? (project?.creativePlan?.scenes ?? []).find((s: Scene) => s.id === ctx.sceneId) : undefined;
  const asset = ctx.assetId ? (project?.creativePlan?.reusableAssets ?? []).find((a: ReusableAssetPlan) => a.id === ctx.assetId) : undefined;

  if (!config) {
    return NextResponse.json({
      content: `I'm scoped to this ${ctx.nodeKind} node, but the AI provider isn't configured. Add a Qwen API key in Settings → API Keys to let me edit it for you.`,
      phase: 'brainstorm',
      generativeUI: [{ type: 'node_actions', data: { nodeId: ctx.nodeId, nodeKind: ctx.nodeKind, actions: NODE_ACTIONS } } satisfies GenerativeUIComponent],
      metadata: { intent: 'node_context', nodeKind: ctx.nodeKind, needsConfig: true },
    });
  }

  const agent = resolveAgent('node_assistant', agentConfigs, generationModels, promptOverrides);
  if (!agent.enabled) {
    return NextResponse.json({
      content: `The node assistant agent is disabled in Settings. Enable it there to edit this ${ctx.nodeKind} node with AI.`,
      phase: 'brainstorm',
      metadata: { intent: 'node_context', nodeKind: ctx.nodeKind },
    });
  }

  const payload = buildNodeContextPayload(ctx, scene, asset, workflowConnections);
  const result = await runNodeAssistant(config, agent, ctx, userMessage, payload);

  // Apply operations server-side to the project's plan so the client can persist
  // them. The client also receives the operations in metadata for its own
  // workflow-store actions (e.g. regenerate_frame, generate_video).
  let updatedPlan = project?.creativePlan;
  const connectionsToAdd: typeof workflowConnections = [];
  for (const op of result.operations) {
    const applied = applyNodeOperation(op, ctx, project);
    if (applied.updates && updatedPlan && scene) {
      updatedPlan = {
        ...updatedPlan,
        scenes: updatedPlan.scenes.map((s: Scene) => (s.id === scene.id ? { ...s, ...applied.updates } : s)),
      };
    }
    if (applied.assetPatch && updatedPlan) {
      updatedPlan = {
        ...updatedPlan,
        reusableAssets: updatedPlan.reusableAssets.map((a: ReusableAssetPlan) => (a.id === applied.assetPatch!.id ? applied.assetPatch! : a)),
      };
    }
    if (applied.connection) {
      connectionsToAdd.push(applied.connection);
    }
  }

  return NextResponse.json({
    content: result.content,
    phase: 'brainstorm',
    generativeUI: [{ type: 'node_actions', data: { nodeId: ctx.nodeId, nodeKind: ctx.nodeKind, actions: NODE_ACTIONS } } satisfies GenerativeUIComponent],
    metadata: {
      intent: 'node_context',
      nodeKind: ctx.nodeKind,
      nodeId: ctx.nodeId,
      operations: result.operations,
      updatedPlan,
      connectionsToAdd,
      model: agent.modelId,
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const {
      messages,
      project,
      referenceImageUrls = [],
      generationModels,
      promptOverrides = {},
      agentConfigs,
      nodeContext,
    } = await req.json();

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

    // --- Node-scoped chat takes priority when a node is selected ---
    if (nodeContext && nodeContext.nodeId) {
      return await handleNodeContext(
        nodeContext,
        lastUser,
        await getQwenConfig(),
        agentConfigs,
        generationModels,
        promptOverrides,
        project,
        project?.workflowGraph?.edges ?? [],
      );
    }

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
      const scenes = buildStoryboardScenes(brief, concept, refs, promptOverrides);
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
    const planOptions = buildPlanOptions(project, convo);
    const sceneCountChanged = Boolean(extractSceneCountFromText(lastUser));
    const fallbackPlan = existingPlan && !(sceneCountChanged && existingPlan.scenes.length !== planOptions.sceneCount)
      ? existingPlan
      : buildCreativeWorkflowPlanWithPrompts(concept || lastUser, refs, promptOverrides, planOptions);
    const presentScript = shouldPresentScript(lastUser, convo, refs);
    const wantsInfluencer = wantsInfluencerStep(lastUser);
    const wantsBackground = wantsBackgroundStep(lastUser);
    const wantsFrames = wantsFramesStep(lastUser);
    const scriptApprovalClicked = detectScriptApproval(lastUser);

    // 1) Script approval: mark approved, then nudge to influencer (or generate if user combined)
    if (scriptApprovalClicked && existingScript && !scriptApproved) {
      const approvedScript: VideoScript = { ...existingScript, approvalStatus: 'approved' };
      if (wantsInfluencer) {
        const asset = getInfluencerAsset(fallbackPlan);
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
      const sceneCount = planOptions.sceneCount;
      const durationSeconds = settings.duration || fallbackPlan.suggestedDuration || fallbackPlan.scenes.reduce((s, sc) => s + sc.duration, 0);
      const aspectRatio = settings.aspectRatio || fallbackPlan.suggestedAspectRatio || '9:16';
      const scriptPlan = fallbackPlan.scenes.length === sceneCount
        ? fallbackPlan
        : buildCreativeWorkflowPlanWithPrompts(concept || lastUser, refs, promptOverrides, { ...planOptions, sceneCount });
      if (config) {
        try {
          const scriptSystem = resolvePrompt(
            'planning.script.system',
            { sceneCount, durationSeconds, aspectRatio, videoMode: scriptPlan.videoMode },
            promptOverrides,
          );
          const result = await callQwenChat(
            config,
            [
              { role: 'system', content: scriptSystem },
              { role: 'user', content: `Concept: ${concept || lastUser}\n\nThe user wants exactly ${sceneCount} scene(s). Return the JSON script now.` },
            ],
            { jsonMode: true, maxTokens: 1800 },
          );
          const parsed = getScriptFromJson(result.content, sceneCount);
          if (parsed) {
            return scriptResponse(parsed, { model: config.model, tokens: result.usage?.total_tokens, planId: scriptPlan.id });
          }
          const fallback = buildFallbackVideoScriptFromPlan(concept || lastUser, scriptPlan, settings);
          return scriptResponse(clampScriptToSceneCount(fallback, sceneCount), { model: 'fallback', reason: 'json_parse' });
        } catch (err) {
          const qErr = err as QwenCallError;
          const fallback = buildFallbackVideoScriptFromPlan(concept || lastUser, scriptPlan, settings);
          return scriptResponse(clampScriptToSceneCount(fallback, sceneCount), { model: 'fallback', error: qErr.kind, notice: qErr.message });
        }
      }
      const fallback = buildFallbackVideoScriptFromPlan(concept || lastUser, scriptPlan, settings);
      return scriptResponse(clampScriptToSceneCount(fallback, sceneCount), { model: 'unconfigured', needsConfig: true });
    }

    // 3) Generate the influencer
    if (scriptApproved && wantsInfluencer) {
      const asset = getInfluencerAsset(fallbackPlan);
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
      const asset = getBackgroundAsset(fallbackPlan);
      if (asset) {
        const generated = await generateSingleAsset(asset, config);
        return backgroundCardResponse(generated, `Background locked. Next I'll generate the start and end frames for every scene. Say "generate the frames" when ready.`, {
          model: config?.model || 'local',
          imageModel: config?.imageModel,
        });
      }
    }

    // 5) Generate per-scene frames — with missing-asset gate + consistency check
    if (scriptApproved && wantsFrames) {
      // Missing-asset gate: generate critical assets first if they're missing.
      const missing = missingCriticalAssets(fallbackPlan);
      if (missing.length && config) {
        const patchedPlan: CreativeWorkflowPlan = { ...fallbackPlan, reusableAssets: fallbackPlan.reusableAssets.map((a) => a) };
        for (const asset of missing) {
          const generated = await generateSingleAsset(asset, config);
          patchedPlan.reusableAssets = patchedPlan.reusableAssets.map((a) => (a.id === generated.id ? generated : a));
        }
        // Recompute consistency references with the newly generated assets.
        patchedPlan.consistencyReferences = patchedPlan.consistencyReferences.map((ref) => {
          const asset = patchedPlan.reusableAssets.find((item) => `ref-${item.id}` === ref.id || item.id === ref.id.replace(/^ref-/, ''));
          return asset ? { ...ref, imageUrl: asset.generatedImageUrl ?? ref.imageUrl } : ref;
        });
        const generatedCount = patchedPlan.reusableAssets.filter((a) => a.generationStatus === 'generated').length;
        return NextResponse.json({
          content: `Before frames, I generated the missing critical asset${missing.length === 1 ? '' : 's'} (${generatedCount}/${patchedPlan.reusableAssets.length} ready). Review them, then say "generate the frames" again.`,
          phase: 'assets_ready',
          generativeUI: [{ type: 'creative_workflow_plan', data: patchedPlan } satisfies GenerativeUIComponent],
          metadata: { intent: 'missing_asset_gate', imageModel: config.imageModel },
        });
      }

      // Consistency check before frame generation (best-effort, non-blocking).
      let consistencyFindings: string[] = [];
      if (config) {
        try {
          const checkerAgent = resolveAgent('consistency_checker', agentConfigs, generationModels, promptOverrides);
          if (checkerAgent.enabled) {
            const review = await runConsistencyCheck(config, checkerAgent, fallbackPlan, fallbackPlan.scenes, fallbackPlan.reusableAssets, promptOverrides);
            consistencyFindings = review.findings;
            // Apply rewritten prompts to the plan's scenes so frame generation uses them.
            for (const r of review.rewritten) {
              if (r.field === 'startFramePrompt' || r.field === 'endFramePrompt') {
                const sceneId = r.id.replace(/-(start|end)$/, '');
                fallbackPlan.scenes = fallbackPlan.scenes.map((s) => (s.id === sceneId ? { ...s, [r.field]: r.rewrittenPrompt } : s));
              } else if (r.field === 'referenceImagePrompt') {
                fallbackPlan.reusableAssets = fallbackPlan.reusableAssets.map((a) => (a.id === r.id ? { ...a, referenceImagePrompt: r.rewrittenPrompt } : a));
              }
            }
          }
        } catch {
          // Consistency check is best-effort; never block frame generation.
        }
      }

      const scenesWithFrames: Scene[] = [];
      let priorEndFrameUrl: string | undefined;
      for (const scene of fallbackPlan.scenes) {
        const withFrames = await generateSceneFrames(scene, fallbackPlan, config, promptOverrides, priorEndFrameUrl);
        scenesWithFrames.push(withFrames);
        if (isRealFrameUrl(withFrames.generatedEndFrameUrl ?? withFrames.endFrameUrl)) {
          priorEndFrameUrl = withFrames.generatedEndFrameUrl ?? withFrames.endFrameUrl;
        }
      }

      // Optional post-generation frame-pair vision check — best-effort, only on
      // the first scene with both frames to keep latency/cost reasonable.
      let postFindings: string[] = [];
      if (config) {
        try {
          const checkerAgent = resolveAgent('consistency_checker', agentConfigs, generationModels, promptOverrides);
          if (checkerAgent.enabled) {
            const sampleScene = scenesWithFrames.find((s) => s.startFrameUrl && s.endFrameUrl);
            if (sampleScene) {
              const referenceAsset = fallbackPlan.reusableAssets.find((a) => a.generatedImageUrl);
              const post = await runPostGenerationFrameCheck(
                config,
                checkerAgent,
                sampleScene,
                referenceAsset?.generatedImageUrl,
              );
              if (post.mismatch && post.findings.length) {
                postFindings = post.findings.map((f) => `${sampleScene.title}: ${f}`);
              }
            }
          }
        } catch {
          // Post-generation check is best-effort.
        }
      }

      const gui: GenerativeUIComponent[] = [{ type: 'frames_card', data: { scenes: scenesWithFrames } } satisfies GenerativeUIComponent];
      const allFindings = [...consistencyFindings, ...postFindings];
      if (allFindings.length) {
        gui.push({ type: 'consistency_review', data: { findings: allFindings } } satisfies GenerativeUIComponent);
      }
      return NextResponse.json({
        content: `Start and end frames for all ${scenesWithFrames.length} scenes. Review them, then approve to open Workflow with everything seeded.`,
        phase: 'frames_ready',
        generativeUI: gui,
        metadata: {
          model: config?.model || 'local',
          frameModel: config?.frameModel,
          intent: 'frames_step',
          productionStep: 'frames',
        },
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

    // --- LLM-driven planner (primary path) ---
    if (config) {
      // Run vision analysis on any new attachments, caching by image hash.
      const visionAgent = resolveAgent('vision_analyst', agentConfigs, generationModels, promptOverrides);
      let analyses: AttachmentAnalysis[] = existingPlan ? (project?.attachmentAnalyses ?? []) : (project?.attachmentAnalyses ?? []);
      if (refs.length && visionAgent.enabled) {
        try {
          analyses = await analyzeNewAttachments(config, visionAgent, refs, analyses);
        } catch {
          // Vision is best-effort; planner still works without it.
        }
      }

      const plannerAgent = resolveAgent('planner', agentConfigs, generationModels, promptOverrides);
      if (plannerAgent.enabled) {
        try {
          const plannerSystem = `${plannerAgent.systemPrompt}\n\nAttachment summaries:\n${summarizeAttachments(analyses)}`;
          const plannerContext = {
            conversation: convo.slice(-12),
            existingPlan,
            existingScript,
            productionStep: project?.productionStep,
            settings,
            attachmentAnalyses: analyses,
          };
          const result = await callQwenChat(
            { ...config, model: plannerAgent.modelId },
            [
              { role: 'system', content: plannerSystem },
              { role: 'user', content: `Context:\n${JSON.stringify(plannerContext)}\n\nRespond with the JSON object only.` },
            ],
            { jsonMode: true, maxTokens: plannerAgent.maxTokens, temperature: plannerAgent.temperature, model: plannerAgent.modelId },
          );
          const parsed = parsePlannerJson(result.content);
          if (parsed) {
            if (parsed.action === 'chat') {
              return conversationResponse(parsed.content, convo, refs, {
                model: plannerAgent.modelId,
                intent: 'planner_chat',
                attachmentAnalyses: analyses,
              }, config);
            }
            if (parsed.action === 'ask') {
              const normalizedQuestions = normalizePlannerQuestions(parsed.questions ?? []);
              const questionsWithParams: ClarifyingQuestion[] = normalizedQuestions.map((q) => {
                if (!q.parameterKey) return q;
                const resolved = resolveParameterValue(q.parameterKey, existingPlan, settings, project?.storyboard?.scenes);
                if (!resolved) return q;
                return { ...q, currentValue: resolved.value, currentLabel: resolved.label };
              });
              const gui: GenerativeUIComponent[] = [
                { type: 'clarifying_questions', data: { questions: questionsWithParams, planId: parsed.planId } } satisfies GenerativeUIComponent,
              ];
              return NextResponse.json({
                content: parsed.content || `Before I draft the plan, a few quick questions:`,
                phase: 'brainstorm',
                generativeUI: gui,
                metadata: {
                  model: plannerAgent.modelId,
                  intent: 'clarifying_questions',
                  attachmentAnalyses: analyses,
                },
              });
            }
            if (parsed.action === 'plan' && parsed.plan) {
              const normalized = normalizePlannerPlan(parsed.plan, fallbackPlan, planOptions.sceneCount);
              return planReviewResponse(normalized, {
                model: plannerAgent.modelId,
                intent: 'creative_plan',
                attachmentAnalyses: analyses,
              }, config, promptOverrides);
            }
          }
          // If the planner returned unparseable JSON, fall through to the
          // legacy heuristic path below.
        } catch (err) {
          const qErr = err as QwenCallError;
          // Fall through to legacy path with the error recorded.
          if (!presentPlan && !presentScript) {
            return conversationResponse(
              buildFallbackConversation(lastUser, convo, refs),
              convo,
              refs,
              { model: 'fallback', error: qErr.kind, notice: qErr.message, attachmentAnalyses: analyses },
              config,
            );
          }
        }
      }
    }

    // --- Legacy heuristic path (fallback when planner disabled / unconfigured / unparseable) ---
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
          const fallback = buildFallbackVideoScriptFromPlan(concept || lastUser, fallbackPlan, settings);
          return scriptResponse(fallback, { model: config.model, aiPlanningNotes: result.content });
        }

        const plan = buildCreativeWorkflowPlanWithPrompts(concept || lastUser, refs, promptOverrides, planOptions);
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
          const fallback = buildFallbackVideoScriptFromPlan(concept || lastUser, fallbackPlan, settings);
          return scriptResponse(clampScriptToSceneCount(fallback, planOptions.sceneCount), { model: 'fallback', error: qErr.kind, notice: qErr.message });
        }
        const plan = buildCreativeWorkflowPlanWithPrompts(concept || lastUser, refs, promptOverrides, planOptions);
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
      const fallback = buildFallbackVideoScriptFromPlan(concept || lastUser, fallbackPlan, settings);
      return scriptResponse(clampScriptToSceneCount(fallback, planOptions.sceneCount), { model: 'unconfigured', needsConfig: true });
    }

    const plan = buildCreativeWorkflowPlanWithPrompts(concept || lastUser, refs, promptOverrides, planOptions);
    return planReviewResponse(plan, { model: 'unconfigured', needsConfig: true }, null, promptOverrides);
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}
