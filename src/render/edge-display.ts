/**
 * Edge-display controller — Fusion "Visual Styles → Shaded with Edges":
 * toggle a sharp-edge outline overlay for every body.
 *
 * Pure render-state controller: builds one `THREE.LineSegments(EdgesGeometry)`
 * per body from the body's own `geometry`, positions it at the body's world
 * matrix and parks it in the shared `host.overlay` group (tagged
 * `userData.edgeOverlay = true`). Toggling off removes + disposes every tagged
 * object. Keyed on the stable `host.cadScene` singleton so repeated
 * `makeFeatureHost()` calls share one controller instance and one mode.
 */
import type * as THREE from 'three';
import type { FeatureHost } from '../features/host';

export interface EdgeDisplayController {
  /** Build (off → on) or remove (on → off) the edge overlay; returns the new mode. */
  toggle(): boolean;
  /** Current mode: true = edges shown. */
  isOn(): boolean;
}

/** Dihedral angle (deg) above which an edge counts as "sharp" — Fusion-like. */
const EDGE_ANGLE = 30;

/** Remove + dispose every edge-overlay object currently in `host.overlay`. */
function clearEdges(host: FeatureHost): void {
  const overlay = host.overlay;
  const tagged = overlay.children.filter(
    (o) => (o.userData as { edgeOverlay?: boolean }).edgeOverlay === true,
  );
  for (const obj of tagged) {
    overlay.remove(obj);
    const seg = obj as THREE.LineSegments;
    seg.geometry?.dispose();
    const mat = seg.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) {
      for (const m of mat) m?.dispose();
    } else {
      mat?.dispose();
    }
  }
}

/** Build one LineSegments outline per body (with geometry) into `host.overlay`. */
function buildEdges(host: FeatureHost): void {
  const THREE = host.THREE;
  for (const body of host.getBodies()) {
    const geometry = body.geometry;
    if (!geometry) continue;
    const edges = new THREE.EdgesGeometry(geometry, EDGE_ANGLE);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x202020 });
    const seg = new THREE.LineSegments(edges, lineMat);
    // Park the outline in world space at the body's full root→comp→body pose.
    // getBodyWorldMatrix reuses a shared buffer, so apply it directly into the
    // object's matrix and clone via decompose (we never re-read the buffer).
    const wm = host.cadScene.getBodyWorldMatrix(body.id);
    seg.matrixAutoUpdate = false;
    seg.matrix.copy(wm);
    seg.userData.edgeOverlay = true;
    host.overlay.add(seg);
  }
}

/** One controller per CadScene singleton. */
const controllers = new WeakMap<object, EdgeDisplayController>();

/**
 * Return the edge-display controller bound to this host's CadScene singleton,
 * creating it on first use. Never throws with zero bodies.
 */
export function createEdgeDisplayController(host: FeatureHost): EdgeDisplayController {
  const key = host.cadScene as unknown as object;
  const existing = controllers.get(key);
  if (existing) return existing;

  let on = false;

  const controller: EdgeDisplayController = {
    toggle(): boolean {
      if (on) {
        clearEdges(host);
        on = false;
      } else {
        buildEdges(host);
        on = true;
      }
      return on;
    },
    isOn(): boolean {
      return on;
    },
  };

  controllers.set(key, controller);
  return controller;
}
