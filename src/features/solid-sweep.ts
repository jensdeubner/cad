/**
 * Registry feature: Sweep (profile along path).
 *
 * The default no-sketch demo sweeps a circular profile along a closed circular
 * path → a watertight torus, so the feature always produces a body even with
 * no active sketch. Thin registration delegating to the pure domain module
 * `src/solid/sweep.ts`, using only the `FeatureHost`.
 */
import { registerFeature } from './registry';
import type { FeatureHost } from './host';
import { makeTorusSweep } from '../solid/sweep';

async function runSweep(host: FeatureHost): Promise<void> {
  host.selectTab('solid');
  // Default demo: a watertight torus via the pure sweep kernel. (A usable
  // active sketch contour could be swept instead, but the torus must always
  // work as the deterministic baseline.)
  const geom = makeTorusSweep();
  await host.addBodyFromGeometry(geom, host.t('solid.sweepBody'), 'solid');
  host.markFeatureDone('solid-sweep', host.t('solid.sweep'));
  host.setStatus(host.t('status.sweepDone'));
}

registerFeature({
  id: 'solid-sweep',
  tab: 'solid',
  group: 'solid.create',
  labelKey: 'solid.sweep',
  icon: '〜',
  run: (host) => runSweep(host),
});
