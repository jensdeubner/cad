/**
 * Construction geometry builders — origin construction axes (X/Y/Z) and a
 * construction origin point.
 *
 * Pure three.js builders: no DOM, no scene, no FeatureHost. The returned
 * objects carry `userData.construction = true` so a feature can find and
 * clear previously-added construction overlays before re-adding fresh ones.
 *
 * Domain module for the feature-registry seam (see
 * `src/features/construct-axis-point.ts`).
 */
import * as THREE from 'three';

/** Marker every construction overlay carries, so it can be located + cleared. */
export const CONSTRUCTION_FLAG = 'construction';

/** Fusion-style axis colours: X red, Y green, Z blue. */
const AXIS_COLORS = {
  x: 0xff4d4d,
  y: 0x4dff7a,
  z: 0x4d9dff,
} as const;

/**
 * Build the three construction axes (X/Y/Z) as a single Object3D containing
 * dashed, colour-coded LineSegments through the origin. The axes run from
 * `-length` to `+length` along each world axis.
 */
export function buildConstructionAxes(length = 50): THREE.Object3D {
  const group = new THREE.Group();
  group.name = 'construction-axes';
  group.userData[CONSTRUCTION_FLAG] = true;

  const dashSize = Math.max(1, length / 25);
  const gapSize = dashSize * 0.5;

  const make = (axis: 'x' | 'y' | 'z', a: THREE.Vector3, b: THREE.Vector3): THREE.LineSegments => {
    const geom = new THREE.BufferGeometry().setFromPoints([a, b]);
    const mat = new THREE.LineDashedMaterial({
      color: AXIS_COLORS[axis],
      dashSize,
      gapSize,
      depthTest: false,
      transparent: true,
      opacity: 0.9,
    });
    const seg = new THREE.LineSegments(geom, mat);
    seg.computeLineDistances(); // required for dashed lines to render
    seg.name = `construction-axis-${axis}`;
    seg.userData[CONSTRUCTION_FLAG] = true;
    seg.renderOrder = 999;
    return seg;
  };

  group.add(make('x', new THREE.Vector3(-length, 0, 0), new THREE.Vector3(length, 0, 0)));
  group.add(make('y', new THREE.Vector3(0, -length, 0), new THREE.Vector3(0, length, 0)));
  group.add(make('z', new THREE.Vector3(0, 0, -length), new THREE.Vector3(0, 0, length)));

  return group;
}

/**
 * Build a small construction point marker (THREE.Points) at `pos`.
 */
export function buildConstructionPoint(pos: THREE.Vector3): THREE.Object3D {
  const geom = new THREE.BufferGeometry().setAttribute(
    'position',
    new THREE.Float32BufferAttribute([pos.x, pos.y, pos.z], 3),
  );
  const mat = new THREE.PointsMaterial({
    color: 0xffd24d,
    size: 8,
    sizeAttenuation: false,
    depthTest: false,
    transparent: true,
    opacity: 0.95,
  });
  const pts = new THREE.Points(geom, mat);
  pts.name = 'construction-origin-point';
  pts.userData[CONSTRUCTION_FLAG] = true;
  pts.renderOrder = 1000;
  return pts;
}
