/**
 * Remesh (uniform refinement to a target edge length).
 *
 * Pure geometry transform — no DOM, no scene, no wasm. Repeatedly applies a
 * uniform 1→4 midpoint subdivision until every triangle's longest edge is no
 * longer than a target length (or an iteration cap is reached).
 *
 * Midpoint subdivision keeps every new vertex exactly on the original straight
 * edge it splits, so planar faces are preserved EXACTLY (no geometric drift):
 * surface area, volume and silhouette are unchanged — only the triangle density
 * rises. Edge midpoints are shared across adjacent triangles via a Map keyed by
 * the sorted vertex-index pair, so the result stays watertight (no T-junctions,
 * no cracks).
 *
 * Composes `weldVertices` for a watertight, index-shared starting point. The
 * result is a fresh `THREE.BufferGeometry`; the input is never mutated and the
 * output is guaranteed NaN-free.
 */
import * as THREE from 'three';
import { weldVertices } from './weld';

/** Resolve a per-corner vertex index accessor for indexed or implicit geometry. */
function cornerAccessor(geometry: THREE.BufferGeometry): {
  triCount: number;
  cornerIndex: (k: number) => number;
} {
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
  const idx = geometry.getIndex();
  if (idx) {
    return { triCount: idx.count / 3, cornerIndex: (k: number) => idx.getX(k) };
  }
  const vertCount = pos ? pos.count : 0;
  return { triCount: vertCount / 3, cornerIndex: (k: number) => k };
}

/**
 * Length of the longest triangle edge in `geometry` (model units). Works on
 * indexed or non-indexed input. Returns 0 for empty geometry.
 */
export function maxEdgeLength(geometry: THREE.BufferGeometry): number {
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (!pos || pos.count === 0) return 0;

  const { triCount, cornerIndex } = cornerAccessor(geometry);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let maxSq = 0;

  for (let t = 0; t < triCount; t++) {
    a.fromBufferAttribute(pos, cornerIndex(t * 3));
    b.fromBufferAttribute(pos, cornerIndex(t * 3 + 1));
    c.fromBufferAttribute(pos, cornerIndex(t * 3 + 2));
    const ab = a.distanceToSquared(b);
    const bc = b.distanceToSquared(c);
    const ca = c.distanceToSquared(a);
    if (ab > maxSq) maxSq = ab;
    if (bc > maxSq) maxSq = bc;
    if (ca > maxSq) maxSq = ca;
  }
  return Math.sqrt(maxSq);
}

/** True when every triangle's longest edge is <= `targetLen` (squared compare). */
function allEdgesWithin(
  pos: THREE.BufferAttribute,
  idx: THREE.BufferAttribute,
  targetSq: number,
): boolean {
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const triCount = idx.count / 3;
  for (let t = 0; t < triCount; t++) {
    a.fromBufferAttribute(pos, idx.getX(t * 3));
    b.fromBufferAttribute(pos, idx.getX(t * 3 + 1));
    c.fromBufferAttribute(pos, idx.getX(t * 3 + 2));
    if (a.distanceToSquared(b) > targetSq) return false;
    if (b.distanceToSquared(c) > targetSq) return false;
    if (c.distanceToSquared(a) > targetSq) return false;
  }
  return true;
}

/**
 * One uniform 1→4 midpoint subdivision of an INDEXED, vertex-shared geometry.
 *
 * Edge midpoints are inserted once per unique edge (keyed by the sorted
 * vertex-index pair "min_max") and shared by both adjacent triangles, so the
 * topology stays watertight. Returns a new indexed geometry; positions only —
 * normals/bounds are computed once at the end of `refineToEdgeLength`.
 */
function subdivideIndexed(pos: THREE.BufferAttribute, idx: THREE.BufferAttribute): {
  positions: number[];
  indices: number[];
} {
  // Seed the working vertex list with all existing positions.
  const positions: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
  }

  // Cache for shared edge midpoints: "min_max" → new vertex index.
  const midpointOf = new Map<string, number>();
  const midpoint = (i: number, j: number): number => {
    const lo = i < j ? i : j;
    const hi = i < j ? j : i;
    const key = `${lo}_${hi}`;
    const cached = midpointOf.get(key);
    if (cached !== undefined) return cached;
    const mx = (positions[lo * 3] + positions[hi * 3]) * 0.5;
    const my = (positions[lo * 3 + 1] + positions[hi * 3 + 1]) * 0.5;
    const mz = (positions[lo * 3 + 2] + positions[hi * 3 + 2]) * 0.5;
    const newIndex = positions.length / 3;
    positions.push(mx, my, mz);
    midpointOf.set(key, newIndex);
    return newIndex;
  };

  const indices: number[] = [];
  const triCount = idx.count / 3;
  for (let t = 0; t < triCount; t++) {
    const a = idx.getX(t * 3);
    const b = idx.getX(t * 3 + 1);
    const c = idx.getX(t * 3 + 2);
    const ab = midpoint(a, b);
    const bc = midpoint(b, c);
    const ca = midpoint(c, a);
    // Four sub-triangles, keeping the original winding so normals stay correct.
    indices.push(a, ab, ca);
    indices.push(ab, b, bc);
    indices.push(ca, bc, c);
    indices.push(ab, bc, ca);
  }

  return { positions, indices };
}

/** Sanitise zero-length / non-finite normals to a safe unit vector (no NaN). */
function sanitiseNormals(geometry: THREE.BufferGeometry): void {
  const normal = geometry.getAttribute('normal') as THREE.BufferAttribute | undefined;
  if (!normal) return;
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
}

/** Build a finished indexed geometry from raw position/index arrays. */
function assemble(positions: number[], indices: number[]): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  out.setAttribute(
    'position',
    new THREE.BufferAttribute(Float32Array.from(positions), 3),
  );
  if (indices.length > 0) {
    const vertCount = positions.length / 3;
    const indexData =
      vertCount > 65535 ? Uint32Array.from(indices) : Uint16Array.from(indices);
    out.setIndex(new THREE.BufferAttribute(indexData, 1));
  }
  out.computeVertexNormals();
  sanitiseNormals(out);
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

/**
 * Refine `geometry` so every triangle edge is <= `targetLen`, by repeated
 * uniform midpoint subdivision (1→4) of ALL triangles. Starts from a welded
 * (index-shared, watertight) copy so adjacent triangles reuse midpoints and the
 * result has no cracks. Planar faces are preserved exactly.
 *
 * @param geometry      Source geometry (left untouched).
 * @param targetLen     Maximum allowed edge length. Must be > 0; a non-positive
 *                      or non-finite value is rejected (returns a welded clone
 *                      with zero iterations).
 * @param maxIterations Hard cap on subdivision passes (default 6) — each pass
 *                      quadruples the triangle count, so this bounds blow-up.
 * @returns A NEW geometry plus the number of triangles added and passes run.
 *          Never mutates the input, never emits NaN.
 */
export function refineToEdgeLength(
  geometry: THREE.BufferGeometry,
  targetLen: number,
  maxIterations = 6,
): { geometry: THREE.BufferGeometry; addedTriangles: number; iterations: number } {
  // Watertight, index-shared starting point.
  let current = weldVertices(geometry);

  const triOf = (g: THREE.BufferGeometry): number => {
    const idx = g.getIndex();
    if (idx) return idx.count / 3;
    return (g.getAttribute('position')?.count ?? 0) / 3;
  };
  const startTris = triOf(current);

  // Guard: a non-positive / non-finite target would loop until the cap with no
  // meaningful stopping condition. Reject it and hand back the welded clone.
  if (!Number.isFinite(targetLen) || targetLen <= 0) {
    return { geometry: current, addedTriangles: 0, iterations: 0 };
  }

  const cap =
    Number.isFinite(maxIterations) && maxIterations > 0
      ? Math.floor(maxIterations)
      : 6;
  const targetSq = targetLen * targetLen;

  let iterations = 0;
  for (let pass = 0; pass < cap; pass++) {
    const pos = current.getAttribute('position') as THREE.BufferAttribute;
    const idx = current.getIndex();
    if (!pos || !idx || pos.count === 0) break;
    if (allEdgesWithin(pos, idx, targetSq)) break;

    const { positions, indices } = subdivideIndexed(pos, idx);
    current = assemble(positions, indices);
    iterations++;
  }

  const addedTriangles = triOf(current) - startTris;
  return { geometry: current, addedTriangles, iterations };
}
