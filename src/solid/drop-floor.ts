/**
 * Drop-to-floor geometry helper.
 *
 * Pure geometry: translate a body's geometry down (along Z) so its minimum Z
 * sits exactly on the Z=0 ground plane — handy before export / 3D printing so a
 * part rests on the build plate. No DOM, no scene.
 */
import * as THREE from 'three';

export interface DropToFloorResult {
  /** A NEW geometry whose min.z === 0 (within float precision). */
  geometry: THREE.BufferGeometry;
  /** The Z translation that was applied (i.e. `-originalMin.z`). */
  dz: number;
}

/**
 * Return a NEW geometry translated by `-min.z` in Z so the result's minimum Z
 * lands on the Z=0 plane, plus the applied `dz`.
 *
 * Empty geometry (no positions) is left untouched and reported with `dz = 0`.
 */
export function dropToFloor(geometry: THREE.BufferGeometry): DropToFloorResult {
  const out = geometry.clone();
  const posAttr = out.getAttribute('position');

  if (!posAttr || posAttr.count === 0) {
    return { geometry: out, dz: 0 };
  }

  out.computeBoundingBox();
  const minZ = out.boundingBox ? out.boundingBox.min.z : 0;
  const dz = -minZ;

  if (dz !== 0) {
    out.translate(0, 0, dz);
    out.computeBoundingBox();
  }

  return { geometry: out, dz };
}
