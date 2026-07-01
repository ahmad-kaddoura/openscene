'use client';

import { useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose,
} from '@/components/ui/dialog';
import { Plus, Trash2, Edit, Package, SwatchBook } from 'lucide-react';
import type { BrandKit } from '@/core/types';
import { nanoid } from 'nanoid';

// Local state for brand kits (in production, use IndexedDB)
const STORAGE_KEY = 'openscene-brandkits';

function getBrandKits(): BrandKit[] {
  if (typeof window === 'undefined') return [];
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : [];
}

function saveBrandKits(kits: BrandKit[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(kits));
}

export function BrandKitView() {
  const [kits, setKits] = useState<BrandKit[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');

  useState(() => {
    setKits(getBrandKits());
  });

  const selectedKit = kits.find(k => k.id === selectedId);

  const handleCreate = () => {
    if (!newName.trim()) return;
    const kit: BrandKit = {
      id: nanoid(),
      name: newName.trim(),
      brandName: newName.trim(),
      colors: [],
      logoUrls: [],
      fonts: [],
      toneOfVoice: '',
      productImageUrls: [],
      targetAudience: '',
      ctaStyle: '',
      visualIdentity: '',
      brandRules: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const updated = [...kits, kit];
    setKits(updated);
    saveBrandKits(updated);
    setSelectedId(kit.id);
    setNewName('');
    setDialogOpen(false);
  };

  const handleDelete = (id: string) => {
    const updated = kits.filter(k => k.id !== id);
    setKits(updated);
    saveBrandKits(updated);
    if (selectedId === id) setSelectedId(null);
  };

  const handleUpdate = (updates: Partial<BrandKit>) => {
    if (!selectedId) return;
    const updated = kits.map(k =>
      k.id === selectedId ? { ...k, ...updates, updatedAt: new Date().toISOString() } : k
    );
    setKits(updated);
    saveBrandKits(updated);
  };

  return (
    <div className="h-full flex">
      {/* Kit List */}
      <div className="w-[260px] border-r border-border flex flex-col">
        <div className="p-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold">Brand Kits</h3>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7"><Plus className="w-4 h-4" /></Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New Brand Kit</DialogTitle></DialogHeader>
              <Input placeholder="Brand kit name..." value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCreate()} autoFocus />
              <DialogFooter>
                <DialogClose asChild><Button variant="ghost" size="sm">Cancel</Button></DialogClose>
                <Button size="sm" onClick={handleCreate} disabled={!newName.trim()}>Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {kits.length === 0 && (
              <div className="text-center py-8 text-xs text-muted-foreground">
                <SwatchBook className="w-8 h-8 mx-auto mb-2 opacity-30" />
                No brand kits yet
              </div>
            )}
            {kits.map(kit => (
              <button
                key={kit.id}
                onClick={() => setSelectedId(kit.id)}
                className={`w-full text-left p-2.5 rounded-lg transition-colors ${
                  selectedId === kit.id ? 'bg-primary/10 border border-primary/20' : 'hover:bg-muted border border-transparent'
                }`}
              >
                <div className="text-xs font-medium">{kit.name}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {kit.colors.length} colors · {kit.fonts.length} fonts
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Kit Editor */}
      <div className="flex-1 overflow-y-auto">
        {selectedKit ? (
          <div className="max-w-2xl mx-auto p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">{selectedKit.name}</h2>
                <p className="text-xs text-muted-foreground">Configure your brand identity</p>
              </div>
              <Button variant="outline" size="sm" className="text-red-400 hover:text-red-300 gap-1.5" onClick={() => handleDelete(selectedKit.id)}>
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </Button>
            </div>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Brand Identity</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs">Brand Name</Label>
                    <Input className="mt-1" value={selectedKit.brandName} onChange={e => handleUpdate({ brandName: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Tone of Voice</Label>
                    <Input className="mt-1" value={selectedKit.toneOfVoice} onChange={e => handleUpdate({ toneOfVoice: e.target.value })} placeholder="Professional, friendly..." />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Target Audience</Label>
                  <Input className="mt-1" value={selectedKit.targetAudience} onChange={e => handleUpdate({ targetAudience: e.target.value })} placeholder="Gen Z professionals..." />
                </div>
                <div>
                  <Label className="text-xs">Visual Identity</Label>
                  <Textarea className="mt-1" value={selectedKit.visualIdentity} onChange={e => handleUpdate({ visualIdentity: e.target.value })} rows={2} placeholder="Describe the visual style..." />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Colors</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {selectedKit.colors.map((color, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 bg-muted rounded-lg px-2 py-1.5">
                      <div className="w-4 h-4 rounded-full border border-border" style={{ backgroundColor: color }} />
                      <span className="text-[10px] font-mono">{color}</span>
                      <button onClick={() => handleUpdate({ colors: selectedKit.colors.filter((_, i) => i !== idx) })} className="text-muted-foreground hover:text-foreground ml-0.5">×</button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 mt-2">
                  <Input placeholder="#FF5733 or rgb(...)" className="h-8 text-xs" id="color-input" />
                  <Button size="sm" variant="outline" className="shrink-0 h-8" onClick={() => {
                    const input = document.getElementById('color-input') as HTMLInputElement;
                    if (input?.value) {
                      handleUpdate({ colors: [...selectedKit.colors, input.value] });
                      input.value = '';
                    }
                  }}>Add</Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Fonts</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {selectedKit.fonts.map((font, idx) => (
                    <Badge key={idx} variant="secondary" className="text-xs gap-1">
                      {font}
                      <button onClick={() => handleUpdate({ fonts: selectedKit.fonts.filter((_, i) => i !== idx) })} className="ml-0.5">×</button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2 mt-2">
                  <Input placeholder="Font name..." className="h-8 text-xs" id="font-input" />
                  <Button size="sm" variant="outline" className="shrink-0 h-8" onClick={() => {
                    const input = document.getElementById('font-input') as HTMLInputElement;
                    if (input?.value) {
                      handleUpdate({ fonts: [...selectedKit.fonts, input.value] });
                      input.value = '';
                    }
                  }}>Add</Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">CTA & Rules</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-xs">CTA Style</Label>
                  <Input className="mt-1" value={selectedKit.ctaStyle} onChange={e => handleUpdate({ ctaStyle: e.target.value })} placeholder="Shop Now →, Learn More..." />
                </div>
                <div>
                  <Label className="text-xs">Brand Rules</Label>
                  <Textarea className="mt-1" value={selectedKit.brandRules} onChange={e => handleUpdate({ brandRules: e.target.value })} rows={3} placeholder="Any specific brand guidelines..." />
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-muted-foreground">
              <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Select a brand kit or create a new one</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}