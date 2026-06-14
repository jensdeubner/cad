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
  for (const body of host.getBodies()) {
    if (body.meshGroup) return body.meshGroup.visible;
  }
  return true;
}

/** Apply a visible flag to every body's mesh group. */
function applyVisible(host: FeatureHost, visible: boolean): void {
  for (const body of host.getBodies()) {
    if (body.meshGroup) body.meshGroup.visible = visible;
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
