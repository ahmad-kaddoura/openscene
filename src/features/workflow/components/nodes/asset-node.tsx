'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Box, MoreHorizontal } from 'lucide-react';
import { useProjectStore } from '@/features/project/store';
import { storage } from '@/services/storage/indexeddb';
import type { ReusableAssetPlan } from '@/core/types';

const BRAND_KIT_STORAGE_KEY = 'videoforge-brandkits';
type WorkflowStyle = { border?: string; line?: string };

function AssetNodeComponent({ data }: NodeProps) {
  const asset = data as unknown as ReusableAssetPlan;
  const workflowStyle = (data as unknown as { workflowStyle?: WorkflowStyle }).workflowStyle;
  const currentProjectId = useProjectStore((s) => s.currentProjectId);

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
  };

  const saveToBrandIdentity = () => {
    if (typeof window === 'undefined' || !asset.generatedImageUrl) return;
    const raw = window.localStorage.getItem(BRAND_KIT_STORAGE_KEY);
    const kits = raw ? JSON.parse(raw) : [];
    const existing = kits.find((kit: { name: string }) => kit.name === 'Generated Brand Identity');
    const productImageUrls = Array.from(new Set([...(existing?.productImageUrls ?? []), asset.generatedImageUrl]));
    const kit = {
      id: existing?.id ?? `brand-generated-${Date.now()}`,
      name: 'Generated Brand Identity',
      brandName: existing?.brandName ?? 'Generated Brand Identity',
      colors: existing?.colors ?? [],
      logoUrls: existing?.logoUrls ?? [],
      fonts: existing?.fonts ?? [],
      toneOfVoice: existing?.toneOfVoice ?? 'Warm, polished, creator-led',
      productImageUrls,
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

  const action = (label: string) => () => {
    console.info(`[VideoForge] ${label}: ${asset.name}`);
  };

  return (
    <div className="relative">
      <div
        className="w-[230px] rounded-xl border border-cyan-500/40 bg-card shadow-lg overflow-hidden"
        style={workflowStyle?.border ? { borderColor: workflowStyle.border } : undefined}
      >
        <div className="px-2.5 py-1.5 border-b border-border bg-cyan-500/10 flex items-center justify-between gap-2">
          <span className="text-[9px] uppercase tracking-wider text-cyan-300 font-semibold flex items-center gap-1">
            <Box className="w-3 h-3" />
            {asset.type.replace(/_/g, ' ')}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="p-0.5 rounded hover:bg-muted" aria-label="Asset actions">
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={saveToBrandIdentity} disabled={!asset.generatedImageUrl}>Save to Brand Identity</DropdownMenuItem>
              <DropdownMenuItem onClick={saveToProjectAssets} disabled={!asset.generatedImageUrl}>Save to Project Assets</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={action('Rename')}>Rename</DropdownMenuItem>
              <DropdownMenuItem onClick={action('Edit with AI')}>Edit with AI</DropdownMenuItem>
              <DropdownMenuItem onClick={action('Regenerate')}>Regenerate</DropdownMenuItem>
              <DropdownMenuItem onClick={action('Duplicate')}>Duplicate</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={action('Delete')} className="text-red-400">Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="p-3 space-y-2">
          {asset.generatedImageUrl ? (
            <div className="rounded-md border border-border/50 bg-background/30">
              <img src={asset.generatedImageUrl} alt={asset.name} className="block w-full h-auto" />
            </div>
          ) : (
            <div className="flex min-h-[120px] items-center justify-center rounded-md border border-border/50 bg-muted/30 px-3 text-center text-[10px] text-muted-foreground">
              {asset.generationStatus === 'failed'
                ? `Qwen image failed${asset.generationError ? `: ${asset.generationError.slice(0, 80)}` : ''}`
                : 'Pending Qwen image generation'}
            </div>
          )}
          <div>
            <h3 className="text-xs font-semibold leading-tight">{asset.name}</h3>
            <p className="mt-1 text-[10px] text-muted-foreground line-clamp-2">{asset.description}</p>
            {asset.generationModel && (
              <p className="mt-1 text-[9px] text-muted-foreground">{asset.generationModel}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            {asset.saveTargets.map((target) => (
              <Badge key={target} variant="outline" className="text-[9px] h-4 px-1.5">
                {target.replace(/_/g, ' ')}
              </Badge>
            ))}
          </div>
          <div className="rounded-md bg-background/40 border border-border/40 p-2">
            <div className="text-[9px] text-muted-foreground mb-0.5">Reference prompt</div>
            <p className="text-[9px] leading-relaxed line-clamp-3">{asset.referenceImagePrompt}</p>
          </div>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="asset-out"
        className="!w-3 !h-3 !bg-cyan-400 !border-2 !border-background"
      />
    </div>
  );
}

export const AssetNode = memo(AssetNodeComponent);
