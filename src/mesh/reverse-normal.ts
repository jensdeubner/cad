/**
 * Reverse Normal (Mesh) — pure geometry helpers.
 *
 * Flipping triangle winding inverts every face's outward direction, the common
 * fix for scans imported with inverted normals. No DOM, no scene — just buffer
 * math on a THREE.BufferGeometry. Reference domain module for the
 * feature-registry seam (see `src/features/mesh-reverse-normal.ts`).
 */
import * as THREE from 'three';

/**
 * Return a NEW geometry with reversed triangle winding (swap the 2nd and 3rd
 * index of every triangle) and freshly computed vertex normals. Handles both
 * indexed and non-indexed geometries; the input geometry is left untouched.
 */
export function reverseWinding(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = geometry.clone();
  const index = out.getIndex();

  if (index) {
    // Indexed: swap b/c of each (a, b, c) triple in the index buffer.
    const src = index.array;
    const flipped = new Uint32Array(src.length);
    for (let i = 0; i + 2 < src.length; i += 3) {
      flipped[i] = src[i];
      flipped[i + 1] = src[i + 2];
      flipped[i + 2] = src[i + 1];
    }
    out.setIndex(new THREE.BufferAttribute(flipped, 1));
  } else {
    // Non-indexed: each triangle is 3 consecutive vertices (9 floats / 3 comps).
    const pos = out.getAttribute('position') as THREE.BufferAttribute;
    const itemSize = pos.itemSize;
    const arr = pos.array as ArrayLike<number>;
    const flipped = new Float32Array(arr.length);
    flipped.set(arr as unknown as ArrayLike<number>);
    const stride = itemSize;
    for (let t = 0; t + 3 * stride - 1 < arr.length; t += 3 * stride) {
      // Swap vertex 2 (offset stride) with vertex 3 (offset 2*stride).
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
 * Signed volume of a closed triangle mesh via the signed-tetrahedron sum
 * (1/6 · Σ v0 · (v1 × v2)). Its sign flips with the winding order, so it is a
 * cheap, robust witness that `reverseWinding` actually inverted the mesh.
 *
 * `indices` may be `null` for non-indexed geometry (sequential triangles).
 */
export function signedVolume(
  positions: ArrayLike<number>,
  indices: ArrayLike<number> | null,
): number {
  let sum = 0;
  const tri = (ia: number, ib: number, ic: number): void => {
    const ax = positions[ia * 3], ay = positions[ia * 3 + 1], az = positions[ia * 3 + 2];
    const bx = positions[ib * 3], by = positions[ib * 3 + 1], bz = positions[ib * 3 + 2];
    const cx = positions[ic * 3], cy = positions[ic * 3 + 1], cz = positions[ic * 3 + 2];
    // ax · (b × c)
    sum +=
      ax * (by * cz - bz * cy) +
      ay * (bz * cx - bx * cz) +
      az * (bx * cy - by * cx);
  };

  if (indices) {
    for (let i = 0; i + 2 < indices.length; i += 3) {
      tri(indices[i], indices[i + 1], indices[i + 2]);
    }
  } else {
    const vertexCount = positions.length / 3;
    for (let v = 0; v + 2 < vertexCount; v += 3) {
      tri(v, v + 1, v + 2);
    }
  }
  return sum / 6;
}
