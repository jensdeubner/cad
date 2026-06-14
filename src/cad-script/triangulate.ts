/**
 * cad-script · 2D polygon triangulation (ear clipping)
 *
 * Turns a simple (non-self-intersecting) 2D polygon into triangles so the
 * sketch builders can cap extrusions and revolutions. O(n²) ear clipping is
 * plenty for hand/agent-authored profiles (tens of points), needs no
 * dependencies, and is easy to verify. Returns index triples into the input
 * point array. Input winding is normalised internally, so callers may pass CW
 * or CCW.
 */
export type P2 = [number, number];

function signedArea(poly: P2[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    a += poly[i][0] * poly[j][1] - poly[j][0] * poly[i][1];
  }
  return a / 2;
}

function triArea2(a: P2, b: P2, c: P2): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
}

function pointInTriangle(p: P2, a: P2, b: P2, c: P2): boolean {
  const d1 = triArea2(p, a, b);
  const d2 = triArea2(p, b, c);
  const d3 = triArea2(p, c, a);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

/**
 * Triangulate `poly` (a closed ring; do not repeat the first point at the end).
 * Returns a flat list of index triples `[i0,i1,i2, …]` referencing `poly`, all
 * counter-clockwise. Returns `[]` for fewer than 3 points.
 */
export function triangulate(poly: P2[]): number[] {
  const n = poly.length;
  if (n < 3) return [];

  // Work on an index ring; ensure CCW so an "ear" is a convex vertex.
  const idx: number[] = [];
  if (signedArea(poly) < 0) {
    for (let i = n - 1; i >= 0; i--) idx.push(i);
  } else {
    for (let i = 0; i < n; i++) idx.push(i);
  }

  const out: number[] = [];
  let guard = 0;
  const maxGuard = n * n + 16;
  while (idx.length > 3 && guard++ < maxGuard) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const i0 = idx[(i - 1 + idx.length) % idx.length];
      const i1 = idx[i];
      const i2 = idx[(i + 1) % idx.length];
      const a = poly[i0], b = poly[i1], c = poly[i2];
      if (triArea2(a, b, c) <= 0) continue; // reflex or degenerate → not an ear

      let isEar = true;
      for (let k = 0; k < idx.length; k++) {
        const ik = idx[k];
        if (ik === i0 || ik === i1 || ik === i2) continue;
        if (pointInTriangle(poly[ik], a, b, c)) {
          isEar = false;
          break;
        }
      }
      if (!isEar) continue;

      out.push(i0, i1, i2);
      idx.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break; // numeric trouble — bail with what we have
  }
  if (idx.length === 3) out.push(idx[0], idx[1], idx[2]);
  return out;
}
