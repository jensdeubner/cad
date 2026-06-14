/**
 * Parametric primitive solids (box / cylinder / sphere).
 *
 * Pure geometry builders — no DOM, no scene. Reference domain module for the
 * feature-registry seam (see `src/features/solid-primitives.ts`).
 */
import * as THREE from 'three';

export type PrimitiveKind = 'box' | 'cylinder' | 'sphere';

export interface PrimitiveOptions {
  /** Edge length (box) or characteristic size in mm. */
  size?: number;
}

/** Build a centered primitive geometry in millimetres. */
export function makePrimitiveGeometry(
  kind: PrimitiveKind,
  opts: PrimitiveOptions = {},
): THREE.BufferGeometry {
  const s = opts.size && opts.size > 0 ? opts.size : 20;
  switch (kind) {
    case 'box':
      return new THREE.BoxGeometry(s, s, s);
    case 'cylinder':
      return new THREE.CylinderGeometry(s * 0.5, s * 0.5, s * 1.2, 48);
    case 'sphere':
      return new THREE.SphereGeometry(s * 0.6, 48, 32);
  }
}
