/**
 * Plane cut (Ebenenschnitt) — pure geometry.
 *
 * Keep only the part of a mesh on the +Z side of a horizontal plane `z = planeZ`,
 * discarding everything below. Triangles wholly above are kept verbatim, those
 * wholly below are dropped, and triangles straddling the plane are clipped to
 * their above-the-plane polygon (Sutherland–Hodgman against the half-space
 * `z >= planeZ`) and fan-triangulated. The result is a valid *open* body — the
 * cut is intentionally NOT capped.
 *
 * No DOM, no scene — just buffer math on a THREE.BufferGeometry. Reference
 * domain module for the feature-registry seam (see
 * `src/features/solid-plane-cut.ts`).
 */
import * as THREE from 'three';

type Vec3 = [number, number, number];

/** Linear interpolation between two points by parameter `t` (0..1). */
function lerp3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

const EPS = 1e-9;
function samePt(a: Vec3, b: Vec3): boolean {
  return Math.abs(a[0] - b[0]) <= EPS && Math.abs(a[1] - b[1]) <= EPS && Math.abs(a[2] - b[2]) <= EPS;
}

/**
 * Drop consecutive (and wrap-around) duplicate vertices. A triangle vertex that
 * lies exactly on the plane is otherwise emitted twice (as a corner AND as a
 * t=0/1 crossing point), which would fan into zero-area triangles → NaN normals.
 */
function dedupRing(poly: Vec3[]): Vec3[] {
  const out: Vec3[] = [];
  for (const p of poly) {
    if (out.length === 0 || !samePt(out[out.length - 1], p)) out.push(p);
  }
  if (out.length > 1 && samePt(out[0], out[out.length - 1])) out.pop();
  return out;
}

/**
 * Clip a single triangle (3 vertices) to the half-space `z >= planeZ` and emit
 * the resulting above-polygon as a fan of triangles into `out`. A clipped
 * polygon has 0, 3 or 4 vertices; we fan-triangulate (v0, vi, vi+1).
 *
 * The crossing point of an edge with the plane is computed by linear
 * interpolation, so it lands exactly on `z = planeZ` (never NaN as long as the
 * endpoints straddle, which is the only case we interpolate).
 */
function clipTriangleAbove(tri: [Vec3, Vec3, Vec3], planeZ: number, out: number[]): void {
  // Sutherland–Hodgman against the single plane z = planeZ, keeping z >= planeZ.
  const poly: Vec3[] = [];
  for (let i = 0; i < 3; i++) {
    const cur = tri[i];
    const next = tri[(i + 1) % 3];
    const curIn = cur[2] >= planeZ;
    const nextIn = next[2] >= planeZ;

    if (curIn) poly.push(cur);
    if (curIn !== nextIn) {
      // Edge crosses the plane — add the intersection point.
      const dz = next[2] - cur[2];
      // dz is non-zero here because the endpoints lie on opposite sides.
      const t = (planeZ - cur[2]) / dz;
      poly.push(lerp3(cur, next, t));
    }
  }

  const ring = dedupRing(poly);
  if (ring.length < 3) return;

  // Fan-triangulate the convex above-polygon.
  for (let i = 1; i + 1 < ring.length; i++) {
    out.push(
      ring[0][0], ring[0][1], ring[0][2],
      ring[i][0], ring[i][1], ring[i][2],
      ring[i + 1][0], ring[i + 1][1], ring[i + 1][2],
    );
  }
}

/**
 * Return a NEW (non-indexed) geometry containing only the part of `geometry`
 * with `z >= planeZ`. Triangles below the plane are removed and straddling
 * triangles are clipped to the above polygon. Vertex normals are recomputed.
 *
 * Never throws, never emits NaN, and an empty input yields an empty geometry.
 */
export function cutAbovePlaneZ(
  geometry: THREE.BufferGeometry,
  planeZ: number,
): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (!posAttr || posAttr.count === 0 || !Number.isFinite(planeZ)) {
    out.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
    return out;
  }

  const index = geometry.getIndex();
  const triCount = index ? Math.floor(index.count / 3) : Math.floor(posAttr.count / 3);
  const kept: number[] = [];

  const vertexAt = (vi: number): Vec3 => [
    posAttr.getX(vi),
    posAttr.getY(vi),
    posAttr.getZ(vi),
  ];

  for (let t = 0; t < triCount; t++) {
    const ia = index ? index.getX(t * 3) : t * 3;
    const ib = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const ic = index ? index.getX(t * 3 + 2) : t * 3 + 2;
    const a = vertexAt(ia);
    const b = vertexAt(ib);
    const c = vertexAt(ic);

    // Skip any triangle with a non-finite vertex rather than poison the output.
    if (
      !Number.isFinite(a[2]) ||
      !Number.isFinite(b[2]) ||
      !Number.isFinite(c[2])
    ) {
      continue;
    }

    const aIn = a[2] >= planeZ;
    const bIn = b[2] >= planeZ;
    const cIn = c[2] >= planeZ;

    if (aIn && bIn && cIn) {
      // Wholly above — keep verbatim.
      kept.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    } else if (!aIn && !bIn && !cIn) {
      // Wholly below — drop.
      continue;
    } else {
      // Straddling — clip to the above-polygon.
      clipTriangleAbove([a, b, c], planeZ, kept);
    }
  }

  out.setAttribute('position', new THREE.BufferAttribute(new Float32Array(kept), 3));
  if (kept.length > 0) {
    out.computeVertexNormals();
    // Defence-in-depth: any zero-area sliver normalises to NaN — sanitise it.
    const n = out.getAttribute('normal') as THREE.BufferAttribute | null;
    if (n) {
      for (let i = 0; i < n.count; i++) {
        if (!Number.isFinite(n.getX(i)) || !Number.isFinite(n.getY(i)) || !Number.isFinite(n.getZ(i))) {
          n.setXYZ(i, 0, 0, 1);
        }
      }
      n.needsUpdate = true;
    }
  }
  out.computeBoundingBox();
  return out;
}
