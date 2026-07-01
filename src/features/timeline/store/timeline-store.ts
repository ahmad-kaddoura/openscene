import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { nanoid } from 'nanoid';
import type { Scene } from '@/core/types';
import {
  type TimelineClip,
  type AudioItem,
  type OverlayElement,
  type OverlayKind,
  type AudioKind,
  type SelectionId,
  type RenderState,
  buildClipsFromScenes,
  clipDuration,
  fakeWaveform,
  AUDIO_COLORS,
  OVERLAY_COLORS,
  CLIP_COLORS,
} from '../lib/types';
import { clamp } from '../lib/format';

const DEFAULT_AUDIO_TRACKS = 2;
const DEFAULT_OVERLAY_TRACKS = 3;

interface TimelineState {
  clips: TimelineClip[];
  audio: AudioItem[];
  overlays: OverlayElement[];
  audioTrackCount: number;
  overlayTrackCount: number;

  /** Playhead position, seconds (project timeline). */
  playhead: number;
  isPlaying: boolean;
  /** Pixels per second (zoom). */
  pixelsPerSecond: number;
  selection: SelectionId;
  captionsEnabled: boolean;
  render: RenderState;

  // Hydration
  hydrateFromScenes: (scenes: Scene[]) => void;
  resetTimeline: () => void;

  // Clip ops
  selectClip: (id: string | null) => void;
  selectAudio: (id: string | null) => void;
  selectOverlay: (id: string | null) => void;
  clearSelection: () => void;
  setSelection: (s: SelectionId) => void;

  reorderClips: (fromId: string, toId: string) => void;
  moveClip: (id: string, direction: -1 | 1) => void;
  trimClip: (id: string, edge: 'start' | 'end', deltaSeconds: number) => void;
  setClipTrim: (id: string, trimStart: number, trimEnd: number) => void;
  splitClip: (id: string, atSeconds: number) => void;
  duplicateClip: (id: string) => void;
  deleteClip: (id: string) => void;
  replaceClipMedia: (id: string, url: string, thumbnail?: string) => void;
  setClipMute: (id: string, muted: boolean) => void;
  setClipVolume: (id: string, vol: number) => void;
  setClipTitle: (id: string, title: string) => void;
  regenerateClip: (id: string) => Promise<void>;

  // Audio ops
  addAudio: (kind: AudioKind, opts?: Partial<AudioItem>) => string;
  updateAudio: (id: string, updates: Partial<AudioItem>) => void;
  trimAudio: (id: string, edge: 'start' | 'end', deltaSeconds: number) => void;
  moveAudio: (id: string, deltaSeconds: number) => void;
  deleteAudio: (id: string) => void;
  addAudioTrack: () => void;

  // Overlay ops
  addOverlay: (kind: OverlayKind, opts?: Partial<OverlayElement>) => string;
  updateOverlay: (id: string, updates: Partial<OverlayElement>) => void;
  trimOverlay: (id: string, edge: 'start' | 'end', deltaSeconds: number) => void;
  moveOverlay: (id: string, deltaSeconds: number) => void;
  duplicateOverlay: (id: string) => void;
  deleteOverlay: (id: string) => void;
  addOverlayTrack: () => void;

  // Captions
  toggleCaptions: (enabled: boolean) => void;
  regenerateCaptions: () => void;
  setCaptionText: (id: string, text: string) => void;

  // Playback
  setPlayhead: (t: number) => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  restart: () => void;

  // Zoom
  setZoom: (pps: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;

  // Render / export
  startRender: () => void;
  cancelRender: () => void;
  resetRender: () => void;
}

const ZOOM_MIN = 12;
const ZOOM_MAX = 240;
const ZOOM_STEP = 1.4;

function nextColor(trackIndex: number, palette: string[]): string {
  return palette[trackIndex % palette.length];
}

export const useTimelineStore = create<TimelineState>()(
  immer((set, get) => ({
    clips: [],
    audio: [],
    overlays: [],
    audioTrackCount: DEFAULT_AUDIO_TRACKS,
    overlayTrackCount: DEFAULT_OVERLAY_TRACKS,
    playhead: 0,
    isPlaying: false,
    pixelsPerSecond: 32,
    selection: null,
    captionsEnabled: true,
    render: { status: 'idle' },

    hydrateFromScenes: (scenes) => {
      const existing = get().clips;
      const existingByScene = new Map(existing.filter((c) => c.sceneId).map((c) => [c.sceneId!, c]));
      const next: TimelineClip[] = scenes.map((scene, idx) => {
        const prev = existingByScene.get(scene.id);
        const fresh = buildClipsFromScenes([scene])[0];
        if (prev) {
          // Preserve user edits, but refresh media + prompt + source duration.
          return {
            ...prev,
            title: `#${idx + 1} ${scene.title}`,
            sourceDuration: Math.max(prev.sourceDuration, scene.duration || 5),
            videoUrl: scene.generatedVideoUrl ?? prev.videoUrl,
            thumbnailUrl: scene.generatedStartFrameUrl ?? scene.startFrameUrl ?? prev.thumbnailUrl,
            prompt: scene.enhancedPrompt || scene.prompt || prev.prompt,
            trimEnd: Math.min(prev.trimEnd, Math.max(prev.sourceDuration, scene.duration || 5)),
          };
        }
        return fresh;
      });
      set((s) => {
        s.clips = next;
      });
    },

    resetTimeline: () => {
      set((s) => {
        s.clips = [];
        s.audio = [];
        s.overlays = [];
        s.playhead = 0;
        s.isPlaying = false;
        s.selection = null;
        s.render = { status: 'idle' };
      });
    },

    selectClip: (id) =>
      set((s) => { s.selection = id ? { type: 'clip', id } : null; }),
    selectAudio: (id) =>
      set((s) => { s.selection = id ? { type: 'audio', id } : null; }),
    selectOverlay: (id) =>
      set((s) => { s.selection = id ? { type: 'overlay', id } : null; }),
    clearSelection: () => set((s) => { s.selection = null; }),
    setSelection: (sel) => set((s) => { s.selection = sel; }),

    reorderClips: (fromId, toId) => {
      if (fromId === toId) return;
      set((s) => {
        const fromIdx = s.clips.findIndex((c) => c.id === fromId);
        const toIdx = s.clips.findIndex((c) => c.id === toId);
        if (fromIdx < 0 || toIdx < 0) return;
        const [moved] = s.clips.splice(fromIdx, 1);
        s.clips.splice(toIdx, 0, moved);
        // Re-apply palette by index so colors stay consistent
        s.clips = s.clips.map((c, idx) => ({ ...c, color: CLIP_COLORS[idx % CLIP_COLORS.length] }));
      });
    },

    moveClip: (id, direction) => {
      set((s) => {
        const idx = s.clips.findIndex((c) => c.id === id);
        if (idx < 0) return;
        const target = idx + direction;
        if (target < 0 || target >= s.clips.length) return;
        const [moved] = s.clips.splice(idx, 1);
        s.clips.splice(target, 0, moved);
        s.clips = s.clips.map((c, i) => ({ ...c, color: CLIP_COLORS[i % CLIP_COLORS.length] }));
      });
    },

    trimClip: (id, edge, deltaSeconds) => {
      set((s) => {
        const c = s.clips.find((cl) => cl.id === id);
        if (!c) return;
        if (edge === 'start') {
          const newStart = clamp(c.trimStart + deltaSeconds, 0, c.trimEnd - 0.3);
          c.trimStart = newStart;
        } else {
          const newEnd = clamp(c.trimEnd + deltaSeconds, c.trimStart + 0.3, c.sourceDuration);
          c.trimEnd = newEnd;
        }
      });
    },

    setClipTrim: (id, trimStart, trimEnd) => {
      set((s) => {
        const c = s.clips.find((cl) => cl.id === id);
        if (!c) return;
        const ts = clamp(trimStart, 0, c.sourceDuration - 0.3);
        const te = clamp(trimEnd, ts + 0.3, c.sourceDuration);
        c.trimStart = ts;
        c.trimEnd = te;
      });
    },

    splitClip: (id, atSeconds) => {
      set((s) => {
        const idx = s.clips.findIndex((c) => c.id === id);
        if (idx < 0) return;
        const c = s.clips[idx];
        const local = clamp(atSeconds, c.trimStart + 0.3, c.trimEnd - 0.3);
        const left: TimelineClip = { ...c, trimEnd: local };
        const right: TimelineClip = {
          ...c,
          id: `clip-${nanoid()}`,
          trimStart: local,
          color: CLIP_COLORS[idx % CLIP_COLORS.length],
        };
        s.clips.splice(idx, 1, left, right);
      });
    },

    duplicateClip: (id) => {
      set((s) => {
        const idx = s.clips.findIndex((c) => c.id === id);
        if (idx < 0) return;
        const orig = s.clips[idx];
        const copy: TimelineClip = {
          ...orig,
          id: `clip-${nanoid()}`,
          title: `${orig.title} (Copy)`,
        };
        s.clips.splice(idx + 1, 0, copy);
        s.clips = s.clips.map((c, i) => ({ ...c, color: CLIP_COLORS[i % CLIP_COLORS.length] }));
      });
    },

    deleteClip: (id) => {
      set((s) => {
        s.clips = s.clips.filter((c) => c.id !== id);
        s.clips = s.clips.map((c, i) => ({ ...c, color: CLIP_COLORS[i % CLIP_COLORS.length] }));
        if (s.selection?.type === 'clip' && s.selection.id === id) s.selection = null;
      });
    },

    replaceClipMedia: (id, url, thumbnail) => {
      set((s) => {
        const c = s.clips.find((cl) => cl.id === id);
        if (!c) return;
        c.videoUrl = url;
        if (thumbnail) c.thumbnailUrl = thumbnail;
      });
    },

    setClipMute: (id, muted) => {
      set((s) => {
        const c = s.clips.find((cl) => cl.id === id);
        if (c) c.muted = muted;
      });
    },

    setClipVolume: (id, vol) => {
      set((s) => {
        const c = s.clips.find((cl) => cl.id === id);
        if (c) c.volume = clamp(vol, 0, 1);
      });
    },

    setClipTitle: (id, title) => {
      set((s) => {
        const c = s.clips.find((cl) => cl.id === id);
        if (c) c.title = title;
      });
    },

    regenerateClip: async (id) => {
      const clip = get().clips.find((c) => c.id === id);
      if (!clip?.sceneId) return;
      // Defer to the workflow store so we reuse existing generation logic.
      const { useWorkflowStore } = await import('@/features/workflow');
      const store = useWorkflowStore.getState();
      await store.clearSceneOutput(clip.sceneId);
      await store.generateScene(clip.sceneId);
    },

    addAudio: (kind, opts) => {
      const id = `audio-${nanoid()}`;
      const usedTracks = new Set(get().audio.map((a) => a.trackIndex));
      let trackIndex = 0;
      for (let i = 0; i < get().audioTrackCount; i++) {
        if (!usedTracks.has(i)) { trackIndex = i; break; }
        trackIndex = i;
      }
      const base: AudioItem = {
        id,
        kind,
        name: opts?.name ?? defaultAudioName(kind),
        start: opts?.start ?? get().playhead ?? 0,
        duration: opts?.duration ?? 6,
        sourceDuration: opts?.sourceDuration ?? opts?.duration ?? 12,
        trimStart: opts?.trimStart ?? 0,
        volume: opts?.volume ?? 0.8,
        url: opts?.url,
        waveform: opts?.waveform ?? fakeWaveform(id),
        trackIndex: opts?.trackIndex ?? trackIndex,
        color: opts?.color ?? AUDIO_COLORS[kind],
      };
      set((s) => { s.audio.push(base); });
      return id;
    },

    updateAudio: (id, updates) => {
      set((s) => {
        const a = s.audio.find((x) => x.id === id);
        if (a) Object.assign(a, updates);
      });
    },

    trimAudio: (id, edge, deltaSeconds) => {
      set((s) => {
        const a = s.audio.find((x) => x.id === id);
        if (!a) return;
        if (edge === 'start') {
          const newTrim = clamp(a.trimStart + deltaSeconds, 0, a.sourceDuration - 0.3);
          const diff = newTrim - a.trimStart;
          a.trimStart = newTrim;
          a.start = Math.max(0, a.start + diff);
          a.duration = clamp(a.duration - diff, 0.3, a.sourceDuration - newTrim);
        } else {
          a.duration = clamp(a.duration + deltaSeconds, 0.3, a.sourceDuration - a.trimStart);
        }
      });
    },

    moveAudio: (id, deltaSeconds) => {
      set((s) => {
        const a = s.audio.find((x) => x.id === id);
        if (!a) return;
        a.start = Math.max(0, a.start + deltaSeconds);
      });
    },

    deleteAudio: (id) => {
      set((s) => {
        s.audio = s.audio.filter((x) => x.id !== id);
        if (s.selection?.type === 'audio' && s.selection.id === id) s.selection = null;
      });
    },

    addAudioTrack: () => set((s) => { s.audioTrackCount += 1; }),

    addOverlay: (kind, opts) => {
      const id = `ovl-${nanoid()}`;
      const usedTracks = new Set(get().overlays.map((o) => o.trackIndex));
      let trackIndex = 0;
      for (let i = 0; i < get().overlayTrackCount; i++) {
        if (!usedTracks.has(i)) { trackIndex = i; break; }
        trackIndex = i;
      }
      const baseDuration = opts?.end !== undefined && opts?.start !== undefined
        ? opts.end - opts.start
        : 3;
      const start = opts?.start ?? get().playhead ?? 0;
      const base: OverlayElement = {
        id,
        kind,
        trackIndex: opts?.trackIndex ?? trackIndex,
        start,
        end: opts?.end ?? start + baseDuration,
        name: opts?.name ?? defaultOverlayName(kind),
        text: opts?.text,
        fontSize: opts?.fontSize ?? 32,
        fontWeight: opts?.fontWeight ?? 600,
        color: opts?.color ?? '#ffffff',
        backgroundColor: opts?.backgroundColor ?? (kind === 'caption' ? 'rgba(0,0,0,0.55)' : 'transparent'),
        position: opts?.position ?? defaultOverlayPosition(kind),
        animation: opts?.animation ?? 'fade',
        url: opts?.url,
        shape: opts?.shape,
        enabled: opts?.enabled ?? true,
      };
      set((s) => { s.overlays.push(base); });
      return id;
    },

    updateOverlay: (id, updates) => {
      set((s) => {
        const o = s.overlays.find((x) => x.id === id);
        if (!o) return;
        Object.assign(o, updates);
      });
    },

    trimOverlay: (id, edge, deltaSeconds) => {
      set((s) => {
        const o = s.overlays.find((x) => x.id === id);
        if (!o) return;
        if (edge === 'start') {
          o.start = clamp(o.start + deltaSeconds, 0, o.end - 0.3);
        } else {
          o.end = Math.max(o.start + 0.3, o.end + deltaSeconds);
        }
      });
    },

    moveOverlay: (id, deltaSeconds) => {
      set((s) => {
        const o = s.overlays.find((x) => x.id === id);
        if (!o) return;
        const dur = o.end - o.start;
        o.start = Math.max(0, o.start + deltaSeconds);
        o.end = o.start + dur;
      });
    },

    duplicateOverlay: (id) => {
      set((s) => {
        const idx = s.overlays.findIndex((o) => o.id === id);
        if (idx < 0) return;
        const orig = s.overlays[idx];
        const copy: OverlayElement = {
          ...orig,
          id: `ovl-${nanoid()}`,
          start: orig.start,
          end: orig.end,
        };
        s.overlays.splice(idx + 1, 0, copy);
      });
    },

    deleteOverlay: (id) => {
      set((s) => {
        s.overlays = s.overlays.filter((o) => o.id !== id);
        if (s.selection?.type === 'overlay' && s.selection.id === id) s.selection = null;
      });
    },

    addOverlayTrack: () => set((s) => { s.overlayTrackCount += 1; }),

    toggleCaptions: (enabled) => set((s) => { s.captionsEnabled = enabled; }),

    regenerateCaptions: () => {
      // Reseed caption overlays from clip prompts as a stand-in for ASR.
      set((s) => {
        const existing = s.overlays.filter((o) => o.kind === 'caption');
        for (const cap of existing) {
          cap.text = cap.text?.endsWith('…') ? cap.text.slice(0, -1) + ' (regenerated)' : cap.text + '…';
        }
      });
    },

    setCaptionText: (id, text) => {
      set((s) => {
        const o = s.overlays.find((x) => x.id === id);
        if (o) { o.text = text; o.name = text.slice(0, 24) || 'Caption'; }
      });
    },

    setPlayhead: (t) => set((s) => { s.playhead = Math.max(0, t); }),
    play: () => set((s) => { s.isPlaying = true; }),
    pause: () => set((s) => { s.isPlaying = false; }),
    togglePlay: () => set((s) => { s.isPlaying = !s.isPlaying; }),
    restart: () => set((s) => { s.playhead = 0; s.isPlaying = true; }),

    setZoom: (pps) => set((s) => { s.pixelsPerSecond = clamp(pps, ZOOM_MIN, ZOOM_MAX); }),
    zoomIn: () => set((s) => { s.pixelsPerSecond = clamp(s.pixelsPerSecond * ZOOM_STEP, ZOOM_MIN, ZOOM_MAX); }),
    zoomOut: () => set((s) => { s.pixelsPerSecond = clamp(s.pixelsPerSecond / ZOOM_STEP, ZOOM_MIN, ZOOM_MAX); }),

    startRender: () => {
      set((s) => { s.render = { status: 'rendering', progress: 0 }; });
      const total = get().clips.reduce((acc, c) => acc + clipDuration(c), 0);
      // Simulated assemble/render. We pace progress roughly with total duration so the
      // UX feels real, but cap it so it doesn't drag on long projects.
      const steps = 24;
      const interval = setInterval(() => {
        const cur = get().render;
        if (cur.status !== 'rendering') { clearInterval(interval); return; }
        const next = Math.min(100, cur.progress + 100 / steps);
        set((s) => {
          if (s.render.status !== 'rendering') return;
          s.render.progress = next;
          if (next >= 100) {
            s.render = {
              status: 'done',
              progress: 100,
              url: `openscene://export/${nanoid()}.mp4`,
            };
            s.isPlaying = false;
          }
        });
      }, 320 + Math.min(180, total * 4));
      // Stash interval on the store via a module-level variable so cancelRender can clear it.
      renderInterval = interval;
    },

    cancelRender: () => {
      if (renderInterval) { clearInterval(renderInterval); renderInterval = null; }
      set((s) => { s.render = { status: 'idle' }; });
    },

    resetRender: () => {
      if (renderInterval) { clearInterval(renderInterval); renderInterval = null; }
      set((s) => { s.render = { status: 'idle' }; });
    },
  }))
);

let renderInterval: ReturnType<typeof setInterval> | null = null;

function defaultAudioName(kind: AudioKind): string {
  switch (kind) {
    case 'music': return 'Background music';
    case 'voiceover': return 'Voiceover';
    case 'sfx': return 'Sound effect';
    case 'uploaded': return 'Uploaded audio';
  }
}

function defaultOverlayName(kind: OverlayKind): string {
  switch (kind) {
    case 'text': return 'Text overlay';
    case 'caption': return 'Caption';
    case 'sticker': return 'Sticker';
    case 'image': return 'Image';
    case 'shape': return 'Shape';
    case 'cta': return 'CTA';
    case 'effect': return 'Effect';
  }
}

function defaultOverlayPosition(kind: OverlayKind): { x: number; y: number } {
  switch (kind) {
    case 'caption': return { x: 50, y: 82 };
    case 'cta': return { x: 50, y: 70 };
    case 'text': return { x: 50, y: 30 };
    default: return { x: 50, y: 50 };
  }
}
