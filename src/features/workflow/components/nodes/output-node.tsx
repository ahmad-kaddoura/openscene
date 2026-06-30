'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Button } from '@/components/ui/button';
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Loader2, AlertCircle, Download, Eye, RotateCcw, Trash2, Film,
} from 'lucide-react';
import { useWorkflowStore } from './store';
import { outputNodeId } from './workflow-layout';

export { outputNodeId };

function downloadAsset(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function OutputNodeComponent({ data }: NodeProps) {
  const sceneId = (data as { sceneId: string }).sceneId;
  const scene = useWorkflowStore((s) => s.sceneMap[sceneId]);
  const clearSceneOutput = useWorkflowStore((s) => s.clearSceneOutput);
  const retrySceneGeneration = useWorkflowStore((s) => s.retrySceneGeneration);

  if (!scene) return null;

  const isGenerating = scene.status === 'generating' || scene.status === 'regenerating';
  const isQueued = scene.status === 'queued';
  const isComplete = scene.status === 'completed';
  const isFailed = scene.status === 'failed';
  const previewUrl = scene.generatedVideoUrl ?? scene.generatedStartFrameUrl;
  const progress = scene.generationProgress ?? 0;
  const isVideo = Boolean(scene.generatedVideoUrl);
  const ext = isVideo ? 'mp4' : 'png';
  const filename = `${scene.title.replace(/\s+/g, '-').toLowerCase()}-scene-${scene.order + 1}.${ext}`;

  const borderClass = isGenerating || isQueued
    ? 'border-blue-500/60 shadow-blue-500/15'
    : isComplete
      ? 'border-emerald-500/50'
      : 'border-red-500/50';

  const openView = () => {
    (window as any).__openOutputView?.(sceneId);
  };

  return (
    <div className="relative">
      <Handle
        type="target"
        position={Position.Left}
        id="output-in"
        className="!w-3 !h-3 !bg-emerald-500 !border-2 !border-background"
      />

      <div className={`w-[220px] rounded-xl border-2 ${borderClass} bg-card shadow-xl overflow-hidden`}>
        <div className="px-2.5 py-1.5 border-b border-border bg-muted/30">
          <span className="text-[9px] uppercase tracking-wider text-emerald-400 font-semibold">Output</span>
        </div>

        <div className="h-[130px] bg-muted/30 relative overflow-hidden">
          {isGenerating || isQueued ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 bg-blue-500/5">
              <Loader2 className="w-7 h-7 text-blue-400 animate-spin" />
              <span className="text-[10px] text-blue-400 font-medium">
                {isQueued ? 'Queued…' : 'Generating video…'}
              </span>
              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mx-3">
                <div
                  className="h-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${isQueued ? 5 : progress}%` }}
                />
              </div>
              {!isQueued && <span className="text-[9px] text-muted-foreground">{progress}%</span>}
            </div>
          ) : isComplete && previewUrl ? (
            isVideo ? (
              <video
                src={previewUrl}
                className="w-full h-full object-cover bg-muted/30"
                muted
                playsInline
                loop
                autoPlay
                poster={scene.startFrameUrl ?? scene.generatedStartFrameUrl}
              />
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={previewUrl} alt={scene.title} className="w-full h-full object-cover bg-muted/30" />
            )
          ) : isFailed ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-red-400 bg-red-500/5">
              <AlertCircle className="w-6 h-6" />
              <span className="text-[10px] font-medium">Failed</span>
            </div>
          ) : null}

          {isComplete && isVideo && (
            <div className="absolute bottom-1.5 left-1.5 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded flex items-center gap-1 pointer-events-none">
              <Film className="w-2.5 h-2.5" /> Video
            </div>
          )}
        </div>

        <div className="p-2 border-t border-border/50 bg-card">
          <p className="text-[10px] font-medium line-clamp-1 text-muted-foreground mb-1">{scene.title}</p>

          {(isComplete || isFailed) && (
            <div className="flex items-center justify-between">
              {isComplete && previewUrl && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={openView}>
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">View</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => downloadAsset(previewUrl, filename)}>
                        <Download className="w-3.5 h-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">Download</TooltipContent>
                  </Tooltip>
                </>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => retrySceneGeneration(sceneId)}>
                    <RotateCcw className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Retry</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-400" onClick={() => clearSceneOutput(sceneId)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Delete</TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const OutputNode = memo(OutputNodeComponent);
