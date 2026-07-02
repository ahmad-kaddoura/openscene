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
import type {
  ChatAttachment,
  CreativeWorkflowPlan,
  GenerativeUIComponent,
  Project,
  ProductionStep,
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

function sceneFrameUrl(scene?: Scene) {
  return scene?.startFrameUrl ?? scene?.generatedStartFrameUrl ?? scene?.referenceImageUrls?.[0];
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
    setStreaming(true);
    const project = await createProject(content.slice(0, 46), content);
    if (attachments.length) {
      await updateProject(project.id, { referenceImageUrls: attachments.map((item) => item.url) });
    }
    await addMessage(project.id, "user", content, undefined, undefined, attachments);

    try {
      const projectForRequest = {
        ...project,
        description: content,
        referenceImageUrls: attachments.map((item) => item.url),
      };
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content }],
          project: projectForRequest,
          referenceImageUrls: attachments.map((item) => item.url),
          projectId: project.id,
          generationModels,
          promptOverrides,
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
            buildCreativeWorkflowPlanWithPrompts(content, attachments.map((item) => item.url));
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
        "I created the workspace, but the first generation request failed. Your prompt and references are saved; send again from the agent panel.",
      );
    } finally {
      setPrompt("");
      setAttachments([]);
      setStreaming(false);
      setIsStarting(false);
    }
  };

  return (
    <div className="relative flex-1 overflow-hidden bg-[radial-gradient(circle_at_top,rgba(45,212,191,0.22),transparent_34%),linear-gradient(180deg,#f8fafc_0%,#ffffff_42%,#f8fafc_100%)]">
      <TopActions />
      <ScrollArea className="h-full">
        <div className="mx-auto flex min-h-full max-w-6xl flex-col px-8 pb-12 pt-16">
          <section className="mb-10 text-center">
            <Badge variant="outline" className="mb-4 border-cyan-200 bg-white/70 text-cyan-700 shadow-sm">
              <Sparkles className="h-3.5 w-3.5" />
              AI video production workspace
            </Badge>
            <h1 className="text-4xl font-semibold tracking-normal text-slate-950 md:text-5xl">
              Plan, review, and generate one coherent video.
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-600">
              Start with a concept and optional references. OpenScene will turn them into reviewable creative artifacts before final generation.
            </p>
          </section>

          <section className="mx-auto w-full max-w-4xl rounded-[28px] border border-white/80 bg-white/82 p-4 shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur-xl">
            <div className="mb-3 flex flex-wrap gap-2">
              <ModePill icon={User2} label="Avatar" value="Review first" />
              <ModePill icon={Mic2} label="Voice" value="Approve" />
              <ModePill icon={ShieldCheck} label="Continuity" value="Shared context" />
            </div>

            <Textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Describe the video, audience, style, product, character, or story..."
              className="min-h-[116px] resize-none border-0 bg-transparent px-1 text-lg shadow-none focus-visible:ring-0"
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
                className="rounded-full bg-slate-950 px-6 text-white hover:bg-slate-800"
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
                className="rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-cyan-200 hover:bg-cyan-50"
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
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const contentMode = project.currentPhase === "workflow" || project.currentPhase === "timeline";

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-slate-50">
      <div className="flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white/92 px-4 py-3 backdrop-blur">
        <div className="flex min-w-0 items-center gap-2">
          {onToggleProjectRail && !projectRailOpen && (
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full text-slate-600 hover:bg-slate-100"
              onClick={onToggleProjectRail}
              aria-label="Show workspace panel"
              title="Show workspace panel"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </Button>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-base font-semibold text-slate-950 md:text-lg">{project.name}</h1>
              <StatusBadge project={project} />
            </div>
            <p className="truncate text-xs text-slate-500">{project.description || "AI-assisted video workspace"}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
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
            Details
          </Button>
        </div>
      </div>

      <ResizablePanelGroup direction="horizontal" className="min-h-0 flex-1 overflow-hidden">
        {chatOpen && (
          <>
            <ResizablePanel
              id="agent-chat"
              order={1}
              defaultSize={28}
              minSize={18}
              maxSize={46}
              className="min-w-0 border-r border-slate-200 bg-white"
            >
              <ChatView />
            </ResizablePanel>
            <ResizableHandle id="agent-chat-resize" className="bg-slate-200" />
          </>
        )}
        <ResizablePanel id="agent-stage" order={2} defaultSize={inspectorOpen ? (chatOpen ? 50 : 78) : chatOpen ? 72 : 100} minSize={34}>
          <main className="h-full min-w-0 overflow-hidden bg-white">
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
            <ResizableHandle id="agent-inspector-resize" className="bg-slate-200" />
            <ResizablePanel
              id="agent-inspector"
              order={3}
              defaultSize={22}
              minSize={16}
              maxSize={36}
              className="min-w-0 border-l border-slate-200 bg-white"
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
      className={`rounded-full ${active ? "bg-slate-950 text-white hover:bg-slate-800" : "bg-white"}`}
      onClick={onClick}
    >
      <Icon className="h-4 w-4" />
      {label}
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
  const heroScene = project.storyboard?.scenes.find((scene) => sceneFrameUrl(scene)) ?? project.storyboard?.scenes[0];
  const heroAsset = firstGeneratedAsset(project.creativePlan);
  const script = project.videoScript;
  const plan = project.creativePlan;

  return (
    <ScrollArea className="h-full">
      <div className={`mx-auto px-5 py-5 md:px-7 ${spacious ? "max-w-7xl" : compact ? "max-w-4xl" : "max-w-6xl"}`}>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <Badge variant="outline" className="mb-2 border-cyan-200 bg-cyan-50 text-cyan-700">
              <Sparkles className="h-3.5 w-3.5" />
              Review workspace
            </Badge>
            <h2 className="text-2xl font-semibold text-slate-950">Creative artifacts</h2>
            <p className="mt-1 text-sm text-slate-500">
              Generated outputs stay traceable here before they move into workflow and timeline.
            </p>
          </div>
          <NextAction project={project} />
        </div>

        <div className={`grid gap-5 ${compact ? "xl:grid-cols-1" : "xl:grid-cols-[minmax(420px,1.2fr)_minmax(320px,0.8fr)]"}`}>
          <section className="overflow-hidden rounded-[8px] border border-slate-200 bg-slate-950 shadow-sm">
            <div className="relative aspect-video bg-slate-900">
              {sceneFrameUrl(heroScene) ? (
                <img src={sceneFrameUrl(heroScene)} alt={heroScene?.title ?? "Storyboard frame"} className="h-full w-full object-cover" />
              ) : heroAsset?.generatedImageUrl ? (
                <img src={heroAsset.generatedImageUrl} alt={heroAsset.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full flex-col items-center justify-center text-slate-300">
                  <ImagePlus className="mb-3 h-10 w-10 text-cyan-300" />
                  <p className="text-sm">Storyboard frames will appear after approval.</p>
                </div>
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

          <section className="rounded-[8px] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-slate-950">Creative lockups</h3>
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

        <section className="mt-5 rounded-[8px] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-slate-950">Scene continuity</h3>
            <Badge variant="outline">{project.storyboard?.scenes.length ?? 0} scenes</Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(project.storyboard?.scenes ?? plan?.scenes ?? []).map((scene) => (
              <SceneArtifact key={scene.id} scene={scene} />
            ))}
            {!(project.storyboard?.scenes ?? plan?.scenes ?? []).length && (
              <EmptyArtifact />
            )}
          </div>
        </section>

        {script && (
          <section className="mt-5 rounded-[8px] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-slate-950">Script review</h3>
              <Badge variant={script.approvalStatus === "approved" ? "default" : "secondary"}>{script.approvalStatus}</Badge>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {script.scenes.map((scene) => (
                <div key={scene.id} className="rounded-[8px] border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="font-medium text-slate-900">{scene.title}</p>
                    <span className="text-xs text-slate-500">{scene.durationSeconds}s</span>
                  </div>
                  <p className="text-sm leading-6 text-slate-600">{scene.narration}</p>
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

  return (
    <ScrollArea className="h-full">
      <div className="space-y-5 p-4">
        <section className="rounded-[8px] border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold text-slate-950">Generation status</h3>
            <span className="text-sm font-semibold text-cyan-700">{progress}%</span>
          </div>
          <Progress value={progress} className="h-2 bg-slate-200 [&>div]:bg-cyan-500" />
          <div className="mt-4 space-y-3">
            {CREATIVE_STEPS.map((step, index) => {
              const done = index < activeIndex;
              const current = index === activeIndex;
              return (
                <div key={step.id} className="flex gap-3">
                  <div className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full border ${done ? "border-cyan-500 bg-cyan-500 text-white" : current ? "border-slate-950 bg-white text-slate-950" : "border-slate-200 bg-white text-slate-400"}`}>
                    {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <span className="h-2 w-2 rounded-full bg-current" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{step.label}</p>
                    <p className="text-xs leading-5 text-slate-500">{step.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-[8px] border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold text-slate-950">References</h3>
            <Badge variant={refs.length ? "default" : "secondary"}>{refs.length}</Badge>
          </div>
          {refs.length ? (
            <div className="grid grid-cols-3 gap-2">
              {refs.slice(0, 6).map((url, index) => (
                <div key={`${url}-${index}`} className="overflow-hidden rounded-[8px] border border-slate-200">
                  <img src={url} alt={`Reference ${index + 1}`} className="aspect-square w-full object-cover" />
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-[8px] border border-dashed border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-500">
              Attach reference images in the agent panel so style, product, and identity remain visible to generation.
            </p>
          )}
        </section>

        <section className="rounded-[8px] border border-slate-200 bg-white p-4">
          <h3 className="mb-3 font-semibold text-slate-950">Continuity context</h3>
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
      <Button variant="outline" size="icon" className="rounded-full bg-white/70 backdrop-blur" aria-label="Search">
        <Search className="h-4 w-4" />
      </Button>
      <Button variant="outline" size="icon" className="rounded-full bg-white/70 backdrop-blur" aria-label="Notifications">
        <Bell className="h-4 w-4" />
      </Button>
    </div>
  );
}

function ModePill({ icon: Icon, label, value }: { icon: typeof User2; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white shadow-sm">
        <Icon className="h-4 w-4 text-slate-500" />
      </span>
      <span className="font-medium text-slate-900">{label}</span>
      <span className="text-xs text-slate-500">{value}</span>
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
            <div key={`${attachment.name}-${index}`} className="group relative h-16 w-16 overflow-hidden rounded-[8px] border border-slate-200 bg-slate-100">
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
          <div className="flex h-16 min-w-36 items-center rounded-[8px] border border-dashed border-cyan-200 bg-cyan-50 px-3 text-xs leading-5 text-cyan-800">
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
    <div className="rounded-[8px] border border-white/80 bg-white/74 p-5 shadow-sm backdrop-blur">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-[8px] bg-cyan-50 text-cyan-700">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="font-semibold text-slate-950">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{copy}</p>
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
    <Badge variant="outline" className="border-cyan-200 bg-cyan-50 text-cyan-700 capitalize">
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
    <div className="flex gap-3 rounded-[8px] border border-slate-200 bg-slate-50 p-3">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] ${ready ? "bg-cyan-100 text-cyan-700" : "bg-white text-slate-400"}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-slate-900">{title}</p>
          {ready ? <CheckCircle2 className="h-3.5 w-3.5 text-cyan-600" /> : <Clock3 className="h-3.5 w-3.5 text-slate-400" />}
        </div>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{value || "Awaiting generation"}</p>
      </div>
    </div>
  );
}

function SceneArtifact({ scene }: { scene: Scene }) {
  const frameUrl = sceneFrameUrl(scene);
  return (
    <article className="overflow-hidden rounded-[8px] border border-slate-200 bg-slate-50">
      <div className="aspect-video bg-slate-100">
        {frameUrl ? (
          <img src={frameUrl} alt={scene.title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-slate-400">
            <Boxes className="h-6 w-6" />
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="mb-1 flex items-center justify-between gap-2">
          <h4 className="truncate text-sm font-semibold text-slate-950">{scene.title}</h4>
          <Badge variant="outline" className="bg-white">{scene.duration}s</Badge>
        </div>
        <p className="line-clamp-2 text-xs leading-5 text-slate-500">{scene.sceneGoal || scene.visualDirection || scene.prompt}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Badge variant="secondary" className="capitalize">{scene.cameraMovement.replace(/_/g, " ")}</Badge>
          <Badge variant="secondary" className="capitalize">{scene.mood}</Badge>
        </div>
      </div>
    </article>
  );
}

function EmptyArtifact() {
  return (
    <div className="col-span-full rounded-[8px] border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
      <Wand2 className="mx-auto mb-3 h-8 w-8 text-cyan-500" />
      <h3 className="font-semibold text-slate-950">No storyboard yet</h3>
      <p className="mt-1 text-sm text-slate-500">Use the agent panel to generate a script, reusable assets, and continuity-aware scenes.</p>
    </div>
  );
}

function ContextLine({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 leading-6 text-slate-700">{value || "Not set yet"}</p>
    </div>
  );
}
