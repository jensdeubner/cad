/**
 * Laplace-Glättung (Laplacian smoothing).
 *
 * Pure geometry transform — no DOM, no scene, no wasm. Moves each vertex toward
 * the average position of its edge-connected neighbours, which damps high-
 * frequency surface noise (typical of 3D scans) while preserving overall shape.
 *
 * Distinct from a localized brush: this is a whole-body, one-click smooth.
 *
 * Coincident corners are welded onto a single shared vertex first, so that
 * triangles meeting at a seam move together (an un-welded box would keep its
 * three coincident copies per corner independent and never converge). After
 * smoothing the topology is rebuilt with the merged vertices and normals are
 * recomputed.
 *
 * The result is a fresh `THREE.BufferGeometry`. The input is never mutated and
 * the output is guaranteed NaN-free. Stable (no explosion) for small `lambda`
 * and a low iteration count; an empty geometry is handled gracefully.
 */
import * as THREE from 'three';

/** Number of distinct position vertices in `geometry` (the attribute count). */
export function countVertices(geometry: THREE.BufferGeometry): number {
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
  return pos ? pos.count : 0;
}

/**
 * Laplacian-smooth `geometry`.
 *
 * @param geometry   Source geometry (left untouched).
 * @param iterations How many relaxation passes to run. Clamped to >= 0.
 * @param lambda     Per-iteration step toward the neighbour average, in [0, 1].
 *                   Small values (~0.5) keep the result stable.
 * @returns A NEW geometry with relaxed vertex positions, the same welded
 *          topology and recomputed normals. Never mutates the input, never
 *          emits NaN.
 */
export function laplacianSmooth(
  geometry: THREE.BufferGeometry,
  iterations = 2,
  lambda = 0.5,
): THREE.BufferGeometry {
  const srcPos = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (!srcPos || srcPos.count === 0) {
    // Nothing to smooth — hand back an independent empty copy.
    return geometry.clone();
  }

  // Sanitise parameters: non-finite / negative values must not corrupt the run.
  const iters = Number.isFinite(iterations) ? Math.max(0, Math.floor(iterations)) : 0;
  const lam =
    Number.isFinite(lambda) && lambda > 0 ? Math.min(1, lambda) : 0;

  const srcVertexCount = srcPos.count;
  const eps = 1e-5;
  // Round the reciprocal: 1/1e-5 is 99999.99999999999 in IEEE-754, which would
  // hash vertices at grid boundaries inconsistently.
  const invEps = Math.round(1 / eps);

  // Resolve the triangle list (indexed or implicit).
  const srcIndexAttr = geometry.getIndex();
  const triCount = srcIndexAttr ? srcIndexAttr.count / 3 : srcVertexCount / 3;
  const getTriIndex = srcIndexAttr
    ? (k: number): number => srcIndexAttr.getX(k)
    : (k: number): number => k;

  // ── 1. Weld coincident positions so shared corners share one vertex ────
  const keyToSlot = new Map<string, number>();
  const vertSlot = new Int32Array(srcVertexCount);
  const slotX: number[] = [];
  const slotY: number[] = [];
  const slotZ: number[] = [];

  for (let i = 0; i < srcVertexCount; i++) {
    const x = srcPos.getX(i);
    const y = srcPos.getY(i);
    const z = srcPos.getZ(i);
    const key = `${Math.round(x * invEps)},${Math.round(y * invEps)},${Math.round(z * invEps)}`;
    let slot = keyToSlot.get(key);
    if (slot === undefined) {
      slot = slotX.length;
      keyToSlot.set(key, slot);
      slotX.push(x);
      slotY.push(y);
      slotZ.push(z);
    }
    vertSlot[i] = slot;
  }

  const slotCount = slotX.length;

  // ── 2. Build vertex adjacency from triangle edges (deduplicated) ───────
  const neighbours: Set<number>[] = new Array(slotCount);
  for (let s = 0; s < slotCount; s++) neighbours[s] = new Set<number>();

  const triSlots: number[] = []; // welded triangle index, degenerates dropped
  for (let t = 0; t < triCount; t++) {
    const a = vertSlot[getTriIndex(t * 3)];
    const b = vertSlot[getTriIndex(t * 3 + 1)];
    const c = vertSlot[getTriIndex(t * 3 + 2)];
    if (a === b || b === c || a === c) continue; // zero-area, skip
    neighbours[a].add(b);
    neighbours[a].add(c);
    neighbours[b].add(a);
    neighbours[b].add(c);
    neighbours[c].add(a);
    neighbours[c].add(b);
    triSlots.push(a, b, c);
  }

  // Flatten adjacency into typed arrays for cache-friendly iteration.
  const adjStart = new Int32Array(slotCount + 1);
  let total = 0;
  for (let s = 0; s < slotCount; s++) {
    adjStart[s] = total;
    total += neighbours[s].size;
  }
  adjStart[slotCount] = total;
  const adj = new Int32Array(total);
  {
    let w = 0;
    for (let s = 0; s < slotCount; s++) {
      for (const n of neighbours[s]) adj[w++] = n;
    }
  }

  // ── 3. Relaxation passes (double-buffered to read the previous pass) ───
  let cur = new Float64Array(slotCount * 3);
  for (let s = 0; s < slotCount; s++) {
    cur[s * 3] = slotX[s];
    cur[s * 3 + 1] = slotY[s];
    cur[s * 3 + 2] = slotZ[s];
  }
  let next = new Float64Array(slotCount * 3);

  for (let it = 0; it < iters && lam > 0; it++) {
    for (let s = 0; s < slotCount; s++) {
      const start = adjStart[s];
      const end = adjStart[s + 1];
      const degree = end - start;
      const vx = cur[s * 3];
      const vy = cur[s * 3 + 1];
      const vz = cur[s * 3 + 2];
      if (degree === 0) {
        // Isolated vertex (no surviving triangle) — leave it where it is.
        next[s * 3] = vx;
        next[s * 3 + 1] = vy;
        next[s * 3 + 2] = vz;
        continue;
      }
      let sx = 0;
      let sy = 0;
      let sz = 0;
      for (let k = start; k < end; k++) {
        const n = adj[k];
        sx += cur[n * 3];
        sy += cur[n * 3 + 1];
        sz += cur[n * 3 + 2];
      }
      const inv = 1 / degree;
      // v + lambda * (avgNeighbour - v)
      next[s * 3] = vx + lam * (sx * inv - vx);
      next[s * 3 + 1] = vy + lam * (sy * inv - vy);
      next[s * 3 + 2] = vz + lam * (sz * inv - vz);
    }
    const swap = cur;
    cur = next;
    next = swap;
  }

  // ── 4. Assemble the new geometry ──────────────────────────────────────
  const positions = new Float32Array(slotCount * 3);
  for (let i = 0; i < positions.length; i++) {
    const v = cur[i];
    positions[i] = Number.isFinite(v) ? v : 0;
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  if (triSlots.length > 0) {
    const indexData =
      slotCount > 65535 ? Uint32Array.from(triSlots) : Uint16Array.from(triSlots);
    out.setIndex(new THREE.BufferAttribute(indexData, 1));
  }
  out.computeVertexNormals();

  // Sanitise normals: an isolated vertex keeps a zero-length normal which
  // normalisation turns into NaN. Replace with a safe unit vector.
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
