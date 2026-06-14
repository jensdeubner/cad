/**
 * Registry feature: Hole-Fill / Make Watertight (Löcher füllen).
 *
 * Detects open boundary loops of the active body's mesh and triangulates them
 * with a centroid fan so the mesh becomes watertight. Thin registration
 * delegating to the pure domain module (`src/mesh/hole-fill.ts`), composing the
 * existing `weldVertices` for correct connectivity, using only the
 * `FeatureHost`.
 */
import { registerFeature } from './registry';
import type { FeatureHost } from './host';
import { findBoundaryLoops, fillHoles } from '../mesh/hole-fill';
import { weldVertices } from '../mesh/weld';

function triCount(geometry: {
  getIndex(): { count: number } | null;
  getAttribute(name: string): { count: number } | undefined;
}): number {
  const idx = geometry.getIndex();
  if (idx) return idx.count / 3;
  return (geometry.getAttribute('position')?.count ?? 0) / 3;
}

async function runMeshHoleFill(host: FeatureHost): Promise<void> {
  const body = host.getActiveBody();
  const geometry = body?.geometry;
  if (!body || !geometry) {
    host.setStatus(host.t('status.holeFillNoBody'));
    return;
  }

  host.pushMeshUndo(host.t('mesh.holeFill'));

  // Honest "before" count: loops on the welded input (matching what fillHoles
  // operates on internally).
  const welded = weldVertices(geometry);
  const holesBefore = findBoundaryLoops(welded).length;

  const r = fillHoles(geometry);
  await host.replaceBodyGeometry(body.id, r.geometry);

  const holesAfter = findBoundaryLoops(r.geometry).length;

  host.markFeatureDone('mesh-hole-fill', host.t('mesh.holeFill'));

  const w = window as unknown as { __cadFeature?: Record<string, unknown> };
  w.__cadFeature ??= {};
  w.__cadFeature['hole-fill'] = {
    holesBefore,
    holesAfter,
    addedTriangles: r.addedTriangles,
    triangles: triCount(r.geometry),
  };

  if (r.holesFilled > 0) {
    host.setStatus(
      host.t('status.holeFillDone', { count: r.holesFilled, tris: r.addedTriangles }),
    );
  } else {
    host.setStatus(host.t('status.holeFillNone'));
  }
}

registerFeature({
  id: 'mesh-hole-fill',
  tab: 'body',
  group: 'mesh.repair',
  labelKey: 'mesh.holeFill',
  icon: '◍',
  run: (host) => runMeshHoleFill(host),
});
