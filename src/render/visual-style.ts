/**
 * Visual-style controller — Fusion "Visual Styles": toggle every body between
 * shaded and wireframe display.
 *
 * Pure render-state controller: walks each body's `meshGroup` for Mesh objects
 * and flips `material.wireframe` (handling material arrays) across all of them.
 * Keyed on the stable `host.cadScene` singleton so repeated `makeFeatureHost()`
 * calls share one controller instance and one consistent mode.
 */
import type { FeatureHost } from '../features/host';

export interface VisualStyleController {
  /** Flip wireframe on/off across all bodies; returns the new mode (true = wireframe). */
  toggle(): boolean;
  /** Current mode: true = wireframe, false = shaded. */
  isWireframe(): boolean;
}

interface WireMaterial {
  wireframe?: boolean;
}

/** Apply a wireframe flag to a single material or an array of materials. */
function applyToMaterial(material: unknown, wireframe: boolean): void {
  if (!material) return;
  if (Array.isArray(material)) {
    for (const m of material) {
      if (m && typeof m === 'object') (m as WireMaterial).wireframe = wireframe;
    }
    return;
  }
  if (typeof material === 'object') (material as WireMaterial).wireframe = wireframe;
}

/**
 * Set the wireframe flag on every Mesh material under all bodies. A "Mesh" is
 * detected structurally (has an `isMesh` flag + a `material`) so we don't pin a
 * three.js class and stay robust to the shared instance.
 */
function applyMode(host: FeatureHost, wireframe: boolean): void {
  for (const body of host.getBodies()) {
    const group = body.meshGroup;
    if (!group) continue;
    group.traverse((obj: unknown) => {
      const o = obj as { isMesh?: boolean; material?: unknown };
      if (o && o.isMesh) applyToMaterial(o.material, wireframe);
    });
  }
}

/** One controller per CadScene singleton. */
const controllers = new WeakMap<object, VisualStyleController>();

/**
 * Return the visual-style controller bound to this host's CadScene singleton,
 * creating it on first use. Never throws with zero bodies.
 */
export function createVisualStyleController(host: FeatureHost): VisualStyleController {
  const key = host.cadScene as unknown as object;
  const existing = controllers.get(key);
  if (existing) return existing;

  let wireframe = false;

  const controller: VisualStyleController = {
    toggle(): boolean {
      wireframe = !wireframe;
      applyMode(host, wireframe);
      return wireframe;
    },
    isWireframe(): boolean {
      return wireframe;
    },
  };

  controllers.set(key, controller);
  return controller;
}
