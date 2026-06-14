/**
 * cad-script · Surface-Nets polygonizer (Track B mesher)
 *
 * Turns an SDF (`./sdf.ts`) into a watertight triangle `Mesh`. Naive Surface
 * Nets (after Mikola Lysenko / S.F. Gibson) is chosen over Marching Cubes
 * because it needs no 256-entry triangle table, places one vertex per surface
 * cell (so blends stay smooth), and yields a closed quad mesh that triangulates
 * cleanly — a good fit for the organic, smooth-min blended shapes Track B is for.
 *
 * The sampling grid is padded so the iso-surface never touches the boundary,
 * guaranteeing a closed solid (and a stable `orient()` downstream).
 */
import { Mesh, orient, Vec3 } from './mesh';
import type { Sdf } from './sdf';

// Edge connectivity of the unit cube, built once (Lysenko's construction).
const cubeEdges = new Int32Array(24);
const edgeTable = new Int32Array(256);
(function initTables() {
  let k = 0;
  for (let i = 0; i < 8; i++) {
    for (let j = 1; j <= 4; j <<= 1) {
      const p = i ^ j;
      if (i <= p) {
        cubeEdges[k++] = i;
        cubeEdges[k++] = p;
      }
    }
  }
  for (let i = 0; i < 256; i++) {
    let em = 0;
    for (let j = 0; j < 24; j += 2) {
      const a = !!(i & (1 << cubeEdges[j]));
      const b = !!(i & (1 << cubeEdges[j + 1]));
      em |= a !== b ? 1 << (j >> 1) : 0;
    }
    edgeTable[i] = em;
  }
})();

export interface MeshSdfOptions {
  min: Vec3;
  max: Vec3;
  /** Samples along the longest axis (resolution). Default 48. */
  res?: number;
}

/**
 * Sample `sdf` over the [min,max] box (negative = inside) and extract its
 * zero-level surface as a watertight, oriented `Mesh`.
 */
export function meshSdf(sdf: Sdf, opts: MeshSdfOptions): Mesh {
  const res = Math.max(8, Math.min(160, Math.floor(opts.res ?? 48)));
  const sizeX = opts.max[0] - opts.min[0];
  const sizeY = opts.max[1] - opts.min[1];
  const sizeZ = opts.max[2] - opts.min[2];
  const longest = Math.max(sizeX, sizeY, sizeZ) || 1;
  const step = longest / res;
  // +3 sample padding each axis so the surface stays interior (closed solid).
  const pad = 2;
  const dimX = Math.ceil(sizeX / step) + 1 + pad * 2;
  const dimY = Math.ceil(sizeY / step) + 1 + pad * 2;
  const dimZ = Math.ceil(sizeZ / step) + 1 + pad * 2;
  const ox = opts.min[0] - pad * step;
  const oy = opts.min[1] - pad * step;
  const oz = opts.min[2] - pad * step;

  // Sample grid (x fastest, then y, then z).
  const data = new Float32Array(dimX * dimY * dimZ);
  let n = 0;
  for (let z = 0; z < dimZ; z++) {
    const wz = oz + z * step;
    for (let y = 0; y < dimY; y++) {
      const wy = oy + y * step;
      for (let x = 0; x < dimX; x++) {
        data[n++] = sdf(ox + x * step, wy, wz);
      }
    }
  }

  const dims: [number, number, number] = [dimX, dimY, dimZ];
  const vertices: number[][] = [];
  const quads: number[][] = [];
  surfaceNets(data, dims, vertices, quads);

  // Convert sample-space vertices → world; quads → triangles.
  const positions: number[] = [];
  for (const v of vertices) {
    positions.push(ox + v[0] * step, oy + v[1] * step, oz + v[2] * step);
  }
  const indices: number[] = [];
  for (const q of quads) {
    indices.push(q[0], q[1], q[2]);
    indices.push(q[0], q[2], q[3]);
  }

  if (indices.length === 0) return { positions: [], indices: [] };
  return orient({ positions, indices });
}

/** Core naive Surface-Nets pass over a flat sample grid. */
function surfaceNets(
  data: Float32Array,
  dims: [number, number, number],
  vertices: number[][],
  faces: number[][],
): void {
  const R: [number, number, number] = [1, dims[0] + 1, (dims[0] + 1) * (dims[1] + 1)];
  const grid = new Float32Array(8);
  let bufNo = 1;
  const buffer = new Int32Array(R[2] * 2);
  const x: [number, number, number] = [0, 0, 0];
  let n = 0;

  for (x[2] = 0; x[2] < dims[2] - 1; x[2]++, n += dims[0], bufNo ^= 1, R[2] = -R[2]) {
    let m = 1 + (dims[0] + 1) * (1 + bufNo * (dims[1] + 1));
    for (x[1] = 0; x[1] < dims[1] - 1; x[1]++, n++, m += 2) {
      for (x[0] = 0; x[0] < dims[0] - 1; x[0]++, n++, m++) {
        // Read the 8 corner samples of this cell, build the inside/outside mask.
        let mask = 0;
        let g = 0;
        let idx = n;
        for (let k = 0; k < 2; k++, idx += dims[0] * dims[1] - 2 * dims[0]) {
          for (let j = 0; j < 2; j++, idx += dims[0] - 2) {
            for (let i = 0; i < 2; i++, g++, idx++) {
              const p = data[idx];
              grid[g] = p;
              mask |= p < 0 ? 1 << g : 0;
            }
          }
        }
        if (mask === 0 || mask === 0xff) continue;

        const edgeMask = edgeTable[mask];
        const v: [number, number, number] = [0, 0, 0];
        let eCount = 0;
        for (let i = 0; i < 12; i++) {
          if (!(edgeMask & (1 << i))) continue;
          eCount++;
          const e0 = cubeEdges[i << 1];
          const e1 = cubeEdges[(i << 1) + 1];
          const g0 = grid[e0];
          const g1 = grid[e1];
          let t = g0 - g1;
          if (Math.abs(t) > 1e-10) t = g0 / t;
          else continue;
          for (let j = 0, kk = 1; j < 3; j++, kk <<= 1) {
            const a = e0 & kk;
            const b = e1 & kk;
            if (a !== b) v[j] += a ? 1.0 - t : t;
            else v[j] += a ? 1.0 : 0.0;
          }
        }
        const s = 1.0 / eCount;
        for (let i = 0; i < 3; i++) v[i] = x[i] + s * v[i];

        buffer[m] = vertices.length;
        vertices.push(v.slice() as number[]);

        // Emit a quad for each of the 3 axis edges that the surface crosses.
        for (let i = 0; i < 3; i++) {
          if (!(edgeMask & (1 << i))) continue;
          const iu = (i + 1) % 3;
          const iv = (i + 2) % 3;
          if (x[iu] === 0 || x[iv] === 0) continue;
          const du = R[iu];
          const dv = R[iv];
          if (mask & 1) {
            faces.push([buffer[m], buffer[m - du], buffer[m - du - dv], buffer[m - dv]]);
          } else {
            faces.push([buffer[m], buffer[m - dv], buffer[m - du - dv], buffer[m - du]]);
          }
        }
      }
    }
  }
}
