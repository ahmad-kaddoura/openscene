'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { useWorkflowStore } from './store';
import {
  ADD_NODE_OPTIONS,
  addNodeValue,
  parseAddNodeValue,
} from './workflow-node-catalog';

type PaneMenuState = {
  x: number;
  y: number;
  flowPosition: { x: number; y: number };
} | null;

export function useWorkflowPaneMenu() {
  const [menu, setMenu] = useState<PaneMenuState>(null);
  const addNodeAt = useWorkflowStore((s) => s.addNodeAt);

  const closeMenu = useCallback(() => setMenu(null), []);

  const openMenu = useCallback((x: number, y: number, flowPosition: { x: number; y: number }) => {
    setMenu({ x, y, flowPosition });
  }, []);

  useEffect(() => {
    if (!menu) return;
    const t = setTimeout(() => {
      document.querySelector<HTMLInputElement>('[data-slot="pane-node-search"]')?.focus();
    }, 0);
    return () => clearTimeout(t);
  }, [menu]);

  const selectNode = (value: string) => {
    if (!menu) return;
    const { kind, sceneId } = parseAddNodeValue(value);
    addNodeAt(kind, menu.flowPosition, sceneId);
    closeMenu();
  };

  const menuUi = menu ? (
    <div
      className="fixed z-[100] w-[280px] rounded-lg border border-border bg-popover shadow-xl overflow-hidden animate-in fade-in-0 zoom-in-95"
      style={{ left: menu.x, top: menu.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Command shouldFilter>
        <CommandInput placeholder="Search nodes…" className="h-9" data-slot="pane-node-search" />
        <CommandList className="max-h-[320px]">
          <CommandEmpty>No nodes found.</CommandEmpty>
          <CommandGroup heading="Add node">
            {ADD_NODE_OPTIONS.map((opt) => (
              <CommandItem
                key={opt.kind}
                value={[opt.label, opt.description, ...opt.keywords].join(' ')}
                onSelect={() => selectNode(addNodeValue(opt.kind))}
                className="gap-2.5 cursor-pointer"
              >
                <opt.icon className={`w-4 h-4 shrink-0 ${opt.color}`} />
                <div className="min-w-0">
                  <div className="text-sm font-medium">{opt.label}</div>
                  <div className="text-[11px] text-muted-foreground line-clamp-1">{opt.description}</div>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  ) : null;

  return {
    openMenu,
    closeMenu,
    menuUi,
    backdrop: menu ? (
      <div className="fixed inset-0 z-[99]" onClick={closeMenu} onContextMenu={closeMenu} />
    ) : null,
  };
}
