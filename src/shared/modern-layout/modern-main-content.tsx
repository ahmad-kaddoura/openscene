"use client";

import { useRef, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Bell,
  Boxes,
  CheckCircle2,
  Clapperboard,
  Clock3,
  Film,
  ImagePlus,
  Layers3,
  MessageSquareText,
  Mic2,
  Paperclip,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Plus,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  User2,
  Wand2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ChatView, buildCreativeWorkflowPlanWithPrompts, useChatStore } from "@/features/chat";
import { WorkflowView, useWorkflowStore } from "@/features/workflow";
import { TimelineView } from "@/features/timeline/timeline-view";
import { useProjectStore } from "@/features/project/store";
import { useSettingsStore } from "@/features/settings/store";
import { usePersistedState } from "@/shared/lib/use-persisted-state";
import type {
  ChatAttachment,
  AgentConfig,
  AgentType,
  CreativeWorkflowPlan,
  GenerativeUIComponent,
  GenerationModelRouting,
  Project,
  ProductionStep,
  PromptOverrides,
  ReusableAssetPlan,
  Scene,
  VideoScript,
} from "@/core/types";

type AttachmentIssue = {
  id: string;
  message: string;
};

type ModernMainContentProps = {
  projectRailOpen?: boolean;
  onToggleProjectRail?: () => void;
};

// Stable storage keys so panel widths and the inspector toggle survive reloads.
const WORKSPACE_PANELS_STORAGE_KEY = "openscene-layout:workspace-panels";
const INSPECTOR_OPEN_KEY = "openscene-layout:inspector-open";

const CREATIVE_STEPS: Array<{
  id: "concept" | ProductionStep | "final";
  label: string;
  description: string;
}> = [
  { id: "concept", label: "Concept", description: "Prompt, references, and goals captured" },
  { id: "script", label: "Script", description: "Narration and scene beats ready for review" },
  { id: "influencer", label: "Avatar", description: "Character identity approved before frames" },
  { id: "background", label: "Style", description: "Global look, setting, and lighting locked" },
  { id: "frames", label: "Storyboard", description: "Start/end frames use shared continuity context" },
  { id: "workflow", label: "Workflow", description: "Editable production graph is ready" },
  { id: "final", label: "Final", description: "Timeline, preview, export, and handoff" },
];

const SHORTCUT_PROMPTS = [
  "UGC-style creator tutorial with a consistent host and soft natural lighting",
  "Premium product launch video with reference images and cinematic macro shots",
  "Course lesson clip with presenter, captions, and clear scene continuity",
];

function projectProgress(project?: Project) {
  if (!project) return 0;
  if (project.currentPhase === "timeline") return 88;
  if (project.currentPhase === "workflow") return 72;
  if (project.creativePlan?.approvalStatus === "assets_generated") return 62;
  if (project.productionStep === "frames") return 56;
  if (project.productionStep === "background") return 44;
  if (project.productionStep === "influencer") return 34;
  if (project.videoScript) return 26;
  if (project.creativePlan) return 18;
  return 8;
}

function currentStepIndex(project?: Project) {
  if (!project) return 0;
  if (project.currentPhase === "timeline") return CREATIVE_STEPS.length - 1;
  if (project.currentPhase === "workflow") return 5;
  if (project.productionStep === "frames") return 4;
  if (project.productionStep === "background") return 3;
  if (project.productionStep === "influencer") return 2;
  if (project.videoScript || project.productionStep === "script") return 1;
  return 0;
}

function firstGeneratedAsset(plan?: CreativeWorkflowPlan) {
  return plan?.reusableAssets.find((asset) => asset.generatedImageUrl);
}

// Shared planning-turn runner. Used by both AgentHome (new project) and the
// empty review workspace (quick-start on an existing project) so a single
// code path processes /api/chat responses.
async function runPlanningTurn(args: {
  project: Project;
  content: string;
  attachments: ChatAttachment[];
  referenceImageUrls: string[];
  generationModels: GenerationModelRouting | undefined;
  promptOverrides: PromptOverrides | undefined;
  agentConfigs: Record<AgentType, AgentConfig> | undefined;
  addMessage: (projectId: string, role: "user" | "assistant", content: string, generativeUI?: GenerativeUIComponent[], metadata?: Record<string, unknown>, attachments?: ChatAttachment[]) => Promise<void>;
  setStreaming: (streaming: boolean) => void;
  updateProject: (id: string, updates: Partial<Project>) => Promise<void>;
  buildFromStoryboard: (scenes: Scene[]) => void;
}) {
  const { project, content, attachments, referenceImageUrls, generationModels, promptOverrides, agentConfigs, addMessage, setStreaming, updateProject, buildFromStoryboard } = args;
  setStreaming(true);
  await addMessage(project.id, "user", content, undefined, undefined, attachments);

  const projectForRequest = {
    ...project,
    description: content,
    referenceImageUrls,
  };

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content }],
        project: projectForRequest,
        referenceImageUrls,
        projectId: project.id,
        generationModels,
        promptOverrides,
        agentConfigs,
      }),
    });
    const data = await response.json();
    const updates: Partial<Project> = {};

    for (const gui of (data.generativeUI ?? []) as GenerativeUIComponent[]) {
      if (gui.type === "creative_workflow_plan") {
        const plan = gui.data;
        updates.creativePlan = plan;
        updates.storyboard = {
          id: `sb-${Date.now()}`,
          scenes: plan.scenes,
          totalDuration: plan.scenes[plan.scenes.length - 1]?.endTime || 0,
          narrativeArc: plan.storyStructure.join(" -> "),
          notes: plan.summary,
        };
      }
      if (gui.type === "script_card") {
        const script = gui.data as VideoScript;
        updates.videoScript = script;
        updates.productionStep = "script";
        updates.creativePlan =
          updates.creativePlan ??
          buildCreativeWorkflowPlanWithPrompts(content, referenceImageUrls);
      }
      if (gui.type === "influencer_card" || gui.type === "background_card") {
        const asset = gui.data as ReusableAssetPlan;
        const plan = updates.creativePlan ?? projectForRequest.creativePlan;
        if (plan) {
          updates.creativePlan = {
            ...plan,
            approvalStatus: "approved",
            reusableAssets: plan.reusableAssets.map((item) => (item.id === asset.id ? asset : item)),
          };
        }
        updates.productionStep = gui.type === "influencer_card" ? "influencer" : "background";
      }
      if (gui.type === "frames_card") {
        const scenes = gui.data.scenes;
        const plan = updates.creativePlan ?? projectForRequest.creativePlan;
        if (plan) {
          updates.creativePlan = { ...plan, scenes, approvalStatus: "assets_generated" };
        }
        updates.storyboard = {
          id: `sb-${Date.now()}`,
          scenes,
          totalDuration: scenes[scenes.length - 1]?.endTime || 0,
          narrativeArc: plan?.storyStructure.join(" -> ") ?? "AI-generated from references",
          notes: plan?.summary,
        };
        updates.productionStep = "frames";
      }
    }

    await updateProject(project.id, updates);
    if (data.metadata?.attachmentAnalyses) {
      await updateProject(project.id, { attachmentAnalyses: data.metadata.attachmentAnalyses });
    }
    await addMessage(project.id, "assistant", data.content, data.generativeUI, {
      step: data.step,
      totalSteps: data.totalSteps,
      phase: data.phase,
      model: data.metadata?.model,
      productionStep: data.metadata?.productionStep,
    });

    if (data.phase === "workflow" && updates.storyboard?.scenes) {
      buildFromStoryboard(updates.storyboard.scenes);
      await updateProject(project.id, { currentPhase: "workflow", status: "in_progress" });
    }
  } catch {
    await addMessage(
      project.id,
      "assistant",
      "I saved your prompt and references, but the planning request failed. Send it again from the agent panel to continue.",
    );
  } finally {
    setStreaming(false);
  }
}

function sceneFrameUrl(scene?: Scene) {
  return scene?.startFrameUrl ?? scene?.generatedStartFrameUrl ?? scene?.referenceImageUrls?.[0];
}

function projectScenes(project: Project) {
  return project.storyboard?.scenes ?? project.creativePlan?.scenes ?? [];
}

function workspaceStage(project: Project): "empty" | "planning" | "ready" {
  const scenes = projectScenes(project);
  const hasFrames = scenes.some((scene) => sceneFrameUrl(scene));
  const hasAssets = Boolean(project.creativePlan?.reusableAssets.some((asset) => asset.generatedImageUrl));
  const hasScript = Boolean(project.videoScript);

  if (!hasFrames && !hasAssets && !hasScript && scenes.length === 0) return "empty";
  if (!hasFrames && !hasAssets) return "planning";
  return "ready";
}

function formatProjectTime(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.max(1, Math.round(diff / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(date).toLocaleDateString();
}

export function ModernMainContent({
  projectRailOpen = true,
  onToggleProjectRail,
}: ModernMainContentProps) {
  const { currentProjectId, getCurrentProject } = useProjectStore();
  const currentProject = getCurrentProject();

  if (!currentProjectId || !currentProject) {
    return <AgentHome />;
  }

  return (
    <AgentWorkspace
      project={currentProject}
      projectRailOpen={projectRailOpen}
      onToggleProjectRail={onToggleProjectRail}
    />
  );
}

function AgentHome() {
  const { createProject, updateProject } = useProjectStore();
  const { addMessage, setStreaming } = useChatStore();
  const { buildFromStoryboard } = useWorkflowStore();
  const generationModels = useSettingsStore((s) => s.settings.generationModels);
  const promptOverrides = useSettingsStore((s) => s.settings.promptOverrides);
  const agentConfigs = useSettingsStore((s) => s.settings.agentConfigs);
  const [prompt, setPrompt] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [issues, setIssues] = useState<AttachmentIssue[]>([]);
  const [isStarting, setIsStarting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canSubmit = prompt.trim().length > 0 || attachments.length > 0;

  const attachImages = (files: FileList | null) => {
    if (!files?.length) return;
    const nextIssues: AttachmentIssue[] = [];
    Array.from(files).slice(0, 6).forEach((file) => {
      if (!file.type.startsWith("image/")) {
        nextIssues.push({ id: `${file.name}-type`, message: `${file.name} is not an image.` });
        return;
      }
      if (file.size > 4 * 1024 * 1024) {
        nextIssues.push({ id: `${file.name}-size`, message: `${file.name} is larger than 4MB.` });
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setAttachments((prev) => [
          ...prev,
          { type: "image" as const, url: reader.result as string, name: file.name },
        ].slice(0, 6));
      };
      reader.onerror = () => {
        setIssues((prev) => [
          ...prev,
          { id: `${file.name}-read`, message: `Could not read ${file.name}. Try another image.` },
        ]);
      };
      reader.readAsDataURL(file);
    });
    if (nextIssues.length) setIssues((prev) => [...nextIssues, ...prev].slice(0, 4));
  };

  const startProject = async (overridePrompt?: string) => {
    const content =
      overridePrompt?.trim() ||
      prompt.trim() ||
      (attachments.length ? "Create a video using these reference images." : "");
    if (!content || isStarting) return;

    setIsStarting(true);
    const project = await createProject(content.slice(0, 46), content);
    const refUrls = attachments.map((item) => item.url);
    if (refUrls.length) {
      await updateProject(project.id, { referenceImageUrls: refUrls });
    }

    try {
      await runPlanningTurn({
        project,
        content,
        attachments,
        referenceImageUrls: refUrls,
        generationModels,
        promptOverrides,
        agentConfigs,
        addMessage,
        setStreaming,
        updateProject,
        buildFromStoryboard,
      });
    } finally {
      setPrompt("");
      setAttachments([]);
      setIsStarting(false);
    }
  };

  return (
    <div className="relative h-full overflow-hidden bg-background bg-[radial-gradient(circle_at_top,rgba(45,212,191,0.18),transparent_34%)]">
      <TopActions />
      <ScrollArea className="h-full">
        <div className="mx-auto flex min-h-full max-w-6xl flex-col px-4 pb-12 pt-16 sm:px-8">
          <section className="mb-10 text-center">
            <Badge variant="outline" className="mb-4 border-primary/20 bg-primary/10 text-primary shadow-sm">
              <Sparkles className="h-3.5 w-3.5" />
              AI video production workspace
            </Badge>
            <h1 className="text-4xl font-semibold tracking-normal text-foreground md:text-5xl">
              Plan, review, and generate one coherent video.
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
              Start with a concept and optional references. OpenScene will turn them into reviewable creative artifacts before final generation.
            </p>
          </section>

          <section className="mx-auto w-full max-w-4xl rounded-[28px] border border-border bg-card/90 p-4 shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur-xl">
            <div className="mb-3 flex flex-wrap gap-2">
              <ModePill icon={User2} label="Avatar" value="Review first" />
              <ModePill icon={Mic2} label="Voice" value="Approve" />
              <ModePill icon={ShieldCheck} label="Continuity" value="Shared context" />
            </div>

            <Textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Describe the video, audience, style, product, character, or story..."
              className="min-h-[116px] resize-none border-0 bg-transparent px-1 text-lg text-foreground shadow-none focus-visible:ring-0"
              disabled={isStarting}
            />

            <ReferenceStrip
              attachments={attachments}
              issues={issues}
              onRemove={(index) => setAttachments((prev) => prev.filter((_, i) => i !== index))}
              onDismissIssue={(id) => setIssues((prev) => prev.filter((issue) => issue.id !== id))}
            />

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    attachImages(event.target.files);
                    event.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="rounded-full"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isStarting}
                  aria-label="Attach reference images"
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="rounded-full" aria-label="Output settings">
                  <Settings2 className="h-4 w-4" />
                </Button>
              </div>
              <Button
                type="button"
                className="rounded-full px-6"
                onClick={() => startProject()}
                disabled={!canSubmit || isStarting}
              >
                {isStarting ? "Creating..." : "Create Workspace"}
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </section>

          <div className="mx-auto mt-5 flex max-w-4xl flex-wrap justify-center gap-2">
            {SHORTCUT_PROMPTS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => startProject(item)}
                disabled={isStarting}
                className="rounded-full border border-border bg-card/80 px-4 py-2 text-sm font-medium text-foreground shadow-sm transition hover:border-primary/40 hover:bg-primary/10"
              >
                {item}
              </button>
            ))}
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-3">
            <CapabilityCard icon={BadgeCheck} title="Review gates" copy="Approve, edit, or regenerate creative decisions before they guide the video." />
            <CapabilityCard icon={Layers3} title="Continuity context" copy="Character, lighting, references, style, and scene intent stay visible as one source of truth." />
            <CapabilityCard icon={Film} title="Production workspace" copy="Move from chat planning into workflow, timeline, and export without losing context." />
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

function AgentWorkspace({
  project,
  projectRailOpen,
  onToggleProjectRail,
}: {
  project: Project;
  projectRailOpen: boolean;
  onToggleProjectRail?: () => void;
}) {
  const setPhase = useProjectStore((s) => s.setPhase);
  const progress = projectProgress(project);
  const chatOpen = true;
  const [inspectorOpen, setInspectorOpen] = usePersistedState(INSPECTOR_OPEN_KEY, false);
  const contentMode = project.currentPhase === "workflow" || project.currentPhase === "timeline";

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden bg-background">
      <div className="flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-card/92 px-4 py-3 backdrop-blur sm:flex-nowrap sm:gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {onToggleProjectRail && !projectRailOpen && (
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 rounded-full text-muted-foreground hover:bg-muted"
              onClick={onToggleProjectRail}
              aria-label="Show workspace panel"
              title="Show workspace panel"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </Button>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-base font-semibold text-foreground md:text-lg">{project.name}</h1>
              <StatusBadge project={project} />
            </div>
            <p className="truncate text-xs text-muted-foreground">{project.description || "AI-assisted video workspace"}</p>
          </div>
        </div>

        <div className="flex max-w-full shrink-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2">
          <ViewButton active={project.currentPhase === "chat"} icon={MessageSquareText} label="Agent" onClick={() => setPhase("chat")} />
          <ViewButton active={project.currentPhase === "workflow"} icon={Layers3} label="Workflow" onClick={() => setPhase("workflow")} />
          <ViewButton active={project.currentPhase === "timeline"} icon={Film} label="Timeline" onClick={() => setPhase("timeline")} />
          <Button
            variant={inspectorOpen ? "default" : "outline"}
            size="sm"
            className="rounded-full"
            onClick={() => setInspectorOpen((value) => !value)}
          >
            {inspectorOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
            <span className="hidden sm:inline">Details</span>
          </Button>
        </div>
      </div>

      <ResizablePanelGroup
        direction="horizontal"
        autoSaveId={WORKSPACE_PANELS_STORAGE_KEY}
        className="min-h-0 flex-1 overflow-hidden"
      >
        {chatOpen && (
          <>
            <ResizablePanel
              id="agent-chat"
              order={1}
              defaultSize={28}
              minSize={22}
              maxSize={46}
              collapsible
              collapsedSize={6}
              className="min-w-0 overflow-hidden border-r border-border bg-card"
            >
              <ChatView />
            </ResizablePanel>
            <ResizableHandle id="agent-chat-resize" className="bg-border" />
          </>
        )}
        <ResizablePanel
          id="agent-stage"
          order={2}
          defaultSize={inspectorOpen ? (chatOpen ? 50 : 78) : chatOpen ? 72 : 100}
          minSize={40}
          className="min-w-0 overflow-hidden"
        >
          <main className="h-full min-w-0 overflow-hidden bg-background">
            {project.currentPhase === "workflow" ? (
              <WorkflowView />
            ) : project.currentPhase === "timeline" ? (
              <TimelineView />
            ) : (
              <ArtifactPreview project={project} spacious={!chatOpen && !inspectorOpen} compact={chatOpen && inspectorOpen && !contentMode} />
            )}
          </main>
        </ResizablePanel>
        {inspectorOpen && (
          <>
            <ResizableHandle id="agent-inspector-resize" className="bg-border" />
            <ResizablePanel
              id="agent-inspector"
              order={3}
              defaultSize={22}
              minSize={16}
              maxSize={36}
              className="min-w-0 overflow-hidden border-l border-border bg-card"
            >
              <WorkspaceInspector project={project} progress={progress} />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </div>
  );
}

function ViewButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof MessageSquareText;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      variant={active ? "default" : "outline"}
      size="sm"
      className="rounded-full"
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <Icon className="h-4 w-4" />
      <span className="hidden sm:inline">{label}</span>
    </Button>
  );
}

function ArtifactPreview({
  project,
  spacious,
  compact,
}: {
  project: Project;
  spacious?: boolean;
  compact?: boolean;
}) {
  const stage = workspaceStage(project);
  const maxWidth = spacious ? "max-w-7xl" : compact ? "max-w-5xl" : "max-w-6xl";

  if (stage === "empty") {
    return (
      <ScrollArea className="h-full">
        <div className={`@container mx-auto flex min-h-full flex-col px-5 py-5 md:px-7 ${maxWidth}`}>
          <EarlyArtifactWorkspace project={project} />
        </div>
      </ScrollArea>
    );
  }

  const heroScene = projectScenes(project).find((scene) => sceneFrameUrl(scene)) ?? projectScenes(project)[0];
  const heroAsset = firstGeneratedAsset(project.creativePlan);
  const script = project.videoScript;
  const plan = project.creativePlan;
  const scenes = projectScenes(project);

  return (
    <ScrollArea className="h-full">
      <div className={`@container mx-auto px-5 py-5 md:px-7 ${maxWidth}`}>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <Badge variant="outline" className="mb-2 border-primary/20 bg-primary/10 text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Review workspace
            </Badge>
            <h2 className="text-2xl font-semibold text-foreground">Creative artifacts</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Generated outputs stay traceable here before they move into workflow and timeline.
            </p>
          </div>
          <NextAction project={project} />
        </div>

        <div className="grid gap-5 @2xl:grid-cols-[minmax(360px,1.2fr)_minmax(280px,0.8fr)]">
          <section className="overflow-hidden rounded-[8px] border border-border bg-neutral-950 shadow-sm">
            <div className="relative aspect-video bg-neutral-900">
              {sceneFrameUrl(heroScene) ? (
                <img src={sceneFrameUrl(heroScene)} alt={heroScene?.title ?? "Storyboard frame"} className="h-full w-full object-cover" />
              ) : heroAsset?.generatedImageUrl ? (
                <img src={heroAsset.generatedImageUrl} alt={heroAsset.name} className="h-full w-full object-cover" />
              ) : (
                <PlanningPreviewPlaceholder project={project} stage={stage} />
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-5 text-white">
                <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Current preview</p>
                <h3 className="mt-1 text-xl font-semibold">{heroScene?.title ?? heroAsset?.name ?? plan?.concept ?? project.name}</h3>
                <p className="mt-1 line-clamp-2 text-sm text-white/72">
                  {heroScene?.visualDirection ?? heroScene?.prompt ?? heroAsset?.consistencyNotes ?? plan?.summary ?? project.description}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-[8px] border border-border bg-card p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Creative lockups</h3>
              <Badge variant="secondary">{project.creativePlan?.approvalStatus ?? "draft"}</Badge>
            </div>
            <div className="space-y-3">
              <ReviewRow icon={Clapperboard} title="Concept" value={plan?.summary ?? project.description} ready={Boolean(plan)} />
              <ReviewRow icon={User2} title="Avatar / identity" value={plan?.reusableAssets.find((item) => item.type === "influencer" || item.type === "character")?.name ?? "Awaiting generation"} ready={Boolean(plan?.reusableAssets.some((item) => item.generatedImageUrl))} />
              <ReviewRow icon={Mic2} title="Voice" value={script?.narrationStyle ?? "Voice direction will be generated with script"} ready={Boolean(script)} />
              <ReviewRow icon={ShieldCheck} title="Global style" value={plan?.toneAndStyle ?? "Not locked yet"} ready={Boolean(plan?.toneAndStyle)} />
            </div>
          </section>
        </div>

        <section className="mt-5 rounded-[8px] border border-border bg-card p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-foreground">Scene continuity</h3>
            <Badge variant="outline">{scenes.length} scenes</Badge>
          </div>
          {scenes.length > 0 ? (
            <div className="grid gap-3 @sm:grid-cols-2 @xl:grid-cols-3">
              {scenes.map((scene) => (
                <SceneArtifact key={scene.id} scene={scene} />
              ))}
            </div>
          ) : (
            <EmptyArtifact compact />
          )}
        </section>

        {script && (
          <section className="mt-5 rounded-[8px] border border-border bg-card p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Script review</h3>
              <Badge variant={script.approvalStatus === "approved" ? "default" : "secondary"}>{script.approvalStatus}</Badge>
            </div>
            <div className="grid gap-3 @lg:grid-cols-2">
              {script.scenes.map((scene) => (
                <div key={scene.id} className="rounded-[8px] border border-border bg-muted/40 p-3">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="font-medium text-foreground">{scene.title}</p>
                    <span className="text-xs text-muted-foreground">{scene.durationSeconds}s</span>
                  </div>
                  <p className="text-sm leading-6 text-muted-foreground">{scene.narration}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </ScrollArea>
  );
}

function WorkspaceInspector({ project, progress }: { project: Project; progress: number }) {
  const refs = project.referenceImageUrls ?? [];
  const activeIndex = currentStepIndex(project);
  const plan = project.creativePlan;
  const analyses = project.attachmentAnalyses ?? [];
  const planProgress = plan?.progress;
  const completedSteps = planProgress?.completedSteps ?? [];
  const pendingSteps = planProgress?.pendingSteps ?? [];
  const missingInputs = planProgress?.missingInputs ?? [];
  const generatedAssets = plan?.reusableAssets.filter((a) => a.generationStatus === 'generated') ?? [];
  const pendingAssets = plan?.reusableAssets.filter((a) => a.generationStatus !== 'generated') ?? [];
  const failedAssets = plan?.reusableAssets.filter((a) => a.generationStatus === 'failed') ?? [];
  const generatedFrames = plan?.scenes.filter((s) => s.frameGenerationStatus === 'generated') ?? [];
  const pendingFrames = plan?.scenes.filter((s) => s.frameGenerationStatus !== 'generated') ?? [];

  return (
    <ScrollArea className="h-full">
      <div className="space-y-5 p-4">
        <section className="rounded-[8px] border border-border bg-muted/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold text-foreground">Generation status</h3>
            <span className="text-sm font-semibold text-primary">{progress}%</span>
          </div>
          <Progress value={progress} className="h-2 bg-muted [&>div]:bg-primary" />
          <div className="mt-4 space-y-3">
            {CREATIVE_STEPS.map((step, index) => {
              const done = index < activeIndex;
              const current = index === activeIndex;
              return (
                <div key={step.id} className="flex gap-3">
                  <div className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full border ${done ? "border-primary bg-primary text-primary-foreground" : current ? "border-foreground bg-card text-foreground" : "border-border bg-card text-muted-foreground"}`}>
                    {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <span className="h-2 w-2 rounded-full bg-current" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{step.label}</p>
                    <p className="text-xs leading-5 text-muted-foreground">{step.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {plan && (
          <section className="rounded-[8px] border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Plan</h3>
              <Badge variant={plan.approvalStatus === 'approved' || plan.approvalStatus === 'assets_generated' ? 'default' : 'secondary'}>
                {plan.approvalStatus ?? 'draft'}
              </Badge>
            </div>
            <div className="space-y-3 text-sm">
              <ContextLine label="Concept" value={plan.concept} />
              <ContextLine label="Target viewer" value={plan.targetViewer} />
              <ContextLine label="Tone & style" value={plan.toneAndStyle} />
              <ContextLine label="Suggested aspect ratio" value={plan.suggestedAspectRatio} />
              <ContextLine label="Suggested duration" value={plan.suggestedDuration ? `${plan.suggestedDuration}s` : undefined} />
              <ContextLine label="Scenes" value={`${plan.scenes.length}`} />
            </div>
            {missingInputs.length > 0 && (
              <div className="mt-3 rounded-[8px] border border-amber-300/60 bg-amber-50 p-3">
                <p className="text-xs font-semibold text-amber-800">Missing inputs</p>
                <ul className="mt-1 space-y-1">
                  {missingInputs.map((m, i) => (
                    <li key={i} className="text-xs text-amber-800">• {m}</li>
                  ))}
                </ul>
              </div>
            )}
            {(completedSteps.length > 0 || pendingSteps.length > 0) && (
              <div className="mt-3 space-y-1.5">
                {completedSteps.map((s) => (
                  <div key={`done-${s}`} className="flex items-center gap-2 text-xs text-emerald-600">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span className="capitalize">{s.replace(/_/g, ' ')}</span>
                  </div>
                ))}
                {pendingSteps.map((s) => (
                  <div key={`pending-${s}`} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock3 className="h-3.5 w-3.5" />
                    <span className="capitalize">{s.replace(/_/g, ' ')}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {plan && plan.reusableAssets.length > 0 && (
          <section className="rounded-[8px] border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Required assets</h3>
              <Badge variant="outline">{generatedAssets.length}/{plan.reusableAssets.length} ready</Badge>
            </div>
            <div className="space-y-2">
              {plan.reusableAssets.map((asset) => (
                <div key={asset.id} className="flex items-center gap-3 rounded-[8px] border border-border bg-muted/30 p-2.5">
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-[6px] border border-border bg-muted">
                    {asset.generatedImageUrl ? (
                      <img src={asset.generatedImageUrl} alt={asset.name} className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                        <ImagePlus className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{asset.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{asset.description || asset.consistencyNotes || 'Reusable asset'}</p>
                  </div>
                  <Badge
                    variant={asset.generationStatus === 'generated' ? 'default' : asset.generationStatus === 'failed' ? 'destructive' : 'secondary'}
                    className="capitalize"
                  >
                    {asset.generationStatus}
                  </Badge>
                </div>
              ))}
            </div>
            {failedAssets.length > 0 && (
              <p className="mt-2 text-xs text-red-500">{failedAssets.length} asset{failedAssets.length === 1 ? '' : 's'} failed to generate. Retry from chat.</p>
            )}
            {pendingAssets.length > 0 && pendingAssets.some((a) => a.criticality === 'critical') && (
              <p className="mt-2 text-xs text-amber-600">Critical assets still pending — generate them before frames.</p>
            )}
          </section>
        )}

        {plan && plan.scenes.length > 0 && (
          <section className="rounded-[8px] border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Scenes & frames</h3>
              <Badge variant="outline">{generatedFrames.length}/{plan.scenes.length} framed</Badge>
            </div>
            <div className="space-y-2">
              {plan.scenes.map((scene) => {
                const req = planProgress?.sceneFrameRequirements.find((r) => r.sceneId === scene.id);
                return (
                  <div key={scene.id} className="rounded-[8px] border border-border bg-muted/30 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-foreground">{scene.title}</p>
                      <Badge variant={scene.frameGenerationStatus === 'generated' ? 'default' : 'secondary'} className="capitalize">
                        {scene.frameGenerationStatus ?? 'pending'}
                      </Badge>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{scene.sceneGoal || scene.prompt}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
                      <span>{scene.duration}s</span>
                      <span>·</span>
                      <span className="capitalize">{scene.cameraMovement.replace(/_/g, ' ')}</span>
                      {req && (
                        <>
                          <span>·</span>
                          <span>{req.needsStartFrame ? 'start' : 'no start'}{req.needsEndFrame ? ' + end' : ''}</span>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {pendingFrames.length > 0 && generatedAssets.length > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">{pendingFrames.length} scene{pendingFrames.length === 1 ? '' : 's'} still need frames.</p>
            )}
          </section>
        )}

        {analyses.length > 0 && (
          <section className="rounded-[8px] border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Attachment analyses</h3>
              <Badge variant="outline">{analyses.length}</Badge>
            </div>
            <div className="space-y-2">
              {analyses.map((a) => (
                <div key={a.hash} className="flex gap-3 rounded-[8px] border border-border bg-muted/30 p-2.5">
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-[6px] border border-border bg-muted">
                    <img src={a.url} alt={a.category} className="h-full w-full object-cover" loading="lazy" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold capitalize text-foreground">{a.category}</p>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{a.description || a.inferredPurpose || 'Analyzed attachment'}</p>
                    {a.needsClarification && a.clarificationQuestion && (
                      <p className="mt-1 text-[10px] text-amber-600">⚠ {a.clarificationQuestion}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="rounded-[8px] border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold text-foreground">References</h3>
            <Badge variant={refs.length ? "default" : "secondary"}>{refs.length}</Badge>
          </div>
          {refs.length ? (
            <div className="grid grid-cols-3 gap-2">
              {refs.slice(0, 6).map((url, index) => (
                <div key={`${url}-${index}`} className="overflow-hidden rounded-[8px] border border-border">
                  <img src={url} alt={`Reference ${index + 1}`} className="aspect-square w-full object-cover" loading="lazy" />
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-[8px] border border-dashed border-border bg-muted/40 p-3 text-sm leading-6 text-muted-foreground">
              Attach reference images in the agent panel so style, product, and identity remain visible to generation.
            </p>
          )}
        </section>

        <section className="rounded-[8px] border border-border bg-card p-4">
          <h3 className="mb-3 font-semibold text-foreground">Continuity context</h3>
          <div className="space-y-3 text-sm">
            <ContextLine label="Style" value={project.creativePlan?.toneAndStyle} />
            <ContextLine label="Audience" value={project.creativePlan?.targetViewer} />
            <ContextLine label="Rules" value={project.creativePlan?.consistencyRequirements.join(" ")} />
            <ContextLine label="Assets" value={project.creativePlan?.reusableAssets.map((item) => item.name).join(", ")} />
          </div>
        </section>
      </div>
    </ScrollArea>
  );
}

function TopActions() {
  return (
    <div className="absolute right-6 top-4 z-10 flex items-center gap-2">
      <Button variant="outline" size="icon" className="rounded-full bg-card/70 backdrop-blur" aria-label="Search">
        <Search className="h-4 w-4" />
      </Button>
      <Button variant="outline" size="icon" className="rounded-full bg-card/70 backdrop-blur" aria-label="Notifications">
        <Bell className="h-4 w-4" />
      </Button>
    </div>
  );
}

function ModePill({ icon: Icon, label, value }: { icon: typeof User2; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-2 text-sm">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-card shadow-sm">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </span>
      <span className="font-medium text-foreground">{label}</span>
      <span className="text-xs text-muted-foreground">{value}</span>
    </div>
  );
}

function ReferenceStrip({
  attachments,
  issues,
  onRemove,
  onDismissIssue,
}: {
  attachments: ChatAttachment[];
  issues: AttachmentIssue[];
  onRemove: (index: number) => void;
  onDismissIssue: (id: string) => void;
}) {
  if (!attachments.length && !issues.length) return null;

  return (
    <div className="mt-3 space-y-2">
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((attachment, index) => (
            <div key={`${attachment.name}-${index}`} className="group relative h-16 w-16 overflow-hidden rounded-[8px] border border-border bg-muted">
              <img src={attachment.url} alt={attachment.name} className="h-full w-full object-cover" />
              <button
                type="button"
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/65 text-white opacity-0 transition group-hover:opacity-100"
                onClick={() => onRemove(index)}
                aria-label={`Remove ${attachment.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          <div className="flex h-16 min-w-36 items-center rounded-[8px] border border-dashed border-primary/30 bg-primary/10 px-3 text-xs leading-5 text-primary">
            References will be sent with the generation context.
          </div>
        </div>
      )}
      {issues.map((issue) => (
        <div key={issue.id} className="flex items-center justify-between gap-3 rounded-[8px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <span>{issue.message}</span>
          <button type="button" onClick={() => onDismissIssue(issue.id)} aria-label="Dismiss attachment issue">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

function CapabilityCard({ icon: Icon, title, copy }: { icon: typeof BadgeCheck; title: string; copy: string }) {
  return (
    <div className="rounded-[8px] border border-border bg-card/80 p-5 shadow-sm backdrop-blur">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-[8px] bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="font-semibold text-foreground">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy}</p>
    </div>
  );
}

function StatusBadge({ project }: { project: Project }) {
  const label =
    project.currentPhase === "timeline"
      ? "Finalizing"
      : project.currentPhase === "workflow"
        ? "Workflow"
        : project.productionStep
          ? project.productionStep
          : "Planning";

  return (
    <Badge variant="outline" className="border-primary/20 bg-primary/10 text-primary capitalize">
      {label}
    </Badge>
  );
}

function NextAction({ project }: { project: Project }) {
  const setPhase = useProjectStore((s) => s.setPhase);
  if (project.currentPhase === "workflow") {
    return (
      <Button className="rounded-full" onClick={() => setPhase("timeline")}>
        Open Timeline
        <ArrowRight className="h-4 w-4" />
      </Button>
    );
  }
  if (project.creativePlan?.approvalStatus === "assets_generated") {
    return (
      <Button className="rounded-full" onClick={() => setPhase("workflow")}>
        Continue to Workflow
        <ArrowRight className="h-4 w-4" />
      </Button>
    );
  }
  return (
    <Button variant="outline" className="rounded-full" onClick={() => setPhase("chat")}>
      Review in Agent
      <SlidersHorizontal className="h-4 w-4" />
    </Button>
  );
}

function ReviewRow({
  icon: Icon,
  title,
  value,
  ready,
}: {
  icon: typeof Clapperboard;
  title: string;
  value?: string;
  ready: boolean;
}) {
  return (
    <div className="flex gap-3 rounded-[8px] border border-border bg-muted/40 p-3">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] ${ready ? "bg-primary/15 text-primary" : "bg-card text-muted-foreground"}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-foreground">{title}</p>
          {ready ? <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> : <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{value || "Awaiting generation"}</p>
      </div>
    </div>
  );
}

function SceneArtifact({ scene }: { scene: Scene }) {
  const frameUrl = sceneFrameUrl(scene);
  return (
    <article className="overflow-hidden rounded-[8px] border border-border bg-muted/40">
      <div className="aspect-video bg-muted">
        {frameUrl ? (
          <img src={frameUrl} alt={scene.title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Boxes className="h-6 w-6" />
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="mb-1 flex items-center justify-between gap-2">
          <h4 className="truncate text-sm font-semibold text-foreground">{scene.title}</h4>
          <Badge variant="outline" className="bg-card">{scene.duration}s</Badge>
        </div>
        <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">{scene.sceneGoal || scene.visualDirection || scene.prompt}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Badge variant="secondary" className="capitalize">{scene.cameraMovement.replace(/_/g, " ")}</Badge>
          <Badge variant="secondary" className="capitalize">{scene.mood}</Badge>
        </div>
      </div>
    </article>
  );
}

const PIPELINE_STEPS = [
  { id: "concept", label: "Concept", icon: Clapperboard, description: "Goal, audience, and references" },
  { id: "script", label: "Script", icon: Mic2, description: "Narration and scene beats" },
  { id: "assets", label: "Assets", icon: User2, description: "Character, product, and style lockups" },
  { id: "storyboard", label: "Storyboard", icon: Layers3, description: "Continuity-aware start/end frames" },
  { id: "workflow", label: "Workflow", icon: Film, description: "Editable production graph" },
] as const;

function EarlyArtifactWorkspace({ project }: { project: Project }) {
  const refs = project.referenceImageUrls ?? [];
  const activeStep = currentStepIndex(project);
  const { updateProject } = useProjectStore();
  const setPhase = useProjectStore((s) => s.setPhase);
  const { addMessage, setStreaming, isStreaming } = useChatStore();
  const { buildFromStoryboard } = useWorkflowStore();
  const generationModels = useSettingsStore((s) => s.settings.generationModels);
  const promptOverrides = useSettingsStore((s) => s.settings.promptOverrides);
  const agentConfigs = useSettingsStore((s) => s.settings.agentConfigs);
  const [isStarting, setIsStarting] = useState(false);

  const quickStart = async (promptText: string) => {
    if (isStarting || isStreaming) return;
    setIsStarting(true);
    setPhase("chat");
    try {
      await runPlanningTurn({
        project,
        content: promptText,
        attachments: [],
        referenceImageUrls: refs,
        generationModels,
        promptOverrides,
        agentConfigs,
        addMessage,
        setStreaming,
        updateProject,
        buildFromStoryboard,
      });
    } finally {
      setIsStarting(false);
    }
  };

  const busy = isStarting || isStreaming;

  return (
    <div className="relative flex flex-1 flex-col gap-6 py-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Badge variant="outline" className="mb-2 border-primary/20 bg-primary/10 text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Review workspace
          </Badge>
          <h2 className="text-xl font-semibold text-foreground md:text-2xl">{project.name}</h2>
          <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
            {project.description || "Describe your video in the agent panel. Artifacts will appear here as the plan takes shape."}
          </p>
        </div>
        <NextAction project={project} />
      </div>

      {/* Cinematic hero: stylized filmstrip preview + guided copy */}
      <section className="relative overflow-hidden rounded-2xl border border-border bg-neutral-950 shadow-[0_18px_60px_rgba(15,23,42,0.25)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_15%,rgba(45,212,191,0.22),transparent_45%),radial-gradient(circle_at_85%_10%,rgba(56,189,248,0.16),transparent_40%)]" />
        <div className="relative grid gap-0 @2xl:grid-cols-[1.05fr_0.95fr]">
          <div className="flex flex-col justify-center p-6 text-white md:p-8">
            <div className="mb-4 inline-flex w-fit items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-200">
              <Sparkles className="h-3.5 w-3.5" />
              Ready to plan
            </div>
            <h3 className="text-xl font-semibold leading-tight md:text-2xl">Your storyboard will land here</h3>
            <p className="mt-2 max-w-md text-sm leading-6 text-white/70">
              Describe the video on the left, attach references, and approve a plan. Scene frames, avatar lockups, and continuity notes fill this board automatically.
            </p>

            {refs.length > 0 ? (
              <div className="mt-5">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-white/55">Attached references</p>
                <div className="flex flex-wrap gap-2">
                  {refs.slice(0, 5).map((url, index) => (
                    <div key={`${url.slice(0, 24)}-${index}`} className="h-14 w-14 overflow-hidden rounded-lg border border-white/15 bg-white/5 shadow-sm">
                      <img src={url} alt={`Reference ${index + 1}`} className="h-full w-full object-cover" loading="lazy" />
                    </div>
                  ))}
                  {refs.length > 5 && (
                    <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-white/20 bg-white/5 text-xs text-white/60">
                      +{refs.length - 5}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-5 flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/55">
                <Paperclip className="h-3.5 w-3.5" />
                No references yet — attach product, character, or style images in the agent panel.
              </div>
            )}
          </div>

          {/* Faux filmstrip — communicates the end-state visually */}
          <div className="relative min-h-[240px] border-t border-white/10 p-5 @2xl:min-h-0 @2xl:border-l @2xl:border-t-0">
            <div className="absolute right-5 top-5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-white/45">
              <Film className="h-3.5 w-3.5" />
              Storyboard preview
            </div>
            <div className="flex h-full flex-col justify-center gap-3">
              <div className="grid grid-cols-3 gap-2.5">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="group relative aspect-video overflow-hidden rounded-lg border border-white/10 bg-gradient-to-br from-white/10 to-white/5"
                  >
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(45,212,191,0.18),transparent_60%)]" />
                    <div className="absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-md bg-black/40 text-[10px] font-semibold text-white/70">
                      {i + 1}
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center opacity-70">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-white/5">
                        <Play className="h-3 w-3 text-white/60" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                {[3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="relative aspect-video overflow-hidden rounded-lg border border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.03]"
                  >
                    <div className="absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-md bg-black/40 text-[10px] font-semibold text-white/55">
                      {i + 1}
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <ImagePlus className="h-4 w-4 text-white/35" />
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-white/55">
                <span className="flex items-center gap-1.5"><Clapperboard className="h-3.5 w-3.5" /> 6 scenes · ~30s</span>
                <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Shared continuity</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Quick-start — actually sends a planning turn for this project */}
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold text-foreground">Start with a prompt</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Send one of these to the agent — your plan will populate here.</p>
          </div>
          <Badge variant="outline" className="gap-1">
            <Sparkles className="h-3 w-3" />
            Quick start
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {SHORTCUT_PROMPTS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => quickStart(item)}
              disabled={busy}
              className="group flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3.5 py-2 text-left text-xs font-medium text-foreground shadow-sm transition hover:border-primary/40 hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5 text-muted-foreground transition group-hover:text-primary" />
              <span className="max-w-[280px] truncate">{item}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Compact horizontal pipeline with connecting line */}
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-5">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold text-foreground">Production pipeline</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Each step unlocks the next review gate.</p>
          </div>
          <Badge variant="outline">{Math.round((activeStep / (PIPELINE_STEPS.length - 1)) * 100)}% started</Badge>
        </div>
        <div className="relative">
          <div className="absolute left-0 right-0 top-4 h-px bg-border" aria-hidden />
          <div
            className="absolute left-0 top-4 h-px bg-primary/60 transition-all"
            style={{ width: `${(activeStep / (PIPELINE_STEPS.length - 1)) * 100}%` }}
            aria-hidden
          />
          <div className="relative grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            {PIPELINE_STEPS.map((step, index) => {
              const done = index < activeStep;
              const current = index === activeStep;
              const Icon = step.icon;
              return (
                <div key={step.id} className="flex flex-col gap-2 pt-1">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 bg-card transition-colors ${
                        done || current ? "border-primary text-primary" : "border-border text-muted-foreground"
                      }`}
                    >
                      {done ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                    </div>
                    {current && <span className="hidden text-xs font-medium text-primary xl:inline">In focus</span>}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{step.label}</p>
                    <p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">{step.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* What lands here — compact explainer */}
      <section className="grid gap-3 sm:grid-cols-3">
        <ExplainerCard icon={ImagePlus} title="Previews" copy="Hero frame and asset previews as they're generated." />
        <ExplainerCard icon={Layers3} title="Lockups" copy="Concept, avatar, voice, and global style in one review." />
        <ExplainerCard icon={Film} title="Scenes" copy="Continuity-aware scene cards with start/end frames." />
      </section>
    </div>
  );
}

function ExplainerCard({ icon: Icon, title, copy }: { icon: typeof Film; title: string; copy: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3.5">
      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{copy}</p>
    </div>
  );
}

function PlanningPreviewPlaceholder({
  project,
  stage,
}: {
  project: Project;
  stage: "planning" | "ready";
}) {
  const plan = project.creativePlan;
  return (
    <div className="flex h-full flex-col items-center justify-center bg-[radial-gradient(circle_at_center,rgba(45,212,191,0.14),transparent_58%)] px-6 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
        <ImagePlus className="h-5 w-5" />
      </div>
      <p className="text-sm font-medium text-neutral-200">
        {stage === "planning" ? "Plan approved — generation is next" : "Preview will appear after generation"}
      </p>
      <p className="mt-1 max-w-xs text-xs leading-5 text-neutral-400">
        {plan?.summary ?? project.description ?? "Storyboard frames and asset previews land here once generation starts."}
      </p>
    </div>
  );
}

function EmptyArtifact({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`rounded-xl border border-dashed border-border bg-muted/20 text-center ${compact ? "px-4 py-6" : "col-span-full p-8"}`}>
      <Wand2 className={`mx-auto text-primary ${compact ? "mb-2 h-5 w-5" : "mb-3 h-8 w-8"}`} />
      <h3 className={`font-semibold text-foreground ${compact ? "text-sm" : ""}`}>No storyboard yet</h3>
      <p className={`mt-1 text-muted-foreground ${compact ? "mx-auto max-w-sm text-xs leading-5" : "text-sm"}`}>
        Use the agent panel to generate a script, reusable assets, and continuity-aware scenes.
      </p>
    </div>
  );
}

function ContextLine({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 leading-6 text-foreground">{value || "Not set yet"}</p>
    </div>
  );
}
