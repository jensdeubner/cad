/**
 * Bounding-sphere body geometry builder.
 *
 * Pure geometry: given a world-space center and radius, build a SphereGeometry
 * of that radius translated to the center. Handy as a hull / clearance sphere
 * around an existing body. No DOM, no scene.
 */
import * as THREE from 'three';

/** Smallest radius we still treat as a real sphere (mm) — guards degenerate input. */
const MIN_RADIUS = 1e-4;

/**
 * Build a sphere geometry of `radius` centered at `center` (world space).
 *
 * A non-positive radius is clamped to a tiny positive fallback so a degenerate
 * input still yields a valid, non-NaN SphereGeometry instead of empty buffers.
 */
export function sphereGeometryForBounds(
  center: THREE.Vector3,
  radius: number,
): THREE.BufferGeometry {
  const r = radius > 0 ? radius : MIN_RADIUS;

  const geom = new THREE.SphereGeometry(r, 48, 32);
  // SphereGeometry is centered at the origin; shift it to the requested center.
  geom.translate(center.x, center.y, center.z);
  geom.computeBoundingSphere();
  return geom;
}
