/**
 * Auf Größe skalieren (Scale to size) — pure geometry helper.
 *
 * Uniformly scales a mesh so that its LARGEST bounding-box dimension equals a
 * target size, scaling about the bbox center so the body stays put. No DOM, no
 * scene — just buffer math on a THREE.BufferGeometry. Domain module for the
 * feature-registry seam (see `src/features/solid-scale-to-size.ts`).
 */
import * as THREE from 'three';

/**
 * Return a NEW geometry uniformly scaled so its largest bounding-box extent
 * equals `targetMax` (mm), about the input's bbox center. The scale factor is
 * `targetMax / currentMaxDim`. Vertex normals are recomputed; the input
 * geometry is left untouched.
 *
 * Empty geometry (no positions) or a degenerate body whose largest extent is
 * effectively zero is returned as an unchanged clone (no sensible factor
 * exists), as is a non-positive / non-finite `targetMax`.
 */
export function scaleToMaxSize(
  geometry: THREE.BufferGeometry,
  targetMax: number,
): THREE.BufferGeometry {
  const out = geometry.clone();

  const pos = out.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (!pos || pos.count === 0) return out; // empty geometry → nothing to scale

  out.computeBoundingBox();
  const box = out.boundingBox;
  if (!box) return out;

  const size = new THREE.Vector3();
  box.getSize(size);
  const currentMaxDim = Math.max(size.x, size.y, size.z);

  // No sensible factor for a zero-size body or a non-positive target.
  if (currentMaxDim <= 1e-9 || !Number.isFinite(targetMax) || targetMax <= 0) {
    return out;
  }

  const factor = targetMax / currentMaxDim;

  // Pivot = bbox center, so the body grows/shrinks in place without drifting.
  const pivot = new THREE.Vector3();
  box.getCenter(pivot);

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
