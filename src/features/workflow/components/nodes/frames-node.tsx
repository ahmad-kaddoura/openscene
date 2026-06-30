'use client';

import { memo, useRef } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { ImageIcon, X, GalleryHorizontalEnd } from 'lucide-react';
import { useWorkflowStore } from './store';

function readImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function FrameSlot({
  label,
  url,
  onSet,
  onClear,
}: {
  label: string;
  url?: string;
  onSet: (url: string) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await readImageFile(file);
    onSet(dataUrl);
    e.target.value = '';
  };

  return (
    <div>
      <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <div
        className="mt-0.5 h-[52px] rounded-md border border-dashed border-border bg-muted/20 relative overflow-hidden cursor-pointer hover:border-teal-500/50 transition-colors"
        onClick={() => !url && inputRef.current?.click()}
      >
        {url ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={label} className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onClear(); }}
              className="absolute top-0.5 right-0.5 p-0.5 rounded bg-black/60 text-white hover:bg-black/80"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-0.5 text-muted-foreground/50">
            <ImageIcon className="w-3.5 h-3.5" />
            <span className="text-[8px]">Optional</span>
          </div>
        )}
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={pick} />
      </div>
    </div>
  );
}

function FramesNodeComponent({ data }: NodeProps) {
  const sceneId = (data as { sceneId: string }).sceneId;
  const scene = useWorkflowStore((s) => s.sceneMap[sceneId]);
  const updateScene = useWorkflowStore((s) => s.updateScene);

  if (!scene) return null;

  return (
    <div className="relative">
      <Handle
        type="source"
        position={Position.Right}
        id="frames-out"
        className="!w-3 !h-3 !bg-teal-500 !border-2 !border-background"
      />

      <div className="w-[180px] rounded-xl border border-border bg-card shadow-lg overflow-hidden">
        <div className="px-2.5 py-1.5 border-b border-border bg-muted/30 flex items-center gap-1">
          <GalleryHorizontalEnd className="w-3 h-3 text-teal-400" />
          <span className="text-[9px] uppercase tracking-wider text-teal-400 font-semibold">
            Frames
          </span>
        </div>

        <div className="p-2.5 space-y-2">
          <FrameSlot
            label="Start frame"
            url={scene.startFrameUrl}
            onSet={(url) => updateScene(sceneId, { startFrameUrl: url })}
            onClear={() => updateScene(sceneId, { startFrameUrl: undefined })}
          />
          <FrameSlot
            label="End frame"
            url={scene.endFrameUrl}
            onSet={(url) => updateScene(sceneId, { endFrameUrl: url })}
            onClear={() => updateScene(sceneId, { endFrameUrl: undefined })}
          />
        </div>
      </div>
    </div>
  );
}

export const FramesNode = memo(FramesNodeComponent);
