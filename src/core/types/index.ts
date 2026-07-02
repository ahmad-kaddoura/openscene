import { type Node, type Edge } from '@xyflow/react';

// ============= Project Types =============
export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  thumbnailUrl?: string;
  status: ProjectStatus;
  currentPhase: ProjectPhase;
  videoBrief?: VideoBrief;
  storyboard?: Storyboard;
  workflowGraph?: WorkflowGraph;
  creativePlan?: CreativeWorkflowPlan;
  videoScript?: VideoScript;
  productionStep?: ProductionStep;
  usageEvents?: UsageEvent[];
  settings: ProjectSettings;
  versions: ProjectVersion[];
  /** Reference images attached during chat brainstorming */
  referenceImageUrls?: string[];
  /** Cached vision analyses for attached images, keyed by image hash. */
  attachmentAnalyses?: AttachmentAnalysis[];
}

export type ProjectStatus = 'draft' | 'in_progress' | 'review' | 'completed' | 'archived';
export type ProjectPhase = 'chat' | 'workflow' | 'timeline' | 'brief' | 'storyboard' | 'generation' | 'export';
export type ProductionStep = 'script' | 'influencer' | 'background' | 'frames' | 'workflow';

export interface ProjectVersion {
  id: string;
  name: string;
  createdAt: string;
  snapshot: Partial<Project>;
}

// ============= Video Brief =============
export interface VideoBrief {
  title: string;
  description: string;
  videoType: VideoType;
  targetPlatform: TargetPlatform;
  aspectRatio: AspectRatio;
  duration: number; // seconds
  style: StylePreset;
  mood: string;
  numberOfScenes: number;
  sceneDuration: number; // seconds per scene
  negativePrompt?: string;
  fps: number;
  resolution: string;
  outputFormat: OutputFormat;
  voiceover?: string;
  captions?: boolean;
  musicMood?: string;
  soundEffectsNotes?: string;
  cta?: string;
  audience?: string;
  brandKitId?: string;
  characterIds: string[];
  productDetails?: ProductDetails;
}

export type VideoType =
  | 'ad' | 'cinematic' | 'reel' | 'influencer' | 'product'
  | 'storytelling' | 'app_promo' | 'motivational' | 'ugc' | 'creative_concept';

export type TargetPlatform =
  | 'tiktok' | 'instagram_reels' | 'youtube_shorts' | 'youtube'
  | 'instagram_feed' | 'instagram_story' | 'facebook'
  | 'linkedin' | 'twitter' | 'website' | 'custom';

export type AspectRatio = '9:16' | '1:1' | '16:9' | '4:5' | 'custom';
export type OutputFormat = 'mp4' | 'webm' | 'mov';

// ============= Style Presets =============
export type StylePreset =
  | 'cinematic' | 'luxury_ad' | 'ugc_influencer' | 'realistic_product'
  | 'anime' | 'dark_scifi' | 'documentary' | 'podcast_clip'
  | 'fashion_campaign' | 'app_promo' | 'real_estate' | 'food_commercial'
  | 'motivational_reel' | 'product_launch' | 'fitness_ad' | 'travel_video' | 'tech_commercial'
  | 'custom';

export type CameraMovement =
  | 'dolly_in' | 'dolly_out' | 'orbit' | 'handheld' | 'drone'
  | 'close_up' | 'wide_shot' | 'tracking_shot' | 'slow_push_in' | 'top_down'
  | 'static' | 'pan_left' | 'pan_right' | 'tilt_up' | 'tilt_down';

export type Transition =
  | 'cut' | 'fade' | 'whip_pan' | 'zoom' | 'match_cut' | 'cross_dissolve';

// ============= Product Details =============
export interface ProductDetails {
  name: string;
  description: string;
  features: string[];
  referenceImageUrls: string[];
  colorScheme?: string[];
  tagline?: string;
}

// ============= Storyboard =============
export interface Storyboard {
  id: string;
  scenes: Scene[];
  totalDuration: number;
  narrativeArc: string;
  notes?: string;
}

export interface Scene {
  id: string;
  order: number;
  title: string;
  prompt: string;
  enhancedPrompt?: string;
  negativePrompt?: string;
  startTime: number;
  endTime: number;
  duration: number;
  narration?: string;
  visualDirection?: string;
  cameraMovement: CameraMovement;
  mood: string;
  characters: string[];
  props: string[];
  productPlacement?: string;
  transition: Transition;
  textOverlays: TextOverlay[];
  captions?: string;
  referenceImageUrls: string[];
  generatedStartFrameUrl?: string;
  generatedEndFrameUrl?: string;
  generatedVideoUrl?: string;
  generatedAudioUrl?: string;
  stylePreset: StylePreset;
  voiceover?: string;
  status: SceneStatus;
  generationProgress?: number;
  generationStartedAt?: string;
  generationTaskId?: string;
  generationModel?: string;
  generationModels?: GenerationModelRouting;
  generationError?: string;
  versions: SceneVersion[];
  costEstimate?: number;
  cta?: string;
  platformNotes?: string;
  aspectRatio?: string;
  sceneDescription?: string;
  actionDescription?: string;
  visualStyle?: string;
  lighting?: string;
  details?: string;
  avoid?: string;
  startFrameUrl?: string;
  endFrameUrl?: string;
  frameGenerationStatus?: 'pending' | 'generated' | 'failed' | 'fallback';
  frameGenerationModel?: string;
  frameGenerationError?: string;
  sceneGoal?: string;
  motionPrompt?: string;
  startFramePrompt?: string;
  endFramePrompt?: string;
  assetsUsed?: string[];
}

export type SceneStatus = 'idle' | 'queued' | 'generating' | 'completed' | 'failed' | 'cancelled' | 'regenerating';

export interface SceneVersion {
  id: string;
  sceneId: string;
  prompt: string;
  generatedImageUrl?: string;
  generatedVideoUrl?: string;
  createdAt: string;
}

export interface TextOverlay {
  id: string;
  text: string;
  type: 'title' | 'subtitle' | 'caption' | 'lower_third' | 'cta' | 'product_label' | 'custom';
  position: { x: number; y: number };
  style: {
    fontSize: number;
    color: string;
    fontFamily?: string;
    fontWeight?: string;
    animation?: string;
    backgroundColor?: string;
    padding?: number;
  };
  startTime: number;
  endTime: number;
}

// ============= Workflow =============
export interface WorkflowGraph {
  nodes: Node[];
  edges: Edge[];
  metadata: WorkflowMetadata;
}

export interface WorkflowMetadata {
  lastModified: string;
  viewport?: { x: number; y: number; zoom: number };
}

// ============= Brand Kit =============
export interface BrandKit {
  id: string;
  name: string;
  brandName: string;
  colors: string[];
  logoUrls: string[];
  fonts: string[];
  toneOfVoice: string;
  productImageUrls: string[];
  targetAudience: string;
  ctaStyle: string;
  visualIdentity: string;
  brandRules: string;
  createdAt: string;
  updatedAt: string;
}

// ============= Character =============
export interface Character {
  id: string;
  name: string;
  appearance: string;
  outfit: string;
  personality: string;
  voiceStyle: string;
  referenceImageUrls: string[];
  consistencyNotes: string;
  createdAt: string;
}

// ============= Video Script =============
export interface ScriptBeat {
  /** 0-based offset inside the scene */
  second: number;
  /** what the character does that second */
  action: string;
  /** what they say */
  dialogue?: string;
  /** expression / body language */
  behavior?: string;
  /** camera note for that second */
  camera?: string;
}

export interface ScriptScene {
  id: string;
  order: number;
  title: string;
  durationSeconds: number;
  goal: string;
  narration: string;
  beats: ScriptBeat[];
  cameraBehavior: string;
  mood: string;
  visualNotes: string;
}

export interface VideoScript {
  id: string;
  logline: string;
  durationSeconds: number;
  sceneCount: number;
  narrationStyle: string;
  scenes: ScriptScene[];
  approvalStatus: 'draft' | 'approved';
}

// ============= Creative Planning =============
export type ReusableAssetType = 'character' | 'influencer' | 'brand_identity' | 'product' | 'logo' | 'environment' | 'background' | 'style_reference';

export type VideoPlanningMode = 'product' | 'influencer' | 'hybrid' | 'general';

export interface ConsistencyReference {
  id: string;
  type: ReusableAssetType;
  name: string;
  description: string;
  imageUrl?: string;
  prompt?: string;
  negativePrompt?: string;
  consistencyNotes: string;
  criticalFor: VideoPlanningMode[];
  appliesToSceneIds: string[];
  reusePolicy: 'always' | 'when_relevant' | 'ask';
  savedToLibrary?: boolean;
  createdAt: string;
}

export interface ReusableAssetPlan {
  id: string;
  type: ReusableAssetType;
  name: string;
  description: string;
  generatedImageUrl?: string;
  generationStatus?: 'pending' | 'generated' | 'failed' | 'fallback';
  generationModel?: string;
  generationError?: string;
  consistencyNotes: string;
  styleNotes?: string;
  personality?: string;
  referenceImagePrompt: string;
  negativePrompt: string;
  usageNotes: string;
  saveTargets: ('brand_identity' | 'project_assets')[];
  criticality?: 'critical' | 'supporting' | 'optional';
  reusePolicy?: 'always' | 'when_relevant' | 'ask';
}

export interface CreativeWorkflowPlan {
  id: string;
  concept: string;
  videoMode: VideoPlanningMode;
  summary: string;
  targetViewer: string;
  toneAndStyle: string;
  storyStructure: string[];
  reusableAssets: ReusableAssetPlan[];
  consistencyReferences: ConsistencyReference[];
  scenes: Scene[];
  consistencyRequirements: string[];
  renderSettingsDeferred: boolean;
  suggestedAspectRatio?: AspectRatio;
  suggestedDuration?: number;
  outputFormat?: OutputFormat;
  approvalStatus?: 'draft' | 'approved' | 'assets_generated' | 'workflow_ready';
  /** Live progress block rendered in the Details tab. */
  progress?: PlanProgress;
}

// ============= Chat =============
export interface ChatAttachment {
  type: 'image';
  url: string;
  name: string;
}

export interface ChatMessage {
  id: string;
  projectId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  attachments?: ChatAttachment[];
  generativeUI?: GenerativeUIComponent[];
  metadata?: Record<string, unknown>;
}

// A single clarifying question the planner asks the user before producing a
// plan. `options` are 3 short suggested answers the user can click; the custom
// answer lets them type their own. `parameterKey` marks questions that map to a
// settable project parameter — the UI then offers a "use the set value" button.
export type ClarifyingParameterKey =
  | 'sceneCount'
  | 'duration'
  | 'aspectRatio'
  | 'videoMode'
  | 'startEndFrames';

export interface ClarifyingQuestion {
  id?: string;
  text: string;
  kind?: string;
  options: string[];
  placeholder?: string;
  parameterKey?: ClarifyingParameterKey;
  currentValue?: string;
  currentLabel?: string;
}

export type GenerativeUIComponent =
  | { type: 'creative_workflow_plan'; data: CreativeWorkflowPlan }
  | { type: 'video_brief_form'; data: Partial<VideoBrief> }
  | { type: 'scene_suggestion'; data: Partial<Scene>[] }
  | { type: 'style_selector'; data: { options: StylePreset[]; selected?: StylePreset } }
  | { type: 'platform_selector'; data: { options: TargetPlatform[]; selected?: TargetPlatform } }
  | { type: 'aspect_ratio_preview'; data: { ratio: AspectRatio } }
  | { type: 'aspect_ratio_selector'; data: { options: AspectRatio[]; selected?: AspectRatio } }
  | { type: 'duration_selector'; data: { options: { id: string; label: string; seconds: number }[]; selected?: string } }
  | { type: 'resolution_selector'; data: { options: string[]; selected?: string } }
  | { type: 'fps_selector'; data: { options: number[]; selected?: number } }
  | { type: 'character_form'; data: Partial<Character> }
  | { type: 'product_form'; data: Partial<ProductDetails> }
  | { type: 'hook_suggestions'; data: { hooks: string[] } }
  | { type: 'director_review'; data: DirectorReview }
  | { type: 'confirmation'; data: { message: string; action: string } }
  | { type: 'chat_suggestions'; data: { suggestions: string[] } }
  | { type: 'script_card'; data: VideoScript }
  | { type: 'influencer_card'; data: ReusableAssetPlan }
  | { type: 'background_card'; data: ReusableAssetPlan }
  | { type: 'frames_card'; data: { scenes: Scene[] } }
  | { type: 'clarifying_questions'; data: { questions: ClarifyingQuestion[]; planId?: string } }
  | { type: 'consistency_review'; data: { findings: string[]; rewrittenPrompt?: string; sceneId?: string } }
  | { type: 'node_actions'; data: { nodeId: string; nodeKind: string; actions: { label: string; prompt: string }[] } };

// ============= AI Director =============
export interface DirectorReview {
  overallScore: number;
  pacing: string;
  visualConsistency: string;
  characterConsistency: string;
  productConsistency: string;
  ctaAssessment: string;
  weakScenes: number[];
  suggestions: string[];
  styleMatch: string;
  transitionQuality: string;
  overallQuality: string;
}

// ============= Agent =============
export interface AgentConfig {
  id: AgentType;
  name: string;
  description: string;
  modelId: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  enabled: boolean;
}

export type AgentType =
  | 'chat_planner'
  | 'planner'
  | 'vision_analyst'
  | 'consistency_checker'
  | 'node_assistant'
  | 'prompt_enhancer'
  | 'storyboard_writer'
  | 'scene_generator'
  | 'image_generator'
  | 'frame_generator'
  | 'video_generator'
  | 'voiceover_agent'
  | 'caption_agent'
  | 'ai_director'
  | 'video_assembler'
  | 'hook_generator';

/** Lightweight per-scene frame requirement flags surfaced by the planner. */
export interface SceneFrameRequirement {
  sceneId: string;
  needsStartFrame: boolean;
  needsEndFrame: boolean;
  reason?: string;
}

/** Plan-level progress block rendered in the Details tab. */
export interface PlanProgress {
  completedSteps: string[];
  pendingSteps: string[];
  missingInputs: string[];
  sceneFrameRequirements: SceneFrameRequirement[];
  updatedAt?: string;
}

/** Vision analysis result for an attached image, cached on the project. */
export interface AttachmentAnalysis {
  url: string;
  hash: string;
  category: 'product' | 'influencer' | 'brand_asset' | 'style_reference' | 'environment' | 'other';
  description: string;
  inferredPurpose: string;
  needsClarification?: boolean;
  clarificationQuestion?: string;
  analyzedAt: string;
}

/** A scoped operation emitted by the node assistant agent. */
export type NodeAssistantOperation =
  | { type: 'update_prompt'; field: 'prompt' | 'startFramePrompt' | 'endFramePrompt' | 'motionPrompt' | 'negativePrompt'; value: string }
  | { type: 'update_scene_field'; field: keyof import('./index').Scene; value: unknown }
  | { type: 'regenerate_frame'; frame: 'start' | 'end' | 'both' }
  | { type: 'replace_asset'; assetId: string; newPrompt: string }
  | { type: 'create_variation' }
  | { type: 'generate_video' }
  | { type: 'connect_node'; targetNodeId: string; sourceHandle: string; targetHandle: string }
  | { type: 'update_scene_details'; updates: Partial<Scene> };

/** Identifies which workflow node the chat is currently scoped to. */
export interface NodeContext {
  nodeId: string;
  nodeKind: 'scene' | 'parameters' | 'script' | 'frames' | 'asset' | 'note' | 'imageInput' | 'videoInput' | 'promptInput' | 'motionControl' | 'motionOutput' | 'output';
  sceneId?: string;
  motionId?: string;
  inputId?: string;
  assetId?: string;
}

export type EdgeLabelPlacement = 'on-edge' | 'in-node';
export type CanvasGridVariant = 'dots' | 'lines' | 'cross';

export interface CanvasGridSettings {
  enabled: boolean;
  variant: CanvasGridVariant;
  gap: number;
  opacity: number;
}

export type GenerationEffort = 'low' | 'medium' | 'high';

export interface GenerationModelRouting {
  effort: GenerationEffort;
  plannerModel: string;
  imageModel: string;
  frameModel: string;
  videoModel: string;
  motionControlModel: string;
  directorModel: string;
}

export interface PromptLibraryItem {
  id: string;
  group: string;
  name: string;
  description: string;
  defaultValue: string;
  variables?: readonly string[];
}

export type PromptOverrides = Record<string, string>;

export type WorkspaceLayout = 'modern' | 'classic';

// ============= App Settings =============
export interface AppSettings {
  agentConfigs: Record<AgentType, AgentConfig>;
  exportPresets: ExportPreset[];
  costControls: CostControls;
  layout: WorkspaceLayout;
  theme: 'light' | 'dark' | 'system';
  defaultAspectRatio: AspectRatio;
  defaultPlatform: TargetPlatform;
  defaultFps: number;
  scenePromptTemplate: string;
  promptOverrides: PromptOverrides;
  edgeLabelPlacement: EdgeLabelPlacement;
  canvasGrid: CanvasGridSettings;
  generationModels: GenerationModelRouting;
}

export interface ExportPreset {
  id: string;
  name: string;
  platform: TargetPlatform;
  aspectRatio: AspectRatio;
  resolution: string;
  fps: number;
  maxDuration: number;
  format: OutputFormat;
  quality: 'low' | 'medium' | 'high' | 'ultra';
}

export interface CostControls {
  maxParallelGenerations: number;
  maxDuration: number;
  maxRetries: number;
  maxOutputQuality: 'low' | 'medium' | 'high' | 'ultra';
  maxScenes: number;
  maxVersions: number;
}

// ============= Generation Job =============
export interface GenerationJob {
  id: string;
  projectId: string;
  sceneId?: string;
  type: 'image' | 'video' | 'audio' | 'frame';
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  outputUrl?: string;
  metadata?: Record<string, unknown>;
}

// ============= Usage =============
export type UsageGenerationType = 'planning' | 'image' | 'frame' | 'video' | 'review' | 'export' | 'asset_save';

export interface UsageEvent {
  id: string;
  projectId: string;
  sceneId?: string;
  assetId?: string;
  model: string;
  generationType: UsageGenerationType;
  action: string;
  assetType?: ReusableAssetType | Asset['type'] | 'timeline' | 'final_video';
  tokens?: number;
  credits?: number;
  status: 'estimated' | 'completed' | 'failed';
  createdAt: string;
  metadata?: Record<string, unknown>;
}

// ============= Asset =============
export interface Asset {
  id: string;
  projectId: string;
  name: string;
  type: 'image' | 'video' | 'audio' | 'reference';
  url: string;
  thumbnailUrl?: string;
  mimeType: string;
  size: number;
  createdAt: string;
  metadata?: Record<string, unknown>;
  sceneId?: string;
}

// ============= Project Settings =============
export interface ProjectSettings {
  aspectRatio: AspectRatio;
  targetPlatform: TargetPlatform;
  fps: number;
  resolution: string;
  outputFormat: OutputFormat;
  quality: 'low' | 'medium' | 'high' | 'ultra';
}

// ============= Hook Generator =============
export interface HookOption {
  id: string;
  text: string;
  style: 'hook_question' | 'bold_statement' | 'shocking_stat' | 'story_open' | 'problem_agitate' | 'social_proof' | 'curiosity_gap';
  estimatedRetention: number; // 0-100
}

// ============= Timeline =============
export interface TimelineTrack {
  id: string;
  type: 'video' | 'audio' | 'caption' | 'overlay';
  name: string;
  clips: TimelineClip[];
}

export interface TimelineClip {
  id: string;
  trackId: string;
  sceneId?: string;
  assetId?: string;
  startTime: number;
  endTime: number;
  duration: number;
  label: string;
  color?: string;
}
