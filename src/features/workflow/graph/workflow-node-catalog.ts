import { Clapperboard, SlidersHorizontal, FileText, Images, StickyNote, WandSparkles, Video, ImageIcon, Pencil, type LucideIcon } from 'lucide-react';

export type WorkflowNodeKind =
  | 'scene'
  | 'parameters'
  | 'script'
  | 'frames'
  | 'note'
  | 'motion-control'
  | 'reference-image'
  | 'reference-video'
  | 'motion-prompt';

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
  {
    kind: 'note',
    label: 'Text (Notes)',
    description: 'Add a freeform sticky note to the canvas',
    keywords: ['text', 'note', 'notes', 'sticky', 'comment', 'annotation'],
    icon: StickyNote,
    color: 'text-yellow-300',
  },
  {
    kind: 'motion-control',
    label: 'Motion Control',
    description: 'Image + reference video + prompt → motion-controlled video',
    keywords: ['motion', 'control', 'kling', 'image', 'video', 'reference', 'qwen'],
    icon: WandSparkles,
    color: 'text-sky-400',
  },
  {
    kind: 'reference-image',
    label: 'Reference Image',
    description: 'Reusable image input for motion, style, or character reference',
    keywords: ['reference', 'image', 'input', 'photo', 'motion'],
    icon: ImageIcon,
    color: 'text-sky-400',
  },
  {
    kind: 'reference-video',
    label: 'Reference Video',
    description: 'Reusable video input for motion or timing reference',
    keywords: ['reference', 'video', 'input', 'motion', 'kling'],
    icon: Video,
    color: 'text-orange-400',
  },
  {
    kind: 'motion-prompt',
    label: 'Motion Prompt',
    description: 'Reusable optional prompt input for motion control',
    keywords: ['motion', 'prompt', 'text', 'input', 'instruction'],
    icon: Pencil,
    color: 'text-purple-400',
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
    case 'note':
      return `note-${sceneId}`;
    case 'motion-control':
      return `motion-control-${sceneId}`;
    case 'reference-image':
      return `reference-image-${sceneId}`;
    case 'reference-video':
      return `reference-video-${sceneId}`;
    case 'motion-prompt':
      return `motion-prompt-${sceneId}`;
  }
}

export function parseAddNodeValue(value: string): { kind: WorkflowNodeKind; sceneId?: string } {
  const [kind, sceneId] = value.split(':') as [WorkflowNodeKind, string | undefined];
  return { kind, sceneId: sceneId || undefined };
}

export function addNodeValue(kind: WorkflowNodeKind, sceneId?: string) {
  return sceneId ? `${kind}:${sceneId}` : kind;
}
