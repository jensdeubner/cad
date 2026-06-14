/**
 * Registry feature: View → Visibility (Fusion "Show/Hide Bodies").
 *
 * Toggles the visibility of every body in the scene at once. Thin registration
 * delegating to the scene-state controller, using only the FeatureHost.
 *
 * Test bridge: the new state is exposed under
 * `window.__cadFeature.visibility.bodiesVisible`.
 */
import { registerFeature } from './registry';
import type { FeatureHost } from './host';
import { createVisibilityController } from '../view/visibility';

registerFeature({
  id: 'view-visibility',
  tab: 'view',
  group: 'view.visibility',
  labelKey: 'view.toggleBodies',
  icon: '👁',
  run: (host: FeatureHost) => {
    host.selectTab('view');
    const bodiesVisible = createVisibilityController(host).toggleBodies();

    const w = window as unknown as { __cadFeature?: { visibility?: { bodiesVisible: boolean } } };
    w.__cadFeature ??= {};
    w.__cadFeature.visibility = { bodiesVisible };

    host.markFeatureDone('view-visibility', host.t('view.toggleBodies'));
    host.setStatus(host.t(bodiesVisible ? 'status.bodiesShown' : 'status.bodiesHidden'));
  },
});
