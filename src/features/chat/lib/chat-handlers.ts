import type { ConsistencyReference, CreativeWorkflowPlan, Project, PromptOverrides, ReusableAssetPlan, Scene, ScriptBeat, ScriptScene, VideoBrief, VideoPlanningMode, VideoScript } from '@/core/types';
import { buildVideoBriefPatch } from './video-output-utils';
import { getDefaultPrompt, resolvePrompt } from '@/core/prompts';

export type ChatIntent = 'planning' | 'brainstorm' | 'create_brief' | 'generate_storyboard' | 'hooks' | 'review';

const GREETING_PATTERN =
  /^(hi|hello|hey|yo|sup|good\s+(morning|afternoon|evening)|what'?s up|howdy|hola|thanks|thank you|ok|okay|cool|nice|great|sure|yes|no|test)[!.?\s]*$/i;

const VIDEO_SIGNAL_PATTERN =
  /\b(video|product|ad|reel|tiktok|instagram|youtube|brand|scene|influencer|ugc|commercial|promo|launch|skincare|makeup|demo|tutorial|review|unbox|sell|showcase|hero|cta|hook|story|audience|customer|buyer|luxury|cosmetic|serum|cream|bottle|device|app|saas|fitness|food|restaurant|hotel|travel|fashion|shoe|watch|jewelry|course|podcast|announcement|creator|spokesperson|model|packshot|b-roll|short-form|short form)\b/i;

export function isGreetingOrSmallTalk(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) return true;
  if (GREETING_PATTERN.test(trimmed)) return true;
  if (trimmed.length < 12 && !VIDEO_SIGNAL_PATTERN.test(trimmed)) return true;
  return false;
}

export function wantsExplicitPlan(message: string): boolean {
  return /\b(plan assets|build workflow|storyboard|scene breakdown|production plan|draft.*plan|create.*plan|make.*plan|plan the reusable|plan the video|build the plan|start planning)\b/i.test(
    message,
  );
}

export function hasVideoConceptSignal(
  messages: { role: string; content: string }[],
  referenceImageUrls: string[] = [],
): boolean {
  if (referenceImageUrls.length > 0) return true;

  const userText = messages
    .filter((m) => m.role === 'user')
    .map((m) => m.content.trim())
    .filter((content) => content && !isGreetingOrSmallTalk(content))
    .join(' ')
    .trim();

  if (userText.length < 15) return false;
  if (VIDEO_SIGNAL_PATTERN.test(userText)) return true;
  return userText.length >= 40;
}

export function shouldPresentPlan(
  lastUser: string,
  messages: { role: string; content: string }[],
  referenceImageUrls: string[] = [],
): boolean {
  const explicit = wantsExplicitPlan(lastUser);
  const hasConcept = hasVideoConceptSignal(messages, referenceImageUrls);

  if (isGreetingOrSmallTalk(lastUser) && !explicit) return false;
  if (explicit) return hasConcept;
  if (!hasConcept) return false;
  if (/\b(ready|go ahead|sounds good|let'?s do it|build it|make the plan|draft it|start planning|looks good)\b/i.test(lastUser)) {
    return true;
  }
  return !isGreetingOrSmallTalk(lastUser) && lastUser.trim().length >= 60;
}

export function getConversationSuggestions(
  messages: { role: string; content: string }[],
  referenceImageUrls: string[] = [],
): string[] {
  const userMessages = messages.filter((m) => m.role === 'user');
  const lastUser = userMessages[userMessages.length - 1]?.content ?? '';

  if (userMessages.length === 0) {
    return [
      'Product ad for my skincare line — premium, no people',
      'UGC-style creator tutorial with a locked-on-camera host',
      '15s launch teaser for a new app',
      'I have reference images to share',
    ];
  }

  if (isGreetingOrSmallTalk(lastUser)) {
    return [
      'I want a short product video for social ads',
      'Creator-led reel with the same person in every scene',
      'Brand story video with a clear hook and CTA',
      'Help me figure out the right format first',
    ];
  }

  if (referenceImageUrls.length > 0 && !hasVideoConceptSignal(messages, referenceImageUrls)) {
    return [
      'Product hero ad using the attached references',
      'Creator review video featuring this product',
      'Multiple scenes in the same environment',
      'Just polish the visual direction for now',
    ];
  }

  if (!hasVideoConceptSignal(messages, referenceImageUrls)) {
    return [
      'Target buyers on Instagram and TikTok',
      'Premium cinematic look, slow and polished',
      'Fast-paced UGC energy with a strong hook',
      'About 20 seconds, vertical 9:16',
    ];
  }

  if (wantsExplicitPlan(lastUser) || shouldPresentPlan(lastUser, messages, referenceImageUrls)) {
    return [
      'Draft the full production plan now',
      'Add one more scene before planning',
      'Keep it product-only with no people',
      'Make the hook more dramatic',
    ];
  }

  return [
    'That direction works — draft the production plan',
    'Change the tone to feel more premium',
    'Focus on a stronger opening hook',
    'Add more detail about the target viewer',
  ];
}

export function buildFallbackConversation(
  lastUser: string,
  messages: { role: string; content: string }[],
  referenceImageUrls: string[] = [],
): string {
  if (isGreetingOrSmallTalk(lastUser)) {
    return "Hey — I'm here to help you plan a production-level video before anything gets generated.\n\nTell me what you're making (product ad, creator reel, launch teaser, etc.), who it's for, and any references you have. I'll ask a couple of focused questions, then draft a full per-second script we can lock before any images.";
  }

  if (wantsExplicitPlan(lastUser) && !hasVideoConceptSignal(messages, referenceImageUrls)) {
    return "Happy to draft the script — I just need a bit more context first.\n\nWhat's the video about, who's it for, and is it product-led, creator-led, or a mix? Attach reference images if you have them.";
  }

  if (!hasVideoConceptSignal(messages, referenceImageUrls)) {
    return "Got it. A few quick questions will help me shape a solid script:\n\n1. **Goal** — sell, educate, launch, or build brand?\n2. **Subject** — product, person, place, or story?\n3. **Vibe** — premium commercial, UGC creator, cinematic, playful?\n\nShare whatever you know; we can fill in the rest together.";
  }

  return "This is taking shape. Tell me if you'd like to refine the angle, or say **draft the script** when you're ready and I'll write a per-second shooting script for review.";
}

// ============= Staged production flow =============

export function detectScriptApproval(message: string): boolean {
  return /approve\s+(the\s+)?script|script\s+(looks\s+good|is\s+good|is\s+locked|looks\s+great)|lock\s+the\s+script|move\s+(on\s+)?to\s+(the\s+)?(influencer|character|background)|next\s+step/i.test(
    message,
  );
}

export function isSkipToWorkflow(message: string): boolean {
  return /\bskip\s+to\s+workflow\b|\bgo\s+to\s+workflow\b|\bopen\s+(the\s+)?workflow\b|\bskip\s+planning\b/i.test(message);
}

export function shouldPresentScript(
  lastUser: string,
  messages: { role: string; content: string }[],
  referenceImageUrls: string[] = [],
): boolean {
  if (isGreetingOrSmallTalk(lastUser)) return false;
  if (!hasVideoConceptSignal(messages, referenceImageUrls)) return false;
  if (/draft\s+(the\s+)?script|write\s+(the\s+)?script|build\s+(the\s+)?script|per-second\s+script|shooting\s+script/i.test(lastUser)) {
    return true;
  }
  const substantiveUserTurns = messages
    .filter((m) => m.role === 'user')
    .filter((m) => !isGreetingOrSmallTalk(m.content)).length;
  if (substantiveUserTurns >= 3 && lastUser.trim().length >= 20) return true;
  return false;
}

const SCRIPT_APPROVAL_WORDS =
  /approve|approved|looks good|lock\s+the\s+script|next\s+step|move\s+(on\s+)?to\s+(the\s+)?(influencer|character|background)/i;

export function wantsInfluencerStep(message: string): boolean {
  return /\b(influencer|character|host|creator|persona)\b/i.test(message) && /generat|create|build|next|approv/i.test(message);
}

export function wantsBackgroundStep(message: string): boolean {
  return /\b(background|environment|set|location|scene\s+background)\b/i.test(message) && /generat|create|build|next|approv/i.test(message);
}

export function wantsFramesStep(message: string): boolean {
  return /\b(frames?|start\s+frame|end\s+frame)\b/i.test(message) && /generat|create|build|next|approv/i.test(message);
}

export function detectScriptApprovalPhrase(message: string): boolean {
  return SCRIPT_APPROVAL_WORDS.test(message);
}

function fallbackScriptScene(
  index: number,
  sceneInput: { title: string; sceneGoal?: string; prompt: string; actionDescription?: string; duration: number; startTime: number; cameraMovement: Scene['cameraMovement']; narration?: string; mood: string; visualStyle?: string; lighting?: string },
): ScriptScene {
  const duration = Math.max(1, Math.round(sceneInput.duration));
  const action = sceneInput.actionDescription || sceneInput.sceneGoal || sceneInput.prompt;
  const beats: ScriptBeat[] = Array.from({ length: duration }, (_, second) => ({
    second,
    action: `${action}${second > 0 ? ' (continued)' : ''}`,
    dialogue: sceneInput.narration && second === 0 ? sceneInput.narration : undefined,
    behavior: second === 0 ? 'Settles into frame, easy eye contact with camera' : 'Holds presence, subtle natural movement',
    camera: `${sceneInput.cameraMovement.replace(/_/g, ' ')}, second ${second + 1}`,
  }));
  return {
    id: `scene-${index}`,
    order: index,
    title: sceneInput.title,
    durationSeconds: duration,
    goal: sceneInput.sceneGoal || sceneInput.title,
    narration: sceneInput.narration || '',
    beats,
    cameraBehavior: sceneInput.cameraMovement.replace(/_/g, ' '),
    mood: sceneInput.mood,
    visualNotes: [sceneInput.visualStyle, sceneInput.lighting].filter(Boolean).join('. ') || 'Natural motivated lighting, real-world texture, no AI sheen.',
  };
}

export function buildFallbackVideoScript(
  concept: string,
  scenes: Scene[],
  durationSeconds: number,
): VideoScript {
  const sceneCount = scenes.length;
  const scriptScenes = scenes.map((sc, idx) =>
    fallbackScriptScene(idx + 1, {
      title: sc.title,
      sceneGoal: sc.sceneGoal,
      prompt: sc.prompt,
      actionDescription: sc.actionDescription,
      duration: sc.duration,
      startTime: sc.startTime,
      cameraMovement: sc.cameraMovement,
      narration: sc.narration,
      mood: sc.mood,
      visualStyle: sc.visualStyle,
      lighting: sc.lighting,
    }),
  );
  return {
    id: `script-${Date.now()}`,
    logline: concept || 'A short-form video that holds a single, consistent identity across every scene.',
    durationSeconds,
    sceneCount,
    narrationStyle: 'Natural, first-person creator voice with confident pauses.',
    scenes: scriptScenes,
    approvalStatus: 'draft',
  };
}

export interface ScriptBuildInput {
  concept: string;
  sceneCount: number;
  durationSeconds: number;
  aspectRatio: string;
  videoMode: VideoPlanningMode;
}

export function buildFallbackVideoScriptFromPlan(
  concept: string,
  plan: CreativeWorkflowPlan,
  settings: { aspectRatio?: string; duration?: number },
): VideoScript {
  const duration = settings.duration || plan.suggestedDuration || plan.scenes.reduce((sum, sc) => sum + sc.duration, 0);
  return buildFallbackVideoScript(concept || plan.concept, plan.scenes, duration);
}

export function getScriptFromJson(raw: string): VideoScript | null {
  try {
    const trimmed = raw.trim().replace(/^```json\s*|\s```$/g, '');
    const parsed = JSON.parse(trimmed);
    if (!parsed || !Array.isArray(parsed.scenes)) return null;
    const scenes: ScriptScene[] = parsed.scenes.map((sc: any, idx: number) => ({
      id: sc.id || `scene-${idx + 1}`,
      order: sc.order ?? idx + 1,
      title: String(sc.title ?? `Scene ${idx + 1}`),
      durationSeconds: Number(sc.durationSeconds) || 1,
      goal: String(sc.goal ?? ''),
      narration: String(sc.narration ?? ''),
      beats: Array.isArray(sc.beats)
        ? sc.beats.map((b: any, i: number) => ({
            second: Number(b.second ?? i),
            action: String(b.action ?? ''),
            dialogue: b.dialogue ? String(b.dialogue) : undefined,
            behavior: b.behavior ? String(b.behavior) : undefined,
            camera: b.camera ? String(b.camera) : undefined,
          }))
        : [],
      cameraBehavior: String(sc.cameraBehavior ?? ''),
      mood: String(sc.mood ?? ''),
      visualNotes: String(sc.visualNotes ?? ''),
    }));
    return {
      id: `script-${Date.now()}`,
      logline: String(parsed.logline ?? ''),
      durationSeconds: Number(parsed.durationSeconds) || scenes.reduce((sum, sc) => sum + sc.durationSeconds, 0),
      sceneCount: scenes.length,
      narrationStyle: String(parsed.narrationStyle ?? ''),
      scenes,
      approvalStatus: 'draft',
    };
  } catch {
    return null;
  }
}

export function detectChatIntent(message: string): ChatIntent | null {
  const m = message.toLowerCase();
  if (m.includes('create brief') || m.includes('create a brief') || m.includes('structured video brief')) {
    return 'create_brief';
  }
  if (m.includes('storyboard') || m.includes('scene breakdown')) {
    return 'generate_storyboard';
  }
  if (m.includes('hook')) return 'hooks';
  if (m.includes('review') || m.includes('director')) return 'review';
  return null;
}

export function detectPlanApproval(message: string): boolean {
  return /approve|approved|looks good|generate assets|start assets|proceed|continue with this plan|use this plan/i.test(message);
}

export function extractConceptFromMessages(messages: { role: string; content: string }[]): string {
  return messages
    .filter((m) => m.role === 'user')
    .map((m) => m.content)
    .filter((c) => !isGreetingOrSmallTalk(c))
    .filter((c) => !/^\d+:\d+|aspect ratio|fps|resolution|\d+ seconds?$/i.test(c))
    .slice(-5)
    .join(' ')
    .trim();
}

export function buildBriefFromProject(
  project: Project,
  conceptHint?: string
): Partial<VideoBrief> {
  const settings = project.settings;
  const existing = project.videoBrief;
  const base = buildVideoBriefPatch(project, {});

  return {
    ...base,
    title: existing?.title || project.name || 'Untitled Video',
    description:
      conceptHint ||
      existing?.description ||
      project.description ||
      'A short-form video based on our planning session.',
    videoType: existing?.videoType || 'reel',
    targetPlatform: settings.targetPlatform,
    aspectRatio: settings.aspectRatio,
    duration: base.duration,
    style: existing?.style || 'cinematic',
    mood: existing?.mood || '',
    numberOfScenes: existing?.numberOfScenes || Math.max(3, Math.min(6, Math.round(base.duration / 7))),
    sceneDuration: existing?.sceneDuration || Math.round(base.duration / 4),
    fps: settings.fps,
    resolution: settings.resolution,
    outputFormat: settings.outputFormat,
    captions: existing?.captions ?? true,
    audience: existing?.audience,
  };
}

export function buildStoryboardScenes(
  brief: Partial<VideoBrief>,
  concept: string,
  referenceImageUrls: string[] = []
): Partial<Scene>[] {
  const count = brief.numberOfScenes || 4;
  const sceneDur = brief.sceneDuration || Math.floor((brief.duration || 30) / count);
  const style = brief.style || 'cinematic';
  const topic = concept || brief.description || 'the product';

  const templates = [
    {
      title: 'Hook — Grab Attention',
      prompt: `Dramatic opening shot for ${topic}, ${style} style, high contrast lighting, immediate visual hook, ${brief.aspectRatio} framing`,
      mood: 'Bold, attention-grabbing',
      cameraMovement: 'slow_push_in' as const,
    },
    {
      title: 'Problem / Context',
      prompt: `Relatable scene establishing the challenge around ${topic}, ${style} aesthetic, natural lighting, authentic feel`,
      mood: 'Relatable, empathetic',
      cameraMovement: 'handheld' as const,
    },
    {
      title: 'Solution / Showcase',
      prompt: `Hero showcase of ${topic}, premium ${style} product shot, dynamic angles, crisp detail, professional commercial quality`,
      mood: 'Confident, impressive',
      cameraMovement: 'orbit' as const,
    },
    {
      title: 'Call to Action',
      prompt: `Closing scene for ${topic}, warm inviting ${style} finish, clear CTA moment, aspirational but achievable`,
      mood: 'Empowering, conclusive',
      cameraMovement: 'dolly_in' as const,
    },
  ];

  let t = 0;
  return Array.from({ length: count }, (_, i) => {
    const tpl = templates[i] || templates[templates.length - 1];
    const start = t;
    const end = t + sceneDur;
    t = end;
    return {
      id: `scene-${i + 1}`,
      order: i,
      title: tpl.title,
      prompt: tpl.prompt,
      startTime: start,
      endTime: end,
      duration: sceneDur,
      cameraMovement: tpl.cameraMovement,
      mood: tpl.mood,
      characters: [],
      props: [],
      transition: i === 0 ? 'fade' : 'cut',
      textOverlays: [],
      referenceImageUrls: referenceImageUrls.slice(0, 3),
      stylePreset: style,
      status: 'idle' as const,
      versions: [],
    };
  });
}

function inferVideoMode(concept: string, referenceImageUrls: string[] = []): VideoPlanningMode {
  const lower = concept.toLowerCase();
  const explicitHuman = /influencer|creator|person|people|human|woman|female|man|male|model|actor|face|host|spokesperson|ugc/.test(lower);
  const productSignal = /product|packaging|bottle|jar|device|shoe|watch|cosmetic|lipstick|foundation|serum|cream|brand|commercial|hero shot|product shot/.test(lower);
  const influencerSignal = explicitHuman && /influencer|creator|ugc|host|spokesperson|tutorial|try on|try-on|makeup on|putting makeup|applying|reviewer/.test(lower);
  if (productSignal && influencerSignal) return 'hybrid';
  if (influencerSignal) return 'influencer';
  if (productSignal || referenceImageUrls.length > 0) return 'product';
  return explicitHuman ? 'influencer' : 'general';
}

function inferAssetNeeds(concept: string, mode: VideoPlanningMode, referenceImageUrls: string[], promptOverrides?: PromptOverrides): ReusableAssetPlan[] {
  const lower = concept.toLowerCase();
  const assets: ReusableAssetPlan[] = [];
  const needsInfluencer = mode === 'influencer' || mode === 'hybrid';
  const needsProduct = mode === 'product' || mode === 'hybrid' || /product|make\s*up|makeup|cosmetic|lipstick|foundation|serum|cream|brand/.test(lower) || referenceImageUrls.length > 0;

  if (needsInfluencer) {
    assets.push({
      id: 'asset-influencer-character',
      type: 'influencer',
      name: 'Influencer Identity',
      description: 'Critical reusable influencer identity for every creator scene.',
      generationStatus: 'pending',
      consistencyNotes: 'Keep the same face, facial proportions, hairstyle, hair color, outfit, body style, skin tone, and overall identity across all related scenes.',
      styleNotes: 'Clean creator lighting, natural skin texture, stable wardrobe, premium social-video framing.',
      personality: 'Confident, warm, tutorial-friendly, credible, and consistent.',
      referenceImagePrompt: resolvePrompt('asset.influencer.reference', { concept }, promptOverrides),
      negativePrompt: resolvePrompt('negative.influencer', {}, promptOverrides),
      usageNotes: 'Generate and lock this identity before frames. Reuse it in every start frame, end frame, and motion prompt involving the influencer.',
      saveTargets: ['brand_identity', 'project_assets'],
      criticality: 'critical',
      reusePolicy: 'always',
    });
  }

  if (needsProduct) {
    assets.push({
      id: 'asset-product-reference',
      type: 'product',
      name: 'Product Reference',
      description: 'Critical reusable product reference for packaging, material, scale, label placement, and brand continuity.',
      generationStatus: 'pending',
      consistencyNotes: 'Keep product shape, dimensions, material, color, label placement, cap or closure details, and product scale consistent across every product scene.',
      styleNotes: 'Premium product photography with clean readable silhouette; avoid inventing real brand logos.',
      referenceImagePrompt: resolvePrompt('asset.product.reference', {
        concept,
        referencePolicy: referenceImageUrls.length
          ? "Use the user's attached product image(s) as the source of truth."
          : 'Create a clean reusable product source of truth.',
      }, promptOverrides),
      negativePrompt: resolvePrompt('negative.product', {}, promptOverrides),
      usageNotes: 'Use as the main visual reference for product, feature, environment, and CTA scenes.',
      saveTargets: ['project_assets', 'brand_identity'],
      criticality: 'critical',
      reusePolicy: 'always',
    });
  }

  if (mode === 'product' || mode === 'hybrid') {
    assets.push({
      id: 'asset-product-environment',
      type: 'environment',
      name: 'Product Environment',
      description: 'Reusable set, lighting, props, surface, and composition language for product scenes.',
      generationStatus: 'pending',
      consistencyNotes: 'Keep surface material, prop family, lighting direction, color palette, background, and premium product scale consistent across related scenes.',
      styleNotes: 'Commercial product set design with controlled reflections, disciplined negative space, and brand-aligned props.',
      referenceImagePrompt: resolvePrompt('asset.environment.reference', { concept }, promptOverrides),
      negativePrompt: 'people, hands, faces, random logos, cluttered set, inconsistent lighting, distorted product scale',
      usageNotes: 'Reuse for product-only scenes unless the user asks for a new location.',
      saveTargets: ['brand_identity', 'project_assets'],
      criticality: 'critical',
      reusePolicy: 'when_relevant',
    });
  }

  if (mode === 'influencer' || mode === 'hybrid') {
    assets.push({
      id: 'asset-influencer-background',
      type: 'background',
      name: 'Influencer Background',
      description: 'Reusable location, lighting, and environment reference for related influencer scenes.',
      generationStatus: 'pending',
      consistencyNotes: 'Keep room geometry, vanity or set dressing, lighting direction, color palette, and camera height consistent when scenes are visually related.',
      styleNotes: 'Natural creator space with clean production polish and enough depth for scene variation.',
      referenceImagePrompt: resolvePrompt('asset.background.reference', { concept }, promptOverrides),
      negativePrompt: 'extra people, inconsistent room layout, random logos, messy clutter, unreadable text',
      usageNotes: 'Reuse for related scenes. Ask before switching to a new location.',
      saveTargets: ['brand_identity', 'project_assets'],
      criticality: 'supporting',
      reusePolicy: 'when_relevant',
    });
  }

  assets.push({
    id: 'asset-visual-style',
    type: 'style_reference',
    name: 'Visual Direction',
    description: 'Reusable style, lighting, palette, lens, and composition guide for the whole project.',
    generationStatus: 'pending',
    consistencyNotes: mode === 'product'
      ? 'Protect product color, material, package proportions, brand palette, lighting direction, and composition grammar.'
      : 'Protect identity, outfit, background continuity, lighting direction, color grade, and camera language.',
    styleNotes: 'Compact production reference for consistency across images, frames, and video generation.',
    referenceImagePrompt: resolvePrompt('style.visual.direction', {
      concept,
      modeLead: mode === 'product' ? 'No people. Product-first' : 'Creator-led',
    }, promptOverrides),
    negativePrompt: resolvePrompt('negative.style', {}, promptOverrides),
    usageNotes: 'Attach as a consistency reference to every scene prompt and future regeneration.',
    saveTargets: ['brand_identity', 'project_assets'],
    criticality: 'critical',
    reusePolicy: 'always',
  });

  return assets;
}

function scene(
  index: number,
  title: string,
  goal: string,
  concept: string,
  duration: number,
  startTime: number,
  cameraMovement: Scene['cameraMovement'],
  action: string,
  assetsUsed: string[],
  mode: VideoPlanningMode,
  promptOverrides?: PromptOverrides,
): Scene {
  const endTime = startTime + duration;
  const productOnly = mode === 'product';
  const startFramePrompt = productOnly
    ? resolvePrompt('scene.product.start', { title, concept, goal }, promptOverrides)
    : resolvePrompt('scene.influencer.start', { title, concept, goal }, promptOverrides);
  const endFramePrompt = productOnly
    ? resolvePrompt('scene.product.end', { title, concept, goal }, promptOverrides)
    : resolvePrompt('scene.influencer.end', { title, concept, goal }, promptOverrides);

  return {
    id: `scene-${index}`,
    order: index - 1,
    title,
    sceneGoal: goal,
    prompt: `${goal}. ${action}. Maintain continuity with approved reusable consistency references.`,
    startTime,
    endTime,
    duration,
    cameraMovement,
    mood: productOnly ? 'Premium, precise, product-led' : 'Polished, intimate, creator-led',
    characters: productOnly ? [] : assetsUsed.filter((id) => id.includes('influencer')),
    props: assetsUsed.filter((id) => id.includes('product') || id.includes('environment')),
    productPlacement: assetsUsed.some((id) => id.includes('product')) ? 'Product remains visually consistent with stable scale, material, packaging, and placement.' : undefined,
    transition: index === 1 ? 'fade' : 'cut',
    textOverlays: [],
    referenceImageUrls: [],
    stylePreset: productOnly ? 'realistic_product' : 'ugc_influencer',
    status: 'idle',
    versions: [],
    aspectRatio: '9:16',
    sceneDescription: goal,
    actionDescription: action,
    visualStyle: productOnly ? 'Realistic product commercial with controlled studio polish' : 'Realistic creator video with premium commercial polish',
    lighting: productOnly ? 'Controlled directional product light with soft reflections and consistent shadow direction' : 'Soft frontal creator light with gentle highlights and natural skin texture',
    details: productOnly
      ? 'Consistent product geometry, packaging, brand palette, surface, props, camera height, and background'
      : 'Consistent face, hairstyle, outfit, body style, background, lighting, product packaging, and room continuity',
    avoid: productOnly
      ? 'people, faces, hands, human models, warped packaging, random logos, unreadable labels, inconsistent product scale'
      : 'warped hands, inconsistent face, hairstyle changes, outfit changes, random logos, unreadable labels, flickering background continuity',
    startFramePrompt,
    endFramePrompt,
    frameGenerationStatus: 'pending',
    motionPrompt: productOnly
      ? resolvePrompt('video.product.motion', { action: action.toLowerCase() }, promptOverrides)
      : resolvePrompt('video.influencer.motion', { action: action.toLowerCase() }, promptOverrides),
    negativePrompt: productOnly
      ? resolvePrompt('negative.product.scene', {}, promptOverrides)
      : resolvePrompt('negative.influencer.scene', {}, promptOverrides),
    narration: productOnly ? undefined : index === 1 ? 'Let me show you how this comes together.' : index === 4 ? 'Save this for later.' : undefined,
    assetsUsed,
  };
}

function buildProductScenes(concept: string, assetIds: string[], referenceImageUrls: string[], promptOverrides?: PromptOverrides): Scene[] {
  const coreAssets = assetIds.filter((id) => !id.includes('influencer'));
  return [
    scene(1, 'Product Hero Establish', 'Open with a precise hero shot that makes the product instantly recognizable.', concept, 4, 0, 'slow_push_in', 'Camera pushes toward the product on the brand-aligned surface with props framing it cleanly.', coreAssets, 'product', promptOverrides),
    scene(2, 'Feature / Texture Detail', 'Show the product material, texture, applicator, or key feature without adding human subjects.', concept, 6, 4, 'close_up', 'Macro movement reveals the product detail, finish, packaging edge, or functional benefit.', coreAssets, 'product', promptOverrides),
    scene(3, 'Environment / Use Case', 'Place the same product in a relevant environment while preserving product and brand continuity.', concept, 6, 10, 'orbit', 'Camera orbits gently around the product with related props and consistent lighting.', coreAssets, 'product', promptOverrides),
    scene(4, 'Final Brand CTA', 'End with a clean product packshot and final branded composition.', concept, 4, 16, 'static', 'Product holds center frame with controlled negative space for a final CTA or tagline.', coreAssets, 'product', promptOverrides),
  ].map((sc) => ({ ...sc, referenceImageUrls }));
}

function buildInfluencerScenes(concept: string, assetIds: string[], referenceImageUrls: string[], mode: VideoPlanningMode, promptOverrides?: PromptOverrides): Scene[] {
  const productIds = assetIds.filter((id) => id.includes('product'));
  const influencerIds = assetIds.filter((id) => id.includes('influencer') || id.includes('background') || id.includes('visual-style'));
  const allAssets = [...influencerIds, ...productIds];

  return [
    scene(1, 'Hook / Identity Establish', 'Open by locking the influencer identity and the starting context.', concept, 4, 0, 'slow_push_in', 'The influencer looks into camera in the established environment and sets up the story.', influencerIds, mode, promptOverrides),
    scene(2, 'Action / Proof Beat', 'Show the key creator action while preserving face, hair, outfit, body style, and background continuity.', concept, 7, 4, 'close_up', 'The influencer performs the main action in a satisfying close-up with smooth movement.', allAssets, mode, promptOverrides),
    scene(3, 'Reveal / Payoff', 'Deliver the visual payoff with the same influencer identity and related scene continuity.', concept, 5, 11, 'dolly_in', 'The influencer turns toward the light or camera to reveal the completed moment.', influencerIds, mode, promptOverrides),
    scene(4, 'CTA / Final Moment', 'End with a clean creator or product-supported CTA that still preserves the locked identity.', concept, 4, 16, 'static', 'The influencer holds the final pose or product moment with stable composition.', allAssets, mode, promptOverrides),
  ].map((sc) => ({ ...sc, referenceImageUrls }));
}

function buildConsistencyReferences(planId: string, mode: VideoPlanningMode, assets: ReusableAssetPlan[], sceneIds: string[]): ConsistencyReference[] {
  return assets.map((asset) => ({
    id: `ref-${asset.id}`,
    type: asset.type,
    name: asset.name,
    description: asset.description,
    imageUrl: asset.generatedImageUrl,
    prompt: asset.referenceImagePrompt,
    negativePrompt: asset.negativePrompt,
    consistencyNotes: asset.consistencyNotes,
    criticalFor: asset.criticality === 'critical' ? [mode] : mode === 'hybrid' ? ['hybrid'] : [mode],
    appliesToSceneIds: sceneIds,
    reusePolicy: asset.reusePolicy ?? 'when_relevant',
    savedToLibrary: false,
    createdAt: new Date(Number(planId.replace('plan-', '')) || Date.now()).toISOString(),
  }));
}

export function buildCreativeWorkflowPlan(concept: string, referenceImageUrls: string[] = []): CreativeWorkflowPlan {
  return buildCreativeWorkflowPlanWithPrompts(concept, referenceImageUrls);
}

export function buildCreativeWorkflowPlanWithPrompts(
  concept: string,
  referenceImageUrls: string[] = [],
  promptOverrides?: PromptOverrides,
): CreativeWorkflowPlan {
  const safeConcept = concept || 'a short video concept';
  const videoMode = inferVideoMode(safeConcept, referenceImageUrls);
  const assets = inferAssetNeeds(safeConcept, videoMode, referenceImageUrls, promptOverrides);
  const assetIds = assets.map((asset) => asset.id);
  const scenes = videoMode === 'product'
    ? buildProductScenes(safeConcept, assetIds, referenceImageUrls, promptOverrides)
    : buildInfluencerScenes(safeConcept, assetIds, referenceImageUrls, videoMode, promptOverrides);
  const planId = `plan-${Date.now()}`;
  const consistencyReferences = buildConsistencyReferences(planId, videoMode, assets, scenes.map((sc) => sc.id));
  const isProduct = videoMode === 'product';

  return {
    id: planId,
    concept: safeConcept,
    videoMode,
    summary: isProduct
      ? `A product-first video built around ${safeConcept}. The workflow locks product, environment, brand style, and composition references before generating scene frames.`
      : `An influencer-led video built around ${safeConcept}. The workflow locks the influencer identity, outfit, background, style, and any product references before scene generation.`,
    targetViewer: isProduct
      ? 'Prospective buyers who need clear product proof, premium presentation, and visual trust.'
      : 'Social-commerce viewers who respond to credible creator presence, continuity, and a clear payoff.',
    toneAndStyle: isProduct
      ? 'Premium product commercial, controlled lighting, clean props, consistent brand composition.'
      : 'Warm creator-led video, stable identity continuity, realistic lighting, polished short-form energy.',
    storyStructure: isProduct
      ? ['Product reference first', 'Hero establish', 'Feature proof', 'Environment/use case', 'Final product CTA']
      : ['Influencer identity first', 'Context hook', 'Action proof', 'Reveal/payoff', 'Creator/product CTA'],
    reusableAssets: assets,
    consistencyReferences,
    scenes,
    consistencyRequirements: [
      isProduct
        ? 'Do not generate human elements unless the user explicitly asks for them.'
        : 'Treat influencer identity consistency as critical: same face, hairstyle, outfit, body style, and overall identity.',
      isProduct
        ? 'Treat product and brand consistency as critical: preserve packaging, material, color, scale, props, lighting, environment, and composition.'
        : 'Reuse background, lighting, environment, and visual direction when scenes are in the same place or visually related.',
      'Store generated assets, frames, backgrounds, style references, and brand identity as reusable consistency references for this project.',
      'Automatically reuse critical references during relevant future generations; ask before replacing critical identity or product references.',
    ],
    renderSettingsDeferred: true,
    suggestedAspectRatio: '9:16',
    suggestedDuration: scenes[scenes.length - 1]?.endTime ?? 20,
    outputFormat: 'mp4',
    approvalStatus: 'draft',
  };
}

export const BRAINSTORM_SYSTEM_PROMPT = getDefaultPrompt('planning.chat.system');
