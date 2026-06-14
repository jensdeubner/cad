/**
 * Wavefront OBJ parsing — pure, no DOM, no scene.
 *
 * Domain module for the `io-obj-import` feature (see
 * `src/features/io-obj-import.ts`). Turns a `.obj` text into a three.js
 * BufferGeometry. Supports `v` (vertex positions) and `f` (faces). Polygons
 * with more than three vertices are triangulated with a simple fan. Normal
 * and texture-coordinate indices in face tokens (`a/b/c`, `a//c`, `a/b`) are
 * ignored — only the position index (the part before the first `/`) is used.
 * Garbage or empty input never throws: it yields an empty geometry.
 */
import * as THREE from 'three';

/**
 * A valid Wavefront OBJ describing a ~20mm cube centered at the origin
 * (edge length 20, so corners at ±10). Eight vertices, six quad faces;
 * fan-triangulated to 12 triangles on import.
 */
export const SAMPLE_CUBE_OBJ = `# CAD sample cube — 20mm edge, centered at origin
o sample_cube
v -10 -10 -10
v  10 -10 -10
v  10  10 -10
v -10  10 -10
v -10 -10  10
v  10 -10  10
v  10  10  10
v -10  10  10
f 1 2 3 4
f 5 8 7 6
f 1 5 6 2
f 2 6 7 3
f 3 7 8 4
f 4 8 5 1
`;

/**
 * Parse a single face token (`a`, `a/b`, `a//c`, `a/b/c`) into a 0-based
 * position index. OBJ indices are 1-based and may be negative (relative to
 * the end of the vertex list). Returns `null` for unparseable tokens.
 */
function parsePositionIndex(token: string, vertexCount: number): number | null {
  const first = token.split('/')[0];
  if (first === '') return null;
  const raw = parseInt(first, 10);
  if (!Number.isFinite(raw) || raw === 0) return null;
  // Negative indices count back from the most recently parsed vertex.
  const idx = raw > 0 ? raw - 1 : vertexCount + raw;
  if (idx < 0 || idx >= vertexCount) return null;
  return idx;
}

/**
 * Parse a Wavefront OBJ string into a BufferGeometry with computed vertex
 * normals. Empty or invalid input returns an empty (no-attribute) geometry.
 */
export function parseObj(text: string): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  if (typeof text !== 'string' || text.length === 0) return geometry;

  // All vertices declared via `v` lines (flat x,y,z triples).
  const positions: number[] = [];
  // Triangle corner indices (0-based) into `positions`.
  const indices: number[] = [];

  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    const parts = trimmed.split(/\s+/);
    const keyword = parts[0];

    if (keyword === 'v') {
      const x = parseFloat(parts[1]);
      const y = parseFloat(parts[2]);
      const z = parseFloat(parts[3]);
      // Skip malformed vertex lines rather than poisoning the buffer.
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
        positions.push(x, y, z);
      }
      continue;
    }

    if (keyword === 'f') {
      const vertexCount = positions.length / 3;
      const corner: number[] = [];
      for (let i = 1; i < parts.length; i++) {
        const idx = parsePositionIndex(parts[i], vertexCount);
        if (idx !== null) corner.push(idx);
      }
      // A face needs at least three valid corners to form a triangle.
      if (corner.length < 3) continue;
      // Fan triangulation: (0,1,2), (0,2,3), … keeps convex polygons sane.
      for (let i = 1; i + 1 < corner.length; i++) {
        indices.push(corner[0], corner[i], corner[i + 1]);
      }
      continue;
    }
    // Other keywords (vn, vt, o, g, s, mtllib, usemtl, …) are ignored.
  }

  if (positions.length === 0 || indices.length === 0) {
    // Nothing usable parsed — return the empty geometry untouched.
    return geometry;
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
