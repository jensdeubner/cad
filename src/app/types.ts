/**
 * Cross-domain TypeScript types that were previously inline in main.ts.
 */
import type * as THREE from 'three';
import type { SketchEdgePick } from '../sketch-dimension';

/** Active press-pull drag on a body mesh. */
export type MeshEditDrag = {
  tool: 'press-pull';
  bodyId: string;
  center: THREE.Vector3;
  normal: THREE.Vector3;
  startClientY: number;
  basePositions: Float32Array;
};

/** Smooth-body paint session (optionally limited to a section band). */
export type SmoothPaintSession = {
  bodyId: string;
  undoPushed: boolean;
  sectionOrigin?: THREE.Vector3;
  sectionNormal?: THREE.Vector3;
};

/** Sketch primitive drag (line / circle / rect) or multi-click (arc / triangle). */
export type SketchInteraction =
  | { mode: 'drag'; tool: 'sketch-line' | 'sketch-circle' | 'sketch-rect'; start: THREE.Vector3 }
  | { mode: 'clicks'; tool: 'sketch-arc' | 'sketch-triangle'; points: THREE.Vector3[] };

/** In-progress dimension placement (edge pick → drag offset → value entry). */
export type DimSession = {
  edge: SketchEdgePick;
  offset: number;
  phase: 'drag' | 'value';
  /** When set, applyPendingValue updates this dimension instead of creating a new one. */
  editingId?: string;
};