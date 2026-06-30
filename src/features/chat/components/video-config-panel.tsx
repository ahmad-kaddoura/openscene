'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useProjectStore } from '@/features/project/store';
import { renderGenerativeUI } from '@/features/chat/generative-ui';
import type { GenerativeUIComponent } from '@/core/types';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';

const STEPS: { title: string; description: string; gui: GenerativeUIComponent }[] = [
  {
    title: 'Aspect Ratio',
    description: 'Shape of the final video — vertical for Reels/TikTok, widescreen for YouTube.',
    gui: {
      type: 'aspect_ratio_selector',
      data: { options: ['9:16', '1:1', '16:9', '4:5'] },
    },
  },
  {
    title: 'Length',
    description: 'Total duration of the exported video.',
    gui: {
      type: 'duration_selector',
      data: {
        options: [
          { id: 'd-15', label: 'Short', seconds: 15 },
          { id: 'd-30', label: 'Quick', seconds: 30 },
          { id: 'd-60', label: 'Medium', seconds: 60 },
          { id: 'd-90', label: 'Long', seconds: 90 },
          { id: 'd-180', label: 'Extended', seconds: 180 },
        ],
      },
    },
  },
  {
    title: 'Resolution',
    description: 'Output pixel dimensions — higher means sharper but larger files.',
    gui: {
      type: 'resolution_selector',
      data: { options: ['720p', '1080p', '1440p', '4K'] },
    },
  },
  {
    title: 'Frame Rate',
    description: '24fps feels cinematic, 30fps is standard, 60fps is smooth motion.',
    gui: {
      type: 'fps_selector',
      data: { options: [24, 30, 60] },
    },
  },
];

interface VideoConfigPanelProps {
  onDone?: () => void;
}

export function VideoConfigPanel({ onDone }: VideoConfigPanelProps) {
  const { getCurrentProject } = useProjectStore();
  const project = getCurrentProject();
  const [step, setStep] = useState(0);

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const summary = project
    ? {
        aspectRatio: project.settings.aspectRatio,
        duration: project.videoBrief?.duration ?? 30,
        resolution: project.settings.resolution,
        fps: project.settings.fps,
      }
    : null;

  return (
    <div className="space-y-5">
      {/* Step header */}
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">
          Step {step + 1} of {STEPS.length}
        </span>
        <div className="flex gap-1 flex-1">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= step ? 'bg-primary' : 'bg-border'
              }`}
            />
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold">{current.title}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{current.description}</p>
      </div>

      {renderGenerativeUI(current.gui, step, {
        onPresetSelect: () => setStep((s) => Math.min(s + 1, STEPS.length - 1)),
      })}

      {/* Live summary */}
      {summary && (
        <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5 text-[11px] text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
          <span>
            <span className="text-foreground font-medium">{summary.aspectRatio}</span> ratio
          </span>
          <span>
            <span className="text-foreground font-medium">{summary.duration}s</span> length
          </span>
          <span>
            <span className="text-foreground font-medium">{summary.resolution}</span>
          </span>
          <span>
            <span className="text-foreground font-medium">{summary.fps}</span> fps
          </span>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1 text-xs"
          onClick={() => setStep((s) => s - 1)}
          disabled={step === 0}
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Back
        </Button>

        {isLast ? (
          <Button type="button" size="sm" className="gap-1.5 text-xs" onClick={onDone}>
            <Check className="w-3.5 h-3.5" />
            Done
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            className="gap-1 text-xs"
            onClick={() => setStep((s) => s + 1)}
          >
            Next
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground text-center border-t border-border pt-3">
        Prefer chatting? Just tell the AI your specs — or use Settings → API Keys for Qwen Cloud credentials.
      </p>
    </div>
  );
}
