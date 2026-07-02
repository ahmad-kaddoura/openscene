'use client';

import { useCallback, useMemo, useEffect, useState, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Connection,
  type NodeTypes,
  type ReactFlowInstance,
  type Node as FlowNode,
  type OnNodeDrag,
  type IsValidConnection,
  BackgroundVariant,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useWorkflowStore } from '@/features/workflow/store';
import { useProjectStore } from '@/features/project/store';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { OutputPreviewDialog } from './output-preview-dialog';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Play, Loader2, AlignHorizontalSpaceAround, ChevronDown, Download, FileCode2, FileJson, Plus } from 'lucide-react';
import { SceneNode } from './nodes/scene-node';
import { OutputNode } from './nodes/output-node';
import { ParametersNode } from './nodes/params-node';
import { ScriptNode } from './nodes/script-node';
import { FramesNode } from './nodes/frames-node';
import { AssetNode } from './nodes/asset-node';
import { NoteNode } from './nodes/note-node';
import { ImageInputNode } from './nodes/image-input-node';
import { VideoInputNode } from './nodes/video-input-node';
import { PromptInputNode } from './nodes/prompt-input-node';
import { MotionControlNode } from './nodes/motion-control-node';
import { MotionOutputNode } from './nodes/motion-output-node';
import { buildWorkflowGraph } from '../graph/workflow-graph';
import { ADD_NODE_OPTIONS, type WorkflowNodeKind } from '../graph/workflow-node-catalog';
import { resolveNodeContext } from '../graph/workflow-node-utils';
import { useWorkflowNodeContextMenu } from './menus/node-context-menu';
import { useWorkflowPaneMenu } from './menus/pane-menu';
import { useSettingsStore } from '@/features/settings/store';
import { useToast } from '@/hooks/use-toast';

type FlowPoint = { x: number; y: number };

function eventClientPoint(event: MouseEvent | TouchEvent): FlowPoint {
  if ('clientX' in event) return { x: event.clientX, y: event.clientY };
  const touch = event.changedTouches[0] ?? event.touches[0];
  return { x: touch.clientX, y: touch.clientY };
}

function motionIdFromNodeId(nodeId: string) {
  return nodeId.startsWith('motion-control-')
    ? nodeId.slice('motion-control-'.length)
    : null;
}

const allowedTargetHandles: Record<string, string[]> = {
  'motion-image-in': ['motion-image-out'],
  'motion-video-in': ['motion-video-out'],
  'motion-prompt-in': ['motion-prompt-out'],
  'motion-parameters-in': ['parameters-out'],
  'motion-output-in': ['motion-output-out'],
  'parameters-in': ['parameters-out'],
  'script-in': ['script-out'],
  'frames-in': ['frames-out'],
  'asset-in': ['asset-out'],
  'flow-in': ['flow-out'],
  'output-in': ['output-out'],
};

function handlesAreCompatible(sourceHandle?: string | null, targetHandle?: string | null) {
  if (!sourceHandle || !targetHandle) return false;
  return (
    allowedTargetHandles[targetHandle]?.includes(sourceHandle) ||
    allowedTargetHandles[sourceHandle]?.includes(targetHandle) ||
    false
  );
}

function invalidConnectionEndedOnHandle(connectionState: any) {
  return Boolean(
    connectionState.toHandle ||
    connectionState.toHandleId ||
    connectionState.toNode ||
    connectionState.toNodeId,
  );
}

const nodeTypes: NodeTypes = {
  scene: SceneNode,
  output: OutputNode,
  parameters: ParametersNode,
  script: ScriptNode,
  frames: FramesNode,
  asset: AssetNode,
  note: NoteNode,
  imageInput: ImageInputNode,
  videoInput: VideoInputNode,
  promptInput: PromptInputNode,
  motionControl: MotionControlNode,
  motionOutput: MotionOutputNode,
};

const backgroundVariantMap = {
  dots: BackgroundVariant.Dots,
  lines: BackgroundVariant.Lines,
  cross: BackgroundVariant.Cross,
} as const;

function sanitizeFilename(value: string) {
  return value.trim().replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'workflow';
}

function downloadTextFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function xmlTagName(key: string) {
  const safe = key.replace(/[^A-Za-z0-9_.-]/g, '_');
  return /^[A-Za-z_]/.test(safe) ? safe : `_${safe}`;
}

function valueToXml(key: string, value: unknown, depth = 0): string {
  const tag = xmlTagName(key);
  const pad = '  '.repeat(depth);

  if (value === null || value === undefined) {
    return `${pad}<${tag} />`;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}<${tag} />`;
    const children = value.map((item) => valueToXml('item', item, depth + 1)).join('\n');
    return `${pad}<${tag}>\n${children}\n${pad}</${tag}>`;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return `${pad}<${tag} />`;
    const children = entries.map(([childKey, childValue]) => valueToXml(childKey, childValue, depth + 1)).join('\n');
    return `${pad}<${tag}>\n${children}\n${pad}</${tag}>`;
  }

  return `${pad}<${tag}>${escapeXml(String(value))}</${tag}>`;
}

function workflowSnapshotToXml(snapshot: Record<string, unknown>) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${valueToXml('openSceneWorkflowCanvas', snapshot)}`;
}

function parseScalarXmlValue(value: string) {
  const trimmed = value.trim();
  if (trimmed === '') return '';
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric) && String(numeric) === trimmed) return numeric;
  return trimmed;
}

function xmlElementToValue(element: Element): unknown {
  const children = Array.from(element.children);
  if (children.length === 0) return parseScalarXmlValue(element.textContent ?? '');
  if (children.every((child) => child.tagName === 'item')) {
    return children.map((child) => xmlElementToValue(child));
  }

  return children.reduce<Record<string, unknown>>((acc, child) => {
    const value = xmlElementToValue(child);
    if (child.tagName in acc) {
      acc[child.tagName] = Array.isArray(acc[child.tagName])
        ? [...(acc[child.tagName] as unknown[]), value]
        : [acc[child.tagName], value];
    } else {
      acc[child.tagName] = value;
    }
    return acc;
  }, {});
}

function parseWorkflowSnapshotFile(text: string, filename: string) {
  const trimmed = text.trim();
  if (filename.toLowerCase().endsWith('.json') || trimmed.startsWith('{')) {
    return JSON.parse(trimmed) as Record<string, unknown>;
  }

  const doc = new DOMParser().parseFromString(trimmed, 'application/xml');
  const parseError = doc.querySelector('parsererror');
  if (parseError) throw new Error('The XML file could not be parsed.');
  const root = doc.documentElement;
  if (root.tagName !== 'openSceneWorkflowCanvas') {
    throw new Error('This XML is not an OpenScene workflow export.');
  }
  return xmlElementToValue(root) as Record<string, unknown>;
}

function isWorkflowSnapshot(value: unknown): value is Record<string, unknown> {
  return Boolean(
    value &&
    typeof value === 'object' &&
    (value as { schema?: unknown }).schema === 'openscene.workflow.canvas',
  );
}

function normalizeWorkflowSnapshotForImport(snapshot: Record<string, unknown>) {
  const layout = snapshot.layout && typeof snapshot.layout === 'object'
    ? snapshot.layout as Record<string, unknown>
    : {};
  const positions = layout.positions && typeof layout.positions === 'object' && !Array.isArray(layout.positions)
    ? layout.positions as Record<string, unknown>
    : {};
  const graph = snapshot.graph && typeof snapshot.graph === 'object'
    ? snapshot.graph as { nodes?: unknown }
    : {};
  const graphPositions = Array.isArray(graph.nodes)
    ? Object.fromEntries(
      graph.nodes
        .map((node) => {
          if (!node || typeof node !== 'object') return null;
          const item = node as { id?: unknown; position?: unknown };
          if (typeof item.id !== 'string' || !item.position || typeof item.position !== 'object') return null;
          return [item.id, item.position];
        })
        .filter(Boolean) as [string, unknown][],
    )
    : {};

  return {
    ...snapshot,
    layout: {
      ...layout,
      positions: {
        ...positions,
        ...graphPositions,
      },
    },
  };
}

export function WorkflowViewInner() {
  const {
    sceneMap,
    sceneOrder,
    nodePositions,
    nodeColorStyles,
    hiddenNodeIds,
    shownOutputSceneIds,
    noteNodes,
    motionControls,
    inputNodes,
    workflowConnections,
  } = useWorkflowStore(
    useShallow((s) => ({
      sceneMap: s.sceneMap,
      sceneOrder: s.sceneOrder,
      nodePositions: s.nodePositions,
      nodeColorStyles: s.nodeColorStyles,
      hiddenNodeIds: s.hiddenNodeIds,
      shownOutputSceneIds: s.shownOutputSceneIds,
      noteNodes: s.noteNodes,
      motionControls: s.motionControls,
      inputNodes: s.inputNodes,
      workflowConnections: s.workflowConnections,
    })),
  );
  const {
    updateScene,
    generateAllScenes,
    isGeneratingAll,
    getTotalDuration,
    setNodePosition,
    addNodeAt,
    addWorkflowConnection,
    importWorkflowSnapshot,
    applyAutoLayout,
    loadLayoutForProject,
    setSelectedNodeContext,
    clearSelectedNodeContext,
  } = useWorkflowStore(
    useShallow((s) => ({
      updateScene: s.updateScene,
      generateAllScenes: s.generateAllScenes,
      isGeneratingAll: s.isGeneratingAll,
      getTotalDuration: s.getTotalDuration,
      setNodePosition: s.setNodePosition,
      addNodeAt: s.addNodeAt,
      addWorkflowConnection: s.addWorkflowConnection,
      importWorkflowSnapshot: s.importWorkflowSnapshot,
      applyAutoLayout: s.applyAutoLayout,
      loadLayoutForProject: s.loadLayoutForProject,
      setSelectedNodeContext: s.setSelectedNodeContext,
      clearSelectedNodeContext: s.clearSelectedNodeContext,
    })),
  );
  const edgeLabelPlacement = useSettingsStore((s) => s.settings.edgeLabelPlacement ?? 'in-node');
  const canvasGrid = useSettingsStore((s) => s.settings.canvasGrid);
  const theme = useSettingsStore((s) => s.settings.theme);
  const { currentProjectId, getCurrentProject } = useProjectStore();
  const currentProject = getCurrentProject();
  const [, setSelectedNode] = useState<string | null>(null);
  const handleNodeClick = useCallback((_: unknown, node: FlowNode) => {
    setSelectedNode(node.id);
    const ctx = resolveNodeContext(node.id, node.type, sceneOrder);
    setSelectedNodeContext(ctx);
  }, [sceneOrder, setSelectedNodeContext]);
  const handlePaneClick = useCallback(() => {
    setSelectedNode(null);
    clearSelectedNodeContext();
  }, [clearSelectedNodeContext]);
  const [isImportDragging, setIsImportDragging] = useState(false);
  const [outputViewSceneId, setOutputViewSceneId] = useState<string | null>(null);
  const rfRef = useRef<ReactFlowInstance | null>(null);
  const dragDepthRef = useRef(0);
  const { toast } = useToast();
  const { onNodeContextMenu, closeMenu: closeNodeMenu, menuUi, confirmUi, backdrop: nodeBackdrop } = useWorkflowNodeContextMenu();
  const { openMenu: openPaneMenu, closeMenu: closePaneMenu, menuUi: paneMenuUi, backdrop: paneBackdrop } = useWorkflowPaneMenu();

  const handlePaneContextMenu = useCallback((event: MouseEvent | React.MouseEvent) => {
    event.preventDefault();
    closeNodeMenu();
    const flowPosition = rfRef.current?.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });
    if (flowPosition) {
      openPaneMenu(event.clientX, event.clientY, flowPosition);
    }
  }, [closeNodeMenu, openPaneMenu]);

  const handleNodeContextMenu = useCallback((event: React.MouseEvent, node: FlowNode) => {
    closePaneMenu();
    onNodeContextMenu(event, node);
  }, [closePaneMenu, onNodeContextMenu]);

  const scenes = useMemo(
    () => sceneOrder.map((id) => sceneMap[id]).filter(Boolean),
    [sceneMap, sceneOrder],
  );
  // Keep a ref to the latest scenes so the graph builder can read it without
  // the graph memo depending on the full scenes array (which would rebuild the
  // graph on every progress tick). The graph rebuild is gated by graphKey,
  // which captures only the fields that actually affect the graph.
  const scenesRef = useRef(scenes);
  scenesRef.current = scenes;

  useEffect(() => {
    if (currentProjectId) loadLayoutForProject(currentProjectId);
  }, [currentProjectId, loadLayoutForProject]);

  useEffect(() => {
    (window as any).__openOutputView = (sceneId: string) => setOutputViewSceneId(sceneId);
    return () => { delete (window as any).__openOutputView; };
  }, []);

  const graphKey = useMemo(
    () => scenes.map((s) =>
      `${s.id}:${s.status}:${s.startFrameUrl ?? ''}:${s.endFrameUrl ?? ''}:${s.generatedVideoUrl ?? ''}:${s.title}:${s.duration}`,
    ).join('|'),
    [scenes],
  );

  const { nodes: graphNodes, edges: graphEdges } = useMemo(
    () => buildWorkflowGraph(
      scenesRef.current,
      nodePositions,
      edgeLabelPlacement,
      hiddenNodeIds,
      currentProject?.creativePlan?.reusableAssets ?? [],
      nodeColorStyles,
      noteNodes,
      motionControls,
      inputNodes,
      workflowConnections,
    ),
    // Intentionally exclude `scenes` from deps — graphKey gates the rebuild.
    [graphKey, nodePositions, edgeLabelPlacement, hiddenNodeIds, currentProject?.creativePlan?.reusableAssets, nodeColorStyles, noteNodes, motionControls, inputNodes, workflowConnections],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(graphNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(graphEdges);

  useEffect(() => {
    setNodes(graphNodes);
    setEdges(graphEdges);
  }, [graphNodes, graphEdges, setNodes, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target) return;
      if (!handlesAreCompatible(params.sourceHandle, params.targetHandle)) return;
      addWorkflowConnection({
        source: params.source,
        sourceHandle: params.sourceHandle,
        target: params.target,
        targetHandle: params.targetHandle,
      });
    },
    [addWorkflowConnection],
  );

  const isValidConnection = useCallback<IsValidConnection>(
    (connection) => handlesAreCompatible(connection.sourceHandle, connection.targetHandle),
    [],
  );

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, connectionState: any) => {
      if (connectionState.isValid) return;
      if (invalidConnectionEndedOnHandle(connectionState)) return;
      const { fromNode, fromHandle } = connectionState;
      if (!fromNode || !fromHandle?.id) return;

      const clientPoint = eventClientPoint(event);
      const position = rfRef.current?.screenToFlowPosition(clientPoint) ?? { x: 120, y: 120 };
      const handleId = fromHandle.id as string;

      const addConnectedNode = (kind: WorkflowNodeKind, sourceHandle: string, targetHandle: string, targetNodeId = fromNode.id) => {
        const newId = addNodeAt(kind, position, targetNodeId);
        if (!newId) return;
        addWorkflowConnection({
          source: newId,
          sourceHandle,
          target: targetNodeId,
          targetHandle,
        });
      };

      const addConnectedScene = (sourceNodeId: string, sourceHandle: string, targetHandle: string) => {
        const newId = addNodeAt('scene', position);
        if (!newId) return;
        addWorkflowConnection({
          source: sourceNodeId,
          sourceHandle,
          target: newId,
          targetHandle,
        });
      };

      const addSceneInputNode = (kind: Extract<WorkflowNodeKind, 'parameters' | 'script' | 'frames'>) => {
        addNodeAt(kind, position, fromNode.id);
      };

      if (handleId === 'motion-image-in') {
        addConnectedNode('image-input', 'motion-image-out', 'motion-image-in');
        return;
      }
      if (handleId === 'motion-video-in') {
        addConnectedNode('video-input', 'motion-video-out', 'motion-video-in');
        return;
      }
      if (handleId === 'motion-prompt-in') {
        addConnectedNode('prompt-input', 'motion-prompt-out', 'motion-prompt-in');
        return;
      }
      if (handleId === 'motion-parameters-in') {
        const motionId = motionIdFromNodeId(fromNode.id);
        if (!motionId) return;
        const newId = `motion-parameters-${motionId}`;
        setNodePosition(newId, position);
        addWorkflowConnection({
          source: newId,
          sourceHandle: 'parameters-out',
          target: fromNode.id,
          targetHandle: 'motion-parameters-in',
        });
        return;
      }

      if (handleId === 'parameters-in') {
        addSceneInputNode('parameters');
        return;
      }
      if (handleId === 'script-in') {
        addSceneInputNode('script');
        return;
      }
      if (handleId === 'frames-in') {
        addSceneInputNode('frames');
        return;
      }

      if (handleId === 'motion-image-out') {
        const newId = addNodeAt('motion-control', position);
        if (newId) addWorkflowConnection({ source: fromNode.id, sourceHandle: 'motion-image-out', target: newId, targetHandle: 'motion-image-in' });
        return;
      }
      if (handleId === 'motion-video-out') {
        const newId = addNodeAt('motion-control', position);
        if (newId) addWorkflowConnection({ source: fromNode.id, sourceHandle: 'motion-video-out', target: newId, targetHandle: 'motion-video-in' });
        return;
      }
      if (handleId === 'motion-prompt-out') {
        const newId = addNodeAt('motion-control', position);
        if (newId) addWorkflowConnection({ source: fromNode.id, sourceHandle: 'motion-prompt-out', target: newId, targetHandle: 'motion-prompt-in' });
        return;
      }

      if (handleId === 'parameters-out') {
        addConnectedScene(fromNode.id, 'parameters-out', 'parameters-in');
        return;
      }
      if (handleId === 'script-out') {
        addConnectedScene(fromNode.id, 'script-out', 'script-in');
        return;
      }
      if (handleId === 'frames-out') {
        addConnectedScene(fromNode.id, 'frames-out', 'frames-in');
        return;
      }
      if (handleId === 'flow-out') {
        addConnectedScene(fromNode.id, 'flow-out', 'flow-in');
      }
    },
    [addNodeAt, addWorkflowConnection, setNodePosition]
  );

  const handleNodeDataChange = useCallback((nodeId: string, newData: Partial<import('@/core/types').Scene>) => {
    updateScene(nodeId, newData);
  }, [updateScene]);

  useEffect(() => {
    (window as any).__sceneNodeUpdate = handleNodeDataChange;
    return () => { delete (window as any).__sceneNodeUpdate; };
  }, [handleNodeDataChange]);

  const onNodeDragStop = useCallback<OnNodeDrag>((_, node: FlowNode) => {
    setNodePosition(node.id, node.position);
  }, [setNodePosition]);

  const handleAutoLayout = useCallback(() => {
    applyAutoLayout();
    setTimeout(() => rfRef.current?.fitView({ padding: 0.3, duration: 300 }), 80);
  }, [applyAutoLayout]);

  const handleAddNode = useCallback((kind: (typeof ADD_NODE_OPTIONS)[number]['kind']) => {
    const position = rfRef.current?.screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    }) ?? { x: 120, y: 120 };
    addNodeAt(kind, position);
  }, [addNodeAt]);

  const buildExportSnapshot = useCallback(() => {
    const viewport = rfRef.current?.getViewport();
    const canvasPositions = Object.fromEntries(nodes.map((node) => [node.id, node.position]));
    return {
      schema: 'openscene.workflow.canvas',
      version: 1,
      exportedAt: new Date().toISOString(),
      projectId: currentProject?.id ?? currentProjectId ?? null,
      projectName: currentProject?.name ?? 'Workflow',
      project: currentProject ?? null,
      scenes,
      notes: noteNodes,
      motionControls,
      inputs: inputNodes,
      connections: workflowConnections,
      reusableAssets: currentProject?.creativePlan?.reusableAssets ?? [],
      layout: {
        positions: { ...nodePositions, ...canvasPositions },
        hiddenNodes: Object.keys(hiddenNodeIds),
        shownOutputs: Object.keys(shownOutputSceneIds),
        nodeColors: nodeColorStyles,
        viewport: viewport ?? null,
      },
      graph: {
        nodes,
        edges,
      },
    };
  }, [currentProject, currentProjectId, edges, hiddenNodeIds, motionControls, inputNodes, workflowConnections, nodeColorStyles, nodePositions, nodes, noteNodes, scenes, shownOutputSceneIds]);

  const handleExportWorkflow = useCallback((format: 'json' | 'xml') => {
    const snapshot = buildExportSnapshot();
    const baseName = sanitizeFilename(`${snapshot.projectName}-workflow-canvas`);
    if (format === 'json') {
      downloadTextFile(`${baseName}.json`, JSON.stringify(snapshot, null, 2), 'application/json;charset=utf-8');
      return;
    }
    downloadTextFile(`${baseName}.xml`, workflowSnapshotToXml(snapshot), 'application/xml;charset=utf-8');
  }, [buildExportSnapshot]);

  const handleWorkflowDrop = useCallback(async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepthRef.current = 0;
    setIsImportDragging(false);

    const file = Array.from(event.dataTransfer.files).find((item) =>
      item.name.toLowerCase().endsWith('.json') ||
      item.name.toLowerCase().endsWith('.xml') ||
      item.type === 'application/json' ||
      item.type === 'application/xml' ||
      item.type === 'text/xml',
    );

    if (!file) {
      toast({
        title: 'Unsupported file',
        description: 'Drop an OpenScene workflow export as JSON or XML.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const snapshot = parseWorkflowSnapshotFile(await file.text(), file.name);
      if (!isWorkflowSnapshot(snapshot)) {
        throw new Error('This file is not an OpenScene workflow export.');
      }
      const normalizedSnapshot = normalizeWorkflowSnapshotForImport(snapshot);
      importWorkflowSnapshot(normalizedSnapshot as Parameters<typeof importWorkflowSnapshot>[0]);

      const viewport = (snapshot.layout as { viewport?: { x: number; y: number; zoom: number } } | undefined)?.viewport;
      setTimeout(() => {
        if (viewport) {
          rfRef.current?.setViewport(viewport, { duration: 250 });
        } else {
          rfRef.current?.fitView({ padding: 0.3, duration: 250 });
        }
      }, 80);

      toast({
        title: 'Workflow loaded',
        description: `${file.name} has been restored on this canvas.`,
      });
    } catch (error) {
      toast({
        title: 'Import failed',
        description: error instanceof Error ? error.message : 'The workflow file could not be loaded.',
        variant: 'destructive',
      });
    }
  }, [importWorkflowSnapshot, toast]);

  const handleWorkflowDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!Array.from(event.dataTransfer.types).includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleWorkflowDragEnter = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!Array.from(event.dataTransfer.types).includes('Files')) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    setIsImportDragging(true);
  }, []);

  const handleWorkflowDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!Array.from(event.dataTransfer.types).includes('Files')) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsImportDragging(false);
  }, []);

  const viewScene = outputViewSceneId ? sceneMap[outputViewSceneId] : null;
  const viewUrl = viewScene?.generatedVideoUrl ?? viewScene?.generatedStartFrameUrl;
  const viewIsVideo = Boolean(viewScene?.generatedVideoUrl);

  const generatingCount = scenes.filter((s) => s.status === 'generating' || s.status === 'regenerating' || s.status === 'queued').length;
  const completedCount = scenes.filter((s) => s.status === 'completed').length;
  const isDarkTheme = theme === 'dark' || (
    theme === 'system' &&
    typeof document !== 'undefined' &&
    document.documentElement.classList.contains('dark')
  );
  const gridColor = isDarkTheme
    ? `rgba(255, 255, 255, ${canvasGrid.opacity})`
    : `rgba(15, 23, 42, ${Math.min(0.45, canvasGrid.opacity + 0.08)})`;

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className="relative h-full w-full"
        onDrop={handleWorkflowDrop}
        onDragOver={handleWorkflowDragOver}
        onDragEnter={handleWorkflowDragEnter}
        onDragLeave={handleWorkflowDragLeave}
      >
        {isImportDragging && (
          <div className="pointer-events-none absolute inset-4 z-50 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-background/70 text-sm font-medium text-foreground shadow-2xl backdrop-blur-sm">
            Drop workflow JSON or XML to load canvas
          </div>
        )}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          onConnectEnd={onConnectEnd}
          onNodeDragStop={onNodeDragStop}
          onNodeContextMenu={handleNodeContextMenu}
          onPaneContextMenu={handlePaneContextMenu}
          nodeTypes={nodeTypes}
          onInit={(inst) => { rfRef.current = inst; }}
          onNodeClick={handleNodeClick}
          onPaneClick={handlePaneClick}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          minZoom={0.1}
          maxZoom={2}
          className="bg-background workflow-canvas"
          proOptions={{ hideAttribution: true }}
        >
          {canvasGrid.enabled && (
            <Background
              variant={backgroundVariantMap[canvasGrid.variant]}
              gap={canvasGrid.gap}
              size={canvasGrid.variant === 'dots' ? 1.25 : 1}
              color={gridColor}
            />
          )}
          <Controls className="!bg-card !border-border !shadow-lg [&>button]:!bg-card [&>button]:!border-border [&>button]:!text-foreground [&>button:hover]:!bg-muted" />
          <MiniMap
            nodeStrokeColor="hsl(var(--primary))"
            nodeColor={(node) => {
              if (node.type === 'output') return 'hsl(142 71% 45%)';
              if (node.type === 'parameters') return 'hsl(45 93% 47%)';
              if (node.type === 'script') return 'hsl(270 60% 60%)';
              if (node.type === 'frames') return 'hsl(173 58% 45%)';
              if (node.type === 'asset') return 'hsl(188 86% 53%)';
              if (node.type === 'note') return 'hsl(48 96% 53%)';
              if (node.type === 'imageInput') return 'hsl(199 89% 48%)';
              if (node.type === 'videoInput') return 'hsl(24 95% 53%)';
              if (node.type === 'promptInput') return 'hsl(271 91% 65%)';
              if (node.type === 'motionControl') return 'hsl(142 71% 45%)';
              if (node.type === 'motionOutput') return 'hsl(142 71% 45%)';
              return 'hsl(var(--primary))';
            }}
            nodeBorderRadius={8}
            className="!bg-card !border-border"
          />

          <Panel position="top-left" className="flex gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 shadow-lg bg-card border-border">
                  <Plus className="w-3.5 h-3.5" />
                  Add Node
                  <ChevronDown className="w-3 h-3 opacity-70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-56">
                {ADD_NODE_OPTIONS.map((option) => (
                  <DropdownMenuItem key={option.kind} onClick={() => handleAddNode(option.kind)} className="gap-2">
                    <option.icon className={`w-3.5 h-3.5 ${option.color}`} />
                    <span>{option.label}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" size="sm" onClick={handleAutoLayout} className="gap-1.5 shadow-lg bg-card border-border">
              <AlignHorizontalSpaceAround className="w-3.5 h-3.5" /> Auto Layout
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 shadow-lg bg-card border-border">
                  <Download className="w-3.5 h-3.5" />
                  Export
                  <ChevronDown className="w-3 h-3 opacity-70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-40">
                <DropdownMenuItem onClick={() => handleExportWorkflow('json')} className="gap-2">
                  <FileJson className="w-3.5 h-3.5" />
                  JSON
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExportWorkflow('xml')} className="gap-2">
                  <FileCode2 className="w-3.5 h-3.5" />
                  XML
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </Panel>

          <Panel position="top-right">
            <div className="bg-card border border-border rounded-lg p-3 shadow-lg text-xs space-y-1.5 min-w-[160px]">
              <div className="font-semibold">Workflow Info</div>
              <div className="flex justify-between text-muted-foreground">
                <span>Scenes</span><span className="text-foreground">{scenes.length}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Total Duration</span><span className="text-foreground">{getTotalDuration()}s</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Completed</span><span className="text-foreground">{completedCount}</span>
              </div>
              {generatingCount > 0 && (
                <div className="flex justify-between text-blue-400">
                  <span>Generating</span><span>{generatingCount}</span>
                </div>
              )}
            </div>
          </Panel>

          <Panel position="bottom-center">
            <Button
              size="lg"
              className="gap-2 shadow-xl"
              disabled={isGeneratingAll || scenes.length === 0}
              onClick={() => generateAllScenes()}
            >
              {isGeneratingAll ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating All…
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Generate All Scenes
                </>
              )}
            </Button>
          </Panel>
        </ReactFlow>

        {nodeBackdrop}
        {paneBackdrop}
        {menuUi}
        {paneMenuUi}
        {confirmUi}

        {outputViewSceneId && viewScene && viewUrl && (
          <OutputPreviewDialog
            scene={viewScene}
            url={viewUrl}
            isVideo={viewIsVideo}
            open={Boolean(outputViewSceneId)}
            onOpenChange={(open) => !open && setOutputViewSceneId(null)}
          />
        )}
      </div>
    </TooltipProvider>
  );
}
