import type { CreativeWorkflowPlan, PromptOverrides, Scene, ReusableAssetPlan } from '@/core/types';
import { callQwenChat, type QwenConfig } from '@/lib/qwen-client';
import type { ResolvedAgent } from '@/core/ai/agents';
import { resolvePrompt } from '@/core/prompts';

export interface ConsistencyFinding {
  id: string;
  field: 'startFramePrompt' | 'endFramePrompt' | 'referenceImagePrompt' | 'motionPrompt';
  rewrittenPrompt: string;
}

export interface ConsistencyReviewResult {
  rewritten: ConsistencyFinding[];
  findings: string[];
}

interface RawConsistencyReview {
  rewrittenPrompts?: Array<{ id: string; prompt: string; field: ConsistencyFinding['field'] }>;
  findings?: string[];
}

/**
 * Run the consistency-checker agent over a batch of generation prompts and the
 * plan's consistency references. Returns rewritten prompts and short findings
 * that can be surfaced in chat.
 */
export async function runConsistencyCheck(
  config: QwenConfig,
  agent: ResolvedAgent,
  plan: CreativeWorkflowPlan,
  scenes: Scene[],
  assets: ReusableAssetPlan[],
  promptOverrides: PromptOverrides | undefined,
): Promise<ConsistencyReviewResult> {
  const refs = plan.consistencyReferences
    .map((r) => `${r.name} (${r.type}): ${r.consistencyNotes}`)
    .join('\n');

  const batch = [
    ...assets.map((a) => ({
      id: a.id,
      field: 'referenceImagePrompt' as const,
      prompt: a.referenceImagePrompt,
    })),
    ...scenes.flatMap((s) => [
      { id: `${s.id}-start`, field: 'startFramePrompt' as const, prompt: framePrompt(s, 'start', plan, promptOverrides) },
      { id: `${s.id}-end`, field: 'endFramePrompt' as const, prompt: framePrompt(s, 'end', plan, promptOverrides) },
    ]),
  ];

  const userContent = `Consistency references:\n${refs || 'None'}\n\nPrompts to review and rewrite:\n${JSON.stringify(batch)}`;

  let raw: RawConsistencyReview | null = null;
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
    raw = JSON.parse(trimmed) as RawConsistencyReview;
  } catch {
    raw = null;
  }

  const rewritten: ConsistencyFinding[] = (raw?.rewrittenPrompts ?? [])
    .filter((r) => r && r.id && r.prompt)
    .map((r) => ({ id: r.id, field: r.field, rewrittenPrompt: r.prompt }));

  return {
    rewritten,
    findings: raw?.findings ?? [],
  };
}

/**
 * Optional post-generation check: compare a scene's generated start and end
 * frames against the reference asset image and flag mismatches. Best-effort —
 * never blocks the flow. Returns short findings the client can surface in the
 * frames card with a one-click regenerate.
 */
export async function runPostGenerationFrameCheck(
  config: QwenConfig,
  agent: ResolvedAgent,
  scene: Scene,
  referenceImageUrl?: string,
): Promise<{ findings: string[]; mismatch: boolean }> {
  if (!scene.startFrameUrl || !scene.endFrameUrl) {
    return { findings: [], mismatch: false };
  }
  const parts: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = [
    { type: 'text', text: 'Compare these frames for identity/product/brand consistency. Respond with JSON only: {"mismatch": true|false, "findings": ["short note", ...]}' },
  ];
  if (referenceImageUrl) parts.push({ type: 'image_url', image_url: { url: referenceImageUrl } });
  parts.push({ type: 'image_url', image_url: { url: scene.startFrameUrl } });
  parts.push({ type: 'image_url', image_url: { url: scene.endFrameUrl } });

  try {
    const result = await callQwenChat(
      { ...config, model: agent.modelId },
      [
        { role: 'system', content: agent.systemPrompt },
        { role: 'user', content: parts },
      ],
      { jsonMode: true, maxTokens: 512, temperature: 0.2, model: agent.modelId },
    );
    const trimmed = result.content.trim().replace(/^```(?:json)?\s*|\s```$/g, '');
    const parsed = JSON.parse(trimmed) as { mismatch?: boolean; findings?: string[] };
    return {
      findings: Array.isArray(parsed.findings) ? parsed.findings : [],
      mismatch: Boolean(parsed.mismatch),
    };
  } catch {
    return { findings: [], mismatch: false };
  }
}

function framePrompt(scene: Scene, kind: 'start' | 'end', plan: CreativeWorkflowPlan, promptOverrides?: PromptOverrides): string {
  const assetNotes = plan.reusableAssets
    .filter((asset) => scene.assetsUsed?.includes(asset.id))
    .map((asset) => `${asset.name}: ${asset.description}. ${asset.consistencyNotes}`)
    .join('\n');
  const referenceNotes = (plan.consistencyReferences ?? [])
    .filter((ref) => ref.reusePolicy === 'always' || ref.appliesToSceneIds.includes(scene.id))
    .map((ref) => `${ref.name} (${ref.type}, ${ref.reusePolicy}): ${ref.consistencyNotes}`)
    .join('\n');
  const base = kind === 'start' ? scene.startFramePrompt : scene.endFramePrompt;
  return resolvePrompt(kind === 'start' ? 'frame.start.consistency' : 'frame.end.consistency', {
    base,
    style: plan.toneAndStyle,
    mode: plan.videoMode,
    continuity: plan.consistencyRequirements.join(' '),
    assets: assetNotes || 'No reusable asset assigned.',
    references: referenceNotes || 'Use project visual direction and scene prompt only.',
    camera: scene.cameraMovement,
    lighting: scene.lighting,
    avoid: scene.negativePrompt || scene.avoid || '',
  }, promptOverrides);
}
