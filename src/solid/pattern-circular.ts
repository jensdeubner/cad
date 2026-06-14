/**
 * Circular pattern (arbitrary axis) — pure geometry kernel.
 *
 * Produces `count - 1` NEW geometries, each a copy of the source rotated by
 * `i * 2π / count` (i = 1 … count-1) about `axis` through `center`. No DOM, no
 * scene. Reference shape: `src/solid/primitives.ts`.
 */
import * as THREE from 'three';

/**
 * Rotate the source geometry into `count - 1` evenly-spaced copies around an
 * arbitrary axis through `center`. Each copy is a fresh BufferGeometry with
 * rotated positions and recomputed normals. Returns `[]` when `count < 2`.
 */
export function circularCopies(
  geometry: THREE.BufferGeometry,
  count: number,
  axis: THREE.Vector3,
  center: THREE.Vector3,
): THREE.BufferGeometry[] {
  if (!Number.isFinite(count) || count < 2) return [];

  const dir = axis.clone();
  if (dir.lengthSq() === 0) dir.set(0, 0, 1);
  dir.normalize();

  const copies: THREE.BufferGeometry[] = [];
  const step = (2 * Math.PI) / count;

  // Affine rotation about an arbitrary axis through `center`:
  //   M = T(center) · R(axis, θ) · T(-center)
  const toOrigin = new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z);
  const fromOrigin = new THREE.Matrix4().makeTranslation(center.x, center.y, center.z);

  for (let i = 1; i < count; i++) {
    const theta = i * step;
    const rot = new THREE.Matrix4().makeRotationAxis(dir, theta);
    const m = new THREE.Matrix4()
      .multiply(fromOrigin)
      .multiply(rot)
      .multiply(toOrigin);

    const copy = geometry.clone();
    copy.applyMatrix4(m);
    copy.computeVertexNormals();
    copies.push(copy);
  }

  return copies;
}
