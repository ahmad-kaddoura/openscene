'use client';

import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Download, Film, ImageIcon } from 'lucide-react';
import type { Scene } from '@/core/types';

function parseAspectRatio(ratio?: string) {
  if (!ratio) return { w: 9, h: 16, value: 9 / 16 };
  const [rawW, rawH] = ratio.split(':').map(Number);
  if (!rawW || !rawH) return { w: 9, h: 16, value: 9 / 16 };
  return { w: rawW, h: rawH, value: rawW / rawH };
}

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

export function OutputPreviewDialog({
  scene,
  url,
  isVideo,
  open,
  onOpenChange,
}: {
  scene: Scene;
  url: string;
  isVideo: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const aspect = useMemo(() => parseAspectRatio(scene.aspectRatio), [scene.aspectRatio]);
  const isPortrait = aspect.value <= 1;
  const ext = isVideo ? 'mp4' : 'png';
  const filename = `${scene.title.replace(/\s+/g, '-').toLowerCase()}-scene-${scene.order + 1}.${ext}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="gap-0 overflow-hidden border-border/70 bg-card p-0 shadow-2xl sm:max-w-none"
        style={{ width: isPortrait ? 'auto' : 'min(92vw, 960px)' }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border/60 px-4 py-3">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="h-5 px-2 text-[10px] font-medium">
                Scene #{scene.order + 1}
              </Badge>
              <Badge variant="outline" className="h-5 px-2 text-[10px] font-normal text-muted-foreground">
                {scene.duration}s
              </Badge>
              <Badge variant="outline" className="h-5 px-2 text-[10px] font-normal text-muted-foreground">
                {scene.aspectRatio ?? '9:16'}
              </Badge>
            </div>
            <DialogTitle className="text-left text-base font-semibold leading-tight">
              {scene.title}
            </DialogTitle>
          </div>
        </div>

        <div className="px-3 pb-3 pt-1 sm:px-4 sm:pb-4">
          <div
            className="relative mx-auto overflow-hidden rounded-xl bg-black shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)] ring-1 ring-white/10"
            style={
              isPortrait
                ? {
                    aspectRatio: `${aspect.w} / ${aspect.h}`,
                    height: 'min(76vh, 780px)',
                    width: 'auto',
                    maxWidth: 'min(88vw, 420px)',
                  }
                : {
                    aspectRatio: `${aspect.w} / ${aspect.h}`,
                    width: '100%',
                    maxHeight: 'min(76vh, 780px)',
                  }
            }
          >
            {isVideo ? (
              <video
                src={url}
                controls
                autoPlay
                loop
                playsInline
                className="h-full w-full bg-black object-contain"
              />
            ) : (
              <img
                src={url}
                alt={scene.title}
                className="h-full w-full bg-black object-contain"
              />
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border/60 px-4 py-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {isVideo ? <Film className="h-3.5 w-3.5" /> : <ImageIcon className="h-3.5 w-3.5" />}
            <span>{isVideo ? 'Generated video' : 'Generated frame'}</span>
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="h-8 gap-1.5 text-xs"
            onClick={() => downloadAsset(url, filename)}
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
