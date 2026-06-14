/**
 * Feature registry — the decoupling seam (PR0).
 *
 * Feature modules call `registerFeature()` at import time; `main.ts` calls
 * `mountFeatures(getFeatures(), host)` once, after wasm init. Adding a feature
 * is then: one new module + one append line in `features/index.ts` + an i18n
 * block. No edits to `main.ts`, `index.html`, or `solid-features.ts`.
 */
import type { FusionTab } from '../app-menu';
import type { FeatureHost } from './host';

export interface FeatureDef {
  /** Stable unique id, used as `data-feature` and by `__cadDebug`. */
  id: string;
  /** Ribbon tab to mount into (must match a `.ribbon-workspace[data-ribbon]`). */
  tab: FusionTab;
  /** i18n key for the ribbon-group label this button is collected under. */
  group: string;
  /** i18n key for the button label. */
  labelKey: string;
  /** Glyph shown in the button. */
  icon?: string;
  /** Highlight as the primary action of its group. */
  primary?: boolean;
  /** Starts the command. May be async; errors are caught by the mounter. */
  run: (host: FeatureHost) => void | Promise<void>;
}

const REGISTRY: FeatureDef[] = [];
const seen = new Set<string>();

/** Register a feature. Duplicate ids are ignored (idempotent re-import safe). */
export function registerFeature(def: FeatureDef): void {
  if (seen.has(def.id)) return;
  seen.add(def.id);
  REGISTRY.push(def);
}

/** All registered features, in registration order. */
export function getFeatures(): FeatureDef[] {
  return REGISTRY.slice();
}

/** Look up a single feature by id. */
export function getFeature(id: string): FeatureDef | undefined {
  return REGISTRY.find((f) => f.id === id);
}
