/**
 * Mesh statistics — pure geometry analysis (volume / surface area / bounding
 * box / centroid) for a triangle mesh.
 *
 * No DOM, no scene, no three.js: just typed arrays in, plain numbers out.
 * Units are millimetres: lengths in mm, area in mm², volume in mm³.
 *
 * - Volume: signed-tetrahedron sum (divergence theorem). Each triangle forms a
 *   tetrahedron with the origin; the signed volumes sum to the enclosed volume
 *   for a closed, consistently-wound mesh. We report the absolute value so a
 *   reversed winding still gives a positive volume.
 * - Area: sum of triangle areas (½‖(b−a)×(c−a)‖).
 * - Centroid: volume-weighted centroid of those tetrahedra; if the volume is
 *   degenerate (≈0, e.g. an open/flat mesh) we fall back to the bbox center.
 */

export interface MeshStats {
  /** Enclosed volume in mm³ (absolute value of the signed sum). */
  volume: number;
  /** Total surface area in mm². */
  area: number;
  /** Volume-weighted centroid (bbox center fallback) in mm. */
  centroid: [number, number, number];
  /** Axis-aligned bounding box in mm. */
  bbox: { min: [number, number, number]; max: [number, number, number] };
  /** Number of triangles processed. */
  triangleCount: number;
}

/**
 * Compute mesh statistics from raw position/index buffers.
 *
 * @param positions Flat XYZ vertex coordinates (length = 3 · vertexCount).
 * @param indices   Triangle indices, or `null` for a non-indexed mesh where
 *                  every consecutive triple of positions is one triangle.
 */
export function computeMeshStats(
  positions: Float32Array,
  indices: Uint32Array | null,
): MeshStats {
  // Triangle index list: explicit indices, or implicit 0,1,2,3,… when null.
  const vertexCount = (positions.length / 3) | 0;
  const triIndices: ArrayLike<number> = indices ?? sequentialIndices(vertexCount);
  const triangleCount = (triIndices.length / 3) | 0;

  let signedVolumeSum = 0; // Σ of signed tetra volumes (× 6, scaled at the end)
  let area = 0;

  // Volume-weighted centroid accumulator (× 4 of each tetra centroid · volume).
  let cx = 0;
  let cy = 0;
  let cz = 0;

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (let t = 0; t < triangleCount; t++) {
    const ia = triIndices[t * 3] * 3;
    const ib = triIndices[t * 3 + 1] * 3;
    const ic = triIndices[t * 3 + 2] * 3;

    const ax = positions[ia];
    const ay = positions[ia + 1];
    const az = positions[ia + 2];
    const bx = positions[ib];
    const by = positions[ib + 1];
    const bz = positions[ib + 2];
    const cxx = positions[ic];
    const cyy = positions[ic + 1];
    const czz = positions[ic + 2];

    // Bounding box (touch every vertex of the triangle).
    if (ax < minX) minX = ax;
    if (ay < minY) minY = ay;
    if (az < minZ) minZ = az;
    if (ax > maxX) maxX = ax;
    if (ay > maxY) maxY = ay;
    if (az > maxZ) maxZ = az;
    if (bx < minX) minX = bx;
    if (by < minY) minY = by;
    if (bz < minZ) minZ = bz;
    if (bx > maxX) maxX = bx;
    if (by > maxY) maxY = by;
    if (bz > maxZ) maxZ = bz;
    if (cxx < minX) minX = cxx;
    if (cyy < minY) minY = cyy;
    if (czz < minZ) minZ = czz;
    if (cxx > maxX) maxX = cxx;
    if (cyy > maxY) maxY = cyy;
    if (czz > maxZ) maxZ = czz;

    // Cross product (b − a) × (c − a).
    const e1x = bx - ax;
    const e1y = by - ay;
    const e1z = bz - az;
    const e2x = cxx - ax;
    const e2y = cyy - ay;
    const e2z = czz - az;
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;

    // Triangle area = ½‖cross‖.
    area += 0.5 * Math.hypot(nx, ny, nz);

    // Signed volume of the tetra (origin, a, b, c) × 6 = a · (b × c).
    const v6 =
      ax * (by * czz - bz * cyy) -
      ay * (bx * czz - bz * cxx) +
      az * (bx * cyy - by * cxx);
    signedVolumeSum += v6;

    // Tetra centroid is the average of its four corners; origin contributes 0,
    // so it is (a + b + c) / 4. Weight by the signed volume (still × 6 here).
    cx += (ax + bx + cxx) * v6;
    cy += (ay + by + cyy) * v6;
    cz += (az + bz + czz) * v6;
  }

  const signedVolume = signedVolumeSum / 6;
  const volume = Math.abs(signedVolume);

  const hasBox = triangleCount > 0 && minX <= maxX;
  const bbox = {
    min: hasBox ? ([minX, minY, minZ] as [number, number, number]) : ([0, 0, 0] as [number, number, number]),
    max: hasBox ? ([maxX, maxY, maxZ] as [number, number, number]) : ([0, 0, 0] as [number, number, number]),
  };

  let centroid: [number, number, number];
  if (Math.abs(signedVolume) > 1e-9) {
    // cx/cy/cz hold Σ((a+b+c) · v6); divide by (4 · Σv6) where Σv6 = 6·signedVolume.
    const denom = 4 * 6 * signedVolume;
    centroid = [cx / denom, cy / denom, cz / denom];
  } else {
    // Degenerate / open mesh: fall back to bbox center.
    centroid = [
      (bbox.min[0] + bbox.max[0]) / 2,
      (bbox.min[1] + bbox.max[1]) / 2,
      (bbox.min[2] + bbox.max[2]) / 2,
    ];
  }

  return { volume, area, centroid, bbox, triangleCount };
}

/** Build 0,1,2,…,n−1 for a non-indexed mesh (every triple is a triangle). */
function sequentialIndices(vertexCount: number): Uint32Array {
  const out = new Uint32Array(vertexCount);
  for (let i = 0; i < vertexCount; i++) out[i] = i;
  return out;
}
