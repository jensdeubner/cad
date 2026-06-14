/**
 * Registry feature: Rechteckmuster (Rectangular grid pattern).
 *
 * Captures the active body's geometry + bbox size ONCE, then creates
 * `cols * rows - 1` translated copies as new bodies via the pure kernel
 * `src/solid/pattern-rect.ts`. Thin registration over the `FeatureHost`.
 */
import { registerFeature } from './registry';
import type { FeatureHost } from './host';
import { rectGridCopies } from '../solid/pattern-rect';

async function runPatternRect(host: FeatureHost): Promise<void> {
  host.selectTab('solid');

  const body = host.getActiveBody();
  const geometry = body?.geometry;
  if (!body || !geometry) {
    host.setStatus(host.t('status.patternGridNoBody'));
    return;
  }

  const THREE = host.THREE;

  // Capture the source ONCE: addBodyFromGeometry changes the active body each
  // call, so snapshot geometry + bbox size before the loop.
  const source = geometry.clone();
  source.computeBoundingBox();
  const bboxSize = new THREE.Vector3();
  source.boundingBox?.getSize(bboxSize);

  const cols = 3;
  const rows = 2;
  const dx = bboxSize.x * 1.4;
  const dy = bboxSize.z * 1.4;

  const copies = rectGridCopies(source, cols, rows, dx, dy);
  for (const copyGeom of copies) {
    await host.addBodyFromGeometry(copyGeom, host.t('solid.patternGridBody'), 'solid');
  }

  host.markFeatureDone('solid-pattern-rect', host.t('solid.patternGrid'));
  host.setStatus(host.t('status.patternGridDone', { count: cols * rows }));

  const w = window as unknown as { __cadFeature?: Record<string, unknown> };
  w.__cadFeature ??= {};
  w.__cadFeature.patternRect = { cols, rows };
}

registerFeature({
  id: 'solid-pattern-rect',
  tab: 'solid',
  group: 'solid.pattern',
  labelKey: 'solid.patternGrid',
  icon: '▦',
  run: (host) => runPatternRect(host),
});
