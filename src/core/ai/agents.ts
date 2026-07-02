import type { AgentConfig, AgentType, GenerationModelRouting, PromptOverrides } from '@/core/types';
import { DEFAULT_AGENT_CONFIGS, GENERATION_MODEL_PRESETS } from '@/core/config';
import { getPrompt } from '@/core/prompts';

/**
 * Resolved runtime config for a single agent. The model id comes from the
 * per-agent settings (editable in Settings → Agents), falling back to the
 * generation-effort presets, then the hardcoded defaults.
 */
export interface ResolvedAgent {
  type: AgentType;
  modelId: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  enabled: boolean;
}

/**
 * Maps each agent type to the model field on GenerationModelRouting that should
 * be used as the fallback when the user has not picked a specific model for
 * that agent in Settings → Agents.
 */
const AGENT_FALLBACK_MODEL_FIELD: Partial<Record<AgentType, keyof GenerationModelRouting>> = {
  planner: 'plannerModel',
  chat_planner: 'plannerModel',
  storyboard_writer: 'plannerModel',
  scene_generator: 'plannerModel',
  hook_generator: 'plannerModel',
  voiceover_agent: 'plannerModel',
  caption_agent: 'plannerModel',
  video_assembler: 'plannerModel',
  vision_analyst: 'directorModel',
  consistency_checker: 'plannerModel',
  ai_director: 'directorModel',
  prompt_enhancer: 'plannerModel',
  node_assistant: 'plannerModel',
  image_generator: 'imageModel',
  frame_generator: 'frameModel',
  video_generator: 'videoModel',
};

/**
 * Resolve a single agent's runtime config. Agent configs from settings take
 * precedence; otherwise we pick the matching field from the generation effort
 * preset; otherwise we fall back to the hardcoded DEFAULT_AGENT_CONFIGS.
 */
export function resolveAgent(
  type: AgentType,
  agentConfigs: Record<AgentType, AgentConfig> | undefined,
  generationModels: GenerationModelRouting | undefined,
  promptOverrides: PromptOverrides | undefined,
): ResolvedAgent {
  const fromSettings = agentConfigs?.[type];
  const fallbackField = AGENT_FALLBACK_MODEL_FIELD[type];
  const fallbackModel = fallbackField
    ? generationModels?.[fallbackField]
    : undefined;
  const defaultModel =
    fallbackModel ?? generationModels?.plannerModel ?? GENERATION_MODEL_PRESETS.high.plannerModel;

  const base: AgentConfig = fromSettings ?? DEFAULT_AGENT_CONFIGS[type];
  const modelId = base.modelId || defaultModel;
  const systemPrompt = getPrompt(
    base.systemPrompt ? `agent.${type}.system` : `agent.${type}.system`,
    promptOverrides,
  ) || base.systemPrompt || DEFAULT_AGENT_CONFIGS[type].systemPrompt;

  return {
    type,
    modelId,
    temperature: base.temperature,
    maxTokens: base.maxTokens,
    systemPrompt,
    enabled: base.enabled,
  };
}

/** Resolve every registered agent at once. */
export function resolveAllAgents(
  agentConfigs: Record<AgentType, AgentConfig> | undefined,
  generationModels: GenerationModelRouting | undefined,
  promptOverrides: PromptOverrides | undefined,
): Record<AgentType, ResolvedAgent> {
  const all = Object.keys(DEFAULT_AGENT_CONFIGS) as AgentType[];
  return all.reduce(
    (acc, type) => {
      acc[type] = resolveAgent(type, agentConfigs, generationModels, promptOverrides);
      return acc;
    },
    {} as Record<AgentType, ResolvedAgent>,
  );
}

/** Build the messages array for a single agent call with overrides. */
export function buildAgentMessages(
  agent: ResolvedAgent,
  userContent: string,
  extraSystem?: string,
): { role: string; content: string }[] {
  const system = extraSystem ? `${agent.systemPrompt}\n\n${extraSystem}` : agent.systemPrompt;
  return [
    { role: 'system', content: system },
    { role: 'user', content: userContent },
  ];
}
