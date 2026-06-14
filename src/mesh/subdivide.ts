/**
 * One-level triangle subdivision (4-to-1 midpoint split).
 *
 * Pure geometry transform — no DOM, no scene, no wasm. For every triangle
 * (a, b, c) it inserts the three edge midpoints (ab, bc, ca) and replaces the
 * triangle with the four sub-triangles
 *
 *        a
 *       / \
 *      ab--ca
 *     / \ / \
 *    b---bc--c
 *
 * i.e. (a, ab, ca), (ab, b, bc), (ca, bc, c) and (ab, bc, ca). This quadruples
 * the triangle count, raising mesh density for smoother downstream edits while
 * preserving the original surface exactly (midpoints lie on existing edges).
 *
 * Works from indexed OR non-indexed input, returns a fresh non-indexed
 * `THREE.BufferGeometry` with recomputed normals, never mutates the input and
 * never emits NaN.
 */
import * as THREE from 'three';

/**
 * Subdivide every triangle of `geometry` once into four sub-triangles.
 *
 * @param geometry Source geometry (left untouched).
 * @returns A NEW geometry whose triangle count is exactly 4× the input's, with
 *          recomputed vertex normals. Never mutates the input, never emits NaN.
 */
export function subdivideOnce(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const srcPos = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (!srcPos || srcPos.count === 0) {
    // Nothing to subdivide — hand back an independent empty copy.
    return geometry.clone();
  }

  // Resolve the triangle list (indexed or implicit) into per-corner accessors.
  const srcIndexAttr = geometry.getIndex();
  const triCount = srcIndexAttr ? srcIndexAttr.count / 3 : srcPos.count / 3;
  const cornerIndex = srcIndexAttr
    ? (k: number): number => srcIndexAttr.getX(k)
    : (k: number): number => k;

  // 4 sub-triangles per input triangle × 3 corners × 3 components.
  const out = new Float32Array(triCount * 4 * 3 * 3);
  let o = 0;

  // Scratch vectors for the three corners and the three edge midpoints.
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const bc = new THREE.Vector3();
  const ca = new THREE.Vector3();

  const push = (v: THREE.Vector3): void => {
    out[o++] = v.x;
    out[o++] = v.y;
    out[o++] = v.z;
  };

  for (let t = 0; t < triCount; t++) {
    a.fromBufferAttribute(srcPos, cornerIndex(t * 3));
    b.fromBufferAttribute(srcPos, cornerIndex(t * 3 + 1));
    c.fromBufferAttribute(srcPos, cornerIndex(t * 3 + 2));

    ab.copy(a).add(b).multiplyScalar(0.5);
    bc.copy(b).add(c).multiplyScalar(0.5);
    ca.copy(c).add(a).multiplyScalar(0.5);

    // Corner sub-triangles keep the original winding (so normals stay correct),
    // the central sub-triangle (ab, bc, ca) follows the same orientation.
    push(a);  push(ab); push(ca);
    push(ab); push(b);  push(bc);
    push(ca); push(bc); push(c);
    push(ab); push(bc); push(ca);
  }

  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.BufferAttribute(out, 3));
  result.computeVertexNormals();

  // Guard against zero-length normals (degenerate input triangles) which
  // normalisation would turn into NaN — sanitise to a safe unit vector.
  const normal = result.getAttribute('normal') as THREE.BufferAttribute;
  const narr = normal.array as Float32Array;
  for (let i = 0; i < narr.length; i += 3) {
    if (
      !Number.isFinite(narr[i]) ||
      !Number.isFinite(narr[i + 1]) ||
      !Number.isFinite(narr[i + 2]) ||
      (narr[i] === 0 && narr[i + 1] === 0 && narr[i + 2] === 0)
    ) {
      narr[i] = 0;
      narr[i + 1] = 0;
      narr[i + 2] = 1;
    }
  }

  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}
