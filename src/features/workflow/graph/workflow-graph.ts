import type { ReusableAssetPlan, Scene } from '@/core/types';
import type { Edge, Node } from '@xyflow/react';
import { MarkerType } from '@xyflow/react';
import type { EdgeLabelPlacement } from '@/core/types';
import {
  LAYOUT,
  parametersNodeId,
  scriptNodeId,
  framesNodeId,
  outputNodeId,
  finalOutputNodeId,
  shouldShowOutputNode,
  allScenesReadyForFinalOutput,
  resolvePosition,
  computeAutoLayout,
  type NodePositions,
  type NodeColorStyles,
  type WorkflowNote,
  type WorkflowMotionControl,
  type WorkflowMotionInput,
} from './workflow-layout';

export {
  shouldShowOutputNode,
  LAYOUT,
  parametersNodeId,
  scriptNodeId,
  framesNodeId,
  outputNodeId,
  finalOutputNodeId,
};

// SVG markers and edge labels can't use CSS hsl() space syntax — use hex
const LABEL_BG = '#1c1c1f';
const LABEL_FG = '#a1a1aa';
const FLOW_STROKE = '#d4d4d8';
const C_PARAMETERS = '#eab308';
const C_SCRIPT = '#a78bfa';
const C_FRAMES = '#2dd4bf';
const C_ASSET = '#22d3ee';
const C_MOTION_IMAGE = '#38bdf8';
const C_MOTION_VIDEO = '#f97316';
const C_MOTION_PROMPT = '#c084fc';
const C_MOTION_OUTPUT = '#22c55e';
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
  reusableAssets: ReusableAssetPlan[] = [],
  nodeColorStyles: NodeColorStyles = {},
  notes: WorkflowNote[] = [],
  motionControls: WorkflowMotionControl[] = [],
  motionInputs: WorkflowMotionInput[] = [],
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const defaults = computeAutoLayout(scenes, reusableAssets);
  const pos = (id: string) => resolvePosition(id, savedPositions, defaults);
  const onEdge = edgeLabelPlacement === 'on-edge';
  const visible = (id: string) => !hiddenNodeIds[id];
  const link = (source: string, target: string) => visible(source) && visible(target);
  const workflowStyle = (id: string) => nodeColorStyles[id] ?? {};
  const edgeStyle = (source: string, target: string, fallback: string) => nodeColorStyles[source]?.line ?? nodeColorStyles[target]?.line ?? fallback;

  notes.forEach((note, idx) => {
    if (!visible(note.id)) return;
    nodes.push({
      id: note.id,
      type: 'note',
      position: savedPositions?.[note.id] ?? { x: 80, y: 80 + idx * 180 },
      data: { ...note, workflowStyle: workflowStyle(note.id) },
      style: {
        width: note.width ?? 240,
        height: note.height ?? 170,
      },
    });
  });

  motionInputs.forEach((input, idx) => {
    if (!visible(input.id)) return;
    const type = input.kind === 'reference-image'
      ? 'motionImage'
      : input.kind === 'reference-video'
        ? 'motionVideo'
        : 'motionPrompt';
    nodes.push({
      id: input.id,
      type,
      position: savedPositions?.[input.id] ?? { x: 80, y: 320 + idx * 190 },
      data: { inputId: input.id, workflowStyle: workflowStyle(input.id) },
    });
  });

  motionControls.forEach((motion, idx) => {
    const ids = {
      image: `motion-image-${motion.id}`,
      video: `motion-video-${motion.id}`,
      prompt: `motion-prompt-${motion.id}`,
      control: `motion-control-${motion.id}`,
    };
    const base = savedPositions?.[ids.control] ?? { x: 80 + idx * 720, y: 340 };
    const fallback = {
      [ids.image]: { x: base.x - 280, y: base.y - 170 },
      [ids.video]: { x: base.x - 280, y: base.y + 10 },
      [ids.prompt]: { x: base.x - 280, y: base.y + 190 },
      [ids.control]: base,
    };

    ([
      [ids.image, 'motionImage'],
      [ids.video, 'motionVideo'],
      [ids.prompt, 'motionPrompt'],
      [ids.control, 'motionControl'],
    ] as const).forEach(([id, type]) => {
      if (!visible(id)) return;
      nodes.push({
        id,
        type,
        position: savedPositions?.[id] ?? fallback[id],
        data: { motionId: motion.id, workflowStyle: workflowStyle(id) },
      });
    });

    [
      [ids.image, 'motion-image-out', 'motion-image-in', 'reference image', C_MOTION_IMAGE],
      [ids.video, 'motion-video-out', 'motion-video-in', 'reference video', C_MOTION_VIDEO],
      [ids.prompt, 'motion-prompt-out', 'motion-prompt-in', 'prompt', C_MOTION_PROMPT],
    ].forEach(([source, sourceHandle, targetHandle, label, color]) => {
      if (!link(source, ids.control)) return;
      edges.push({
        id: `e-${source}-${ids.control}`,
        source,
        sourceHandle,
        target: ids.control,
        targetHandle,
        type: 'smoothstep',
        animated: motion.status === 'generating' || motion.status === 'queued',
        style: { stroke: edgeStyle(source, ids.control, color), strokeWidth: 1.8, opacity: 0.82 },
        markerEnd: { type: MarkerType.ArrowClosed, color: edgeStyle(source, ids.control, color) },
        ...edgeLabels(label, color, onEdge),
      });
    });
  });

  reusableAssets.forEach((asset, idx) => {
    if (!visible(asset.id)) return;
    nodes.push({
      id: asset.id,
      type: 'asset',
      position: savedPositions?.[asset.id] ?? defaults[asset.id] ?? { x: 80, y: 80 + idx * 190 },
      data: { ...(asset as unknown as Record<string, unknown>), workflowStyle: workflowStyle(asset.id) },
    });
  });

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
        data: { sceneId: scene.id, label: 'parameters', workflowStyle: workflowStyle(pid) },
      });
    }

    if (visible(sid)) {
      nodes.push({
        id: sid,
        type: 'script',
        position: pos(sid),
        data: { sceneId: scene.id, label: 'script', workflowStyle: workflowStyle(sid) },
      });
    }

    if (visible(fid)) {
      nodes.push({
        id: fid,
        type: 'frames',
        position: pos(fid),
        data: { sceneId: scene.id, label: 'frames', workflowStyle: workflowStyle(fid) },
      });
    }

    if (sceneVisible) {
      nodes.push({
        id: scene.id,
        type: 'scene',
        position: pos(scene.id),
        data: { ...(scene as unknown as Record<string, unknown>), workflowStyle: workflowStyle(scene.id) },
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
        style: { stroke: edgeStyle(pid, scene.id, C_PARAMETERS), strokeWidth: 1.5, opacity: 0.7 },
        markerEnd: { type: MarkerType.ArrowClosed, color: edgeStyle(pid, scene.id, C_PARAMETERS) },
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
        style: { stroke: edgeStyle(sid, scene.id, C_SCRIPT), strokeWidth: 1.5, opacity: 0.7 },
        markerEnd: { type: MarkerType.ArrowClosed, color: edgeStyle(sid, scene.id, C_SCRIPT) },
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
        style: { stroke: edgeStyle(fid, scene.id, C_FRAMES), strokeWidth: 1.5, opacity: 0.7 },
        markerEnd: { type: MarkerType.ArrowClosed, color: edgeStyle(fid, scene.id, C_FRAMES) },
        ...edgeLabels('frames', C_FRAMES, onEdge),
      });
    }

    for (const assetId of scene.assetsUsed ?? []) {
      if (link(assetId, scene.id)) {
        edges.push({
          id: `e-asset-${assetId}-${scene.id}`,
          source: assetId,
          sourceHandle: 'asset-out',
          target: scene.id,
          targetHandle: 'asset-in',
          type: 'smoothstep',
          style: { stroke: edgeStyle(assetId, scene.id, C_ASSET), strokeWidth: 1.5, opacity: 0.75 },
          markerEnd: { type: MarkerType.ArrowClosed, color: edgeStyle(assetId, scene.id, C_ASSET) },
          ...edgeLabels('asset', C_ASSET, onEdge),
        });
      }
    }

    if (hasOutput && visible(oid)) {
      nodes.push({
        id: oid,
        type: 'output',
        position: pos(oid),
        data: { sceneId: scene.id, label: 'output', workflowStyle: workflowStyle(oid) },
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
            stroke: edgeStyle(scene.id, oid, scene.status === 'completed'
              ? C_OUTPUT_OK
              : scene.status === 'failed'
                ? C_OUTPUT_FAIL
                : C_OUTPUT_ACTIVE),
            strokeWidth: 2,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: edgeStyle(scene.id, oid, scene.status === 'completed' ? C_OUTPUT_OK : scene.status === 'failed' ? C_OUTPUT_FAIL : C_OUTPUT_ACTIVE),
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
        style: { stroke: edgeStyle(scene.id, nextScene.id, FLOW_STROKE), strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: edgeStyle(scene.id, nextScene.id, FLOW_STROKE) },
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

  if (allScenesReadyForFinalOutput(scenes) && visible(finalOutputNodeId)) {
    nodes.push({
      id: finalOutputNodeId,
      type: 'output',
      position: pos(finalOutputNodeId),
      data: { final: true, label: 'final output', workflowStyle: workflowStyle(finalOutputNodeId) },
    });

    scenes.forEach((scene) => {
      const oid = outputNodeId(scene.id);
      if (!link(oid, finalOutputNodeId)) return;
      edges.push({
        id: `e-final-${oid}`,
        source: oid,
        sourceHandle: 'output-out',
        target: finalOutputNodeId,
        targetHandle: 'output-in',
        type: 'smoothstep',
        style: { stroke: edgeStyle(oid, finalOutputNodeId, C_OUTPUT_OK), strokeWidth: 2, opacity: 0.9 },
        markerEnd: { type: MarkerType.ArrowClosed, color: edgeStyle(oid, finalOutputNodeId, C_OUTPUT_OK) },
        ...edgeLabels('timeline', C_OUTPUT_OK, onEdge),
      });
    });
  }

  return { nodes, edges };
}
