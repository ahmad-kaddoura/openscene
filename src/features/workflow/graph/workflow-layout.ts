import type { Scene, SceneStatus } from '@/core/types';

export const outputNodeId = (sceneId: string) => `output-${sceneId}`;
export const finalOutputNodeId = 'output-final';

const ACTIVE_OUTPUT: SceneStatus[] = ['queued', 'generating', 'regenerating', 'completed', 'failed'];

export function shouldShowOutputNode(scene: Scene): boolean {
  return ACTIVE_OUTPUT.includes(scene.status);
}

export const LAYOUT = {
  PARAMETERS_WIDTH: 180,
  SCRIPT_WIDTH: 220,
  FRAMES_WIDTH: 180,
  SCENE_WIDTH: 240,
  OUTPUT_WIDTH: 220,
  COL_GAP: 40,
  GROUP_GAP: 80,
  INPUT_STACK_GAP: 200,
} as const;

export type NodePositions = Record<string, { x: number; y: number }>;

export type WorkflowLayout = {
  positions: NodePositions;
  hiddenNodes?: string[];
  shownOutputs?: string[];
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

/** Default positions: Parameters, Script, Frames on left → Scene → Output. */
export function computeAutoLayout(scenes: Scene[]): NodePositions {
  const positions: NodePositions = {};
  let x = 80;
  const baseY = 80;

  scenes.forEach((scene, idx) => {
    const y = baseY + (idx % 2) * 40;
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

    const groupW =
      LAYOUT.PARAMETERS_WIDTH +
      LAYOUT.COL_GAP +
      LAYOUT.SCENE_WIDTH +
      LAYOUT.COL_GAP +
      (hasOutput ? LAYOUT.OUTPUT_WIDTH + LAYOUT.COL_GAP : 0);

    x += groupW + LAYOUT.GROUP_GAP;
  });

  if (scenes.length > 0) {
    const lastScene = scenes[scenes.length - 1];
    const lastScenePos = positions[lastScene.id] ?? { x: 480, y: baseY + LAYOUT.INPUT_STACK_GAP };
    positions[finalOutputNodeId] = {
      x: lastScenePos.x + LAYOUT.SCENE_WIDTH + LAYOUT.COL_GAP + LAYOUT.OUTPUT_WIDTH + LAYOUT.GROUP_GAP,
      y: baseY + LAYOUT.INPUT_STACK_GAP,
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
