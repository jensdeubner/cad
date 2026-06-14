/**
 * Registry feature: Spiegeln über Ursprungsebene (Mirror across a plane).
 *
 * Reflects the active body across an origin plane (default XZ → negate Y) and
 * promotes the result to a brand-new body, leaving the original untouched. Thin
 * registration over the pure `src/solid/mirror-plane` module, using only the
 * `FeatureHost`.
 */
import { registerFeature } from './registry';
import type { FeatureHost } from './host';
import { mirrorGeometry, type MirrorPlane } from '../solid/mirror-plane';

async function runMirrorPlane(host: FeatureHost): Promise<void> {
  host.selectTab('solid');

  const body = host.getActiveBody();
  const geom = body?.geometry;
  if (!body || !geom) {
    host.setStatus(host.t('status.mirrorPlaneNoBody'));
    return;
  }

  const plane: MirrorPlane = 'xz'; // default: mirror across XZ (negate Y)
  const mirrored = mirrorGeometry(geom, plane);
  await host.addBodyFromGeometry(mirrored, host.t('solid.mirrorPlaneBody'), 'solid');

  host.markFeatureDone('solid-mirror-plane', host.t('solid.mirrorPlane'));
  host.setStatus(host.t('status.mirrorPlaneDone'));

  (window as unknown as { __cadFeature?: Record<string, unknown> }).__cadFeature ??= {};
  (window as unknown as { __cadFeature: Record<string, unknown> }).__cadFeature.mirrorPlane = {
    plane,
  };
}

registerFeature({
  id: 'solid-mirror-plane',
  tab: 'solid',
  group: 'solid.pattern',
  labelKey: 'solid.mirrorPlane',
  icon: '⇋',
  run: (host) => runMirrorPlane(host),
});
