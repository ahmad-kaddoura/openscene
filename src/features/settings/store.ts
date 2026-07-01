import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { AppSettings, AgentType, AgentConfig, ExportPreset, BrandKit, Character, CostControls, GenerationEffort, Scene } from '@/core/types';
import { DEFAULT_AGENT_CONFIGS, DEFAULT_COST_CONTROLS, DEFAULT_GENERATION_MODELS, EXPORT_PRESETS, DEFAULT_SCENE_PROMPT_TEMPLATE, GENERATION_MODEL_PRESETS } from '@/core/config';

interface SettingsState {
  settings: AppSettings;

  // Agent config
  getAgentConfig: (type: AgentType) => AgentConfig;
  updateAgentConfig: (type: AgentType, updates: Partial<AgentConfig>) => void;

  // Export presets
  addExportPreset: (preset: ExportPreset) => void;
  removeExportPreset: (id: string) => void;
  updateExportPreset: (id: string, updates: Partial<ExportPreset>) => void;

  // Cost controls
  updateCostControls: (updates: Partial<CostControls>) => void;

  // Theme
  setTheme: (theme: 'light' | 'dark' | 'system') => void;

  // Defaults
  setDefaultAspectRatio: (ratio: AppSettings['defaultAspectRatio']) => void;
  setDefaultPlatform: (platform: AppSettings['defaultPlatform']) => void;
  setScenePromptTemplate: (template: string) => void;
  resetScenePromptTemplate: () => void;
  setEdgeLabelPlacement: (placement: AppSettings['edgeLabelPlacement']) => void;
  updateCanvasGrid: (updates: Partial<AppSettings['canvasGrid']>) => void;
  setGenerationEffort: (effort: GenerationEffort) => void;
}

const defaultSettings: AppSettings = {
  agentConfigs: DEFAULT_AGENT_CONFIGS,
  exportPresets: EXPORT_PRESETS,
  costControls: DEFAULT_COST_CONTROLS,
  theme: 'dark',
  defaultAspectRatio: '9:16',
  defaultPlatform: 'tiktok',
  defaultFps: 30,
  scenePromptTemplate: DEFAULT_SCENE_PROMPT_TEMPLATE,
  edgeLabelPlacement: 'in-node',
  canvasGrid: {
    enabled: false,
    variant: 'dots',
    gap: 20,
    opacity: 0.22,
  },
  generationModels: DEFAULT_GENERATION_MODELS,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    immer((set, get) => ({
      settings: defaultSettings,

      getAgentConfig: (type) => {
        return get().settings.agentConfigs[type];
      },

      updateAgentConfig: (type, updates) => {
        set((s) => {
          (s.settings.agentConfigs[type] as AgentConfig) = {
            ...s.settings.agentConfigs[type],
            ...updates,
          };
        });
      },

      addExportPreset: (preset) => {
        set((s) => {
          s.settings.exportPresets.push(preset);
        });
      },

      removeExportPreset: (id) => {
        set((s) => {
          s.settings.exportPresets = s.settings.exportPresets.filter((p) => p.id !== id);
        });
      },

      updateExportPreset: (id, updates) => {
        set((s) => {
          const idx = s.settings.exportPresets.findIndex((p) => p.id === id);
          if (idx >= 0) {
            s.settings.exportPresets[idx] = { ...s.settings.exportPresets[idx], ...updates };
          }
        });
      },

      updateCostControls: (updates) => {
        set((s) => {
          Object.assign(s.settings.costControls, updates);
        });
      },

      setTheme: (theme) => {
        set((s) => { s.settings.theme = theme; });
        if (theme === 'dark') {
          document.documentElement.classList.add('dark');
        } else if (theme === 'light') {
          document.documentElement.classList.remove('dark');
        } else {
          if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
        }
      },

      setDefaultAspectRatio: (ratio) => {
        set((s) => { s.settings.defaultAspectRatio = ratio; });
      },

      setDefaultPlatform: (platform) => {
        set((s) => { s.settings.defaultPlatform = platform; });
      },

      setScenePromptTemplate: (template) => {
        set((s) => { s.settings.scenePromptTemplate = template; });
      },

      resetScenePromptTemplate: () => {
        set((s) => { s.settings.scenePromptTemplate = DEFAULT_SCENE_PROMPT_TEMPLATE; });
      },

      setEdgeLabelPlacement: (placement) => {
        set((s) => { s.settings.edgeLabelPlacement = placement; });
      },

      updateCanvasGrid: (updates) => {
        set((s) => {
          s.settings.canvasGrid = {
            ...s.settings.canvasGrid,
            ...updates,
          };
        });
      },

      setGenerationEffort: (effort) => {
        set((s) => {
          s.settings.generationModels = GENERATION_MODEL_PRESETS[effort];
        });
      },
    })),
    {
      name: 'videoforge-settings',
      storage: createJSONStorage(() => localStorage),
      merge: (persisted, current) => {
        const p = persisted as Partial<SettingsState> | undefined;
        return {
          ...current,
          ...p,
          settings: {
            ...current.settings,
            ...p?.settings,
            agentConfigs: {
              ...current.settings.agentConfigs,
              ...p?.settings?.agentConfigs,
            },
            costControls: {
              ...current.settings.costControls,
              ...p?.settings?.costControls,
            },
            canvasGrid: {
              ...current.settings.canvasGrid,
              ...p?.settings?.canvasGrid,
            },
            generationModels: {
              ...current.settings.generationModels,
              ...p?.settings?.generationModels,
            },
          },
        };
      },
    }
  )
);
