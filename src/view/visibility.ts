/**
 * Object-visibility controller — Fusion "Inspect / Show-Hide Bodies" parity:
 * toggle the visibility of every body in the scene at once.
 *
 * Pure scene-state controller: flips `body.meshGroup.visible` across all
 * bodies. Keyed on the stable `host.cadScene` singleton (NOT the host object —
 * `makeFeatureHost()` returns a fresh host each call) so repeated calls share
 * one controller instance and one consistent visible/hidden mode.
 */
import type { FeatureHost } from '../features/host';

export interface VisibilityController {
  /**
   * Flip `meshGroup.visible` on every body; returns the new state
   * (true = visible, false = hidden). Idempotent across hosts, never throws
   * with zero bodies.
   */
  toggleBodies(): boolean;
  /** Current state: true = bodies shown, false = bodies hidden. */
  bodiesVisible(): boolean;
}

/**
 * Read the current visibility from the first body found, so the controller
 * self-heals after a project reload (which rebuilds mesh groups as visible).
 * Returns true when there are no bodies (default "shown").
 */
function detectVisible(host: FeatureHost): boolean {
  const bodies = host.getBodies();
  return bodies.length === 0 ? true : bodies[0].visible;
}

/**
 * Apply a visible flag to every body. Sets the logical `visible` flag (user
 * intent) and mirrors it onto the mesh group, composed with the timeline
 * rollback gate so a suppressed body stays hidden.
 */
function applyVisible(host: FeatureHost, visible: boolean): void {
  for (const body of host.getBodies()) {
    body.visible = visible;
    if (body.meshGroup) body.meshGroup.visible = visible && !host.isTimelineSuppressed(body.id);
  }
}

/** One controller per CadScene singleton. */
const controllers = new WeakMap<object, VisibilityController>();

/**
 * Return the visibility controller bound to this host's CadScene singleton,
 * creating it on first use. Never throws with zero bodies.
 */
export function createVisibilityController(host: FeatureHost): VisibilityController {
  const key = host.cadScene as unknown as object;
  const existing = controllers.get(key);
  if (existing) return existing;

  let visible = true;

  const controller: VisibilityController = {
    toggleBodies(): boolean {
      // Flip relative to the ACTUAL mesh-group state so we self-heal after a
      // project reload reset visibility behind our back.
      visible = !detectVisible(host);
      applyVisible(host, visible);
      return visible;
    },
    bodiesVisible(): boolean {
      return visible;
    },
  };

  controllers.set(key, controller);
  return controller;
}
