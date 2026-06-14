/**
 * Separate disconnected shells (Fusion "Separate" / "Split into bodies").
 *
 * Pure geometry analysis + transform — no DOM, no scene, no wasm. Given a mesh
 * that physically contains several disconnected pieces (shells) packed into one
 * `BufferGeometry`, this splits it into one independent geometry per shell.
 *
 * Connectivity is decided on a WELDED clone of the input: two triangles belong
 * to the same shell iff they (transitively) share a welded vertex. Welding is
 * what makes coincident-but-distinct corners — the normal state of an STL or a
 * `BoxGeometry` (24 corners, 8 positions) — count as shared, so a single solid
 * box is reported as ONE shell, not twelve disjoint triangles.
 *
 * `connectedComponents` returns groups of WELDED-triangle indices (see its doc).
 * `separateShells` returns one fresh, NaN-safe geometry per component, each with
 * compacted vertices and recomputed normals. The input is never mutated.
 */
import * as THREE from 'three';
import { weldVertices } from './weld';

/** Resolve a (possibly non-indexed) geometry's triangle count. */
function triangleCount(geometry: THREE.BufferGeometry): number {
  const index = geometry.getIndex();
  if (index) return index.count / 3;
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
  return pos ? pos.count / 3 : 0;
}

/** Disjoint-set (union-find) with path compression + union by size. */
class UnionFind {
  private parent: Int32Array;
  private size: Int32Array;

  constructor(n: number) {
    this.parent = new Int32Array(n);
    this.size = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      this.parent[i] = i;
      this.size[i] = 1;
    }
  }

  find(x: number): number {
    let root = x;
    while (this.parent[root] !== root) root = this.parent[root];
    // Path compression.
    let cur = x;
    while (this.parent[cur] !== root) {
      const next = this.parent[cur];
      this.parent[cur] = root;
      cur = next;
    }
    return root;
  }

  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;
    if (this.size[ra] < this.size[rb]) {
      this.parent[ra] = rb;
      this.size[rb] += this.size[ra];
    } else {
      this.parent[rb] = ra;
      this.size[ra] += this.size[rb];
    }
  }
}

/**
 * Group triangles into connected components by shared-vertex connectivity.
 *
 * The geometry is welded (via `weldVertices`) so coincident corners merge onto a
 * single shared vertex; union-find then joins every pair of triangles that
 * reference a common welded vertex. Triangles that dropped out during welding
 * (degenerate) simply do not appear in any group.
 *
 * IMPORTANT — index space: the returned groups hold **welded-triangle indices**,
 * i.e. indices into the welded geometry's triangle list (the same order
 * `separateShells` consumes). They are NOT indices into the original geometry's
 * triangle list, which can differ once degenerate triangles are dropped. This is
 * the simpler, documented contract from the feature spec.
 *
 * @returns One array per component, each an array of welded-triangle indices.
 *          A single connected mesh yields exactly one group; an empty mesh
 *          yields an empty array.
 */
export function connectedComponents(geometry: THREE.BufferGeometry): number[][] {
  const welded = weldVertices(geometry);
  const index = welded.getIndex();
  // weldVertices always produces an indexed geometry when triangles survive.
  if (!index) return [];

  const triCount = index.count / 3;
  if (triCount === 0) return [];

  const uf = new UnionFind(triCount);

  // Map each welded vertex id -> the first triangle that touched it; subsequent
  // triangles touching the same vertex union with that first one.
  const vertexFirstTri = new Map<number, number>();
  for (let t = 0; t < triCount; t++) {
    for (let c = 0; c < 3; c++) {
      const v = index.getX(t * 3 + c);
      const seen = vertexFirstTri.get(v);
      if (seen === undefined) {
        vertexFirstTri.set(v, t);
      } else {
        uf.union(seen, t);
      }
    }
  }

  // Bucket triangles by their root representative.
  const groups = new Map<number, number[]>();
  for (let t = 0; t < triCount; t++) {
    const root = uf.find(t);
    let bucket = groups.get(root);
    if (!bucket) {
      bucket = [];
      groups.set(root, bucket);
    }
    bucket.push(t);
  }

  return Array.from(groups.values());
}

/**
 * Build one fresh geometry per connected shell of `geometry`.
 *
 * Each result subsets the welded triangles of one component, compacts the
 * referenced vertices into a tight position buffer, recomputes vertex normals
 * and sanitises any NaN normal to a safe unit vector. The input is untouched.
 *
 * @returns `length === connectedComponents(geometry).length`. A single connected
 *          mesh returns one geometry; an empty mesh returns an empty array.
 */
export function separateShells(geometry: THREE.BufferGeometry): THREE.BufferGeometry[] {
  const welded = weldVertices(geometry);
  const index = welded.getIndex();
  const srcPos = welded.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (!index || !srcPos) return [];

  const components = connectedComponents(geometry);
  const out: THREE.BufferGeometry[] = [];

  for (const tris of components) {
    // Remap only the vertices this component actually references.
    const remap = new Map<number, number>();
    const positions: number[] = [];
    const indices: number[] = [];

    for (const t of tris) {
      const corners: number[] = [];
      for (let c = 0; c < 3; c++) {
        const v = index.getX(t * 3 + c);
        let local = remap.get(v);
        if (local === undefined) {
          local = positions.length / 3;
          remap.set(v, local);
          positions.push(srcPos.getX(v), srcPos.getY(v), srcPos.getZ(v));
        }
        corners.push(local);
      }
      indices.push(corners[0], corners[1], corners[2]);
    }

    const g = new THREE.BufferGeometry();
    const posArr = new Float32Array(positions);
    g.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    const vertCount = positions.length / 3;
    const indexData =
      vertCount > 65535 ? Uint32Array.from(indices) : Uint16Array.from(indices);
    g.setIndex(new THREE.BufferAttribute(indexData, 1));
    g.computeVertexNormals();

    // Sanitise any zero-length / NaN normal so the result is guaranteed NaN-free.
    const normal = g.getAttribute('normal') as THREE.BufferAttribute;
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
    g.computeBoundingBox();
    g.computeBoundingSphere();
    out.push(g);
  }

  return out;
}
