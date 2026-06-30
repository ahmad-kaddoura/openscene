import dns from 'dns';
import { readEnvFile } from '@/lib/env-file';
import { DEFAULT_QWEN_BASE_URL, isEnvValueConfigured } from '@/core/config/env-keys';

// Local routers often fail to resolve Alibaba Cloud hostnames.
// Fall back to public DNS before any outbound Qwen call.
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
dns.setDefaultResultOrder('ipv4first');

export interface QwenConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export async function getQwenConfig(): Promise<QwenConfig | null> {
  const fromFile = await readEnvFile();
  const apiKey = fromFile.QWEN_API_KEY || process.env.QWEN_API_KEY;
  const baseUrl =
    fromFile.QWEN_BASE_URL ||
    process.env.QWEN_BASE_URL ||
    DEFAULT_QWEN_BASE_URL;
  const model = process.env.QWEN_PLANNER_MODEL || 'qwen-plus';

  if (!isEnvValueConfigured(apiKey)) return null;

  return { apiKey: apiKey!.trim(), baseUrl: baseUrl.trim(), model };
}

export type QwenCallError =
  | { kind: 'network'; message: string; hostname?: string }
  | { kind: 'auth'; message: string; status: number }
  | { kind: 'api'; message: string; status: number };

export async function callQwenChat(
  config: QwenConfig,
  messages: { role: string; content: string }[],
  options?: { jsonMode?: boolean; maxTokens?: number; temperature?: number }
): Promise<{ content: string; usage?: { total_tokens?: number } }> {
  const url = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        ...(options?.jsonMode ? { response_format: { type: 'json_object' } } : {}),
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 600,
      }),
    });
  } catch (err) {
    const cause = err instanceof Error && 'cause' in err ? (err.cause as NodeJS.ErrnoException) : null;
    const hostname = (() => {
      try {
        return new URL(config.baseUrl).hostname;
      } catch {
        return undefined;
      }
    })();

    if (cause?.code === 'ENOTFOUND' || cause?.code === 'EAI_AGAIN') {
      throw {
        kind: 'network',
        message: `DNS could not resolve ${hostname ?? 'the Qwen API host'}. Your network/router may be blocking Alibaba Cloud domains. Try switching DNS to 8.8.8.8 or 1.1.1.1 in System Settings, or copy the exact Base URL from the bottom of home.qwencloud.com/api-keys.`,
        hostname,
      } satisfies QwenCallError;
    }

    throw {
      kind: 'network',
      message: err instanceof Error ? err.message : 'Network request failed',
      hostname,
    } satisfies QwenCallError;
  }

  if (response.status === 401 || response.status === 403) {
    const body = await response.text().catch(() => '');
    throw {
      kind: 'auth',
      status: response.status,
      message: `API key rejected (${response.status}). Copy the key again from home.qwencloud.com/api-keys and make sure the Base URL on that page matches what's in Settings → API Keys.`,
    } satisfies QwenCallError;
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw {
      kind: 'api',
      status: response.status,
      message: body.slice(0, 200) || `Qwen API error ${response.status}`,
    } satisfies QwenCallError;
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content ?? '';
  return { content, usage: data?.usage };
}
