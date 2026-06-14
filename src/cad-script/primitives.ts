/**
 * cad-script · parametric primitive solids
 *
 * Pure tessellators that emit watertight, vertex-welded, outward-oriented
 * `Mesh` values (Track A building blocks, §1/§4 of the architecture doc). Unlike
 * the three.js `BoxGeometry`/`SphereGeometry` primitives used elsewhere in the
 * app, these are manifold by construction (welded, no per-face vertex
 * duplication) so the CSG kernel can union/subtract them directly.
 *
 * Convention: centred at the origin; "height" axes run along +Z (a circle drawn
 * on the XY work-plane extrudes up +Z into a cylinder — matches the sketch
 * builders in `./sketch.ts`). Every builder runs through `orient()`, which
 * flips winding if the signed volume came out negative, so callers never need to
 * reason about triangle order.
 */
import { Mesh, weld, flipWinding, Vec3 } from './mesh';
import { extrudeProfile } from './sketch';
import type { P2 } from './triangulate';

const TAU = Math.PI * 2;

/** Signed tetrahedron volume (sign indicates inward/outward winding). */
function signedVolume(m: Mesh): number {
  let vol = 0;
  const p = m.positions;
  const idx = m.indices;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    vol +=
      (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) -
        p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) +
        p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) /
      6;
  }
  return vol;
}

/** Weld, then ensure outward winding (positive signed volume). */
function orient(m: Mesh): Mesh {
  const w = weld(m);
  if (signedVolume(w) < 0) flipWinding(w);
  return w;
}

/** Builder helper: accumulate raw (pre-weld) triangles. */
class Soup {
  positions: number[] = [];
  indices: number[] = [];
  private v(p: Vec3): number {
    const i = this.positions.length / 3;
    this.positions.push(p[0], p[1], p[2]);
    return i;
  }
  tri(a: Vec3, b: Vec3, c: Vec3): void {
    const ia = this.v(a), ib = this.v(b), ic = this.v(c);
    this.indices.push(ia, ib, ic);
  }
  quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3): void {
    this.tri(a, b, c);
    this.tri(a, c, d);
  }
  mesh(): Mesh {
    return { positions: this.positions, indices: this.indices };
  }
}

/** Axis-aligned box centred at the origin. Dimensions are full extents (mm). */
export function box(sx = 20, sy = sx, sz = sx): Mesh {
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const s = new Soup();
  const p = (x: number, y: number, z: number): Vec3 => [x, y, z];
  // +Z / -Z
  s.quad(p(-hx, -hy, hz), p(hx, -hy, hz), p(hx, hy, hz), p(-hx, hy, hz));
  s.quad(p(-hx, -hy, -hz), p(-hx, hy, -hz), p(hx, hy, -hz), p(hx, -hy, -hz));
  // +X / -X
  s.quad(p(hx, -hy, -hz), p(hx, hy, -hz), p(hx, hy, hz), p(hx, -hy, hz));
  s.quad(p(-hx, -hy, -hz), p(-hx, -hy, hz), p(-hx, hy, hz), p(-hx, hy, -hz));
  // +Y / -Y
  s.quad(p(-hx, hy, -hz), p(-hx, hy, hz), p(hx, hy, hz), p(hx, hy, -hz));
  s.quad(p(-hx, -hy, -hz), p(hx, -hy, -hz), p(hx, -hy, hz), p(-hx, -hy, hz));
  return orient(s.mesh());
}

/** Cylinder along +Z, centred at origin. `r` radius, `h` height, `seg` sides. */
export function cylinder(r = 10, h = 20, seg = 48): Mesh {
  const n = Math.max(3, Math.floor(seg));
  const hz = h / 2;
  const s = new Soup();
  const ring = (z: number): Vec3[] =>
    Array.from({ length: n }, (_, i) => {
      const a = (i / n) * TAU;
      return [Math.cos(a) * r, Math.sin(a) * r, z] as Vec3;
    });
  const bot = ring(-hz);
  const top = ring(hz);
  const cBot: Vec3 = [0, 0, -hz];
  const cTop: Vec3 = [0, 0, hz];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    s.quad(bot[i], bot[j], top[j], top[i]); // side
    s.tri(cBot, bot[j], bot[i]); // bottom cap (−Z)
    s.tri(cTop, top[i], top[j]); // top cap (+Z)
  }
  return orient(s.mesh());
}

/** Cone along +Z (base at −h/2, apex at +h/2), centred. */
export function cone(r = 10, h = 20, seg = 48): Mesh {
  const n = Math.max(3, Math.floor(seg));
  const hz = h / 2;
  const s = new Soup();
  const apex: Vec3 = [0, 0, hz];
  const cBot: Vec3 = [0, 0, -hz];
  const base: Vec3[] = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * TAU;
    return [Math.cos(a) * r, Math.sin(a) * r, -hz] as Vec3;
  });
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    s.tri(base[i], base[j], apex); // side
    s.tri(cBot, base[j], base[i]); // base cap (−Z)
  }
  return orient(s.mesh());
}

/** UV sphere of radius `r`. `uSeg` longitude divisions, `vSeg` latitude. */
export function sphere(r = 10, uSeg = 48, vSeg = 32): Mesh {
  const nu = Math.max(3, Math.floor(uSeg));
  const nv = Math.max(2, Math.floor(vSeg));
  const s = new Soup();
  const pt = (iu: number, iv: number): Vec3 => {
    const theta = (iv / nv) * Math.PI; // 0..π polar
    const phi = (iu / nu) * TAU; // 0..2π azimuth
    const st = Math.sin(theta);
    return [r * st * Math.cos(phi), r * st * Math.sin(phi), r * Math.cos(theta)];
  };
  for (let iv = 0; iv < nv; iv++) {
    for (let iu = 0; iu < nu; iu++) {
      const iu1 = (iu + 1) % nu;
      const a = pt(iu, iv), b = pt(iu1, iv), c = pt(iu1, iv + 1), d = pt(iu, iv + 1);
      if (iv === 0) s.tri(a, c, d); // north pole cap (a≈b)
      else if (iv === nv - 1) s.tri(a, b, d); // south pole cap (c≈d)
      else s.quad(a, b, c, d);
    }
  }
  return orient(s.mesh());
}

/** Torus in the XY plane: `R` ring radius, `r` tube radius. */
export function torus(R = 18, r = 6, seg = 64, sides = 32): Mesh {
  const ns = Math.max(3, Math.floor(seg));
  const nt = Math.max(3, Math.floor(sides));
  const s = new Soup();
  const pt = (i: number, j: number): Vec3 => {
    const u = (i / ns) * TAU; // around ring
    const v = (j / nt) * TAU; // around tube
    const cu = Math.cos(u), su = Math.sin(u);
    const cv = Math.cos(v), sv = Math.sin(v);
    return [(R + r * cv) * cu, (R + r * cv) * su, r * sv];
  };
  for (let i = 0; i < ns; i++) {
    for (let j = 0; j < nt; j++) {
      const i1 = (i + 1) % ns, j1 = (j + 1) % nt;
      s.quad(pt(i, j), pt(i1, j), pt(i1, j1), pt(i, j1));
    }
  }
  return orient(s.mesh());
}

/**
 * A right rectangular wedge: a box-footprint ramp. Base `sx`×`sy` on the XY
 * plane (z = 0), sloping linearly from height `0` at −X to `h` at +X. Handy as a
 * chamfer / support tool. Centred in XY, base on z = 0.
 */
export function wedge(sx = 20, sy = 20, h = 20): Mesh {
  const hx = sx / 2, hy = sy / 2;
  // A right-triangle cross-section in the XZ plane (x across, z up: base on z=0,
  // sloping 0 → h across −X→+X) extruded along Y. Reuses the tested extrude path
  // so winding is guaranteed consistent (a hand-wound version was not).
  const profile: P2[] = [
    [-hx, 0],
    [hx, 0],
    [hx, h],
  ];
  return orient(extrudeProfile(profile, { plane: 'XZ', distance: sy, offset: -hy }));
}
