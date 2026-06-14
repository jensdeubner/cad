/**
 * Registry feature: View → Show Edges (Fusion "Visual Styles → Shaded with
 * Edges").
 *
 * Toggles a sharp-edge outline overlay for every body. Thin registration
 * delegating to the edge-display controller, using only the FeatureHost.
 *
 * Test bridge: the new mode + overlay count is exposed under
 * `window.__cadFeature.edges = { on, count }`.
 */
import { registerFeature } from './registry';
import type { FeatureHost } from './host';
import { createEdgeDisplayController } from '../render/edge-display';

registerFeature({
  id: 'view-edges',
  tab: 'view',
  group: 'view.style',
  labelKey: 'view.edges',
  icon: '◫',
  run: (host: FeatureHost) => {
    host.selectTab('view');
    const on = createEdgeDisplayController(host).toggle();

    const count = host.overlay.children.filter(
      (o) => (o.userData as { edgeOverlay?: boolean }).edgeOverlay === true,
    ).length;

    const w = window as unknown as {
      __cadFeature?: { edges?: { on: boolean; count: number } };
    };
    w.__cadFeature ??= {};
    w.__cadFeature.edges = { on, count };

    host.markFeatureDone('view-edges', host.t('view.edges'));
    host.setStatus(host.t(on ? 'status.edgesOn' : 'status.edgesOff'));
  },
});
