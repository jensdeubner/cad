/**
 * Registry feature: Maßstab (Scale by factor).
 *
 * Uniformly scales the active body's geometry about its bounding-box center by
 * a fixed factor (1.5), replacing the mesh in place. Thin registration over the
 * pure `src/solid/scale-factor` module, using only the `FeatureHost`.
 */
import { registerFeature } from './registry';
import type { FeatureHost } from './host';
import { scaleGeometry } from '../solid/scale-factor';

const SCALE_FACTOR = 1.5;

async function runScaleFactor(host: FeatureHost): Promise<void> {
  const body = host.getActiveBody();
  const geom = body?.geometry;
  if (!body || !geom) {
    host.setStatus(host.t('status.scaleFactorNoBody'));
    return;
  }

  host.pushMeshUndo(host.t('solid.scaleFactor'));

  // Scale about the body's own bbox center (default in scaleGeometry).
  const scaled = scaleGeometry(geom, SCALE_FACTOR);
  await host.replaceBodyGeometry(body.id, scaled);

  host.markFeatureDone('solid-scale-factor');
  host.setStatus(host.t('status.scaleFactorDone'));

  (window as unknown as { __cadFeature?: Record<string, unknown> }).__cadFeature ??= {};
  (window as unknown as { __cadFeature: Record<string, unknown> }).__cadFeature.scaleFactor = {
    factor: SCALE_FACTOR,
  };
}

registerFeature({
  id: 'solid-scale-factor',
  tab: 'body',
  group: 'solid.modify',
  labelKey: 'solid.scaleFactor',
  icon: '⤢',
  run: (host) => runScaleFactor(host),
});
