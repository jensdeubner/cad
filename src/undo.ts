import * as THREE from 'three';
import { cloneHandle } from './contour-spline';
import type { BodyKind } from './body-kind';
import type { BodyTransform } from './cad-body';
import { cloneSketchDimension, type SketchDimension } from './sketch-dimension';
import { cloneSketchConstraint, type SketchConstraint } from './sketch/sketch-constraints';
import type { Sketch } from './sketch';
import type { Contour } from './types';
import { type FeatureRecipe, cloneFeatureRecipe } from './feature-recipe';

export interface AppSnapshot {
  contours: Contour[];
  activeDraft: Contour | null;
  alignment: BodyTransform;
  bodyTransforms: Record<string, BodyTransform>;
  /** Gesetzt bei Mesh-Bearbeitung — tiefe Kopie der STL-Puffer */
  bodyMeshBuffers?: Record<string, ArrayBuffer>;
  bodyKinds?: Record<string, BodyKind>;
  sketches: Sketch[];
  sketchDimensions: SketchDimension[];
  sketchConstraints: SketchConstraint[];
  featureRecipes?: FeatureRecipe[];
  activeSketchId: string | null;
}

export interface TimelineStep {
  label: string;
}

export interface TimelineView {
  steps: TimelineStep[];
  /** 0 = Start, n = nach n Schritten */
  position: number;
  canUndo: boolean;
  canRedo: boolean;
}

interface HistoryEntry {
  label: string;
  snapshot: AppSnapshot;
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
  bodyKinds?: Record<string, BodyKind>,
  sketches: Sketch[] = [],
  activeSketchId: string | null = null,
  sketchDimensions: SketchDimension[] = [],
  sketchConstraints: SketchConstraint[] = [],
  featureRecipes: FeatureRecipe[] = [],
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
  const kinds: Record<string, BodyKind> | undefined = bodyKinds
    ? Object.fromEntries(Object.entries(bodyKinds).map(([id, k]) => [id, k]))
    : undefined;
  return {
    contours: contours.map(cloneContour),
    activeDraft: activeDraft ? cloneContour(activeDraft) : null,
    alignment: { ...alignment },
    bodyTransforms: transforms,
    bodyMeshBuffers: meshBuffers,
    bodyKinds: kinds,
    sketches: sketches.map((s) => ({ ...s })),
    sketchDimensions: sketchDimensions.map(cloneSketchDimension),
    sketchConstraints: sketchConstraints.map(cloneSketchConstraint),
    featureRecipes: featureRecipes.map(cloneFeatureRecipe),
    activeSketchId,
  };
}

/** Snapshot-basierte Undo/Redo-Historie mit Fusion-ähnlicher Schrittliste. */
export class UndoHistory {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private labels: string[] = [];
  private position = 0;
  private readonly max: number;

  constructor(max = 80) {
    this.max = max;
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this.labels = [];
    this.position = 0;
  }

  push(snapshot: AppSnapshot, label = 'Änderung') {
    this.undoStack.push({ snapshot, label });
    this.labels = this.labels.slice(0, this.position);
    this.labels.push(label);
    this.position = this.labels.length;
    this.redoStack = [];
    while (this.undoStack.length > this.max) {
      this.undoStack.shift();
      if (this.labels.length > 0) this.labels.shift();
      this.position = Math.max(0, this.position - 1);
    }
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  /** Ein Schritt zurück; gibt den wiederherzustellenden Snapshot zurück. */
  takeUndo(current: AppSnapshot): AppSnapshot | null {
    if (!this.canUndo()) return null;
    const entry = this.undoStack.pop()!;
    this.position = Math.max(0, this.position - 1);
    this.redoStack.push({ snapshot: current, label: entry.label });
    return entry.snapshot;
  }

  /** Ein Schritt vor; gibt den wiederherzustellenden Snapshot zurück. */
  takeRedo(current: AppSnapshot): AppSnapshot | null {
    if (!this.canRedo()) return null;
    const entry = this.redoStack.pop()!;
    this.position = Math.min(this.labels.length, this.position + 1);
    this.undoStack.push({ snapshot: current, label: entry.label });
    return entry.snapshot;
  }

  getTimeline(): TimelineView {
    return {
      steps: this.labels.map((label) => ({ label })),
      position: this.position,
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
    };
  }
}