/**
 * Registry feature: Kreismuster um beliebige Achse (Circular Pattern).
 *
 * Captures the active body's geometry + world center ONCE, then creates
 * `count - 1` rotated copies as new bodies via the pure kernel
 * `src/solid/pattern-circular.ts`. Thin registration over the `FeatureHost`.
 */
import { registerFeature } from './registry';
import type { FeatureHost } from './host';
import { circularCopies } from '../solid/pattern-circular';

async function runPatternCircular(host: FeatureHost): Promise<void> {
  host.selectTab('solid');

  const body = host.getActiveBody();
  const geometry = body?.geometry;
  if (!body || !geometry) {
    host.setStatus(host.t('status.patternCircularNoBody'));
    return;
  }

  const THREE = host.THREE;
  const count = 4;

  // Capture the source ONCE: addBodyFromGeometry changes the active body each
  // call, so snapshot geometry + world center before the loop.
  const source = geometry.clone();

  // World center = geometry bbox centre transformed by the body world matrix.
  source.computeBoundingBox();
  const center = new THREE.Vector3();
  source.boundingBox?.getCenter(center);
  const worldMatrix = host.cadScene.getBodyWorldMatrix(body.id);
  center.applyMatrix4(worldMatrix);

  // Default axis: world Z.
  const axis = new THREE.Vector3(0, 0, 1);

  const copies = circularCopies(source, count, axis, center);
  for (const copyGeom of copies) {
    await host.addBodyFromGeometry(copyGeom, host.t('solid.patternCircularBody'), 'solid');
  }

  host.markFeatureDone('solid-pattern-circular', host.t('solid.patternCircularAxis'));
  host.setStatus(host.t('status.patternCircularDone', { count }));

  const w = window as unknown as { __cadFeature?: Record<string, unknown> };
  w.__cadFeature ??= {};
  w.__cadFeature.patternCircular = { count };
}

registerFeature({
  id: 'solid-pattern-circular',
  tab: 'solid',
  group: 'solid.pattern',
  labelKey: 'solid.patternCircularAxis',
  icon: '✳',
  run: (host) => runPatternCircular(host),
});
