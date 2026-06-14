/**
 * Registry feature: Körper trennen / Separate bodies.
 *
 * Splits the active body — whose mesh may pack several physically disconnected
 * shells into one geometry — into one independent body per shell. The first
 * shell replaces the original body in place; every further shell becomes a new
 * body of the same kind. A mesh with a single connected shell is left untouched.
 *
 * Thin registration delegating to the pure domain module (`src/mesh/separate.ts`),
 * using only the `FeatureHost`.
 */
import { registerFeature } from './registry';
import type { FeatureHost } from './host';
import { separateShells } from '../mesh/separate';

async function runMeshSeparate(host: FeatureHost): Promise<void> {
  const body = host.getActiveBody();
  const geometry = body?.geometry;
  if (!body || !geometry) {
    host.setStatus(host.t('status.separateNoBody'));
    return;
  }

  const w = window as unknown as { __cadFeature?: Record<string, unknown> };
  w.__cadFeature ??= {};

  const shells = separateShells(geometry);

  if (shells.length <= 1) {
    w.__cadFeature.separate = { shells: 1, newBodies: 0 };
    host.setStatus(host.t('status.separateOne'));
    return;
  }

  host.pushUndo(host.t('mesh.separate'));

  // First shell replaces the original body in place.
  await host.replaceBodyGeometry(body.id, shells[0]);
  // Each remaining shell becomes a fresh body of the same kind.
  for (let i = 1; i < shells.length; i++) {
    await host.addBodyFromGeometry(shells[i], host.t('mesh.separate'), body.bodyKind);
  }

  w.__cadFeature.separate = { shells: shells.length, newBodies: shells.length - 1 };
  host.markFeatureDone('mesh-separate', host.t('mesh.separate'));
  host.setStatus(host.t('status.separateDone', { count: shells.length }));
}

registerFeature({
  id: 'mesh-separate',
  tab: 'body',
  group: 'mesh.repair',
  labelKey: 'mesh.separate',
  icon: '⧉',
  run: (host) => runMeshSeparate(host),
});
