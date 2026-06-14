/**
 * Core domain types shared across sketch, contour, and tool routing.
 */
import type * as THREE from 'three';

/** Work-plane orientation for contours and sketches. */
export type PlaneAxis = 'xy' | 'xz' | 'yz';
export type Tool =
  | 'navigate'
  | 'align'
  | 'move-body'
  | 'scale-body'
  | 'press-pull'
  | 'smooth-body'
  | 'smooth-section'
  | 'sketch-pick'
  | 'sketch-line'
  | 'sketch-circle'
  | 'sketch-arc'
  | 'sketch-rect'
  | 'sketch-triangle'
  | 'sketch-dim'
  | 'sketch-constraint'
  | 'polyline'
  | 'freehand'
  | 'lasso'
  | 'edit';
export type ContourPointType = 'corner' | 'smooth' | 'curve';

export interface ContourHandle {
  in: THREE.Vector3;
  out: THREE.Vector3;
}

export interface Contour {
  id: string;
  /** Zugehörige Komponente (Fusion-Style) */
  componentId: string;
  /** Skizze auf Ursprungsebene (Fusion-Style) */
  sketchId?: string | null;
  axis: PlaneAxis;
  position: number;
  points: THREE.Vector3[];
  closed: boolean;
  color: string;
  visible: boolean;
  /** Körper-ID — Kontur im Körper-Lokalraum (bewegt sich mit Objekt); null = Welt */
  attachedToBodyId?: string | null;
  pointTypes?: ContourPointType[];
  handles?: (ContourHandle | null)[];
}