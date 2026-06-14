/**
 * Registry feature: Offset-Konstruktionsebene (#16).
 *
 * Starts a sketch on an origin plane offset along its normal — Fusion's
 * "construct an offset plane, then sketch on it" collapsed into one click.
 * Uses only the FeatureHost (`startSketch`), so no edits to the sketch core.
 */
import { registerFeature } from './registry';
import type { FeatureHost } from './host';
import type { PlaneAxis } from '../types';
import { offsetForActivePlane } from '../construct/plane';

function runOffsetPlane(host: FeatureHost, axis: PlaneAxis): void {
  const position = offsetForActivePlane(host, axis);
  const sketchId = host.startSketch(axis, position);
  host.markFeatureDone(`construct-plane-${axis}`);
  host.setStatus(
    host.t('status.offsetPlaneDone', { axis: axis.toUpperCase(), d: position.toFixed(1) }),
  );
  const w = window as unknown as { __cadFeature?: Record<string, unknown> };
  w.__cadFeature ??= {};
  w.__cadFeature.offsetPlane = { axis, position, sketchId };
}

for (const axis of ['xy', 'xz', 'yz'] as const) {
  registerFeature({
    id: `construct-plane-${axis}`,
    tab: 'sketch',
    group: 'construct.planes',
    labelKey: `construct.plane${axis.toUpperCase()}`,
    icon: '▱',
    run: (host) => runOffsetPlane(host, axis),
  });
}
