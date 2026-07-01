import type { ReusableAssetPlan, Scene, SceneStatus } from '@/core/types';

export const outputNodeId = (sceneId: string) => `output-${sceneId}`;
export const finalOutputNodeId = 'output-final';

const ACTIVE_OUTPUT: SceneStatus[] = ['queued', 'generating', 'regenerating', 'completed', 'failed'];

export function shouldShowOutputNode(scene: Scene): boolean {
  return ACTIVE_OUTPUT.includes(scene.status);
}

export function sceneHasGeneratedOutput(scene: Scene): boolean {
  return Boolean(
    scene.generatedVideoUrl ||
    scene.generatedStartFrameUrl ||
    (scene.versions?.length ?? 0) > 0,
  );
}

export function allScenesReadyForFinalOutput(scenes: Scene[]): boolean {
  return scenes.length > 0 && scenes.every(
    (scene) => scene.status === 'completed' && sceneHasGeneratedOutput(scene),
  );
}

export const LAYOUT = {
  ASSET_WIDTH: 230,
  PARAMETERS_WIDTH: 180,
  SCRIPT_WIDTH: 220,
  FRAMES_WIDTH: 180,
  SCENE_WIDTH: 240,
  OUTPUT_WIDTH: 220,
  COL_GAP: 64,
  GROUP_GAP: 140,
  ROW_GAP: 48,
  HEIGHT_BUFFER: 24,
  PARAMETERS_HEIGHT: 300,
  SCRIPT_HEIGHT_MIN: 110,
  FRAMES_HEIGHT_MIN: 170,
  SCENE_HEIGHT_MIN: 210,
  OUTPUT_HEIGHT_MIN: 180,
  ASSET_HEIGHT_MIN: 300,
  TOP_PADDING: 80,
  LEFT_PADDING: 80,
} as const;

const SCRIPT_SECTION_KEYS = [
  'sceneDescription',
  'actionDescription',
  'visualStyle',
  'lighting',
  'details',
  'avoid',
] as const;

function parseAspectRatio(ratio?: string): number {
  if (!ratio) return 16 / 9;
  const [w, h] = ratio.split(':').map(Number);
  if (!w || !h) return 16 / 9;
  return h / w;
}

function imageHeightForWidth(width: number, aspectRatio?: string) {
  return Math.ceil(width * parseAspectRatio(aspectRatio));
}

function withBuffer(height: number) {
  return height + LAYOUT.HEIGHT_BUFFER;
}

function estimateParametersHeight() {
  return withBuffer(LAYOUT.PARAMETERS_HEIGHT);
}

function estimateScriptHeight(scene: Scene) {
  const chrome = 52;
  const filled = SCRIPT_SECTION_KEYS.filter((key) => scene[key]?.trim()).length;
  if (filled === 0) return withBuffer(chrome + 52);
  return withBuffer(chrome + Math.min(236, 36 + filled * 34));
}

function estimateFrameSlotHeight(url?: string, aspectRatio?: string) {
  if (!url) return 67;
  return 16 + imageHeightForWidth(LAYOUT.FRAMES_WIDTH - 20, aspectRatio);
}

function estimateFramesHeight(scene: Scene) {
  const chrome = 52;
  const slots =
    estimateFrameSlotHeight(scene.startFrameUrl, scene.aspectRatio) +
    estimateFrameSlotHeight(scene.endFrameUrl, scene.aspectRatio);
  return withBuffer(chrome + slots + 8);
}

function estimateSceneHeight(scene: Scene) {
  const chrome = 132;
  const preview =
    scene.startFrameUrl ??
    scene.generatedStartFrameUrl ??
    scene.referenceImageUrls?.[0];
  if (!preview) return withBuffer(chrome + 84);
  return withBuffer(chrome + imageHeightForWidth(LAYOUT.SCENE_WIDTH, scene.aspectRatio));
}

function estimateOutputHeight(scene: Scene) {
  const chrome = 108;
  if (scene.status === 'generating' || scene.status === 'regenerating' || scene.status === 'queued') {
    return withBuffer(chrome + 152);
  }
  if (scene.status === 'failed') return withBuffer(chrome + 124);
  if (scene.generatedVideoUrl || scene.generatedStartFrameUrl) {
    return withBuffer(chrome + imageHeightForWidth(LAYOUT.OUTPUT_WIDTH, scene.aspectRatio));
  }
  return withBuffer(LAYOUT.OUTPUT_HEIGHT_MIN);
}

function estimateAssetHeight(asset: ReusableAssetPlan) {
  const chrome = 196;
  if (!asset.generatedImageUrl) return withBuffer(chrome + 124);
  return withBuffer(chrome + imageHeightForWidth(LAYOUT.ASSET_WIDTH - 24, '9:16'));
}

function maxOf(values: number[], fallback: number) {
  return values.length > 0 ? Math.max(fallback, ...values) : fallback;
}

function sceneColumnWidth() {
  return (
    LAYOUT.PARAMETERS_WIDTH +
    LAYOUT.COL_GAP +
    LAYOUT.SCENE_WIDTH +
    LAYOUT.COL_GAP +
    LAYOUT.OUTPUT_WIDTH +
    LAYOUT.GROUP_GAP
  );
}

function inputStackMetrics(scenes: Scene[], baseY: number) {
  const paramsH = estimateParametersHeight();
  const scriptH = maxOf(scenes.map(estimateScriptHeight), LAYOUT.SCRIPT_HEIGHT_MIN);
  const framesH = maxOf(scenes.map(estimateFramesHeight), LAYOUT.FRAMES_HEIGHT_MIN);
  const sceneH = maxOf(scenes.map(estimateSceneHeight), LAYOUT.SCENE_HEIGHT_MIN);

  const parametersY = baseY;
  const scriptY = parametersY + paramsH + LAYOUT.ROW_GAP;
  const framesY = scriptY + scriptH + LAYOUT.ROW_GAP;
  const stackBottom = framesY + framesH;
  const stackHeight = stackBottom - parametersY;
  const sceneY = parametersY + Math.max(0, Math.floor((stackHeight - sceneH) / 2));

  return { parametersY, scriptY, framesY, sceneY, stackHeight, sceneH };
}

export type NodePositions = Record<string, { x: number; y: number }>;
export type NodeColorStyles = Record<string, { border?: string; line?: string }>;
export type WorkflowNote = {
  id: string;
  title?: string;
  text: string;
  width?: number;
  height?: number;
};

export type MotionControlStatus = 'idle' | 'queued' | 'generating' | 'completed' | 'failed';

export type WorkflowMotionControl = {
  id: string;
  title: string;
  imageUrl?: string;
  videoUrl?: string;
  prompt?: string;
  negativePrompt?: string;
  outputUrl?: string;
  duration?: number;
  aspectRatio?: string;
  cameraMovement?: string;
  stylePreset?: string;
  lighting?: string;
  status: MotionControlStatus;
  progress?: number;
  generationStartedAt?: string;
  taskId?: string;
  model?: string;
  error?: string;
};

export type WorkflowInputKind = 'image-input' | 'video-input' | 'prompt-input';

export type WorkflowInput = {
  id: string;
  kind: WorkflowInputKind;
  imageUrl?: string;
  videoUrl?: string;
  prompt?: string;
  negativePrompt?: string;
};

export type WorkflowConnection = {
  id: string;
  source: string;
  sourceHandle?: string | null;
  target: string;
  targetHandle?: string | null;
};

type LegacyWorkflowInput = Omit<WorkflowInput, 'kind'> & {
  kind: WorkflowInputKind | 'reference-image' | 'reference-video' | 'motion-prompt';
};

export type WorkflowLayout = {
  positions: NodePositions;
  hiddenNodes?: string[];
  shownOutputs?: string[];
  nodeColors?: NodeColorStyles;
  notes?: WorkflowNote[];
  motionControls?: WorkflowMotionControl[];
  inputs?: WorkflowInput[];
  motionInputs?: WorkflowInput[];
  connections?: WorkflowConnection[];
};

function isLegacyPositions(value: unknown): value is NodePositions {
  if (!value || typeof value !== 'object') return false;
  const first = Object.values(value as Record<string, unknown>)[0];
  return Boolean(first && typeof first === 'object' && 'x' in first && 'y' in first);
}

function normalizeLayout(raw: unknown): WorkflowLayout | null {
  if (!raw) return null;
  if (isLegacyPositions(raw)) return { positions: raw, hiddenNodes: [], shownOutputs: [] };
  const layout = raw as WorkflowLayout;
  if (layout.positions) {
    return {
      positions: layout.positions,
      hiddenNodes: layout.hiddenNodes ?? [],
      shownOutputs: layout.shownOutputs ?? [],
      nodeColors: layout.nodeColors ?? {},
      notes: layout.notes ?? [],
      motionControls: layout.motionControls ?? [],
      connections: layout.connections ?? [],
      inputs: ((layout.inputs ?? layout.motionInputs ?? []) as LegacyWorkflowInput[]).map((input) => ({
        ...input,
        kind: input.kind === 'reference-image'
          ? 'image-input'
          : input.kind === 'reference-video'
            ? 'video-input'
            : input.kind === 'motion-prompt'
              ? 'prompt-input'
              : input.kind,
      })) as WorkflowInput[],
    };
  }
  return null;
}

export const parametersNodeId = (sceneId: string) => `parameters-${sceneId}`;
export const scriptNodeId = (sceneId: string) => `script-${sceneId}`;
export const framesNodeId = (sceneId: string) => `frames-${sceneId}`;

/** @deprecated use parametersNodeId */
export const paramsNodeId = parametersNodeId;

function layoutStorageKey(projectId: string) {
  return `openscene-layout-${projectId}`;
}

export function loadLayoutFromStorage(projectId: string): WorkflowLayout | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(layoutStorageKey(projectId));
    return raw ? normalizeLayout(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveLayoutToStorage(projectId: string, layout: WorkflowLayout) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(layoutStorageKey(projectId), JSON.stringify(layout));
}

/** Default positions: Assets → per-scene inputs → Scene → Output → Final output. */
export function computeAutoLayout(
  scenes: Scene[],
  reusableAssets: ReusableAssetPlan[] = [],
): NodePositions {
  const positions: NodePositions = {};
  const sceneStartX = reusableAssets.length > 0
    ? LAYOUT.LEFT_PADDING + LAYOUT.ASSET_WIDTH + LAYOUT.GROUP_GAP
    : LAYOUT.LEFT_PADDING;
  const baseY = LAYOUT.TOP_PADDING;
  const stack = inputStackMetrics(scenes, baseY);
  const columnBottomY: number[] = [];

  reusableAssets.forEach((asset, idx) => {
    const column = Math.floor(idx / 4);
    const y = columnBottomY[column] ?? baseY;
    positions[asset.id] = {
      x: LAYOUT.LEFT_PADDING + column * (LAYOUT.ASSET_WIDTH + LAYOUT.COL_GAP),
      y,
    };
    columnBottomY[column] = y + estimateAssetHeight(asset) + LAYOUT.ROW_GAP;
  });

  scenes.forEach((scene, idx) => {
    const x = sceneStartX + idx * sceneColumnWidth();
    const sceneX = x + LAYOUT.PARAMETERS_WIDTH + LAYOUT.COL_GAP;
    const outputH = estimateOutputHeight(scene);
    const outputY = stack.sceneY + Math.max(0, Math.floor((stack.sceneH - outputH) / 2));

    positions[parametersNodeId(scene.id)] = { x, y: stack.parametersY };
    positions[scriptNodeId(scene.id)] = { x, y: stack.scriptY };
    positions[framesNodeId(scene.id)] = { x, y: stack.framesY };
    positions[scene.id] = { x: sceneX, y: stack.sceneY };
    positions[outputNodeId(scene.id)] = {
      x: sceneX + LAYOUT.SCENE_WIDTH + LAYOUT.COL_GAP,
      y: outputY,
    };
  });

  if (scenes.length > 0 && allScenesReadyForFinalOutput(scenes)) {
    const lastScene = scenes[scenes.length - 1];
    const lastScenePos = positions[lastScene.id] ?? { x: 480, y: stack.sceneY };
    positions[finalOutputNodeId] = {
      x: lastScenePos.x + LAYOUT.SCENE_WIDTH + LAYOUT.COL_GAP + LAYOUT.OUTPUT_WIDTH + LAYOUT.GROUP_GAP,
      y: stack.sceneY,
    };
  }

  if (scenes.length === 0 && reusableAssets.length > 0) {
    const tallestAssetColumn = columnBottomY.length > 0
      ? Math.max(...columnBottomY)
      : baseY + LAYOUT.ASSET_HEIGHT_MIN;
    positions[finalOutputNodeId] = {
      x: sceneStartX,
      y: tallestAssetColumn + LAYOUT.ROW_GAP,
    };
  }

  return positions;
}

export function resolvePosition(
  nodeId: string,
  saved: NodePositions | null,
  defaults: NodePositions,
): { x: number; y: number } {
  return saved?.[nodeId] ?? defaults[nodeId] ?? { x: 0, y: 0 };
}
