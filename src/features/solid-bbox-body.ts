/**
 * Registry feature: Begrenzungsrahmen-Körper (Bounding Box body).
 *
 * Creates a brand-new box body that exactly matches the active body's
 * world-space axis-aligned bounding box — useful for stock / packaging volumes.
 * Thin registration over the pure `boxGeometryForBounds` builder; the world
 * bbox comes from `geometry.boundingBox × meshGroup.matrixWorld`. Hard numbers
 * land in `window.__cadFeature.bboxBody` for the E2E test.
 */
import { registerFeature } from './registry';
import type { FeatureHost } from './host';
import { boxGeometryForBounds } from '../solid/bbox-body';

async function runBboxBody(host: FeatureHost): Promise<void> {
  const THREE = host.THREE;
  const body = host.getActiveBody();
  const geometry = body?.geometry ?? null;
  const posAttr = geometry?.getAttribute('position') ?? null;

  if (!body || !geometry || !posAttr || posAttr.count === 0) {
    host.setStatus(host.t('status.bboxBodyNoBody'));
    return;
  }

  // World-space bounding box: local geometry bbox promoted through the body's
  // mesh-group world matrix (mirrors inspect-com).
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  body.meshGroup.updateMatrixWorld(true);
  const worldBox = new THREE.Box3();
  if (geometry.boundingBox) {
    worldBox.copy(geometry.boundingBox).applyMatrix4(body.meshGroup.matrixWorld);
  }

  if (worldBox.isEmpty()) {
    host.setStatus(host.t('status.bboxBodyNoBody'));
    return;
  }

  const { min, max } = worldBox;
  const label = host.t('solid.bboxBody');
  await host.addBodyFromGeometry(boxGeometryForBounds(min, max), label, 'solid');

  host.markFeatureDone('solid-bbox-body', label);
  host.setStatus(host.t('status.bboxBodyDone'));

  // Expose hard numbers for the E2E test (own namespace, never __cadDebug).
  const w = window as unknown as { __cadFeature?: Record<string, unknown> };
  w.__cadFeature ??= {};
  w.__cadFeature.bboxBody = {
    min: [min.x, min.y, min.z] as [number, number, number],
    max: [max.x, max.y, max.z] as [number, number, number],
  };
}

registerFeature({
  id: 'solid-bbox-body',
  tab: 'solid',
  group: 'solid.create',
  labelKey: 'solid.bboxBody',
  icon: '▢',
  run: (host) => runBboxBody(host),
});
