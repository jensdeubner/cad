import * as THREE from 'three';
import { cloneHandle } from './contour-spline';
import type { BodyTransform } from './cad-body';
import { cloneSketchDimension, type SketchDimension } from './sketch-dimension';
import type { Sketch } from './sketch';
import type { Contour } from './types';

export interface AppSnapshot {
  contours: Contour[];
  activeDraft: Contour | null;
  alignment: BodyTransform;
  bodyTransforms: Record<string, BodyTransform>;
  /** Gesetzt bei Mesh-Bearbeitung — tiefe Kopie der STL-Puffer */
  bodyMeshBuffers?: Record<string, ArrayBuffer>;
  sketches: Sketch[];
  sketchDimensions: SketchDimension[];
  activeSketchId: string | null;
}

export function cloneContour(c: Contour): Contour {
  return {
    id: c.id,
    axis: c.axis,
    position: c.position,
    closed: c.closed,
    color: c.color,
    visible: c.visible !== false,
    componentId: c.componentId,
    sketchId: c.sketchId ?? null,
    attachedToBodyId: c.attachedToBodyId ?? null,
    points: c.points.map((p) => p.clone()),
    pointTypes: c.pointTypes ? [...c.pointTypes] : undefined,
    handles: c.handles ? c.handles.map((h) => cloneHandle(h)) : undefined,
  };
}

export function captureSnapshot(
  contours: Contour[],
  activeDraft: Contour | null,
  alignment: BodyTransform,
  bodyTransforms: Record<string, BodyTransform>,
  bodyMeshBuffers?: Record<string, ArrayBuffer>,
  sketches: Sketch[] = [],
  activeSketchId: string | null = null,
  sketchDimensions: SketchDimension[] = [],
): AppSnapshot {
  const transforms: Record<string, BodyTransform> = {};
  for (const [id, t] of Object.entries(bodyTransforms)) {
    transforms[id] = { ...t };
  }
  const meshBuffers: Record<string, ArrayBuffer> | undefined = bodyMeshBuffers
    ? Object.fromEntries(
        Object.entries(bodyMeshBuffers).map(([id, buf]) => [id, buf.slice(0)]),
      )
    : undefined;
  return {
    contours: contours.map(cloneContour),
    activeDraft: activeDraft ? cloneContour(activeDraft) : null,
    alignment: { ...alignment },
    bodyTransforms: transforms,
    bodyMeshBuffers: meshBuffers,
    sketches: sketches.map((s) => ({ ...s })),
    sketchDimensions: sketchDimensions.map(cloneSketchDimension),
    activeSketchId,
  };
}

export class UndoHistory {
  private stack: AppSnapshot[] = [];
  private redoStack: AppSnapshot[] = [];
  private readonly max: number;

  constructor(max = 80) {
    this.max = max;
  }

  clear() {
    this.stack = [];
    this.redoStack = [];
  }

  push(snapshot: AppSnapshot) {
    this.stack.push(snapshot);
    if (this.stack.length > this.max) this.stack.shift();
    this.redoStack = [];
  }

  canUndo() {
    return this.stack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  popUndo(): AppSnapshot | null {
    return this.stack.pop() ?? null;
  }

  pushRedo(snapshot: AppSnapshot) {
    this.redoStack.push(snapshot);
  }

  popRedo(): AppSnapshot | null {
    return this.redoStack.pop() ?? null;
  }
}