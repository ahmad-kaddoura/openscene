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
import { Send, FileText, Clapperboard, Wand2, Eye, SlidersHorizontal } from 'lucide-react';
import { renderGenerativeUI } from './generative-ui';
import { VideoConfigPanel } from './video-config-panel';
import ReactMarkdown from 'react-markdown';
import type { GenerativeUIComponent, Scene, VideoBrief } from '@/core/types';

const QUICK_ACTIONS = [
  { label: 'Create Brief', icon: FileText, prompt: 'I\'m ready. Please create a structured video brief based on our conversation.' },
  { label: 'Generate Storyboard', icon: Clapperboard, prompt: 'Please generate a full storyboard with scene breakdowns based on our discussion.' },
  { label: 'Get Hooks', icon: Wand2, prompt: 'Generate some powerful hook ideas for the opening of my video.' },
  { label: 'AI Review', icon: Eye, prompt: 'Please review my current video plan and give me your director\'s feedback.' },
];

interface StepMeta {
  step: number;
  totalSteps: number;
  phase?: 'planning' | 'ready';
}

function getStepMeta(msg: { metadata?: Record<string, unknown> } | undefined): StepMeta | null {
  if (!msg?.metadata) return null;
  const step = Number(msg.metadata.step);
  const totalSteps = Number(msg.metadata.totalSteps);
  if (!step || !totalSteps) return null;
  return {
    step,
    totalSteps,
    phase: (msg.metadata.phase as 'planning' | 'ready') || 'planning',
  };
}

export function ChatView() {
  const { currentProjectId, getCurrentProject, updateCurrentProject, setPhase } = useProjectStore();
  const { messages, isStreaming, addMessage, setStreaming } = useChatStore();
  const { buildFromStoryboard, getScenes } = useWorkflowStore();
  const [input, setInput] = useState('');
  const [configOpen, setConfigOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isSendingRef = useRef(false);

  const currentProject = getCurrentProject();

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  const stepMeta = getStepMeta(lastAssistant);

  // Auto-scroll to bottom on new content.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isStreaming]);

  const handleSend = useCallback(async (text?: string) => {
    const content = text || input.trim();
    if (!content || !currentProjectId || isSendingRef.current) return;

    isSendingRef.current = true;
    setInput('');
    setStreaming(true);

    await addMessage(currentProjectId, 'user', content);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, { role: 'user', content }].map(m => ({
            role: m.role,
            content: m.content,
          })),
          projectId: currentProjectId,
          agentType: 'chat_planner',
        }),
      });

      const data = await response.json();

      // Handle generative UI actions from legacy mock payloads.
      if (data.generativeUI) {
        for (const gui of data.generativeUI as GenerativeUIComponent[]) {
          if (gui.type === 'video_brief_form' && gui.data) {
            await updateCurrentProject({ videoBrief: gui.data as VideoBrief });
          }
          if (gui.type === 'scene_suggestion' && gui.data) {
            const scenes = gui.data as Scene[];
            await updateCurrentProject({
              storyboard: {
                id: currentProject?.storyboard?.id || 'sb-1',
                scenes,
                totalDuration: scenes[scenes.length - 1]?.endTime || 0,
                narrativeArc: 'Standard ad structure: Hook → Problem → Solution → CTA',
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
      });
    } catch (err) {
      await addMessage(currentProjectId, 'assistant', 'Sorry, I encountered an error. Please try again.');
    }

    setStreaming(false);
    isSendingRef.current = false;
  }, [input, currentProjectId, messages, addMessage, setStreaming, updateCurrentProject, buildFromStoryboard, currentProject]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Messages — flex-1 + min-h-0 so the input always stays visible */}
      <ScrollArea className="flex-1 min-h-0 p-4" ref={scrollRef}>
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-16">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
                <Wand2 className="w-6 h-6 text-primary" />
              </div>
              <h2 className="text-lg font-semibold mb-1">Describe Your Video</h2>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Tell me about the video you want to create. I&apos;ll ask a few questions one at a time, then draft your brief.
              </p>
            </div>
          )}

          {messages.map((msg) => {
            const meta = getStepMeta(msg);
            return (
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

                  {msg.generativeUI && msg.generativeUI.length > 0 && (
                    <div className="mt-3 space-y-3">
                      {msg.generativeUI.map((gui, idx) => renderGenerativeUI(gui, idx))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

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

      {/* Quick Actions */}
      {messages.length > 0 && messages.length < 10 && (
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

      {/* Step indicator */}
      {stepMeta && stepMeta.phase !== 'ready' && (
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

      {/* Input — always visible (sticky by virtue of layout) */}
      <div className="border-t border-border p-4 shrink-0">
        <div className="max-w-3xl mx-auto relative flex items-end gap-2">
          <Textarea
            ref={inputRef}
            placeholder="Describe the video you want to create..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
            className="min-h-[52px] max-h-[200px] pr-3 resize-none rounded-xl border-border bg-muted/30 focus:bg-muted/50 text-sm"
            rows={1}
          />
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
            disabled={!input.trim() || isStreaming}
            aria-label="Send message"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Configure dialog — video output specs */}
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
