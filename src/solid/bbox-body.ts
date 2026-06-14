/**
 * Bounding-box body geometry builder.
 *
 * Pure geometry: given a world-space min/max corner pair, build a BoxGeometry
 * sized `max - min` and translated so it spans exactly `min..max`. Handy for
 * stock / packaging volumes around an existing body. No DOM, no scene.
 */
import * as THREE from 'three';

/** Smallest extent we still treat as a real edge (mm) — guards degenerate boxes. */
const MIN_EXTENT = 1e-4;

/**
 * Build an axis-aligned box geometry that spans `min..max`.
 *
 * Each axis extent is clamped to a tiny positive value so a flat (zero-extent)
 * bounding box still yields a valid, non-degenerate BoxGeometry instead of
 * NaN-laden buffers.
 */
export function boxGeometryForBounds(
  min: THREE.Vector3,
  max: THREE.Vector3,
): THREE.BufferGeometry {
  const sx = Math.max(max.x - min.x, MIN_EXTENT);
  const sy = Math.max(max.y - min.y, MIN_EXTENT);
  const sz = Math.max(max.z - min.z, MIN_EXTENT);

  const geom = new THREE.BoxGeometry(sx, sy, sz);
  // BoxGeometry is centered at the origin; shift its center to the box center
  // so the geometry spans exactly min..max in world space.
  geom.translate(min.x + sx / 2, min.y + sy / 2, min.z + sz / 2);
  geom.computeBoundingBox();
  return geom;
}
