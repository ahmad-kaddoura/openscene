'use client';

import { memo, useCallback } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/shared/ui/status-badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Play, RotateCcw, Trash2, Sparkles, ImageIcon, Loader2 } from 'lucide-react';
import { AI_ACTIONS } from '../../lib/ai-actions';
import { useWorkflowStore } from '@/features/workflow/store';
import { useSettingsStore } from '@/features/settings/store';
import type { Scene } from '@/core/types';
type WorkflowStyle = { border?: string; line?: string };

function PortLabel({ label, top, color, side }: { label: string; top: string; color: string; side: 'left' | 'right' }) {
  return (
    <span
      className={`absolute text-[8px] font-medium pointer-events-none whitespace-nowrap ${
        side === 'left' ? 'right-full mr-2' : 'left-full ml-2'
      }`}
      style={{ top, color }}
    >
      {label}
    </span>
  );
}

function SceneNodeComponent({ data, id }: NodeProps) {
  const storedScene = useWorkflowStore((s) => s.sceneMap[id]);
  const fallback = data as unknown as Scene;
  const scene = storedScene ?? fallback;
  const workflowStyle = (data as unknown as { workflowStyle?: WorkflowStyle }).workflowStyle;
  const generateScene = useWorkflowStore((s) => s.generateScene);
  const inNodeLabels = useSettingsStore((s) => (s.settings.edgeLabelPlacement ?? 'in-node') === 'in-node');

  const isGenerating = scene.status === 'generating' || scene.status === 'regenerating';
  const refPreview = scene.startFrameUrl ?? scene.generatedStartFrameUrl ?? scene.referenceImageUrls?.[0];

  const statusColors: Record<string, string> = {
    idle: 'border-border',
    queued: 'border-yellow-500/50',
    generating: 'border-blue-500/50 shadow-blue-500/10',
    completed: 'border-emerald-500/50',
    failed: 'border-red-500/50',
  };

  const handleUpdate = useCallback((updates: Partial<Scene>) => {
    const updater = (window as any).__sceneNodeUpdate;
    if (updater) updater(id, updates);
  }, [id]);

  const handleAIAction = (action: string) => {
    const enhanced = `${scene.prompt}, ${action === 'cinematic' ? 'dramatic cinematic lighting, shallow depth of field, film grain' : action === 'realistic' ? 'photorealistic, natural lighting, 4K quality' : action === 'viral' ? 'high energy, dynamic, attention-grabbing' : action === 'camera' ? 'smooth professional camera work' : 'enhanced visual quality, more detailed'}`;
    handleUpdate({ prompt: enhanced });
  };

  return (
    <div className="relative">
      <Handle type="target" position={Position.Left} id="flow-in" className="!w-3 !h-3 !bg-primary !border-2 !border-background" style={{ top: '12%' }} />
      <Handle type="target" position={Position.Left} id="parameters-in" className="!w-3 !h-3 !bg-amber-500 !border-2 !border-background" style={{ top: '32%' }} />
      <Handle type="target" position={Position.Left} id="script-in" className="!w-3 !h-3 !bg-violet-500 !border-2 !border-background" style={{ top: '52%' }} />
      <Handle type="target" position={Position.Left} id="frames-in" className="!w-3 !h-3 !bg-teal-500 !border-2 !border-background" style={{ top: '72%' }} />
      <Handle type="target" position={Position.Left} id="asset-in" className="!w-3 !h-3 !bg-cyan-400 !border-2 !border-background" style={{ top: '88%' }} />

      {inNodeLabels && (
        <>
          <PortLabel label="parameters" top="28%" color="hsl(45 93% 47%)" side="left" />
          <PortLabel label="script" top="48%" color="hsl(270 60% 60%)" side="left" />
          <PortLabel label="frames" top="68%" color="hsl(173 58% 45%)" side="left" />
          <PortLabel label="assets" top="84%" color="hsl(188 86% 53%)" side="left" />
          <PortLabel label="output" top="84%" color="hsl(142 71% 45%)" side="right" />
        </>
      )}

      <div
        className={`w-[240px] rounded-xl border-2 ${statusColors[scene.status] || 'border-border'} bg-card shadow-xl overflow-hidden`}
        style={workflowStyle?.border ? { borderColor: workflowStyle.border } : undefined}
      >
        <div className="px-2.5 py-1.5 border-b border-border bg-muted/30 flex items-center justify-between">
          <span className="text-[9px] uppercase tracking-wider font-semibold text-foreground/80">Scene</span>
          <StatusBadge status={scene.status} />
        </div>

        <div className="bg-muted/30 relative">
          {refPreview ? (
            <>
              <img src={refPreview} alt="Reference" className="block w-full h-auto opacity-80" />
              <div className="absolute bottom-1 left-1.5 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded">Ref</div>
            </>
          ) : (
            <div className="flex min-h-[80px] w-full items-center justify-center">
              <ImageIcon className="w-5 h-5 text-muted-foreground/30" />
            </div>
          )}
          <div className="absolute top-1.5 left-1.5 bg-black/60 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">#{scene.order + 1}</div>
          {isGenerating && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center gap-1.5">
              <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
              <span className="text-[10px] text-blue-400">Generating…</span>
            </div>
          )}
        </div>

        <div className="p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-xs font-semibold leading-tight line-clamp-2">{scene.title}</h3>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="p-0.5 rounded hover:bg-muted shrink-0"><MoreHorizontal className="w-3.5 h-3.5" /></button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={() => generateScene(id)} className="gap-2">
                  <Play className="w-3.5 h-3.5" /> Generate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {AI_ACTIONS.map((action) => (
                  <DropdownMenuItem key={action.label} onClick={() => handleAIAction(action.prompt)} className="gap-2">
                    <action.icon className="w-3.5 h-3.5" /> {action.label}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleUpdate({ status: 'idle' })} className="gap-2">
                  <RotateCcw className="w-3.5 h-3.5" /> Reset
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {scene.status === 'idle' || scene.status === 'failed' ? (
            <Button size="sm" className="w-full h-7 text-xs gap-1.5" onClick={() => generateScene(id)}>
              <Sparkles className="w-3 h-3" /> Generate Scene
            </Button>
          ) : scene.status === 'completed' ? (
            <Button variant="outline" size="sm" className="w-full h-7 text-xs gap-1.5" onClick={() => generateScene(id)}>
              <RotateCcw className="w-3 h-3" /> Regenerate
            </Button>
          ) : isGenerating || scene.status === 'queued' ? (
            <Button variant="outline" size="sm" className="w-full h-7 text-xs" disabled>Generating…</Button>
          ) : null}
        </div>
      </div>

      <Handle type="source" position={Position.Right} id="flow-out" className="!w-3 !h-3 !bg-primary !border-2 !border-background" style={{ top: '12%' }} />
      <Handle type="source" position={Position.Right} id="output-out" className="!w-3 !h-3 !bg-emerald-500 !border-2 !border-background" style={{ top: '88%' }} />
    </div>
  );
}

export const SceneNode = memo(SceneNodeComponent);
