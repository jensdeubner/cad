/**
 * Registry feature: Section Analysis (Inspect standard).
 *
 * Thin registration over the `createSectionController` domain controller:
 * each `run()` toggles a live clipping plane across all bodies on/off,
 * keeps a per-host controller instance so the toggle is stateful, and
 * mirrors the result into `window.__cadFeature.section` for E2E assertions.
 */
import { registerFeature } from './registry';
import type { FeatureHost } from './host';
import { createSectionController, type SectionController } from '../inspect/section';

/**
 * One controller per renderer, so repeated runs toggle the same plane.
 * The host object is rebuilt on every `runFeature()` call, but `host.renderer`
 * (and `host.overlay`) are stable singletons — key on the renderer so state
 * survives across host instances.
 */
const controllers = new WeakMap<object, SectionController>();

function controllerFor(host: FeatureHost): SectionController {
  const key = host.renderer;
  let ctrl = controllers.get(key);
  if (!ctrl) {
    ctrl = createSectionController(host);
    controllers.set(key, ctrl);
  }
  return ctrl;
}

function runSection(host: FeatureHost): void {
  host.selectTab('view');
  const ctrl = controllerFor(host);
  const active = ctrl.toggle();

  host.markFeatureDone('inspect-section');
  host.setStatus(host.t(active ? 'status.sectionOn' : 'status.sectionOff'));

  const w = window as unknown as {
    __cadFeature?: Record<string, unknown>;
  };
  w.__cadFeature ??= {};
  w.__cadFeature.section = {
    active,
    planeCount: host.renderer.clippingPlanes.length,
  };
}

registerFeature({
  id: 'inspect-section',
  tab: 'view',
  group: 'view.section',
  labelKey: 'view.section',
  icon: '▦',
  run: (host) => runSection(host),
});
