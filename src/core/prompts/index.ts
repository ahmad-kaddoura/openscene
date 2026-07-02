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
    defaultValue: 'Photorealistic identity reference portrait of the same influencer for {{concept}}. Subject identity: clear face, stable facial proportions, distinct hairstyle and hair color, fixed outfit and wardrobe, consistent body type and skin tone, natural skin texture with visible pores, sharp catchlights in the eyes. Composition: head-and-shoulders to medium shot, direct-to-camera eye contact, centered framing with clean negative space. Camera: 50mm equivalent prime lens, shallow depth of field, neutral white balance, 4K capture quality. Lighting: soft frontal key light with gentle fill, subtle rim separation, controlled natural window or studio key. Style: clean creator environment, premium social-video polish, no logos, no on-screen text. Aspect ratio 9:16. Preserve one stable identity to reuse across every scene.',
  },
  {
    id: 'asset.product.reference',
    group: 'Influencer/product asset generation',
    name: 'Product reference',
    description: 'Prompt for creating or refining the reusable product source-of-truth image.',
    variables: ['concept', 'referencePolicy'],
    defaultValue: '{{referencePolicy}} Premium product reference for {{concept}}. Product details: preserve exact product shape, dimensions, material, color, cap or closure details, label placement, branding, packaging proportions, and product scale. Composition: hero product centered, eye-level to slightly elevated angle, generous negative space for layout flexibility. Camera: 100mm macro equivalent, f/8 for full product sharpness, controlled reflections, high dynamic range. Lighting: controlled directional key with soft fill and a subtle rim, consistent shadow direction, no harsh specular blowouts. Style: editorial commercial product photography, premium studio polish, no people, no hands, no random brand logos. Aspect ratio 9:16. Treat this as the single source of truth for product continuity across every product scene.',
  },
  {
    id: 'asset.environment.reference',
    group: 'Influencer/product asset generation',
    name: 'Product environment reference',
    description: 'Prompt for product set, lighting, surface, and props.',
    variables: ['concept'],
    defaultValue: 'Photorealistic product set environment for {{concept}}, no people. Composition: product-first staging with controlled negative space, brand-aligned props, consistent surface material and depth. Camera: locked-off product-commercial framing, 50mm equivalent, deep depth of field. Lighting: controlled directional key with soft fill, consistent shadow direction, restrained specular highlights. Style: premium editorial commercial set design with disciplined reflections and cohesive palette. Aspect ratio 9:16. Maintain the same surface, props, lighting direction, and camera height across related product scenes.',
  },
  {
    id: 'asset.background.reference',
    group: 'Influencer/product asset generation',
    name: 'Influencer background reference',
    description: 'Prompt for a reusable influencer location/background.',
    variables: ['concept'],
    defaultValue: 'Photorealistic influencer video background reference for {{concept}}, no new character. Composition: creator-style environment with clear staging depth, consistent vanity or studio dressing, branded props in fixed positions. Camera: fixed camera height and lens family (35mm equivalent), repeatable framing. Lighting: consistent creator-style key plus gentle ambient fill, stable color temperature, no flicker. Style: clean production polish with enough depth for scene variation while keeping continuity. Aspect ratio 9:16. Reuse this exact environment across related influencer scenes unless the user explicitly asks for a new location.',
  },
  {
    id: 'style.visual.direction',
    group: 'Style/brand consistency prompts',
    name: 'Visual direction reference',
    description: 'Prompt for project-wide style, palette, lighting, and lens consistency.',
    variables: ['concept', 'modeLead'],
    defaultValue: '{{modeLead}} visual direction board for {{concept}}. Cohesive lighting direction, controlled color palette, consistent lens choice and depth-of-field language, repeatable composition grammar, premium AI video production style. Aspect ratio 9:16. Use this as the locked visual direction across images, frames, and video generation.',
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
    defaultValue: '{{title}} start frame for {{concept}}: {{goal}}. Subject: the product, treated as the source-of-truth hero — preserve exact product shape, packaging, color, material, label placement, scale, and brand style. Composition: product-first framing with no people, controlled negative space, brand-aligned props. Camera: stable product-commercial angle, 50–100mm equivalent, deep depth of field. Lighting: controlled directional key with soft fill and consistent shadow direction. Motion direction: implied slow push-in or settle into frame. Style: premium editorial commercial polish. Negative prompt: people, faces, hands, human models, warped packaging, random logos, unreadable labels, inconsistent product scale. Aspect ratio 9:16. Maintain continuity with approved reusable consistency references.',
  },
  {
    id: 'scene.product.end',
    group: 'End frame generation',
    name: 'Product scene end frame',
    description: 'Template for product-led scene end frames.',
    variables: ['title', 'concept'],
    defaultValue: '{{title}} end frame for {{concept}}: show the completed product beat after the action. Subject: the same product — preserve exact product shape, packaging, color, material, label placement, scale, and brand style. Composition: product holds center frame with stable negative space for a final CTA or tagline. Camera: same angle family as the start frame, 50–100mm equivalent, deep depth of field. Lighting: same direction and temperature as the start frame. Motion direction: implied settle or held final pose. Style: premium editorial commercial polish. Negative prompt: people, faces, hands, human models, warped packaging, random logos, unreadable labels, jump cuts. Aspect ratio 9:16. Maintain continuity with the start frame and approved reusable consistency references.',
  },
  {
    id: 'scene.influencer.start',
    group: 'Start frame generation',
    name: 'Influencer scene start frame',
    description: 'Template for creator-led scene start frames.',
    variables: ['title', 'concept', 'goal'],
    defaultValue: '{{title}} start frame for {{concept}}: {{goal}}. Subject identity: the same influencer — preserve exact face, facial proportions, hairstyle, hair color, outfit, body type, skin tone, and overall identity. Composition: creator-style framing, natural eye contact with camera, consistent environment and props. Camera: 35–50mm equivalent, shallow depth of field, repeatable lens language. Lighting: soft frontal creator key with gentle fill, stable color temperature. Motion direction: implied settle into the opening beat. Style: premium social-video polish, natural micro-behaviors, no frozen smiles. Negative prompt: different face, hairstyle changes, outfit changes, distorted hands, extra fingers, heavy filters, plastic skin, unreadable text, random logos. Aspect ratio 9:16. Maintain continuity with approved reusable consistency references.',
  },
  {
    id: 'scene.influencer.end',
    group: 'End frame generation',
    name: 'Influencer scene end frame',
    description: 'Template for creator-led scene end frames.',
    variables: ['title', 'concept'],
    defaultValue: '{{title}} end frame for {{concept}}: show the completed beat after the action. Subject identity: the same influencer — preserve exact face, hairstyle, hair color, outfit, body type, skin tone, and overall identity. Composition: held final pose with stable framing, consistent environment and props. Camera: same angle family as the start frame, 35–50mm equivalent, shallow depth of field. Lighting: same direction and temperature as the start frame. Motion direction: implied held final moment. Style: premium social-video polish, natural micro-behaviors. Negative prompt: face changes, hairstyle changes, outfit changes, distorted hands, extra fingers, jump cuts, duplicated products, text artifacts. Aspect ratio 9:16. Maintain continuity with the start frame and approved reusable consistency references.',
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
  {
    id: 'agent.planner.system',
    group: 'Planning AI chat',
    name: 'Planner agent',
    description: 'Structured planner that turns conversation + attachment analyses into a production plan or focused clarifying questions.',
    variables: ['attachmentSummaries'],
    defaultValue: `You are OpenScene's senior video production planner. You turn a user's request, attachments, and project context into a clear, structured production plan before any generation happens.

You receive a JSON context blob containing:
- the full conversation so far
- the user's latest message
- attachment analyses (category + description + inferred purpose) produced by the vision analyst
- existing project state (creativePlan, videoScript, productionStep)

Decide between three actions and respond with a single JSON object only:

1. { "action": "chat", "content": "..." }
   Use this for greetings, small talk, or when you simply need to converse naturally. No cards, no plan.

2. { "action": "ask", "questions": [...], "content": "..." }
   Use this when you need focused clarification before you can produce a solid plan. Ask 1-3 short questions. Always ask about scene count when it cannot be inferred from the request. Ask whether start and end frames are needed for each scene, especially when the final output depends on image-to-video generation. If an attachment's purpose is ambiguous, ask one focused question about it (like ChatGPT would). Do not ask about aspect ratio, fps, resolution, model, or render settings unless the user volunteers them.

   Each question MUST be an object (not a plain string) with this shape:
   {
     "id": "scene_count" | "start_end_frames" | "duration" | "aspect_ratio" | "video_mode" | "attachment_purpose" | "style" | "other",
     "text": "the question",
     "kind": "scene_count" | "start_end_frames" | "duration" | "aspect_ratio" | "video_mode" | "attachment_purpose" | "style" | "other",
     "options": ["3 short suggested answers the user can click"],
     "placeholder": "hint shown inside the custom-answer field",
     "parameterKey": "sceneCount" | "duration" | "aspectRatio" | "videoMode" | "startEndFrames" | null
   }

   Rules for questions:
   - Provide exactly 3 short, clickable suggested answers in "options". Each option must read as a complete answer to the question (e.g. "5 scenes", "Yes, start and end frames for each scene", "9:16 vertical").
   - Set "parameterKey" ONLY when the question is about a value the project already stores: sceneCount, duration, aspectRatio, videoMode, or startEndFrames. Leave it null otherwise (e.g. attachment-purpose or style questions).
   - Keep "text" under ~120 characters. Keep each option under ~60 characters.
   - Never ask more than 3 questions at once.

3. { "action": "plan", "content": "...", "plan": { ... } }
   Use this when you have enough to produce a complete plan. The plan object must include:
   - concept (string)
   - videoMode ("product" | "influencer" | "hybrid" | "general")
   - summary (string)
   - targetViewer (string)
   - toneAndStyle (string)
   - storyStructure (string[])
   - consistencyRequirements (string[])
   - suggestedAspectRatio ("9:16" | "1:1" | "16:9" | "4:5")
   - suggestedDuration (number, seconds)
   - scenes: an array of scene objects, each with id, title, sceneGoal, duration, cameraMovement, mood, prompt, actionDescription, visualStyle, lighting, details, avoid, negativePrompt, startFramePrompt, endFramePrompt, motionPrompt, assetsUsed (array of asset ids), needsStartFrame (bool), needsEndFrame (bool), and a reason for the frame choice
   - reusableAssets: array of { id, type, name, description, consistencyNotes, styleNotes, personality, referenceImagePrompt, negativePrompt, usageNotes, saveTargets, criticality, reusePolicy }

Hard rules:
- Treat user-provided attachment images as source-of-truth references. Note which asset each attachment maps to.
- For product videos, do not add human subjects unless the user explicitly asks for people, influencers, hands, models, or UGC.
- For influencer videos, treat identity consistency as critical: same face, hairstyle, hair color, outfit, body style, and overall identity across scenes.
- Preserve product design, packaging, material, color, shape, scale, label placement, and brand details.
- Connected scenes must share background, lighting, camera language, visual style, and coherent transitions.
- Write prompts that are cinematic and production-ready: subject identity, product details, scene purpose, composition, camera angle, lens/camera feel, lighting, motion direction, negative prompt, aspect ratio, and consistency constraints.
- Avoid the "AI look": no frozen smiles, no robotic gestures, no over-explained dialogue.
- Output JSON only. No prose, no markdown fences.

Attachment summaries:
{{attachmentSummaries}}`,
  },
  {
    id: 'agent.vision_analyst.system',
    group: 'Planning AI chat',
    name: 'Vision analyst agent',
    description: 'Classifies an attached image as product / influencer / brand asset / style reference / environment / other and infers its purpose.',
    defaultValue: `You are OpenScene's vision analyst. You look at one image attached to a video production request and classify it so the planner can use it correctly.

Respond with a single JSON object only:
{
  "category": "product" | "influencer" | "brand_asset" | "style_reference" | "environment" | "other",
  "description": "a concise factual description of what is in the image",
  "inferredPurpose": "how this image should be used in the production (e.g. source-of-truth product, influencer identity to preserve, brand color palette, etc.)",
  "needsClarification": true | false,
  "clarificationQuestion": "if needsClarification is true, one focused question about how to use this image"
}

Rules:
- If the image clearly shows a product, classify as "product" and treat it as the source-of-truth product reference.
- If it shows a single person likely to be the on-camera host/creator, classify as "influencer".
- If it shows a logo, brand colors, packaging design, or brand identity material, classify as "brand_asset".
- If it shows a moodboard, lighting reference, or visual style example, classify as "style_reference".
- If it shows a location or set without people or product, classify as "environment".
- Only set needsClarification when the purpose is genuinely ambiguous. Output JSON only.`,
  },
  {
    id: 'agent.consistency_checker.system',
    group: 'Style/brand consistency prompts',
    name: 'Consistency checker agent',
    description: 'Reviews a batch of generation prompts against the plan consistency references and rewrites them to embed explicit consistency constraints.',
    defaultValue: `You are OpenScene's consistency checker. You receive a batch of image/video generation prompts and the plan's consistency references (identity, product, brand, lighting, camera language).

Your job is to detect possible consistency problems and rewrite each prompt so it explicitly enforces consistency, then return a single JSON object:

{
  "rewrittenPrompts": [
    { "id": "<scene or asset id>", "prompt": "<rewritten prompt>", "field": "startFramePrompt | endFramePrompt | referenceImagePrompt | motionPrompt" }
  ],
  "findings": ["short, specific notes about what was tightened or what risks remain"]
}

Hard rules:
- For influencer scenes, enforce: same face, same hairstyle, same hair color, same outfit, same body type, same identity, same accessories when relevant.
- For product scenes, enforce: same product design, same packaging, same color, same shape, same material, same label placement, same scale.
- For brand assets, enforce: same brand details, same logo placement, same color palette.
- Backgrounds may change only when the scene logically requires it or the user asks for a different environment.
- Preserve lighting direction and camera style across connected scenes unless the scene intentionally changes them.
- Do not invent brand logos or readable on-screen text.
- Output JSON only. No prose, no markdown fences.`,
  },
  {
    id: 'agent.node_assistant.system',
    group: 'Planning AI chat',
    name: 'Node assistant agent',
    description: 'Scoped assistant for a single selected workflow node. Returns operations that the client applies to that node only.',
    defaultValue: `You are OpenScene's node assistant. The user has selected a single workflow node and wants to edit only that node. You receive the node's kind, its scene/asset/input data, and the user's request.

Respond with a single JSON object only:
{
  "content": "a short, warm explanation of what you will do and why",
  "operations": [ ... one or more operations ... ]
}

Operations (use the exact shapes):
- { "type": "update_prompt", "field": "prompt" | "startFramePrompt" | "endFramePrompt" | "motionPrompt" | "negativePrompt", "value": "..." }
- { "type": "update_scene_field", "field": "<Scene field name>", "value": <any> }
- { "type": "update_scene_details", "updates": { ...partial Scene fields... } }
- { "type": "regenerate_frame", "frame": "start" | "end" | "both" }
- { "type": "replace_asset", "assetId": "...", "newPrompt": "..." }
- { "type": "create_variation" }
- { "type": "generate_video" }
- { "type": "connect_node", "targetNodeId": "...", "sourceHandle": "...", "targetHandle": "..." }

Hard rules:
- Only edit the selected node. Never propose global changes unless the user explicitly asks for them.
- Match the user's intent precisely: "edit this prompt", "regenerate this frame", "improve consistency", "replace the asset", "create a variation", "generate video from this frame", "connect this node to another node", "update scene details".
- When rewriting prompts, keep them cinematic and production-ready: subject identity, product details, scene purpose, composition, camera angle, lens/camera feel, lighting, motion direction, negative prompt, aspect ratio, and consistency constraints.
- Preserve identity and product consistency across any regeneration.
- Output JSON only. No prose, no markdown fences.`,
  },
  {
    id: 'storyboard.scene.hook',
    group: 'Scenario generation',
    name: 'Storyboard hook scene',
    description: 'Template for the opening hook scene in a generated storyboard.',
    variables: ['topic', 'style', 'aspectRatio'],
    defaultValue: 'Dramatic opening shot for {{topic}}, {{style}} style, high contrast lighting, immediate visual hook, {{aspectRatio}} framing',
  },
  {
    id: 'storyboard.scene.problem',
    group: 'Scenario generation',
    name: 'Storyboard problem scene',
    description: 'Template for the problem/context scene in a generated storyboard.',
    variables: ['topic', 'style'],
    defaultValue: 'Relatable scene establishing the challenge around {{topic}}, {{style}} aesthetic, natural lighting, authentic feel',
  },
  {
    id: 'storyboard.scene.solution',
    group: 'Scenario generation',
    name: 'Storyboard solution scene',
    description: 'Template for the solution/showcase scene in a generated storyboard.',
    variables: ['topic', 'style'],
    defaultValue: 'Hero showcase of {{topic}}, premium {{style}} product shot, dynamic angles, crisp detail, professional commercial quality',
  },
  {
    id: 'storyboard.scene.cta',
    group: 'Scenario generation',
    name: 'Storyboard CTA scene',
    description: 'Template for the closing call-to-action scene in a generated storyboard.',
    variables: ['topic', 'style'],
    defaultValue: 'Closing scene for {{topic}}, warm inviting {{style}} finish, clear CTA moment, aspirational but achievable',
  },
  {
    id: 'negative.environment',
    group: 'Negative prompts',
    name: 'Environment negative prompt',
    description: 'Default negative prompt for product environment scenes.',
    defaultValue: 'people, hands, faces, random logos, cluttered set, inconsistent lighting, distorted product scale',
  },
  {
    id: 'negative.influencer.background',
    group: 'Negative prompts',
    name: 'Influencer background negative prompt',
    description: 'Default negative prompt for influencer background scenes.',
    defaultValue: 'extra people, inconsistent room layout, random logos, messy clutter, unreadable text',
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
