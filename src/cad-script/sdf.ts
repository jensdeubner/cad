/**
 * cad-script · signed-distance functions (Track B, freeform / organic)
 *
 * The architecture doc's §1 Spur B: organic shapes are built as compact
 * analytic SDFs (`sphere = length(p) − r`) and blended with `smooth-min`, whose
 * parameter `k` produces the *seamless* fusions ("nahtlose organische Formen")
 * that hard booleans cannot. SDFs are evaluable function code — exactly the
 * editable, code-as-representation property the doc argues for — and are meshed
 * on demand by the Surface-Nets polygonizer in `./surface-nets.ts`.
 *
 * Distance formulas follow Inigo Quilez (iquilezles.org/articles/distfunctions).
 * `k` blends are inexact distance "bounds" (per the doc's caveat) but that only
 * affects ray-marching, never the seamlessness or the meshed result.
 */
export type Sdf = (x: number, y: number, z: number) => number;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

// ── primitives (centred at origin) ───────────────────────────────────────────

export function sdfSphere(r = 10): Sdf {
  return (x, y, z) => Math.hypot(x, y, z) - r;
}

export function sdfBox(sx = 20, sy = sx, sz = sx): Sdf {
  const bx = sx / 2, by = sy / 2, bz = sz / 2;
  return (x, y, z) => {
    const qx = Math.abs(x) - bx, qy = Math.abs(y) - by, qz = Math.abs(z) - bz;
    const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
    return Math.hypot(ox, oy, oz) + Math.min(Math.max(qx, Math.max(qy, qz)), 0);
  };
}

export function sdfRoundBox(sx = 20, sy = sx, sz = sx, r = 3): Sdf {
  const inner = sdfBox(Math.max(0, sx - 2 * r), Math.max(0, sy - 2 * r), Math.max(0, sz - 2 * r));
  return (x, y, z) => inner(x, y, z) - r;
}

/** Torus in the XY plane, tube around the ring; axis is Z. */
export function sdfTorus(R = 18, r = 6): Sdf {
  return (x, y, z) => {
    const q = Math.hypot(x, y) - R;
    return Math.hypot(q, z) - r;
  };
}

/** Capped cylinder along Z, radius `r`, height `h`. */
export function sdfCylinder(r = 10, h = 20): Sdf {
  const hh = h / 2;
  return (x, y, z) => {
    const dx = Math.hypot(x, y) - r;
    const dy = Math.abs(z) - hh;
    const ox = Math.max(dx, 0), oy = Math.max(dy, 0);
    return Math.min(Math.max(dx, dy), 0) + Math.hypot(ox, oy);
  };
}

export function sdfPlane(nx = 0, ny = 0, nz = 1, d = 0): Sdf {
  const l = Math.hypot(nx, ny, nz) || 1;
  const ux = nx / l, uy = ny / l, uz = nz / l;
  return (x, y, z) => x * ux + y * uy + z * uz + d;
}

// ── hard CSG ops ──────────────────────────────────────────────────────────────

export function sdfUnion(a: Sdf, b: Sdf): Sdf {
  return (x, y, z) => Math.min(a(x, y, z), b(x, y, z));
}
export function sdfSubtract(a: Sdf, b: Sdf): Sdf {
  return (x, y, z) => Math.max(a(x, y, z), -b(x, y, z));
}
export function sdfIntersect(a: Sdf, b: Sdf): Sdf {
  return (x, y, z) => Math.max(a(x, y, z), b(x, y, z));
}

// ── smooth (blended) ops — the seamless organic blends ──────────────────────

export function sdfSmoothUnion(a: Sdf, b: Sdf, k = 4): Sdf {
  return (x, y, z) => {
    const da = a(x, y, z), db = b(x, y, z);
    const h = clamp(0.5 + (0.5 * (db - da)) / k, 0, 1);
    return mix(db, da, h) - k * h * (1 - h);
  };
}
export function sdfSmoothSubtract(a: Sdf, b: Sdf, k = 4): Sdf {
  return (x, y, z) => {
    const da = a(x, y, z), db = b(x, y, z);
    const h = clamp(0.5 - (0.5 * (da + db)) / k, 0, 1);
    return mix(da, -db, h) + k * h * (1 - h);
  };
}
export function sdfSmoothIntersect(a: Sdf, b: Sdf, k = 4): Sdf {
  return (x, y, z) => {
    const da = a(x, y, z), db = b(x, y, z);
    const h = clamp(0.5 - (0.5 * (db - da)) / k, 0, 1);
    return mix(db, da, h) + k * h * (1 - h);
  };
}

// ── transforms / modifiers ────────────────────────────────────────────────────

export function sdfTranslate(s: Sdf, dx: number, dy: number, dz: number): Sdf {
  return (x, y, z) => s(x - dx, y - dy, z - dz);
}
/** Uniform scale by `f` (preserves distance metric). */
export function sdfScale(s: Sdf, f: number): Sdf {
  const inv = 1 / f;
  return (x, y, z) => s(x * inv, y * inv, z * inv) * f;
}
/** Round (inflate) a shape outward by `r` — fillets convex features. */
export function sdfRound(s: Sdf, r: number): Sdf {
  return (x, y, z) => s(x, y, z) - r;
}
/** Hollow shell of half-thickness `t` around the surface. */
export function sdfShell(s: Sdf, t: number): Sdf {
  return (x, y, z) => Math.abs(s(x, y, z)) - t;
}

/**
 * Friendly namespace exposed to scripts as `sdf.*` (short names) — e.g.
 * `sdf.smoothUnion(sdf.sphere(10), sdf.box(8), 4)`. Mirrors the `sdfXxx`
 * free functions above.
 */
export const sdf = {
  sphere: sdfSphere,
  box: sdfBox,
  roundBox: sdfRoundBox,
  torus: sdfTorus,
  cylinder: sdfCylinder,
  plane: sdfPlane,
  union: sdfUnion,
  subtract: sdfSubtract,
  intersect: sdfIntersect,
  smoothUnion: sdfSmoothUnion,
  smoothSubtract: sdfSmoothSubtract,
  smoothIntersect: sdfSmoothIntersect,
  translate: sdfTranslate,
  scale: sdfScale,
  round: sdfRound,
  shell: sdfShell,
};
