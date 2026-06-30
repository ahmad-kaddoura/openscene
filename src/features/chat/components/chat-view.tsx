'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useProjectStore } from '@/features/project/store';
import { useChatStore } from '@/features/chat/store';
import { useWorkflowStore } from '@/features/workflow/store';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { SpinnerIcon } from '@/components/ui/spinner-icon';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Send, FileText, Clapperboard, Wand2, Eye, SlidersHorizontal, Paperclip, X, ArrowRight } from 'lucide-react';
import { renderGenerativeUI } from './generative-ui';
import { VideoConfigPanel } from './video-config-panel';
import { buildBriefFromProject } from '@/features/chat/chat-handlers';
import ReactMarkdown from 'react-markdown';
import type { ChatAttachment, GenerativeUIComponent, Scene, VideoBrief } from '@/core/types';

const QUICK_ACTIONS = [
  { label: 'Create Brief', icon: FileText, prompt: 'Create a structured video brief based on our conversation.' },
  { label: 'Generate Storyboard', icon: Clapperboard, prompt: 'Generate a full storyboard with scene breakdowns based on our discussion.' },
  { label: 'Get Hooks', icon: Wand2, prompt: 'Generate some powerful hook ideas for the opening of my video.' },
  { label: 'AI Review', icon: Eye, prompt: 'Please review my current video plan and give me your director\'s feedback.' },
];

type ChatPhase = 'planning' | 'ready' | 'brainstorm' | 'brief';

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

export function ChatView() {
  const { currentProjectId, getCurrentProject, updateCurrentProject, setPhase } = useProjectStore();
  const { messages, isStreaming, addMessage, setStreaming } = useChatStore();
  const { buildFromStoryboard } = useWorkflowStore();
  const [input, setInput] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [configOpen, setConfigOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isSendingRef = useRef(false);

  const currentProject = getCurrentProject();

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  const chatPhase = getAssistantPhase(lastAssistant);
  const stepMeta = getStepMeta(lastAssistant);
  const lastAssistantId = lastAssistant?.id;
  const specsComplete = chatPhase === 'ready' || chatPhase === 'brainstorm' || chatPhase === 'brief';

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
    setStreaming(true);

    const outgoingMessages = [...messages, { role: 'user' as const, content }];

    await addMessage(currentProjectId, 'user', content, undefined, undefined, attachments);

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
        }),
      });

      const data = await response.json();

      if (data.generativeUI) {
        for (const gui of data.generativeUI as GenerativeUIComponent[]) {
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

      await addMessage(currentProjectId, 'assistant', data.content, data.generativeUI, {
        step: data.step,
        totalSteps: data.totalSteps,
        phase: data.phase,
        model: data.metadata?.model,
        needsConfig: data.metadata?.needsConfig,
        intent: data.metadata?.intent,
      });
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
    currentProject,
    getCurrentProject,
  ]);

  const handlePresetSelect = useCallback(
    (message: string) => {
      void handleSend(message);
    },
    [handleSend]
  );

  const handleAttachImages = (files: FileList | null) => {
    if (!files?.length) return;
    Array.from(files).slice(0, 4).forEach((file) => {
      if (!file.type.startsWith('image/') || file.size > 4 * 1024 * 1024) return;
      const reader = new FileReader();
      reader.onload = () => {
        setPendingAttachments((prev) => [
          ...prev,
          { type: 'image', url: reader.result as string, name: file.name },
        ]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleGoToBrief = async () => {
    if (!currentProject) return;
    const brief = buildBriefFromProject(currentProject);
    await updateCurrentProject({ videoBrief: brief as VideoBrief });
    setPhase('brief');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const inputPlaceholder = specsComplete
    ? 'Brainstorm your concept — mood, story, audience… attach reference images with 📎'
    : 'Describe the video you want to create…';

  return (
    <div className="flex flex-col h-full min-h-0">
      <ScrollArea className="flex-1 min-h-0 p-4" ref={scrollRef}>
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-16">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
                <Wand2 className="w-6 h-6 text-primary" />
              </div>
              <h2 className="text-lg font-semibold mb-1">Describe Your Video</h2>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Pick your output specs, brainstorm the concept, attach references, then build scenes in the workflow editor.
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/50 border border-border'
                }`}
              >
                {msg.role === 'assistant' ? (
                  <div className="prose prose-sm prose-invert max-w-none [&>p]:mb-2 [&>p:last-child]:mb-0 [&>ul]:mb-2 [&>ol]:mb-2 [&>strong]:text-foreground [&_li]:text-sm">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                )}

                {msg.attachments && msg.attachments.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {msg.attachments.map((att, i) => (
                      <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-white/20">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
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
                      return renderGenerativeUI(gui, idx, {
                        onPresetSelect: isActiveStep ? handlePresetSelect : undefined,
                        disabled: !isActiveStep,
                      });
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}

          {isStreaming && (
            <div className="flex justify-start">
              <div className="bg-muted/50 border border-border rounded-2xl px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <SpinnerIcon className="w-4 h-4 animate-spin" />
                  Thinking...
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Next steps banner after specs are locked */}
      {specsComplete && (
        <div className="px-4 pb-2 shrink-0">
          <div className="max-w-3xl mx-auto rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">
              <span className="text-foreground font-medium">Specs saved.</span>{' '}
              Brainstorm below → Create Brief → Generate Storyboard → edit prompts in Workflow.
            </div>
            <div className="flex gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1"
                onClick={() => handleSend(QUICK_ACTIONS[0].prompt)}
                disabled={isStreaming}
              >
                <FileText className="w-3 h-3" /> Create Brief
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={handleGoToBrief}>
                Brief tab <ArrowRight className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {messages.length > 0 && (
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

      <div className="border-t border-border p-4 shrink-0">
        <div className="max-w-3xl mx-auto space-y-2">
          {pendingAttachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {pendingAttachments.map((att, i) => (
                <div key={i} className="relative w-14 h-14 rounded-lg overflow-hidden border border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
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
