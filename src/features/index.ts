/**
 * Feature barrel — importing this module triggers every feature's
 * `registerFeature()` side-effect. `main.ts` imports `./features` once.
 *
 * Each feature agent appends EXACTLY ONE import line directly above the
 * `// @features:append` marker. Never reorder existing lines — append only,
 * so parallel branches auto-merge.
 */
import './solid-primitives';
import './nav-views';
// @features:append

export { getFeatures, registerFeature, getFeature } from './registry';
export { mountFeatures } from './mount';
export type { FeatureDef } from './registry';
export type { FeatureHost } from './host';
