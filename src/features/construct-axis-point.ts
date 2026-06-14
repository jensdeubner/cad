/**
 * Registry feature: Konstruktionsgeometrie — construction axes (X/Y/Z) plus an
 * origin construction point, drawn as visible overlays in `host.overlay`.
 *
 * Idempotent: each run first clears any previously-added construction overlays
 * (matched via `userData.construction`), then adds a fresh set — so repeated
 * runs do not grow the overlay unbounded.
 */
import { registerFeature } from './registry';
import type { FeatureHost } from './host';
import {
  buildConstructionAxes,
  buildConstructionPoint,
  CONSTRUCTION_FLAG,
} from '../construct/axis-point';

const FEATURE_ID = 'construct-axis-point';

function run(host: FeatureHost): void {
  const THREE = host.THREE;
  const overlay = host.overlay;

  // 1. Remove any previous construction overlays (clear-then-add → idempotent).
  const stale = overlay.children.filter((c) => c.userData?.[CONSTRUCTION_FLAG]);
  for (const obj of stale) {
    overlay.remove(obj);
    obj.traverse((node) => {
      const mesh = node as unknown as {
        geometry?: { dispose?: () => void };
        material?: { dispose?: () => void };
      };
      mesh.geometry?.dispose?.();
      mesh.material?.dispose?.();
    });
  }

  // 2. Add fresh axes + origin point.
  const axes = buildConstructionAxes(50);
  const point = buildConstructionPoint(new THREE.Vector3(0, 0, 0));
  overlay.add(axes);
  overlay.add(point);
  const added = 2;

  // 3. Mark done + status + expose hard numbers for the e2e test.
  host.markFeatureDone(FEATURE_ID, host.t('construct.axisPoint'));
  host.setStatus(host.t('status.constructDone'));

  const w = window as unknown as { __cadFeature?: Record<string, unknown> };
  w.__cadFeature ??= {};
  w.__cadFeature.construct = { added: true, objects: added };
}

registerFeature({
  id: FEATURE_ID,
  tab: 'body',
  group: 'construct.geometry',
  labelKey: 'construct.axisPoint',
  icon: '✛',
  run,
});
