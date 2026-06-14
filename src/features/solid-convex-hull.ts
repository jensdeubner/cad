/**
 * Registry feature: Konvexe Hülle (Convex Hull) of the active body.
 *
 * Extracts the active body's vertices in WORLD space (applies the mesh-group's
 * world matrix so the hull wraps the body where it actually sits), builds the
 * convex hull as a closed triangle mesh and promotes it to a brand-new body,
 * leaving the original untouched. Thin registration over the pure
 * `src/solid/convex-hull` module, using only the `FeatureHost`.
 */
import { registerFeature } from './registry';
import type { FeatureHost } from './host';
import { convexHullGeometry, pointsFromGeometry } from '../solid/convex-hull';

async function runConvexHull(host: FeatureHost): Promise<void> {
  host.selectTab('solid');

  const body = host.getActiveBody();
  const geom = body?.geometry;
  if (!body || !geom) {
    host.setStatus(host.t('status.convexHullNoBody'));
    return;
  }

  // Extract vertices in WORLD space so the hull wraps the body where it sits.
  body.meshGroup.updateMatrixWorld(true);
  const worldMatrix = body.meshGroup.matrixWorld;
  const points = pointsFromGeometry(geom).map((p) => p.applyMatrix4(worldMatrix));

  const hull = convexHullGeometry(points);
  await host.addBodyFromGeometry(hull, host.t('solid.convexHull'), 'solid');

  host.markFeatureDone('solid-convex-hull', host.t('solid.convexHull'));
  host.setStatus(host.t('status.convexHullDone'));

  const tris = hull.getAttribute('position')
    ? hull.getAttribute('position').count / 3
    : 0;
  (window as unknown as { __cadFeature?: Record<string, unknown> }).__cadFeature ??= {};
  (window as unknown as { __cadFeature: Record<string, unknown> }).__cadFeature.convexHull = {
    tris,
  };
}

registerFeature({
  id: 'solid-convex-hull',
  tab: 'solid',
  group: 'solid.create',
  labelKey: 'solid.convexHull',
  icon: '◇',
  run: (host) => runConvexHull(host),
});
