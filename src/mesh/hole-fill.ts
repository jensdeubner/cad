/**
 * Hole-fill (Make Watertight) — boundary-loop detection + fan triangulation.
 *
 * Pure geometry transform: no DOM, no scene, no wasm. Detects open boundary
 * loops of a mesh and closes each one with a centroid-fan, producing a fresh
 * watertight `THREE.BufferGeometry`. The input is never mutated and the output
 * is guaranteed NaN-free.
 *
 * A boundary edge is a (half-)edge whose undirected pair (i,j) is referenced by
 * exactly ONE triangle: an interior, manifold edge is shared by two triangles
 * (once in each direction), so any edge seen only once is on the open border.
 * The directed boundary edges chain head-to-tail into ordered closed loops.
 *
 * For each loop we add a centroid vertex (the average of the loop's corners)
 * and fan-triangulate it. The new faces are wound OPPOSITE to the single
 * existing adjacent boundary half-edge so their normals point outward,
 * consistent with the surrounding shell. We compose `weldVertices` first so a
 * mesh whose corners are coincident-but-distinct (e.g. a stock BoxGeometry)
 * still presents shared edges and yields well-formed loops.
 */
import * as THREE from 'three';
import { weldVertices } from './weld';

/** Pack two vertex indices into one stable key for an undirected edge. */
function undirectedKey(a: number, b: number): string {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

/** Stable key for a directed edge (a→b). */
function directedKey(a: number, b: number): string {
  return `${a}_${b}`;
}

/**
 * Find the open boundary loops of an INDEXED geometry.
 *
 * @returns An array of loops; each loop is an ordered array of vertex indices
 *          that form a closed cycle. Empty when the mesh is already watertight
 *          (or has no index / no triangles). Robust to multiple holes.
 */
export function findBoundaryLoops(geometry: THREE.BufferGeometry): number[][] {
  const index = geometry.getIndex();
  if (!index) return [];
  const triCount = index.count / 3;

  // Count how many triangles reference each undirected edge.
  const edgeUse = new Map<string, number>();
  for (let t = 0; t < triCount; t++) {
    const a = index.getX(t * 3);
    const b = index.getX(t * 3 + 1);
    const c = index.getX(t * 3 + 2);
    for (const [u, v] of [[a, b], [b, c], [c, a]] as const) {
      const k = undirectedKey(u, v);
      edgeUse.set(k, (edgeUse.get(k) ?? 0) + 1);
    }
  }

  // Collect the directed boundary half-edges: those whose undirected pair is
  // used by exactly one triangle. The direction is the triangle's winding.
  // next: tail vertex → head vertex (each boundary tail has one outgoing edge).
  const next = new Map<number, number>();
  const directedSeen = new Set<string>();
  for (let t = 0; t < triCount; t++) {
    const a = index.getX(t * 3);
    const b = index.getX(t * 3 + 1);
    const c = index.getX(t * 3 + 2);
    for (const [u, v] of [[a, b], [b, c], [c, a]] as const) {
      if (edgeUse.get(undirectedKey(u, v)) === 1) {
        const dk = directedKey(u, v);
        if (!directedSeen.has(dk)) {
          directedSeen.add(dk);
          next.set(u, v);
        }
      }
    }
  }

  // Chain the directed boundary edges head-to-tail into ordered closed loops.
  const loops: number[][] = [];
  const visited = new Set<number>();
  for (const start of next.keys()) {
    if (visited.has(start)) continue;
    const loop: number[] = [];
    let current = start;
    // Walk until we return to the start or hit a broken chain.
    while (current !== undefined && !visited.has(current)) {
      visited.add(current);
      loop.push(current);
      const nxt = next.get(current);
      if (nxt === undefined) break;
      current = nxt;
    }
    if (loop.length >= 3) loops.push(loop);
  }

  return loops;
}

/**
 * Triangle count of a geometry (indexed or implicit).
 */
function triangleCount(geometry: THREE.BufferGeometry): number {
  const idx = geometry.getIndex();
  if (idx) return idx.count / 3;
  return (geometry.getAttribute('position')?.count ?? 0) / 3;
}

/**
 * Close every open boundary loop of `geometry` with a centroid fan.
 *
 * Works on a welded clone (see `weldVertices`) so coincident corners share one
 * vertex and edges chain correctly. For each loop a centroid vertex is appended
 * and the loop is fan-triangulated, with winding chosen so the new faces' normals
 * point outward (opposite the existing single adjacent boundary half-edge).
 *
 * @returns A NEW watertight geometry plus the number of holes filled and the
 *          total number of triangles added. Never mutates the input, never
 *          emits NaN.
 */
export function fillHoles(geometry: THREE.BufferGeometry): {
  geometry: THREE.BufferGeometry;
  holesFilled: number;
  addedTriangles: number;
} {
  // Weld first so coincident-but-distinct corners share a vertex; this gives
  // well-formed loops and a watertight result.
  const welded = weldVertices(geometry);

  const srcPos = welded.getAttribute('position') as THREE.BufferAttribute | undefined;
  const srcIndex = welded.getIndex();
  if (!srcPos || srcPos.count === 0 || !srcIndex) {
    // Nothing to do — hand back the welded copy unchanged.
    return { geometry: welded, holesFilled: 0, addedTriangles: 0 };
  }

  const loops = findBoundaryLoops(welded);
  if (loops.length === 0) {
    return { geometry: welded, holesFilled: 0, addedTriangles: 0 };
  }

  // The directed boundary edges of `welded` tell us the outward winding: the
  // single adjacent boundary half-edge goes tail→head, so the cap triangle must
  // be wound the opposite way (head, tail, centroid) for an outward normal.
  const positions: number[] = [];
  for (let i = 0; i < srcPos.count; i++) {
    positions.push(srcPos.getX(i), srcPos.getY(i), srcPos.getZ(i));
  }
  const indices: number[] = [];
  for (let k = 0; k < srcIndex.count; k++) indices.push(srcIndex.getX(k));

  let addedTriangles = 0;
  for (const loop of loops) {
    // Centroid of the loop's corners.
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const vi of loop) {
      cx += positions[vi * 3];
      cy += positions[vi * 3 + 1];
      cz += positions[vi * 3 + 2];
    }
    const n = loop.length;
    cx /= n;
    cy /= n;
    cz /= n;
    const centroid = positions.length / 3;
    positions.push(cx, cy, cz);

    // Fan-triangulate. The loop edges (loop[i] → loop[i+1]) are the existing
    // boundary half-edges; wind the cap opposite (head, tail, centroid).
    for (let i = 0; i < n; i++) {
      const tail = loop[i];
      const head = loop[(i + 1) % n];
      indices.push(head, tail, centroid);
      addedTriangles++;
    }
  }

  // Assemble the new geometry.
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  const vertCount = positions.length / 3;
  const indexData =
    vertCount > 65535 ? Uint32Array.from(indices) : Uint16Array.from(indices);
  out.setIndex(new THREE.BufferAttribute(indexData, 1));
  out.computeVertexNormals();

  // Sanitise NaN / zero-length normals (mirrors weld.ts): an isolated vertex
  // would otherwise normalise to NaN.
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

  return { geometry: out, holesFilled: loops.length, addedTriangles };
}

/** Triangle count helper exported for callers (features) to report stats. */
export { triangleCount };
