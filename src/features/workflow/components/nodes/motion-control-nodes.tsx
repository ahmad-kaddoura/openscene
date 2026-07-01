'use client';

import { memo, useRef, useState, type ReactNode } from 'react';
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
  const input = useWorkflowStore((s) => inputId ? s.motionInputNodes.find((item) => item.id === inputId) : undefined);
  const updateMotionControl = useWorkflowStore((s) => s.updateMotionControl);
  const updateMotionInput = useWorkflowStore((s) => s.updateMotionInput);
  const generateMotionControl = useWorkflowStore((s) => s.generateMotionControl);
  return { id, motionId, inputId, motion, input, workflowStyle, updateMotionControl, updateMotionInput, generateMotionControl };
}

function MotionImageNodeComponent({ id, data }: NodeProps) {
  const { motionId, inputId, motion, input, workflowStyle, updateMotionControl, updateMotionInput } = useMotion(id, data);
  const inputRef = useRef<HTMLInputElement>(null);
  if (!motion && !input) return null;
  const imageUrl = motion?.imageUrl ?? input?.imageUrl;
  const setImageUrl = (url?: string) => {
    if (motionId) updateMotionControl(motionId, { imageUrl: url });
    if (inputId) updateMotionInput(inputId, { imageUrl: url });
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
      <div className="w-[220px] overflow-hidden rounded-xl border border-border bg-card shadow-lg" style={workflowStyle?.border ? { borderColor: workflowStyle.border } : undefined}>
        <Header icon={<ImageIcon className="h-3 w-3" />} label="Reference Image" color="text-sky-400" />
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

function MotionVideoNodeComponent({ id, data }: NodeProps) {
  const { motionId, inputId, motion, input, workflowStyle, updateMotionControl, updateMotionInput } = useMotion(id, data);
  const inputRef = useRef<HTMLInputElement>(null);
  if (!motion && !input) return null;
  const videoUrl = motion?.videoUrl ?? input?.videoUrl;
  const setVideoUrl = (url?: string) => {
    if (motionId) updateMotionControl(motionId, { videoUrl: url });
    if (inputId) updateMotionInput(inputId, { videoUrl: url });
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
      <div className="w-[220px] overflow-hidden rounded-xl border border-border bg-card shadow-lg" style={workflowStyle?.border ? { borderColor: workflowStyle.border } : undefined}>
        <Header icon={<Video className="h-3 w-3" />} label="Reference Video" color="text-orange-400" />
        <div className="p-2.5">
          <div className="relative flex min-h-[124px] cursor-pointer items-center justify-center overflow-hidden rounded-md border border-dashed border-border bg-muted/20" onClick={() => !videoUrl && inputRef.current?.click()}>
            {videoUrl ? (
              <>
                <video src={videoUrl} className="block w-full" muted loop controls />
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

function MotionPromptNodeComponent({ id, data }: NodeProps) {
  const { motionId, inputId, motion, input, workflowStyle, updateMotionControl, updateMotionInput } = useMotion(id, data);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  if (!motion && !input) return null;
  const prompt = motion?.prompt ?? input?.prompt ?? '';
  const setPrompt = (value: string) => {
    if (motionId) updateMotionControl(motionId, { prompt: value });
    if (inputId) updateMotionInput(inputId, { prompt: value });
  };

  const openEdit = () => {
    setDraft(prompt);
    setOpen(true);
  };

  return (
    <>
      <div className="relative">
        <Handle type="source" position={Position.Right} id="motion-prompt-out" className="!h-3 !w-3 !border-2 !border-background !bg-purple-400" />
        <div className="w-[220px] overflow-hidden rounded-xl border border-border bg-card shadow-lg" style={workflowStyle?.border ? { borderColor: workflowStyle.border } : undefined}>
          <div className="flex items-center justify-between border-b border-border bg-muted/30 px-2.5 py-1.5">
            <span className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-purple-400">
              <Pencil className="h-3 w-3" /> Motion Prompt
            </span>
            <button type="button" className="rounded p-0.5 hover:bg-muted" onClick={openEdit}>
              <Pencil className="h-3 w-3 text-muted-foreground" />
            </button>
          </div>
          <div className="p-2.5 text-[10px] leading-relaxed">
            {prompt ? <p className="line-clamp-5">{prompt}</p> : <p className="text-muted-foreground/60">Optional prompt...</p>}
          </div>
        </div>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="text-sm">Edit motion prompt</DialogTitle></DialogHeader>
          <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} className="min-h-[180px]" placeholder="Describe what to preserve, stylize, or avoid..." />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => { setPrompt(draft); setOpen(false); }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function MotionControlNodeComponent({ id, data }: NodeProps) {
  const { motion, workflowStyle, generateMotionControl } = useMotion(id, data);
  if (!motion) return null;
  const busy = motion.status === 'queued' || motion.status === 'generating';

  return (
    <div className="relative">
      <Handle type="target" position={Position.Left} id="motion-image-in" className="!h-3 !w-3 !border-2 !border-background !bg-sky-400" style={{ top: '28%' }} />
      <Handle type="target" position={Position.Left} id="motion-video-in" className="!h-3 !w-3 !border-2 !border-background !bg-orange-500" style={{ top: '48%' }} />
      <Handle type="target" position={Position.Left} id="motion-prompt-in" className="!h-3 !w-3 !border-2 !border-background !bg-purple-400" style={{ top: '68%' }} />
      <div className="w-[260px] overflow-hidden rounded-xl border-2 border-sky-500/45 bg-card shadow-xl" style={workflowStyle?.border ? { borderColor: workflowStyle.border } : undefined}>
        <Header icon={<WandSparkles className="h-3 w-3" />} label={motion.title} color="text-sky-400" />
        <div className="space-y-2 p-3">
          {motion.outputUrl ? (
            <video src={motion.outputUrl} controls className="w-full rounded-md border border-border" poster={motion.imageUrl} />
          ) : (
            <div className="flex min-h-[120px] items-center justify-center rounded-md border border-dashed border-border bg-muted/20">
              <Empty icon={busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <WandSparkles className="h-5 w-5" />} text={busy ? `Generating ${motion.progress ?? 0}%` : 'Motion output'} />
            </div>
          )}
          {motion.error && <p className="text-[10px] leading-relaxed text-red-400">{motion.error}</p>}
          <Button size="sm" className="h-8 w-full gap-1.5 text-xs" disabled={busy || !motion.imageUrl || !motion.videoUrl} onClick={() => generateMotionControl(motion.id)}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            {motion.outputUrl ? 'Regenerate Motion Video' : 'Generate Motion Video'}
          </Button>
          {motion.model && <p className="text-[9px] text-muted-foreground">Model: {motion.model}</p>}
        </div>
      </div>
    </div>
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

export const MotionImageNode = memo(MotionImageNodeComponent);
export const MotionVideoNode = memo(MotionVideoNodeComponent);
export const MotionPromptNode = memo(MotionPromptNodeComponent);
export const MotionControlNode = memo(MotionControlNodeComponent);
