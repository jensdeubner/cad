/**
 * Registry feature: Mesh Reduce (Decimation).
 *
 * Core scan-cleanup tool — decimates the active body's mesh via vertex
 * clustering (see `src/mesh/reduce.ts`), replacing its geometry in place.
 * Thin registration delegating to the pure domain module, using only the
 * `FeatureHost`.
 */
import { registerFeature } from './registry';
import type { FeatureHost } from './host';
import { vertexClusterReduce } from '../mesh/reduce';

function triCount(geometry: { getIndex(): { count: number } | null; getAttribute(name: string): { count: number } | undefined }): number {
  const idx = geometry.getIndex();
  if (idx) return idx.count / 3;
  return (geometry.getAttribute('position')?.count ?? 0) / 3;
}

async function runMeshReduce(host: FeatureHost): Promise<void> {
  const body = host.getActiveBody();
  const geometry = body?.geometry;
  if (!body || !geometry) {
    host.setStatus(host.t('status.reduceNoBody'));
    return;
  }

  host.pushMeshUndo(host.t('mesh.reduce'));

  const before = triCount(geometry);
  const reduced = vertexClusterReduce(geometry, 14);
  await host.replaceBodyGeometry(body.id, reduced);
  const after = triCount(reduced);

  host.markFeatureDone('mesh-reduce', host.t('mesh.reduce'));
  host.setStatus(host.t('status.reduceDone', { before, after }));

  const w = window as unknown as { __cadFeature?: Record<string, unknown> };
  w.__cadFeature ??= {};
  w.__cadFeature.reduce = { before, after };
}

registerFeature({
  id: 'mesh-reduce',
  tab: 'body',
  group: 'mesh.optimize',
  labelKey: 'mesh.reduce',
  icon: '▽',
  run: (host) => runMeshReduce(host),
});
