/**
 * cad-script · view framing for `render_view` (§3 visual feedback)
 *
 * The architecture doc keeps vision *secondary* for Track A (deterministic
 * validation dominates) but *necessary* for Track B (organic incoherence —
 * floating/detached blobs — is only visible). Either way the agent needs
 * standard, repeatable camera framings. This module is the pure math: given a
 * model's bounds and a named view, where does the camera go to frame it?
 *
 * The actual pixel capture lives in the feature (it owns `host.renderer`); this
 * stays headless-testable.
 */
import type { Bounds, Vec3 } from './mesh';

export type ViewName = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | 'iso';

/** Camera direction (from target toward eye) and up-vector per named view. */
const VIEW_DIRS: Record<ViewName, { dir: Vec3; up: Vec3 }> = {
  front: { dir: [0, -1, 0], up: [0, 0, 1] },
  back: { dir: [0, 1, 0], up: [0, 0, 1] },
  left: { dir: [-1, 0, 0], up: [0, 0, 1] },
  right: { dir: [1, 0, 0], up: [0, 0, 1] },
  top: { dir: [0, 0, 1], up: [0, 1, 0] },
  bottom: { dir: [0, 0, -1], up: [0, 1, 0] },
  iso: { dir: [1, -1, 1], up: [0, 0, 1] },
};

export interface CameraFraming {
  view: ViewName;
  eye: Vec3;
  target: Vec3;
  up: Vec3;
  /** Eye→target distance. */
  distance: number;
}

function norm(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/**
 * Position a camera so `bounds` fills the frame for the given view.
 * @param fovDeg vertical field of view in degrees (perspective camera)
 * @param margin extra distance factor (1.2 = 20 % padding)
 */
export function frameView(
  bounds: Bounds,
  view: ViewName,
  fovDeg = 35,
  margin = 1.25,
): CameraFraming {
  const target = bounds.center;
  const radius = 0.5 * Math.hypot(bounds.size[0], bounds.size[1], bounds.size[2]) || 1;
  const fov = (fovDeg * Math.PI) / 180;
  const distance = (radius / Math.sin(fov / 2)) * margin;
  const d = norm(VIEW_DIRS[view].dir);
  return {
    view,
    target,
    up: VIEW_DIRS[view].up,
    distance,
    eye: [target[0] + d[0] * distance, target[1] + d[1] * distance, target[2] + d[2] * distance],
  };
}

/** Frame several views at once (default: a useful triplet). */
export function frameViews(
  bounds: Bounds,
  views: ViewName[] = ['front', 'top', 'iso'],
  fovDeg = 35,
): CameraFraming[] {
  return views.map((v) => frameView(bounds, v, fovDeg));
}
