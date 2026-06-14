/**
 * cad-script · sketch / work-plane builders (Track A, 2D → 3D)
 *
 * A small, build123d-flavoured surface (§4 of the architecture doc): draw a
 * closed 2D profile on an origin work-plane, then `extrude` it along the plane
 * normal or `revolve` it around an axis. Profiles are plain `P2[]` rings
 * (counter-clockwise, first point not repeated); the heavier `Solid` wrapper in
 * `./solid.ts` consumes the meshes produced here.
 *
 * Pure — no three.js, no scene. Outward winding is guaranteed downstream by
 * `Solid`'s orient pass, so these builders focus on topology, not triangle order.
 */
import { Mesh, weld, Vec3 } from './mesh';
import { triangulate, P2 } from './triangulate';

export type PlaneName = 'XY' | 'XZ' | 'YZ';

/** Map an in-plane (u,v) coordinate at `offset` along the plane normal to 3D. */
export function planePoint(plane: PlaneName, u: number, v: number, offset: number): Vec3 {
  switch (plane) {
    case 'XY':
      return [u, v, offset];
    case 'XZ':
      return [u, offset, v];
    case 'YZ':
      return [offset, u, v];
  }
}

/** Unit normal of a work-plane. */
export function planeNormal(plane: PlaneName): Vec3 {
  switch (plane) {
    case 'XY':
      return [0, 0, 1];
    case 'XZ':
      return [0, 1, 0];
    case 'YZ':
      return [1, 0, 0];
  }
}

// ── 2D profile builders ──────────────────────────────────────────────────────

/** Centred rectangle `w`×`h`. */
export function rect(w = 20, h = 20): P2[] {
  const hw = w / 2, hh = h / 2;
  return [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ];
}

/** Circle of radius `r` approximated by `seg` segments. */
export function circle(r = 10, seg = 48): P2[] {
  const n = Math.max(3, Math.floor(seg));
  const pts: P2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return pts;
}

/** Regular `n`-gon of circumradius `r`, optional rotation in radians. */
export function regularPolygon(r = 10, n = 6, rot = 0): P2[] {
  const k = Math.max(3, Math.floor(n));
  const pts: P2[] = [];
  for (let i = 0; i < k; i++) {
    const a = rot + (i / k) * Math.PI * 2;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return pts;
}

/** Stadium / slot: a `length`-long rectangle capped by semicircles of radius `r`. */
export function slot(length = 30, r = 6, seg = 16): P2[] {
  const n = Math.max(2, Math.floor(seg));
  const half = Math.max(0, length / 2 - r);
  const pts: P2[] = [];
  // right cap (−90°..+90°)
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + (i / n) * Math.PI;
    pts.push([half + Math.cos(a) * r, Math.sin(a) * r]);
  }
  // left cap (+90°..+270°)
  for (let i = 0; i <= n; i++) {
    const a = Math.PI / 2 + (i / n) * Math.PI;
    pts.push([-half + Math.cos(a) * r, Math.sin(a) * r]);
  }
  return pts;
}

/** Pass-through for an explicit point list (closed ring). */
export function polygon(points: P2[]): P2[] {
  return points.map((p) => [p[0], p[1]] as P2);
}

// ── 3D operations ────────────────────────────────────────────────────────────

export interface ExtrudeOptions {
  plane?: PlaneName;
  /** Extrusion length along the plane normal (mm). */
  distance?: number;
  /** Plane offset along the normal where the base sits. */
  offset?: number;
  /** Symmetric extrusion: ±distance/2 about the offset (build123d `both`). */
  both?: boolean;
}

/** Extrude a closed profile into a capped prism. */
export function extrudeProfile(profile: P2[], opts: ExtrudeOptions = {}): Mesh {
  const plane = opts.plane ?? 'XY';
  const distance = opts.distance ?? 10;
  const offset = opts.offset ?? 0;
  const n = profile.length;
  if (n < 3 || distance === 0) return { positions: [], indices: [] };

  const z0 = opts.both ? offset - distance / 2 : offset;
  const z1 = opts.both ? offset + distance / 2 : offset + distance;

  const positions: number[] = [];
  const indices: number[] = [];
  const push = (p: Vec3): number => {
    const i = positions.length / 3;
    positions.push(p[0], p[1], p[2]);
    return i;
  };

  const base: number[] = [];
  const top: number[] = [];
  for (const [u, v] of profile) {
    base.push(push(planePoint(plane, u, v, z0)));
    top.push(push(planePoint(plane, u, v, z1)));
  }

  // Side walls (profile treated as a closed loop).
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    indices.push(base[i], base[j], top[j]);
    indices.push(base[i], top[j], top[i]);
  }

  // Caps.
  const capTris = triangulate(profile);
  for (let i = 0; i < capTris.length; i += 3) {
    const a = capTris[i], b = capTris[i + 1], c = capTris[i + 2];
    indices.push(base[a], base[c], base[b]); // bottom (reversed)
    indices.push(top[a], top[b], top[c]); // top
  }

  return weld({ positions, indices });
}

export type RevolveAxis = 'X' | 'Y' | 'Z';

export interface RevolveOptions {
  /** Sweep angle in degrees (default full 360). */
  angle?: number;
  /** Axis of revolution; profile `x` is distance from it, `y` is along it. */
  axis?: RevolveAxis;
  /** Angular segments. */
  seg?: number;
}

/**
 * Revolve a closed 2D profile around an axis (a lathe). Profile coordinates are
 * `(x = distance from axis, y = position along axis)`; keep `x ≥ 0` (the profile
 * must lie on one side of the axis). A full 360° revolve yields a closed solid;
 * a partial sweep adds flat end caps at the start and end angles.
 */
export function revolveProfile(profile: P2[], opts: RevolveOptions = {}): Mesh {
  const angleDeg = opts.angle ?? 360;
  const axis = opts.axis ?? 'Y';
  const full = Math.abs(angleDeg) >= 359.999;
  const seg = Math.max(3, Math.floor(opts.seg ?? Math.ceil((Math.abs(angleDeg) / 360) * 64)));
  const n = profile.length;
  if (n < 3) return { positions: [], indices: [] };

  const angle = (angleDeg * Math.PI) / 180;
  const ringCount = full ? seg : seg + 1;

  const map = (x: number, y: number, phi: number): Vec3 => {
    const c = Math.cos(phi), s = Math.sin(phi);
    switch (axis) {
      case 'Y':
        return [x * c, y, x * s];
      case 'Z':
        return [x * c, x * s, y];
      case 'X':
        return [y, x * c, x * s];
    }
  };

  const positions: number[] = [];
  const indices: number[] = [];
  const rings: number[][] = [];
  for (let r = 0; r < ringCount; r++) {
    const phi = full ? (r / seg) * Math.PI * 2 : (r / seg) * angle;
    const ring: number[] = [];
    for (const [x, y] of profile) {
      ring.push(positions.length / 3);
      const p = map(x, y, phi);
      positions.push(p[0], p[1], p[2]);
    }
    rings.push(ring);
  }

  const segCount = full ? seg : seg;
  for (let r = 0; r < segCount; r++) {
    const a = rings[r];
    const b = rings[(r + 1) % ringCount];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      indices.push(a[i], a[j], b[j]);
      indices.push(a[i], b[j], b[i]);
    }
  }

  // End caps for a partial revolve.
  if (!full) {
    const capTris = triangulate(profile);
    const first = rings[0];
    const last = rings[ringCount - 1];
    for (let i = 0; i < capTris.length; i += 3) {
      const a = capTris[i], b = capTris[i + 1], c = capTris[i + 2];
      indices.push(first[a], first[c], first[b]);
      indices.push(last[a], last[b], last[c]);
    }
  }

  return weld({ positions, indices });
}
