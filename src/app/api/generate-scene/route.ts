import { NextRequest, NextResponse } from 'next/server';
import {
  getQwenConfig,
  pollQwenVideoTask,
  submitQwenVideoTask,
  type QwenConfig,
} from '@/lib/qwen-client';
import type { GenerationModelRouting } from '@/core/types';

function withGenerationModels(config: QwenConfig, generationModels?: Partial<GenerationModelRouting>): QwenConfig {
  if (!generationModels) return config;
  return {
    ...config,
    model: generationModels.plannerModel || config.model,
    imageModel: generationModels.imageModel || config.imageModel,
    frameModel: generationModels.frameModel || config.frameModel,
    videoModel: generationModels.videoModel || config.videoModel,
    directorModel: generationModels.directorModel || config.directorModel,
    effort: generationModels.effort || config.effort,
  };
}

function errorResponse(error: unknown) {
  const err = error as { status?: number; message?: string; kind?: string };
  return NextResponse.json(
    {
      error: err.message || 'Failed to generate scene video.',
      kind: err.kind,
    },
    { status: err.status && err.status >= 400 ? err.status : 500 },
  );
}

/** Submit a video generation job — returns immediately with a task id. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawConfig = await getQwenConfig();
    if (!rawConfig) {
      return NextResponse.json({ error: 'Qwen API is not configured.' }, { status: 400 });
    }

    const config = withGenerationModels(rawConfig, body.generationModels);
    const { taskId, model } = await submitQwenVideoTask(config, {
      prompt: body.prompt,
      startFrameUrl: body.startFrameUrl,
      endFrameUrl: body.endFrameUrl,
      referenceVideoUrl: body.referenceVideoUrl,
      model: config.videoModel,
    });

    return NextResponse.json({ taskId, model });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Poll a single video generation task — client calls this on an interval. */
export async function GET(req: NextRequest) {
  try {
    const taskId = req.nextUrl.searchParams.get('taskId');
    const model = req.nextUrl.searchParams.get('model');
    if (!taskId) {
      return NextResponse.json({ error: 'taskId is required.' }, { status: 400 });
    }

    const rawConfig = await getQwenConfig();
    if (!rawConfig) {
      return NextResponse.json({ error: 'Qwen API is not configured.' }, { status: 400 });
    }

    const result = await pollQwenVideoTask(rawConfig, taskId, model || rawConfig.videoModel);

    if (result.status === 'succeeded') {
      return NextResponse.json({
        status: 'succeeded',
        taskId: result.taskId,
        videoUrl: result.url,
        model: result.model,
      });
    }

    if (result.status === 'failed') {
      return NextResponse.json({
        status: 'failed',
        taskId: result.taskId,
        error: result.message,
      });
    }

    return NextResponse.json({
      status: result.status,
      taskId: result.taskId,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
