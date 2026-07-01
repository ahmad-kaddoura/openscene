'use client';

import { memo, useEffect, useMemo, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Loader2, AlertCircle, Download, Eye, RotateCcw, Trash2, Film, Layers, Info,
} from 'lucide-react';
import { useWorkflowStore } from '@/features/workflow/store';
import { useProjectStore } from '@/features/project/store';
import { estimateSceneGenerationMs, formatGenerationDuration } from '@/features/workflow/lib/generate-scene';

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

type OutputMediaInfo = {
  duration?: number;
  width?: number;
  height?: number;
  sizeBytes?: number;
  mimeType?: string;
};

function formatSeconds(seconds: number | undefined) {
  if (!Number.isFinite(seconds)) return 'Unknown';
  const safeSeconds = Math.max(0, Number(seconds));
  const mins = Math.floor(safeSeconds / 60);
  const secs = Math.round(safeSeconds % 60);
  return mins > 0 ? `${mins}m ${secs.toString().padStart(2, '0')}s` : `${secs}s`;
}

function formatBytes(bytes: number | undefined) {
  if (!Number.isFinite(bytes) || !bytes) return 'Unknown';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = Number(bytes);
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

function estimateDataUrlBytes(url: string) {
  const commaIndex = url.indexOf(',');
  if (!url.startsWith('data:') || commaIndex === -1) return undefined;
  const payload = url.slice(commaIndex + 1);
  return Math.floor((payload.length * 3) / 4) - (payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0);
}

function mediaTypeFromUrl(url: string, fallback: string) {
  if (url.startsWith('data:')) return url.slice(5, url.indexOf(';')) || fallback;
  const clean = url.split('?')[0].toLowerCase();
  if (clean.endsWith('.webm')) return 'video/webm';
  if (clean.endsWith('.mov')) return 'video/quicktime';
  if (clean.endsWith('.png')) return 'image/png';
  if (clean.endsWith('.jpg') || clean.endsWith('.jpeg')) return 'image/jpeg';
  return fallback;
}

async function loadOutputMediaInfo(url: string, isVideo: boolean): Promise<OutputMediaInfo> {
  const info: OutputMediaInfo = {
    mimeType: mediaTypeFromUrl(url, isVideo ? 'video/mp4' : 'image/png'),
    sizeBytes: estimateDataUrlBytes(url),
  };

  const mediaInfo = await new Promise<OutputMediaInfo>((resolve) => {
    const element = isVideo ? document.createElement('video') : document.createElement('img');
    const cleanup = () => {
      element.removeAttribute('src');
      if (isVideo) (element as HTMLVideoElement).load();
    };
    const done = (value: OutputMediaInfo) => {
      cleanup();
      resolve(value);
    };
    element.crossOrigin = 'anonymous';
    element.addEventListener('error', () => done({}), { once: true });
    if (isVideo) {
      const video = element as HTMLVideoElement;
      video.preload = 'metadata';
      video.addEventListener('loadedmetadata', () => {
        done({
          duration: Number.isFinite(video.duration) ? video.duration : undefined,
          width: video.videoWidth || undefined,
          height: video.videoHeight || undefined,
        });
      }, { once: true });
    } else {
      const image = element as HTMLImageElement;
      image.addEventListener('load', () => {
        done({ width: image.naturalWidth || undefined, height: image.naturalHeight || undefined });
      }, { once: true });
    }
    element.src = url;
  });

  if (!info.sizeBytes && !url.startsWith('data:')) {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      const length = response.headers.get('content-length');
      const type = response.headers.get('content-type');
      info.sizeBytes = length ? Number(length) : undefined;
      info.mimeType = type || info.mimeType;
    } catch {
      // Some remote providers do not allow HEAD/CORS; media dimensions still remain useful.
    }
  }

  return { ...info, ...mediaInfo };
}

function SceneOutputNode({
  sceneId,
  workflowStyle,
}: {
  sceneId: string;
  workflowStyle?: { border?: string; line?: string };
}) {
  const scene = useWorkflowStore((s) => s.sceneMap[sceneId]);
  const clearSceneOutput = useWorkflowStore((s) => s.clearSceneOutput);
  const retrySceneGeneration = useWorkflowStore((s) => s.retrySceneGeneration);
  const [now, setNow] = useState(() => Date.now());
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [loadedMediaInfo, setLoadedMediaInfo] = useState<{ url: string; info: OutputMediaInfo } | null>(null);

  const isGenerating = scene?.status === 'generating' || scene?.status === 'regenerating';
  const isQueued = scene?.status === 'queued';
  const isComplete = scene?.status === 'completed';
  const isFailed = scene?.status === 'failed';
  const previewUrl = scene?.generatedVideoUrl ?? scene?.generatedStartFrameUrl;
  const isVideo = Boolean(scene?.generatedVideoUrl);

  useEffect(() => {
    if (!isGenerating && !isQueued) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isGenerating, isQueued]);

  useEffect(() => {
    if (!previewUrl || !isComplete) {
      return;
    }
    let active = true;
    void loadOutputMediaInfo(previewUrl, isVideo).then((info) => {
      if (active) setLoadedMediaInfo({ url: previewUrl, info });
    });
    return () => { active = false; };
  }, [isComplete, isVideo, previewUrl]);

  if (!scene) return null;

  const progress = scene.generationProgress ?? 0;
  const ext = isVideo ? 'mp4' : 'png';
  const filename = `${scene.title.replace(/\s+/g, '-').toLowerCase()}-scene-${scene.order + 1}.${ext}`;
  const startedAt = scene.generationStartedAt ? new Date(scene.generationStartedAt).getTime() : null;
  const estimatedTotalMs = estimateSceneGenerationMs(scene);
  const elapsedMs = startedAt ? Math.max(0, now - startedAt) : 0;
  const remainingMs = startedAt ? Math.max(0, estimatedTotalMs - elapsedMs) : estimatedTotalMs;
  const mediaInfo = loadedMediaInfo && loadedMediaInfo.url === previewUrl ? loadedMediaInfo.info : null;
  const displayDuration = mediaInfo?.duration ?? scene.duration;
  const displayResolution = mediaInfo?.width && mediaInfo?.height
    ? `${mediaInfo.width}x${mediaInfo.height}`
    : scene.aspectRatio ?? 'Unknown';

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
      <Handle
        type="source"
        position={Position.Right}
        id="output-out"
        className="!w-3 !h-3 !bg-emerald-500 !border-2 !border-background"
      />

      <div
        className={`w-[220px] rounded-xl border-2 ${borderClass} bg-card shadow-xl overflow-hidden`}
        style={workflowStyle?.border ? { borderColor: workflowStyle.border } : undefined}
      >
        <div className="px-2.5 py-1.5 border-b border-border bg-muted/30">
          <span className="text-[9px] uppercase tracking-wider text-emerald-400 font-semibold">Output</span>
        </div>

        <div className="bg-muted/30 relative">
          {isGenerating || isQueued ? (
            <div className="flex min-h-[148px] flex-col items-center justify-center gap-1.5 p-3 bg-blue-500/5">
              <Loader2 className="w-7 h-7 text-blue-400 animate-spin" />
              <span className="text-[10px] text-blue-400 font-medium">
                {isQueued ? 'Queued…' : 'Generating video…'}
              </span>
              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mx-3">
                <div
                  className="h-full bg-blue-500 transition-all duration-500 ease-out"
                  style={{ width: `${isQueued ? 5 : progress}%` }}
                />
              </div>
              {!isQueued && (
                <>
                  <span className="text-[9px] font-medium text-blue-300">{progress}%</span>
                  <span className="text-[9px] text-muted-foreground text-center leading-relaxed">
                    {formatGenerationDuration(elapsedMs)} elapsed · ~{formatGenerationDuration(remainingMs)} left
                  </span>
                  {scene.generationError && (
                    <span className="text-[9px] text-amber-300/90 text-center line-clamp-2">{scene.generationError}</span>
                  )}
                </>
              )}
            </div>
          ) : isComplete && previewUrl ? (
            isVideo ? (
              <video
                src={previewUrl}
                className="block w-full h-auto bg-muted/30"
                muted
                playsInline
                loop
                autoPlay
                poster={scene.startFrameUrl ?? scene.generatedStartFrameUrl}
              />
            ) : (
              <img src={previewUrl} alt={scene.title} className="block w-full h-auto bg-muted/30" />
            )
          ) : isFailed ? (
            <div className="flex min-h-[120px] flex-col items-center justify-center gap-1.5 text-red-400 bg-red-500/5 p-3">
              <AlertCircle className="w-6 h-6" />
              <span className="text-[10px] font-medium">Failed</span>
              {scene.generationError && (
                <span className="text-[9px] text-center text-red-300/80 line-clamp-3">{scene.generationError}</span>
              )}
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
          {isComplete && previewUrl && (
            <div className="mb-1.5 grid grid-cols-2 gap-1 text-[9px] text-muted-foreground">
              <div className="rounded bg-muted/40 px-1.5 py-1">
                <span className="block uppercase tracking-wide opacity-70">Duration</span>
                <span className="text-foreground">{formatSeconds(displayDuration)}</span>
              </div>
              <button
                type="button"
                onClick={() => setDetailsOpen(true)}
                className="rounded bg-muted/40 px-1.5 py-1 text-left hover:bg-muted"
              >
                <span className="block uppercase tracking-wide opacity-70">Details</span>
                <span className="flex items-center gap-1 text-foreground">
                  {displayResolution}
                  <Info className="h-2.5 w-2.5" />
                </span>
              </button>
            </div>
          )}

          {(isComplete || isFailed || (isGenerating && scene.generationError)) && (
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

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Output Details</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-xs">
            <DetailRow label="Scene" value={scene.title} />
            <DetailRow label="Type" value={isVideo ? 'Video' : 'Image'} />
            <DetailRow label="Duration" value={formatSeconds(displayDuration)} />
            <DetailRow label="Resolution" value={displayResolution} />
            <DetailRow label="Size" value={formatBytes(mediaInfo?.sizeBytes)} />
            <DetailRow label="Format" value={mediaInfo?.mimeType ?? (isVideo ? 'video/mp4' : 'image/png')} />
            <DetailRow label="Status" value={scene.status} />
            {scene.generationModel && <DetailRow label="Model" value={scene.generationModel} />}
            {scene.generatedVideoUrl && <DetailRow label="Video URL" value={scene.generatedVideoUrl} compact />}
            {!scene.generatedVideoUrl && scene.generatedStartFrameUrl && <DetailRow label="Image URL" value={scene.generatedStartFrameUrl} compact />}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailRow({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className="flex gap-3 border-b border-border/60 pb-2 last:border-0 last:pb-0">
      <span className="w-20 shrink-0 text-muted-foreground">{label}</span>
      <span className={`min-w-0 flex-1 text-foreground ${compact ? 'break-all text-[10px]' : ''}`}>{value}</span>
    </div>
  );
}

function OutputNodeComponent({ data }: NodeProps) {
  const final = Boolean((data as { final?: boolean }).final);
  const sceneId = (data as { sceneId?: string }).sceneId;
  const workflowStyle = (data as { workflowStyle?: { border?: string; line?: string } }).workflowStyle;
  const sceneOrder = useWorkflowStore((s) => s.sceneOrder);
  const sceneMap = useWorkflowStore((s) => s.sceneMap);
  const scenes = useMemo(
    () => sceneOrder.map((id) => sceneMap[id]).filter(Boolean),
    [sceneOrder, sceneMap],
  );
  const setPhase = useProjectStore((s) => s.setPhase);

  if (final) {
    return (
      <div className="relative">
        <Handle type="target" position={Position.Left} id="output-in" className="!w-3 !h-3 !bg-emerald-500 !border-2 !border-background" />
        <div
          className="w-[240px] rounded-xl border-2 border-emerald-500/60 bg-card shadow-xl overflow-hidden"
          style={workflowStyle?.border ? { borderColor: workflowStyle.border } : undefined}
        >
          <div className="px-2.5 py-1.5 border-b border-border bg-muted/30">
            <span className="text-[9px] uppercase tracking-wider text-emerald-400 font-semibold">Final Output</span>
          </div>
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-400">
                <Layers className="h-4 w-4" />
              </div>
              <div>
                <div className="text-xs font-semibold">Connected Timeline Render</div>
                <div className="text-[10px] text-muted-foreground">{scenes.length} scenes · {scenes.length ? scenes[scenes.length - 1].endTime : 0}s</div>
              </div>
            </div>
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              All scene videos are connected in sequence. Open Timeline to trim, rearrange, preview, and export.
            </p>
            <Button size="sm" className="h-7 w-full gap-1.5 text-xs" onClick={() => setPhase('timeline')}>
              Open Timeline
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!sceneId) return null;

  return <SceneOutputNode sceneId={sceneId} workflowStyle={workflowStyle} />;
}

export const OutputNode = memo(OutputNodeComponent);
