import {
  parametersNodeId,
  scriptNodeId,
  framesNodeId,
  outputNodeId,
} from './workflow-layout';

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
    case 'motionImage': return 'Reference Image';
    case 'motionVideo': return 'Reference Video';
    case 'motionPrompt': return 'Motion Prompt';
    case 'motionControl': return 'Motion Control';
    default: return 'Node';
  }
}
