/**
 * Registry feature: Laplace-Glätten (Laplacian Smooth).
 *
 * Whole-body, one-click smoothing for noisy scan meshes — moves every vertex
 * toward the average of its edge-neighbours (2 iterations, lambda 0.5),
 * replacing the active body's geometry in place. Thin registration delegating
 * to the pure domain module (`src/mesh/smooth.ts`), using only the
 * `FeatureHost`. Distinct from the localized Taubin brush.
 */
import { registerFeature } from './registry';
import type { FeatureHost } from './host';
import { laplacianSmooth } from '../mesh/smooth';

function triangleCount(geometry: {
  getIndex(): { count: number } | null;
  getAttribute(name: string): { count: number } | undefined;
}): number {
  const idx = geometry.getIndex();
  if (idx) return idx.count / 3;
  return (geometry.getAttribute('position')?.count ?? 0) / 3;
}

async function runMeshSmooth(host: FeatureHost): Promise<void> {
  const body = host.getActiveBody();
  const geometry = body?.geometry;
  if (!body || !geometry) {
    host.setStatus(host.t('status.smoothLaplacianNoBody'));
    return;
  }

  host.pushMeshUndo(host.t('mesh.smoothLaplacian'));

  const smoothed = laplacianSmooth(geometry, 2, 0.5);
  await host.replaceBodyGeometry(body.id, smoothed);
  const tris = triangleCount(smoothed);

  host.markFeatureDone('mesh-smooth-laplacian', host.t('mesh.smoothLaplacian'));
  host.setStatus(host.t('status.smoothLaplacianDone'));

  const w = window as unknown as { __cadFeature?: Record<string, unknown> };
  w.__cadFeature ??= {};
  w.__cadFeature.smooth = { ok: true, tris };
}

registerFeature({
  id: 'mesh-smooth-laplacian',
  tab: 'body',
  group: 'mesh.optimize',
  labelKey: 'mesh.smoothLaplacian',
  icon: '◠',
  run: (host) => runMeshSmooth(host),
});
