/**
 * Vertex welding (Make Closed / Weld).
 *
 * Pure geometry transform — no DOM, no scene, no wasm. Merges coincident
 * vertices of a mesh that fall within an epsilon onto a single representative
 * (the average of all positions that quantize to the same epsilon grid cell),
 * rebuilds the triangle index, drops triangles that collapsed to fewer than 3
 * distinct corners, and recomputes vertex normals.
 *
 * This is the basis for watertight meshes and robust boolean operations: a
 * mesh whose shared edges reference a single shared vertex (rather than two
 * coincident-but-distinct ones) has no cracks along its seams.
 *
 * The result is a fresh `THREE.BufferGeometry`. The input is never mutated and
 * the output is guaranteed NaN-free.
 */
import * as THREE from 'three';

/** Number of distinct position vertices in `geometry` (the attribute count). */
export function countVertices(geometry: THREE.BufferGeometry): number {
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
  return pos ? pos.count : 0;
}

/**
 * Weld coincident vertices of `geometry` within `epsilon`.
 *
 * @param geometry Source geometry (left untouched).
 * @param epsilon  Grid cell size in model units; vertices that quantize to the
 *                 same cell are merged. Must be > 0. Default 1e-4.
 * @returns A NEW geometry with merged vertices, a rebuilt non-degenerate index
 *          and recomputed normals. Never mutates the input, never emits NaN.
 */
export function weldVertices(
  geometry: THREE.BufferGeometry,
  epsilon = 1e-4,
): THREE.BufferGeometry {
  const srcPos = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (!srcPos || srcPos.count === 0) {
    // Nothing to weld — hand back an independent empty copy.
    return geometry.clone();
  }

  const vertexCount = srcPos.count;
  // Sanitise epsilon: a non-positive or non-finite value would break the grid.
  const eps = Number.isFinite(epsilon) && epsilon > 0 ? epsilon : 1e-4;
  const invEps = 1 / eps;

  // Resolve the triangle list (indexed or implicit) into accessors so we can
  // rebuild it after welding.
  const srcIndexAttr = geometry.getIndex();
  const triCount = srcIndexAttr ? srcIndexAttr.count / 3 : vertexCount / 3;
  const getTriIndex = srcIndexAttr
    ? (k: number): number => srcIndexAttr.getX(k)
    : (k: number): number => k;

  // ── 1. Quantize each vertex onto the epsilon grid, merging duplicates ──
  // grid key (rounded "ix,iy,iz") → new (welded) vertex slot.
  const keyToSlot = new Map<string, number>();
  // For each source vertex: which welded slot it maps to.
  const vertSlot = new Int32Array(vertexCount);
  // Accumulated centroid sums per slot (so the representative is the average).
  const sumX: number[] = [];
  const sumY: number[] = [];
  const sumZ: number[] = [];
  const counts: number[] = [];

  for (let i = 0; i < vertexCount; i++) {
    const x = srcPos.getX(i);
    const y = srcPos.getY(i);
    const z = srcPos.getZ(i);
    // Round (not floor) so values straddling a cell boundary snap to the
    // nearest grid node — coincident vertices within eps collapse together.
    const ix = Math.round(x * invEps);
    const iy = Math.round(y * invEps);
    const iz = Math.round(z * invEps);
    const key = `${ix},${iy},${iz}`;
    let slot = keyToSlot.get(key);
    if (slot === undefined) {
      slot = sumX.length;
      keyToSlot.set(key, slot);
      sumX.push(0);
      sumY.push(0);
      sumZ.push(0);
      counts.push(0);
    }
    vertSlot[i] = slot;
    sumX[slot] += x;
    sumY[slot] += y;
    sumZ[slot] += z;
    counts[slot] += 1;
  }

  const slotCount = sumX.length;
  const positions = new Float32Array(slotCount * 3);
  for (let s = 0; s < slotCount; s++) {
    const c = counts[s];
    positions[s * 3] = sumX[s] / c;
    positions[s * 3 + 1] = sumY[s] / c;
    positions[s * 3 + 2] = sumZ[s] / c;
  }

  // ── 2. Rebuild the index, dropping degenerate triangles ───────────────
  const indices: number[] = [];
  for (let t = 0; t < triCount; t++) {
    const a = vertSlot[getTriIndex(t * 3)];
    const b = vertSlot[getTriIndex(t * 3 + 1)];
    const c = vertSlot[getTriIndex(t * 3 + 2)];
    // Fewer than 3 distinct corners → zero-area, drop it.
    if (a === b || b === c || a === c) continue;
    indices.push(a, b, c);
  }

  // ── 3. Assemble the new geometry ──────────────────────────────────────
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  if (indices.length > 0) {
    const indexData =
      slotCount > 65535 ? Uint32Array.from(indices) : Uint16Array.from(indices);
    out.setIndex(new THREE.BufferAttribute(indexData, 1));
  }
  out.computeVertexNormals();

  // computeVertexNormals normalises each accumulated normal; an isolated vertex
  // (no surviving triangle references it) keeps a zero-length normal which
  // normalisation turns into NaN. Sanitise to a safe unit vector so the result
  // is guaranteed NaN-free.
  const normal = out.getAttribute('normal') as THREE.BufferAttribute;
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
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}
