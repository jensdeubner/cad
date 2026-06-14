/**
 * Registry feature: Körper duplizieren (Duplicate body).
 *
 * Clones the active body's geometry into a brand-new body, offset along +X by
 * a little more than the body's width so the copy is visible next to the
 * original. Thin registration over the pure `src/solid/duplicate` module, using
 * only the `FeatureHost`. The original body is left untouched.
 */
import { registerFeature } from './registry';
import type { FeatureHost } from './host';
import { duplicateGeometry } from '../solid/duplicate';

async function runDuplicate(host: FeatureHost): Promise<void> {
  host.selectTab('solid');

  const body = host.getActiveBody();
  const geom = body?.geometry;
  const pos = geom?.getAttribute('position');
  if (!body || !geom || !pos || pos.count === 0) {
    host.setStatus(host.t('status.duplicateNoBody'));
    return;
  }

  const THREE = host.THREE;

  // Offset the copy by a bit more than the body's width so it doesn't overlap.
  if (!geom.boundingBox) geom.computeBoundingBox();
  const size = new THREE.Vector3();
  geom.boundingBox?.getSize(size);
  const offset = new THREE.Vector3(size.x * 1.2, 0, 0);

  const dup = duplicateGeometry(geom, offset);
  await host.addBodyFromGeometry(
    dup,
    host.t('solid.duplicateBody'),
    host.getActiveBody()?.bodyKind ?? 'solid',
  );

  host.markFeatureDone('solid-duplicate', host.t('solid.duplicate'));
  host.setStatus(host.t('status.duplicateDone'));

  // Expose hard state for the E2E test (own namespace, never __cadDebug).
  (window as unknown as { __cadFeature?: Record<string, unknown> }).__cadFeature ??= {};
  (window as unknown as { __cadFeature: Record<string, unknown> }).__cadFeature.duplicate = {
    ok: true,
  };
}

registerFeature({
  id: 'solid-duplicate',
  tab: 'solid',
  group: 'solid.modify',
  labelKey: 'solid.duplicate',
  icon: '⧉',
  run: (host) => runDuplicate(host),
});
