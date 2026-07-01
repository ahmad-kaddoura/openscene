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
  ASSET_WIDTH: 220,
  PARAMETERS_WIDTH: 180,
  SCRIPT_WIDTH: 220,
  FRAMES_WIDTH: 180,
  SCENE_WIDTH: 240,
  OUTPUT_WIDTH: 220,
  COL_GAP: 56,
  GROUP_GAP: 120,
  INPUT_STACK_GAP: 188,
  ASSET_STACK_GAP: 190,
  SCENE_LANE_GAP: 124,
  TOP_PADDING: 80,
  LEFT_PADDING: 80,
} as const;

export type NodePositions = Record<string, { x: number; y: number }>;
export type NodeColorStyles = Record<string, { border?: string; line?: string }>;

export type WorkflowLayout = {
  positions: NodePositions;
  hiddenNodes?: string[];
  shownOutputs?: string[];
  nodeColors?: NodeColorStyles;
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
  return `videoforge-layout-${projectId}`;
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
  const hasTallAssetStack = reusableAssets.length > 2;
  const baseY = LAYOUT.TOP_PADDING + (hasTallAssetStack ? 48 : 0);
  const sceneLaneHeight = LAYOUT.INPUT_STACK_GAP * 2 + LAYOUT.SCENE_LANE_GAP;

  reusableAssets.forEach((asset, idx) => {
    const column = Math.floor(idx / 4);
    const row = idx % 4;
    positions[asset.id] = {
      x: LAYOUT.LEFT_PADDING + column * (LAYOUT.ASSET_WIDTH + LAYOUT.COL_GAP),
      y: baseY + row * LAYOUT.ASSET_STACK_GAP,
    };
  });

  scenes.forEach((scene, idx) => {
    const x = sceneStartX + idx * (
      LAYOUT.PARAMETERS_WIDTH +
      LAYOUT.COL_GAP +
      LAYOUT.SCENE_WIDTH +
      LAYOUT.COL_GAP +
      LAYOUT.OUTPUT_WIDTH +
      LAYOUT.GROUP_GAP
    );
    const y = baseY + (idx % 2) * 44;
    const hasOutput = shouldShowOutputNode(scene);

    positions[parametersNodeId(scene.id)] = { x, y };
    positions[scriptNodeId(scene.id)] = { x, y: y + LAYOUT.INPUT_STACK_GAP };
    positions[framesNodeId(scene.id)] = { x, y: y + LAYOUT.INPUT_STACK_GAP * 2 };

    const sceneX = x + LAYOUT.PARAMETERS_WIDTH + LAYOUT.COL_GAP;
    const sceneY = y + LAYOUT.INPUT_STACK_GAP;
    positions[scene.id] = { x: sceneX, y: sceneY };

    if (hasOutput) {
      positions[outputNodeId(scene.id)] = {
        x: sceneX + LAYOUT.SCENE_WIDTH + LAYOUT.COL_GAP,
        y: sceneY + 4,
      };
    }

    if (!hasOutput) {
      positions[outputNodeId(scene.id)] = {
        x: sceneX + LAYOUT.SCENE_WIDTH + LAYOUT.COL_GAP,
        y: sceneY + 4,
      };
    }
  });

  if (scenes.length > 0 && allScenesReadyForFinalOutput(scenes)) {
    const lastScene = scenes[scenes.length - 1];
    const lastScenePos = positions[lastScene.id] ?? { x: 480, y: baseY + LAYOUT.INPUT_STACK_GAP };
    positions[finalOutputNodeId] = {
      x: lastScenePos.x + LAYOUT.SCENE_WIDTH + LAYOUT.COL_GAP + LAYOUT.OUTPUT_WIDTH + LAYOUT.GROUP_GAP,
      y: baseY + LAYOUT.INPUT_STACK_GAP + Math.min(1, scenes.length - 1) * 44,
    };
  }

  if (scenes.length === 0 && reusableAssets.length > 0) {
    positions[finalOutputNodeId] = {
      x: sceneStartX,
      y: baseY + sceneLaneHeight,
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
