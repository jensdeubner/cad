/**
 * Registry feature: Flächen-Messwerkzeug (Gesamtoberfläche + koplanare Region).
 *
 * Thin registration over the `measure-area` domain module. On run it computes
 * the active body's total world-space surface area (`quickArea`, deterministic,
 * draws a subtle bbox outline) and arms an interactive controller so clicking a
 * face reports the area of its connected coplanar region. Hard numbers are
 * mirrored into `window.__cadFeature['measure-area']` for E2E assertions.
 */
import { registerFeature } from './registry';
import type { FeatureHost } from './host';
import { createAreaController, quickArea, type AreaController } from '../inspect/measure-area';

/** One controller per renderer so repeated runs reuse the armed listener. */
const controllers = new WeakMap<object, AreaController>();

/** Compact mm² display (no grouping). */
function fmt(n: number, digits = 2): string {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
    useGrouping: false,
  });
}

interface AreaBridge {
  totalArea: number;
  faceArea?: number;
  faceTriangles?: number;
}

function areaBridge(result: AreaBridge): void {
  const w = window as unknown as { __cadFeature?: Record<string, unknown> };
  w.__cadFeature ??= {};
  w.__cadFeature['measure-area'] = result;
}

function controllerFor(host: FeatureHost): AreaController {
  const key = host.renderer;
  let ctrl = controllers.get(key);
  if (!ctrl) {
    ctrl = createAreaController(host, (area, tris) => {
      const prev =
        (window as unknown as { __cadFeature?: { 'measure-area'?: AreaBridge } }).__cadFeature?.[
          'measure-area'
        ] ?? null;
      const next: AreaBridge = prev ?? { totalArea: 0 };
      next.faceArea = area;
      next.faceTriangles = tris;
      areaBridge(next);
      host.setStatus(host.t('status.measureAreaFace', { area: fmt(area) }));
    });
    controllers.set(key, ctrl);
  }
  return ctrl;
}

function runMeasureArea(host: FeatureHost): void {
  host.selectTab('body');

  const body = host.getActiveBody();
  if (!body || !body.geometry) {
    host.setStatus(host.t('status.measureAreaNoBody'));
    return;
  }

  const result = quickArea(host);
  areaBridge({ totalArea: result.totalArea });

  // Arm interactive coplanar-face picking.
  controllerFor(host).arm();

  host.markFeatureDone('inspect-measure-area', host.t('inspect.measureArea'));
  host.setStatus(host.t('status.measureAreaDone', { area: fmt(result.totalArea) }));
}

registerFeature({
  id: 'inspect-measure-area',
  tab: 'body',
  group: 'inspect.measure',
  labelKey: 'inspect.measureArea',
  icon: '▱',
  run: (host) => runMeasureArea(host),
});
