/**
 * Registry feature: View → Display Style (Fusion "Visual Styles").
 *
 * Toggles every body between shaded and wireframe display. Thin registration
 * delegating to the render-state controller, using only the FeatureHost.
 *
 * Test bridge: the new mode is exposed under
 * `window.__cadFeature.visualStyle.wireframe`.
 */
import { registerFeature } from './registry';
import type { FeatureHost } from './host';
import { createVisualStyleController } from '../render/visual-style';

registerFeature({
  id: 'view-wireframe',
  tab: 'view',
  group: 'view.style',
  labelKey: 'view.wireframe',
  icon: '▢',
  run: (host: FeatureHost) => {
    host.selectTab('view');
    const wireframe = createVisualStyleController(host).toggle();

    const w = window as unknown as { __cadFeature?: { visualStyle?: { wireframe: boolean } } };
    w.__cadFeature ??= {};
    w.__cadFeature.visualStyle = { wireframe };

    host.markFeatureDone('view-wireframe', host.t('view.wireframe'));
    host.setStatus(host.t(wireframe ? 'status.wireframeOn' : 'status.wireframeOff'));
  },
});
