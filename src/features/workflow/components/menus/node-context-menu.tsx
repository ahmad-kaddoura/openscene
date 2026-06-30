'use client';

import { useCallback, useState } from 'react';
import type { Node as FlowNode } from '@xyflow/react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useWorkflowStore } from './store';
import { sceneIdFromNodeId, nodeLabel } from './workflow-node-utils';

type ContextMenuState = {
  x: number;
  y: number;
  node: FlowNode;
} | null;

export function useWorkflowNodeContextMenu() {
  const [menu, setMenu] = useState<ContextMenuState>(null);
  const [confirmDelete, setConfirmDelete] = useState<ContextMenuState>(null);
  const sceneOrder = useWorkflowStore((s) => s.sceneOrder);
  const sceneMap = useWorkflowStore((s) => s.sceneMap);
  const removeWorkflowNode = useWorkflowStore((s) => s.removeWorkflowNode);

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

  const confirmDeleteNode = () => {
    if (!confirmDelete) return;
    removeWorkflowNode(confirmDelete.node.id);
    setConfirmDelete(null);
  };

  const sceneId = confirmDelete ? sceneIdFromNodeId(confirmDelete.node.id, sceneOrder) : null;
  const sceneTitle = sceneId ? sceneMap[sceneId]?.title : null;
  const deleteTarget = confirmDelete ? nodeLabel(confirmDelete.node.type) : 'node';

  const menuUi = menu ? (
    <div
      className="fixed z-[100] min-w-[140px] rounded-lg border border-border bg-popover shadow-xl py-1 text-sm animate-in fade-in-0 zoom-in-95"
      style={{ left: menu.x, top: menu.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
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
