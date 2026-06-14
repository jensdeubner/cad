/**
 * Registry feature: Auf Größe skalieren (Scale to size).
 *
 * Uniformly scales the active body so its LARGEST bounding-box dimension equals
 * a target size (default 50 mm), about its bbox center, replacing the mesh in
 * place. Thin registration over the pure `src/solid/scale-to-size` module,
 * using only the `FeatureHost`.
 */
import { registerFeature } from './registry';
import type { FeatureHost } from './host';
import { scaleToMaxSize } from '../solid/scale-to-size';

const TARGET_MAX_MM = 50;

async function runScaleToSize(host: FeatureHost): Promise<void> {
  const body = host.getActiveBody();
  const geom = body?.geometry;
  if (!body || !geom) {
    host.setStatus(host.t('status.scaleToSizeNoBody'));
    return;
  }

  host.pushMeshUndo(host.t('solid.scaleToSize'));

  const scaled = scaleToMaxSize(geom, TARGET_MAX_MM);
  await host.replaceBodyGeometry(body.id, scaled);

  host.markFeatureDone('solid-scale-to-size');
  host.setStatus(host.t('status.scaleToSizeDone'));

  (window as unknown as { __cadFeature?: Record<string, unknown> }).__cadFeature ??= {};
  (window as unknown as { __cadFeature: Record<string, unknown> }).__cadFeature.scaleToSize = {
    target: TARGET_MAX_MM,
  };
}

registerFeature({
  id: 'solid-scale-to-size',
  tab: 'body',
  group: 'solid.modify',
  labelKey: 'solid.scaleToSize',
  icon: '⤢',
  run: (host) => runScaleToSize(host),
});
