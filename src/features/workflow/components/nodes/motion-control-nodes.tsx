'use client';

import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ImageIcon, Loader2, Pencil, Play, Video, WandSparkles, X } from 'lucide-react';
import { useWorkflowStore } from '@/features/workflow/store';

type WorkflowStyle = { border?: string; line?: string };

function readMediaFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function useMotion(id: string, data: NodeProps['data']) {
  const motionId = (data as { motionId?: string }).motionId;
  const inputId = (data as { inputId?: string }).inputId;
  const workflowStyle = (data as { workflowStyle?: WorkflowStyle }).workflowStyle;
  const motion = useWorkflowStore((s) => motionId ? s.motionControls.find((item) => item.id === motionId) : undefined);
  const input = useWorkflowStore((s) => inputId ? s.inputNodes.find((item) => item.id === inputId) : undefined);
  const updateMotionControl = useWorkflowStore((s) => s.updateMotionControl);
  const updateInputNode = useWorkflowStore((s) => s.updateInputNode);
  const generateMotionControl = useWorkflowStore((s) => s.generateMotionControl);
  const cancelMotionControl = useWorkflowStore((s) => s.cancelMotionControl);
  return { id, motionId, inputId, motion, input, workflowStyle, updateMotionControl, updateInputNode, generateMotionControl, cancelMotionControl };
}

function ImageInputNodeComponent({ id, data }: NodeProps) {
  const { motionId, inputId, motion, input, workflowStyle, updateMotionControl, updateInputNode } = useMotion(id, data);
  const inputRef = useRef<HTMLInputElement>(null);
  if (!motion && !input) return null;
  const imageUrl = motion?.imageUrl ?? input?.imageUrl;
  const setImageUrl = (url?: string) => {
    if (motionId) updateMotionControl(motionId, { imageUrl: url });
    if (inputId) updateInputNode(inputId, { imageUrl: url });
  };

  const pick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImageUrl(await readMediaFile(file));
    event.target.value = '';
  };

  return (
    <div className="relative">
      <Handle type="source" position={Position.Right} id="motion-image-out" className="!h-3 !w-3 !border-2 !border-background !bg-sky-400" />
      <PortLabel label="image out" side="right" top="50%" color="#38bdf8" />
      <div className="w-[220px] overflow-hidden rounded-xl border border-border bg-card shadow-lg" style={workflowStyle?.border ? { borderColor: workflowStyle.border } : undefined}>
        <Header icon={<ImageIcon className="h-3 w-3" />} label="Image Input" color="text-sky-400" />
        <div className="p-2.5">
          <div className="relative flex min-h-[140px] cursor-pointer items-center justify-center overflow-hidden rounded-md border border-dashed border-border bg-muted/20" onClick={() => !imageUrl && inputRef.current?.click()}>
            {imageUrl ? (
              <>
                <img src={imageUrl} alt="Reference image" className="block w-full" />
                <ClearButton onClick={() => setImageUrl(undefined)} />
              </>
            ) : (
              <Empty icon={<ImageIcon className="h-5 w-5" />} text="Add image" />
            )}
            <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={pick} />
          </div>
        </div>
      </div>
    </div>
  );
}

function VideoInputNodeComponent({ id, data }: NodeProps) {
  const { motionId, inputId, motion, input, workflowStyle, updateMotionControl, updateInputNode } = useMotion(id, data);
  const inputRef = useRef<HTMLInputElement>(null);
  if (!motion && !input) return null;
  const videoUrl = motion?.videoUrl ?? input?.videoUrl;
  const setVideoUrl = (url?: string) => {
    if (motionId) updateMotionControl(motionId, { videoUrl: url });
    if (inputId) updateInputNode(inputId, { videoUrl: url });
  };

  const pick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setVideoUrl(await readMediaFile(file));
    event.target.value = '';
  };

  return (
    <div className="relative">
      <Handle type="source" position={Position.Right} id="motion-video-out" className="!h-3 !w-3 !border-2 !border-background !bg-orange-500" />
      <PortLabel label="video out" side="right" top="50%" color="#f97316" />
      <div className="w-[220px] overflow-hidden rounded-xl border border-border bg-card shadow-lg" style={workflowStyle?.border ? { borderColor: workflowStyle.border } : undefined}>
        <Header icon={<Video className="h-3 w-3" />} label="Video Input" color="text-orange-400" />
        <div className="p-2.5">
          <div className="relative flex min-h-[124px] cursor-pointer items-center justify-center overflow-hidden rounded-md border border-dashed border-border bg-muted/20" onClick={() => !videoUrl && inputRef.current?.click()}>
            {videoUrl ? (
              <>
                <video src={videoUrl} className="block w-full" muted loop controls preload="metadata" />
                <ClearButton onClick={() => setVideoUrl(undefined)} />
              </>
            ) : (
              <Empty icon={<Video className="h-5 w-5" />} text="Add motion video" />
            )}
            <input ref={inputRef} type="file" accept="video/*" className="hidden" onChange={pick} />
          </div>
        </div>
      </div>
    </div>
  );
}

function PromptInputNodeComponent({ id, data }: NodeProps) {
  const { motionId, inputId, motion, input, workflowStyle, updateMotionControl, updateInputNode } = useMotion(id, data);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [draftNeg, setDraftNeg] = useState('');
  if (!motion && !input) return null;
  const prompt = motion?.prompt ?? input?.prompt ?? '';
  const negativePrompt = motion?.negativePrompt ?? input?.negativePrompt ?? '';
  
  const setPrompts = (p: string, np: string) => {
    if (motionId) updateMotionControl(motionId, { prompt: p, negativePrompt: np });
    if (inputId) updateInputNode(inputId, { prompt: p, negativePrompt: np });
  };

  const openEdit = () => {
    setDraft(prompt);
    setDraftNeg(negativePrompt);
    setOpen(true);
  };

  return (
    <>
      <div className="relative">
        <Handle type="source" position={Position.Right} id="motion-prompt-out" className="!h-3 !w-3 !border-2 !border-background !bg-purple-400" />
        <PortLabel label="prompt out" side="right" top="50%" color="#c084fc" />
        <div className="w-[220px] overflow-hidden rounded-xl border border-border bg-card shadow-lg" style={workflowStyle?.border ? { borderColor: workflowStyle.border } : undefined}>
          <div className="flex items-center justify-between border-b border-border bg-muted/30 px-2.5 py-1.5">
            <span className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-purple-400">
              <Pencil className="h-3 w-3" /> Prompt Input
            </span>
            <button type="button" className="rounded p-0.5 hover:bg-muted" onClick={openEdit}>
              <Pencil className="h-3 w-3 text-muted-foreground" />
            </button>
          </div>
          <div className="p-2.5 text-[10px] leading-relaxed flex flex-col gap-2">
            <div>
              <span className="font-semibold text-muted-foreground">Prompt:</span>
              {prompt ? <p className="line-clamp-4 mt-0.5">{prompt}</p> : <p className="text-muted-foreground/60 mt-0.5">Optional prompt...</p>}
            </div>
            <div>
              <span className="font-semibold text-muted-foreground">Negative Prompt:</span>
              {negativePrompt ? <p className="line-clamp-3 mt-0.5">{negativePrompt}</p> : <p className="text-muted-foreground/60 mt-0.5">Optional negative prompt...</p>}
            </div>
          </div>
        </div>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="text-sm">Edit motion prompt</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Prompt</label>
              <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} className="min-h-[120px]" placeholder="Describe what to preserve, stylize, or avoid..." />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Negative Prompt</label>
              <Textarea value={draftNeg} onChange={(e) => setDraftNeg(e.target.value)} className="min-h-[80px]" placeholder="Things to avoid..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => { setPrompts(draft, draftNeg); setOpen(false); }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function MotionControlNodeComponent({ id, data }: NodeProps) {
  const { motion, workflowStyle, generateMotionControl, cancelMotionControl } = useMotion(id, data);
  if (!motion) return null;
  const busy = motion.status === 'queued' || motion.status === 'generating';

  return (
    <div className="relative">
      <Handle type="target" position={Position.Left} id="motion-image-in" className="!h-3 !w-3 !border-2 !border-background !bg-sky-400" style={{ top: '24%' }} />
      <Handle type="target" position={Position.Left} id="motion-video-in" className="!h-3 !w-3 !border-2 !border-background !bg-orange-500" style={{ top: '44%' }} />
      <Handle type="target" position={Position.Left} id="motion-prompt-in" className="!h-3 !w-3 !border-2 !border-background !bg-purple-400" style={{ top: '64%' }} />
      <Handle type="target" position={Position.Left} id="motion-parameters-in" className="!h-3 !w-3 !border-2 !border-background !bg-amber-500" style={{ top: '84%' }} />
      <PortLabel label="image" side="left" top="20%" color="#38bdf8" />
      <PortLabel label="video" side="left" top="40%" color="#f97316" />
      <PortLabel label="prompt" side="left" top="60%" color="#c084fc" />
      <PortLabel label="parameters" side="left" top="80%" color="#f59e0b" />
      <PortLabel label="video out" side="right" top="50%" color="#22c55e" />
      <div className="w-[260px] overflow-hidden rounded-xl border-2 border-sky-500/45 bg-card shadow-xl" style={workflowStyle?.border ? { borderColor: workflowStyle.border } : undefined}>
        <Header icon={<WandSparkles className="h-3 w-3" />} label={motion.title} color="text-sky-400" />
        <div className="space-y-2 p-3">
          <InputStatus label="Image" ready={Boolean(motion.imageUrl)} />
          <InputStatus label="Video" ready={Boolean(motion.videoUrl)} />
          <InputStatus label="Prompt" ready={Boolean(motion.prompt?.trim())} optional />
          {motion.error && <p className="text-[10px] leading-relaxed text-red-400">{motion.error}</p>}
          {busy && (
            <div className="space-y-1 rounded-md border border-border bg-muted/20 p-2 text-[10px] text-muted-foreground">
              <div className="flex justify-between"><span>Progress</span><span>{motion.progress ?? 0}%</span></div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.min(100, motion.progress ?? 0)}%` }} />
              </div>
            </div>
          )}
          {motion.outputUrl && (
            <video src={motion.outputUrl} controls preload="metadata" className="w-full rounded-md border border-border" poster={motion.imageUrl} />
          )}
          {busy ? (
            <Button size="sm" variant="outline" className="h-8 w-full gap-1.5 border-red-500/40 text-red-500 hover:bg-red-500/10 hover:text-red-500" onClick={() => cancelMotionControl(motion.id)}>
              <X className="h-3.5 w-3.5" />
              Stop Motion Generation
            </Button>
          ) : (
            <Button size="sm" className="h-8 w-full gap-1.5 text-xs" disabled={!motion.imageUrl || !motion.videoUrl} onClick={() => generateMotionControl(motion.id)}>
              <Play className="h-3.5 w-3.5" />
              {motion.outputUrl ? 'Regenerate Motion Video' : 'Generate Motion Video'}
            </Button>
          )}
          {motion.model && <p className="text-[9px] text-muted-foreground">Model: {motion.model}</p>}
        </div>
      </div>
      <Handle type="source" position={Position.Right} id="motion-output-out" className="!h-3 !w-3 !border-2 !border-background !bg-emerald-500" style={{ top: '50%' }} />
    </div>
  );
}

function MotionOutputNodeComponent({ id, data }: NodeProps) {
  const { motion, workflowStyle } = useMotion(id, data);
  const [now, setNow] = useState(() => Date.now());
  const busy = motion?.status === 'queued' || motion?.status === 'generating';
  const startedAt = motion?.generationStartedAt ? new Date(motion.generationStartedAt).getTime() : null;
  const elapsedMs = startedAt ? Math.max(0, now - startedAt) : 0;
  const estimateMs = 120_000;
  const remainingMs = busy ? Math.max(0, estimateMs - elapsedMs) : 0;

  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [busy]);

  if (!motion) return null;

  return (
    <div className="relative">
      <Handle type="target" position={Position.Left} id="motion-output-in" className="!h-3 !w-3 !border-2 !border-background !bg-emerald-500" />
      <PortLabel label="video in" side="left" top="50%" color="#22c55e" />
      <div className="w-[260px] overflow-hidden rounded-xl border-2 border-emerald-500/45 bg-card shadow-xl" style={workflowStyle?.border ? { borderColor: workflowStyle.border } : undefined}>
        <Header icon={<Video className="h-3 w-3" />} label="Motion Output" color="text-emerald-400" />
        <div className="space-y-2 p-3">
          {motion.outputUrl ? (
            <video src={motion.outputUrl} controls preload="metadata" className="w-full rounded-md border border-border" poster={motion.imageUrl} />
          ) : (
            <div className="flex min-h-[130px] items-center justify-center rounded-md border border-dashed border-border bg-muted/20">
              <Empty icon={busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Video className="h-5 w-5" />} text={busy ? `Generating ${motion.progress ?? 0}%` : 'No output yet'} />
            </div>
          )}
          {busy && (
            <div className="space-y-1 rounded-md border border-border bg-muted/20 p-2 text-[10px] text-muted-foreground">
              <div className="flex justify-between"><span>Elapsed</span><span>{formatDuration(elapsedMs)}</span></div>
              <div className="flex justify-between"><span>Remaining</span><span>{formatDuration(remainingMs)}</span></div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, motion.progress ?? 0)}%` }} />
              </div>
            </div>
          )}
          {motion.status === 'failed' && motion.error && <p className="text-[10px] leading-relaxed text-red-400">{motion.error}</p>}
          {motion.model && <p className="text-[9px] text-muted-foreground">Model: {motion.model}</p>}
        </div>
      </div>
    </div>
  );
}

function InputStatus({ label, ready, optional = false }: { label: string; ready: boolean; optional?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-muted/20 px-2 py-1.5 text-[10px]">
      <span className="text-muted-foreground">{label}{optional ? ' (optional)' : ''}</span>
      <span className={ready ? 'text-emerald-400' : optional ? 'text-muted-foreground' : 'text-red-400'}>
        {ready ? 'Connected' : optional ? 'Empty' : 'Missing'}
      </span>
    </div>
  );
}

function formatDuration(ms: number) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min > 0 ? `${min}m ${sec}s` : `${sec}s`;
}

function PortLabel({ label, side, top, color }: { label: string; side: 'left' | 'right'; top: string; color: string }) {
  return (
    <span
      className={`pointer-events-none absolute z-10 whitespace-nowrap text-[8px] font-medium ${
        side === 'left' ? 'right-full mr-2' : 'left-full ml-2'
      }`}
      style={{ top, color }}
    >
      {label}
    </span>
  );
}

function Header({ icon, label, color }: { icon: ReactNode; label: string; color: string }) {
  return <div className={`flex items-center gap-1 border-b border-border bg-muted/30 px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-wider ${color}`}>{icon}{label}</div>;
}

function Empty({ icon, text }: { icon: ReactNode; text: string }) {
  return <div className="flex flex-col items-center gap-1 text-muted-foreground/55">{icon}<span className="text-[10px]">{text}</span></div>;
}

function ClearButton({ onClick }: { onClick: () => void }) {
  return <button type="button" onClick={(e) => { e.stopPropagation(); onClick(); }} className="absolute right-1 top-1 rounded bg-black/60 p-1 text-white hover:bg-black/80"><X className="h-3 w-3" /></button>;
}

export const ImageInputNode = memo(ImageInputNodeComponent);
export const VideoInputNode = memo(VideoInputNodeComponent);
export const PromptInputNode = memo(PromptInputNodeComponent);
export const MotionControlNode = memo(MotionControlNodeComponent);
export const MotionOutputNode = memo(MotionOutputNodeComponent);
