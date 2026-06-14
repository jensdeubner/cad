/**
 * Registry feature: Hüllkugel-Körper (Bounding sphere body).
 *
 * Creates a brand-new sphere body that matches the active body's world-space
 * bounding sphere (center + radius) — useful for clearance / hull volumes.
 * Thin registration over the pure `sphereGeometryForBounds` builder; the world
 * sphere comes from `geometry.boundingSphere × meshGroup.matrixWorld` (center
 * transformed by the world matrix, radius scaled by the max-axis scale). Hard
 * numbers land in `window.__cadFeature.sphereBody` for the E2E test.
 */
import { registerFeature } from './registry';
import type { FeatureHost } from './host';
import { sphereGeometryForBounds } from '../solid/sphere-body';

async function runSphereBody(host: FeatureHost): Promise<void> {
  const THREE = host.THREE;
  const body = host.getActiveBody();
  const geometry = body?.geometry ?? null;
  const posAttr = geometry?.getAttribute('position') ?? null;

  if (!body || !geometry || !posAttr || posAttr.count === 0) {
    host.setStatus(host.t('status.sphereBodyNoBody'));
    return;
  }

  // World-space bounding sphere: local geometry bounding sphere promoted through
  // the body's mesh-group world matrix (center transformed by the matrix, radius
  // scaled by the matrix's largest axis scale).
  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  body.meshGroup.updateMatrixWorld(true);
  const matrixWorld = body.meshGroup.matrixWorld;

  const center = new THREE.Vector3();
  let radius = 0;
  if (geometry.boundingSphere) {
    center.copy(geometry.boundingSphere.center).applyMatrix4(matrixWorld);

    // Max uniform scale embedded in the world matrix → scales the radius.
    const scale = new THREE.Vector3();
    matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
    const maxScale = Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z));
    radius = geometry.boundingSphere.radius * maxScale;
  }

  if (!(radius > 0)) {
    host.setStatus(host.t('status.sphereBodyNoBody'));
    return;
  }

  const label = host.t('solid.sphereBody');
  await host.addBodyFromGeometry(sphereGeometryForBounds(center, radius), label, 'solid');

  host.markFeatureDone('solid-sphere-body', label);
  host.setStatus(host.t('status.sphereBodyDone'));

  // Expose hard numbers for the E2E test (own namespace, never __cadDebug).
  const w = window as unknown as { __cadFeature?: Record<string, unknown> };
  w.__cadFeature ??= {};
  w.__cadFeature.sphereBody = {
    center: [center.x, center.y, center.z] as [number, number, number],
    radius,
  };
}

registerFeature({
  id: 'solid-sphere-body',
  tab: 'solid',
  group: 'solid.create',
  labelKey: 'solid.sphereBody',
  icon: '◯',
  run: (host) => runSphereBody(host),
});
