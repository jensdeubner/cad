/**
 * cad-script · constructive solid geometry (BSP)
 *
 * A self-contained, dependency-free boolean kernel for the scripting layer,
 * adapted from Evan Wallace's csg.js BSP algorithm (MIT). It runs in Node and
 * the browser alike, which is the whole point: per the architecture doc §0/§2,
 * "the code execution *is* the validation" — so the script API needs booleans
 * that work everywhere unit tests run, not only after a WASM `init()`.
 *
 * The app's existing WASM Manifold-style kernel (`mesh_boolean_subtract_json`)
 * stays the path for big scan meshes; this BSP kernel handles the small,
 * clean parametric solids the script API generates (box − cylinder = hole).
 *
 * Provenance: each triangle's `tag` rides along in `Polygon.shared`, so the
 * faces that come out of a cut still know which input they came from — that is
 * what powers `Select.LAST` / `Select.NEW` in `./selectors.ts`.
 */
import { Mesh, weld } from './mesh';

const EPS = 1e-5;

type V3 = [number, number, number];

function sub(a: V3, b: V3): V3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function cross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dot(a: V3, b: V3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function lerp(a: V3, b: V3, t: number): V3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function normalize(a: V3): V3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

interface Polygon {
  verts: V3[];
  normal: V3;
  w: number; // plane offset
  shared: number; // provenance tag
}

/**
 * A splitting plane — kept SEPARATE from any polygon. (Aliasing the node's
 * plane to `polygons[0]` makes `invert()` double-negate it, which silently
 * breaks clipping for enclosed tools — a hard-won bug.)
 */
interface Plane {
  normal: V3;
  w: number;
}

function makePolygon(verts: V3[], shared: number): Polygon | null {
  const n = normalize(cross(sub(verts[1], verts[0]), sub(verts[2], verts[0])));
  if (!Number.isFinite(n[0]) || (n[0] === 0 && n[1] === 0 && n[2] === 0)) return null;
  return { verts, normal: n, w: dot(n, verts[0]), shared };
}

const COPLANAR = 0, FRONT = 1, BACK = 2, SPANNING = 3;

/** Split `polygon` by this plane, routing fragments to the four buckets. */
function splitPolygon(
  plane: Plane,
  polygon: Polygon,
  coplanarFront: Polygon[],
  coplanarBack: Polygon[],
  front: Polygon[],
  back: Polygon[],
): void {
  let polygonType = 0;
  const types: number[] = [];
  for (const v of polygon.verts) {
    const t = dot(plane.normal, v) - plane.w;
    const type = t < -EPS ? BACK : t > EPS ? FRONT : COPLANAR;
    polygonType |= type;
    types.push(type);
  }

  switch (polygonType) {
    case COPLANAR:
      (dot(plane.normal, polygon.normal) > 0 ? coplanarFront : coplanarBack).push(polygon);
      break;
    case FRONT:
      front.push(polygon);
      break;
    case BACK:
      back.push(polygon);
      break;
    case SPANNING: {
      const f: V3[] = [];
      const b: V3[] = [];
      const n = polygon.verts.length;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const ti = types[i], tj = types[j];
        const vi = polygon.verts[i], vj = polygon.verts[j];
        if (ti !== BACK) f.push(vi);
        if (ti !== FRONT) b.push(vi);
        if ((ti | tj) === SPANNING) {
          // Endpoints are on strictly opposite sides (each beyond EPS), so the
          // denominator is > 2·EPS in theory; the guard is belt-and-braces
          // against FP degeneracy. Fall back to the segment midpoint (NOT a
          // `continue` — dropping the crossing vertex would desync the f/b rings).
          const denom = dot(plane.normal, sub(vj, vi));
          const t = Math.abs(denom) > 1e-12 ? (plane.w - dot(plane.normal, vi)) / denom : 0.5;
          const v = lerp(vi, vj, t);
          f.push(v);
          b.push(v);
        }
      }
      if (f.length >= 3) front.push({ verts: f, normal: polygon.normal, w: polygon.w, shared: polygon.shared });
      if (b.length >= 3) back.push({ verts: b, normal: polygon.normal, w: polygon.w, shared: polygon.shared });
      break;
    }
  }
}

/** A BSP tree node. */
class Node {
  plane: Plane | null = null;
  front: Node | null = null;
  back: Node | null = null;
  polygons: Polygon[] = [];

  constructor(polygons?: Polygon[]) {
    if (polygons) this.build(polygons);
  }

  invert(): void {
    for (const p of this.polygons) {
      p.normal = [-p.normal[0], -p.normal[1], -p.normal[2]];
      p.w = -p.w;
      p.verts.reverse();
    }
    if (this.plane) {
      this.plane.normal = [-this.plane.normal[0], -this.plane.normal[1], -this.plane.normal[2]];
      this.plane.w = -this.plane.w;
    }
    const f = this.front;
    this.front = this.back;
    this.back = f;
    this.front?.invert();
    this.back?.invert();
  }

  clipPolygons(polygons: Polygon[]): Polygon[] {
    if (!this.plane) return polygons.slice();
    let front: Polygon[] = [];
    let back: Polygon[] = [];
    for (const p of polygons) splitPolygon(this.plane, p, front, back, front, back);
    if (this.front) front = this.front.clipPolygons(front);
    back = this.back ? this.back.clipPolygons(back) : [];
    return front.concat(back);
  }

  clipTo(bsp: Node): void {
    this.polygons = bsp.clipPolygons(this.polygons);
    this.front?.clipTo(bsp);
    this.back?.clipTo(bsp);
  }

  allPolygons(): Polygon[] {
    let polys = this.polygons.slice();
    if (this.front) polys = polys.concat(this.front.allPolygons());
    if (this.back) polys = polys.concat(this.back.allPolygons());
    return polys;
  }

  build(polygons: Polygon[]): void {
    if (polygons.length === 0) return;
    if (!this.plane) {
      const seed = polygons[0];
      this.plane = { normal: [seed.normal[0], seed.normal[1], seed.normal[2]], w: seed.w };
    }
    const front: Polygon[] = [];
    const back: Polygon[] = [];
    for (const p of polygons) {
      splitPolygon(this.plane, p, this.polygons, this.polygons, front, back);
    }
    if (front.length) {
      this.front ??= new Node();
      this.front.build(front);
    }
    if (back.length) {
      this.back ??= new Node();
      this.back.build(back);
    }
  }
}

function meshToPolygons(m: Mesh): Polygon[] {
  const polys: Polygon[] = [];
  const idx = m.indices;
  const p = m.positions;
  const vert = (i: number): V3 => [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]];
  for (let i = 0; i < idx.length; i += 3) {
    const poly = makePolygon([vert(idx[i]), vert(idx[i + 1]), vert(idx[i + 2])], m.tags ? m.tags[i / 3] : 0);
    if (poly) polys.push(poly);
  }
  return polys;
}

function polygonsToMesh(polys: Polygon[]): Mesh {
  const positions: number[] = [];
  const indices: number[] = [];
  const tags: number[] = [];
  for (const poly of polys) {
    // Fan-triangulate the (convex after BSP splitting) polygon.
    const base = positions.length / 3;
    for (const v of poly.verts) positions.push(v[0], v[1], v[2]);
    for (let i = 2; i < poly.verts.length; i++) {
      indices.push(base, base + i - 1, base + i);
      tags.push(poly.shared);
    }
  }
  return weld({ positions, indices, tags });
}

function run(
  a: Mesh,
  b: Mesh,
  op: (na: Node, nb: Node) => Polygon[],
): Mesh {
  const na = new Node(meshToPolygons(weld(a)));
  const nb = new Node(meshToPolygons(weld(b)));
  return polygonsToMesh(op(na, nb));
}

/** A ∪ B — fused solid (CSG union). */
export function meshUnion(a: Mesh, b: Mesh): Mesh {
  return run(a, b, (na, nb) => {
    na.clipTo(nb);
    nb.clipTo(na);
    nb.invert();
    nb.clipTo(na);
    nb.invert();
    na.build(nb.allPolygons());
    return na.allPolygons();
  });
}

/** A − B — subtract tool B from target A (CSG difference). */
export function meshSubtract(a: Mesh, b: Mesh): Mesh {
  return run(a, b, (na, nb) => {
    na.invert();
    na.clipTo(nb);
    nb.clipTo(na);
    nb.invert();
    nb.clipTo(na);
    nb.invert();
    na.build(nb.allPolygons());
    na.invert();
    return na.allPolygons();
  });
}

/** A ∩ B — the overlap (CSG intersection). */
export function meshIntersect(a: Mesh, b: Mesh): Mesh {
  return run(a, b, (na, nb) => {
    na.invert();
    nb.clipTo(na);
    nb.invert();
    na.clipTo(nb);
    nb.clipTo(na);
    na.build(nb.allPolygons());
    na.invert();
    return na.allPolygons();
  });
}
