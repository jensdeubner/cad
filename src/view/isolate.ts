/**
 * Isolate controller — Fusion "Isolate": show only the active body, hide all
 * others; calling again restores the previously remembered visibility.
 *
 * Pure scene-state controller: snapshots each body's `visible` flag, then hides
 * every body except `host.getActiveBody()` by setting both the record flag and
 * its `meshGroup.visible` mirror (the convention `main.ts` uses). Restoring
 * re-applies the snapshot exactly. Keyed on the stable `host.cadScene`
 * singleton so repeated `makeFeatureHost()` calls share one controller and one
 * consistent isolated state. Never throws with zero or one body.
 */
import type { FeatureHost } from '../features/host';
import type { CadBodyRecord } from '../cad-scene';

export interface IsolateController {
  /** Toggle isolate on/off; returns the new isolated state. */
  toggle(): boolean;
  /** Current state: true = isolated (only active body shown). */
  isIsolated(): boolean;
  /** Number of bodies hidden by the current isolation (0 when not isolated). */
  hiddenCount(): number;
}

/**
 * Mirror a body's `visible` record flag onto its mesh group (main.ts convention),
 * composed with the #30 timeline rollback gate so a suppressed body stays hidden.
 */
function setBodyVisible(body: CadBodyRecord, visible: boolean, suppressed = false): void {
  body.visible = visible;
  if (body.meshGroup) body.meshGroup.visible = visible && !suppressed;
}

/** One controller per CadScene singleton. */
const controllers = new WeakMap<object, IsolateController>();

/**
 * Return the isolate controller bound to this host's CadScene singleton,
 * creating it on first use. Never throws with zero or one body.
 */
export function createIsolateController(host: FeatureHost): IsolateController {
  const key = host.cadScene as unknown as object;
  const existing = controllers.get(key);
  if (existing) return existing;

  let isolated = false;
  let hidden = 0;
  // Remembered per-body visibility from the moment isolation began.
  let saved: Map<string, boolean> | null = null;

  const controller: IsolateController = {
    toggle(): boolean {
      if (!isolated) {
        const active = host.getActiveBody();
        const snapshot = new Map<string, boolean>();
        let hiddenNow = 0;
        for (const body of host.getBodies()) {
          snapshot.set(body.id, body.visible);
          const keep = active != null && body.id === active.id;
          if (!keep && body.visible) hiddenNow += 1;
          setBodyVisible(body, keep, host.isTimelineSuppressed(body.id));
        }
        saved = snapshot;
        hidden = hiddenNow;
        isolated = true;
      } else {
        if (saved) {
          for (const body of host.getBodies()) {
            const was = saved.get(body.id);
            // Bodies created while isolated have no snapshot — leave them shown.
            setBodyVisible(body, was ?? true, host.isTimelineSuppressed(body.id));
          }
        }
        saved = null;
        hidden = 0;
        isolated = false;
      }
      return isolated;
    },
    isIsolated(): boolean {
      return isolated;
    },
    hiddenCount(): number {
      return hidden;
    },
  };

  controllers.set(key, controller);
  return controller;
}
