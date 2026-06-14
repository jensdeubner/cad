/**
 * Registry feature: 3D-Messwerkzeug (Punkt-zu-Punkt-Distanz + Schnell-Maß).
 *
 * Thin registration over the `measure` domain module. On run it quick-measures
 * the active body's world-space bbox diagonal (drawing it into `host.overlay`)
 * and arms interactive two-point picking so the user can also click two surface
 * points for an ad-hoc distance. Hard numbers are mirrored into
 * `window.__cadFeature.measure` for E2E assertions.
 */
import { registerFeature } from './registry';
import type { FeatureHost } from './host';
import {
  createMeasureController,
  quickMeasure,
  type MeasureController,
  type QuickMeasureResult,
} from '../inspect/measure';

/** One controller per renderer so repeated runs reuse the armed listener. */
const controllers = new WeakMap<object, MeasureController>();

/** Compact diagonal display (mm, no grouping). */
function fmt(n: number, digits = 3): string {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
    useGrouping: false,
  });
}

interface MeasureBridge extends QuickMeasureResult {
  pointDistance?: number;
}

function measureBridge(result: MeasureBridge): void {
  const w = window as unknown as { __cadFeature?: Record<string, unknown> };
  w.__cadFeature ??= {};
  w.__cadFeature.measure = result;
}

function controllerFor(host: FeatureHost): MeasureController {
  const key = host.renderer;
  let ctrl = controllers.get(key);
  if (!ctrl) {
    ctrl = createMeasureController(host, (d) => {
      const prev =
        (window as unknown as { __cadFeature?: { measure?: MeasureBridge } }).__cadFeature
          ?.measure ?? null;
      if (prev) {
        prev.pointDistance = d;
        measureBridge(prev);
      }
      host.setStatus(host.t('status.measureDone', { d: fmt(d) }));
    });
    controllers.set(key, ctrl);
  }
  return ctrl;
}

function runMeasure(host: FeatureHost): void {
  host.selectTab('body');

  const body = host.getActiveBody();
  if (!body || !body.geometry) {
    host.setStatus(host.t('status.measureNoBody'));
    return;
  }

  const result = quickMeasure(host);
  measureBridge(result);

  // Also arm interactive two-point picking for ad-hoc distances.
  controllerFor(host).arm();

  host.markFeatureDone('inspect-measure', host.t('inspect.measure'));
  host.setStatus(host.t('status.measureDone', { d: fmt(result.diagonal) }));
}

registerFeature({
  id: 'inspect-measure',
  tab: 'body',
  group: 'inspect.measure',
  labelKey: 'inspect.measure',
  icon: '📏',
  run: (host) => runMeasure(host),
});
