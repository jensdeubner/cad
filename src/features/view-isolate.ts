/**
 * Registry feature: View → Isolieren (Fusion "Isolate").
 *
 * Shows only the active body and hides all others; running it again restores
 * the previous visibility. Thin registration delegating to the isolate
 * controller, using only the FeatureHost.
 *
 * Test bridge: the new state is exposed under
 * `window.__cadFeature.isolate = { isolated, hiddenCount }`.
 */
import { registerFeature } from './registry';
import type { FeatureHost } from './host';
import { createIsolateController } from '../view/isolate';

registerFeature({
  id: 'view-isolate',
  tab: 'view',
  group: 'view.isolate',
  labelKey: 'view.isolate',
  icon: '◎',
  run: (host: FeatureHost) => {
    host.selectTab('view');
    const controller = createIsolateController(host);
    const isolated = controller.toggle();
    const hiddenCount = controller.hiddenCount();

    const w = window as unknown as {
      __cadFeature?: { isolate?: { isolated: boolean; hiddenCount: number } };
    };
    w.__cadFeature ??= {};
    w.__cadFeature.isolate = { isolated, hiddenCount };

    host.markFeatureDone('view-isolate', host.t('view.isolate'));
    host.setStatus(host.t(isolated ? 'status.isolateOn' : 'status.isolateOff'));
  },
});
