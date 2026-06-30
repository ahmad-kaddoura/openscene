import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { nanoid } from 'nanoid';
import { applyNodeChanges, applyEdgeChanges, type OnNodesChange, type OnEdgesChange, type Connection, addEdge } from '@xyflow/react';
import type { Scene, SceneStatus } from '@/core/types';
import { useProjectStore } from '@/features/project/store';

import { generateSceneAssets } from './generate-scene';
import { buildScenePrompt } from './prompt-template';
import { useSettingsStore } from '@/features/settings/store';
import {
  computeAutoLayout,
  loadLayoutFromStorage,
  saveLayoutToStorage,
  outputNodeId,
} from './workflow-layout';
import { nodeIdsForScene, sceneIdFromNodeId } from './workflow-node-utils';
import { nodeIdForKind, type WorkflowNodeKind } from './workflow-node-catalog';

function persistLayout(get: () => WorkflowState) {
  const projectId = get().layoutProjectId;
  if (!projectId) return;
  saveLayoutToStorage(projectId, {
    positions: get().nodePositions,
    hiddenNodes: Object.keys(get().hiddenNodeIds),
  });
}

function persistStoryboard(get: () => WorkflowState) {
  const project = useProjectStore.getState().getCurrentProject();
  if (!project) return;
  const scenes = get().getScenes();
  useProjectStore.getState().setStoryboard({
    id: project.storyboard?.id || nanoid(),
    scenes,
    totalDuration: get().getTotalDuration(),
    narrativeArc: project.storyboard?.narrativeArc || '',
  });
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
  hiddenNodeIds: Record<string, true>;
  layoutProjectId: string | null;

  // Scene CRUD
  addScene: (afterIndex?: number) => void;
  addNodeAt: (kind: WorkflowNodeKind, position: { x: number; y: number }, sceneId?: string) => string;
  removeScene: (id: string) => void;
  removeWorkflowNode: (nodeId: string) => void;
  updateScene: (id: string, updates: Partial<Scene>) => void;
  reorderScenes: (newOrder: string[]) => void;
  duplicateScene: (id: string) => void;

  // Scene status
  setSceneStatus: (id: string, status: SceneStatus) => void;
  generateScene: (id: string) => Promise<void>;
  generateAllScenes: () => Promise<void>;
  clearSceneOutput: (id: string) => void;
  retrySceneGeneration: (id: string) => Promise<void>;
  isGeneratingAll: boolean;

  // AI actions on scenes
  updateScenePrompt: (id: string, newPrompt: string) => void;

  // Helpers
  getScene: (id: string) => Scene | undefined;
  getScenes: () => Scene[];
  getTotalDuration: () => number;
  buildFromStoryboard: (scenes: Scene[]) => void;

  // Layout
  loadLayoutForProject: (projectId: string) => void;
  setNodePosition: (nodeId: string, position: { x: number; y: number }) => void;
  applyAutoLayout: () => void;
  getNodePositions: () => Record<string, { x: number; y: number }>;
}

export const useWorkflowStore = create<WorkflowState>()(
  immer((set, get) => ({
    sceneMap: {},
    sceneOrder: [],
    nodePositions: {},
    hiddenNodeIds: {},
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

      persistStoryboard(get);
    },

    addNodeAt: (kind, position, sceneId) => {
      let sid = sceneId;
      const isNewScene = !sid;

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
        persistStoryboard(get);
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
      });
      const projectId = get().layoutProjectId;
      if (projectId) persistLayout(get);
      persistStoryboard(get);
    },

    removeWorkflowNode: (nodeId) => {
      const sceneId = sceneIdFromNodeId(nodeId, get().sceneOrder);

      set((s) => {
        s.hiddenNodeIds[nodeId] = true;
        delete s.nodePositions[nodeId];
      });

      if (nodeId.startsWith('output-') && sceneId) {
        get().clearSceneOutput(sceneId);
      }

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

    generateScene: async (id) => {
      const scene = get().sceneMap[id];
      if (!scene) return;
      if (scene.status === 'generating' || scene.status === 'regenerating' || scene.status === 'queued') return;

      const template = useSettingsStore.getState().settings.scenePromptTemplate;
      const builtPrompt = buildScenePrompt(scene, template);

      set((s) => {
        if (s.sceneMap[id]) {
          s.sceneMap[id].status = 'generating';
          s.sceneMap[id].generationProgress = 0;
          s.sceneMap[id].enhancedPrompt = builtPrompt;
          delete s.hiddenNodeIds[outputNodeId(id)];
        }
      });

      try {
        const result = await generateSceneAssets(scene, (pct) => {
          set((s) => {
            if (s.sceneMap[id]) {
              s.sceneMap[id].generationProgress = pct;
            }
          });
        });

        const versionId = nanoid();
        set((s) => {
          if (!s.sceneMap[id]) return;
          const sc = s.sceneMap[id];
          sc.status = 'completed';
          sc.generationProgress = 100;
          sc.generatedStartFrameUrl = result.startFrameUrl;
          if (result.videoUrl) sc.generatedVideoUrl = result.videoUrl;
          sc.versions.push({
            id: versionId,
            sceneId: id,
            prompt: sc.prompt,
            generatedImageUrl: result.startFrameUrl,
            generatedVideoUrl: result.videoUrl,
            createdAt: new Date().toISOString(),
          });
        });
        persistStoryboard(get);
      } catch {
        set((s) => {
          if (s.sceneMap[id]) {
            s.sceneMap[id].status = 'failed';
            s.sceneMap[id].generationProgress = 0;
          }
        });
      }
    },

    generateAllScenes: async () => {
      if (get().isGeneratingAll) return;
      set((s) => { s.isGeneratingAll = true; });

      const pending = get().getScenes().filter(
        (sc) => sc.status === 'idle' || sc.status === 'failed' || sc.status === 'queued',
      );

      for (const sc of pending) {
        set((s) => {
          if (s.sceneMap[sc.id]) s.sceneMap[sc.id].status = 'queued';
        });
      }

      for (const sc of pending) {
        await get().generateScene(sc.id);
      }

      set((s) => { s.isGeneratingAll = false; });
    },

    clearSceneOutput: (id) => {
      set((s) => {
        if (!s.sceneMap[id]) return;
        const sc = s.sceneMap[id];
        sc.status = 'idle';
        sc.generationProgress = undefined;
        sc.generatedStartFrameUrl = undefined;
        sc.generatedEndFrameUrl = undefined;
        sc.generatedVideoUrl = undefined;
        sc.generatedAudioUrl = undefined;
      });
      persistStoryboard(get);
    },

    retrySceneGeneration: async (id) => {
      const scene = get().sceneMap[id];
      if (!scene) return;
      if (scene.status === 'generating' || scene.status === 'queued') return;
      await get().generateScene(id);
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
      set((s) => {
        s.sceneMap = {};
        s.sceneOrder = scenes.map((sc) => {
          s.sceneMap[sc.id] = sc;
          return sc.id;
        });
      });
    },

    loadLayoutForProject: (projectId) => {
      const saved = loadLayoutFromStorage(projectId);
      set((s) => {
        s.layoutProjectId = projectId;
        s.nodePositions = saved?.positions ?? {};
        s.hiddenNodeIds = Object.fromEntries(
          (saved?.hiddenNodes ?? []).map((id) => [id, true as const]),
        );
      });
    },

    setNodePosition: (nodeId, position) => {
      set((s) => {
        s.nodePositions[nodeId] = position;
      });
      persistLayout(get);
    },

    applyAutoLayout: () => {
      const scenes = get().getScenes();
      const positions = computeAutoLayout(scenes);
      set((s) => {
        s.nodePositions = positions;
      });
      persistLayout(get);
    },

    getNodePositions: () => get().nodePositions,
  }))
);