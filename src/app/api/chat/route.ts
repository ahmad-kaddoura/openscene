import { NextRequest, NextResponse } from 'next/server';
import { getQwenConfig, callQwenChat, type QwenCallError } from '@/lib/qwen-client';
import type { GenerativeUIComponent } from '@/core/types';

const PLANNER_SYSTEM_PROMPT = `You are VideoForge's video planning assistant. Your job is to help users pick the concrete output specs for their video through a structured 4-step conversation, asking ONE question at a time.

The 4 planning steps are:
1. Aspect Ratio — what shape? (9:16 vertical for TikTok/Reels/Shorts, 1:1 square for Instagram feed, 16:9 widescreen for YouTube, 4:5 portrait)
2. Length / Duration — how long? (15s, 30s, 60s, 90s, or 3 minutes)
3. Resolution — what quality? (720p, 1080p, 4K)
4. Frame Rate — what fps? (24fps cinematic, 30fps standard, 60fps smooth motion)

Rules:
- Ask only ONE step at a time. Never list all 4 questions at once.
- Be warm, concise, and conversational. One short paragraph max.
- When the user answers a step, acknowledge briefly and move to the next step.
- When all 4 steps are answered, tell the user you're ready to create the brief and suggest they click "Create Brief".
- If the user says they don't know, offer 2-3 concrete suggestions to pick from.
- The UI shows a step indicator and tappable option cards for each step, so you don't need to list every option in your reply — just ask the question naturally.

You MUST respond with valid JSON only, no markdown, in this exact shape:
{
  "reply": "your message to the user",
  "step": <current step number, 1-4, or 5 when all answered>,
  "totalSteps": 4,
  "phase": "planning" | "ready"
}

"step" is the step you are CURRENTLY on (the one you're asking about now). When all 4 are answered, set step to 5 and phase to "ready".
"reply" is the text shown to the user. Do not include the step indicator in the reply text — the UI renders that separately.`;

interface QwenResponse {
  reply: string;
  step: number;
  totalSteps: number;
  phase: 'planning' | 'ready';
}

function generativeUIForStep(step: number): GenerativeUIComponent[] | undefined {
  if (step === 1) {
    return [{ type: 'aspect_ratio_selector', data: { options: ['9:16', '1:1', '16:9', '4:5'] } }];
  }
  if (step === 2) {
    return [{
      type: 'duration_selector',
      data: {
        options: [
          { id: 'd-15', label: 'Short', seconds: 15 },
          { id: 'd-30', label: 'Quick', seconds: 30 },
          { id: 'd-60', label: 'Medium', seconds: 60 },
          { id: 'd-90', label: 'Long', seconds: 90 },
          { id: 'd-180', label: 'Extended', seconds: 180 },
        ],
      },
    }];
  }
  if (step === 3) {
    return [{ type: 'resolution_selector', data: { options: ['720p', '1080p', '1440p', '4K'] } }];
  }
  if (step === 4) {
    return [{ type: 'fps_selector', data: { options: [24, 30, 60] } }];
  }
  return undefined;
}

function fallbackReply(step: number): QwenResponse {
  const prompts: Record<number, string> = {
    1: "Let's nail down your video specs. First — what aspect ratio do you want? 9:16 vertical for TikTok/Reels, 1:1 square for Instagram feed, 16:9 for YouTube, or 4:5 portrait?",
    2: "Got the shape. How long should it run? 15s, 30s, 60s, 90s, or up to 3 minutes?",
    3: "Nice. What resolution? 720p is light, 1080p is the standard, 1440p is sharper, 4K is premium.",
    4: "Last one — what frame rate? 24fps for cinematic, 30fps for standard, 60fps for smooth motion.",
    5: "That's everything I need. Click \"Create Brief\" and I'll turn these specs into a structured plan you can edit.",
  };
  return {
    reply: prompts[step] || prompts[1],
    step,
    totalSteps: 4,
    phase: step >= 5 ? 'ready' : 'planning',
  };
}

function fallbackResponse(convo: { role: string; content: string }[], notice: string, errorKind: string) {
  const step = inferStepFromMessages(convo);
  const fb = fallbackReply(step);
  return NextResponse.json({
    content: `${notice}\n\n${fb.reply}`,
    step: fb.step,
    totalSteps: fb.totalSteps,
    phase: fb.phase,
    metadata: { model: 'fallback', error: errorKind },
    generativeUI: generativeUIForStep(fb.step),
  });
}

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();

    const config = await getQwenConfig();

    if (!config) {
      return NextResponse.json({
        content: "Your Qwen API key isn't set yet. Go to **Settings → API Keys**, paste your `sk-` key from [home.qwencloud.com/api-keys](https://home.qwencloud.com/api-keys), then restart the dev server.",
        step: 1,
        totalSteps: 4,
        phase: 'planning',
        metadata: { model: 'unconfigured', needsConfig: true },
        generativeUI: generativeUIForStep(1),
      });
    }

    const convo = (messages || [])
      .filter((m: { role: string; content: string }) => m.role !== 'system' && m.content)
      .map((m: { role: string; content: string }) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      }));

    const payloadMessages = [
      { role: 'system', content: PLANNER_SYSTEM_PROMPT },
      ...convo,
    ];

    let raw: string;
    let tokens: number | undefined;

    try {
      const result = await callQwenChat(config, payloadMessages, { jsonMode: true });
      raw = result.content;
      tokens = result.usage?.total_tokens;
    } catch (err) {
      const qErr = err as QwenCallError;
      console.error('Qwen call failed:', qErr);

      if (qErr.kind === 'network') {
        return fallbackResponse(
          convo,
          `⚠️ **Your API key is saved**, but this machine can't reach Qwen Cloud (${qErr.hostname ?? 'API host'}). This is usually a DNS/network issue, not a bad key.\n\n**Fix:** On Mac → System Settings → Wi‑Fi → Details → DNS, add \`8.8.8.8\` and \`1.1.1.1\`, then restart \`npm run dev\`. Also copy the exact **Base URL** from the bottom of [home.qwencloud.com/api-keys](https://home.qwencloud.com/api-keys) into Settings → API Keys.\n\nContinuing with offline planning for now:`,
          'network'
        );
      }

      if (qErr.kind === 'auth') {
        return fallbackResponse(
          convo,
          `⚠️ Qwen rejected the API key. Re-copy it from [home.qwencloud.com/api-keys](https://home.qwencloud.com/api-keys) and make sure the **Base URL** on that page matches Settings → API Keys. Restart \`npm run dev\` after saving.\n\nContinuing with offline planning:`,
          'auth'
        );
      }

      return fallbackResponse(
        convo,
        `⚠️ Qwen Cloud error: ${qErr.message}. Continuing with offline planning:`,
        'api'
      );
    }

    let parsed: QwenResponse;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          parsed = JSON.parse(match[0]);
        } catch {
          parsed = fallbackReply(inferStepFromMessages(convo));
        }
      } else {
        parsed = {
          reply: raw || fallbackReply(1).reply,
          step: inferStepFromMessages(convo),
          totalSteps: 4,
          phase: 'planning',
        };
      }
    }

    const step = Math.max(1, Math.min(5, Number(parsed.step) || inferStepFromMessages(convo)));
    const totalSteps = Number(parsed.totalSteps) || 4;
    const phase = parsed.phase === 'ready' || step > totalSteps ? 'ready' : 'planning';

    return NextResponse.json({
      content: parsed.reply || fallbackReply(step).reply,
      step,
      totalSteps,
      phase,
      generativeUI: generativeUIForStep(step),
      metadata: { model: config.model, tokens },
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}

function inferStepFromMessages(convo: { role: string; content: string }[]): number {
  const userTurns = convo.filter((m) => m.role === 'user').length;
  return Math.min(5, userTurns + 1);
}
