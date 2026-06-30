import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { nanoid } from 'nanoid';
import { storage } from '@/services/storage/indexeddb';
import type {
  Project, ProjectPhase, ProjectStatus, VideoBrief, Storyboard,
  WorkflowGraph, ProjectSettings, Character, Asset, BrandKit,
  GenerationJob, ChatMessage,
} from '@/core/types';
import { DEFAULT_COST_CONTROLS, EXPORT_PRESETS } from '@/core/config';

const CURRENT_PROJECT_KEY = 'videoforge-current-project-id';

function persistCurrentProjectId(id: string | null) {
  if (typeof window === 'undefined') return;
  if (id) {
    localStorage.setItem(CURRENT_PROJECT_KEY, id);
  } else {
    localStorage.removeItem(CURRENT_PROJECT_KEY);
  }
}

interface ProjectState {
  projects: Project[];
  currentProjectId: string | null;
  isLoading: boolean;

  // Actions
  loadProjects: () => Promise<void>;
  createProject: (name: string, description?: string) => Promise<Project>;
  openProject: (id: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  updateProject: (id: string, updates: Partial<Project>) => Promise<void>;

  // Current project helpers
  getCurrentProject: () => Project | undefined;
  updateCurrentProject: (updates: Partial<Project>) => Promise<void>;
  setPhase: (phase: ProjectPhase) => Promise<void>;
  setVideoBrief: (brief: VideoBrief) => Promise<void>;
  setStoryboard: (storyboard: Storyboard) => Promise<void>;
  setWorkflowGraph: (graph: WorkflowGraph) => Promise<void>;
}

export const useProjectStore = create<ProjectState>()(
  immer((set, get) => ({
    projects: [],
    currentProjectId: null,
    isLoading: false,

    loadProjects: async () => {
      set((s) => { s.isLoading = true; });
      try {
        const projects = await storage.getAllProjects();
        set((s) => {
          s.projects = projects as Project[];
          s.isLoading = false;
        });

        const savedId = typeof window !== 'undefined'
          ? localStorage.getItem(CURRENT_PROJECT_KEY)
          : null;
        if (savedId && (projects as Project[]).some((p) => p.id === savedId)) {
          await get().openProject(savedId);
        }
      } catch {
        set((s) => { s.isLoading = false; });
      }
    },

    createProject: async (name, description) => {
      const project: Project = {
        id: nanoid(),
        name,
        description: description || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'draft',
        currentPhase: 'chat',
        settings: {
          aspectRatio: '9:16',
          targetPlatform: 'tiktok',
          fps: 30,
          resolution: '1080x1920',
          outputFormat: 'mp4',
          quality: 'high',
        },
        versions: [],
      };
      await storage.saveProject(project);
      persistCurrentProjectId(project.id);
      set((s) => {
        s.projects.unshift(project);
        s.currentProjectId = project.id;
      });
      return project;
    },

    openProject: async (id) => {
      const project = await storage.getProject(id);
      if (project) {
        persistCurrentProjectId(id);
        set((s) => {
          s.currentProjectId = id;
          const idx = s.projects.findIndex((p) => p.id === id);
          if (idx >= 0) {
            s.projects[idx] = project as Project;
          }
        });
      }
    },

    deleteProject: async (id) => {
      await storage.deleteProject(id);
      set((s) => {
        s.projects = s.projects.filter((p) => p.id !== id);
        if (s.currentProjectId === id) {
          s.currentProjectId = null;
          persistCurrentProjectId(null);
        }
      });
    },

    updateProject: async (id, updates) => {
      const project = get().projects.find((p) => p.id === id);
      if (!project) return;
      const updated = { ...project, ...updates, updatedAt: new Date().toISOString() };
      await storage.saveProject(updated);
      set((s) => {
        const idx = s.projects.findIndex((p) => p.id === id);
        if (idx >= 0) s.projects[idx] = updated as Project;
      });
    },

    getCurrentProject: () => {
      const { projects, currentProjectId } = get();
      return projects.find((p) => p.id === currentProjectId);
    },

    updateCurrentProject: async (updates) => {
      const id = get().currentProjectId;
      if (!id) return;
      await get().updateProject(id, updates);
    },

    setPhase: async (phase) => {
      await get().updateCurrentProject({ currentPhase: phase, status: 'in_progress' });
    },

    setVideoBrief: async (brief) => {
      await get().updateCurrentProject({ videoBrief: brief });
    },

    setStoryboard: async (storyboard) => {
      await get().updateCurrentProject({ storyboard });
    },

    setWorkflowGraph: async (graph) => {
      await get().updateCurrentProject({ workflowGraph: graph });
    },
  }))
);