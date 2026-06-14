/**
 * Registry feature: 3D-Winkelmesswerkzeug (3-Punkt-Winkel + Schnell-Maß).
 *
 * Thin registration over the `measure-angle` domain module. On run it
 * quick-measures the angle at a corner of the active body's world-space bbox
 * (drawing the two rays into `host.overlay`, ~90° for an axis-aligned box) and
 * arms interactive three-point picking so the user can also click an A→V→C
 * triple for an ad-hoc angle. Hard numbers are mirrored into
 * `window.__cadFeature['measure-angle']` for E2E assertions.
 */
import { registerFeature } from './registry';
import type { FeatureHost } from './host';
import {
  createAngleController,
  quickAngle,
  type AngleController,
  type QuickAngleResult,
} from '../inspect/measure-angle';

/** One controller per renderer so repeated runs reuse the armed listener. */
const controllers = new WeakMap<object, AngleController>();

/** Compact angle display (degrees, no grouping). */
function fmt(n: number, digits = 1): string {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
    useGrouping: false,
  });
}

interface AngleBridge extends QuickAngleResult {
  pointAngle?: number;
}

function angleBridge(result: AngleBridge): void {
  const w = window as unknown as { __cadFeature?: Record<string, unknown> };
  w.__cadFeature ??= {};
  w.__cadFeature['measure-angle'] = result;
}

function controllerFor(host: FeatureHost): AngleController {
  const key = host.renderer;
  let ctrl = controllers.get(key);
  if (!ctrl) {
    ctrl = createAngleController(host, (deg) => {
      const prev =
        (window as unknown as { __cadFeature?: { 'measure-angle'?: AngleBridge } }).__cadFeature?.[
          'measure-angle'
        ] ?? null;
      if (prev) {
        prev.pointAngle = deg;
        angleBridge(prev);
      }
      host.setStatus(host.t('status.measureAngleDone', { deg: fmt(deg) }));
    });
    controllers.set(key, ctrl);
  }
  return ctrl;
}

function runMeasureAngle(host: FeatureHost): void {
  host.selectTab('body');

  const body = host.getActiveBody();
  if (!body || !body.geometry) {
    host.setStatus(host.t('status.measureAngleNoBody'));
    return;
  }

  const result = quickAngle(host);
  angleBridge(result);

  // Also arm interactive three-point picking for ad-hoc angles.
  controllerFor(host).arm();

  host.markFeatureDone('inspect-measure-angle', host.t('inspect.measureAngle'));
  host.setStatus(host.t('status.measureAngleDone', { deg: fmt(result.angle) }));
}

registerFeature({
  id: 'inspect-measure-angle',
  tab: 'body',
  group: 'inspect.measure',
  labelKey: 'inspect.measureAngle',
  icon: '∠',
  run: (host) => runMeasureAngle(host),
});
