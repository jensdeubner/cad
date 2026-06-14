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

  // World-space copy of the geometry (mirrors solid-bbox-body / inspect-com):
  // the pure helper then computes how far to lift so world min.z lands on 0.
  body.meshGroup.updateMatrixWorld(true);
  const worldGeom = geom.clone();
  worldGeom.applyMatrix4(body.meshGroup.matrixWorld);
  const dz = dropToFloor(worldGeom).dz;
  worldGeom.dispose();

  const stash = () => {
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
  };

  // Already on the floor → don't pollute the undo/feature history; still report.
  if (Math.abs(dz) < 1e-4) {
    stash();
    host.setStatus(host.t('status.dropFloorAlready'));
    return;
  }

  host.pushMeshUndo(host.t('solid.dropFloor'));
  // Apply the lift on the body's transform CANONICALLY (re-using
  // replaceBodyGeometry would re-center the mesh and undo the shift).
  body.transform = { ...body.transform, posZ: body.transform.posZ + dz };
  host.cadScene.applyBodyTransform(body.id);
  host.refreshBounds();

  host.markFeatureDone('solid-drop-floor', host.t('solid.dropFloor'));
  host.setStatus(host.t('status.dropFloorDone'));
  stash();
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
