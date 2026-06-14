/**
 * Registry feature: Ebenenschnitt (Plane Cut).
 *
 * Keeps only the part of the active body above a horizontal Z-plane (the body's
 * bbox-center Z by default), discarding everything below; straddling triangles
 * are clipped to their above-polygon. Thin registration over the pure
 * `src/solid/plane-cut` module, using only the `FeatureHost`. Hard numbers land
 * in `window.__cadFeature.planeCut` for the E2E test.
 */
import { registerFeature } from './registry';
import type { FeatureHost } from './host';
import { cutAbovePlaneZ } from '../solid/plane-cut';

function triangleCountOf(geometry: { getIndex(): { count: number } | null; getAttribute(name: string): { count: number } | undefined }): number {
  const index = geometry.getIndex();
  if (index) return Math.floor(index.count / 3);
  const pos = geometry.getAttribute('position');
  return pos ? Math.floor(pos.count / 3) : 0;
}

async function runPlaneCut(host: FeatureHost): Promise<void> {
  const THREE = host.THREE;
  const body = host.getActiveBody();
  const geometry = body?.geometry ?? null;
  const posAttr = geometry?.getAttribute('position') ?? null;

  if (!body || !geometry || !posAttr || posAttr.count === 0) {
    host.setStatus(host.t('status.planeCutNoBody'));
    return;
  }

  host.pushMeshUndo(host.t('solid.planeCut'));

  // Cut plane = bbox-center Z of the active geometry.
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const box = geometry.boundingBox ?? new THREE.Box3();
  const planeZ = (box.min.z + box.max.z) / 2;

  const before = triangleCountOf(geometry);
  const cut = cutAbovePlaneZ(geometry, planeZ);
  const after = triangleCountOf(cut);

  if (after === 0) {
    // Nothing left above the plane — leave the body untouched.
    host.setStatus(host.t('status.planeCutEmpty'));
    return;
  }

  await host.replaceBodyGeometry(body.id, cut);

  host.markFeatureDone('solid-plane-cut', host.t('solid.planeCut'));
  host.setStatus(host.t('status.planeCutDone'));

  const w = window as unknown as { __cadFeature?: Record<string, unknown> };
  w.__cadFeature ??= {};
  w.__cadFeature.planeCut = { before, after };
}

registerFeature({
  id: 'solid-plane-cut',
  tab: 'body',
  group: 'solid.modify',
  labelKey: 'solid.planeCut',
  icon: '⊘',
  run: (host) => runPlaneCut(host),
});
