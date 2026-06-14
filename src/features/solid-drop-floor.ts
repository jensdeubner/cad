/**
 * Registry feature: Auf Boden setzen (Drop to floor).
 *
 * Translates the active body along Z so its lowest point rests on the Z=0
 * ground plane — handy before export / 3D printing so the part sits on the
 * build plate. Thin registration over the pure `src/solid/drop-floor` module.
 *
 * The body's local geometry stays centered at the origin (the app re-centers
 * geometry on every mesh rebuild); the floor offset therefore lives on the
 * body's world transform (`meshGroup` position), which is exactly how Fusion
 * expresses a move. We derive the drop distance by running the pure
 * `dropToFloor` on a world-space copy of the geometry, then apply it as a Z
 * shift on the mesh group.
 *
 * Test bridge: the applied translation + resulting world bbox land in
 * `window.__cadFeature.dropFloor`.
 */
import { registerFeature } from './registry';
import type { FeatureHost } from './host';
import { dropToFloor } from '../solid/drop-floor';

async function runDropFloor(host: FeatureHost): Promise<void> {
  const THREE = host.THREE;
  const body = host.getActiveBody();
  const geom = body?.geometry;
  const posAttr = geom?.getAttribute('position') ?? null;
  if (!body || !geom || !posAttr || posAttr.count === 0) {
    host.setStatus(host.t('status.dropFloorNoBody'));
    return;
  }

  host.pushMeshUndo(host.t('solid.dropFloor'));

  // World-space copy of the geometry: local geometry baked through the body's
  // current world matrix (mirrors solid-bbox-body / inspect-com).
  body.meshGroup.updateMatrixWorld(true);
  const worldGeom = geom.clone();
  worldGeom.applyMatrix4(body.meshGroup.matrixWorld);

  // Pure helper computes how far to lift so world min.z lands on 0.
  const result = dropToFloor(worldGeom);
  const dz = result.dz;

  // Apply the lift as a world-space Z shift on the body's transform, then
  // re-sync visuals. (Re-using replaceBodyGeometry would re-center the mesh and
  // undo the shift, so we move the body instead — the geometry stays put.)
  body.transform = { ...body.transform, posZ: body.transform.posZ + dz };
  body.meshGroup.position.z += dz;
  body.meshGroup.updateMatrixWorld(true);

  host.markFeatureDone('solid-drop-floor', host.t('solid.dropFloor'));
  host.setStatus(host.t('status.dropFloorDone'));

  // Verify via the resulting world bounding box and stash hard numbers.
  body.meshGroup.updateMatrixWorld(true);
  const worldBox = new THREE.Box3();
  if (geom.boundingBox === null) geom.computeBoundingBox();
  if (geom.boundingBox) worldBox.copy(geom.boundingBox).applyMatrix4(body.meshGroup.matrixWorld);

  (window as unknown as { __cadFeature?: Record<string, unknown> }).__cadFeature ??= {};
  (window as unknown as { __cadFeature: Record<string, unknown> }).__cadFeature.dropFloor = {
    dz,
    worldMin: [worldBox.min.x, worldBox.min.y, worldBox.min.z] as [number, number, number],
    worldMax: [worldBox.max.x, worldBox.max.y, worldBox.max.z] as [number, number, number],
  };

  host.refreshBrowser();
}

registerFeature({
  id: 'solid-drop-floor',
  tab: 'body',
  group: 'solid.modify',
  labelKey: 'solid.dropFloor',
  icon: '⤓',
  run: (host) => runDropFloor(host),
});
