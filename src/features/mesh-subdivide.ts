/**
 * Registry feature: Mesh unterteilen (Subdivide).
 *
 * Splits every triangle of the active body's mesh into four via its edge
 * midpoints (one level), raising mesh density for smoother downstream edits.
 * Thin registration delegating to the pure domain module (`src/mesh/subdivide.ts`),
 * using only the `FeatureHost`.
 */
import { registerFeature } from './registry';
import type { FeatureHost } from './host';
import { subdivideOnce } from '../mesh/subdivide';

function triCount(geometry: {
  getIndex(): { count: number } | null;
  getAttribute(name: string): { count: number } | undefined;
}): number {
  const idx = geometry.getIndex();
  if (idx) return idx.count / 3;
  return (geometry.getAttribute('position')?.count ?? 0) / 3;
}

async function runMeshSubdivide(host: FeatureHost): Promise<void> {
  const body = host.getActiveBody();
  const geometry = body?.geometry;
  if (!body || !geometry) {
    host.setStatus(host.t('status.subdivideNoBody'));
    return;
  }

  host.pushMeshUndo(host.t('mesh.subdivide'));

  const before = triCount(geometry);
  const subdivided = subdivideOnce(geometry);
  await host.replaceBodyGeometry(body.id, subdivided);
  const after = triCount(subdivided);

  host.markFeatureDone('mesh-subdivide', host.t('mesh.subdivide'));
  host.setStatus(host.t('status.subdivideDone', { before, after }));

  const w = window as unknown as { __cadFeature?: Record<string, unknown> };
  w.__cadFeature ??= {};
  w.__cadFeature.subdivide = { before, after };
}

registerFeature({
  id: 'mesh-subdivide',
  tab: 'body',
  group: 'mesh.optimize',
  labelKey: 'mesh.subdivide',
  icon: '⊞',
  run: (host) => runMeshSubdivide(host),
});
