'use client';

import { useCallback, useMemo, useEffect, useState, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type NodeTypes,
  type ReactFlowInstance,
  type Node as FlowNode,
  BackgroundVariant,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useWorkflowStore } from '@/features/workflow/store';
import { useProjectStore } from '@/features/project/store';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Plus, Play, LayoutGrid, Loader2, Sparkles, Film, Camera, Eye, Zap, Wand2, AlignHorizontalSpaceAround } from 'lucide-react';
import { SceneNode } from './scene-node';
import { OutputNode } from './output-node';
import { ParametersNode } from './params-node';
import { ScriptNode } from './script-node';
import { FramesNode } from './frames-node';
import { buildWorkflowGraph } from './workflow-graph';
import { useWorkflowNodeContextMenu } from './workflow-context-menu';
import { useWorkflowPaneMenu } from './workflow-pane-menu';
import { useSettingsStore } from '@/features/settings/store';

const AI_ACTIONS = [
  { label: 'Improve Prompt', icon: Sparkles, prompt: 'improve' },
  { label: 'Make Cinematic', icon: Film, prompt: 'cinematic' },
  { label: 'Make Realistic', icon: Eye, prompt: 'realistic' },
  { label: 'Make More Viral', icon: Zap, prompt: 'viral' },
  { label: 'Improve Camera', icon: Camera, prompt: 'camera' },
  { label: 'Simplify', icon: Wand2, prompt: 'simplify' },
];

const nodeTypes: NodeTypes = {
  scene: SceneNode,
  output: OutputNode,
  parameters: ParametersNode,
  script: ScriptNode,
  frames: FramesNode,
};

export function WorkflowViewInner() {
  const sceneMap = useWorkflowStore((s) => s.sceneMap);
  const sceneOrder = useWorkflowStore((s) => s.sceneOrder);
  const nodePositions = useWorkflowStore((s) => s.nodePositions);
  const hiddenNodeIds = useWorkflowStore((s) => s.hiddenNodeIds);
  const addScene = useWorkflowStore((s) => s.addScene);
  const updateScene = useWorkflowStore((s) => s.updateScene);
  const generateAllScenes = useWorkflowStore((s) => s.generateAllScenes);
  const isGeneratingAll = useWorkflowStore((s) => s.isGeneratingAll);
  const getTotalDuration = useWorkflowStore((s) => s.getTotalDuration);
  const setNodePosition = useWorkflowStore((s) => s.setNodePosition);
  const applyAutoLayout = useWorkflowStore((s) => s.applyAutoLayout);
  const loadLayoutForProject = useWorkflowStore((s) => s.loadLayoutForProject);
  const edgeLabelPlacement = useSettingsStore((s) => s.settings.edgeLabelPlacement ?? 'in-node');
  const { setPhase, currentProjectId } = useProjectStore();
  const [, setSelectedNode] = useState<string | null>(null);
  const [outputViewSceneId, setOutputViewSceneId] = useState<string | null>(null);
  const rfRef = useRef<ReactFlowInstance | null>(null);
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
    () => buildWorkflowGraph(scenes, nodePositions, edgeLabelPlacement, hiddenNodeIds),
    [graphKey, nodePositions, scenes, edgeLabelPlacement, hiddenNodeIds],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(graphNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(graphEdges);

  useEffect(() => {
    setNodes(graphNodes);
    setEdges(graphEdges);
  }, [graphNodes, graphEdges, setNodes, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  );

  const handleNodeDataChange = useCallback((nodeId: string, newData: Partial<import('@/core/types').Scene>) => {
    updateScene(nodeId, newData);
  }, [updateScene]);

  useEffect(() => {
    (window as any).__sceneNodeUpdate = handleNodeDataChange;
    return () => { delete (window as any).__sceneNodeUpdate; };
  }, [handleNodeDataChange]);

  const onNodeDragStop = useCallback((_: React.MouseEvent, node: FlowNode) => {
    setNodePosition(node.id, node.position);
  }, [setNodePosition]);

  const handleAutoLayout = useCallback(() => {
    applyAutoLayout();
    setTimeout(() => rfRef.current?.fitView({ padding: 0.3, duration: 300 }), 80);
  }, [applyAutoLayout]);

  const viewScene = outputViewSceneId ? sceneMap[outputViewSceneId] : null;
  const viewUrl = viewScene?.generatedVideoUrl ?? viewScene?.generatedStartFrameUrl;
  const viewIsVideo = Boolean(viewScene?.generatedVideoUrl);

  const generatingCount = scenes.filter((s) => s.status === 'generating' || s.status === 'regenerating' || s.status === 'queued').length;
  const completedCount = scenes.filter((s) => s.status === 'completed').length;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="h-full w-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDragStop={onNodeDragStop}
          onNodeContextMenu={handleNodeContextMenu}
          onPaneContextMenu={handlePaneContextMenu}
          nodeTypes={nodeTypes}
          onInit={(inst) => { rfRef.current = inst; }}
          onNodeClick={(_, node) => setSelectedNode(node.id)}
          onPaneClick={() => setSelectedNode(null)}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          minZoom={0.1}
          maxZoom={2}
          className="bg-background workflow-canvas"
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="hsl(var(--border))" />
          <Controls className="!bg-card !border-border !shadow-lg [&>button]:!bg-card [&>button]:!border-border [&>button]:!text-foreground [&>button:hover]:!bg-muted" />
          <MiniMap
            nodeStrokeColor="hsl(var(--primary))"
            nodeColor={(node) => {
              if (node.type === 'output') return 'hsl(142 71% 45%)';
              if (node.type === 'parameters') return 'hsl(45 93% 47%)';
              if (node.type === 'script') return 'hsl(270 60% 60%)';
              if (node.type === 'frames') return 'hsl(173 58% 45%)';
              return 'hsl(var(--primary))';
            }}
            nodeBorderRadius={8}
            className="!bg-card !border-border"
          />

          <Panel position="top-left" className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => addScene()} className="gap-1.5 shadow-lg bg-card border-border">
              <Plus className="w-3.5 h-3.5" /> Add Scene
            </Button>
            <Button variant="outline" size="sm" onClick={handleAutoLayout} className="gap-1.5 shadow-lg bg-card border-border">
              <AlignHorizontalSpaceAround className="w-3.5 h-3.5" /> Auto Layout
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPhase('timeline')} className="gap-1.5 shadow-lg bg-card border-border">
              <LayoutGrid className="w-3.5 h-3.5" /> Timeline
            </Button>
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
          <Dialog open={Boolean(outputViewSceneId)} onOpenChange={(o) => !o && setOutputViewSceneId(null)}>
            <DialogContent className="max-w-lg p-0 overflow-hidden">
              <DialogHeader className="p-4 pb-0">
                <DialogTitle className="text-sm">{viewScene.title}</DialogTitle>
              </DialogHeader>
              <div className="p-4 pt-2">
                {viewIsVideo ? (
                  <video src={viewUrl} controls autoPlay className="w-full rounded-lg bg-black" />
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={viewUrl} alt={viewScene.title} className="w-full rounded-lg" />
                )}
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </TooltipProvider>
  );
}

export { AI_ACTIONS };
