import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { nanoid } from 'nanoid';
import { applyNodeChanges, applyEdgeChanges, type OnNodesChange, type OnEdgesChange, type Connection, addEdge } from '@xyflow/react';
import type { Scene, SceneStatus } from '@/core/types';
import { useProjectStore } from '@/features/project/store';
import { CAMERA_MOVEMENTS, STYLE_PRESETS } from '@/core/config';

import { generateSceneAssets, SceneGenerationError } from './lib/generate-scene';
import { buildScenePrompt } from './lib/prompt-template';
import { useSettingsStore } from '@/features/settings/store';
import { storage } from '@/services/storage/indexeddb';
import { getPrompt } from '@/core/prompts';
import {
  computeAutoLayout,
  loadLayoutFromStorage,
  saveLayoutToStorage,
  outputNodeId,
  shouldShowOutputNode,
  allScenesReadyForFinalOutput,
  finalOutputNodeId,
  type NodeColorStyles,
  type WorkflowNote,
  type WorkflowMotionControl,
  type WorkflowInput,
  type WorkflowConnection,
} from './graph/workflow-layout';
import { nodeIdsForScene, sceneIdFromNodeId } from './graph/workflow-node-utils';
import { nodeIdForKind, type WorkflowNodeKind } from './graph/workflow-node-catalog';

const generationAbortControllers = new Map<string, AbortController>();
const motionAbortControllers = new Map<string, AbortController>();
const activeMotionPolls = new Set<string>();
let batchGenerationCancelled = false;

const MOTION_CONTROL_CANCELLED_MESSAGE = 'Motion control cancelled.';

function isMotionControlCancellation(error: unknown) {
  return (
    (error instanceof Error && error.message === MOTION_CONTROL_CANCELLED_MESSAGE) ||
    (error instanceof DOMException && error.name === 'AbortError')
  );
}

function waitForMotionPollDelay(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error(MOTION_CONTROL_CANCELLED_MESSAGE));
      return;
    }
    const timer = setTimeout(resolve, 2500);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new Error(MOTION_CONTROL_CANCELLED_MESSAGE));
    }, { once: true });
  });
}

async function pollMotionControlTask(
  id: string,
  taskId: string,
  model: string | undefined,
  updateMotionControl: (id: string, updates: Partial<Omit<WorkflowMotionControl, 'id'>>) => void,
  signal: AbortSignal,
  generationStartedAt?: string,
): Promise<{ videoUrl: string; model?: string }> {
  const startedAt = generationStartedAt
    ? new Date(generationStartedAt).getTime()
    : Date.now();
  const timeoutMs = 10 * 60 * 1000;

  while (Date.now() - startedAt < timeoutMs) {
    await waitForMotionPollDelay(signal);
    const elapsed = Date.now() - startedAt;
    updateMotionControl(id, { progress: Math.min(97, Math.round(12 + (elapsed / 180000) * 80)) });

    const params = new URLSearchParams({ taskId, ...(model ? { model } : {}) });
    const pollResponse = await fetch(`/api/generate-scene?${params.toString()}`, { signal });
    if (!pollResponse.ok) {
      const data = await pollResponse.json().catch(() => ({}));
      throw new Error(data.error || `Motion control polling failed (${pollResponse.status})`);
    }

    const status = await pollResponse.json();
    if (status.status === 'succeeded') {
      if (!status.videoUrl) throw new Error('Motion control succeeded but returned no video URL.');
      return { videoUrl: status.videoUrl, model: status.model || model };
    }
    if (status.status === 'failed') {
      throw new Error(status.error || 'Motion control generation failed.');
    }
  }

  throw new Error('Motion control generation timed out after 10 minutes.');
}

function registerGenerationAbortController(sceneId: string): AbortController {
  const existing = generationAbortControllers.get(sceneId);
  if (existing) existing.abort();
  const controller = new AbortController();
  generationAbortControllers.set(sceneId, controller);
  return controller;
}

function clearGenerationAbortController(sceneId: string) {
  generationAbortControllers.delete(sceneId);
}

function abortAllGenerationControllers() {
  for (const controller of generationAbortControllers.values()) {
    controller.abort();
  }
  generationAbortControllers.clear();
}

function registerMotionAbortController(id: string): AbortController {
  const existing = motionAbortControllers.get(id);
  if (existing) existing.abort();
  const controller = new AbortController();
  motionAbortControllers.set(id, controller);
  return controller;
}

function clearMotionAbortController(id: string, controller?: AbortController) {
  if (controller && motionAbortControllers.get(id) !== controller) return;
  motionAbortControllers.delete(id);
}

function persistLayout(get: () => WorkflowState) {
  const projectId = get().layoutProjectId;
  if (!projectId) return;
  saveLayoutToStorage(projectId, {
    positions: get().nodePositions,
    hiddenNodes: Object.keys(get().hiddenNodeIds),
    shownOutputs: Object.keys(get().shownOutputSceneIds),
    nodeColors: get().nodeColorStyles,
    notes: get().noteNodes,
    motionControls: get().motionControls,
    inputs: get().inputNodes,
    connections: get().workflowConnections,
  });
}

let persistStoryboardTimer: ReturnType<typeof setTimeout> | null = null;

async function persistStoryboard(get: () => WorkflowState) {
  const project = useProjectStore.getState().getCurrentProject();
  if (!project) return;
  const scenes = get().getScenes();
  await useProjectStore.getState().setStoryboard({
    id: project.storyboard?.id || nanoid(),
    scenes,
    totalDuration: get().getTotalDuration(),
    narrativeArc: project.storyboard?.narrativeArc || '',
  });
}

function schedulePersistStoryboard(get: () => WorkflowState) {
  if (persistStoryboardTimer) clearTimeout(persistStoryboardTimer);
  persistStoryboardTimer = setTimeout(() => {
    void persistStoryboard(get);
    persistStoryboardTimer = null;
  }, 350);
}

function flushPersistStoryboard(get: () => WorkflowState) {
  if (persistStoryboardTimer) {
    clearTimeout(persistStoryboardTimer);
    persistStoryboardTimer = null;
  }
  void persistStoryboard(get);
}

function syncOutputNodeVisibility(state: {
  sceneOrder: string[];
  sceneMap: Record<string, Scene>;
  hiddenNodeIds: Record<string, true>;
  shownOutputSceneIds: Record<string, true>;
}) {
  const scenes = state.sceneOrder.map((id) => state.sceneMap[id]).filter(Boolean);
  if (allScenesReadyForFinalOutput(scenes)) {
    delete state.hiddenNodeIds[finalOutputNodeId];
  } else {
    state.hiddenNodeIds[finalOutputNodeId] = true;
  }

  for (const sceneId of state.sceneOrder) {
    const scene = state.sceneMap[sceneId];
    if (!scene) continue;
    if (shouldShowOutputNode(scene)) {
      delete state.hiddenNodeIds[outputNodeId(sceneId)];
      state.shownOutputSceneIds[sceneId] = true;
    } else {
      state.hiddenNodeIds[outputNodeId(sceneId)] = true;
      delete state.shownOutputSceneIds[sceneId];
    }
  }
}

function sceneHasGeneratedOutput(scene: Scene): boolean {
  return Boolean(
    scene.generatedVideoUrl ||
    scene.generatedStartFrameUrl ||
    (scene.versions?.length ?? 0) > 0,
  );
}

function sceneNeedsGeneration(scene: Scene): boolean {
  if (scene.status === 'generating' || scene.status === 'regenerating') {
    return false;
  }
  if (scene.status === 'completed' && sceneHasGeneratedOutput(scene)) {
    return false;
  }
  return scene.status === 'idle' || scene.status === 'failed' || scene.status === 'queued';
}

function createSceneRecord(scenes: Scene[], afterIndex?: number): Scene {
  const id = nanoid();
  const order = scenes.length;
  const prevScene = afterIndex !== undefined ? scenes[afterIndex] : null;
  const startTime = prevScene ? prevScene.endTime : 0;

  return {
    id,
    order,
    title: `Scene ${scenes.length + 1}`,
    prompt: '',
    startTime,
    endTime: startTime + 5,
    duration: 5,
    cameraMovement: 'static',
    mood: '',
    characters: [],
    props: [],
    transition: 'cut',
    textOverlays: [],
    stylePreset: 'cinematic',
    referenceImageUrls: [],
    status: 'idle',
    versions: [],
    aspectRatio: '9:16',
    sceneDescription: '',
    actionDescription: '',
    visualStyle: '',
    lighting: '',
    details: '',
    avoid: '',
    startFrameUrl: undefined,
    endFrameUrl: undefined,
  };
}

function recalcSceneTiming(s: { sceneOrder: string[]; sceneMap: Record<string, Scene> }) {
  s.sceneOrder.forEach((sid, idx) => {
    if (s.sceneMap[sid]) {
      s.sceneMap[sid].order = idx;
      if (idx > 0) {
        const prevSid = s.sceneOrder[idx - 1];
        s.sceneMap[sid].startTime = s.sceneMap[prevSid]?.endTime || 0;
      }
      s.sceneMap[sid].endTime = s.sceneMap[sid].startTime + s.sceneMap[sid].duration;
    }
  });
}


interface WorkflowState {
  sceneMap: Record<string, Scene>;
  sceneOrder: string[];
  nodePositions: Record<string, { x: number; y: number }>;
  nodeColorStyles: NodeColorStyles;
  hiddenNodeIds: Record<string, true>;
  shownOutputSceneIds: Record<string, true>;
  noteNodes: WorkflowNote[];
  motionControls: WorkflowMotionControl[];
  inputNodes: WorkflowInput[];
  workflowConnections: WorkflowConnection[];
  layoutProjectId: string | null;

  // Scene CRUD
  addScene: (afterIndex?: number) => void;
  addNodeAt: (kind: WorkflowNodeKind, position: { x: number; y: number }, sceneId?: string) => string;
  removeScene: (id: string) => void;
  removeWorkflowNode: (nodeId: string) => void;
  updateNoteNode: (id: string, updates: Partial<Omit<WorkflowNote, 'id'>>) => void;
  updateMotionControl: (id: string, updates: Partial<Omit<WorkflowMotionControl, 'id'>>) => void;
  updateInputNode: (id: string, updates: Partial<Omit<WorkflowInput, 'id' | 'kind'>>) => void;
  addWorkflowConnection: (connection: Omit<WorkflowConnection, 'id'> & { id?: string }) => void;
  generateMotionControl: (id: string, options?: { resume?: boolean }) => Promise<void>;
  cancelMotionControl: (id: string) => void;
  updateScene: (id: string, updates: Partial<Scene>) => void;
  reorderScenes: (newOrder: string[]) => void;
  duplicateScene: (id: string) => void;

  // Scene status
  setSceneStatus: (id: string, status: SceneStatus) => void;
  generateScene: (id: string, options?: { resume?: boolean }) => Promise<void>;
  generateAllScenes: () => Promise<void>;
  clearSceneOutput: (id: string) => Promise<void>;
  retrySceneGeneration: (id: string) => Promise<void>;
  resumePendingGenerations: () => Promise<void>;
  resumePendingMotionControls: () => Promise<void>;
  cancelAllGenerations: () => Promise<void>;
  isGeneratingAll: boolean;

  // AI actions on scenes
  updateScenePrompt: (id: string, newPrompt: string) => void;

  // Helpers
  getScene: (id: string) => Scene | undefined;
  getScenes: () => Scene[];
  getTotalDuration: () => number;
  buildFromStoryboard: (scenes: Scene[]) => void;
  clearGraph: () => void;
  hydrateFromProject: (projectId: string, scenes: Scene[]) => Promise<void>;
  importWorkflowSnapshot: (snapshot: {
    scenes?: Scene[];
    notes?: WorkflowNote[];
    motionControls?: WorkflowMotionControl[];
    inputs?: WorkflowInput[];
    connections?: WorkflowConnection[];
    layout?: {
      positions?: Record<string, { x: number; y: number }>;
      hiddenNodes?: string[];
      shownOutputs?: string[];
      nodeColors?: NodeColorStyles;
    };
  }) => void;

  // Layout
  loadLayoutForProject: (projectId: string) => void;
  setNodePosition: (nodeId: string, position: { x: number; y: number }) => void;
  setNodeColorStyle: (nodeId: string, style: { border?: string; line?: string }) => void;
  resetNodeColorStyle: (nodeId: string) => void;
  applyAutoLayout: () => void;
  getNodePositions: () => Record<string, { x: number; y: number }>;
}

export const useWorkflowStore = create<WorkflowState>()(
  immer((set, get) => ({
    sceneMap: {},
    sceneOrder: [],
    nodePositions: {},
    nodeColorStyles: {},
    hiddenNodeIds: {},
    shownOutputSceneIds: {},
    noteNodes: [],
    motionControls: [],
    inputNodes: [],
    workflowConnections: [],
    layoutProjectId: null,
    isGeneratingAll: false,

    addScene: (afterIndex) => {
      const scenes = get().getScenes();
      const scene = createSceneRecord(scenes, afterIndex);

      set((s) => {
        s.sceneMap[scene.id] = scene;
        const insertAt = afterIndex !== undefined ? afterIndex + 1 : s.sceneOrder.length;
        s.sceneOrder.splice(insertAt, 0, scene.id);
        recalcSceneTiming(s);
      });

      void persistStoryboard(get);
    },

    addNodeAt: (kind, position, sceneId) => {
      if (kind === 'note') {
        const nodeId = `note-${nanoid()}`;
        set((s) => {
          s.noteNodes.push({
            id: nodeId,
            title: 'Text (Notes)',
            text: '',
            width: 240,
            height: 170,
          });
          s.nodePositions[nodeId] = position;
        });
        persistLayout(get);
        return nodeId;
      }

      if (kind === 'motion-control') {
        const id = nanoid();
        const promptOverrides = useSettingsStore.getState().settings.promptOverrides;
        const nodes = {
          image: `motion-image-${id}`,
          video: `motion-video-${id}`,
          prompt: `motion-prompt-${id}`,
          control: `motion-control-${id}`,
          output: `motion-output-${id}`,
        };
        set((s) => {
          s.motionControls.push({
            id,
            title: `Motion Control ${s.motionControls.length + 1}`,
            prompt: getPrompt('video.motion.default', promptOverrides),
            status: 'idle',
            progress: 0,
          });
          s.nodePositions[nodes.image] = { x: position.x - 280, y: position.y - 170 };
          s.nodePositions[nodes.video] = { x: position.x - 280, y: position.y + 10 };
          s.nodePositions[nodes.prompt] = { x: position.x - 280, y: position.y + 190 };
          s.nodePositions[nodes.control] = position;
          s.nodePositions[nodes.output] = { x: position.x + 340, y: position.y };
        });
        persistLayout(get);
        return nodes.control;
      }

      if (kind === 'image-input' || kind === 'video-input' || kind === 'prompt-input') {
        const id = `${kind}-${nanoid()}`;
        const promptOverrides = useSettingsStore.getState().settings.promptOverrides;
        set((s) => {
          s.inputNodes.push({
            id,
            kind,
            prompt: kind === 'prompt-input' ? getPrompt('video.motion.default', promptOverrides) : undefined,
            negativePrompt: kind === 'prompt-input' ? getPrompt('negative.motion_control', promptOverrides) : undefined,
          });
          s.nodePositions[id] = position;
        });
        persistLayout(get);
        return id;
      }

      let sid = sceneId;

      if (!sid) {
        const scenes = get().getScenes();
        const scene = createSceneRecord(scenes);
        sid = scene.id;

        set((s) => {
          s.sceneMap[sid!] = scene;
          s.sceneOrder.push(sid!);
          recalcSceneTiming(s);
          for (const nid of nodeIdsForScene(sid!)) {
            s.hiddenNodeIds[nid] = true;
          }
        });
        void persistStoryboard(get);
      }

      const nodeId = nodeIdForKind(kind, sid);

      set((s) => {
        delete s.hiddenNodeIds[nodeId];
        s.nodePositions[nodeId] = position;
      });

      persistLayout(get);
      return nodeId;
    },

    removeScene: (id) => {
      set((s) => {
        delete s.sceneMap[id];
        s.sceneOrder = s.sceneOrder.filter((sid) => sid !== id);
        recalcSceneTiming(s);
        for (const nid of nodeIdsForScene(id)) {
          delete s.nodePositions[nid];
          delete s.hiddenNodeIds[nid];
        }
        delete s.shownOutputSceneIds[id];
      });
      const projectId = get().layoutProjectId;
      if (projectId) persistLayout(get);
      void persistStoryboard(get);
    },

    removeWorkflowNode: (nodeId) => {
      const sceneId = sceneIdFromNodeId(nodeId, get().sceneOrder);
      const standaloneInput = get().inputNodes.some((input) => input.id === nodeId);

      set((s) => {
        if (nodeId.startsWith('note-')) {
          s.noteNodes = s.noteNodes.filter((note) => note.id !== nodeId);
        } else if (
          nodeId.startsWith('image-input-') ||
          nodeId.startsWith('video-input-') ||
          standaloneInput
        ) {
          s.inputNodes = s.inputNodes.filter((input) => input.id !== nodeId);
        } else if (nodeId.startsWith('motion-image-')) {
          const motionId = nodeId.slice('motion-image-'.length);
          const motion = s.motionControls.find((item) => item.id === motionId);
          if (motion) motion.imageUrl = undefined;
          s.hiddenNodeIds[nodeId] = true;
        } else if (nodeId.startsWith('motion-video-')) {
          const motionId = nodeId.slice('motion-video-'.length);
          const motion = s.motionControls.find((item) => item.id === motionId);
          if (motion) motion.videoUrl = undefined;
          s.hiddenNodeIds[nodeId] = true;
        } else if (nodeId.startsWith('motion-prompt-')) {
          const motionId = nodeId.slice('motion-prompt-'.length);
          const motion = s.motionControls.find((item) => item.id === motionId);
          if (motion) motion.prompt = '';
          s.hiddenNodeIds[nodeId] = true;
        } else if (nodeId.startsWith('motion-output-')) {
          const motionId = nodeId.slice('motion-output-'.length);
          const motion = s.motionControls.find((item) => item.id === motionId);
          if (motion) motion.outputUrl = undefined;
          s.hiddenNodeIds[nodeId] = true;
        } else if (nodeId.startsWith('motion-control-')) {
          const motionId = nodeId.replace(/^motion-(?:image|video|prompt|control)-/, '');
          s.motionControls = s.motionControls.filter((motion) => motion.id !== motionId);
          const relatedNodeIds = [
            `motion-image-${motionId}`,
            `motion-video-${motionId}`,
            `motion-prompt-${motionId}`,
            `motion-parameters-${motionId}`,
            `motion-control-${motionId}`,
            `motion-output-${motionId}`,
          ];
          for (const id of [
            ...relatedNodeIds,
          ]) {
            delete s.nodePositions[id];
            delete s.nodeColorStyles[id];
            delete s.hiddenNodeIds[id];
          }
          s.workflowConnections = s.workflowConnections.filter((connection) =>
            !relatedNodeIds.includes(connection.source) && !relatedNodeIds.includes(connection.target),
          );
        } else {
          s.hiddenNodeIds[nodeId] = true;
        }
        s.workflowConnections = s.workflowConnections.filter((connection) =>
          connection.source !== nodeId && connection.target !== nodeId,
        );
        delete s.nodePositions[nodeId];
        delete s.nodeColorStyles[nodeId];
      });

      if (nodeId.startsWith('output-') && sceneId) {
        get().clearSceneOutput(sceneId);
      }

      persistLayout(get);
    },

    updateNoteNode: (id, updates) => {
      set((s) => {
        const note = s.noteNodes.find((item) => item.id === id);
        if (note) Object.assign(note, updates);
      });
      persistLayout(get);
    },

    updateMotionControl: (id, updates) => {
      set((s) => {
        const motion = s.motionControls.find((item) => item.id === id);
        if (motion) Object.assign(motion, updates);
      });
      persistLayout(get);
    },

    updateInputNode: (id, updates) => {
      set((s) => {
        const input = s.inputNodes.find((item) => item.id === id);
        if (input) Object.assign(input, updates);
      });
      persistLayout(get);
    },

    addWorkflowConnection: (connection) => {
      const id = connection.id ?? `e-${connection.source}-${connection.sourceHandle ?? 'source'}-${connection.target}-${connection.targetHandle ?? 'target'}`;
      set((s) => {
        const duplicate = s.workflowConnections.some((item) =>
          item.source === connection.source &&
          item.sourceHandle === connection.sourceHandle &&
          item.target === connection.target &&
          item.targetHandle === connection.targetHandle,
        );
        if (!duplicate) {
          s.workflowConnections.push({ ...connection, id });
        }
      });
      persistLayout(get);
    },

    generateMotionControl: async (id, options) => {
      const motion = get().motionControls.find((item) => item.id === id);
      if (!motion) return;

      let isResume = options?.resume === true;
      if (
        !isResume &&
        (motion.status === 'generating' || motion.status === 'queued') &&
        motion.taskId &&
        !motion.outputUrl
      ) {
        isResume = true;
      }

      if (activeMotionPolls.has(id)) return;

      if (!isResume) {
        if (!motion.imageUrl || !motion.videoUrl) {
          get().updateMotionControl(id, {
            status: 'failed',
            error: 'Add a reference image and reference video first.',
            progress: 0,
          });
          return;
        }

        get().updateMotionControl(id, {
          status: 'queued',
          error: undefined,
          progress: 5,
          outputUrl: undefined,
          generationStartedAt: new Date().toISOString(),
        });
      } else if (!motion.taskId) {
        get().updateMotionControl(id, { status: 'idle', progress: 0 });
        return;
      }

      activeMotionPolls.add(id);
      const controller = registerMotionAbortController(id);

      try {
        let taskId = motion.taskId;
        let model = motion.model;

        if (!isResume) {
          const styleStr = motion.stylePreset ? ` Visual style: ${STYLE_PRESETS.find((s) => s.id === motion.stylePreset)?.name ?? motion.stylePreset}.` : '';
          const lightingStr = motion.lighting ? ` Lighting: ${motion.lighting}.` : '';
          const cameraStr = motion.cameraMovement ? ` Camera movement: ${CAMERA_MOVEMENTS.find((c) => c.id === motion.cameraMovement)?.name ?? motion.cameraMovement}.` : '';
          
          const promptOverrides = useSettingsStore.getState().settings.promptOverrides;
          let builtPrompt = motion.prompt || getPrompt('video.motion.default', promptOverrides);
          if (styleStr || lightingStr || cameraStr) {
            builtPrompt += `\n${styleStr}${lightingStr}${cameraStr}`;
          }

          const submitResponse = await fetch('/api/generate-scene', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              startFrameUrl: motion.imageUrl,
              referenceVideoUrl: motion.videoUrl,
              prompt: builtPrompt,
              negative_prompt: motion.negativePrompt || getPrompt('negative.motion_control', promptOverrides),
              generationModels: useSettingsStore.getState().settings.generationModels,
              motionControl: true,
            }),
          });

          if (!submitResponse.ok) {
            const data = await submitResponse.json().catch(() => ({}));
            throw new Error(data.error || `Motion control submit failed (${submitResponse.status})`);
          }

          const submitted = await submitResponse.json();
          taskId = submitted.taskId as string | undefined;
          model = submitted.model as string | undefined;
          if (!taskId) throw new Error('Motion control generation did not return a task id.');

          get().updateMotionControl(id, { status: 'generating', taskId, model, progress: 12 });
        } else {
          get().updateMotionControl(id, { status: 'generating', error: undefined });
        }

        const result = await pollMotionControlTask(
          id,
          taskId!,
          model,
          get().updateMotionControl,
          controller.signal,
          isResume ? motion.generationStartedAt : undefined,
        );

        get().updateMotionControl(id, {
          status: 'completed',
          outputUrl: result.videoUrl,
          model: result.model || model,
          progress: 100,
        });
      } catch (error) {
        if (isMotionControlCancellation(error)) {
          return;
        }
        get().updateMotionControl(id, {
          status: 'failed',
          error: error instanceof Error ? error.message : 'Motion control generation failed.',
          progress: 0,
        });
      } finally {
        activeMotionPolls.delete(id);
        clearMotionAbortController(id, controller);
      }
    },

    cancelMotionControl: (id) => {
      motionAbortControllers.get(id)?.abort();
      activeMotionPolls.delete(id);
      set((s) => {
        const motion = s.motionControls.find((item) => item.id === id);
        if (!motion) return;
        motion.status = 'idle';
        motion.progress = 0;
        motion.generationStartedAt = undefined;
        motion.taskId = undefined;
        motion.error = undefined;
      });
      clearMotionAbortController(id);
      persistLayout(get);
    },

    updateScene: (id, updates) => {
      set((s) => {
        if (s.sceneMap[id]) {
          Object.assign(s.sceneMap[id], updates);
          if (updates.duration !== undefined) {
            // Recalculate end time and subsequent scenes
            const idx = s.sceneOrder.indexOf(id);
            if (idx >= 0) {
              s.sceneMap[id].endTime = s.sceneMap[id].startTime + updates.duration;
              for (let i = idx + 1; i < s.sceneOrder.length; i++) {
                const prevSid = s.sceneOrder[i - 1];
                s.sceneMap[s.sceneOrder[i]].startTime = s.sceneMap[prevSid]?.endTime || 0;
                s.sceneMap[s.sceneOrder[i]].endTime = s.sceneMap[s.sceneOrder[i]].startTime + s.sceneMap[s.sceneOrder[i]].duration;
              }
            }
          }
        }
      });
    },

    reorderScenes: (newOrder) => {
      set((s) => {
        s.sceneOrder = newOrder;
        s.sceneOrder.forEach((sid, idx) => {
          if (s.sceneMap[sid]) {
            s.sceneMap[sid].order = idx;
            if (idx > 0) {
              const prevSid = s.sceneOrder[idx - 1];
              s.sceneMap[sid].startTime = s.sceneMap[prevSid]?.endTime || 0;
            }
            s.sceneMap[sid].endTime = s.sceneMap[sid].startTime + s.sceneMap[sid].duration;
          }
        });
      });
    },

    duplicateScene: (id) => {
      const scene = get().sceneMap[id];
      if (!scene) return;
      const newId = nanoid();
      const newScene: Scene = {
        ...structuredClone(scene),
        id: newId,
        title: `${scene.title} (Copy)`,
        status: 'idle',
        versions: [],
        generatedStartFrameUrl: undefined,
        generatedEndFrameUrl: undefined,
        generatedVideoUrl: undefined,
        generatedAudioUrl: undefined,
      };
      set((s) => {
        s.sceneMap[newId] = newScene;
        const idx = s.sceneOrder.indexOf(id);
        s.sceneOrder.splice(idx + 1, 0, newId);
        s.sceneOrder.forEach((sid, i) => {
          if (s.sceneMap[sid]) {
            s.sceneMap[sid].order = i;
            if (i > 0) {
              const prevSid = s.sceneOrder[i - 1];
              s.sceneMap[sid].startTime = s.sceneMap[prevSid]?.endTime || 0;
            }
            s.sceneMap[sid].endTime = s.sceneMap[sid].startTime + s.sceneMap[sid].duration;
          }
        });
      });
    },

    setSceneStatus: (id, status) => {
      set((s) => {
        if (s.sceneMap[id]) {
          s.sceneMap[id].status = status;
        }
      });
    },

    generateScene: async (id, options) => {
      const scene = get().sceneMap[id];
      if (!scene) return;
      if (batchGenerationCancelled && !options?.resume) return;
      const isResume = options?.resume === true;
      if (!isResume && (scene.status === 'generating' || scene.status === 'regenerating')) {
        return;
      }
      if (!isResume && scene.status === 'completed' && sceneHasGeneratedOutput(scene)) {
        return;
      }

      const settings = useSettingsStore.getState().settings;
      const template = settings.promptOverrides?.['scenario.scene.base'] ?? settings.scenePromptTemplate;
      const builtPrompt = buildScenePrompt(scene, template);
      const generationModels = settings.generationModels;
      const controller = registerGenerationAbortController(id);

      set((s) => {
        if (s.sceneMap[id]) {
          s.sceneMap[id].status = 'generating';
          s.sceneMap[id].generationProgress = isResume ? (s.sceneMap[id].generationProgress ?? 0) : 0;
          s.sceneMap[id].generationStartedAt = isResume && s.sceneMap[id].generationStartedAt
            ? s.sceneMap[id].generationStartedAt
            : new Date().toISOString();
          s.sceneMap[id].enhancedPrompt = builtPrompt;
          if (!isResume || !s.sceneMap[id].generationModels) {
            s.sceneMap[id].generationModels = generationModels;
          }
          delete s.hiddenNodeIds[outputNodeId(id)];
          s.shownOutputSceneIds[id] = true;
          s.hiddenNodeIds[finalOutputNodeId] = true;
        }
      });
      persistLayout(get);
      await persistStoryboard(get);

      try {
        const result = await generateSceneAssets(
          scene,
          (pct) => {
            set((s) => {
              if (s.sceneMap[id]) {
                s.sceneMap[id].generationProgress = pct;
              }
            });
            schedulePersistStoryboard(get);
          },
          {
            prompt: builtPrompt,
            generationModels: useSettingsStore.getState().settings.generationModels,
            promptOverrides: useSettingsStore.getState().settings.promptOverrides,
            existingTaskId: isResume ? scene.generationTaskId : undefined,
            existingModel: scene.generationModel,
            onTaskSubmitted: async (taskId, model) => {
              set((s) => {
                if (!s.sceneMap[id]) return;
                s.sceneMap[id].generationTaskId = taskId;
                s.sceneMap[id].generationModel = model;
                delete s.sceneMap[id].generationError;
              });
              await persistStoryboard(get);
              const project = useProjectStore.getState().getCurrentProject();
              if (project) {
                await storage.saveJob({
                  id: `${project.id}-${id}`,
                  projectId: project.id,
                  sceneId: id,
                  type: 'video',
                  status: 'running',
                  progress: 0,
                  startedAt: new Date().toISOString(),
                  metadata: { taskId, model },
                });
              }
            },
            signal: controller.signal,
          },
        );

        const versionId = nanoid();
        const project = useProjectStore.getState().getCurrentProject();
        set((s) => {
          if (!s.sceneMap[id]) return;
          const sc = s.sceneMap[id];
          sc.status = 'completed';
          sc.generationProgress = 100;
          sc.generationStartedAt = undefined;
          sc.generationTaskId = undefined;
          sc.generationModel = undefined;
          sc.generationModels = undefined;
          sc.generationError = undefined;
          sc.generatedStartFrameUrl = result.startFrameUrl;
          sc.generatedEndFrameUrl = result.endFrameUrl;
          sc.startFrameUrl = result.startFrameUrl;
          sc.endFrameUrl = result.endFrameUrl;
          if (result.videoUrl) sc.generatedVideoUrl = result.videoUrl;
          sc.versions.push({
            id: versionId,
            sceneId: id,
            prompt: sc.prompt,
            generatedImageUrl: result.startFrameUrl,
            generatedVideoUrl: result.videoUrl,
            createdAt: new Date().toISOString(),
          });
          s.shownOutputSceneIds[id] = true;
        });
        await persistStoryboard(get);
        persistLayout(get);
        if (allScenesReadyForFinalOutput(get().getScenes())) {
          set((s) => {
            delete s.hiddenNodeIds[finalOutputNodeId];
          });
          persistLayout(get);
        }
        if (project) {
          await storage.saveJob({
            id: `${project.id}-${id}`,
            projectId: project.id,
            sceneId: id,
            type: 'video',
            status: 'completed',
            progress: 100,
            completedAt: new Date().toISOString(),
            outputUrl: result.videoUrl,
            metadata: { taskId: result.taskId, model: result.model },
          });
          await useProjectStore.getState().updateCurrentProject({
            usageEvents: [
              ...(project.usageEvents ?? []),
              {
                id: `usage-video-${id}-${Date.now()}`,
                projectId: project.id,
                sceneId: id,
                model: useSettingsStore.getState().settings.generationModels.videoModel,
                generationType: 'video',
                action: `Generated scene video: ${scene.title}`,
                assetType: 'final_video',
                credits: Math.max(1, Math.ceil(scene.duration / 5)),
                status: 'completed',
                createdAt: new Date().toISOString(),
              },
            ],
          });
        }
      } catch (error) {
        if (batchGenerationCancelled || controller.signal.aborted) {
          return;
        }
        const message = error instanceof SceneGenerationError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Generation failed';
        const canResume = message.includes('timed out') || message.includes('refresh or retry');
        set((s) => {
          if (!s.sceneMap[id]) return;
          s.sceneMap[id].status = canResume ? 'generating' : 'failed';
          s.sceneMap[id].generationError = message;
          if (!canResume) {
            s.sceneMap[id].generationProgress = 0;
            s.sceneMap[id].generationStartedAt = undefined;
            s.sceneMap[id].generationTaskId = undefined;
            s.sceneMap[id].generationModel = undefined;
            s.sceneMap[id].generationModels = undefined;
          }
          s.shownOutputSceneIds[id] = true;
        });
        const project = useProjectStore.getState().getCurrentProject();
        if (project) {
          await storage.saveJob({
            id: `${project.id}-${id}`,
            projectId: project.id,
            sceneId: id,
            type: 'video',
            status: canResume ? 'running' : 'failed',
            progress: get().sceneMap[id]?.generationProgress ?? 0,
            error: message,
            metadata: {
              taskId: get().sceneMap[id]?.generationTaskId,
              model: get().sceneMap[id]?.generationModel,
            },
          });
        }
        await persistStoryboard(get);
        persistLayout(get);
      } finally {
        clearGenerationAbortController(id);
      }
    },

    generateAllScenes: async () => {
      if (get().isGeneratingAll) return;

      const pending = get().getScenes().filter(sceneNeedsGeneration);
      if (pending.length === 0) return;

      batchGenerationCancelled = false;
      set((s) => { s.isGeneratingAll = true; });

      try {
        await Promise.all(pending.map((sc) => get().generateScene(sc.id)));
      } finally {
        set((s) => { s.isGeneratingAll = false; });
      }
    },

    cancelAllGenerations: async () => {
      batchGenerationCancelled = true;
      abortAllGenerationControllers();

      set((s) => {
        s.isGeneratingAll = false;
        for (const sceneId of s.sceneOrder) {
          const sc = s.sceneMap[sceneId];
          if (!sc) continue;
          if (!['generating', 'queued', 'regenerating'].includes(sc.status)) continue;

          const hadOutput = sceneHasGeneratedOutput(sc);
          if (hadOutput) {
            sc.status = 'completed';
          } else {
            sc.status = 'idle';
            s.hiddenNodeIds[outputNodeId(sceneId)] = true;
            delete s.shownOutputSceneIds[sceneId];
          }
          sc.generationProgress = undefined;
          sc.generationStartedAt = undefined;
          sc.generationTaskId = undefined;
          sc.generationModel = undefined;
          sc.generationModels = undefined;
          sc.generationError = undefined;
        }
        s.hiddenNodeIds[finalOutputNodeId] = true;
      });

      persistLayout(get);
      await persistStoryboard(get);

      const project = useProjectStore.getState().getCurrentProject();
      if (project) {
        const jobs = await storage.getJobs(project.id);
        for (const job of jobs) {
          const record = job as { id: string; status: string };
          if (record.status === 'running') {
            await storage.saveJob({
              ...job,
              status: 'cancelled',
              error: 'Cancelled by user',
            });
          }
        }
      }

      batchGenerationCancelled = false;
    },

    clearSceneOutput: async (id) => {
      set((s) => {
        if (!s.sceneMap[id]) return;
        const sc = s.sceneMap[id];
        sc.status = 'idle';
        sc.generationProgress = undefined;
        sc.generationStartedAt = undefined;
        sc.generationTaskId = undefined;
        sc.generationModel = undefined;
        sc.generationModels = undefined;
        sc.generationError = undefined;
        sc.generatedStartFrameUrl = undefined;
        sc.generatedEndFrameUrl = undefined;
        sc.generatedVideoUrl = undefined;
        sc.generatedAudioUrl = undefined;
        s.hiddenNodeIds[outputNodeId(id)] = true;
        delete s.shownOutputSceneIds[id];
      });
      await persistStoryboard(get);
      persistLayout(get);
    },

    retrySceneGeneration: async (id) => {
      const scene = get().sceneMap[id];
      if (!scene) return;
      if ((scene.status === 'generating' || scene.status === 'queued') && !scene.generationTaskId) return;
      if (scene.generationTaskId) {
        await get().generateScene(id, { resume: true });
        return;
      }
      await get().generateScene(id);
    },

    resumePendingGenerations: async () => {
      const interrupted = get().getScenes().filter(
        (sc) =>
          sc.status === 'generating' ||
          sc.status === 'regenerating' ||
          sc.status === 'queued' ||
          (sc.generationTaskId && sc.status !== 'completed'),
      );
      if (interrupted.length === 0) return;

      for (const sc of interrupted) {
        set((s) => {
          if (s.sceneMap[sc.id]) {
            delete s.hiddenNodeIds[outputNodeId(sc.id)];
            s.shownOutputSceneIds[sc.id] = true;
            s.hiddenNodeIds[finalOutputNodeId] = true;
          }
        });
      }
      persistLayout(get);

      await Promise.all(
        interrupted.map((sc) => get().generateScene(sc.id, { resume: true })),
      );
    },

    resumePendingMotionControls: async () => {
      const interrupted = get().motionControls.filter(
        (motion) =>
          (motion.status === 'generating' || motion.status === 'queued') &&
          Boolean(motion.taskId) &&
          !motion.outputUrl,
      );
      if (interrupted.length === 0) return;

      await Promise.all(
        interrupted.map((motion) => get().generateMotionControl(motion.id, { resume: true })),
      );
    },

    updateScenePrompt: (id, newPrompt) => {
      set((s) => {
        if (s.sceneMap[id]) {
          s.sceneMap[id].prompt = newPrompt;
        }
      });
    },

    getScene: (id) => get().sceneMap[id],
    getScenes: () => get().sceneOrder.map((id) => get().sceneMap[id]).filter(Boolean),
    getTotalDuration: () => {
      const scenes = get().getScenes();
      return scenes.length > 0 ? scenes[scenes.length - 1].endTime : 0;
    },

    buildFromStoryboard: (scenes) => {
      // Merge approved per-second script beats into scene fields so the
      // workflow's Script nodes start populated with the locked script.
      const project = useProjectStore.getState().getCurrentProject();
      const script = project?.videoScript;
      const mergedScenes = script?.approvalStatus === 'approved' && script.scenes.length
        ? scenes.map((sc, idx) => {
            const scriptScene = script.scenes[idx] || script.scenes.find((ss) => ss.id === sc.id);
            if (!scriptScene) return sc;
            const beatLines = scriptScene.beats
              .map((b) => `${b.second + 1}s: ${b.action}${b.dialogue ? ` — "${b.dialogue}"` : ''}${b.behavior ? ` (${b.behavior})` : ''}${b.camera ? ` [cam: ${b.camera}]` : ''}`)
              .join('\n');
            return {
              ...sc,
              sceneGoal: scriptScene.goal || sc.sceneGoal,
              sceneDescription: scriptScene.goal || sc.sceneDescription || sc.prompt,
              actionDescription: beatLines || sc.actionDescription,
              narration: scriptScene.narration || sc.narration,
              mood: scriptScene.mood || sc.mood,
              visualStyle: scriptScene.visualNotes || sc.visualStyle,
            };
          })
        : scenes;

      set((s) => {
        s.sceneMap = {};
        s.noteNodes = [];
        s.motionControls = [];
        s.inputNodes = [];
        s.workflowConnections = [];
        s.sceneOrder = mergedScenes.map((sc) => {
          s.sceneMap[sc.id] = sc;
          return sc.id;
        });
        syncOutputNodeVisibility(s);
      });
      persistLayout(get);
    },

    clearGraph: () => {
      set((s) => {
        s.sceneMap = {};
        s.sceneOrder = [];
        s.noteNodes = [];
        s.motionControls = [];
        s.inputNodes = [];
        s.workflowConnections = [];
        s.hiddenNodeIds = {};
        s.shownOutputSceneIds = {};
        s.nodePositions = {};
        s.nodeColorStyles = {};
        syncOutputNodeVisibility(s);
      });
      persistLayout(get);
    },

    hydrateFromProject: async (projectId, scenes) => {
      const saved = loadLayoutFromStorage(projectId);
      set((s) => {
        s.layoutProjectId = projectId;
        s.sceneMap = {};
        s.sceneOrder = scenes.map((sc) => {
          s.sceneMap[sc.id] = sc;
          return sc.id;
        });
        s.nodePositions = saved?.positions ?? {};
        s.nodeColorStyles = saved?.nodeColors ?? {};
        s.noteNodes = saved?.notes ?? [];
        s.motionControls = saved?.motionControls ?? [];
        s.inputNodes = saved?.inputs ?? [];
        s.workflowConnections = saved?.connections ?? [];
        s.hiddenNodeIds = Object.fromEntries(
          (saved?.hiddenNodes ?? []).map((id) => [id, true as const]),
        );
        s.shownOutputSceneIds = Object.fromEntries(
          (saved?.shownOutputs ?? []).map((id) => [id, true as const]),
        );
        syncOutputNodeVisibility(s);
      });
      persistLayout(get);
      await get().resumePendingGenerations();
      await get().resumePendingMotionControls();
    },

    importWorkflowSnapshot: (snapshot) => {
      const importedScenes = Array.isArray(snapshot.scenes) ? snapshot.scenes : [];
      const layout = snapshot.layout && typeof snapshot.layout === 'object' ? snapshot.layout : {};
      const positions = layout.positions && typeof layout.positions === 'object' && !Array.isArray(layout.positions)
        ? layout.positions
        : {};
      const nodeColors = layout.nodeColors && typeof layout.nodeColors === 'object' && !Array.isArray(layout.nodeColors)
        ? layout.nodeColors
        : {};
      const hiddenNodes = Array.isArray(layout.hiddenNodes) ? layout.hiddenNodes : [];
      const shownOutputs = Array.isArray(layout.shownOutputs) ? layout.shownOutputs : [];
      set((s) => {
        s.sceneMap = {};
        s.sceneOrder = importedScenes.map((scene) => {
          s.sceneMap[scene.id] = scene;
          return scene.id;
        });
        s.nodePositions = positions;
        s.nodeColorStyles = nodeColors;
        s.noteNodes = Array.isArray(snapshot.notes) ? snapshot.notes : [];
        s.motionControls = Array.isArray(snapshot.motionControls) ? snapshot.motionControls : [];
        s.inputNodes = Array.isArray(snapshot.inputs) ? snapshot.inputs : [];
        s.workflowConnections = Array.isArray(snapshot.connections) ? snapshot.connections : [];
        s.hiddenNodeIds = Object.fromEntries(
          hiddenNodes.map((id) => [id, true as const]),
        );
        s.shownOutputSceneIds = Object.fromEntries(
          shownOutputs.map((id) => [id, true as const]),
        );
        syncOutputNodeVisibility(s);
      });
      persistLayout(get);
      void persistStoryboard(get);
    },

    loadLayoutForProject: (projectId) => {
      const saved = loadLayoutFromStorage(projectId);
      set((s) => {
        s.layoutProjectId = projectId;
        s.nodePositions = saved?.positions ?? {};
        s.nodeColorStyles = saved?.nodeColors ?? {};
        s.noteNodes = saved?.notes ?? [];
        s.motionControls = saved?.motionControls ?? [];
        s.inputNodes = saved?.inputs ?? [];
        s.workflowConnections = saved?.connections ?? [];
        s.hiddenNodeIds = Object.fromEntries(
          (saved?.hiddenNodes ?? []).map((id) => [id, true as const]),
        );
        s.shownOutputSceneIds = Object.fromEntries(
          (saved?.shownOutputs ?? []).map((id) => [id, true as const]),
        );
        syncOutputNodeVisibility(s);
      });
      persistLayout(get);
      void get().resumePendingMotionControls();
    },

    setNodePosition: (nodeId, position) => {
      set((s) => {
        s.nodePositions[nodeId] = position;
      });
      persistLayout(get);
    },

    setNodeColorStyle: (nodeId, style) => {
      set((s) => {
        s.nodeColorStyles[nodeId] = {
          ...s.nodeColorStyles[nodeId],
          ...style,
        };
      });
      persistLayout(get);
    },

    resetNodeColorStyle: (nodeId) => {
      set((s) => {
        delete s.nodeColorStyles[nodeId];
      });
      persistLayout(get);
    },

    applyAutoLayout: () => {
      const scenes = get().getScenes();
      const reusableAssets = useProjectStore.getState().getCurrentProject()?.creativePlan?.reusableAssets ?? [];
      const positions = computeAutoLayout(scenes, reusableAssets);
      set((s) => {
        const notePositions = Object.fromEntries(
          [
            ...s.noteNodes.map((note) => note.id),
            ...s.motionControls.flatMap((motion) => [
              `motion-image-${motion.id}`,
              `motion-video-${motion.id}`,
              `motion-prompt-${motion.id}`,
              `motion-control-${motion.id}`,
              `motion-output-${motion.id}`,
            ]),
            ...s.inputNodes.map((input) => input.id),
          ]
            .map((id) => [id, s.nodePositions[id]] as const)
            .filter(([, position]) => Boolean(position)),
        );
        s.nodePositions = { ...positions, ...notePositions };
      });
      persistLayout(get);
    },

    getNodePositions: () => get().nodePositions,
  }))
);

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    flushPersistStoryboard(() => useWorkflowStore.getState());
    persistLayout(() => useWorkflowStore.getState());
  });
}
