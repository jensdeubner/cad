/**
 * Registry feature: View → Projection (perspective ⇄ orthographic toggle).
 *
 * Pure camera-projection switch through the FeatureHost seam
 * (`host.setCameraProjection`, wired in main.ts). Toggles the active viewport
 * camera between a PerspectiveCamera and an OrthographicCamera that share the
 * current view transform. Hard state is mirrored into
 * `window.__cadFeature.projection` for E2E assertions.
 */
import { registerFeature } from './registry';
import type { FeatureHost } from './host';

function runProjectionToggle(host: FeatureHost): void {
  host.selectTab('view');
  const next =
    host.getCameraProjection() === 'perspective' ? 'orthographic' : 'perspective';
  host.setCameraProjection(next);
  const mode = host.getCameraProjection();

  const w = window as unknown as { __cadFeature?: Record<string, unknown> };
  w.__cadFeature ??= {};
  w.__cadFeature.projection = { mode };

  host.markFeatureDone('view-projection-toggle', host.t('view.projection'));
  host.setStatus(
    host.t(mode === 'orthographic' ? 'status.projectionOrtho' : 'status.projectionPersp'),
  );
}

registerFeature({
  id: 'view-projection-toggle',
  tab: 'view',
  group: 'view.camera',
  labelKey: 'view.projection',
  icon: '◳',
  run: (host) => runProjectionToggle(host),
});
