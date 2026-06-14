/**
 * Mesh decimation via vertex clustering.
 *
 * Pure geometry transform — no DOM, no scene, no wasm. Snaps every vertex onto
 * a uniform 3D grid (whose cell size derives from `gridResolution` divisions
 * along the longest bounding-box axis), welds all vertices that land in the same
 * cell to that cell's centroid, then rebuilds the triangle index, dropping
 * triangles that collapsed (two or three corners welded together). The result is
 * a fresh, lower-poly `THREE.BufferGeometry` with recomputed vertex normals.
 *
 * Reference: classic "vertex clustering" simplification (Rossignac & Borrel).
 */
import * as THREE from 'three';

/**
 * Decimate `geometry` by clustering its vertices onto a uniform grid.
 *
 * @param geometry      Source geometry (left untouched).
 * @param gridResolution Number of cells along the longest bbox axis (>= 1).
 *                       Lower = more aggressive reduction. Default 16.
 * @returns A NEW geometry with welded vertices, a rebuilt non-degenerate index
 *          and recomputed normals. Never mutates the input, never emits NaN.
 */
export function vertexClusterReduce(
  geometry: THREE.BufferGeometry,
  gridResolution = 16,
): THREE.BufferGeometry {
  const srcPos = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (!srcPos || srcPos.count === 0) {
    // Nothing to reduce — hand back an independent empty copy.
    return geometry.clone();
  }

  const vertexCount = srcPos.count;

  // Resolve the triangle list (indexed or implicit) into a flat array of
  // vertex-index triples so we can rebuild it after welding.
  const srcIndexAttr = geometry.getIndex();
  const triCount = srcIndexAttr ? srcIndexAttr.count / 3 : vertexCount / 3;
  const getTriIndex = srcIndexAttr
    ? (k: number): number => srcIndexAttr.getX(k)
    : (k: number): number => k;

  // ── 1. Bounding box of the source vertices ──────────────────────────
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < vertexCount; i++) {
    const x = srcPos.getX(i);
    const y = srcPos.getY(i);
    const z = srcPos.getZ(i);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }

  const sizeX = maxX - minX;
  const sizeY = maxY - minY;
  const sizeZ = maxZ - minZ;
  const longest = Math.max(sizeX, sizeY, sizeZ);

  const divisions = Math.max(1, Math.floor(gridResolution));
  // Guard a degenerate (zero-extent) mesh: any positive cell size welds all
  // verts to one point, which is the correct (fully collapsed) answer and
  // never divides by zero.
  const cell = longest > 0 ? longest / divisions : 1;
  const invCell = 1 / cell;

  // Number of cells per axis (at least 1 so a flat axis maps to column 0).
  const cellsX = Math.max(1, Math.ceil(sizeX * invCell) + 1);
  const cellsY = Math.max(1, Math.ceil(sizeY * invCell) + 1);
  const cellsXY = cellsX * cellsY;

  const cellOf = (x: number, y: number, z: number): number => {
    const ix = Math.min(cellsX - 1, Math.max(0, Math.floor((x - minX) * invCell)));
    const iy = Math.min(cellsY - 1, Math.max(0, Math.floor((y - minY) * invCell)));
    const iz = Math.max(0, Math.floor((z - minZ) * invCell));
    return ix + iy * cellsX + iz * cellsXY;
  };

  // ── 2. Cluster vertices → cell centroid + dense remap ───────────────
  // cellKey → new (welded) vertex slot.
  const cellToSlot = new Map<number, number>();
  // For each source vertex: which welded slot it maps to.
  const vertSlot = new Int32Array(vertexCount);
  // Accumulated centroid sums per slot.
  const sumX: number[] = [];
  const sumY: number[] = [];
  const sumZ: number[] = [];
  const counts: number[] = [];

  for (let i = 0; i < vertexCount; i++) {
    const x = srcPos.getX(i);
    const y = srcPos.getY(i);
    const z = srcPos.getZ(i);
    const key = cellOf(x, y, z);
    let slot = cellToSlot.get(key);
    if (slot === undefined) {
      slot = sumX.length;
      cellToSlot.set(key, slot);
      sumX.push(0);
      sumY.push(0);
      sumZ.push(0);
      counts.push(0);
    }
    vertSlot[i] = slot;
    sumX[slot] += x;
    sumY[slot] += y;
    sumZ[slot] += z;
    counts[slot] += 1;
  }

  const slotCount = sumX.length;
  const positions = new Float32Array(slotCount * 3);
  for (let s = 0; s < slotCount; s++) {
    const c = counts[s];
    positions[s * 3] = sumX[s] / c;
    positions[s * 3 + 1] = sumY[s] / c;
    positions[s * 3 + 2] = sumZ[s] / c;
  }

  // ── 3. Rebuild the index, dropping degenerate triangles ─────────────
  const indices: number[] = [];
  for (let t = 0; t < triCount; t++) {
    const a = vertSlot[getTriIndex(t * 3)];
    const b = vertSlot[getTriIndex(t * 3 + 1)];
    const c = vertSlot[getTriIndex(t * 3 + 2)];
    // Two or three corners welded together → zero-area, drop it.
    if (a === b || b === c || a === c) continue;
    indices.push(a, b, c);
  }

  // ── 4. Assemble the new geometry ────────────────────────────────────
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  if (indices.length > 0) {
    const indexData =
      slotCount > 65535 ? Uint32Array.from(indices) : Uint16Array.from(indices);
    out.setIndex(new THREE.BufferAttribute(indexData, 1));
  }
  out.computeVertexNormals();
  // computeVertexNormals normalises each accumulated normal; an isolated vertex
  // (no surviving triangle references it) keeps a zero-length normal which
  // normalisation turns into NaN. Sanitise to a safe unit vector so the result
  // is guaranteed NaN-free.
  const normal = out.getAttribute('normal') as THREE.BufferAttribute;
  const narr = normal.array as Float32Array;
  for (let i = 0; i < narr.length; i += 3) {
    if (
      !Number.isFinite(narr[i]) ||
      !Number.isFinite(narr[i + 1]) ||
      !Number.isFinite(narr[i + 2]) ||
      (narr[i] === 0 && narr[i + 1] === 0 && narr[i + 2] === 0)
    ) {
      narr[i] = 0;
      narr[i + 1] = 0;
      narr[i + 2] = 1;
    }
  }
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}
