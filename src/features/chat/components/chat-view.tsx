'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useProjectStore } from '@/features/project/store';
import { useChatStore, buildCreativeWorkflowPlanWithPrompts } from '@/features/chat';
import { useWorkflowStore } from '@/features/workflow';
import { useSettingsStore } from '@/features/settings/store';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { SpinnerIcon } from '@/components/ui/spinner-icon';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Send, Boxes, Workflow, Wand2, Eye, SlidersHorizontal, Paperclip, X, ArrowRightLeft, MousePointerClick } from 'lucide-react';
import { renderGenerativeUI } from './generative-ui';
import { VideoConfigPanel } from './video-config-panel';
import ReactMarkdown from 'react-markdown';
import type { AttachmentAnalysis, ChatAttachment, CreativeWorkflowPlan, GenerativeUIComponent, NodeAssistantOperation, ReusableAssetPlan, Scene, VideoBrief, VideoScript } from '@/core/types';

const STARTER_PROMPTS = [
  'Product ad for my skincare line — premium, no people',
  'UGC-style creator tutorial with a locked-on-camera host',
  '15s launch teaser for a new app',
];

const QUICK_ACTIONS = [
  { label: 'Plan Assets', icon: Boxes, prompt: 'Plan the reusable consistency references, assets, frames, and scenes for this video.' },
  { label: 'Build Workflow', icon: Workflow, prompt: 'Create the editable workflow with scenes, assets, prompts, start frames, end frames, and consistency references.' },
  { label: 'Get Hooks', icon: Wand2, prompt: 'Generate some powerful hook ideas for the opening of my video.' },
  { label: 'AI Review', icon: Eye, prompt: 'Please review my current video plan and give me your director\'s feedback.' },
];

type ChatPhase = 'planning' | 'ready' | 'brainstorm' | 'brief' | 'plan_ready' | 'assets_ready' | 'workflow' | 'script_ready' | 'influencer_ready' | 'background_ready' | 'frames_ready';

function getAssistantPhase(msg: { metadata?: Record<string, unknown> } | undefined): ChatPhase | null {
  if (!msg?.metadata) return null;
  const phase = msg.metadata.phase as ChatPhase | undefined;
  if (phase) return phase;
  const step = Number(msg.metadata.step);
  const totalSteps = Number(msg.metadata.totalSteps);
  if (step && totalSteps) {
    return step >= totalSteps + 1 || msg.metadata.phase === 'ready' ? 'ready' : 'planning';
  }
  return null;
}

function getStepMeta(msg: { metadata?: Record<string, unknown> } | undefined) {
  if (!msg?.metadata) return null;
  const step = Number(msg.metadata.step);
  const totalSteps = Number(msg.metadata.totalSteps);
  if (!step || !totalSteps) return null;
  return { step, totalSteps, phase: msg.metadata.phase as ChatPhase };
}

function GenerativeUIRenderer({
  gui,
  index,
  onPresetSelect,
  disabled,
}: {
  gui: GenerativeUIComponent;
  index: number;
  onPresetSelect?: (message: string) => void;
  disabled: boolean;
}) {
  return renderGenerativeUI(gui, index, { onPresetSelect, disabled });
}

export function ChatView() {
  const { currentProjectId, getCurrentProject, updateCurrentProject, setPhase } = useProjectStore();
  const { messages, isStreaming, addMessage, setStreaming } = useChatStore();
  const { buildFromStoryboard, clearGraph, updateScene, addWorkflowConnection } = useWorkflowStore();
  const generationModels = useSettingsStore((s) => s.settings.generationModels);
  const promptOverrides = useSettingsStore((s) => s.settings.promptOverrides);
  const agentConfigs = useSettingsStore((s) => s.settings.agentConfigs);
  const selectedNodeContext = useWorkflowStore((s) => s.selectedNodeContext);
  const clearSelectedNode = useWorkflowStore((s) => s.clearSelectedNodeContext);
  const [input, setInput] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [attachmentErrors, setAttachmentErrors] = useState<string[]>([]);
  const [configOpen, setConfigOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isSendingRef = useRef(false);

  const currentProject = getCurrentProject();

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  const chatPhase = getAssistantPhase(lastAssistant);
  const stepMeta = getStepMeta(lastAssistant);
  const lastAssistantId = lastAssistant?.id;
  const planReady = chatPhase === 'plan_ready';
  const assetsReady = chatPhase === 'assets_ready';
  const workflowReady = chatPhase === 'workflow';
  const scriptReady = chatPhase === 'script_ready';
  const influencerReady = chatPhase === 'influencer_ready';
  const backgroundReady = chatPhase === 'background_ready';
  const framesReady = chatPhase === 'frames_ready';

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isStreaming, pendingAttachments]);

  const handleSend = useCallback(async (text?: string) => {
    const attachments = [...pendingAttachments];
    const content =
      text?.trim() ||
      input.trim() ||
      (attachments.length > 0 ? 'Attached reference images for visual direction.' : '');

    if (!content || !currentProjectId || isSendingRef.current) return;

    isSendingRef.current = true;
    setInput('');
    setPendingAttachments([]);
    setAttachmentErrors([]);
    setStreaming(true);

    const outgoingMessages = [...messages, { role: 'user' as const, content }];

    await addMessage(currentProjectId, 'user', content, undefined, selectedNodeContext ? { nodeId: selectedNodeContext.nodeId, nodeKind: selectedNodeContext.nodeKind } : undefined, attachments);

    const mergedRefs = [
      ...(currentProject?.referenceImageUrls || []),
      ...attachments.map((a) => a.url),
    ];
    if (attachments.length > 0) {
      await updateCurrentProject({ referenceImageUrls: mergedRefs });
    }

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: outgoingMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          project: getCurrentProject(),
          referenceImageUrls: mergedRefs,
          projectId: currentProjectId,
          generationModels,
          promptOverrides,
          agentConfigs,
          nodeContext: selectedNodeContext,
        }),
      });

      const data = await response.json();
      let shouldOpenWorkflow = data.phase === 'workflow';
      let shouldClearGraph = false;

      if (data.generativeUI) {
        for (const gui of data.generativeUI as GenerativeUIComponent[]) {
          if (gui.type === 'creative_workflow_plan' && gui.data) {
            const plan = gui.data as CreativeWorkflowPlan;
            await updateCurrentProject({
              creativePlan: plan,
              storyboard: {
                id: `sb-${Date.now()}`,
                scenes: plan.scenes,
                totalDuration: plan.scenes[plan.scenes.length - 1]?.endTime || 0,
                narrativeArc: plan.storyStructure.join(' → '),
                notes: plan.summary,
              },
            });
            if (data.phase === 'workflow') {
              buildFromStoryboard(plan.scenes);
              shouldOpenWorkflow = true;
            }
          }
          if (gui.type === 'script_card' && gui.data) {
            const script = gui.data as VideoScript;
            const concept = script.logline || currentProject?.description || currentProject?.name || 'a short-form video';
            const fallbackPlan = currentProject?.creativePlan ?? buildCreativeWorkflowPlanWithPrompts(concept, currentProject?.referenceImageUrls ?? []);
            await updateCurrentProject({
              videoScript: script,
              productionStep: 'script',
              creativePlan: fallbackPlan,
            });
          }
          if (gui.type === 'influencer_card' && gui.data) {
            const asset = gui.data as ReusableAssetPlan;
            const project = getCurrentProject();
            const existingPlan = project?.creativePlan;
            if (existingPlan) {
              const updatedPlan: CreativeWorkflowPlan = {
                ...existingPlan,
                approvalStatus: 'approved',
                reusableAssets: existingPlan.reusableAssets.map((a) => (a.id === asset.id ? asset : a)),
              };
              await updateCurrentProject({ creativePlan: updatedPlan, productionStep: 'influencer' });
            }
          }
          if (gui.type === 'background_card' && gui.data) {
            const asset = gui.data as ReusableAssetPlan;
            const project = getCurrentProject();
            const existingPlan = project?.creativePlan;
            if (existingPlan) {
              const updatedPlan: CreativeWorkflowPlan = {
                ...existingPlan,
                approvalStatus: 'approved',
                reusableAssets: existingPlan.reusableAssets.map((a) => (a.id === asset.id ? asset : a)),
              };
              await updateCurrentProject({ creativePlan: updatedPlan, productionStep: 'background' });
            }
          }
          if (gui.type === 'frames_card' && gui.data) {
            const scenes = (gui.data as { scenes: Scene[] }).scenes;
            const project = getCurrentProject();
            const existingPlan = project?.creativePlan;
            if (existingPlan) {
              const updatedPlan: CreativeWorkflowPlan = {
                ...existingPlan,
                scenes: scenes.map((sc) => ({ ...sc })),
                approvalStatus: 'assets_generated',
              };
              await updateCurrentProject({
                creativePlan: updatedPlan,
                productionStep: 'frames',
                storyboard: {
                  id: project?.storyboard?.id || `sb-${Date.now()}`,
                  scenes,
                  totalDuration: scenes[scenes.length - 1]?.endTime || 0,
                  narrativeArc: existingPlan.storyStructure.join(' → '),
                  notes: existingPlan.summary,
                },
              });
            }
          }
          if (gui.type === 'video_brief_form' && gui.data) {
            await updateCurrentProject({ videoBrief: gui.data as VideoBrief });
          }
          if (gui.type === 'scene_suggestion' && gui.data) {
            const scenes = gui.data as Scene[];
            await updateCurrentProject({
              storyboard: {
                id: currentProject?.storyboard?.id || `sb-${Date.now()}`,
                scenes,
                totalDuration: scenes[scenes.length - 1]?.endTime || 0,
                narrativeArc: 'AI-generated from chat',
              },
            });
            buildFromStoryboard(scenes);
          }
        }
      }

      // If the server marked the script approved via metadata, persist that.
      if (data.metadata?.approvedScript && currentProject?.videoScript) {
        await updateCurrentProject({
          videoScript: { ...currentProject.videoScript, approvalStatus: 'approved' },
          productionStep: 'influencer',
        });
      }

      await addMessage(currentProjectId, 'assistant', data.content, data.generativeUI, {
        step: data.step,
        totalSteps: data.totalSteps,
        phase: data.phase,
        model: data.metadata?.model,
        needsConfig: data.metadata?.needsConfig,
        intent: data.metadata?.intent,
        productionStep: data.metadata?.productionStep,
        nodeId: data.metadata?.nodeId,
        nodeKind: data.metadata?.nodeKind,
      });

      // Apply node-assistant operations to the workflow store + project plan.
      if (data.metadata?.operations && selectedNodeContext) {
        const ops = data.metadata.operations as NodeAssistantOperation[];
        for (const op of ops) {
          if ((op.type === 'update_prompt' || op.type === 'update_scene_field' || op.type === 'update_scene_details') && selectedNodeContext.sceneId) {
            if (op.type === 'update_scene_details') {
              updateScene(selectedNodeContext.sceneId, op.updates as Partial<Scene>);
            } else if (op.type === 'update_prompt') {
              updateScene(selectedNodeContext.sceneId, { [op.field]: op.value } as Partial<Scene>);
            } else {
              updateScene(selectedNodeContext.sceneId, { [op.field]: op.value } as Partial<Scene>);
            }
          }
          if (op.type === 'replace_asset') {
            const projectNow = getCurrentProject();
            const planNow = projectNow?.creativePlan;
            if (planNow) {
              await updateCurrentProject({
                creativePlan: {
                  ...planNow,
                  reusableAssets: planNow.reusableAssets.map((a) =>
                    a.id === op.assetId ? { ...a, referenceImagePrompt: op.newPrompt, generationStatus: 'pending', generatedImageUrl: undefined } : a,
                  ),
                },
              });
            }
          }
          if (op.type === 'connect_node') {
            addWorkflowConnection({
              source: selectedNodeContext.nodeId,
              sourceHandle: op.sourceHandle,
              target: op.targetNodeId,
              targetHandle: op.targetHandle,
            });
          }
        }
      }

      // Persist attachment analyses returned by the planner so vision never re-runs.
      if (data.metadata?.attachmentAnalyses) {
        const projectNow = getCurrentProject();
        await updateCurrentProject({
          attachmentAnalyses: data.metadata.attachmentAnalyses as AttachmentAnalysis[],
        });
      }

      // Persist an updated plan returned by the node assistant.
      if (data.metadata?.updatedPlan) {
        const projectNow = getCurrentProject();
        const currentPlan = projectNow?.creativePlan;
        if (currentPlan && data.metadata.updatedPlan) {
          await updateCurrentProject({ creativePlan: data.metadata.updatedPlan as CreativeWorkflowPlan });
        }
      }

      // Persist any connections the node assistant wants to add.
      if (Array.isArray(data.metadata?.connectionsToAdd)) {
        for (const conn of data.metadata.connectionsToAdd as { source: string; sourceHandle: string; target: string; targetHandle: string }[]) {
          addWorkflowConnection(conn);
        }
      }

      if (shouldOpenWorkflow) {
        if (data.skipToWorkflow) {
          shouldClearGraph = true;
        } else if (data.seedFromPlan) {
          const project = getCurrentProject();
          const plan = project?.creativePlan;
          if (plan) {
            buildFromStoryboard(plan.scenes);
          }
        }
        await setPhase('workflow');
        if (shouldClearGraph) {
          clearGraph();
        }
      }
    } catch {
      await addMessage(currentProjectId, 'assistant', 'Sorry, I encountered an error. Please try again.');
    }

    setStreaming(false);
    isSendingRef.current = false;
  }, [
    input,
    pendingAttachments,
    currentProjectId,
    messages,
    addMessage,
    setStreaming,
    updateCurrentProject,
    buildFromStoryboard,
    clearGraph,
    updateScene,
    addWorkflowConnection,
    currentProject,
    getCurrentProject,
    generationModels,
    promptOverrides,
    agentConfigs,
    selectedNodeContext,
  ]);

  const handlePresetSelect = useCallback(
    (message: string) => {
      void handleSend(message);
    },
    [handleSend]
  );

  const handleSkipToWorkflow = useCallback(() => {
    if (!currentProjectId || isStreaming) return;
    void handleSend('Skip to workflow — I will build everything manually there.');
  }, [currentProjectId, isStreaming, handleSend]);

  const handleAttachImages = (files: FileList | null) => {
    if (!files?.length) return;
    const errors: string[] = [];
    Array.from(files).slice(0, 4).forEach((file) => {
      if (!file.type.startsWith('image/')) {
        errors.push(`${file.name} is not an image.`);
        return;
      }
      if (file.size > 4 * 1024 * 1024) {
        errors.push(`${file.name} is larger than 4MB.`);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setPendingAttachments((prev) => [
          ...prev,
          { type: 'image' as const, url: reader.result as string, name: file.name },
        ].slice(0, 4));
      };
      reader.onerror = () => {
        setAttachmentErrors((prev) => [`Could not read ${file.name}. Try another image.`, ...prev].slice(0, 3));
      };
      reader.readAsDataURL(file);
    });
    if (files.length > 4) {
      errors.push('Only the first 4 reference images were added.');
    }
    if (errors.length) {
      setAttachmentErrors((prev) => [...errors, ...prev].slice(0, 3));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const visibleMessages = useMemo(() => {
    if (!selectedNodeContext) return messages;
    const nodeId = selectedNodeContext.nodeId;
    // Show messages tagged with this node id, plus the most recent user/assistant
    // pair that was sent while this node was selected (they have no nodeId tag
    // yet but are part of this node's thread).
    return messages.filter((m) => {
      const tagged = m.metadata?.nodeId as string | undefined;
      return tagged === nodeId;
    });
  }, [messages, selectedNodeContext]);

  const inputPlaceholder = selectedNodeContext
    ? `Ask about this ${selectedNodeContext.nodeKind} node — edit prompt, regenerate frame, replace asset, create variation…`
    : workflowReady
    ? 'Refine the workflow — ask for scene, asset, prompt, or motion changes…'
    : framesReady
      ? 'Review the frames, regenerate any scene, or approve to open Workflow…'
      : backgroundReady
        ? 'Approve the background to generate the start and end frames…'
        : influencerReady
          ? 'Approve the influencer to generate the background…'
          : scriptReady
            ? 'Read the script, edit any beat, or approve to generate the influencer…'
            : assetsReady
              ? 'Adjust the assets, frames, story, or consistency before opening Workflow…'
              : chatPhase === 'plan_ready'
                ? 'Ask for edits, or approve the plan to generate assets step by step…'
                : chatPhase === 'brainstorm' || messages.length > 0
                  ? 'Reply naturally — describe the video, ask questions, or say when to draft the script…'
                  : 'Describe the video idea, character, product, story, or goal…';

  return (
    <div className="flex flex-col h-full min-h-0">
      <ScrollArea className="flex-1 min-h-0 p-4" ref={scrollRef}>
        <div className="max-w-3xl mx-auto space-y-4">
          {visibleMessages.length === 0 && !selectedNodeContext && (
            <div className="text-center py-14 px-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/20 flex items-center justify-center mx-auto mb-4">
                <Wand2 className="w-6 h-6 text-primary" />
              </div>
              <h2 className="text-lg font-semibold mb-2">Plan your video together</h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                Start with a conversation — share the idea, audience, and references. When we&apos;re aligned, I&apos;ll draft a per-second shooting script, then build the influencer, background, and start/end frames step by step.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2 max-w-lg mx-auto">
                {STARTER_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => handleSend(prompt)}
                    disabled={isStreaming}
                    className="rounded-full border border-border/70 bg-background/80 px-3 py-1.5 text-xs text-left transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
              <div className="mt-4">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground gap-1.5"
                  onClick={handleSkipToWorkflow}
                  disabled={isStreaming}
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                  Skip to Workflow
                </Button>
              </div>
            </div>
          )}

          {visibleMessages.length === 0 && selectedNodeContext && (
            <div className="text-center py-10 px-4">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/20 flex items-center justify-center mx-auto mb-3">
                <MousePointerClick className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-base font-semibold mb-1.5 capitalize">Editing {selectedNodeContext.nodeKind} node</h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                Tell me what to do with this node — edit the prompt, regenerate the frame, replace the asset, create a variation, generate video, or connect it to another node.
              </p>
            </div>
          )}

          {visibleMessages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/15 flex items-center justify-center shrink-0 mt-0.5">
                  <Wand2 className="w-4 h-4 text-primary" />
                </div>
              )}
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card border border-border/60 shadow-sm'
                }`}
              >
                {msg.role === 'assistant' ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:mb-2 [&>p:last-child]:mb-0 [&>ul]:mb-2 [&>ol]:mb-2 [&>strong]:text-foreground [&_li]:text-sm [&_li]:text-muted-foreground">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                )}

                {msg.attachments && msg.attachments.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {msg.attachments.map((att, i) => (
                      <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-white/20">
                        <img src={att.url} alt={att.name} className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                )}

                {msg.generativeUI && msg.generativeUI.length > 0 && (
                  <div className="mt-3 space-y-3">
                    {msg.generativeUI.map((gui, idx) => {
                      const isActiveStep =
                        msg.role === 'assistant' && msg.id === lastAssistantId && !isStreaming;
                      return (
                        <GenerativeUIRenderer
                          key={idx}
                          gui={gui}
                          index={idx}
                          onPresetSelect={isActiveStep ? handlePresetSelect : undefined}
                          disabled={!isActiveStep}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}

          {isStreaming && (
            <div className="flex justify-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/15 flex items-center justify-center shrink-0">
                <Wand2 className="w-4 h-4 text-primary" />
              </div>
              <div className="bg-card border border-border/60 shadow-sm rounded-2xl px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <SpinnerIcon className="w-4 h-4 animate-spin" />
                  Thinking...
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Production progress + next-step actions live in the Details panel and
          inside the generative UI cards (e.g. Approve Plan, Approve Frames →
          Open Workflow), so we don't duplicate them as a banner here. */}

      {messages.length > 0 && !planReady && !assetsReady && !workflowReady && (
        <div className="px-4 pb-2 shrink-0">
          <div className="max-w-3xl mx-auto flex gap-2 overflow-x-auto pb-1">
            {QUICK_ACTIONS.map((action) => (
              <Button
                key={action.label}
                variant="outline"
                size="sm"
                className="whitespace-nowrap gap-1.5 text-xs shrink-0"
                onClick={() => handleSend(action.prompt)}
                disabled={isStreaming}
              >
                <action.icon className="w-3 h-3" />
                {action.label}
              </Button>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="whitespace-nowrap gap-1.5 text-xs shrink-0 text-muted-foreground"
              onClick={handleSkipToWorkflow}
              disabled={isStreaming}
              title="Open a blank workflow and build everything manually"
            >
              <ArrowRightLeft className="w-3 h-3" />
              Skip to Workflow
            </Button>
          </div>
        </div>
      )}

      {stepMeta && stepMeta.phase === 'planning' && (
        <div className="px-4 pb-2 shrink-0">
          <div className="max-w-3xl mx-auto flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground">
              Step {stepMeta.step} of {stepMeta.totalSteps}
            </span>
            <div className="flex gap-1 flex-1">
              {Array.from({ length: stepMeta.totalSteps }).map((_, i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full transition-colors ${
                    i < stepMeta.step ? 'bg-primary' : 'bg-border'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {selectedNodeContext && (
        <div className="px-4 pb-2 shrink-0">
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <MousePointerClick className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="font-medium text-foreground">Editing:</span>
              <span className="capitalize text-muted-foreground truncate">
                {selectedNodeContext.nodeKind} node
                {selectedNodeContext.sceneId ? ` · scene` : ''}
              </span>
            </div>
            <button
              type="button"
              onClick={clearSelectedNode}
              className="text-muted-foreground hover:text-foreground shrink-0"
              aria-label="Exit node editing"
              title="Back to project chat"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      <div className="border-t border-border p-4 shrink-0">
        <div className="max-w-3xl mx-auto space-y-2">
          {pendingAttachments.length > 0 && (
            <div className="flex flex-wrap gap-2 rounded-xl border border-cyan-200 bg-cyan-50/60 p-2">
              {pendingAttachments.map((att, i) => (
                <div key={i} className="relative w-14 h-14 rounded-lg overflow-hidden border border-border">
                  <img src={att.url} alt={att.name} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center"
                    onClick={() => setPendingAttachments((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <X className="w-3 h-3 text-white" />
                  </button>
                </div>
              ))}
              <div className="flex min-h-14 flex-1 items-center text-xs leading-5 text-cyan-800">
                {pendingAttachments.length} reference image{pendingAttachments.length === 1 ? '' : 's'} ready. They will be saved to this project and sent with the next generation request.
              </div>
            </div>
          )}

          {attachmentErrors.length > 0 && (
            <div className="space-y-1">
              {attachmentErrors.map((error) => (
                <div key={error} className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <span>{error}</span>
                  <button
                    type="button"
                    onClick={() => setAttachmentErrors((prev) => prev.filter((item) => item !== error))}
                    aria-label="Dismiss attachment error"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                handleAttachImages(e.target.files);
                e.target.value = '';
              }}
            />
            <Textarea
              placeholder={inputPlaceholder}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isStreaming}
              className="min-h-[52px] max-h-[200px] flex-1 resize-none rounded-xl border-border bg-muted/30 focus:bg-muted/50 text-sm"
              rows={1}
            />
            <Button
              size="icon"
              variant="outline"
              className="h-[52px] w-[52px] rounded-xl shrink-0"
              onClick={() => fileInputRef.current?.click()}
              disabled={isStreaming}
              aria-label="Attach reference images"
              title="Attach reference images"
            >
              <Paperclip className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              variant="outline"
              className="h-[52px] w-[52px] rounded-xl shrink-0"
              onClick={() => setConfigOpen(true)}
              aria-label="Configure video output"
              title="Configure video output"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              className="h-[52px] w-[52px] rounded-xl shrink-0"
              onClick={() => handleSend()}
              disabled={(!input.trim() && pendingAttachments.length === 0) || isStreaming}
              aria-label="Send message"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4" />
              Video Output
            </DialogTitle>
            <DialogDescription>
              Set aspect ratio, length, resolution, and frame rate for your export.
            </DialogDescription>
          </DialogHeader>
          <VideoConfigPanel onDone={() => setConfigOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
