/**
 * cad-script · typed topological selectors (§5 of the architecture doc)
 *
 * The architecture doc names topological naming as "the actual stumbling block":
 * position-based ids (`Face13` → `Face14`) get renumbered on edit and downstream
 * features break. The remedy it prescribes — and what this module implements —
 * is to reference geometry by *property* through typed, composable selectors
 * rather than by id:
 *
 *   solid.faces().max(f => f.position[2])      // "the topmost face"
 *   solid.edges().filterByPosition('x', 5)     // "edges past x = 5"
 *   solid.faces(Select.LAST)                   // "faces from the most recent op"
 *
 * Faces are recovered by clustering coplanar, edge-connected triangles; edges
 * are the sharp/feature edges between differently-oriented faces. `Select.LAST`
 * / `Select.NEW` lean on the per-triangle provenance `tag` that CSG preserves.
 */
import { Mesh, Vec3, Bounds } from './mesh';

export enum Select {
  /** Every shape. */
  ALL = 'all',
  /** Shapes from the most recent operation (highest provenance tag). */
  LAST = 'last',
  /** Alias of LAST — newly created geometry. */
  NEW = 'new',
}

export type Axis = 'x' | 'y' | 'z';
const AXIS_INDEX: Record<Axis, number> = { x: 0, y: 1, z: 2 };

export interface FaceInfo {
  kind: 'face';
  id: number;
  normal: Vec3;
  centroid: Vec3;
  area: number;
  bounds: Bounds;
  triCount: number;
  tag: number;
  /** Representative point for position queries (the centroid). */
  position: Vec3;
}

export interface EdgeInfo {
  kind: 'edge';
  id: number;
  a: Vec3;
  b: Vec3;
  midpoint: Vec3;
  direction: Vec3;
  length: number;
  position: Vec3;
}

export interface VertexInfo {
  kind: 'vertex';
  id: number;
  position: Vec3;
}

export type Shape = FaceInfo | EdgeInfo | VertexInfo;

/**
 * A composable, chainable list of selected shapes — the build123d `ShapeList`
 * analogue. Every method returns a fresh `ShapeList`, so selectors read like a
 * sentence and never mutate.
 */
export class ShapeList<T extends Shape> {
  constructor(readonly items: T[]) {}

  get length(): number {
    return this.items.length;
  }

  filter(pred: (s: T) => boolean): ShapeList<T> {
    return new ShapeList(this.items.filter(pred));
  }

  /** Keep shapes whose representative point on `axis` lies within [min,max]. */
  filterByPosition(axis: Axis, min = -Infinity, max = Infinity): ShapeList<T> {
    const k = AXIS_INDEX[axis];
    return new ShapeList(this.items.filter((s) => s.position[k] >= min - 1e-6 && s.position[k] <= max + 1e-6));
  }

  /** Keep faces whose normal is within `tolDeg` of `dir` (faces only). */
  filterByNormal(dir: Vec3, tolDeg = 1): ShapeList<T> {
    const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
    const d: Vec3 = [dir[0] / len, dir[1] / len, dir[2] / len];
    const cosTol = Math.cos((tolDeg * Math.PI) / 180);
    return new ShapeList(
      this.items.filter((s) => {
        if (s.kind !== 'face') return false;
        const n = (s as FaceInfo).normal;
        return n[0] * d[0] + n[1] * d[1] + n[2] * d[2] >= cosTol;
      }),
    );
  }

  sortBy(metric: (s: T) => number): ShapeList<T> {
    return new ShapeList(this.items.slice().sort((a, b) => metric(a) - metric(b)));
  }

  /** Single shape maximising `metric` (empty list → empty list). */
  max(metric: (s: T) => number): ShapeList<T> {
    if (!this.items.length) return new ShapeList<T>([]);
    let best = this.items[0];
    let bestV = metric(best);
    for (const s of this.items) {
      const v = metric(s);
      if (v > bestV) (best = s), (bestV = v);
    }
    return new ShapeList([best]);
  }

  /** Single shape minimising `metric`. */
  min(metric: (s: T) => number): ShapeList<T> {
    return this.max((s) => -metric(s));
  }

  groupBy(key: (s: T) => string | number): Map<string | number, T[]> {
    const map = new Map<string | number, T[]>();
    for (const s of this.items) {
      const k = key(s);
      (map.get(k) ?? map.set(k, []).get(k)!).push(s);
    }
    return map;
  }

  first(): T | undefined {
    return this.items[0];
  }
  last(): T | undefined {
    return this.items[this.items.length - 1];
  }

  /** Compact JSON view for `query_geometry` returns (context-frugal). */
  toJSON(): unknown {
    return shapesToJSON(this.items);
  }
}

/** Compact JSON description of a shape list (context-frugal selector output). */
export function shapesToJSON(items: Shape[]): { count: number; items: unknown[] } {
  return { count: items.length, items: items.map((s) => round(s)) };
}

function round(s: Shape): unknown {
  const r3 = (v: Vec3): Vec3 => [round1(v[0]), round1(v[1]), round1(v[2])];
  if (s.kind === 'face') {
    return {
      kind: 'face',
      id: s.id,
      normal: r3(s.normal),
      centroid: r3(s.centroid),
      area: round1(s.area),
      triCount: s.triCount,
      tag: s.tag,
    };
  }
  if (s.kind === 'edge') {
    return { kind: 'edge', id: s.id, a: r3(s.a), b: r3(s.b), length: round1(s.length), direction: r3(s.direction) };
  }
  return { kind: 'vertex', id: s.id, position: r3(s.position) };
}

function round1(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// ── topology extraction ──────────────────────────────────────────────────────

function triNormal(p: number[], a: number, b: number, c: number): Vec3 {
  const ux = p[b * 3] - p[a * 3], uy = p[b * 3 + 1] - p[a * 3 + 1], uz = p[b * 3 + 2] - p[a * 3 + 2];
  const vx = p[c * 3] - p[a * 3], vy = p[c * 3 + 1] - p[a * 3 + 1], vz = p[c * 3 + 2] - p[a * 3 + 2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1;
  return [nx / l, ny / l, nz / l];
}

function triArea(p: number[], a: number, b: number, c: number): number {
  const ux = p[b * 3] - p[a * 3], uy = p[b * 3 + 1] - p[a * 3 + 1], uz = p[b * 3 + 2] - p[a * 3 + 2];
  const vx = p[c * 3] - p[a * 3], vy = p[c * 3 + 1] - p[a * 3 + 1], vz = p[c * 3 + 2] - p[a * 3 + 2];
  const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
  return 0.5 * Math.hypot(cx, cy, cz);
}

class UnionFind {
  parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(i: number): number {
    while (this.parent[i] !== i) {
      this.parent[i] = this.parent[this.parent[i]];
      i = this.parent[i];
    }
    return i;
  }
  union(a: number, b: number): void {
    this.parent[this.find(a)] = this.find(b);
  }
}

const COPLANAR_NORMAL_TOL = Math.cos((1 * Math.PI) / 180); // 1°
const FEATURE_EDGE_COS = Math.cos((20 * Math.PI) / 180); // sharper than 20° = feature

/** Recover planar faces by clustering coplanar, edge-adjacent triangles. */
export function extractFaces(mesh: Mesh): ShapeList<FaceInfo> {
  const { positions: p, indices: idx } = mesh;
  const triCount = idx.length / 3;
  if (triCount === 0) return new ShapeList<FaceInfo>([]);

  const normals: Vec3[] = [];
  for (let t = 0; t < triCount; t++) {
    normals.push(triNormal(p, idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]));
  }

  // edge → triangle list (welded indices ⇒ shared edges share index pairs)
  const edgeMap = new Map<string, number[]>();
  const ekey = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`);
  for (let t = 0; t < triCount; t++) {
    const a = idx[t * 3], b = idx[t * 3 + 1], c = idx[t * 3 + 2];
    for (const [u, v] of [[a, b], [b, c], [c, a]] as const) {
      const k = ekey(u, v);
      (edgeMap.get(k) ?? edgeMap.set(k, []).get(k)!).push(t);
    }
  }

  const uf = new UnionFind(triCount);
  for (const tris of edgeMap.values()) {
    // Pairwise (not star-vs-tris[0]): a non-manifold edge can have 3+ triangles
    // where B∥A and C∥B but C∦A — star comparison would miss B–C and split a
    // coplanar face. Pairwise union gives the transitive closure. Manifold edges
    // (the common case) have exactly 2 tris → a single comparison.
    for (let i = 0; i < tris.length; i++) {
      for (let j = i + 1; j < tris.length; j++) {
        const n0 = normals[tris[i]], n1 = normals[tris[j]];
        if (n0[0] * n1[0] + n0[1] * n1[1] + n0[2] * n1[2] >= COPLANAR_NORMAL_TOL) uf.union(tris[i], tris[j]);
      }
    }
  }

  const groups = new Map<number, number[]>();
  for (let t = 0; t < triCount; t++) {
    const r = uf.find(t);
    (groups.get(r) ?? groups.set(r, []).get(r)!).push(t);
  }

  const faces: FaceInfo[] = [];
  let id = 0;
  for (const tris of groups.values()) {
    let area = 0;
    const nrm: Vec3 = [0, 0, 0];
    const cen: Vec3 = [0, 0, 0];
    const min: Vec3 = [Infinity, Infinity, Infinity];
    const max: Vec3 = [-Infinity, -Infinity, -Infinity];
    const tagCount = new Map<number, number>();
    for (const t of tris) {
      const a = idx[t * 3], b = idx[t * 3 + 1], c = idx[t * 3 + 2];
      const ar = triArea(p, a, b, c);
      area += ar;
      const n = normals[t];
      nrm[0] += n[0] * ar; nrm[1] += n[1] * ar; nrm[2] += n[2] * ar;
      for (const vi of [a, b, c]) {
        cen[0] += p[vi * 3] * ar / 3; cen[1] += p[vi * 3 + 1] * ar / 3; cen[2] += p[vi * 3 + 2] * ar / 3;
        for (let k = 0; k < 3; k++) {
          const val = p[vi * 3 + k];
          if (val < min[k]) min[k] = val;
          if (val > max[k]) max[k] = val;
        }
      }
      const tg = mesh.tags ? mesh.tags[t] : 0;
      tagCount.set(tg, (tagCount.get(tg) ?? 0) + 1);
    }
    const nl = Math.hypot(nrm[0], nrm[1], nrm[2]) || 1;
    const normal: Vec3 = [nrm[0] / nl, nrm[1] / nl, nrm[2] / nl];
    const centroid: Vec3 = [cen[0] / area, cen[1] / area, cen[2] / area];
    let tag = 0, bestCount = -1;
    for (const [tg, cnt] of tagCount) if (cnt > bestCount) (tag = tg), (bestCount = cnt);
    faces.push({
      kind: 'face',
      id: id++,
      normal,
      centroid,
      area,
      bounds: { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]], center: centroid },
      triCount: tris.length,
      tag,
      position: centroid,
    });
  }
  return new ShapeList(faces);
}

/** Recover sharp/boundary feature edges (the visible model edges). */
export function extractEdges(mesh: Mesh): ShapeList<EdgeInfo> {
  const { positions: p, indices: idx } = mesh;
  const triCount = idx.length / 3;
  if (triCount === 0) return new ShapeList<EdgeInfo>([]);
  const normals: Vec3[] = [];
  for (let t = 0; t < triCount; t++) normals.push(triNormal(p, idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]));

  const edgeMap = new Map<string, { a: number; b: number; tris: number[] }>();
  const ekey = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`);
  for (let t = 0; t < triCount; t++) {
    const a = idx[t * 3], b = idx[t * 3 + 1], c = idx[t * 3 + 2];
    for (const [u, v] of [[a, b], [b, c], [c, a]] as const) {
      const k = ekey(u, v);
      const e = edgeMap.get(k) ?? edgeMap.set(k, { a: Math.min(u, v), b: Math.max(u, v), tris: [] }).get(k)!;
      e.tris.push(t);
    }
  }

  const edges: EdgeInfo[] = [];
  let id = 0;
  for (const e of edgeMap.values()) {
    let feature = false;
    if (e.tris.length === 1) feature = true; // boundary
    else {
      const n0 = normals[e.tris[0]], n1 = normals[e.tris[1]];
      if (n0[0] * n1[0] + n0[1] * n1[1] + n0[2] * n1[2] < FEATURE_EDGE_COS) feature = true;
    }
    if (!feature) continue;
    const a: Vec3 = [p[e.a * 3], p[e.a * 3 + 1], p[e.a * 3 + 2]];
    const b: Vec3 = [p[e.b * 3], p[e.b * 3 + 1], p[e.b * 3 + 2]];
    const mid: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    const dv: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const len = Math.hypot(dv[0], dv[1], dv[2]) || 1;
    edges.push({
      kind: 'edge',
      id: id++,
      a,
      b,
      midpoint: mid,
      direction: [dv[0] / len, dv[1] / len, dv[2] / len],
      length: len,
      position: mid,
    });
  }
  return new ShapeList(edges);
}

/** Unique welded vertices. */
export function extractVertices(mesh: Mesh): ShapeList<VertexInfo> {
  const verts: VertexInfo[] = [];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    verts.push({ kind: 'vertex', id: i / 3, position: [mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]] });
  }
  return new ShapeList(verts);
}

/** Highest provenance tag present (the "most recent operation"). */
export function maxTag(mesh: Mesh): number {
  if (!mesh.tags || mesh.tags.length === 0) return 0;
  let m = mesh.tags[0];
  for (const t of mesh.tags) if (t > m) m = t;
  return m;
}
