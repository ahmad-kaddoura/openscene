import { NextRequest, NextResponse } from 'next/server';
import { getQwenConfig, callQwenChat } from '@/lib/qwen-client';
import { resolveAgent } from '@/core/ai/agents';
import type { AgentConfig, AgentType, GenerationModelRouting, PromptOverrides } from '@/core/types';

interface EnhanceRequestBody {
  prompt: string;
  action: 'cinematic' | 'realistic' | 'viral' | 'camera' | 'general';
  sceneTitle?: string;
  sceneGoal?: string;
  agentConfigs?: Record<AgentType, AgentConfig>;
  generationModels?: GenerationModelRouting;
  promptOverrides?: PromptOverrides;
}

const ACTION_LEADS: Record<EnhanceRequestBody['action'], string> = {
  cinematic: 'Make this prompt more cinematic and production-ready',
  realistic: 'Make this prompt more photorealistic and natural',
  viral: 'Optimize this prompt for high-engagement short-form video',
  camera: 'Improve the camera language in this prompt',
  general: 'Enhance this prompt to be more cinematic and production-ready',
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as EnhanceRequestBody;
    const prompt = (body.prompt || '').trim();
    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }
    const config = await getQwenConfig();
    if (!config) {
      return NextResponse.json({ error: 'Qwen API key not configured' }, { status: 503 });
    }
    const agent = resolveAgent('prompt_enhancer', body.agentConfigs, body.generationModels, body.promptOverrides);
    if (!agent.enabled) {
      return NextResponse.json({ error: 'Prompt enhancer agent is disabled' }, { status: 403 });
    }
    const lead = ACTION_LEADS[body.action] || ACTION_LEADS.general;
    const context = body.sceneTitle ? `Scene: ${body.sceneTitle}${body.sceneGoal ? ` — ${body.sceneGoal}` : ''}.` : '';
    const userContent = `${lead}. Return only the rewritten prompt as plain text, no JSON, no markdown fences.\n\n${context}\n\nOriginal prompt:\n${prompt}`;
    const result = await callQwenChat(
      { ...config, model: agent.modelId },
      [
        { role: 'system', content: agent.systemPrompt },
        { role: 'user', content: userContent },
      ],
      { jsonMode: false, maxTokens: 600, temperature: agent.temperature, model: agent.modelId },
    );
    const enhanced = result.content.trim().replace(/^```[a-z]*\s*|\s```$/g, '').trim() || prompt;
    return NextResponse.json({ enhanced, model: agent.modelId });
  } catch (error) {
    console.error('Enhance prompt error:', error);
    return NextResponse.json({ error: 'Failed to enhance prompt' }, { status: 500 });
  }
}
