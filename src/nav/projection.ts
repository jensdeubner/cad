/**
 * Pure projection math for the perspective ⇄ orthographic camera toggle.
 *
 * No three.js, no DOM — just the geometry of matching an orthographic frustum
 * to a perspective camera's framing at a given pivot distance, so toggling the
 * projection keeps the model the same on-screen size. Unit-tested.
 */

/** Minimum positive guard so a degenerate input can never produce 0 / NaN. */
const MIN = 1e-3;

/**
 * Half-width / half-height of an orthographic frustum that reproduces a
 * perspective camera's vertical field of view at `distance` from the pivot.
 *
 *   halfH = distance · tan(fov / 2);  halfW = halfH · aspect
 *
 * All inputs are sanitised (non-finite / non-positive → MIN) so the result is
 * always finite and strictly positive.
 */
export function orthoHalfExtents(
  fovDeg: number,
  aspect: number,
  distance: number,
): { halfW: number; halfH: number } {
  const fov = (Math.max(MIN, Number.isFinite(fovDeg) ? fovDeg : MIN) * Math.PI) / 180;
  const dist = Math.max(MIN, Number.isFinite(distance) ? distance : MIN);
  const asp = Math.max(MIN, Number.isFinite(aspect) ? aspect : 1);
  const halfH = dist * Math.tan(fov / 2);
  const halfW = halfH * asp;
  return { halfW, halfH };
}
