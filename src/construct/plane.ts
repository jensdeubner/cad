/**
 * Offset construction plane (#16) — pure offset math.
 *
 * The sketch model already carries a `position` (offset along the plane
 * normal), so a construction plane is realised as an offset origin-plane sketch
 * the user can immediately draw on. This module only decides a sensible offset.
 */
import type { FeatureHost } from '../features/host';
import type { PlaneAxis } from '../types';

/** Which world axis a plane's normal points along. */
export const PLANE_NORMAL_AXIS: Record<PlaneAxis, 'x' | 'y' | 'z'> = {
  xy: 'z',
  xz: 'y',
  yz: 'x',
};

/**
 * A sensible construction-plane offset: just above the active body along the
 * plane normal (`max + margin`), or a plain default when nothing is loaded.
 */
export function offsetForActivePlane(host: FeatureHost, axis: PlaneAxis, margin = 10, fallback = 20): number {
  const body = host.getActiveBody();
  const geom = body?.geometry;
  if (!body || !geom) return fallback;
  geom.computeBoundingBox();
  const bb = geom.boundingBox;
  if (!bb) return fallback;
  body.meshGroup.updateMatrixWorld(true);
  const box = bb.clone().applyMatrix4(body.meshGroup.matrixWorld);
  const max = box.max[PLANE_NORMAL_AXIS[axis]];
  return Number.isFinite(max) ? max + margin : fallback;
}
