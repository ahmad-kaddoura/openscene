import type { NodeAssistantOperation, NodeContext, Scene, ReusableAssetPlan } from '@/core/types';
import { callQwenChat, type QwenConfig } from '@/lib/qwen-client';
import type { ResolvedAgent } from '@/core/ai/agents';

export interface NodeAssistantResult {
  content: string;
  operations: NodeAssistantOperation[];
}

interface RawNodeAssistantResponse {
  content?: string;
  operations?: NodeAssistantOperation[];
}

/**
 * Build the context payload describing the selected node so the node assistant
 * agent can reason about it. Only includes the fields relevant to the node kind
 * so the payload stays small.
 */
export function buildNodeContextPayload(
  ctx: NodeContext,
  scene: Scene | undefined,
  asset: ReusableAssetPlan | undefined,
  connections: { source: string; sourceHandle?: string; target: string; targetHandle?: string }[],
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    nodeKind: ctx.nodeKind,
    nodeId: ctx.nodeId,
    sceneId: ctx.sceneId,
    motionId: ctx.motionId,
    inputId: ctx.inputId,
    assetId: ctx.assetId,
  };
  if (scene) {
    payload.scene = {
      id: scene.id,
      title: scene.title,
      prompt: scene.prompt,
      sceneGoal: scene.sceneGoal,
      duration: scene.duration,
      cameraMovement: scene.cameraMovement,
      mood: scene.mood,
      visualStyle: scene.visualStyle,
      lighting: scene.lighting,
      details: scene.details,
      avoid: scene.avoid,
      negativePrompt: scene.negativePrompt,
      startFramePrompt: scene.startFramePrompt,
      endFramePrompt: scene.endFramePrompt,
      motionPrompt: scene.motionPrompt,
      startFrameUrl: scene.startFrameUrl,
      endFrameUrl: scene.endFrameUrl,
      assetsUsed: scene.assetsUsed,
    };
  }
  if (asset) {
    payload.asset = {
      id: asset.id,
      name: asset.name,
      type: asset.type,
      description: asset.description,
      referenceImagePrompt: asset.referenceImagePrompt,
      negativePrompt: asset.negativePrompt,
      consistencyNotes: asset.consistencyNotes,
    };
  }
  const related = connections.filter((c) => c.source === ctx.nodeId || c.target === ctx.nodeId);
  if (related.length) {
    payload.connections = related;
  }
  return payload;
}

/**
 * Run the node assistant agent for a single selected node. Returns scoped
 * operations that the client applies via the existing workflow store actions.
 */
export async function runNodeAssistant(
  config: QwenConfig,
  agent: ResolvedAgent,
  ctx: NodeContext,
  userMessage: string,
  payload: Record<string, unknown>,
): Promise<NodeAssistantResult> {
  const userContent = `Selected node context:\n${JSON.stringify(payload, null, 2)}\n\nUser request:\n${userMessage}\n\nRespond with the JSON object only.`;

  let raw: RawNodeAssistantResponse | null = null;
  try {
    const result = await callQwenChat(
      { ...config, model: agent.modelId },
      [
        { role: 'system', content: agent.systemPrompt },
        { role: 'user', content: userContent },
      ],
      { jsonMode: true, maxTokens: agent.maxTokens, temperature: agent.temperature, model: agent.modelId },
    );
    const trimmed = result.content.trim().replace(/^```(?:json)?\s*|\s```$/g, '');
    raw = JSON.parse(trimmed) as RawNodeAssistantResponse;
  } catch {
    raw = null;
  }

  const operations = Array.isArray(raw?.operations) ? raw!.operations : [];
  const content = raw?.content ?? `I'll work on this node now. Tell me if you'd like a different approach.`;
  void ctx;
  return { content, operations };
}
