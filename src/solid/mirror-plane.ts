/**
 * Spiegeln über Ursprungsebene (Mirror across an origin plane) — pure geometry.
 *
 * Reflecting a mesh across a coordinate plane negates the single coordinate
 * normal to that plane (xy → z, xz → y, yz → x). A pure reflection is an
 * orientation-reversing map, so it flips every triangle's winding; to keep
 * outward normals pointing outward we additionally REVERSE the winding, then
 * recompute vertex normals. No DOM, no scene — just buffer math on a
 * THREE.BufferGeometry. Reference domain module for the feature-registry seam
 * (see `src/features/solid-mirror-plane.ts`).
 */
import * as THREE from 'three';

export type MirrorPlane = 'xy' | 'xz' | 'yz';

/** Component index (0=x, 1=y, 2=z) negated by a reflection across `plane`. */
function negatedAxis(plane: MirrorPlane): number {
  switch (plane) {
    case 'xy':
      return 2; // negate z
    case 'xz':
      return 1; // negate y
    case 'yz':
      return 0; // negate x
  }
}

/**
 * Return a NEW geometry reflected across the given origin plane. Negates the
 * coordinate normal to the plane for every position, reverses triangle winding
 * (so outward normals stay outward after reflection) and recomputes vertex
 * normals. Handles both indexed and non-indexed geometries; the input is left
 * untouched.
 */
export function mirrorGeometry(
  geometry: THREE.BufferGeometry,
  plane: MirrorPlane,
): THREE.BufferGeometry {
  const out = geometry.clone();
  const axis = negatedAxis(plane);

  // 1. Negate the normal-axis component of every vertex position.
  const pos = out.getAttribute('position') as THREE.BufferAttribute;
  const itemSize = pos.itemSize;
  const src = pos.array as ArrayLike<number>;
  const mirrored = new Float32Array(src.length);
  mirrored.set(src as unknown as ArrayLike<number>);
  for (let i = axis; i < mirrored.length; i += itemSize) {
    mirrored[i] = -mirrored[i];
  }
  out.setAttribute('position', new THREE.BufferAttribute(mirrored, itemSize));

  // 2. Reverse triangle winding so the reflection keeps outward normals outward.
  const index = out.getIndex();
  if (index) {
    const idx = index.array;
    const flipped = new Uint32Array(idx.length);
    for (let i = 0; i + 2 < idx.length; i += 3) {
      flipped[i] = idx[i];
      flipped[i + 1] = idx[i + 2];
      flipped[i + 2] = idx[i + 1];
    }
    out.setIndex(new THREE.BufferAttribute(flipped, 1));
  } else {
    // Non-indexed: each triangle is 3 consecutive vertices.
    const arr = out.getAttribute('position').array as ArrayLike<number>;
    const flipped = new Float32Array(arr.length);
    flipped.set(arr as unknown as ArrayLike<number>);
    const stride = itemSize;
    for (let t = 0; t + 3 * stride - 1 < arr.length; t += 3 * stride) {
      for (let c = 0; c < stride; c++) {
        const b = t + stride + c;
        const cc = t + 2 * stride + c;
        const tmp = flipped[b];
        flipped[b] = flipped[cc];
        flipped[cc] = tmp;
      }
    }
    out.setAttribute('position', new THREE.BufferAttribute(flipped, itemSize));
  }

  out.computeVertexNormals();
  return out;
}

/**
 * Convenience for tests: build a (deliberately off-centre) box and mirror it
 * across `plane`, returning both geometries so a unit test can compare the
 * negated axis and the reversed winding.
 */
export function mirrorBox(
  box: THREE.BufferGeometry,
  plane: MirrorPlane,
): THREE.BufferGeometry {
  return mirrorGeometry(box, plane);
}
