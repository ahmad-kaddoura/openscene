'use client';

import { useState } from 'react';
import type { GenerativeUIComponent } from '@/core/types';
import { STYLE_PRESETS, TARGET_PLATFORMS } from '@/core/config';
import * as LucideIcons from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import { useProjectStore } from '@/features/project/store';
import { useWorkflowStore } from '@/features/workflow';
import { storage } from '@/services/storage/indexeddb';
import type {
  StylePreset,
  TargetPlatform,
  VideoBrief,
  Scene,
  DirectorReview,
  AspectRatio,
  CreativeWorkflowPlan,
  ReusableAssetPlan,
  ConsistencyReference,
  VideoScript,
} from '@/core/types';
import { buildVideoBriefPatch, pixelsFromResolutionLabel, resolutionLabelFromPixels } from '../lib/video-output-utils';

const BRAND_KIT_STORAGE_KEY = 'openscene-brandkits';

export interface GenerativeUIOptions {
  /** When set, clicking a preset saves prefs and sends this as the user message. */
  onPresetSelect?: (message: string) => void;
  disabled?: boolean;
}

export function renderGenerativeUI(
  gui: GenerativeUIComponent,
  key: number,
  options?: GenerativeUIOptions
): React.ReactNode {
  const opts = options;
  switch (gui.type) {
    case 'creative_workflow_plan': return <CreativeWorkflowPlanCard key={key} plan={gui.data} onApprove={opts?.onPresetSelect} disabled={opts?.disabled} />;
    case 'style_selector': return <StyleSelector key={key} options={gui.data.options} />;
    case 'platform_selector': return <PlatformSelector key={key} options={gui.data.options} />;
    case 'aspect_ratio_selector': return <AspectRatioSelector key={key} options={gui.data.options} selected={gui.data.selected} {...opts} />;
    case 'duration_selector': return <DurationSelector key={key} options={gui.data.options} selected={gui.data.selected} {...opts} />;
    case 'resolution_selector': return <ResolutionSelector key={key} options={gui.data.options} selected={gui.data.selected} {...opts} />;
    case 'fps_selector': return <FpsSelector key={key} options={gui.data.options} selected={gui.data.selected} {...opts} />;
    case 'video_brief_form': return <VideoBriefForm key={key} data={gui.data} />;
    case 'scene_suggestion': return <SceneSuggestionCards key={key} scenes={gui.data} />;
    case 'hook_suggestions': return <HookSuggestions key={key} hooks={gui.data.hooks} />;
    case 'director_review': return <DirectorReviewPanel key={key} review={gui.data} />;
    case 'chat_suggestions': return <ChatSuggestions key={key} suggestions={gui.data.suggestions} onSelect={opts?.onPresetSelect} disabled={opts?.disabled} />;
    case 'script_card': return <ScriptCard key={key} script={gui.data} onApprove={opts?.onPresetSelect} disabled={opts?.disabled} />;
    case 'influencer_card': return <InfluencerCard key={key} asset={gui.data} onApprove={opts?.onPresetSelect} disabled={opts?.disabled} />;
    case 'background_card': return <BackgroundCard key={key} asset={gui.data} onApprove={opts?.onPresetSelect} disabled={opts?.disabled} />;
    case 'frames_card': return <FramesCard key={key} scenes={gui.data.scenes} onApprove={opts?.onPresetSelect} disabled={opts?.disabled} />;
    default: return null;
  }
}

function CreativeWorkflowPlanCard({
  plan,
  onApprove,
  disabled,
}: {
  plan: CreativeWorkflowPlan;
  onApprove?: (message: string) => void;
  disabled?: boolean;
}) {
  const { getCurrentProject, updateCurrentProject, setPhase } = useProjectStore();
  const { buildFromStoryboard } = useWorkflowStore();
  const videoMode = plan.videoMode ?? 'general';
  const consistencyReferences = plan.consistencyReferences ?? [];

  const openWorkflow = async () => {
    const project = getCurrentProject();
    await updateCurrentProject({
      creativePlan: plan,
      storyboard: {
        id: `sb-${Date.now()}`,
        scenes: plan.scenes,
        totalDuration: plan.scenes[plan.scenes.length - 1]?.endTime || 0,
        narrativeArc: plan.storyStructure.join(' → '),
        notes: plan.summary,
      },
      usageEvents: [
        ...(project?.usageEvents ?? []),
        {
          id: `usage-plan-${Date.now()}`,
          projectId: project?.id ?? '',
          model: 'planner',
          generationType: 'planning',
          action: `Created ${videoMode} plan with ${plan.scenes.length} scenes`,
          tokens: 0,
          credits: 0,
          status: 'completed',
          createdAt: new Date().toISOString(),
        },
      ],
    });
    buildFromStoryboard(plan.scenes);
    setPhase('workflow');
  };

  const approvePlan = () => {
    onApprove?.('I approve this plan. Generate the required source-of-truth assets step by step.');
  };

  const hasGeneratedAssets = plan.approvalStatus === 'assets_generated' || plan.reusableAssets.some((asset) => asset.generatedImageUrl);

  return (
    <Card className="border-primary/20 bg-card/80">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <LucideIcons.Workflow className="w-4 h-4 text-primary" />
            Creative Workflow Plan
            <Badge variant="secondary" className="h-5 text-[10px] capitalize">{videoMode.replace(/_/g, ' ')}</Badge>
          </span>
          {hasGeneratedAssets ? (
            <Button size="sm" className="h-7 text-xs" onClick={openWorkflow}>
              Use Generated Assets in Workflow →
            </Button>
          ) : (
            <Button size="sm" className="h-7 text-xs" onClick={approvePlan} disabled={disabled || !onApprove}>
              Approve Plan & Generate Assets
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 text-xs">
          <PlanLine label="About" value={plan.summary} />
          <PlanLine label="Viewer" value={plan.targetViewer} />
          <PlanLine label="Tone" value={plan.toneAndStyle} />
        </div>

        {plan.reusableAssets.length > 0 && (
          <div className="space-y-2">
            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Reusable assets first</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {plan.reusableAssets.map((asset) => (
                <ReusableAssetCard key={asset.id} asset={asset} />
              ))}
            </div>
          </div>
        )}

        {consistencyReferences.length > 0 && (
          <div className="space-y-2">
            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Consistency system</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {consistencyReferences.map((ref) => (
                <ConsistencyReferenceCard key={ref.id} reference={ref} />
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            {hasGeneratedAssets ? 'Generated start/end frames' : 'Planned start/end frames'}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {plan.scenes.map((scene) => (
              <div key={scene.id} className="rounded-lg border border-border/50 bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-semibold line-clamp-1">{scene.title}</span>
                  <Badge variant="outline" className="text-[10px] h-4 px-1.5">{scene.duration}s</Badge>
                </div>
                <p className="text-[11px] text-muted-foreground line-clamp-2">{scene.sceneGoal || scene.prompt}</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <FramePreview
                    label="Start"
                    url={scene.startFrameUrl ?? scene.generatedStartFrameUrl}
                    status={scene.frameGenerationStatus}
                    model={scene.frameGenerationModel}
                    error={scene.frameGenerationError}
                    scene={scene}
                  />
                  <FramePreview
                    label="End"
                    url={scene.endFrameUrl ?? scene.generatedEndFrameUrl}
                    status={scene.frameGenerationStatus}
                    model={scene.frameGenerationModel}
                    error={scene.frameGenerationError}
                    scene={scene}
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge variant="outline" className="text-[10px] h-4 px-1.5">{scene.cameraMovement.replace(/_/g, ' ')}</Badge>
                  {scene.assetsUsed?.slice(0, 2).map((assetId) => (
                    <Badge key={assetId} variant="secondary" className="text-[10px] h-4 px-1.5">{assetId.replace('asset-', '').replace(/-/g, ' ')}</Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
          <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Parameter confirmation</div>
          <p className="text-[11px] text-muted-foreground">
            Suggested aspect ratio: {plan.suggestedAspectRatio ?? '9:16'}. Suggested duration: {plan.suggestedDuration ?? plan.scenes.reduce((sum, scene) => sum + scene.duration, 0)}s. Output format: {plan.outputFormat ?? 'mp4'}. Confirm these, the scene count, style, main subject, assets, negative prompts, and manual preferences before video generation.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function FramePreview({
  label,
  url,
  status,
  model,
  error,
  scene,
}: {
  label: string;
  url?: string;
  status?: string;
  model?: string;
  error?: string;
  scene: Scene;
}) {
  const { currentProjectId } = useProjectStore();

  const saveFrame = async () => {
    if (!currentProjectId || !url) return;
    await storage.saveAsset({
      id: `frame-${scene.id}-${label.toLowerCase()}-${Date.now()}`,
      projectId: currentProjectId,
      sceneId: scene.id,
      name: `${scene.title} ${label} Frame`,
      type: 'reference',
      url,
      thumbnailUrl: url,
      mimeType: 'image/png',
      size: url.length,
      createdAt: new Date().toISOString(),
      metadata: {
        consistencyReference: true,
        frameType: label.toLowerCase(),
        prompt: label === 'Start' ? scene.startFramePrompt : scene.endFramePrompt,
        model,
      },
    });
  };

  return (
    <div className="overflow-hidden rounded-md border border-border/50 bg-background/30">
      <div className="relative aspect-[9/16]">
        {url ? (
          <img src={url} alt={`${label} frame`} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted/30 px-2 text-center text-[10px] text-muted-foreground">
            {status === 'failed' ? `Qwen image failed${error ? `: ${error.slice(0, 80)}` : ''}` : 'Pending Qwen image generation'}
          </div>
        )}
        <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px] text-white">{label}</span>
        {model && (
          <span className="absolute bottom-1 left-1 right-1 truncate rounded bg-black/60 px-1.5 py-0.5 text-[8px] text-white">
            {model}
          </span>
        )}
        {url && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="absolute right-1 top-1 rounded bg-black/60 p-1 text-white" aria-label={`${label} frame actions`}>
                <LucideIcons.MoreHorizontal className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={saveFrame}>Save to Asset Library</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}

function ConsistencyReferenceCard({ reference }: { reference: ConsistencyReference }) {
  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold line-clamp-1">{reference.name}</div>
          <div className="text-[10px] text-muted-foreground capitalize">{reference.type.replace(/_/g, ' ')}</div>
        </div>
        <Badge variant={reference.reusePolicy === 'always' ? 'default' : 'outline'} className="h-5 text-[10px]">
          {reference.reusePolicy.replace(/_/g, ' ')}
        </Badge>
      </div>
      {reference.imageUrl && (
        <div className="mt-2 overflow-hidden rounded-md border border-border/50">
          <img src={reference.imageUrl} alt={reference.name} className="aspect-video w-full object-cover" />
        </div>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground line-clamp-2">{reference.consistencyNotes}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {reference.criticalFor.map((mode) => (
          <Badge key={mode} variant="secondary" className="h-4 px-1.5 text-[9px] capitalize">{mode}</Badge>
        ))}
      </div>
    </div>
  );
}

function PlanLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
      <p className="mt-0.5 text-xs leading-relaxed">{value}</p>
    </div>
  );
}

function ReusableAssetCard({ asset }: { asset: ReusableAssetPlan }) {
  const { currentProjectId, getCurrentProject, updateCurrentProject } = useProjectStore();

  const saveToProjectAssets = async () => {
    if (!currentProjectId || !asset.generatedImageUrl) return;
    await storage.saveAsset({
      id: `${asset.id}-${Date.now()}`,
      projectId: currentProjectId,
      name: asset.name,
      type: 'reference',
      url: asset.generatedImageUrl,
      thumbnailUrl: asset.generatedImageUrl,
      mimeType: 'image/png',
      size: asset.generatedImageUrl.length,
      createdAt: new Date().toISOString(),
      metadata: {
        consistencyReference: true,
        reusableAssetId: asset.id,
        assetType: asset.type,
        prompt: asset.referenceImagePrompt,
        negativePrompt: asset.negativePrompt,
        consistencyNotes: asset.consistencyNotes,
      },
    });
    const project = getCurrentProject();
    if (project?.creativePlan) {
      await updateCurrentProject({
        creativePlan: {
          ...project.creativePlan,
          consistencyReferences: project.creativePlan.consistencyReferences.map((ref) =>
            ref.id === `ref-${asset.id}` ? { ...ref, savedToLibrary: true, imageUrl: asset.generatedImageUrl } : ref,
          ),
        },
        usageEvents: [
          ...(project.usageEvents ?? []),
          {
            id: `usage-save-${asset.id}-${Date.now()}`,
            projectId: currentProjectId,
            assetId: asset.id,
            model: asset.generationModel || 'asset-library',
            generationType: 'asset_save',
            action: `Saved ${asset.name} to project assets`,
            assetType: asset.type,
            credits: 0,
            status: 'completed',
            createdAt: new Date().toISOString(),
          },
        ],
      });
    }
  };

  const saveToBrandIdentity = () => {
    if (typeof window === 'undefined' || !asset.generatedImageUrl) return;
    const raw = window.localStorage.getItem(BRAND_KIT_STORAGE_KEY);
    const kits = raw ? JSON.parse(raw) : [];
    const existing = kits.find((kit: { name: string }) => kit.name === 'Generated Brand Identity');
    const nextUrlList = Array.from(new Set([...(existing?.productImageUrls ?? []), asset.generatedImageUrl]));
    const kit = {
      id: existing?.id ?? `brand-generated-${Date.now()}`,
      name: 'Generated Brand Identity',
      brandName: existing?.brandName ?? 'Generated Brand Identity',
      colors: existing?.colors ?? [],
      logoUrls: existing?.logoUrls ?? [],
      fonts: existing?.fonts ?? [],
      toneOfVoice: existing?.toneOfVoice ?? 'Warm, polished, creator-led',
      productImageUrls: nextUrlList,
      targetAudience: existing?.targetAudience ?? '',
      ctaStyle: existing?.ctaStyle ?? '',
      visualIdentity: `${existing?.visualIdentity ?? ''}\n${asset.name}: ${asset.description}`.trim(),
      brandRules: `${existing?.brandRules ?? ''}\n${asset.consistencyNotes}`.trim(),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const updated = existing
      ? kits.map((item: { id: string }) => item.id === kit.id ? kit : item)
      : [...kits, kit];
    window.localStorage.setItem(BRAND_KIT_STORAGE_KEY, JSON.stringify(updated));
  };

  const logPlaceholder = (label: string) => () => {
    console.info(`[OpenScene] ${label}: ${asset.name}`);
  };

  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
      {asset.generatedImageUrl ? (
        <div className="mb-2 overflow-hidden rounded-md border border-border/50 bg-background/30">
          <img src={asset.generatedImageUrl} alt={asset.name} className="aspect-[9/16] w-full object-cover" />
        </div>
      ) : (
        <div className="mb-2 flex aspect-[9/16] items-center justify-center rounded-md border border-border/50 bg-muted/30 px-3 text-center text-[11px] text-muted-foreground">
          {asset.generationStatus === 'failed'
            ? `Qwen image failed${asset.generationError ? `: ${asset.generationError.slice(0, 90)}` : ''}`
            : 'Pending Qwen image generation'}
        </div>
      )}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold line-clamp-1">{asset.name}</div>
          <div className="text-[10px] text-muted-foreground capitalize">{asset.type.replace(/_/g, ' ')}</div>
          {asset.generationModel && (
            <div className="text-[9px] text-muted-foreground">{asset.generationModel}</div>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="p-1 rounded hover:bg-muted shrink-0" aria-label="Asset actions">
              <LucideIcons.MoreHorizontal className="w-3.5 h-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={saveToBrandIdentity} disabled={!asset.generatedImageUrl}>Save to Brand Identity</DropdownMenuItem>
            <DropdownMenuItem onClick={saveToProjectAssets} disabled={!asset.generatedImageUrl}>Save to Project Assets</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logPlaceholder('Rename')}>Rename</DropdownMenuItem>
            <DropdownMenuItem onClick={logPlaceholder('Edit with AI')}>Edit with AI</DropdownMenuItem>
            <DropdownMenuItem onClick={logPlaceholder('Regenerate')}>Regenerate</DropdownMenuItem>
            <DropdownMenuItem onClick={logPlaceholder('Duplicate')}>Duplicate</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logPlaceholder('Delete')} className="text-red-400">Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <p className="text-[11px] text-muted-foreground line-clamp-2 mb-2">{asset.description}</p>
      <div className="rounded-md bg-background/40 border border-border/40 p-2">
        <div className="text-[10px] text-muted-foreground mb-1">Reference prompt</div>
        <p className="text-[10px] leading-relaxed line-clamp-3">{asset.referenceImagePrompt}</p>
      </div>
    </div>
  );
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

function AspectRatioSelector({
  options,
  selected,
  onPresetSelect,
  disabled,
}: {
  options: AspectRatio[];
  selected?: AspectRatio;
  onPresetSelect?: (message: string) => void;
  disabled?: boolean;
}) {
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

  const handleSelect = async (ratio: AspectRatio) => {
    if (!project || disabled) return;
    const p = previews[ratio];
    const pixels = pixelsFromResolutionLabel(
      resolutionLabelFromPixels(project.settings.resolution) ?? '1080p',
      ratio
    );
    const brief = buildVideoBriefPatch(project, { aspectRatio: ratio, resolution: pixels });
    await updateCurrentProject({
      settings: { ...project.settings, aspectRatio: ratio, resolution: pixels },
      videoBrief: brief,
    });
    onPresetSelect?.(`${ratio} (${p.label}) aspect ratio`);
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
              type="button"
              disabled={disabled}
              onClick={() => handleSelect(ratio)}
              className={`flex flex-col items-center gap-1.5 p-2.5 rounded-lg border text-xs transition-all ${
                isActive
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border hover:border-primary/40'
              } ${disabled ? 'opacity-60 cursor-default' : 'cursor-pointer'}`}
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

function DurationSelector({
  options,
  selected,
  onPresetSelect,
  disabled,
}: {
  options: { id: string; label: string; seconds: number }[];
  selected?: string;
  onPresetSelect?: (message: string) => void;
  disabled?: boolean;
}) {
  const { updateCurrentProject, getCurrentProject } = useProjectStore();
  const project = getCurrentProject();
  const activeId = selected || (project?.videoBrief?.duration ? `d-${project.videoBrief.duration}` : undefined);

  const handleSelect = async (opt: { id: string; label: string; seconds: number }) => {
    if (!project || disabled) return;
    const brief = buildVideoBriefPatch(project, { duration: opt.seconds });
    await updateCurrentProject({ videoBrief: brief });
    onPresetSelect?.(`${opt.label} — ${opt.seconds} seconds`);
  };

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-muted-foreground">⏱️ Length</div>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const isActive = activeId === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              disabled={disabled}
              onClick={() => handleSelect(opt)}
              className={`px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                isActive ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/40'
              } ${disabled ? 'opacity-60 cursor-default' : 'cursor-pointer'}`}
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

function ResolutionSelector({
  options,
  selected,
  onPresetSelect,
  disabled,
}: {
  options: string[];
  selected?: string;
  onPresetSelect?: (message: string) => void;
  disabled?: boolean;
}) {
  const { updateCurrentProject, getCurrentProject } = useProjectStore();
  const project = getCurrentProject();
  const current = selected || resolutionLabelFromPixels(project?.settings.resolution);

  const handleSelect = async (label: string) => {
    if (!project || disabled) return;
    const pixels = pixelsFromResolutionLabel(label, project.settings.aspectRatio);
    const brief = buildVideoBriefPatch(project, { resolution: pixels });
    await updateCurrentProject({
      settings: { ...project.settings, resolution: pixels },
      videoBrief: brief,
    });
    onPresetSelect?.(`${label} resolution`);
  };

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-muted-foreground">🖥️ Resolution</div>
      <div className="flex flex-wrap gap-2">
        {options.map((res) => {
          const isActive = current === res;
          return (
            <button
              key={res}
              type="button"
              disabled={disabled}
              onClick={() => handleSelect(res)}
              className={`px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                isActive ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/40'
              } ${disabled ? 'opacity-60 cursor-default' : 'cursor-pointer'}`}
            >
              {res}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FpsSelector({
  options,
  selected,
  onPresetSelect,
  disabled,
}: {
  options: number[];
  selected?: number;
  onPresetSelect?: (message: string) => void;
  disabled?: boolean;
}) {
  const { updateCurrentProject, getCurrentProject } = useProjectStore();
  const project = getCurrentProject();
  const current = selected ?? project?.settings.fps;

  const handleSelect = async (fps: number) => {
    if (!project || disabled) return;
    const brief = buildVideoBriefPatch(project, { fps });
    await updateCurrentProject({
      settings: { ...project.settings, fps },
      videoBrief: brief,
    });
    onPresetSelect?.(`${fps} fps`);
  };

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-muted-foreground">🎞️ Frame Rate</div>
      <div className="flex flex-wrap gap-2">
        {options.map((fps) => {
          const isActive = current === fps;
          return (
            <button
              key={fps}
              type="button"
              disabled={disabled}
              onClick={() => handleSelect(fps)}
              className={`px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                isActive ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/40'
              } ${disabled ? 'opacity-60 cursor-default' : 'cursor-pointer'}`}
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
      referenceImageUrls: s.referenceImageUrls || [],
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
    setPhase('workflow');
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-muted-foreground">🎬 Suggested Scenes ({scenes.length})</div>
        <Button size="sm" onClick={handleAccept} className="h-7 text-xs gap-1">
          Accept All & Open Workflow →
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

function ChatSuggestions({
  suggestions,
  onSelect,
  disabled,
}: {
  suggestions: string[];
  onSelect?: (message: string) => void;
  disabled?: boolean;
}) {
  if (!suggestions.length) return null;

  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {suggestions.map((suggestion) => (
        <button
          key={suggestion}
          type="button"
          disabled={disabled || !onSelect}
          onClick={() => onSelect?.(suggestion)}
          className="rounded-full border border-border/70 bg-background/80 px-3 py-1.5 text-left text-xs text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:cursor-default disabled:opacity-50"
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}

const PRODUCTION_STEPS = ['script', 'influencer', 'background', 'frames', 'workflow'] as const;
const STEP_LABELS: Record<typeof PRODUCTION_STEPS[number], string> = {
  script: 'Script',
  influencer: 'Influencer',
  background: 'Background',
  frames: 'Frames',
  workflow: 'Workflow',
};

export function ProductionProgressRail({ current }: { current: typeof PRODUCTION_STEPS[number] }) {
  const idx = PRODUCTION_STEPS.indexOf(current);
  return (
    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
      {PRODUCTION_STEPS.map((step, i) => {
        const done = i < idx;
        const active = i === idx;
        return (
          <div key={step} className="flex items-center gap-1">
            {i > 0 && <div className={`w-3 h-px ${done ? 'bg-primary' : 'bg-border'}`} />}
            <div
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full border ${
                active ? 'border-primary text-primary bg-primary/10' : done ? 'border-primary/30 text-primary/80' : 'border-border text-muted-foreground'
              }`}
            >
              <span>{done ? '✓' : active ? '●' : '○'}</span>
              <span>{STEP_LABELS[step]}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ScriptCard({
  script,
  onApprove,
  disabled,
}: {
  script: VideoScript;
  onApprove?: (message: string) => void;
  disabled?: boolean;
}) {
  const { updateCurrentProject } = useProjectStore();
  const [openScenes, setOpenScenes] = useState<Set<number>>(new Set([0]));
  const [draft, setDraft] = useState<VideoScript>(script);

  const toggleScene = (idx: number) => {
    setOpenScenes((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const updateScene = (idx: number, patch: Partial<typeof script.scenes[number]>) => {
    setDraft((prev) => ({
      ...prev,
      scenes: prev.scenes.map((sc, i) => (i === idx ? { ...sc, ...patch } : sc)),
    }));
  };

  const updateBeat = (sceneIdx: number, beatIdx: number, patch: Partial<typeof script.scenes[number]['beats'][number]>) => {
    setDraft((prev) => ({
      ...prev,
      scenes: prev.scenes.map((sc, i) =>
        i === sceneIdx
          ? { ...sc, beats: sc.beats.map((b, j) => (j === beatIdx ? { ...b, ...patch } : b)) }
          : sc,
      ),
    }));
  };

  const approve = async () => {
    await updateCurrentProject({ videoScript: { ...draft, approvalStatus: 'approved' }, productionStep: 'influencer' });
    onApprove?.('Approve the script and generate the influencer next.');
  };

  return (
    <Card className="border-primary/20 bg-card/80">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <LucideIcons.FileText className="w-4 h-4 text-primary" />
            Shooting Script
            <Badge variant="secondary" className="h-5 text-[10px]">{draft.sceneCount} scenes · {draft.durationSeconds}s</Badge>
          </span>
          <Button size="sm" className="h-7 text-xs" onClick={approve} disabled={disabled || !onApprove}>
            Approve Script →
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-1.5">
          <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Logline</div>
          <input
            className="w-full bg-transparent text-xs leading-relaxed focus:outline-none"
            value={draft.logline}
            onChange={(e) => setDraft({ ...draft, logline: e.target.value })}
          />
          <div className="text-[10px] text-muted-foreground italic">{draft.narrationStyle}</div>
        </div>

        {draft.scenes.map((scene, idx) => {
          const isOpen = openScenes.has(idx);
          return (
            <div key={scene.id} className="rounded-lg border border-border/50 bg-muted/20 overflow-hidden">
              <button
                type="button"
                onClick={() => toggleScene(idx)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/30"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant="outline" className="text-[10px] h-4 px-1.5">{idx + 1}</Badge>
                  <span className="text-xs font-semibold truncate">{scene.title}</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground shrink-0">
                  <span>{scene.durationSeconds}s</span>
                  <LucideIcons.ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </div>
              </button>
              {isOpen && (
                <div className="px-3 pb-3 space-y-2 border-t border-border/40 pt-2">
                  <div className="grid gap-2">
                    <FieldLine label="Goal" value={scene.goal} onChange={(v) => updateScene(idx, { goal: v })} />
                    <FieldLine label="Narration" value={scene.narration} onChange={(v) => updateScene(idx, { narration: v })} />
                    <FieldLine label="Camera" value={scene.cameraBehavior} onChange={(v) => updateScene(idx, { cameraBehavior: v })} />
                    <FieldLine label="Mood" value={scene.mood} onChange={(v) => updateScene(idx, { mood: v })} />
                    <FieldLine label="Visual notes" value={scene.visualNotes} onChange={(v) => updateScene(idx, { visualNotes: v })} />
                  </div>
                  <div className="rounded-md border border-border/40 bg-background/40 overflow-hidden">
                    <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2 py-1 border-b border-border/40">
                      Beats · {scene.beats.length}s
                    </div>
                    <div className="max-h-[180px] overflow-y-auto">
                      {scene.beats.map((beat, bIdx) => (
                        <div key={bIdx} className="grid grid-cols-[28px_1fr] gap-2 px-2 py-1.5 text-[11px] border-b border-border/30 last:border-b-0">
                          <div className="text-muted-foreground font-mono">{beat.second + 1}s</div>
                          <div className="space-y-1">
                            <input
                              className="w-full bg-transparent focus:outline-none text-foreground"
                              value={beat.action}
                              onChange={(e) => updateBeat(idx, bIdx, { action: e.target.value })}
                              placeholder="action"
                            />
                            <div className="flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
                              {beat.dialogue && <span className="italic">“{beat.dialogue}”</span>}
                              {beat.behavior && <span>· {beat.behavior}</span>}
                              {beat.camera && <span>· cam: {beat.camera}</span>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function FieldLine({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-[80px_1fr] gap-2 items-start">
      <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider pt-1">{label}</div>
      <textarea
        className="w-full bg-background/40 border border-border/40 rounded-md px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary resize-none min-h-[28px]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function InfluencerCard({
  asset,
  onApprove,
  disabled,
}: {
  asset: ReusableAssetPlan;
  onApprove?: (message: string) => void;
  disabled?: boolean;
}) {
  const { updateCurrentProject, getCurrentProject } = useProjectStore();
  const [regenerating, setRegenerating] = useState(false);

  const persistAsset = async (next: ReusableAssetPlan) => {
    const project = getCurrentProject();
    if (!project?.creativePlan) return;
    const updatedPlan: CreativeWorkflowPlan = {
      ...project.creativePlan,
      reusableAssets: project.creativePlan.reusableAssets.map((a) => (a.id === next.id ? next : a)),
      approvalStatus: 'approved',
    };
    await updateCurrentProject({ creativePlan: updatedPlan, productionStep: 'background' });
  };

  const regenerate = async () => {
    setRegenerating(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Regenerate the influencer identity with a different look.' }],
          project: getCurrentProject(),
        }),
      });
      const data = await res.json();
      const newAsset = data?.generativeUI?.[0]?.data as ReusableAssetPlan | undefined;
      if (newAsset) await persistAsset(newAsset);
    } finally {
      setRegenerating(false);
    }
  };

  const approve = async () => {
    await persistAsset(asset);
    onApprove?.('Approve the influencer and generate the background next.');
  };

  return (
    <AssetStepCard
      asset={asset}
      title="Influencer Identity"
      hint="One stable face, hairstyle, and outfit. We'll reuse this in every scene to keep continuity."
      approveLabel="Approve Influencer →"
      onApprove={approve}
      onRegenerate={regenerate}
      regenerating={regenerating}
      disabled={disabled}
    />
  );
}

function BackgroundCard({
  asset,
  onApprove,
  disabled,
}: {
  asset: ReusableAssetPlan;
  onApprove?: (message: string) => void;
  disabled?: boolean;
}) {
  const { updateCurrentProject, getCurrentProject } = useProjectStore();

  const persistAsset = async (next: ReusableAssetPlan) => {
    const project = getCurrentProject();
    if (!project?.creativePlan) return;
    const updatedPlan: CreativeWorkflowPlan = {
      ...project.creativePlan,
      reusableAssets: project.creativePlan.reusableAssets.map((a) => (a.id === next.id ? next : a)),
      approvalStatus: 'approved',
    };
    await updateCurrentProject({ creativePlan: updatedPlan, productionStep: 'frames' });
  };

  const approve = async () => {
    await persistAsset(asset);
    onApprove?.('Approve the background and generate the start and end frames for every scene.');
  };

  return (
    <AssetStepCard
      asset={asset}
      title="Scene Background"
      hint="The environment, lighting, and palette we'll keep consistent across scenes."
      approveLabel="Approve Background →"
      onApprove={approve}
      disabled={disabled}
    />
  );
}

function AssetStepCard({
  asset,
  title,
  hint,
  approveLabel,
  onApprove,
  onRegenerate,
  regenerating,
  disabled,
}: {
  asset: ReusableAssetPlan;
  title: string;
  hint: string;
  approveLabel: string;
  onApprove: () => void;
  onRegenerate?: () => void;
  regenerating?: boolean;
  disabled?: boolean;
}) {
  return (
    <Card className="border-primary/20 bg-card/80">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <LucideIcons.Image className="w-4 h-4 text-primary" />
            {title}
            <Badge variant="secondary" className="h-5 text-[10px] capitalize">{asset.type.replace(/_/g, ' ')}</Badge>
          </span>
          <Button size="sm" className="h-7 text-xs" onClick={onApprove} disabled={disabled || !asset.generatedImageUrl}>
            {approveLabel}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-[11px] text-muted-foreground">{hint}</p>
        <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-3">
          <div className="overflow-hidden rounded-lg border border-border/50 bg-background/30">
            <div className="relative aspect-[9/16]">
              {asset.generatedImageUrl ? (
                <img src={asset.generatedImageUrl} alt={asset.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-muted/30 px-3 text-center text-[11px] text-muted-foreground">
                  {asset.generationStatus === 'failed'
                    ? `Image generation failed${asset.generationError ? `: ${asset.generationError.slice(0, 90)}` : ''}`
                    : 'Pending image generation'}
                </div>
              )}
              {asset.generationModel && (
                <span className="absolute bottom-1 left-1 right-1 truncate rounded bg-black/60 px-1.5 py-0.5 text-[8px] text-white">
                  {asset.generationModel}
                </span>
              )}
            </div>
            {onRegenerate && (
              <button
                type="button"
                onClick={onRegenerate}
                disabled={regenerating || disabled}
                className="w-full px-2 py-1.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/40 border-t border-border/40 disabled:opacity-50"
              >
                {regenerating ? 'Regenerating…' : 'Regenerate'}
              </button>
            )}
          </div>
          <div className="space-y-2">
            <div>
              <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Identity</div>
              <div className="text-xs font-semibold">{asset.name}</div>
              <p className="text-[11px] text-muted-foreground line-clamp-3 mt-0.5">{asset.description}</p>
            </div>
            <div>
              <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Consistency rules</div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">{asset.consistencyNotes}</p>
            </div>
            <div className="rounded-md bg-background/40 border border-border/40 p-2">
              <div className="text-[10px] text-muted-foreground mb-1">Reference prompt</div>
              <p className="text-[10px] leading-relaxed line-clamp-4">{asset.referenceImagePrompt}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FramesCard({
  scenes,
  onApprove,
  disabled,
}: {
  scenes: Scene[];
  onApprove?: (message: string) => void;
  disabled?: boolean;
}) {
  const { updateCurrentProject, getCurrentProject } = useProjectStore();
  const [busy, setBusy] = useState<string | null>(null);

  const persistScenes = async (next: Scene[]) => {
    const project = getCurrentProject();
    if (!project?.creativePlan) return;
    const updatedPlan: CreativeWorkflowPlan = {
      ...project.creativePlan,
      scenes: next,
      approvalStatus: 'assets_generated',
    };
    await updateCurrentProject({ creativePlan: updatedPlan, productionStep: 'workflow' });
  };

  const regenerateScene = async (sceneId: string) => {
    setBusy(sceneId);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: `Regenerate the start and end frames for ${sceneId}.` }],
          project: getCurrentProject(),
        }),
      });
      const data = await res.json();
      const card = data?.generativeUI?.[0];
      if (card?.type === 'frames_card' && Array.isArray(card.data.scenes)) {
        const next = scenes.map((s) => {
          const updated = (card.data.scenes as Scene[]).find((x) => x.id === s.id);
          return updated ?? s;
        });
        await persistScenes(next);
      }
    } finally {
      setBusy(null);
    }
  };

  const approveAll = async () => {
    await persistScenes(scenes);
    onApprove?.('Approve all frames and open Workflow with everything seeded.');
  };

  return (
    <Card className="border-primary/20 bg-card/80">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <LucideIcons.Film className="w-4 h-4 text-primary" />
            Start / End Frames
            <Badge variant="secondary" className="h-5 text-[10px]">{scenes.length} scenes</Badge>
          </span>
          <Button size="sm" className="h-7 text-xs" onClick={approveAll} disabled={disabled}>
            Approve All Frames → Open Workflow
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {scenes.map((scene) => {
          const isBusy = busy === scene.id;
          return (
            <div key={scene.id} className="rounded-lg border border-border/50 bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <div className="text-xs font-semibold line-clamp-1">{scene.title}</div>
                  <div className="text-[10px] text-muted-foreground">{scene.duration}s · {scene.cameraMovement.replace(/_/g, ' ')}</div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-[10px]"
                  onClick={() => regenerateScene(scene.id)}
                  disabled={isBusy || disabled}
                >
                  {isBusy ? 'Regenerating…' : 'Regenerate'}
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <FramePreview
                  label="Start"
                  url={scene.startFrameUrl ?? scene.generatedStartFrameUrl}
                  status={scene.frameGenerationStatus}
                  model={scene.frameGenerationModel}
                  error={scene.frameGenerationError}
                  scene={scene}
                />
                <FramePreview
                  label="End"
                  url={scene.endFrameUrl ?? scene.generatedEndFrameUrl}
                  status={scene.frameGenerationStatus}
                  model={scene.frameGenerationModel}
                  error={scene.frameGenerationError}
                  scene={scene}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function HookSuggestions({ hooks }: { hooks: string[] }) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-muted-foreground">🎣 Hook Ideas</div>
      <div className="space-y-2">
        {hooks.map((hook, index) => (
          <div
            key={`${hook}-${index}`}
            className="flex items-start gap-3 p-3 rounded-lg border border-border/50 bg-muted/20 hover:border-primary/30 transition-colors cursor-pointer group"
          >
            <div className="flex-1">
              <p className="text-sm">&ldquo;{hook}&rdquo;</p>
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
