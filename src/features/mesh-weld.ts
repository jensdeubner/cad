/**
 * Registry feature: Make Closed / Weld (Vertex-Verschweißen).
 *
 * Merges coincident vertices of the active body within an epsilon, rebuilds
 * the index, drops degenerate triangles and recomputes normals — the basis for
 * watertight meshes and robust booleans. Thin registration delegating to the
 * pure domain module (`src/mesh/weld.ts`), using only the `FeatureHost`.
 */
import { registerFeature } from './registry';
import type { FeatureHost } from './host';
import { weldVertices, countVertices } from '../mesh/weld';

async function runMeshWeld(host: FeatureHost): Promise<void> {
  const body = host.getActiveBody();
  const geometry = body?.geometry;
  if (!body || !geometry) {
    host.setStatus(host.t('status.weldNoBody'));
    return;
  }

  host.pushMeshUndo(host.t('mesh.weld'));

  const before = countVertices(geometry);
  const welded = weldVertices(geometry);
  await host.replaceBodyGeometry(body.id, welded);
  const after = countVertices(welded);

  host.markFeatureDone('mesh-weld', host.t('mesh.weld'));
  host.setStatus(host.t('status.weldDone', { before, after }));

  const w = window as unknown as { __cadFeature?: Record<string, unknown> };
  w.__cadFeature ??= {};
  w.__cadFeature.weld = { before, after };
}

registerFeature({
  id: 'mesh-weld',
  tab: 'body',
  group: 'mesh.repair',
  labelKey: 'mesh.weld',
  icon: '⊙',
  run: (host) => runMeshWeld(host),
});
