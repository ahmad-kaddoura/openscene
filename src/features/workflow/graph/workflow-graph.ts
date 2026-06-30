import type { Scene } from '@/core/types';
import type { Edge, Node } from '@xyflow/react';
import { MarkerType } from '@xyflow/react';
import type { EdgeLabelPlacement } from '@/core/types';
import {
  LAYOUT,
  parametersNodeId,
  scriptNodeId,
  framesNodeId,
  outputNodeId,
  shouldShowOutputNode,
  resolvePosition,
  computeAutoLayout,
  type NodePositions,
} from './workflow-layout';

export {
  shouldShowOutputNode,
  LAYOUT,
  parametersNodeId,
  scriptNodeId,
  framesNodeId,
  outputNodeId,
};

// SVG markers and edge labels can't use CSS hsl() space syntax — use hex
const LABEL_BG = '#1c1c1f';
const LABEL_FG = '#a1a1aa';
const FLOW_STROKE = '#d4d4d8';
const C_PARAMETERS = '#eab308';
const C_SCRIPT = '#a78bfa';
const C_FRAMES = '#2dd4bf';
const C_OUTPUT_OK = '#22c55e';
const C_OUTPUT_FAIL = '#ef4444';
const C_OUTPUT_ACTIVE = '#3b82f6';

type EdgeExtras = Pick<Edge, 'label' | 'labelStyle' | 'labelBgStyle' | 'labelBgPadding' | 'labelBgBorderRadius'>;

function edgeLabels(text: string, color: string, onEdge: boolean): EdgeExtras {
  if (!onEdge) return {};
  return {
    label: text,
    labelStyle: { fontSize: 9, fill: color },
    labelBgStyle: { fill: LABEL_BG, fillOpacity: 0.95 },
    labelBgPadding: [3, 5] as [number, number],
    labelBgBorderRadius: 4,
  };
}

export function buildWorkflowGraph(
  scenes: Scene[],
  savedPositions: NodePositions | null = null,
  edgeLabelPlacement: EdgeLabelPlacement = 'in-node',
  hiddenNodeIds: Record<string, true> = {},
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const defaults = computeAutoLayout(scenes);
  const pos = (id: string) => resolvePosition(id, savedPositions, defaults);
  const onEdge = edgeLabelPlacement === 'on-edge';
  const visible = (id: string) => !hiddenNodeIds[id];
  const link = (source: string, target: string) => visible(source) && visible(target);

  scenes.forEach((scene, idx) => {
    const hasOutput = shouldShowOutputNode(scene);
    const pid = parametersNodeId(scene.id);
    const sid = scriptNodeId(scene.id);
    const fid = framesNodeId(scene.id);
    const oid = outputNodeId(scene.id);
    const sceneVisible = visible(scene.id);

    if (visible(pid)) {
      nodes.push({
        id: pid,
        type: 'parameters',
        position: pos(pid),
        data: { sceneId: scene.id, label: 'parameters' },
      });
    }

    if (visible(sid)) {
      nodes.push({
        id: sid,
        type: 'script',
        position: pos(sid),
        data: { sceneId: scene.id, label: 'script' },
      });
    }

    if (visible(fid)) {
      nodes.push({
        id: fid,
        type: 'frames',
        position: pos(fid),
        data: { sceneId: scene.id, label: 'frames' },
      });
    }

    if (sceneVisible) {
      nodes.push({
        id: scene.id,
        type: 'scene',
        position: pos(scene.id),
        data: scene as unknown as Record<string, unknown>,
      });
    }

    if (link(pid, scene.id)) {
      edges.push({
        id: `e-parameters-${scene.id}`,
        source: pid,
        sourceHandle: 'parameters-out',
        target: scene.id,
        targetHandle: 'parameters-in',
        type: 'smoothstep',
        style: { stroke: C_PARAMETERS, strokeWidth: 1.5, opacity: 0.7 },
        markerEnd: { type: MarkerType.ArrowClosed, color: C_PARAMETERS },
        ...edgeLabels('parameters', C_PARAMETERS, onEdge),
      });
    }

    if (link(sid, scene.id)) {
      edges.push({
        id: `e-script-${scene.id}`,
        source: sid,
        sourceHandle: 'script-out',
        target: scene.id,
        targetHandle: 'script-in',
        type: 'smoothstep',
        style: { stroke: C_SCRIPT, strokeWidth: 1.5, opacity: 0.7 },
        markerEnd: { type: MarkerType.ArrowClosed, color: C_SCRIPT },
        ...edgeLabels('script', C_SCRIPT, onEdge),
      });
    }

    if (link(fid, scene.id)) {
      edges.push({
        id: `e-frames-${scene.id}`,
        source: fid,
        sourceHandle: 'frames-out',
        target: scene.id,
        targetHandle: 'frames-in',
        type: 'smoothstep',
        style: { stroke: C_FRAMES, strokeWidth: 1.5, opacity: 0.7 },
        markerEnd: { type: MarkerType.ArrowClosed, color: C_FRAMES },
        ...edgeLabels('frames', C_FRAMES, onEdge),
      });
    }

    if (hasOutput && visible(oid)) {
      nodes.push({
        id: oid,
        type: 'output',
        position: pos(oid),
        data: { sceneId: scene.id, label: 'output' },
      });

      if (link(scene.id, oid)) {
        edges.push({
          id: `e-output-${scene.id}`,
          source: scene.id,
          sourceHandle: 'output-out',
          target: oid,
          targetHandle: 'output-in',
          type: 'smoothstep',
          animated: scene.status === 'generating' || scene.status === 'regenerating' || scene.status === 'queued',
          style: {
            stroke: scene.status === 'completed'
              ? C_OUTPUT_OK
              : scene.status === 'failed'
                ? C_OUTPUT_FAIL
                : C_OUTPUT_ACTIVE,
            strokeWidth: 2,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: scene.status === 'completed' ? C_OUTPUT_OK : scene.status === 'failed' ? C_OUTPUT_FAIL : C_OUTPUT_ACTIVE,
          },
          ...edgeLabels('output', LABEL_FG, onEdge),
        });
      }
    }

    const nextScene = scenes[idx + 1];
    if (nextScene && link(scene.id, nextScene.id)) {
      const transition = scene.transition ? scene.transition.replace(/_/g, ' ') : undefined;
      edges.push({
        id: `e-flow-${scene.id}-${nextScene.id}`,
        source: scene.id,
        sourceHandle: 'flow-out',
        target: nextScene.id,
        targetHandle: 'flow-in',
        type: 'smoothstep',
        animated: true,
        style: { stroke: FLOW_STROKE, strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: FLOW_STROKE },
        ...(onEdge && transition ? {
          label: transition,
          labelStyle: { fontSize: 10, fill: LABEL_FG },
          labelBgStyle: { fill: LABEL_BG, fillOpacity: 0.95 },
          labelBgPadding: [4, 6] as [number, number],
          labelBgBorderRadius: 4,
        } : {}),
      });
    }
  });

  return { nodes, edges };
}
