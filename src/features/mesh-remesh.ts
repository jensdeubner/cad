/**
 * Registry feature: Remesh (refine to target edge length).
 *
 * Uniformly subdivides the active body's mesh until every triangle edge is no
 * longer than a deterministic target (1/8 of the body's world bounding-box
 * diagonal), raising density without distorting geometry (midpoints stay on the
 * original straight edges). Thin registration delegating to the pure domain
 * module (`src/mesh/remesh.ts`), using only the `FeatureHost`.
 */
import { registerFeature } from './registry';
import type { FeatureHost } from './host';
import { refineToEdgeLength, maxEdgeLength } from '../mesh/remesh';

function triCount(geometry: {
  getIndex(): { count: number } | null;
  getAttribute(name: string): { count: number } | undefined;
}): number {
  const idx = geometry.getIndex();
  if (idx) return idx.count / 3;
  return (geometry.getAttribute('position')?.count ?? 0) / 3;
}

async function runMeshRemesh(host: FeatureHost): Promise<void> {
  const body = host.getActiveBody();
  const geometry = body?.geometry;
  if (!body || !geometry) {
    host.setStatus(host.t('status.remeshNoBody'));
    return;
  }

  host.pushMeshUndo(host.t('mesh.remesh'));

  // Deterministic target: 1/8 of the world bounding-box diagonal of the body.
  const THREE = host.THREE;
  body.meshGroup.updateWorldMatrix(true, false);
  geometry.computeBoundingBox();
  const localBox = geometry.boundingBox ?? new THREE.Box3();
  const worldBox = localBox.clone().applyMatrix4(body.meshGroup.matrixWorld);
  const diagonal = worldBox.getSize(new THREE.Vector3()).length();
  const targetLen = diagonal / 8;

  const before = triCount(geometry);
  const r = refineToEdgeLength(geometry, targetLen);
  await host.replaceBodyGeometry(body.id, r.geometry);
  const after = triCount(r.geometry);

  host.markFeatureDone('mesh-remesh', host.t('mesh.remesh'));
  host.setStatus(host.t('status.remeshDone', { before, after }));

  const w = window as unknown as { __cadFeature?: Record<string, unknown> };
  w.__cadFeature ??= {};
  w.__cadFeature.remesh = {
    before,
    after,
    targetLen,
    maxEdgeAfter: maxEdgeLength(r.geometry),
  };
}

registerFeature({
  id: 'mesh-remesh',
  tab: 'body',
  group: 'mesh.optimize',
  labelKey: 'mesh.remesh',
  icon: '▦',
  run: (host) => runMeshRemesh(host),
});
