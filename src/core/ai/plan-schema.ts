import type {
  ClarifyingParameterKey,
  ClarifyingQuestion,
  CreativeWorkflowPlan,
  PlanProgress,
  ReusableAssetPlan,
  ReusableAssetType,
  Scene,
  VideoPlanningMode,
} from '@/core/types';

/**
 * Shape returned by the planner agent when action === 'plan'. Kept loose so we
 * can tolerate partial fields and normalize them into the existing
 * CreativeWorkflowPlan type below.
 */
export interface PlannerPlanScene {
  id?: string;
  title?: string;
  sceneGoal?: string;
  duration?: number;
  cameraMovement?: Scene['cameraMovement'];
  mood?: string;
  prompt?: string;
  actionDescription?: string;
  visualStyle?: string;
  lighting?: string;
  details?: string;
  avoid?: string;
  negativePrompt?: string;
  startFramePrompt?: string;
  endFramePrompt?: string;
  motionPrompt?: string;
  assetsUsed?: string[];
  needsStartFrame?: boolean;
  needsEndFrame?: boolean;
  frameReason?: string;
}

export interface PlannerPlanAsset {
  id?: string;
  type?: ReusableAssetType;
  name?: string;
  description?: string;
  consistencyNotes?: string;
  styleNotes?: string;
  personality?: string;
  referenceImagePrompt?: string;
  negativePrompt?: string;
  usageNotes?: string;
  saveTargets?: ReusableAssetPlan['saveTargets'];
  criticality?: ReusableAssetPlan['criticality'];
  reusePolicy?: ReusableAssetPlan['reusePolicy'];
}

export interface PlannerPlan {
  concept?: string;
  videoMode?: VideoPlanningMode;
  summary?: string;
  targetViewer?: string;
  toneAndStyle?: string;
  storyStructure?: string[];
  consistencyRequirements?: string[];
  suggestedAspectRatio?: CreativeWorkflowPlan['suggestedAspectRatio'];
  suggestedDuration?: number;
  scenes?: PlannerPlanScene[];
  reusableAssets?: PlannerPlanAsset[];
}

export interface PlannerQuestion {
  id?: string;
  text: string;
  kind?: string;
  options?: string[];
  placeholder?: string;
  parameterKey?: ClarifyingParameterKey;
}

export type PlannerResponse =
  | { action: 'chat'; content: string }
  | { action: 'ask'; content?: string; questions: (string | PlannerQuestion)[]; planId?: string }
  | { action: 'plan'; content?: string; plan: PlannerPlan };

const VALID_ACTIONS = new Set(['chat', 'ask', 'plan']);

/** Strip ```json fences and parse. Returns null if not valid JSON. */
export function parsePlannerJson(raw: string): PlannerResponse | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/^```(?:json)?\s*|\s```$/g, '');
  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.action || !VALID_ACTIONS.has(parsed.action)) return null;
    return parsed as PlannerResponse;
  } catch {
    return null;
  }
}

const VALID_PARAM_KEYS: ReadonlySet<ClarifyingParameterKey> = new Set([
  'sceneCount',
  'duration',
  'aspectRatio',
  'videoMode',
  'startEndFrames',
]);

/**
 * Coerce the planner's `questions` array (which may be plain strings or
 * PlannerQuestion objects, and may be missing options) into the UI-facing
 * ClarifyingQuestion shape. Plain strings get 3 derived yes/no-ish options.
 */
export function normalizePlannerQuestions(raw: (string | PlannerQuestion)[]): ClarifyingQuestion[] {
  return raw.map((item, index) => {
    if (typeof item === 'string') {
      return {
        id: `q-${index}`,
        text: item,
        options: deriveFallbackOptions(item),
        placeholder: 'Type your answer…',
      };
    }
    const options = Array.isArray(item.options) ? item.options.map((o) => String(o).trim()).filter(Boolean) : [];
    const parameterKey = item.parameterKey && VALID_PARAM_KEYS.has(item.parameterKey) ? item.parameterKey : undefined;
    return {
      id: item.id || `q-${index}`,
      text: item.text || 'Could you clarify this?',
      kind: item.kind,
      options: options.length > 0 ? options.slice(0, 4) : deriveFallbackOptions(item.text),
      placeholder: item.placeholder || 'Type your answer…',
      parameterKey,
    };
  });
}

function deriveFallbackOptions(text: string): string[] {
  const lower = text.toLowerCase();
  if (lower.includes('how many') || lower.includes('scene count') || lower.includes('number of scenes')) {
    return ['3 scenes', '5 scenes', '7 scenes'];
  }
  if (lower.includes('start') && lower.includes('end') && lower.includes('frame')) {
    return ['Yes, start and end frames for each scene', 'Only a start frame per scene', 'No, generate video directly'];
  }
  if (lower.includes('aspect ratio') || lower.includes('orientation')) {
    return ['9:16 (vertical)', '1:1 (square)', '16:9 (horizontal)'];
  }
  if (lower.includes('duration') || lower.includes('how long') || lower.includes('length')) {
    return ['15 seconds', '30 seconds', '60 seconds'];
  }
  return ['Yes', 'No', "I'm not sure yet"];
}

/** Runtime-safe normalizer for persisted chat GUI payloads (strings, partial objects, etc.). */
export function coerceClarifyingQuestions(raw: unknown): ClarifyingQuestion[] {
  if (!Array.isArray(raw)) return [];
  const plannerInput: (string | PlannerQuestion)[] = raw.map((item, index) => {
    if (typeof item === 'string') return item;
    if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>;
      const text = typeof o.text === 'string' ? o.text : typeof o.question === 'string' ? o.question : `Question ${index + 1}`;
      return {
        id: typeof o.id === 'string' ? o.id : undefined,
        text,
        kind: typeof o.kind === 'string' ? o.kind : undefined,
        options: Array.isArray(o.options) ? o.options.map((opt) => String(opt)) : undefined,
        placeholder: typeof o.placeholder === 'string' ? o.placeholder : undefined,
        parameterKey: typeof o.parameterKey === 'string' ? o.parameterKey as ClarifyingParameterKey : undefined,
      };
    }
    return String(item ?? `Question ${index + 1}`);
  });

  return normalizePlannerQuestions(plannerInput).map((q, index) => {
    const item = raw[index];
    if (!item || typeof item !== 'object') return q;
    const o = item as Record<string, unknown>;
    return {
      ...q,
      currentValue: typeof o.currentValue === 'string' ? o.currentValue : q.currentValue,
      currentLabel: typeof o.currentLabel === 'string' ? o.currentLabel : q.currentLabel,
    };
  });
}

function coerceScene(scene: PlannerPlanScene, index: number, fallbackDuration: number): Scene {
  const duration = Math.max(1, Math.round(scene.duration ?? fallbackDuration));
  const id = scene.id || `scene-${index + 1}`;
  return {
    id,
    order: index,
    title: scene.title || `Scene ${index + 1}`,
    prompt: scene.prompt || scene.sceneGoal || '',
    sceneGoal: scene.sceneGoal,
    startTime: 0,
    endTime: duration,
    duration,
    cameraMovement: scene.cameraMovement ?? 'static',
    mood: scene.mood ?? '',
    characters: [],
    props: [],
    transition: index === 0 ? 'fade' : 'cut',
    textOverlays: [],
    referenceImageUrls: [],
    stylePreset: 'cinematic',
    status: 'idle',
    versions: [],
    aspectRatio: '9:16',
    sceneDescription: scene.sceneGoal || scene.prompt || '',
    actionDescription: scene.actionDescription || '',
    visualStyle: scene.visualStyle || '',
    lighting: scene.lighting || '',
    details: scene.details || '',
    avoid: scene.avoid || '',
    negativePrompt: scene.negativePrompt || '',
    startFramePrompt: scene.startFramePrompt || '',
    endFramePrompt: scene.endFramePrompt || '',
    motionPrompt: scene.motionPrompt || '',
    frameGenerationStatus: 'pending',
    assetsUsed: scene.assetsUsed ?? [],
  };
}

function coerceAsset(asset: PlannerPlanAsset, index: number): ReusableAssetPlan {
  const id = asset.id || `asset-${index + 1}`;
  return {
    id,
    type: asset.type ?? 'style_reference',
    name: asset.name || `Asset ${index + 1}`,
    description: asset.description || '',
    generationStatus: 'pending',
    consistencyNotes: asset.consistencyNotes || '',
    styleNotes: asset.styleNotes,
    personality: asset.personality,
    referenceImagePrompt: asset.referenceImagePrompt || '',
    negativePrompt: asset.negativePrompt || '',
    usageNotes: asset.usageNotes || '',
    saveTargets: asset.saveTargets ?? ['project_assets'],
    criticality: asset.criticality ?? 'supporting',
    reusePolicy: asset.reusePolicy ?? 'when_relevant',
  };
}

function filterAssetsByVideoMode(assets: ReusableAssetPlan[], videoMode: VideoPlanningMode): ReusableAssetPlan[] {
  if (videoMode === 'influencer') {
    return assets.filter((a) => a.type !== 'product' && !(a.type === 'environment' && a.id.includes('product')));
  }
  if (videoMode === 'product') {
    return assets.filter((a) => a.type !== 'influencer');
  }
  return assets;
}

/** Convert a planner plan into the existing CreativeWorkflowPlan type. */
export function normalizePlannerPlan(
  plan: PlannerPlan,
  fallback: CreativeWorkflowPlan,
  preferredSceneCount?: number,
): CreativeWorkflowPlan {
  let scenes = (plan.scenes ?? []).map((s, i) =>
    coerceScene(s, i, plan.suggestedDuration ?? fallback.suggestedDuration ?? 5),
  );

  if (preferredSceneCount && scenes.length > preferredSceneCount) {
    scenes = scenes.slice(0, preferredSceneCount);
  }

  // Recompute timing.
  let t = 0;
  for (const sc of scenes) {
    sc.startTime = t;
    sc.endTime = t + sc.duration;
    t = sc.endTime;
  }

  const videoMode = plan.videoMode ?? fallback.videoMode;
  const rawAssets = (plan.reusableAssets ?? []).map((a, i) => coerceAsset(a, i));
  const reusableAssets = filterAssetsByVideoMode(
    rawAssets.length ? rawAssets : fallback.reusableAssets,
    videoMode,
  );
  const sceneIds = scenes.map((s) => s.id);

  const progress: PlanProgress = {
    completedSteps: [],
    pendingSteps: ['approve_plan', 'generate_assets', 'generate_frames', 'open_workflow'],
    missingInputs: [],
    sceneFrameRequirements: scenes.map((s, idx) => ({
      sceneId: s.id,
      needsStartFrame: plan.scenes?.[idx]?.needsStartFrame ?? true,
      needsEndFrame: plan.scenes?.[idx]?.needsEndFrame ?? true,
      reason: plan.scenes?.[idx]?.frameReason,
    })),
    updatedAt: new Date().toISOString(),
  };

  return {
    id: `plan-${Date.now()}`,
    concept: plan.concept || fallback.concept,
    videoMode: plan.videoMode ?? fallback.videoMode,
    summary: plan.summary || fallback.summary,
    targetViewer: plan.targetViewer || fallback.targetViewer,
    toneAndStyle: plan.toneAndStyle || fallback.toneAndStyle,
    storyStructure: plan.storyStructure ?? fallback.storyStructure,
    reusableAssets: filterAssetsByVideoMode(
      reusableAssets.length ? reusableAssets : filterAssetsByVideoMode(fallback.reusableAssets, videoMode),
      videoMode,
    ),
    consistencyReferences: fallback.consistencyReferences,
    scenes: scenes.length ? scenes : fallback.scenes,
    consistencyRequirements: plan.consistencyRequirements ?? fallback.consistencyRequirements,
    renderSettingsDeferred: true,
    suggestedAspectRatio: plan.suggestedAspectRatio ?? fallback.suggestedAspectRatio,
    suggestedDuration: plan.suggestedDuration ?? fallback.suggestedDuration,
    outputFormat: fallback.outputFormat,
    approvalStatus: 'draft',
    progress,
  };
}

/** Build the attachment-summaries blob injected into the planner system prompt. */
export function summarizeAttachments(
  analyses: { category: string; description: string; inferredPurpose: string; needsClarification?: boolean; clarificationQuestion?: string }[] | undefined,
): string {
  if (!analyses || analyses.length === 0) {
    return 'No attachments provided.';
  }
  return analyses
    .map(
      (a, i) =>
        `Attachment ${i + 1}: category=${a.category}. description=${a.description}. purpose=${a.inferredPurpose}${a.needsClarification ? `. ambiguous — question: ${a.clarificationQuestion}` : ''}`,
    )
    .join('\n');
}
