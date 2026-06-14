/**
 * Registry features: Boolean Intersect (Schneiden) + Interferenz-Prüfung.
 *
 * `solid-intersect` computes A ∩ B of the two newest bodies and adds the
 * overlap as a new body. `inspect-interference` computes the overlap VOLUME
 * without creating a body and stashes it on `window.__cadFeature.interference`
 * for tests / inspection.
 *
 * Pure TS composition of the existing subtract kernel — no new Rust.
 */
import { registerFeature } from './registry';
import type { FeatureHost } from './host';
import {
  bakeBodyWorld,
  meshIntersect,
  parsedMeshToGeometry,
  meshVolume,
  pickTwoNewestBodies,
} from '../solid/intersect';

async function runIntersect(host: FeatureHost): Promise<void> {
  host.selectTab('solid');
  const pair = pickTwoNewestBodies(host.getBodies());
  if (!pair) {
    host.setStatus(host.t('status.intersectEmpty'));
    return;
  }
  const [target, tool] = pair;
  const targetWorld = bakeBodyWorld(target);
  const toolWorld = bakeBodyWorld(tool);
  if (!targetWorld || !toolWorld) {
    host.setStatus(host.t('status.intersectEmpty'));
    return;
  }

  await host.ensureWasm();
  const result = meshIntersect(targetWorld, toolWorld);
  if (!result || result.indices.length === 0) {
    host.setStatus(host.t('status.intersectEmpty'));
    return;
  }

  const geom = parsedMeshToGeometry(result);
  await host.addBodyFromGeometry(geom, host.t('solid.intersectBody'), 'solid');
  host.markFeatureDone('solid-intersect', host.t('solid.intersectBody'));
  host.setStatus(host.t('status.intersectDone'));
}

async function runInterference(host: FeatureHost): Promise<void> {
  const pair = pickTwoNewestBodies(host.getBodies());
  let volume = 0;
  if (pair) {
    const [target, tool] = pair;
    const targetWorld = bakeBodyWorld(target);
    const toolWorld = bakeBodyWorld(tool);
    if (targetWorld && toolWorld) {
      await host.ensureWasm();
      const result = meshIntersect(targetWorld, toolWorld);
      if (result) volume = meshVolume(result.positions, result.indices);
    }
  }

  const w = window as unknown as { __cadFeature?: Record<string, unknown> };
  w.__cadFeature ??= {};
  w.__cadFeature.interference = { volume, overlaps: volume > 1e-6 };

  host.markFeatureDone('inspect-interference');
  host.setStatus(host.t('status.interferenceDone', { volume: volume.toFixed(1) }));
}

registerFeature({
  id: 'solid-intersect',
  tab: 'solid',
  group: 'solid.combine',
  labelKey: 'solid.intersect',
  icon: '◑',
  run: (host) => runIntersect(host),
});

registerFeature({
  id: 'inspect-interference',
  tab: 'body',
  group: 'inspect.analyze',
  labelKey: 'inspect.interference',
  icon: '⚠',
  run: (host) => runInterference(host),
});
