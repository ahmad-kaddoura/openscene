'use client';

import { useMemo, useState } from 'react';
import { Copy, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useSettingsStore } from '@/features/settings/store';
import type { AspectRatio, ExportPreset, OutputFormat, TargetPlatform } from '@/core/types';

type PresetFormState = {
  id?: string;
  name: string;
  platform: TargetPlatform;
  aspectRatio: AspectRatio;
  resolution: string;
  fps: string;
  maxDuration: string;
  format: OutputFormat;
  quality: ExportPreset['quality'];
};

const PLATFORM_OPTIONS: { value: TargetPlatform; label: string }[] = [
  { value: 'tiktok', label: 'TikTok' },
  { value: 'instagram_reels', label: 'Instagram Reels' },
  { value: 'youtube_shorts', label: 'YouTube Shorts' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'instagram_feed', label: 'Instagram Feed' },
  { value: 'instagram_story', label: 'Instagram Story' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'twitter', label: 'X / Twitter' },
  { value: 'website', label: 'Website' },
  { value: 'custom', label: 'Custom' },
];

const ASPECT_OPTIONS: AspectRatio[] = ['9:16', '16:9', '1:1', '4:5', 'custom'];
const FORMAT_OPTIONS: OutputFormat[] = ['mp4', 'webm', 'mov'];
const QUALITY_OPTIONS: ExportPreset['quality'][] = ['low', 'medium', 'high', 'ultra'];

const EMPTY_FORM: PresetFormState = {
  name: '',
  platform: 'custom',
  aspectRatio: '9:16',
  resolution: '1080x1920',
  fps: '30',
  maxDuration: '60',
  format: 'mp4',
  quality: 'high',
};

function formFromPreset(preset: ExportPreset): PresetFormState {
  return {
    id: preset.id,
    name: preset.name,
    platform: preset.platform,
    aspectRatio: preset.aspectRatio,
    resolution: preset.resolution,
    fps: String(preset.fps),
    maxDuration: String(preset.maxDuration),
    format: preset.format,
    quality: preset.quality,
  };
}

function makePresetId(name: string, existingIds: string[]) {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'export_preset';
  let candidate = base;
  let count = 2;

  while (existingIds.includes(candidate)) {
    candidate = `${base}_${count}`;
    count += 1;
  }

  return candidate;
}

export function ExportTab() {
  const exportPresets = useSettingsStore((s) => s.settings.exportPresets);
  const addExportPreset = useSettingsStore((s) => s.addExportPreset);
  const removeExportPreset = useSettingsStore((s) => s.removeExportPreset);
  const updateExportPreset = useSettingsStore((s) => s.updateExportPreset);
  const resetExportPresets = useSettingsStore((s) => s.resetExportPresets);
  const [form, setForm] = useState<PresetFormState>(EMPTY_FORM);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [presetToDelete, setPresetToDelete] = useState<ExportPreset | null>(null);
  const [resetOpen, setResetOpen] = useState(false);

  const isEditing = Boolean(form.id);
  const canSave = useMemo(() => {
    return (
      form.name.trim().length > 0 &&
      form.resolution.trim().length > 0 &&
      Number(form.fps) > 0 &&
      Number(form.maxDuration) > 0
    );
  }, [form]);

  const openNewPreset = () => {
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEditPreset = (preset: ExportPreset) => {
    setForm(formFromPreset(preset));
    setDialogOpen(true);
  };

  const duplicatePreset = (preset: ExportPreset) => {
    const existingIds = exportPresets.map((item) => item.id);
    addExportPreset({
      ...preset,
      id: makePresetId(`${preset.name} copy`, existingIds),
      name: `${preset.name} Copy`,
    });
  };

  const savePreset = () => {
    if (!canSave) return;

    const preset: ExportPreset = {
      id: form.id ?? makePresetId(form.name, exportPresets.map((item) => item.id)),
      name: form.name.trim(),
      platform: form.platform,
      aspectRatio: form.aspectRatio,
      resolution: form.resolution.trim(),
      fps: Number(form.fps),
      maxDuration: Number(form.maxDuration),
      format: form.format,
      quality: form.quality,
    };

    if (isEditing) {
      updateExportPreset(preset.id, preset);
    } else {
      addExportPreset(preset);
    }

    setDialogOpen(false);
  };

  const updateForm = <K extends keyof PresetFormState>(key: K, value: PresetFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Manage export presets for different platforms and use cases.</p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setResetOpen(true)}>
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </Button>
          <Button size="sm" className="gap-1.5" onClick={openNewPreset}>
            <Plus className="h-3.5 w-3.5" />
            New Preset
          </Button>
        </div>
      </div>

      <div className="grid gap-3">
        {exportPresets.map((preset) => (
          <Card key={preset.id} className="border-border/50">
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{preset.name}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{PLATFORM_OPTIONS.find((option) => option.value === preset.platform)?.label ?? preset.platform}</span>
                    <span>{preset.aspectRatio}</span>
                    <span>{preset.resolution}</span>
                    <span>{preset.fps}fps</span>
                    <span>max {preset.maxDuration}s</span>
                    <span className="uppercase">{preset.format}</span>
                    <Badge variant="outline" className="text-[10px]">{preset.quality}</Badge>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="icon" aria-label={`Edit ${preset.name}`} onClick={() => openEditPreset(preset)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label={`Duplicate ${preset.name}`} onClick={() => duplicatePreset(preset)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label={`Delete ${preset.name}`} onClick={() => setPresetToDelete(preset)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Edit Export Preset' : 'New Export Preset'}</DialogTitle>
            <DialogDescription>Preset changes are used anywhere the app offers export settings.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-1 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="preset-name">Name</Label>
              <Input id="preset-name" value={form.name} onChange={(event) => updateForm('name', event.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Platform</Label>
              <Select value={form.platform} onValueChange={(value: TargetPlatform) => updateForm('platform', value)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PLATFORM_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Aspect Ratio</Label>
              <Select value={form.aspectRatio} onValueChange={(value: AspectRatio) => updateForm('aspectRatio', value)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ASPECT_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>{option}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="preset-resolution">Resolution</Label>
              <Input id="preset-resolution" value={form.resolution} onChange={(event) => updateForm('resolution', event.target.value)} placeholder="1080x1920" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="preset-fps">FPS</Label>
              <Input id="preset-fps" type="number" min={1} value={form.fps} onChange={(event) => updateForm('fps', event.target.value)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="preset-duration">Max Duration</Label>
              <Input id="preset-duration" type="number" min={1} value={form.maxDuration} onChange={(event) => updateForm('maxDuration', event.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Format</Label>
              <Select value={form.format} onValueChange={(value: OutputFormat) => updateForm('format', value)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FORMAT_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>{option.toUpperCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Quality</Label>
              <Select value={form.quality} onValueChange={(value: ExportPreset['quality']) => updateForm('quality', value)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {QUALITY_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>{option}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={savePreset} disabled={!canSave}>{isEditing ? 'Save Changes' : 'Create Preset'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(presetToDelete)} onOpenChange={(open) => !open && setPresetToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Export Preset</AlertDialogTitle>
            <AlertDialogDescription>
              This removes {presetToDelete?.name ?? 'this preset'} from export settings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (presetToDelete) removeExportPreset(presetToDelete.id);
                setPresetToDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Export Presets</AlertDialogTitle>
            <AlertDialogDescription>
              This replaces your current export presets with the default OpenScene presets.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                resetExportPresets();
                setResetOpen(false);
              }}
            >
              Reset Presets
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
