import {
  parametersNodeId,
  scriptNodeId,
  framesNodeId,
  outputNodeId,
} from './workflow-layout';
import type { NodeContext } from '@/core/types';

/** Resolve the parent scene id from any workflow node id. */
export function sceneIdFromNodeId(nodeId: string, sceneIds: string[]): string | null {
  if (sceneIds.includes(nodeId)) return nodeId;
  if (nodeId.startsWith('parameters-')) return nodeId.slice('parameters-'.length);
  if (nodeId.startsWith('script-')) return nodeId.slice('script-'.length);
  if (nodeId.startsWith('frames-')) return nodeId.slice('frames-'.length);
  if (nodeId.startsWith('output-')) return nodeId.slice('output-'.length);
  return null;
}

export function nodeIdsForScene(sceneId: string): string[] {
  return [
    parametersNodeId(sceneId),
    scriptNodeId(sceneId),
    framesNodeId(sceneId),
    sceneId,
    outputNodeId(sceneId),
  ];
}

export function nodeLabel(nodeType: string | undefined): string {
  switch (nodeType) {
    case 'parameters': return 'Parameters';
    case 'script': return 'Script';
    case 'frames': return 'Frames';
    case 'output': return 'Output';
    case 'scene': return 'Scene';
    case 'asset': return 'Asset';
    case 'note': return 'Text (Notes)';
    case 'imageInput': return 'Image Input';
    case 'videoInput': return 'Video Input';
    case 'promptInput': return 'Prompt Input';
    case 'motionControl': return 'Motion Control';
    case 'motionOutput': return 'Motion Output';
    default: return 'Node';
  }
}

/**
 * Resolve a NodeContext from a React Flow node id + type. Used by the canvas
 * click handler to switch chat into node-scoped mode.
 */
export function resolveNodeContext(
  nodeId: string,
  nodeType: string | undefined,
  sceneIds: string[],
): NodeContext | null {
  const kind = (nodeType as NodeContext['nodeKind']) ?? 'scene';
  const sceneId = sceneIdFromNodeId(nodeId, sceneIds) ?? undefined;
  const motionId = nodeId.startsWith('motion-control-')
    ? nodeId.slice('motion-control-'.length)
    : nodeId.startsWith('motion-image-')
      ? nodeId.slice('motion-image-'.length)
      : nodeId.startsWith('motion-video-')
        ? nodeId.slice('motion-video-'.length)
        : nodeId.startsWith('motion-prompt-')
          ? nodeId.slice('motion-prompt-'.length)
          : nodeId.startsWith('motion-output-')
            ? nodeId.slice('motion-output-'.length)
            : undefined;
  const inputId = nodeId.startsWith('image-input-') || nodeId.startsWith('video-input-') || nodeId.startsWith('prompt-input-')
    ? nodeId
    : undefined;
  const assetId = sceneId ? undefined : nodeId;
  return {
    nodeId,
    nodeKind: kind,
    sceneId,
    motionId,
    inputId,
    assetId: kind === 'asset' ? assetId : undefined,
  };
}
