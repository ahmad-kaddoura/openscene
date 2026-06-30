import { Clapperboard, SlidersHorizontal, FileText, Images, type LucideIcon } from 'lucide-react';

export type WorkflowNodeKind = 'scene' | 'parameters' | 'script' | 'frames';

export type AddNodeOption = {
  kind: WorkflowNodeKind;
  label: string;
  description: string;
  keywords: string[];
  icon: LucideIcon;
  color: string;
};

export const ADD_NODE_OPTIONS: AddNodeOption[] = [
  {
    kind: 'scene',
    label: 'Scene',
    description: 'Main scene — generate video from connected inputs',
    keywords: ['scene', 'video', 'main', 'generate'],
    icon: Clapperboard,
    color: 'text-primary',
  },
  {
    kind: 'parameters',
    label: 'Parameters',
    description: 'Duration, aspect ratio, camera, style, lighting',
    keywords: ['parameters', 'params', 'duration', 'aspect', 'camera', 'input'],
    icon: SlidersHorizontal,
    color: 'text-amber-400',
  },
  {
    kind: 'script',
    label: 'Script',
    description: 'Structured prompt — scene, action, visual style',
    keywords: ['script', 'prompt', 'text', 'story', 'input'],
    icon: FileText,
    color: 'text-violet-400',
  },
  {
    kind: 'frames',
    label: 'Frames',
    description: 'Optional start and end frame images',
    keywords: ['frames', 'start', 'end', 'image', 'input'],
    icon: Images,
    color: 'text-teal-400',
  },
];

export function nodeIdForKind(kind: WorkflowNodeKind, sceneId: string): string {
  switch (kind) {
    case 'scene':
      return sceneId;
    case 'parameters':
      return `parameters-${sceneId}`;
    case 'script':
      return `script-${sceneId}`;
    case 'frames':
      return `frames-${sceneId}`;
  }
}

export function parseAddNodeValue(value: string): { kind: WorkflowNodeKind; sceneId?: string } {
  const [kind, sceneId] = value.split(':') as [WorkflowNodeKind, string | undefined];
  return { kind, sceneId: sceneId || undefined };
}

export function addNodeValue(kind: WorkflowNodeKind, sceneId?: string) {
  return sceneId ? `${kind}:${sceneId}` : kind;
}
