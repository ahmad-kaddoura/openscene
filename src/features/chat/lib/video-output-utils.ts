import type { AspectRatio, Project, VideoBrief } from '@/core/types';

const RESOLUTION_BY_LABEL: Record<string, Record<AspectRatio, string>> = {
  '720p': {
    '9:16': '720x1280',
    '1:1': '720x720',
    '16:9': '1280x720',
    '4:5': '720x900',
    'custom': '1280x720',
  },
  '1080p': {
    '9:16': '1080x1920',
    '1:1': '1080x1080',
    '16:9': '1920x1080',
    '4:5': '1080x1350',
    'custom': '1920x1080',
  },
  '1440p': {
    '9:16': '1440x2560',
    '1:1': '1440x1440',
    '16:9': '2560x1440',
    '4:5': '1440x1800',
    'custom': '2560x1440',
  },
  '4K': {
    '9:16': '2160x3840',
    '1:1': '2160x2160',
    '16:9': '3840x2160',
    '4:5': '2160x2700',
    'custom': '3840x2160',
  },
};

export function resolutionLabelFromPixels(resolution: string | undefined): string | undefined {
  if (!resolution) return undefined;
  const normalized = resolution.toLowerCase();
  if (normalized.includes('3840') || normalized.includes('2160')) return '4K';
  if (normalized.includes('2560') || normalized.includes('1440')) return '1440p';
  if (normalized.includes('1920') || normalized.includes('1080')) return '1080p';
  if (normalized.includes('1280') || normalized.includes('720')) return '720p';
  return undefined;
}

export function pixelsFromResolutionLabel(label: string, aspectRatio: AspectRatio): string {
  return RESOLUTION_BY_LABEL[label]?.[aspectRatio] ?? RESOLUTION_BY_LABEL['1080p']['9:16'];
}

export function buildVideoBriefPatch(project: Project, patch: Partial<VideoBrief>): VideoBrief {
  const settings = project.settings;
  return {
    title: project.videoBrief?.title ?? 'Untitled Video',
    description: project.videoBrief?.description ?? '',
    videoType: project.videoBrief?.videoType ?? 'reel',
    targetPlatform: settings.targetPlatform,
    aspectRatio: patch.aspectRatio ?? settings.aspectRatio,
    duration: patch.duration ?? project.videoBrief?.duration ?? 30,
    style: project.videoBrief?.style ?? 'cinematic',
    mood: project.videoBrief?.mood ?? '',
    numberOfScenes: project.videoBrief?.numberOfScenes ?? 4,
    sceneDuration: project.videoBrief?.sceneDuration ?? 7,
    fps: patch.fps ?? settings.fps,
    resolution: patch.resolution ?? settings.resolution,
    outputFormat: settings.outputFormat,
    characterIds: project.videoBrief?.characterIds ?? [],
    captions: project.videoBrief?.captions,
    ...patch,
  };
}
