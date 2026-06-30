import type { Project, Scene, VideoBrief } from '@/core/types';
import { buildVideoBriefPatch } from '@/features/chat/video-output-utils';

export type ChatIntent = 'planning' | 'brainstorm' | 'create_brief' | 'generate_storyboard' | 'hooks' | 'review';

export function detectChatIntent(message: string): ChatIntent | null {
  const m = message.toLowerCase();
  if (m.includes('create brief') || m.includes('create a brief') || m.includes('structured video brief')) {
    return 'create_brief';
  }
  if (m.includes('storyboard') || m.includes('scene breakdown')) {
    return 'generate_storyboard';
  }
  if (m.includes('hook')) return 'hooks';
  if (m.includes('review') || m.includes('director')) return 'review';
  return null;
}

export function extractConceptFromMessages(messages: { role: string; content: string }[]): string {
  return messages
    .filter((m) => m.role === 'user')
    .map((m) => m.content)
    .filter((c) => !/^\d+:\d+|aspect ratio|fps|resolution|\d+ seconds?$/i.test(c))
    .slice(-5)
    .join(' ')
    .trim();
}

export function buildBriefFromProject(
  project: Project,
  conceptHint?: string
): Partial<VideoBrief> {
  const settings = project.settings;
  const existing = project.videoBrief;
  const base = buildVideoBriefPatch(project, {});

  return {
    ...base,
    title: existing?.title || project.name || 'Untitled Video',
    description:
      conceptHint ||
      existing?.description ||
      project.description ||
      'A short-form video based on our planning session.',
    videoType: existing?.videoType || 'reel',
    targetPlatform: settings.targetPlatform,
    aspectRatio: settings.aspectRatio,
    duration: base.duration,
    style: existing?.style || 'cinematic',
    mood: existing?.mood || '',
    numberOfScenes: existing?.numberOfScenes || Math.max(3, Math.min(6, Math.round(base.duration / 7))),
    sceneDuration: existing?.sceneDuration || Math.round(base.duration / 4),
    fps: settings.fps,
    resolution: settings.resolution,
    outputFormat: settings.outputFormat,
    captions: existing?.captions ?? true,
    audience: existing?.audience,
  };
}

export function buildStoryboardScenes(
  brief: Partial<VideoBrief>,
  concept: string,
  referenceImageUrls: string[] = []
): Partial<Scene>[] {
  const count = brief.numberOfScenes || 4;
  const sceneDur = brief.sceneDuration || Math.floor((brief.duration || 30) / count);
  const style = brief.style || 'cinematic';
  const topic = concept || brief.description || 'the product';

  const templates = [
    {
      title: 'Hook — Grab Attention',
      prompt: `Dramatic opening shot for ${topic}, ${style} style, high contrast lighting, immediate visual hook, ${brief.aspectRatio} framing`,
      mood: 'Bold, attention-grabbing',
      cameraMovement: 'slow_push_in' as const,
    },
    {
      title: 'Problem / Context',
      prompt: `Relatable scene establishing the challenge around ${topic}, ${style} aesthetic, natural lighting, authentic feel`,
      mood: 'Relatable, empathetic',
      cameraMovement: 'handheld' as const,
    },
    {
      title: 'Solution / Showcase',
      prompt: `Hero showcase of ${topic}, premium ${style} product shot, dynamic angles, crisp detail, professional commercial quality`,
      mood: 'Confident, impressive',
      cameraMovement: 'orbit' as const,
    },
    {
      title: 'Call to Action',
      prompt: `Closing scene for ${topic}, warm inviting ${style} finish, clear CTA moment, aspirational but achievable`,
      mood: 'Empowering, conclusive',
      cameraMovement: 'dolly_in' as const,
    },
  ];

  let t = 0;
  return Array.from({ length: count }, (_, i) => {
    const tpl = templates[i] || templates[templates.length - 1];
    const start = t;
    const end = t + sceneDur;
    t = end;
    return {
      id: `scene-${i + 1}`,
      order: i,
      title: tpl.title,
      prompt: tpl.prompt,
      startTime: start,
      endTime: end,
      duration: sceneDur,
      cameraMovement: tpl.cameraMovement,
      mood: tpl.mood,
      characters: [],
      props: [],
      transition: i === 0 ? 'fade' : 'cut',
      textOverlays: [],
      referenceImageUrls: referenceImageUrls.slice(0, 3),
      stylePreset: style,
      status: 'idle' as const,
      versions: [],
    };
  });
}

export const BRAINSTORM_SYSTEM_PROMPT = `You are VideoForge's creative director. The user has already locked in video output specs (aspect ratio, duration, resolution, fps).

Now help them brainstorm the video CONCEPT. Ask about:
- What the video is about (product, story, message)
- Target audience and goal
- Visual mood and style references
- Key scenes or moments they imagine

Rules:
- Be conversational and creative. Help them refine ideas, don't just interrogate.
- If they attached reference images, acknowledge them and describe how they could inspire scenes.
- When the concept feels clear, suggest they click "Create Brief" then "Generate Storyboard".
- Keep responses concise (2-3 short paragraphs max).

Respond in plain text markdown, NOT JSON.`;
