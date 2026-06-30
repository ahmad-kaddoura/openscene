import type { Scene } from '@/core/types';
import { useSettingsStore } from '@/features/settings/store';
import { CAMERA_MOVEMENTS, STYLE_PRESETS } from '@/core/config';

/** Resolve a camera movement id to a human label. */
export function cameraLabel(scene: Scene): string {
  return (
    CAMERA_MOVEMENTS.find((c) => c.id === scene.cameraMovement)?.name ??
    scene.cameraMovement?.replace(/_/g, ' ') ??
    'static'
  );
}

/** Resolve a style preset id to a human label. */
export function styleLabel(scene: Scene): string {
  return (
    STYLE_PRESETS.find((s) => s.id === scene.stylePreset)?.name ??
    scene.stylePreset?.replace(/_/g, ' ') ??
    'cinematic'
  );
}

/** Fills the prompt template with scene values. */
export function buildScenePrompt(scene: Scene, template: string): string {
  return template
    .replace(/\{\{duration\}\}/g, `${scene.duration}s`)
    .replace(/\{\{aspectRatio\}\}/g, scene.aspectRatio ?? '9:16')
    .replace(/\{\{sceneDescription\}\}/g, scene.sceneDescription ?? scene.prompt ?? '')
    .replace(/\{\{actionDescription\}\}/g, scene.actionDescription ?? '')
    .replace(/\{\{cameraMovement\}\}/g, cameraLabel(scene))
    .replace(/\{\{visualStyle\}\}/g, scene.visualStyle ?? styleLabel(scene))
    .replace(/\{\{lighting\}\}/g, scene.lighting ?? '')
    .replace(/\{\{details\}\}/g, scene.details ?? '')
    .replace(/\{\{avoid\}\}/g, scene.avoid ?? scene.negativePrompt ?? '');
}

/** Read the current template from settings. */
export function useScenePromptTemplate(): string {
  return useSettingsStore((s) => s.settings.scenePromptTemplate);
}
