/**
 * Maßstab (Scale by factor) — pure geometry helper.
 *
 * Uniformly scales a mesh about a center point (its bounding-box center by
 * default) by a single factor. No DOM, no scene — just buffer math on a
 * THREE.BufferGeometry. Domain module for the feature-registry seam
 * (see `src/features/solid-scale-factor.ts`).
 */
import * as THREE from 'three';

/**
 * Return a NEW geometry whose vertex positions are uniformly scaled by
 * `factor` about `center`. If `center` is omitted it defaults to the input
 * geometry's bounding-box center, so a body grows/shrinks in place without
 * drifting. Vertex normals are recomputed; the input geometry is left
 * untouched. A non-positive `factor` is rejected (a degenerate or mirrored
 * scale makes no sense for "scale up by a factor").
 */
export function scaleGeometry(
  geometry: THREE.BufferGeometry,
  factor: number,
  center?: THREE.Vector3,
): THREE.BufferGeometry {
  if (!Number.isFinite(factor) || factor <= 0) {
    throw new Error(`scaleGeometry: factor must be a positive number, got ${factor}`);
  }

  const out = geometry.clone();

  // Resolve the pivot: explicit center, else the input's bbox center.
  let pivot: THREE.Vector3;
  if (center) {
    pivot = center;
  } else {
    out.computeBoundingBox();
    pivot = new THREE.Vector3();
    out.boundingBox?.getCenter(pivot);
  }

  const pos = out.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (!pos || pos.count === 0) return out; // nothing to scale (empty geometry)
  for (let i = 0; i < pos.count; i++) {
    const x = (pos.getX(i) - pivot.x) * factor + pivot.x;
    const y = (pos.getY(i) - pivot.y) * factor + pivot.y;
    const z = (pos.getZ(i) - pivot.z) * factor + pivot.z;
    pos.setXYZ(i, x, y, z);
  }
  pos.needsUpdate = true;

  // Positions moved → bbox + normals are stale.
  out.computeBoundingBox();
  out.computeBoundingSphere();
  out.computeVertexNormals();
  return out;
}
