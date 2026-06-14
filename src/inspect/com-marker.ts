/**
 * Center-of-mass marker + bounding-box visualisation helpers.
 *
 * Two layers:
 *   1. A pure analyser `centerOfMass(positions, indices)` — no DOM, no scene,
 *      just typed arrays in, `[x, y, z]` out. The centroid is the
 *      volume-weighted centroid of the signed tetrahedra spanned by each
 *      triangle and the origin (divergence theorem). For a closed,
 *      consistently-wound mesh this is the true center of mass of the enclosed
 *      solid. Degenerate meshes (≈0 enclosed volume — open/flat shells) fall
 *      back to the bounding-box center so the result is always finite.
 *   2. Thin three.js builders `buildComMarker` / `buildBboxBox` that turn a
 *      world-space point / box into overlay objects. Both tag their root with
 *      `userData.comOverlay = true` so a feature can clear the previous run's
 *      overlays in one pass.
 *
 * Units are millimetres throughout.
 */
import * as THREE from 'three';

/** Marker tag — overlay objects carry this so they can be found & cleared. */
export const COM_OVERLAY_TAG = 'comOverlay';

/**
 * Volume-weighted centroid (center of mass) of a triangle mesh.
 *
 * @param positions Flat XYZ vertex coordinates (length = 3 · vertexCount).
 * @param indices   Triangle indices, or `null` for a non-indexed mesh where
 *                  every consecutive triple of positions is one triangle.
 * @returns The center of mass as `[x, y, z]` in the same space as `positions`.
 *          Empty meshes return `[0, 0, 0]`.
 */
export function centerOfMass(
  positions: ArrayLike<number>,
  indices: ArrayLike<number> | null,
): [number, number, number] {
  const vertexCount = (positions.length / 3) | 0;
  const triangleCount = indices ? (indices.length / 3) | 0 : (vertexCount / 3) | 0;

  let signedVolume6 = 0; // Σ of signed tetra volumes × 6.
  let cx = 0;
  let cy = 0;
  let cz = 0;

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (let t = 0; t < triangleCount; t++) {
    const ia = (indices ? indices[t * 3] : t * 3) * 3;
    const ib = (indices ? indices[t * 3 + 1] : t * 3 + 1) * 3;
    const ic = (indices ? indices[t * 3 + 2] : t * 3 + 2) * 3;

    const ax = positions[ia];
    const ay = positions[ia + 1];
    const az = positions[ia + 2];
    const bx = positions[ib];
    const by = positions[ib + 1];
    const bz = positions[ib + 2];
    const ccx = positions[ic];
    const ccy = positions[ic + 1];
    const ccz = positions[ic + 2];

    // Bounding box (every vertex).
    if (ax < minX) minX = ax;
    if (ay < minY) minY = ay;
    if (az < minZ) minZ = az;
    if (ax > maxX) maxX = ax;
    if (ay > maxY) maxY = ay;
    if (az > maxZ) maxZ = az;
    if (bx < minX) minX = bx;
    if (by < minY) minY = by;
    if (bz < minZ) minZ = bz;
    if (bx > maxX) maxX = bx;
    if (by > maxY) maxY = by;
    if (bz > maxZ) maxZ = bz;
    if (ccx < minX) minX = ccx;
    if (ccy < minY) minY = ccy;
    if (ccz < minZ) minZ = ccz;
    if (ccx > maxX) maxX = ccx;
    if (ccy > maxY) maxY = ccy;
    if (ccz > maxZ) maxZ = ccz;

    // Signed volume of the tetra (origin, a, b, c) × 6 = a · (b × c).
    const v6 =
      ax * (by * ccz - bz * ccy) -
      ay * (bx * ccz - bz * ccx) +
      az * (bx * ccy - by * ccx);
    signedVolume6 += v6;

    // Tetra centroid = (a + b + c) / 4 (origin corner contributes 0);
    // weight by the signed volume (still × 6 here).
    cx += (ax + bx + ccx) * v6;
    cy += (ay + by + ccy) * v6;
    cz += (az + bz + ccz) * v6;
  }

  // Closed solid with non-degenerate enclosed volume → true center of mass.
  if (Math.abs(signedVolume6) > 1e-9) {
    const denom = 4 * signedVolume6; // (a+b+c)/4 weighted by v6, Σ / Σv6.
    return [cx / denom, cy / denom, cz / denom];
  }

  // Degenerate / open mesh → bbox center (finite fallback).
  if (triangleCount > 0 && minX <= maxX) {
    return [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
  }
  return [0, 0, 0];
}

/**
 * A small 3-axis cross + dot marking a point in world space. Tagged with
 * `userData.comOverlay = true`.
 *
 * @param pos  World-space marker position.
 * @param size Half-length of each cross arm in mm (default 5).
 */
export function buildComMarker(
  pos: THREE.Vector3 | [number, number, number],
  size = 5,
): THREE.Object3D {
  const p =
    pos instanceof THREE.Vector3 ? pos : new THREE.Vector3(pos[0], pos[1], pos[2]);

  const group = new THREE.Group();
  group.name = 'com-marker';
  group.position.copy(p);
  group.userData[COM_OVERLAY_TAG] = true;

  const color = 0xff3b30; // accent red — stands out against the body.
  const lineMat = new THREE.LineBasicMaterial({
    color,
    depthTest: false,
    transparent: true,
  });
  const crossGeom = new THREE.BufferGeometry();
  crossGeom.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [
        -size, 0, 0, size, 0, 0,
        0, -size, 0, 0, size, 0,
        0, 0, -size, 0, 0, size,
      ],
      3,
    ),
  );
  const cross = new THREE.LineSegments(crossGeom, lineMat);
  cross.renderOrder = 999;
  group.add(cross);

  const dotGeom = new THREE.SphereGeometry(size * 0.25, 16, 12);
  const dotMat = new THREE.MeshBasicMaterial({
    color,
    depthTest: false,
    transparent: true,
  });
  const dot = new THREE.Mesh(dotGeom, dotMat);
  dot.renderOrder = 999;
  group.add(dot);

  return group;
}

/**
 * A wireframe box outlining a world-space bounding box. Tagged with
 * `userData.comOverlay = true`. Empty boxes return an empty tagged group.
 */
export function buildBboxBox(box: THREE.Box3): THREE.Object3D {
  if (box.isEmpty()) {
    const empty = new THREE.Group();
    empty.name = 'com-bbox';
    empty.userData[COM_OVERLAY_TAG] = true;
    return empty;
  }
  const helper = new THREE.Box3Helper(box.clone(), new THREE.Color(0x4a90d9));
  helper.name = 'com-bbox';
  helper.userData[COM_OVERLAY_TAG] = true;
  const mat = helper.material as THREE.LineBasicMaterial;
  mat.depthTest = false;
  mat.transparent = true;
  helper.renderOrder = 998;
  return helper;
}

/**
 * Remove and dispose every overlay object tagged `userData.comOverlay` from a
 * parent group (e.g. `host.overlay`). Returns how many roots were removed.
 */
export function clearComOverlays(parent: THREE.Object3D): number {
  const stale = parent.children.filter((c) => c.userData[COM_OVERLAY_TAG] === true);
  for (const obj of stale) {
    parent.remove(obj);
    disposeObject(obj);
  }
  return stale.length;
}

/** Recursively dispose geometries and materials under an object. */
function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    const mesh = child as Partial<THREE.Mesh> & Partial<THREE.LineSegments>;
    mesh.geometry?.dispose?.();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat?.dispose?.();
  });
}
