/** Qwen Cloud Pay-As-You-Go → OpenAI Compatible (home.qwencloud.com/api-keys) */
export const DEFAULT_QWEN_BASE_URL =
  'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';

export interface EnvKeyGroup {
  id: string;
  label: string;
  description: string;
  apiKey: string;
  baseUrl: string;
  defaultBaseUrl: string;
}

export const ENV_KEY_GROUPS: EnvKeyGroup[] = [
  {
    id: 'qwen',
    label: 'Qwen Cloud',
    description: 'Powers chat agents — planning, storyboard, hooks, and AI director.',
    apiKey: 'QWEN_API_KEY',
    baseUrl: 'QWEN_BASE_URL',
    defaultBaseUrl: DEFAULT_QWEN_BASE_URL,
  },
  {
    id: 'image',
    label: 'Image Generation',
    description: 'Used by the image and frame generator agents.',
    apiKey: 'IMAGE_GEN_API_KEY',
    baseUrl: 'IMAGE_GEN_BASE_URL',
    defaultBaseUrl: DEFAULT_QWEN_BASE_URL,
  },
  {
    id: 'video',
    label: 'Video Generation',
    description: 'Used by scene and video generator agents.',
    apiKey: 'VIDEO_GEN_API_KEY',
    baseUrl: 'VIDEO_GEN_BASE_URL',
    defaultBaseUrl: DEFAULT_QWEN_BASE_URL,
  },
  {
    id: 'tts',
    label: 'Text-to-Speech',
    description: 'Used by voiceover and caption agents.',
    apiKey: 'TTS_API_KEY',
    baseUrl: 'TTS_BASE_URL',
    defaultBaseUrl: DEFAULT_QWEN_BASE_URL,
  },
];

export const PLACEHOLDER_VALUES = new Set([
  '',
  'TODO_ADD_YOUR_API_KEY',
  'TODO_ADD_YOUR_IMAGE_GEN_KEY',
  'TODO_ADD_YOUR_VIDEO_GEN_KEY',
  'TODO_ADD_YOUR_TTS_KEY',
  'TODO_ADD_YOUR_IMAGE_GEN_BASE_URL',
  'TODO_ADD_YOUR_VIDEO_GEN_BASE_URL',
  'TODO_ADD_YOUR_TTS_BASE_URL',
]);

export function isEnvValueConfigured(value: string | undefined): boolean {
  if (!value) return false;
  return !PLACEHOLDER_VALUES.has(value.trim());
}
