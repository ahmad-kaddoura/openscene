'use client';

import { useState } from 'react';
import type { GenerativeUIComponent } from '@/core/types';
import { STYLE_PRESETS, TARGET_PLATFORMS } from '@/core/config';
import * as LucideIcons from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useProjectStore } from '@/features/project/store';
import { useWorkflowStore } from '@/features/workflow/store';
import type { StylePreset, TargetPlatform, VideoBrief, Scene, HookOption, DirectorReview, AspectRatio } from '@/core/types';

export function renderGenerativeUI(gui: GenerativeUIComponent, key: number): React.ReactNode {
  switch (gui.type) {
    case 'style_selector': return <StyleSelector key={key} options={gui.data.options} />;
    case 'platform_selector': return <PlatformSelector key={key} options={gui.data.options} />;
    case 'aspect_ratio_selector': return <AspectRatioSelector key={key} options={gui.data.options} selected={gui.data.selected} />;
    case 'duration_selector': return <DurationSelector key={key} options={gui.data.options} selected={gui.data.selected} />;
    case 'resolution_selector': return <ResolutionSelector key={key} options={gui.data.options} selected={gui.data.selected} />;
    case 'fps_selector': return <FpsSelector key={key} options={gui.data.options} selected={gui.data.selected} />;
    case 'video_brief_form': return <VideoBriefForm key={key} data={gui.data} />;
    case 'scene_suggestion': return <SceneSuggestionCards key={key} scenes={gui.data} />;
    case 'hook_suggestions': return <HookSuggestions key={key} hooks={gui.data.hooks} />;
    case 'director_review': return <DirectorReviewPanel key={key} review={gui.data} />;
    default: return null;
  }
}

function StyleSelector({ options }: { options: StylePreset[] }) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-muted-foreground">🎨 Choose a Visual Style</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {STYLE_PRESETS.filter(s => options.includes(s.id)).map((style) => {
          const Icon = (LucideIcons as any)[style.icon] || LucideIcons.Film;
          return (
            <button
              key={style.id}
              className="flex items-center gap-2 p-2.5 rounded-lg border border-border hover:border-primary/40 hover:bg-primary/5 transition-all text-left group"
            >
              <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                <Icon className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-medium">{style.name}</div>
                <div className="text-[10px] text-muted-foreground line-clamp-1">{style.description}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PlatformSelector({ options }: { options: TargetPlatform[] }) {
  const { updateCurrentProject, getCurrentProject } = useProjectStore();
  const project = getCurrentProject();

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-muted-foreground">📱 Target Platform</div>
      <div className="flex flex-wrap gap-2">
        {TARGET_PLATFORMS.filter(p => options.includes(p.id)).map((platform) => (
          <button
            key={platform.id}
            onClick={() => {
              updateCurrentProject({
                settings: {
                  ...project!.settings,
                  targetPlatform: platform.id,
                  aspectRatio: platform.defaultRatio,
                },
              });
            }}
            className={`px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
              project?.settings.targetPlatform === platform.id
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border hover:border-primary/40'
            }`}
          >
            {platform.name}
            <span className="ml-1.5 text-muted-foreground font-normal">
              {platform.maxDuration < 60 ? `${platform.maxDuration}s` : `${Math.floor(platform.maxDuration / 60)}m`}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function AspectRatioSelector({ options, selected }: { options: AspectRatio[]; selected?: AspectRatio }) {
  const { updateCurrentProject, getCurrentProject } = useProjectStore();
  const project = getCurrentProject();
  const current = selected || project?.settings.aspectRatio;

  const previews: Record<AspectRatio, { w: number; h: number; label: string }> = {
    '9:16': { w: 18, h: 32, label: 'Vertical' },
    '1:1': { w: 28, h: 28, label: 'Square' },
    '16:9': { w: 32, h: 18, label: 'Widescreen' },
    '4:5': { w: 24, h: 30, label: 'Portrait' },
    'custom': { w: 30, h: 20, label: 'Custom' },
  };

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-muted-foreground">🖼️ Aspect Ratio</div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {options.map((ratio) => {
          const p = previews[ratio];
          const isActive = current === ratio;
          return (
            <button
              key={ratio}
              onClick={() => {
                updateCurrentProject({
                  settings: { ...project!.settings, aspectRatio: ratio },
                });
              }}
              className={`flex flex-col items-center gap-1.5 p-2.5 rounded-lg border text-xs transition-all ${
                isActive
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border hover:border-primary/40'
              }`}
            >
              <div className="h-9 flex items-center justify-center">
                <div
                  className={`rounded-sm border-2 ${isActive ? 'border-primary' : 'border-muted-foreground/40'}`}
                  style={{ width: p.w, height: p.h }}
                />
              </div>
              <div className="font-medium">{ratio}</div>
              <div className="text-[10px] text-muted-foreground">{p.label}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DurationSelector({ options, selected }: { options: { id: string; label: string; seconds: number }[]; selected?: string }) {
  const { updateCurrentProject, getCurrentProject } = useProjectStore();
  const project = getCurrentProject();
  const activeId = selected || (project?.videoBrief?.duration ? `d-${project.videoBrief.duration}` : undefined);

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-muted-foreground">⏱️ Length</div>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const isActive = activeId === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => {
                updateCurrentProject({
                  videoBrief: { ...project!.videoBrief, duration: opt.seconds } as VideoBrief,
                });
              }}
              className={`px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                isActive ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/40'
              }`}
            >
              {opt.label}
              <span className="ml-1.5 text-muted-foreground font-normal text-[10px]">{opt.seconds}s</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ResolutionSelector({ options, selected }: { options: string[]; selected?: string }) {
  const { updateCurrentProject, getCurrentProject } = useProjectStore();
  const project = getCurrentProject();
  const current = selected || project?.settings.resolution;

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-muted-foreground">🖥️ Resolution</div>
      <div className="flex flex-wrap gap-2">
        {options.map((res) => {
          const isActive = current === res;
          return (
            <button
              key={res}
              onClick={() => {
                updateCurrentProject({
                  settings: { ...project!.settings, resolution: res },
                });
              }}
              className={`px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                isActive ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/40'
              }`}
            >
              {res}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FpsSelector({ options, selected }: { options: number[]; selected?: number }) {
  const { updateCurrentProject, getCurrentProject } = useProjectStore();
  const project = getCurrentProject();
  const current = selected || project?.settings.fps;

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-muted-foreground">🎞️ Frame Rate</div>
      <div className="flex flex-wrap gap-2">
        {options.map((fps) => {
          const isActive = current === fps;
          return (
            <button
              key={fps}
              onClick={() => {
                updateCurrentProject({
                  settings: { ...project!.settings, fps },
                });
              }}
              className={`px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                isActive ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/40'
              }`}
            >
              {fps} fps
            </button>
          );
        })}
      </div>
    </div>
  );
}

function VideoBriefForm({ data }: { data: Partial<VideoBrief> }) {
  const { updateCurrentProject, setPhase, getCurrentProject } = useProjectStore();
  const [brief, setBrief] = useState(data);

  const handleSave = () => {
    updateCurrentProject({ videoBrief: brief as VideoBrief });
  };

  const handleSaveAndContinue = () => {
    updateCurrentProject({ videoBrief: brief as VideoBrief });
    setPhase('brief');
  };

  return (
    <Card className="border-primary/20 bg-card/80">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          📋 Video Brief
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Title" value={brief.title || ''} onChange={(v) => setBrief({...brief, title: v})} />
          <Field label="Duration" value={String(brief.duration || 30)} onChange={(v) => setBrief({...brief, duration: Number(v)})} />
          <Field label="Style" value={brief.style || ''} onChange={(v) => setBrief({...brief, style: v as StylePreset})} />
          <Field label="Mood" value={brief.mood || ''} onChange={(v) => setBrief({...brief, mood: v})} />
          <Field label="Scenes" value={String(brief.numberOfScenes || 4)} onChange={(v) => setBrief({...brief, numberOfScenes: Number(v)})} />
          <Field label="Scene Duration" value={`${brief.sceneDuration || 7}s`} onChange={(v) => setBrief({...brief, sceneDuration: Number(v.replace('s',''))})} />
          <Field label="Aspect Ratio" value={brief.aspectRatio || '9:16'} onChange={(v) => setBrief({...brief, aspectRatio: v as any})} />
          <Field label="FPS" value={String(brief.fps || 30)} onChange={(v) => setBrief({...brief, fps: Number(v)})} />
        </div>
        <Field label="Description" value={brief.description || ''} onChange={(v) => setBrief({...brief, description: v})} />
        <div className="flex gap-2 pt-2">
          <Button size="sm" variant="outline" onClick={handleSave}>Save Brief</Button>
          <Button size="sm" onClick={handleSaveAndContinue}>Save & Edit Full Brief →</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</label>
      <input
        className="mt-0.5 w-full bg-muted/30 border border-border rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function SceneSuggestionCards({ scenes }: { scenes: Partial<Scene>[] }) {
  const { updateCurrentProject, setPhase } = useProjectStore();
  const { buildFromStoryboard } = useWorkflowStore();

  const handleAccept = () => {
    const fullScenes = scenes.map((s, i) => ({
      id: s.id || `scene-${i}`,
      order: i,
      title: s.title || `Scene ${i + 1}`,
      prompt: s.prompt || '',
      startTime: s.startTime || 0,
      endTime: s.endTime || 0,
      duration: s.duration || 5,
      cameraMovement: s.cameraMovement || 'static',
      mood: s.mood || '',
      characters: s.characters || [],
      props: s.props || [],
      transition: s.transition || 'cut',
      textOverlays: s.textOverlays || [],
      stylePreset: s.stylePreset || 'cinematic',
      status: 'idle' as const,
      versions: s.versions || [],
      narration: s.narration,
      cta: s.cta,
    })) as Scene[];

    updateCurrentProject({
      storyboard: {
        id: `sb-${Date.now()}`,
        scenes: fullScenes,
        totalDuration: fullScenes[fullScenes.length - 1]?.endTime || 0,
        narrativeArc: 'AI-generated storyboard',
      },
    });
    buildFromStoryboard(fullScenes);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-muted-foreground">🎬 Suggested Scenes ({scenes.length})</div>
        <Button size="sm" onClick={handleAccept} className="h-7 text-xs gap-1">
          Accept All & Continue →
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {scenes.map((scene, idx) => (
          <Card key={scene.id || idx} className="border-border/50 bg-muted/20">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold">{scene.title}</span>
                <span className="text-[10px] text-muted-foreground">{scene.duration}s</span>
              </div>
              <p className="text-[11px] text-muted-foreground line-clamp-2 mb-2">{scene.prompt}</p>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                {scene.cameraMovement && (
                  <Badge variant="outline" className="text-[10px] h-4 px-1.5">{scene.cameraMovement.replace(/_/g, ' ')}</Badge>
                )}
                {scene.mood && <span>{scene.mood}</span>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function HookSuggestions({ hooks }: { hooks: HookOption[] }) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-muted-foreground">🎣 Hook Ideas</div>
      <div className="space-y-2">
        {hooks.map((hook) => (
          <div
            key={hook.id}
            className="flex items-start gap-3 p-3 rounded-lg border border-border/50 bg-muted/20 hover:border-primary/30 transition-colors cursor-pointer group"
          >
            <div className="flex-1">
              <p className="text-sm mb-1.5">&ldquo;{hook.text}&rdquo;</p>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                  {hook.style.replace(/_/g, ' ')}
                </Badge>
                <div className="flex items-center gap-1.5 flex-1 max-w-[120px]">
                  <Progress value={hook.estimatedRetention} className="h-1.5" />
                  <span className="text-[10px] text-muted-foreground">{hook.estimatedRetention}%</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DirectorReviewPanel({ review }: { review: DirectorReview }) {
  const scoreColor = review.overallScore >= 80 ? 'text-emerald-400' : review.overallScore >= 60 ? 'text-yellow-400' : 'text-red-400';

  return (
    <Card className="border-orange-500/20 bg-card/80">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center justify-between">
          <span>🎬 AI Director&apos;s Review</span>
          <span className={`text-lg font-bold ${scoreColor}`}>{review.overallScore}/100</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Score bar */}
        <Progress value={review.overallScore} className="h-2" />

        {/* Category scores */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <ReviewItem label="Pacing" value={review.pacing} />
          <ReviewItem label="Visual Consistency" value={review.visualConsistency} />
          <ReviewItem label="Character Consistency" value={review.characterConsistency} />
          <ReviewItem label="Product Consistency" value={review.productConsistency} />
          <ReviewItem label="CTA Assessment" value={review.ctaAssessment} />
          <ReviewItem label="Style Match" value={review.styleMatch} />
          <ReviewItem label="Transitions" value={review.transitionQuality} />
        </div>

        {/* Suggestions */}
        {review.suggestions.length > 0 && (
          <div>
            <div className="text-xs font-medium mb-1.5">💡 Suggestions</div>
            <ul className="space-y-1">
              {review.suggestions.map((s, i) => (
                <li key={i} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                  <span className="text-primary mt-0.5">•</span>
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Overall */}
        <div className="bg-muted/30 rounded-lg p-3 text-xs text-muted-foreground leading-relaxed">
          <strong className="text-foreground">Overall:</strong> {review.overallQuality}
        </div>
      </CardContent>
    </Card>
  );
}

function ReviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/30 rounded-md p-2">
      <div className="text-[10px] font-medium text-muted-foreground mb-0.5">{label}</div>
      <div className="text-[11px] line-clamp-2">{value}</div>
    </div>
  );
}