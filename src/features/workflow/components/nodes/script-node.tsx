'use client';

import { memo, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Pencil, FileText } from 'lucide-react';
import { useWorkflowStore } from './store';
import { useScenePromptTemplate, buildScenePrompt } from './prompt-template';
import type { Scene } from '@/core/types';

const SECTIONS = [
  { key: 'sceneDescription', label: 'Scene' },
  { key: 'actionDescription', label: 'Action' },
  { key: 'visualStyle', label: 'Visual style' },
  { key: 'lighting', label: 'Lighting' },
  { key: 'details', label: 'Details' },
  { key: 'avoid', label: 'Avoid' },
] as const;

function ScriptNodeComponent({ data }: NodeProps) {
  const sceneId = (data as { sceneId: string }).sceneId;
  const scene = useWorkflowStore((s) => s.sceneMap[sceneId]);
  const updateScene = useWorkflowStore((s) => s.updateScene);
  const template = useScenePromptTemplate();
  const [editOpen, setEditOpen] = useState(false);
  const [sections, setSections] = useState<Record<string, string>>({});

  if (!scene) return null;

  const hasContent = SECTIONS.some(({ key }) => Boolean((scene as any)[key]));

  const openEdit = () => {
    setSections({
      sceneDescription: scene.sceneDescription ?? '',
      actionDescription: scene.actionDescription ?? '',
      visualStyle: scene.visualStyle ?? '',
      lighting: scene.lighting ?? '',
      details: scene.details ?? '',
      avoid: scene.avoid ?? '',
    });
    setEditOpen(true);
  };

  const save = () => {
    updateScene(sceneId, {
      sceneDescription: sections.sceneDescription,
      actionDescription: sections.actionDescription,
      visualStyle: sections.visualStyle,
      lighting: sections.lighting,
      details: sections.details,
      avoid: sections.avoid,
    });
    setEditOpen(false);
  };

  return (
    <>
      <div className="relative">
        <Handle
          type="source"
          position={Position.Right}
          id="script-out"
          className="!w-3 !h-3 !bg-violet-500 !border-2 !border-background"
        />

        <div className="w-[220px] rounded-xl border border-border bg-card shadow-lg overflow-hidden">
          <div className="px-2.5 py-1.5 border-b border-border bg-muted/30 flex items-center justify-between">
            <span className="text-[9px] uppercase tracking-wider text-violet-400 font-semibold flex items-center gap-1">
              <FileText className="w-3 h-3" /> Script
            </span>
            <button onClick={openEdit} className="p-0.5 rounded hover:bg-muted">
              <Pencil className="w-3 h-3 text-muted-foreground" />
            </button>
          </div>

          <div
            onClick={openEdit}
            className="p-2.5 text-[10px] leading-relaxed max-h-[220px] overflow-y-auto cursor-pointer hover:bg-muted/20 font-mono"
          >
            {hasContent ? (
              SECTIONS.map(({ key, label }) => {
                const value = (scene as any)[key];
                if (!value) return null;
                return (
                  <div key={key} className="mb-1.5 last:mb-0">
                    <span className="text-violet-400 font-semibold">{label}:</span>{' '}
                    <span className="text-foreground/80">{value}</span>
                  </div>
                );
              })
            ) : (
              <span className="text-muted-foreground/50 italic">
                Click to write script…
              </span>
            )}
          </div>
        </div>
      </div>

      {editOpen && (
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-sm">Edit script — {scene.title}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 max-h-[55vh] overflow-y-auto">
              {SECTIONS.map(({ key, label }) => (
                <div key={key}>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
                  <Textarea
                    value={sections[key] ?? ''}
                    onChange={(e) => setSections((s) => ({ ...s, [key]: e.target.value }))}
                    className="mt-1 text-xs min-h-[48px] resize-none"
                    placeholder={label === 'Avoid' ? 'blurry faces, text, logos…' : ''}
                  />
                </div>
              ))}
              <div className="pt-2 border-t">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Preview</Label>
                <pre className="mt-1 text-[10px] text-muted-foreground bg-muted/20 rounded-md p-2 whitespace-pre-wrap font-mono max-h-[100px] overflow-y-auto">
                  {buildScenePrompt({ ...scene, ...sections } as Scene, template)}
                </pre>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button onClick={save}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

export const ScriptNode = memo(ScriptNodeComponent);
