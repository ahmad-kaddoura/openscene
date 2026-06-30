'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CAMERA_MOVEMENTS, STYLE_PRESETS } from '@/core/config';
import { useWorkflowStore } from './store';

const ASPECT_RATIOS = ['9:16', '16:9', '1:1', '4:5', '21:9'];

function ParamsNodeComponent({ data }: NodeProps) {
  const sceneId = (data as { sceneId: string }).sceneId;
  const scene = useWorkflowStore((s) => s.sceneMap[sceneId]);
  const updateScene = useWorkflowStore((s) => s.updateScene);

  if (!scene) return null;

  return (
    <div className="relative">
      <Handle
        type="source"
        position={Position.Right}
        id="parameters-out"
        className="!w-3 !h-3 !bg-amber-500 !border-2 !border-background"
      />

      <div className="w-[180px] rounded-xl border border-border bg-card shadow-lg overflow-hidden">
        <div className="px-2.5 py-1.5 border-b border-border bg-muted/30">
          <span className="text-[9px] uppercase tracking-wider text-amber-500 font-semibold">
            Parameters
          </span>
        </div>

        <div className="p-2.5 space-y-2">
          <Field label="Duration">
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min={1}
                max={60}
                value={scene.duration}
                onChange={(e) => {
                  const d = Number(e.target.value) || 1;
                  updateScene(sceneId, {
                    duration: d,
                    endTime: scene.startTime + d,
                  });
                }}
                className="h-7 text-xs px-1.5"
              />
              <span className="text-[9px] text-muted-foreground">s</span>
            </div>
          </Field>

          <Field label="Aspect Ratio">
            <Select
              value={scene.aspectRatio ?? '9:16'}
              onValueChange={(v) => updateScene(sceneId, { aspectRatio: v })}
            >
              <SelectTrigger className="h-7 text-xs px-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASPECT_RATIOS.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Camera">
            <Select
              value={scene.cameraMovement}
              onValueChange={(v) => updateScene(sceneId, { cameraMovement: v as typeof scene.cameraMovement })}
            >
              <SelectTrigger className="h-7 text-xs px-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CAMERA_MOVEMENTS.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Visual Style">
            <Select
              value={scene.stylePreset}
              onValueChange={(v) => updateScene(sceneId, { stylePreset: v as typeof scene.stylePreset })}
            >
              <SelectTrigger className="h-7 text-xs px-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STYLE_PRESETS.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Lighting">
            <Input
              type="text"
              value={scene.lighting ?? ''}
              placeholder="golden hour…"
              onChange={(e) => updateScene(sceneId, { lighting: e.target.value })}
              className="h-7 text-xs px-2"
            />
          </Field>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

export const ParametersNode = memo(ParamsNodeComponent);
/** @deprecated use ParametersNode */
export const ParamsNode = ParametersNode;
