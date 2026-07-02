import dns from 'dns';
import { readEnvFile } from '@/lib/env-file';
import { DEFAULT_QWEN_BASE_URL, isEnvValueConfigured } from '@/core/config/env-keys';
import { MOTION_CONTROL_NEGATIVE_PROMPT } from '@/core/config';

// Local routers often fail to resolve Alibaba Cloud hostnames.
// Fall back to public DNS before any outbound Qwen call.
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
dns.setDefaultResultOrder('ipv4first');

export interface QwenConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  imageModel: string;
  frameModel: string;
  videoModel: string;
  motionControlModel: string;
  directorModel: string;
  effort: 'low' | 'medium' | 'high';
}

export const MOTION_CONTROL_MODEL = 'wan2.2-animate-move';

export async function getQwenConfig(): Promise<QwenConfig | null> {
  const fromFile = await readEnvFile();
  const apiKey = fromFile.QWEN_API_KEY || process.env.QWEN_API_KEY;
  const baseUrl =
    fromFile.QWEN_BASE_URL ||
    process.env.QWEN_BASE_URL ||
    DEFAULT_QWEN_BASE_URL;
  const effort = (process.env.QWEN_GENERATION_EFFORT || 'high') as QwenConfig['effort'];
  const model = process.env.QWEN_PLANNER_MODEL || (effort === 'low' ? 'qwen-turbo' : effort === 'medium' ? 'qwen-plus' : 'qwen-max');
  const imageModel = process.env.QWEN_IMAGE_MODEL || (effort === 'low' ? 'qwen-image' : 'qwen-image-plus');
  const frameModel = process.env.QWEN_FRAME_MODEL || imageModel;
  const videoModel = process.env.QWEN_VIDEO_MODEL || (effort === 'low' ? 'wan2.1-i2v-turbo' : 'wan2.1-i2v-plus');
  const motionControlModel = process.env.QWEN_MOTION_CONTROL_MODEL || MOTION_CONTROL_MODEL;
  const directorModel = process.env.QWEN_DIRECTOR_MODEL || (effort === 'low' ? 'qwen-vl-plus' : 'qwen-vl-max');

  if (!isEnvValueConfigured(apiKey)) return null;

  return {
    apiKey: apiKey!.trim(),
    baseUrl: baseUrl.trim(),
    model,
    imageModel,
    frameModel,
    videoModel,
    motionControlModel,
    directorModel,
    effort,
  };
}

export type QwenCallError =
  | { kind: 'network'; message: string; hostname?: string }
  | { kind: 'auth'; message: string; status: number }
  | { kind: 'api'; message: string; status: number };

/** A chat message part. String for text-only; array for multimodal (vision). */
export type QwenMessageContent =
  | string
  | Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } }
    >;

export async function callQwenChat(
  config: QwenConfig,
  messages: { role: string; content: QwenMessageContent }[],
  options?: { jsonMode?: boolean; maxTokens?: number; temperature?: number; model?: string }
): Promise<{ content: string; usage?: { total_tokens?: number } }> {
  const url = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const model = options?.model || config.model;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model,
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

export async function callQwenImageGeneration(
  config: QwenConfig,
  prompt: string,
  options?: {
    model?: string;
    size?: string;
    negativePrompt?: string;
  }
): Promise<{ url: string; model: string }> {
  const url = `${config.baseUrl.replace(/\/$/, '')}/images/generations`;
  const model = options?.model || config.imageModel;
  const fullPrompt = options?.negativePrompt
    ? `${prompt}\n\nNegative prompt: ${options.negativePrompt}`
    : prompt;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model,
        prompt: fullPrompt,
        n: 1,
        size: options?.size ?? '1024x1792',
        response_format: 'url',
      }),
    });
  } catch (err) {
    const hostname = (() => {
      try {
        return new URL(config.baseUrl).hostname;
      } catch {
        return undefined;
      }
    })();
    throw {
      kind: 'network',
      message: err instanceof Error ? err.message : 'Network request failed',
      hostname,
    } satisfies QwenCallError;
  }

  if (response.status === 401 || response.status === 403) {
    throw {
      kind: 'auth',
      status: response.status,
      message: `Qwen image API key rejected (${response.status}).`,
    } satisfies QwenCallError;
  }

  if (response.status === 404) {
    return callDashScopeImageSynthesis(config, fullPrompt, {
      model,
      size: options?.size ?? '1024x1792',
    });
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw {
      kind: 'api',
      status: response.status,
      message: body.slice(0, 500) || `Qwen image API error ${response.status}`,
    } satisfies QwenCallError;
  }

  const data = await response.json();
  const imageUrl = data?.data?.[0]?.url ||
    (data?.data?.[0]?.b64_json ? `data:image/png;base64,${data.data[0].b64_json}` : '');

  if (!imageUrl) {
    throw {
      kind: 'api',
      status: 502,
      message: 'Qwen image API returned no image URL.',
    } satisfies QwenCallError;
  }

  return { url: imageUrl, model };
}

function dashScopeBaseUrl(baseUrl: string): string {
  return baseUrl
    .replace(/\/compatible-mode\/v1\/?$/, '')
    .replace(/\/v1\/?$/, '')
    .replace(/\/$/, '');
}

function dataUrlByteSize(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  if (comma === -1) return dataUrl.length;
  const base64 = dataUrl.slice(comma + 1);
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

async function uploadDataUrlToDashScope(
  config: QwenConfig,
  dataUrl: string,
  model: string,
): Promise<string> {
  const match = dataUrl.match(/^data:([^;]+);base64,([\s\S]+)$/);
  if (!match) {
    throw {
      kind: 'api',
      status: 400,
      message: 'Invalid media data URL. Re-upload the file and try again.',
    } satisfies QwenCallError;
  }

  const mimeType = match[1];
  const base64 = match[2];
  const buffer = Buffer.from(base64, 'base64');
  const ext = mimeType.split('/')[1]?.split('+')[0] || 'bin';
  const fileName = `motion-${Date.now()}.${ext}`;

  const base = dashScopeBaseUrl(config.baseUrl);
  const policyUrl = `${base}/api/v1/uploads?action=getPolicy&model=${encodeURIComponent(model)}`;
  const policyRes = await fetch(policyUrl, {
    headers: { Authorization: `Bearer ${config.apiKey}` },
  });

  if (!policyRes.ok) {
    const body = await policyRes.text().catch(() => '');
    throw {
      kind: policyRes.status === 401 || policyRes.status === 403 ? 'auth' : 'api',
      status: policyRes.status,
      message: body.slice(0, 500) || `DashScope upload policy error ${policyRes.status}`,
    } satisfies QwenCallError;
  }

  const policyData = (await policyRes.json())?.data;
  if (!policyData?.upload_host || !policyData?.upload_dir) {
    throw {
      kind: 'api',
      status: 502,
      message: 'DashScope upload policy returned incomplete credentials.',
    } satisfies QwenCallError;
  }

  const key = `${policyData.upload_dir}/${fileName}`;
  const form = new FormData();
  form.append('OSSAccessKeyId', policyData.oss_access_key_id);
  form.append('Signature', policyData.signature);
  form.append('policy', policyData.policy);
  form.append('x-oss-object-acl', policyData.x_oss_object_acl);
  form.append('x-oss-forbid-overwrite', policyData.x_oss_forbid_overwrite);
  form.append('key', key);
  form.append('success_action_status', '200');
  form.append('x-oss-content-type', mimeType);
  form.append('file', new Blob([buffer], { type: mimeType }), fileName);

  const uploadRes = await fetch(policyData.upload_host, { method: 'POST', body: form });
  if (!uploadRes.ok) {
    const body = await uploadRes.text().catch(() => '');
    throw {
      kind: 'api',
      status: uploadRes.status,
      message: body.slice(0, 500) || `DashScope media upload failed (${uploadRes.status})`,
    } satisfies QwenCallError;
  }

  return `oss://${key}`;
}

export async function resolveDashScopeMediaUrl(
  config: QwenConfig,
  url: string,
  model: string,
): Promise<string> {
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('oss://')) {
    return url;
  }

  if (url.startsWith('data:')) {
    const isImage = url.startsWith('data:image/');
    const sizeBytes = dataUrlByteSize(url);
    if (isImage && sizeBytes <= 7 * 1024 * 1024) {
      return url;
    }
    return uploadDataUrlToDashScope(config, url, model);
  }

  throw {
    kind: 'api',
    status: 400,
    message: 'Media must be a public http(s) URL or an uploaded file.',
  } satisfies QwenCallError;
}

function dashScopeHeaders(
  config: QwenConfig,
  options?: { async?: boolean; ossResolve?: boolean },
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.apiKey}`,
  };
  if (options?.async) headers['X-DashScope-Async'] = 'enable';
  if (options?.ossResolve) headers['X-DashScope-OssResourceResolve'] = 'enable';
  return headers;
}

async function callDashScopeImageSynthesis(
  config: QwenConfig,
  prompt: string,
  options: { model: string; size: string }
): Promise<{ url: string; model: string }> {
  const base = dashScopeBaseUrl(config.baseUrl);
  const submitUrl = `${base}/api/v1/services/aigc/text2image/image-synthesis`;
  const size = options.size.replace('x', '*');

  const submit = await fetch(submitUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
      'X-DashScope-Async': 'enable',
    },
    body: JSON.stringify({
      model: options.model,
      input: { prompt },
      parameters: {
        size,
        n: 1,
      },
    }),
  });

  if (!submit.ok) {
    const body = await submit.text().catch(() => '');
    throw {
      kind: submit.status === 401 || submit.status === 403 ? 'auth' : 'api',
      status: submit.status,
      message: body.slice(0, 500) || `DashScope image synthesis error ${submit.status}`,
    } satisfies QwenCallError;
  }

  const submitted = await submit.json();
  const taskId = submitted?.output?.task_id || submitted?.task_id;
  if (!taskId) {
    throw {
      kind: 'api',
      status: 502,
      message: 'DashScope image synthesis returned no task id.',
    } satisfies QwenCallError;
  }

  const taskUrl = `${base}/api/v1/tasks/${taskId}`;
  for (let i = 0; i < 36; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const task = await fetch(taskUrl, {
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
    });

    if (!task.ok) {
      const body = await task.text().catch(() => '');
      throw {
        kind: task.status === 401 || task.status === 403 ? 'auth' : 'api',
        status: task.status,
        message: body.slice(0, 500) || `DashScope task polling error ${task.status}`,
      } satisfies QwenCallError;
    }

    const data = await task.json();
    const status = data?.output?.task_status;
    if (status === 'SUCCEEDED') {
      const imageUrl = data?.output?.results?.[0]?.url || data?.output?.result_url;
      if (!imageUrl) {
        throw {
          kind: 'api',
          status: 502,
          message: 'DashScope image task succeeded but returned no image URL.',
        } satisfies QwenCallError;
      }
      return { url: imageUrl, model: options.model };
    }
    if (status === 'FAILED' || status === 'CANCELED' || status === 'UNKNOWN') {
      throw {
        kind: 'api',
        status: 502,
        message: data?.output?.message || `DashScope image task ${status.toLowerCase()}.`,
      } satisfies QwenCallError;
    }
  }

  throw {
    kind: 'api',
    status: 504,
    message: 'DashScope image generation timed out.',
  } satisfies QwenCallError;
}

export async function submitQwenVideoTask(
  config: QwenConfig,
  options: {
    prompt: string;
    startFrameUrl?: string;
    endFrameUrl?: string;
    referenceVideoUrl?: string;
    promptExtend?: boolean;
    model?: string;
  },
): Promise<{ taskId: string; model: string }> {
  const base = dashScopeBaseUrl(config.baseUrl);
  const submitUrl = `${base}/api/v1/services/aigc/video-generation/video-synthesis`;
  const model = options.model || config.videoModel;

  const submit = await fetch(submitUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
      'X-DashScope-Async': 'enable',
    },
    body: JSON.stringify({
      model,
      input: {
        prompt: options.prompt,
        img_url: options.startFrameUrl,
        first_frame_url: options.startFrameUrl,
        ...(options.endFrameUrl ? { last_frame_url: options.endFrameUrl } : {}),
        video_url: options.referenceVideoUrl,
        ref_video_url: options.referenceVideoUrl,
        reference_video_url: options.referenceVideoUrl,
      },
      parameters: {
        resolution: '720P',
        prompt_extend: options.promptExtend ?? true,
      },
    }),
  });

  if (!submit.ok) {
    const body = await submit.text().catch(() => '');
    throw {
      kind: submit.status === 401 || submit.status === 403 ? 'auth' : 'api',
      status: submit.status,
      message: body.slice(0, 500) || `DashScope video synthesis error ${submit.status}`,
    } satisfies QwenCallError;
  }

  const submitted = await submit.json();
  const taskId = submitted?.output?.task_id || submitted?.task_id;
  if (!taskId) {
    throw {
      kind: 'api',
      status: 502,
      message: 'DashScope video synthesis returned no task id.',
    } satisfies QwenCallError;
  }

  return { taskId, model };
}

export async function submitQwenMotionControlTask(
  config: QwenConfig,
  options: {
    imageUrl: string;
    videoUrl: string;
    prompt?: string;
    negative_prompt?: string;
    mode?: 'wan-pro' | 'wan-std';
    model?: string;
  },
): Promise<{ taskId: string; model: string }> {
  const base = dashScopeBaseUrl(config.baseUrl);
  const submitUrl = `${base}/api/v1/services/aigc/image2video/video-synthesis`;
  const model = options.model || MOTION_CONTROL_MODEL;

  const imageUrl = await resolveDashScopeMediaUrl(config, options.imageUrl, model);
  const videoUrl = await resolveDashScopeMediaUrl(config, options.videoUrl, model);
  const needsOssResolve = imageUrl.startsWith('oss://') || videoUrl.startsWith('oss://');

  const submit = await fetch(submitUrl, {
    method: 'POST',
    headers: dashScopeHeaders(config, { async: true, ossResolve: needsOssResolve }),
    body: JSON.stringify({
      model,
      input: {
        image_url: imageUrl,
        video_url: videoUrl,
        ...(options.prompt?.trim() ? { prompt: options.prompt.trim() } : {}),
      },
      parameters: {
        // wan-pro is the higher-fidelity mode (closer to Kling-level motion
        // transfer quality); wan-std trades quality for speed/cost.
        mode: options.mode || 'wan-pro',
        // Disable prompt rewriting so the model uses our prompt exactly as-is,
        // preventing DashScope from injecting driving-video characteristics.
        prompt_extend: false,
        negative_prompt: options.negative_prompt?.trim() || MOTION_CONTROL_NEGATIVE_PROMPT,
      },
    }),
  });

  if (!submit.ok) {
    const body = await submit.text().catch(() => '');
    throw {
      kind: submit.status === 401 || submit.status === 403 ? 'auth' : 'api',
      status: submit.status,
      message: body.slice(0, 500) || `DashScope motion control error ${submit.status}`,
    } satisfies QwenCallError;
  }

  const submitted = await submit.json();
  const taskId = submitted?.output?.task_id || submitted?.task_id;
  if (!taskId) {
    throw {
      kind: 'api',
      status: 502,
      message: 'DashScope motion control returned no task id.',
    } satisfies QwenCallError;
  }

  return { taskId, model };
}

export type QwenVideoTaskPollResult =
  | { status: 'pending' | 'running'; taskId: string }
  | { status: 'succeeded'; taskId: string; url: string; model: string }
  | { status: 'failed'; taskId: string; message: string };

export async function pollQwenVideoTask(
  config: QwenConfig,
  taskId: string,
  model: string,
): Promise<QwenVideoTaskPollResult> {
  const base = dashScopeBaseUrl(config.baseUrl);
  const taskUrl = `${base}/api/v1/tasks/${taskId}`;

  const task = await fetch(taskUrl, {
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
    },
  });

  if (!task.ok) {
    const body = await task.text().catch(() => '');
    throw {
      kind: task.status === 401 || task.status === 403 ? 'auth' : 'api',
      status: task.status,
      message: body.slice(0, 500) || `DashScope video task polling error ${task.status}`,
    } satisfies QwenCallError;
  }

  const data = await task.json();
  const taskStatus = data?.output?.task_status;

  if (taskStatus === 'SUCCEEDED') {
    // `results` is an array for most models (e.g. wan2.1-i2v) but a single
    // object for motion-transfer models like wan2.2-animate-move.
    const results = data?.output?.results;
    const firstResult = Array.isArray(results) ? results[0] : results;
    const videoUrl =
      data?.output?.video_url ||
      firstResult?.video_url ||
      firstResult?.url ||
      data?.output?.result_url;
    if (!videoUrl) {
      throw {
        kind: 'api',
        status: 502,
        message: 'DashScope video task succeeded but returned no video URL.',
      } satisfies QwenCallError;
    }
    return { status: 'succeeded', taskId, url: videoUrl, model };
  }

  if (taskStatus === 'FAILED' || taskStatus === 'CANCELED' || taskStatus === 'UNKNOWN') {
    return {
      status: 'failed',
      taskId,
      message: data?.output?.message || `DashScope video task ${String(taskStatus).toLowerCase()}.`,
    };
  }

  return {
    status: taskStatus === 'RUNNING' ? 'running' : 'pending',
    taskId,
  };
}

export async function callQwenVideoGeneration(
  config: QwenConfig,
  options: {
    prompt: string;
    startFrameUrl?: string;
    endFrameUrl?: string;
    referenceVideoUrl?: string;
    promptExtend?: boolean;
    model?: string;
  },
): Promise<{ url: string; model: string }> {
  const { taskId, model } = await submitQwenVideoTask(config, options);

  for (let i = 0; i < 120; i++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const result = await pollQwenVideoTask(config, taskId, model);
    if (result.status === 'succeeded') {
      return { url: result.url, model: result.model };
    }
    if (result.status === 'failed') {
      throw {
        kind: 'api',
        status: 502,
        message: result.message,
      } satisfies QwenCallError;
    }
  }

  throw {
    kind: 'api',
    status: 504,
    message: 'DashScope video generation timed out.',
  } satisfies QwenCallError;
}
