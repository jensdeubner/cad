/**
 * Rectangular grid pattern — pure geometry kernel.
 *
 * Produces `cols * rows - 1` NEW geometries (the original 0,0 cell is skipped),
 * each a copy of the source translated by `(i*dx, 0, j*dy)` for grid cell
 * (i, j). No DOM, no scene. Reference shape: `src/solid/pattern-circular.ts`.
 */
import * as THREE from 'three';

/**
 * Tile the source geometry into a `cols × rows` grid (XZ plane), returning the
 * `cols * rows - 1` copies that are NOT the origin cell. Each copy is a fresh
 * BufferGeometry with translated positions and recomputed normals. Returns `[]`
 * when `cols < 1` or `rows < 1`.
 */
export function rectGridCopies(
  geometry: THREE.BufferGeometry,
  cols: number,
  rows: number,
  dx: number,
  dy: number,
): THREE.BufferGeometry[] {
  if (!Number.isFinite(cols) || !Number.isFinite(rows) || cols < 1 || rows < 1) return [];

  const copies: THREE.BufferGeometry[] = [];

  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      if (i === 0 && j === 0) continue; // skip the original cell
      const copy = geometry.clone();
      copy.translate(i * dx, 0, j * dy);
      copy.computeVertexNormals();
      copies.push(copy);
    }
  }

  return copies;
}
