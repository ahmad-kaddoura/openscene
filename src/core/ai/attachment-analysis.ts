import type { AttachmentAnalysis } from '@/core/types';
import { callQwenChat, type QwenConfig, type QwenMessageContent } from '@/lib/qwen-client';
import type { ResolvedAgent } from '@/core/ai/agents';
import { parsePlannerJson } from '@/core/ai/plan-schema';

/** Cheap stable hash for a data URL so we can cache analyses per image. */
export function hashDataUrl(dataUrl: string): string {
  // Use the first 32 chars of the base64 payload plus length — collisions are
  // fine here since this is only a cache key.
  const comma = dataUrl.indexOf(',');
  const payload = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  let h = 5381;
  const sample = payload.length > 4096 ? payload.slice(0, 4096) : payload;
  for (let i = 0; i < sample.length; i++) {
    h = ((h << 5) + h) ^ sample.charCodeAt(i);
  }
  return `${h.toString(36)}-${payload.length}`;
}

interface RawAnalysis {
  category: AttachmentAnalysis['category'];
  description: string;
  inferredPurpose: string;
  needsClarification?: boolean;
  clarificationQuestion?: string;
}

/** Run the vision analyst on a single image data URL. */
export async function analyzeAttachment(
  config: QwenConfig,
  agent: ResolvedAgent,
  dataUrl: string,
): Promise<AttachmentAnalysis> {
  const userContent: QwenMessageContent = [
    {
      type: 'text',
      text: 'Classify this image and infer its purpose for the video production. Respond with the JSON object only.',
    },
    { type: 'image_url', image_url: { url: dataUrl } },
  ];

  const result = await callQwenChat(
    { ...config, model: agent.modelId },
    [
      { role: 'system', content: agent.systemPrompt },
      { role: 'user', content: userContent },
    ],
    { jsonMode: true, maxTokens: agent.maxTokens, temperature: agent.temperature, model: agent.modelId },
  );

  const parsed = parsePlannerJson(`{"action":"chat","content":${JSON.stringify(result.content)}}`);
  // The vision analyst doesn't return a PlannerResponse; parse its JSON directly.
  let raw: RawAnalysis | null = null;
  try {
    const trimmed = result.content.trim().replace(/^```(?:json)?\s*|\s```$/g, '');
    raw = JSON.parse(trimmed) as RawAnalysis;
  } catch {
    raw = null;
  }
  void parsed;

  const hash = hashDataUrl(dataUrl);
  return {
    url: dataUrl,
    hash,
    category: raw?.category ?? 'other',
    description: raw?.description ?? '',
    inferredPurpose: raw?.inferredPurpose ?? '',
    needsClarification: raw?.needsClarification ?? false,
    clarificationQuestion: raw?.clarificationQuestion,
    analyzedAt: new Date().toISOString(),
  };
}

/**
 * Analyze any newly-attached images that don't already have a cached analysis.
 * Returns the full merged list (existing + new). Images already analyzed are
 * reused — the vision agent never re-runs for the same image.
 */
export async function analyzeNewAttachments(
  config: QwenConfig | null,
  agent: ResolvedAgent | undefined,
  referenceImageUrls: string[],
  existing: AttachmentAnalysis[] | undefined,
): Promise<AttachmentAnalysis[]> {
  const existingByHash = new Map((existing ?? []).map((a) => [a.hash, a]));
  const existingByUrl = new Map((existing ?? []).map((a) => [a.url, a]));
  const result: AttachmentAnalysis[] = [];

  for (const url of referenceImageUrls) {
    const hash = hashDataUrl(url);
    const cached = existingByHash.get(hash) ?? existingByUrl.get(url);
    if (cached) {
      result.push(cached);
      continue;
    }
    if (!config || !agent) {
      // No API configured — record a placeholder analysis so we don't keep retrying.
      result.push({
        url,
        hash,
        category: 'other',
        description: '',
        inferredPurpose: '',
        analyzedAt: new Date().toISOString(),
      });
      continue;
    }
    try {
      const analysis = await analyzeAttachment(config, agent, url);
      result.push(analysis);
    } catch {
      result.push({
        url,
        hash,
        category: 'other',
        description: '',
        inferredPurpose: '',
        analyzedAt: new Date().toISOString(),
      });
    }
  }

  return result;
}
