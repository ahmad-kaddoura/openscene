'use client';

import { useProjectStore } from '@/features/project/store';
import { useSettingsStore } from '@/features/settings/store';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose,
} from '@/components/ui/dialog';
import { Plus, Search, Film, Settings, Palette, FolderOpen, Trash2, MoreHorizontal, Clapperboard, Pencil } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useState } from 'react';
import { PROJECT_PHASES } from './phase-config';
import { formatDistanceToNow } from 'date-fns';

type AppView = 'project' | 'settings' | 'brandkit' | 'assets';

interface AppSidebarProps {
  collapsed: boolean;
  onNavigate: (view: AppView) => void;
  activeView: AppView;
}

const PHASE_LABELS: Record<string, string> = {
  chat: 'Plan', brief: 'Brief', storyboard: 'Storyboard',
  workflow: 'Workflow', generation: 'Generating', timeline: 'Timeline', export: 'Export',
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-yellow-500', in_progress: 'bg-blue-500', review: 'bg-orange-500',
  completed: 'bg-emerald-500', archived: 'bg-muted-foreground',
};

export function AppSidebar({ collapsed, onNavigate, activeView }: AppSidebarProps) {
  const { projects, currentProjectId, createProject, openProject, deleteProject, updateProject, isLoading } = useProjectStore();
  const [search, setSearch] = useState('');
  const [newName, setNewName] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState('');

  const filtered = projects.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await createProject(newName.trim());
    setNewName('');
    setDialogOpen(false);
  };

  const handleDelete = async (id: string) => {
    await deleteProject(id);
  };

  const openRenameDialog = (id: string, currentName: string) => {
    setRenamingProjectId(id);
    setRenameName(currentName);
    setRenameDialogOpen(true);
  };

  const handleRename = async () => {
    if (!renamingProjectId || !renameName.trim()) return;
    await updateProject(renamingProjectId, { name: renameName.trim() });
    setRenameDialogOpen(false);
    setRenamingProjectId(null);
    setRenameName('');
  };

  return (
    <div className="h-full flex flex-col bg-card border-r border-border">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-3 border-b border-border min-h-[52px]">
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center mx-auto">
                <Clapperboard className="w-4 h-4 text-primary-foreground" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="right">VideoForge</TooltipContent>
          </Tooltip>
        ) : (
          <>
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
              <Clapperboard className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-sm tracking-tight">VideoForge</span>
          </>
        )}
      </div>

      {/* New Project */}
      {!collapsed && (
        <div className="px-3 py-2">
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="w-full gap-2" size="sm">
                <Plus className="w-4 h-4" />
                New Project
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Project</DialogTitle>
              </DialogHeader>
              <Input
                placeholder="Project name..."
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                autoFocus
              />
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="ghost" size="sm">Cancel</Button>
                </DialogClose>
                <Button size="sm" onClick={handleCreate} disabled={!newName.trim()}>Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {/* Search */}
      {!collapsed && (
        <div className="px-3 pb-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search projects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
        </div>
      )}

      {/* Project List */}
      <ScrollArea className="flex-1">
        {collapsed ? (
          <div className="flex flex-col items-center py-2 gap-1">
            {filtered.map((project) => (
              <Tooltip key={project.id}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => openProject(project.id)}
                    className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors ${
                      currentProjectId === project.id
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-muted text-muted-foreground'
                    }`}
                  >
                    <Film className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">{project.name}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        ) : (
          <div className="px-3 py-1">
            {filtered.length === 0 && !isLoading && (
              <div className="text-center py-8 text-xs text-muted-foreground">
                {search ? 'No matching projects' : 'No projects yet'}
              </div>
            )}
            {filtered.map((project) => (
              <div key={project.id}>
                <div
                  onClick={() => { openProject(project.id); onNavigate('project'); }}
                  className={`group relative flex items-center gap-2.5 px-2.5 py-2 pr-8 rounded-lg cursor-pointer transition-all ${
                    currentProjectId === project.id
                      ? 'bg-primary/10 border border-primary/20'
                      : 'hover:bg-muted/50 border border-transparent'
                  }`}
                >
                  <div className="relative shrink-0">
                    <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[project.status] || 'bg-muted-foreground'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{project.name}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal">
                        {PHASE_LABELS[project.currentPhase] || project.currentPhase}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground truncate">
                        {formatDistanceToNow(new Date(project.updatedAt), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        onClick={(e) => e.stopPropagation()}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted transition-opacity"
                      >
                        <MoreHorizontal className="w-3.5 h-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem
                        onClick={(e) => { e.stopPropagation(); openRenameDialog(project.id, project.name); }}
                      >
                        <Pencil className="w-3.5 h-3.5 mr-2" />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => { e.stopPropagation(); handleDelete(project.id); }}
                        className="text-red-400 focus:text-red-400"
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Bottom Nav */}
      <Separator />
      <div className={`px-3 py-2 flex ${collapsed ? 'flex-col items-center gap-1' : 'flex-col gap-0.5'}`}>
        {[
          { id: 'brandkit' as AppView, icon: Palette, label: 'Brand Kits' },
          { id: 'assets' as AppView, icon: FolderOpen, label: 'Assets' },
          { id: 'settings' as AppView, icon: Settings, label: 'Settings' },
        ].map((item) => (
          <Tooltip key={item.id}>
            <TooltipTrigger asChild>
              <button
                onClick={() => onNavigate(item.id)}
                className={`flex items-center rounded-lg transition-colors ${
                  collapsed
                    ? 'w-8 h-8 justify-center'
                    : 'w-full gap-2.5 px-2.5 py-2'
                } ${
                  activeView === item.id
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                {!collapsed && (
                  <span className="text-xs font-medium truncate">{item.label}</span>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side={collapsed ? 'right' : 'top'}>{item.label}</TooltipContent>
          </Tooltip>
        ))}
      </div>

      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Project</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Project name..."
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRename()}
            autoFocus
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" size="sm">Cancel</Button>
            </DialogClose>
            <Button size="sm" onClick={handleRename} disabled={!renameName.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}