'use client';

import { useCallback, useState } from 'react';
import type { Node as FlowNode } from '@xyflow/react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useWorkflowStore } from '@/features/workflow/store';
import { sceneIdFromNodeId, nodeLabel } from '../../graph/workflow-node-utils';
import { AI_ACTIONS } from '../../lib/ai-actions';
import { useProjectStore } from '@/features/project/store';
import { storage } from '@/services/storage/indexeddb';
import type { ReusableAssetPlan, Scene } from '@/core/types';

type ContextMenuState = {
  x: number;
  y: number;
  node: FlowNode;
} | null;

const BRAND_KIT_STORAGE_KEY = 'openscene-brandkits';
const COLOR_PRESETS = [
  { name: 'Cyan', value: '#22d3ee' },
  { name: 'Emerald', value: '#22c55e' },
  { name: 'Amber', value: '#eab308' },
  { name: 'Violet', value: '#a78bfa' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Rose', value: '#f43f5e' },
  { name: 'Slate', value: '#94a3b8' },
  { name: 'White', value: '#f4f4f5' },
] as const;

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

export function useWorkflowNodeContextMenu() {
  const [menu, setMenu] = useState<ContextMenuState>(null);
  const [confirmDelete, setConfirmDelete] = useState<ContextMenuState>(null);
  const sceneOrder = useWorkflowStore((s) => s.sceneOrder);
  const sceneMap = useWorkflowStore((s) => s.sceneMap);
  const removeWorkflowNode = useWorkflowStore((s) => s.removeWorkflowNode);
  const generateScene = useWorkflowStore((s) => s.generateScene);
  const retrySceneGeneration = useWorkflowStore((s) => s.retrySceneGeneration);
  const updateScene = useWorkflowStore((s) => s.updateScene);
  const duplicateScene = useWorkflowStore((s) => s.duplicateScene);
  const nodeColorStyles = useWorkflowStore((s) => s.nodeColorStyles);
  const setNodeColorStyle = useWorkflowStore((s) => s.setNodeColorStyle);
  const resetNodeColorStyle = useWorkflowStore((s) => s.resetNodeColorStyle);
  const currentProjectId = useProjectStore((s) => s.currentProjectId);

  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: FlowNode) => {
    event.preventDefault();
    setMenu({ x: event.clientX, y: event.clientY, node });
  }, []);

  const closeMenu = () => setMenu(null);

  const requestDelete = () => {
    if (!menu) return;
    setConfirmDelete(menu);
    setMenu(null);
  };

  const runAndClose = (action: () => void | Promise<void>) => {
    void action();
    setMenu(null);
  };

  const saveAssetToProjectAssets = async (asset: ReusableAssetPlan) => {
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

  const saveAssetToBrandIdentity = (asset: ReusableAssetPlan) => {
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

  const applyAIAction = (scene: Scene, actionPrompt: string) => {
    const enhanced = `${scene.prompt}, ${actionPrompt === 'cinematic' ? 'dramatic cinematic lighting, shallow depth of field, film grain' : actionPrompt === 'realistic' ? 'photorealistic, natural lighting, 4K quality' : actionPrompt === 'viral' ? 'high energy, dynamic, attention-grabbing' : actionPrompt === 'camera' ? 'smooth professional camera work' : 'enhanced visual quality, more detailed'}`;
    updateScene(scene.id, { prompt: enhanced });
  };

  const openNoteEditor = (nodeId: string) => {
    window.dispatchEvent(new CustomEvent('workflow:open-note-editor', { detail: { id: nodeId } }));
  };

  const confirmDeleteNode = () => {
    if (!confirmDelete) return;
    removeWorkflowNode(confirmDelete.node.id);
    setConfirmDelete(null);
  };

  const sceneId = confirmDelete ? sceneIdFromNodeId(confirmDelete.node.id, sceneOrder) : null;
  const sceneTitle = sceneId ? sceneMap[sceneId]?.title : null;
  const deleteTarget = confirmDelete ? nodeLabel(confirmDelete.node.type) : 'node';
  const activeStyle = menu ? nodeColorStyles[menu.node.id] ?? {} : {};
  const activeSceneId = menu ? sceneIdFromNodeId(menu.node.id, sceneOrder) : null;
  const activeScene = activeSceneId ? sceneMap[activeSceneId] : null;
  const activeAsset = menu?.node.type === 'asset' ? menu.node.data as unknown as ReusableAssetPlan : null;
  const activeOutputUrl = activeScene?.generatedVideoUrl ?? activeScene?.generatedStartFrameUrl;
  const activeColor = activeStyle.border ?? activeStyle.line;

  const menuUi = menu ? (
    <div
      className="fixed z-[100] w-[230px] rounded-lg border border-border bg-popover shadow-xl py-1 text-sm animate-in fade-in-0 zoom-in-95"
      style={{ left: menu.x, top: menu.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {nodeLabel(menu.node.type)} actions
      </div>
      {menu.node.type === 'asset' && activeAsset && (
        <>
          <MenuItem disabled={!activeAsset.generatedImageUrl} onClick={() => runAndClose(() => saveAssetToBrandIdentity(activeAsset))}>Save to Brand Identity</MenuItem>
          <MenuItem disabled={!activeAsset.generatedImageUrl} onClick={() => runAndClose(() => saveAssetToProjectAssets(activeAsset))}>Save to Project Assets</MenuItem>
          <Separator />
          {['Rename', 'Edit with AI', 'Regenerate', 'Duplicate'].map((label) => (
            <MenuItem key={label} onClick={() => runAndClose(() => console.info(`[OpenScene] ${label}: ${activeAsset.name}`))}>{label}</MenuItem>
          ))}
        </>
      )}
      {menu.node.type === 'scene' && activeScene && (
        <>
          <MenuItem onClick={() => runAndClose(() => generateScene(activeScene.id))}>Generate</MenuItem>
          <Separator />
          {AI_ACTIONS.map((action) => (
            <MenuItem key={action.label} onClick={() => runAndClose(() => applyAIAction(activeScene, action.prompt))}>
              {action.label}
            </MenuItem>
          ))}
          <Separator />
          <MenuItem onClick={() => runAndClose(() => updateScene(activeScene.id, { status: 'idle' }))}>Reset</MenuItem>
          <MenuItem onClick={() => runAndClose(() => duplicateScene(activeScene.id))}>Duplicate</MenuItem>
        </>
      )}
      {menu.node.type === 'output' && activeScene && (
        <>
          {activeOutputUrl && <MenuItem onClick={() => runAndClose(() => (window as any).__openOutputView?.(activeScene.id))}>View Output</MenuItem>}
          {activeOutputUrl && (
            <MenuItem onClick={() => runAndClose(() => downloadAsset(activeOutputUrl, `${activeScene.title.replace(/\s+/g, '-').toLowerCase()}-output.${activeScene.generatedVideoUrl ? 'mp4' : 'png'}`))}>
              Download Output
            </MenuItem>
          )}
          <MenuItem onClick={() => runAndClose(() => retrySceneGeneration(activeScene.id))}>Regenerate</MenuItem>
        </>
      )}
      {['parameters', 'script', 'frames'].includes(String(menu.node.type)) && activeScene && (
        <>
          <MenuItem onClick={() => runAndClose(() => console.info(`[OpenScene] Open ${nodeLabel(menu.node.type)}: ${activeScene.title}`))}>
            Open {nodeLabel(menu.node.type)}
          </MenuItem>
          <MenuItem onClick={() => runAndClose(() => duplicateScene(activeScene.id))}>Duplicate Scene</MenuItem>
        </>
      )}
      {menu.node.type === 'note' && (
        <>
          <MenuItem onClick={() => runAndClose(() => openNoteEditor(menu.node.id))}>Edit</MenuItem>
        </>
      )}
      <Separator />
      <div className="px-3 py-2 space-y-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Color</div>
        <ColorSwatches
          selected={activeColor}
          onPick={(color) => setNodeColorStyle(menu.node.id, { border: color, line: color })}
        />
        <label className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          Custom
          <input
            type="color"
            value={activeColor ?? '#22d3ee'}
            onChange={(e) => setNodeColorStyle(menu.node.id, { border: e.target.value, line: e.target.value })}
            className="h-6 w-9 cursor-pointer rounded border border-border bg-transparent"
          />
        </label>
        <button
          type="button"
          className="w-full rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
          onClick={() => resetNodeColorStyle(menu.node.id)}
        >
          Reset colors
        </button>
      </div>
      <Separator />
      <button
        type="button"
        className="w-full px-3 py-1.5 text-left text-red-400 hover:bg-muted transition-colors"
        onClick={requestDelete}
      >
        Delete…
      </button>
    </div>
  ) : null;

  const confirmUi = (
    <AlertDialog open={Boolean(confirmDelete)} onOpenChange={(o) => !o && setConfirmDelete(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {deleteTarget}?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the <strong>{deleteTarget}</strong> node
            {sceneTitle ? <> from <strong>{sceneTitle}</strong></> : null}.
            Other nodes in this scene will stay on the canvas.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={confirmDeleteNode}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return {
    onNodeContextMenu,
    closeMenu,
    menuUi,
    confirmUi,
    backdrop: menu ? (
      <div className="fixed inset-0 z-[99]" onClick={closeMenu} onContextMenu={closeMenu} />
    ) : null,
  };
}

function Separator() {
  return <div className="my-1 border-t border-border" />;
}

function MenuItem({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className="w-full px-3 py-1.5 text-left hover:bg-muted transition-colors disabled:pointer-events-none disabled:opacity-45"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function ColorSwatches({ selected, onPick }: { selected?: string; onPick: (color: string) => void }) {
  return (
    <div className="grid grid-cols-8 gap-1">
      {COLOR_PRESETS.map((color) => (
        <button
          key={color.value}
          type="button"
          title={color.name}
          aria-label={color.name}
          className="h-5 rounded border border-border ring-offset-background"
          style={{
            backgroundColor: color.value,
            outline: selected === color.value ? '2px solid hsl(var(--foreground))' : undefined,
          }}
          onClick={() => onPick(color.value)}
        />
      ))}
    </div>
  );
}
