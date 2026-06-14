/**
 * cad-script · mesh core
 *
 * The neutral, dependency-free triangle-mesh value type that the whole
 * cad-script kernel passes around. Keeping it as flat `number[]` (rather than a
 * `THREE.BufferGeometry`) means every module here — primitives, CSG,
 * triangulation, the sketch builders, the SDF mesher — is pure and unit-testable
 * under vitest/jsdom without ever touching WebGL.
 *
 * The bridge to three.js lives in `./geometry.ts`; nothing in this file imports
 * three so the kernel stays light.
 *
 * Winding convention: triangles are counter-clockwise when viewed from OUTSIDE
 * the solid (right-hand rule → outward normal). All primitive builders and the
 * CSG/extrude/revolve paths honour this so `volume()` is positive and the boolean
 * kernel sees consistent orientation.
 */

/** A triangle soup. `tags[i]` (optional) is a provenance id for triangle `i`. */
export interface Mesh {
  /** Flat XYZ vertex coordinates: `[x0,y0,z0, x1,y1,z1, …]`. */
  positions: number[];
  /** Flat triangle vertex indices into `positions`: `[a,b,c, …]`. */
  indices: number[];
  /**
   * Optional per-triangle provenance tag (length === indices.length / 3). Used
   * by the topological selectors to implement `Select.LAST` / `Select.NEW`:
   * every operation stamps the faces it produces so the agent can say "the faces
   * from the most recent cut" without fragile numeric ids. Survives CSG.
   */
  tags?: number[];
}

export type Vec3 = [number, number, number];

/** An empty mesh (no geometry). */
export function emptyMesh(): Mesh {
  return { positions: [], indices: [] };
}

/** Triangle count of a mesh. */
export function triangleCount(m: Mesh): number {
  return Math.floor(m.indices.length / 3);
}

/** Vertex count of a mesh. */
export function vertexCount(m: Mesh): number {
  return Math.floor(m.positions.length / 3);
}

/** Deep copy. */
export function cloneMesh(m: Mesh): Mesh {
  return {
    positions: m.positions.slice(),
    indices: m.indices.slice(),
    tags: m.tags ? m.tags.slice() : undefined,
  };
}

/**
 * Merge coincident vertices (quantised to `tol`) and drop triangles that
 * collapse to a degenerate after welding. Mirrors `src/solid/intersect.ts`'s
 * `weldMeshData` (three.js primitives keep per-face vertices, which look like
 * boundary edges to any boolean kernel) but preserves per-triangle `tags`.
 */
export function weld(m: Mesh, tol = 1e-5): Mesh {
  const inv = 1 / tol;
  const map = new Map<string, number>();
  const positions: number[] = [];
  const remap = new Int32Array(vertexCount(m));

  for (let v = 0; v < remap.length; v++) {
    const x = m.positions[v * 3];
    const y = m.positions[v * 3 + 1];
    const z = m.positions[v * 3 + 2];
    const key = `${Math.round(x * inv)},${Math.round(y * inv)},${Math.round(z * inv)}`;
    let slot = map.get(key);
    if (slot === undefined) {
      slot = positions.length / 3;
      map.set(key, slot);
      positions.push(x, y, z);
    }
    remap[v] = slot;
  }

  const indices: number[] = [];
  const tags: number[] | undefined = m.tags ? [] : undefined;
  for (let i = 0; i < m.indices.length; i += 3) {
    const a = remap[m.indices[i]];
    const b = remap[m.indices[i + 1]];
    const c = remap[m.indices[i + 2]];
    if (a === b || b === c || a === c) continue; // degenerate after weld
    indices.push(a, b, c);
    if (tags && m.tags) tags.push(m.tags[i / 3]);
  }
  return { positions, indices, tags };
}

/**
 * Signed-tetrahedron volume of the mesh, absolute value (mm³ in this app's
 * units). A robust manifold-ness smell test: a watertight, consistently-wound
 * solid has a stable, positive value.
 */
export function volume(m: Mesh): number {
  let vol = 0;
  const p = m.positions;
  const idx = m.indices;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3;
    const b = idx[i + 1] * 3;
    const c = idx[i + 2] * 3;
    const ax = p[a], ay = p[a + 1], az = p[a + 2];
    const bx = p[b], by = p[b + 1], bz = p[b + 2];
    const cx = p[c], cy = p[c + 1], cz = p[c + 2];
    vol +=
      (ax * (by * cz - bz * cy) -
        ay * (bx * cz - bz * cx) +
        az * (bx * cy - by * cx)) /
      6;
  }
  return Math.abs(vol);
}

/** Total surface area (sum of triangle areas). */
export function surfaceArea(m: Mesh): number {
  let area = 0;
  const p = m.positions;
  const idx = m.indices;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const cx = uy * vz - uz * vy;
    const cy = uz * vx - ux * vz;
    const cz = ux * vy - uy * vx;
    area += 0.5 * Math.hypot(cx, cy, cz);
  }
  return area;
}

export interface Bounds {
  min: Vec3;
  max: Vec3;
  size: Vec3;
  center: Vec3;
}

/** Axis-aligned bounds, or `null` for an empty mesh. */
export function bounds(m: Mesh): Bounds | null {
  if (m.positions.length === 0) return null;
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const val = m.positions[i + k];
      if (val < min[k]) min[k] = val;
      if (val > max[k]) max[k] = val;
    }
  }
  return {
    min,
    max,
    size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
    center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
  };
}

/**
 * Watertight test: every undirected edge is shared by exactly two triangles.
 * Used by the test-suite and as an internal manifold-ness check on CSG output.
 */
export function isWatertight(m: Mesh): boolean {
  if (m.indices.length === 0) return false;
  const edges = new Map<string, number>();
  const key = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`);
  const idx = m.indices;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    for (const [u, v] of [[a, b], [b, c], [c, a]] as const) {
      const kk = key(u, v);
      edges.set(kk, (edges.get(kk) ?? 0) + 1);
    }
  }
  for (const count of edges.values()) if (count !== 2) return false;
  return true;
}

/** Concatenate meshes into one soup (no boolean — just appends + offsets). */
export function mergeMeshes(meshes: Mesh[]): Mesh {
  const positions: number[] = [];
  const indices: number[] = [];
  const tags: number[] = [];
  let hasTags = false;
  let offset = 0;
  for (const m of meshes) {
    positions.push(...m.positions);
    for (const i of m.indices) indices.push(i + offset);
    if (m.tags) {
      hasTags = true;
      tags.push(...m.tags);
    } else {
      for (let t = 0; t < triangleCount(m); t++) tags.push(0);
    }
    offset += vertexCount(m);
  }
  return { positions, indices, tags: hasTags ? tags : undefined };
}

/** Set the provenance tag on every triangle of a mesh (in place) and return it. */
export function tagMesh(m: Mesh, tag: number): Mesh {
  const n = triangleCount(m);
  m.tags = new Array(n).fill(tag);
  return m;
}

// ── transforms ─────────────────────────────────────────────────────────────

/** Apply a per-vertex transform function, returning a new mesh. */
export function mapVertices(m: Mesh, fn: (x: number, y: number, z: number) => Vec3): Mesh {
  const positions = new Array<number>(m.positions.length);
  for (let i = 0; i < m.positions.length; i += 3) {
    const [x, y, z] = fn(m.positions[i], m.positions[i + 1], m.positions[i + 2]);
    positions[i] = x;
    positions[i + 1] = y;
    positions[i + 2] = z;
  }
  return { positions, indices: m.indices.slice(), tags: m.tags?.slice() };
}

export function translateMesh(m: Mesh, dx: number, dy: number, dz: number): Mesh {
  return mapVertices(m, (x, y, z) => [x + dx, y + dy, z + dz]);
}

export function scaleMesh(m: Mesh, sx: number, sy = sx, sz = sx): Mesh {
  const out = mapVertices(m, (x, y, z) => [x * sx, y * sy, z * sz]);
  // A negative scale on an odd number of axes flips winding → restore it.
  if (sx * sy * sz < 0) flipWinding(out);
  return out;
}

/** Rotate about a (not necessarily unit) axis through the origin, angle in radians. */
export function rotateMesh(m: Mesh, axis: Vec3, angle: number): Mesh {
  const len = Math.hypot(axis[0], axis[1], axis[2]) || 1;
  const ux = axis[0] / len, uy = axis[1] / len, uz = axis[2] / len;
  const c = Math.cos(angle), s = Math.sin(angle), t = 1 - c;
  // Rodrigues rotation matrix.
  const r00 = c + ux * ux * t, r01 = ux * uy * t - uz * s, r02 = ux * uz * t + uy * s;
  const r10 = uy * ux * t + uz * s, r11 = c + uy * uy * t, r12 = uy * uz * t - ux * s;
  const r20 = uz * ux * t - uy * s, r21 = uz * uy * t + ux * s, r22 = c + uz * uz * t;
  return mapVertices(m, (x, y, z) => [
    r00 * x + r01 * y + r02 * z,
    r10 * x + r11 * y + r12 * z,
    r20 * x + r21 * y + r22 * z,
  ]);
}

/** Signed-tetrahedron volume (sign reflects winding: + = outward/CCW). */
export function signedVolume(m: Mesh): number {
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

/** Weld and ensure outward (positive signed volume) winding. */
export function orient(m: Mesh): Mesh {
  const w = weld(m);
  if (signedVolume(w) < 0) flipWinding(w);
  return w;
}

/** Reverse triangle winding in place (flips outward normals). */
export function flipWinding(m: Mesh): Mesh {
  for (let i = 0; i < m.indices.length; i += 3) {
    const tmp = m.indices[i + 1];
    m.indices[i + 1] = m.indices[i + 2];
    m.indices[i + 2] = tmp;
  }
  return m;
}
