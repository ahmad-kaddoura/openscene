import type { PromptLibraryItem, PromptOverrides } from '@/core/types';

export const PROMPT_TEMPLATE_VARIABLES = [
  { token: '{{duration}}', label: 'Duration (e.g. 7s)' },
  { token: '{{aspectRatio}}', label: 'Aspect ratio (e.g. 9:16)' },
  { token: '{{sceneDescription}}', label: 'Scene - subject, location, mood' },
  { token: '{{actionDescription}}', label: 'Action - movement / change' },
  { token: '{{cameraMovement}}', label: 'Camera movement' },
  { token: '{{visualStyle}}', label: 'Visual style' },
  { token: '{{lighting}}', label: 'Lighting' },
  { token: '{{details}}', label: 'Details - textures, colors, atmosphere' },
  { token: '{{avoid}}', label: 'Avoid - negative prompts' },
] as const;

export const DEFAULT_PROMPT_LIBRARY = [
  {
    id: 'planning.chat.system',
    group: 'Planning AI chat',
    name: 'Planning chat system prompt',
    description: 'Controls the early creative conversation and planning behavior.',
    variables: ['referenceCount'],
    defaultValue: `You are OpenScene's creative director — a sharp, warm production partner (think Claude or ChatGPT in a video studio).

Your job is to help the user plan a production-level video through natural conversation BEFORE any assets, frames, or renders are generated.

Conversation rules:
- Match the user's energy. Greetings get a brief, friendly reply — never a script, never a plan, never a card.
- Ask one or two focused questions at a time, not a questionnaire.
- Build understanding progressively: goal → subject → audience → tone → rough length.
- Reflect back what you heard in plain language before proposing anything big.
- When the user has shared enough direction, offer to **draft the full script** (per-second beats, no images) — do not produce the script until they accept.
- Never dump scene lists, asset tables, frames, or approval cards unprompted.
- Do not ask for aspect ratio, duration, platform, fps, resolution, model, or render settings upfront unless the user volunteers them.
- If the user says "skip to workflow" or "go to workflow", acknowledge and let the UI take them there.

Production rules (apply once scripting begins):
- For product videos, do not add human subjects unless the user explicitly asks for people, influencers, hands, models, or UGC.
- If the user provides an image, treat it as the source of truth.
- Preserve product design, packaging, material, color, shape, scale, label placement, and branding.
- For influencer videos, preserve the same face, hair, clothes, body type, identity, and environment.
- Connected scenes must share background, lighting, camera language, visual style, and coherent transitions.
- Write like a real director: natural micro-behaviors, honest eye-lines, breathable pacing. Avoid the "AI look" — no frozen smiles, no robotic gestures, no over-explained dialogue.

Keep replies concise (2–5 short paragraphs max). Use markdown sparingly for emphasis or short lists.

{{referenceNote}}

When the user is ready, tell them you will draft the script next — but only when they have given enough direction or explicitly asked.`,
  },
  {
    id: 'scenario.plan.response',
    group: 'Scenario generation',
    name: 'Plan approval response',
    description: 'Message shown after a scenario plan is created.',
    variables: ['sceneCount', 'assetCount'],
    defaultValue: `Here's your production plan — built from what we discussed. Review the goal, audience, storyline, reusable assets, tone, scene structure, and consistency rules below.

Nothing has been generated yet. When it matches the video you want, approve the plan and I'll generate source-of-truth assets step by step before frames or video.`,
  },
  {
    id: 'planning.script.system',
    group: 'Planning AI chat',
    name: 'Script generation system prompt',
    description: 'Drives the JSON VideoScript generator that runs before any images are produced.',
    variables: ['sceneCount', 'durationSeconds', 'aspectRatio', 'videoMode'],
    defaultValue: `You are a senior video director and scriptwriter for production-level short-form video. The user has agreed on the concept and rough shape; now produce the **full shooting script** before any images are generated.

Return ONLY a JSON object that matches this TypeScript type exactly:

{
  "logline": string,
  "durationSeconds": number,
  "sceneCount": number,
  "narrationStyle": string,
  "scenes": [
    {
      "id": "scene-1",
      "order": 1,
      "title": string,
      "durationSeconds": number,
      "goal": string,
      "narration": string,
      "beats": [
        {
          "second": number,
          "action": string,
          "dialogue"?: string,
          "behavior"?: string,
          "camera"?: string
        }
      ],
      "cameraBehavior": string,
      "mood": string,
      "visualNotes": string
    }
  ]
}

Hard rules:
- Total scenes = {{sceneCount}}, total duration = {{durationSeconds}}s, format = {{aspectRatio}}, mode = {{videoMode}}.
- Each scene's durationSeconds must sum to {{durationSeconds}} across scenes.
- Produce exactly one beat per second inside each scene (beats length === durationSeconds).
- Each beat must describe what the subject DOES, SAYS, and how they BEHAVE that second, plus a camera note. No filler, no clichés.
- Write like a real director aiming for footage that does not look AI: micro-behaviors, natural eye-lines, honest hand movements, breathable pacing. Avoid staged "AI smile", frozen faces, robotic gestures, over-explained dialogue.
- Keep dialogue short and credible for {{aspectRatio}} short-form video.
- Never invent brand logos or readable on-screen text.
- Output JSON only. No prose, no markdown fences.`,
  },
  {
    id: 'planning.script.response',
    group: 'Planning AI chat',
    name: 'Script card intro',
    description: 'Short message shown above the script card before any images are produced.',
    variables: ['sceneCount', 'duration'],
    defaultValue: `Here's the full script — {{sceneCount}} scenes, {{duration}}s — with a beat for every second describing what the character does, says, and how they behave.

No images yet. Read it, edit any beat, and **approve the script**. Then I'll generate the influencer identity, the background, and the start/end frames for every scene in that order.`,
  },
  {
    id: 'scenario.scene.base',
    group: 'Scenario generation',
    name: 'Scene video prompt template',
    description: 'Template used by workflow scene video generation.',
    variables: PROMPT_TEMPLATE_VARIABLES.map((v) => v.token.replace(/[{}]/g, '')),
    defaultValue: `Create a {{duration}} video in {{aspectRatio}}.

Scene:
{{sceneDescription}}

Action:
{{actionDescription}}

Camera:
{{cameraMovement}}

Visual style:
{{visualStyle}}

Lighting:
{{lighting}}

Details:
{{details}}

Avoid:
{{avoid}}`,
  },
  {
    id: 'asset.influencer.reference',
    group: 'Influencer/product asset generation',
    name: 'Influencer identity reference',
    description: 'Prompt for creating a reusable influencer source-of-truth image.',
    variables: ['concept'],
    defaultValue: 'Photorealistic identity reference of the same influencer for {{concept}}, clear face, hairstyle, outfit, body style, natural skin texture, clean creator environment, direct-to-camera look, high detail. Preserve one stable identity for all scenes.',
  },
  {
    id: 'asset.product.reference',
    group: 'Influencer/product asset generation',
    name: 'Product reference',
    description: 'Prompt for creating or refining the reusable product source-of-truth image.',
    variables: ['concept', 'referencePolicy'],
    defaultValue: '{{referencePolicy}} Premium product reference for {{concept}}, preserve product shape, color, label placement, material, scale, distinctive packaging, and brand style. Isolated premium product photography, high detail.',
  },
  {
    id: 'asset.environment.reference',
    group: 'Influencer/product asset generation',
    name: 'Product environment reference',
    description: 'Prompt for product set, lighting, surface, and props.',
    variables: ['concept'],
    defaultValue: 'Photorealistic product set environment for {{concept}}, no people, premium surface, brand-aligned props, controlled reflections, consistent lighting direction, editorial commercial composition, high detail.',
  },
  {
    id: 'asset.background.reference',
    group: 'Influencer/product asset generation',
    name: 'Influencer background reference',
    description: 'Prompt for a reusable influencer location/background.',
    variables: ['concept'],
    defaultValue: 'Photorealistic influencer video background reference for {{concept}}, clean creator environment, consistent vanity or studio lighting, cohesive props, no new character, high detail.',
  },
  {
    id: 'style.visual.direction',
    group: 'Style/brand consistency prompts',
    name: 'Visual direction reference',
    description: 'Prompt for project-wide style, palette, lighting, and lens consistency.',
    variables: ['concept', 'modeLead'],
    defaultValue: '{{modeLead}} visual direction board for {{concept}}, cohesive lighting, palette, lens choice, composition examples, premium AI video production style.',
  },
  {
    id: 'frame.start.consistency',
    group: 'Start frame generation',
    name: 'Start frame consistency',
    description: 'Consistency block appended to start frame prompts.',
    variables: ['base', 'style', 'mode', 'continuity', 'assets', 'references', 'camera', 'lighting', 'avoid'],
    defaultValue: `{{base}}

Style: {{style}}.
Video type: {{mode}}.
Scene continuity: {{continuity}}
Reusable assets to preserve:
{{assets}}
Consistency references:
{{references}}
Camera: {{camera}}. Lighting: {{lighting}}.
Avoid: {{avoid}}

The start frame must feel like the first moment of the same coherent production, not a separate image.`,
  },
  {
    id: 'frame.end.consistency',
    group: 'End frame generation',
    name: 'End frame consistency',
    description: 'Consistency block appended to end frame prompts.',
    variables: ['base', 'style', 'mode', 'continuity', 'assets', 'references', 'camera', 'lighting', 'avoid'],
    defaultValue: `{{base}}

Style: {{style}}.
Video type: {{mode}}.
Scene continuity: {{continuity}}
Reusable assets to preserve:
{{assets}}
Consistency references:
{{references}}
Camera: {{camera}}. Lighting: {{lighting}}.
Avoid: {{avoid}}

The end frame must visually connect to the start frame and create a sensible transition into the next scene.`,
  },
  {
    id: 'video.motion.default',
    group: 'Video generation',
    name: 'Motion control default prompt',
    description: 'Default motion-control prompt for image plus driving video workflows.',
    defaultValue: `Animate the character from the reference image using the motion from the driving video.
Preserve the character's exact appearance, face, outfit, colors, proportions, and style.
Only transfer body pose, gesture, and timing from the video.`,
  },
  {
    id: 'scene.product.start',
    group: 'Start frame generation',
    name: 'Product scene start frame',
    description: 'Template for product-led scene start frames.',
    variables: ['title', 'concept', 'goal'],
    defaultValue: '{{title}} start frame for {{concept}}: {{goal}} Product-first composition with no people, preserving exact product shape, packaging, color, brand style, props, lighting, surface, and environment.',
  },
  {
    id: 'scene.product.end',
    group: 'End frame generation',
    name: 'Product scene end frame',
    description: 'Template for product-led scene end frames.',
    variables: ['title', 'concept'],
    defaultValue: '{{title}} end frame for {{concept}}: show the completed product beat after the action, preserving the same product, props, surface, lighting, camera angle family, and brand style. No people unless explicitly requested.',
  },
  {
    id: 'scene.influencer.start',
    group: 'Start frame generation',
    name: 'Influencer scene start frame',
    description: 'Template for creator-led scene start frames.',
    variables: ['title', 'concept', 'goal'],
    defaultValue: '{{title}} start frame for {{concept}}: {{goal}} Keep the same influencer face, hairstyle, outfit, body style, lighting, environment, and reusable assets.',
  },
  {
    id: 'scene.influencer.end',
    group: 'End frame generation',
    name: 'Influencer scene end frame',
    description: 'Template for creator-led scene end frames.',
    variables: ['title', 'concept'],
    defaultValue: '{{title}} end frame for {{concept}}: show the completed beat after the action, preserving the same influencer identity, face, hairstyle, outfit, body style, lighting, environment, and related assets.',
  },
  {
    id: 'video.product.motion',
    group: 'Video generation',
    name: 'Product motion prompt',
    description: 'Template for product-led scene motion.',
    variables: ['action'],
    defaultValue: 'Animate {{action}} with smooth product-focused camera movement, stable product geometry, consistent props, and no human elements unless explicitly requested.',
  },
  {
    id: 'video.influencer.motion',
    group: 'Video generation',
    name: 'Influencer motion prompt',
    description: 'Template for creator-led scene motion.',
    variables: ['action'],
    defaultValue: 'Animate {{action}} with controlled creator-style movement, stable facial identity, same outfit and background, natural motion, and no sudden camera jumps.',
  },
  {
    id: 'prompt.enhance.cinematic',
    group: 'Prompt enhancement',
    name: 'Make cinematic',
    description: 'Prompt suffix for cinematic enhancement actions.',
    defaultValue: 'dramatic cinematic lighting, shallow depth of field, film grain',
  },
  {
    id: 'prompt.enhance.realistic',
    group: 'Prompt enhancement',
    name: 'Make realistic',
    description: 'Prompt suffix for realistic enhancement actions.',
    defaultValue: 'photorealistic, natural lighting, 4K quality',
  },
  {
    id: 'prompt.enhance.viral',
    group: 'Prompt enhancement',
    name: 'Make viral',
    description: 'Prompt suffix for viral enhancement actions.',
    defaultValue: 'high energy, dynamic, attention-grabbing',
  },
  {
    id: 'prompt.enhance.camera',
    group: 'Prompt enhancement',
    name: 'Improve camera',
    description: 'Prompt suffix for camera enhancement actions.',
    defaultValue: 'smooth professional camera work',
  },
  {
    id: 'negative.motion_control',
    group: 'Negative prompts',
    name: 'Motion control negative prompt',
    description: 'Fallback negative prompt for motion-transfer generation.',
    defaultValue: 'morphing, identity loss, change of face, change of clothes, change of style, distortion, deformation, flickering, artifacts',
  },
  {
    id: 'negative.influencer',
    group: 'Negative prompts',
    name: 'Influencer negative prompt',
    description: 'Default negative prompt for influencer identity and creator scenes.',
    defaultValue: 'different face, different hair, outfit changes, body shape changes, distorted hands, extra fingers, heavy filters, plastic skin, unreadable text, random logos',
  },
  {
    id: 'negative.product',
    group: 'Negative prompts',
    name: 'Product negative prompt',
    description: 'Default negative prompt for product images and product scenes.',
    defaultValue: 'people, faces, hands unless explicitly requested, real trademarked logos, misspelled text, warped packaging, duplicated caps, messy background',
  },
  {
    id: 'negative.product.scene',
    group: 'Negative prompts',
    name: 'Product scene negative prompt',
    description: 'Default negative prompt for product scene video and frame generation.',
    defaultValue: 'people, faces, hands, model, human, distorted product, melted packaging, duplicated product, text artifacts, jump cuts',
  },
  {
    id: 'negative.influencer.scene',
    group: 'Negative prompts',
    name: 'Influencer scene negative prompt',
    description: 'Default negative prompt for creator-led scene video and frame generation.',
    defaultValue: 'distorted hands, face changes, hairstyle changes, outfit changes, melted packaging, extra fingers, jump cuts, duplicated products, text artifacts',
  },
  {
    id: 'negative.style',
    group: 'Negative prompts',
    name: 'Style reference negative prompt',
    description: 'Default negative prompt for style boards and visual direction references.',
    defaultValue: 'random logos, inconsistent style, chaotic collage, unreadable typography',
  },
  {
    id: 'agent.chat_planner.system',
    group: 'Planning AI chat',
    name: 'Chat planner agent',
    description: 'Default agent system prompt for conversational planning.',
    defaultValue: "You are an expert video production planner. Help users develop their video ideas by asking insightful questions and suggesting creative directions. Focus on understanding the user's goals, target audience, and creative vision.",
  },
  {
    id: 'agent.prompt_enhancer.system',
    group: 'Prompt enhancement',
    name: 'Prompt enhancer agent',
    description: 'Default agent system prompt for prompt optimization.',
    defaultValue: 'You are a prompt engineering expert specializing in video generation. Enhance prompts to be more descriptive, cinematic, and effective for AI video generation.',
  },
  {
    id: 'agent.storyboard_writer.system',
    group: 'Scenario generation',
    name: 'Storyboard writer agent',
    description: 'Default agent system prompt for scene-by-scene planning.',
    defaultValue: 'You are a professional storyboard artist and scriptwriter. Create detailed scene-by-scene video plans with visual direction, narration, camera movements, and timing.',
  },
  {
    id: 'agent.scene_generator.system',
    group: 'Scenario generation',
    name: 'Scene generator agent',
    description: 'Default agent system prompt for individual scene generation.',
    defaultValue: 'You are a scene generation specialist. Create detailed scene descriptions optimized for AI video generation.',
  },
  {
    id: 'agent.image_generator.system',
    group: 'Influencer/product asset generation',
    name: 'Image generator agent',
    description: 'Default agent system prompt for image reference generation.',
    defaultValue: 'You prepare image generation prompts for start/end frames and reference images.',
  },
  {
    id: 'agent.frame_generator.system',
    group: 'Start frame generation',
    name: 'Frame generator agent',
    description: 'Default agent system prompt for start/end frame continuity.',
    defaultValue: 'You generate detailed frame descriptions for video start and end points, ensuring visual continuity.',
  },
  {
    id: 'agent.video_generator.system',
    group: 'Video generation',
    name: 'Video generator agent',
    description: 'Default agent system prompt for scene video generation.',
    defaultValue: 'You prepare video generation parameters and prompts for each scene.',
  },
  {
    id: 'agent.voiceover_agent.system',
    group: 'Scenario generation',
    name: 'Voiceover agent',
    description: 'Default agent system prompt for narration.',
    defaultValue: 'You write compelling voiceover and narration scripts for videos. Match tone to the video style and target audience.',
  },
  {
    id: 'agent.caption_agent.system',
    group: 'Scenario generation',
    name: 'Caption agent',
    description: 'Default agent system prompt for captions and overlays.',
    defaultValue: 'You create engaging captions, subtitles, and text overlays for video content. Keep text concise and impactful.',
  },
  {
    id: 'agent.ai_director.system',
    group: 'Style/brand consistency prompts',
    name: 'AI director agent',
    description: 'Default agent system prompt for review and quality control.',
    defaultValue: 'You are an experienced film director and video producer. Review storyboards, prompts, and generated content. Provide constructive feedback on pacing, visual consistency, storytelling, and overall quality.',
  },
  {
    id: 'agent.video_assembler.system',
    group: 'Video generation',
    name: 'Video assembler agent',
    description: 'Default agent system prompt for final assembly.',
    defaultValue: 'You manage the final video assembly process, ensuring smooth transitions, proper timing, and professional output.',
  },
  {
    id: 'agent.hook_generator.system',
    group: 'Prompt enhancement',
    name: 'Hook generator agent',
    description: 'Default agent system prompt for opening hooks.',
    defaultValue: 'You are a viral content strategist. Create powerful hooks and opening concepts that grab attention in the first 3 seconds. Focus on patterns that work for short-form video.',
  },
] as const satisfies readonly PromptLibraryItem[];

export type PromptId = (typeof DEFAULT_PROMPT_LIBRARY)[number]['id'];

export function getDefaultPrompt(id: string): string {
  return DEFAULT_PROMPT_LIBRARY.find((prompt) => prompt.id === id)?.defaultValue ?? '';
}

export function getPrompt(id: string, overrides?: PromptOverrides): string {
  const override = overrides?.[id]?.trim();
  return override || getDefaultPrompt(id);
}

export function renderPrompt(template: string, values: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = values[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

export function resolvePrompt(id: string, values: Record<string, unknown> = {}, overrides?: PromptOverrides): string {
  return renderPrompt(getPrompt(id, overrides), values).trim();
}
