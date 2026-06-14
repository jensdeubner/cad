/**
 * Feature barrel — importing this module triggers every feature's
 * `registerFeature()` side-effect. `main.ts` imports `./features` once.
 *
 * Each feature agent appends EXACTLY ONE import line directly above the
 * `// @features:append` marker. Never reorder existing lines — append only,
 * so parallel branches auto-merge.
 */
import './solid-primitives';
import './inspect-model-stats';
import './mesh-reverse-normal';
import './mesh-reduce';
import './inspect-section';
import './io-obj-export';
import './construct-axis-point';
import './solid-sweep';
import './nav-views';
import './inspect-measure';
import './solid-intersect';
import './solid-primitives-extra';
import './mesh-weld';
import './inspect-com';
import './render-visual-style';
import './solid-pattern-circular';
import './solid-mirror-plane';
import './view-visibility';
import './view-isolate';
// @features:append

export { getFeatures, registerFeature, getFeature } from './registry';
export { mountFeatures } from './mount';
export type { FeatureDef } from './registry';
export type { FeatureHost } from './host';
