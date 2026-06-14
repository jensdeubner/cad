/**
 * ASCII PLY serialization — pure, no DOM, no scene.
 *
 * Domain module for the `io-ply-export` feature (see
 * `src/features/io-ply-export.ts`). Turns a three.js BufferGeometry into a
 * valid ASCII `.ply` string with a header, `x y z` vertex lines and
 * `3 a b c` triangle faces. PLY uses 0-based vertex indices. Handles both
 * indexed and non-indexed geometry.
 */
import type * as THREE from 'three';

/** Format a float at ~6 significant digits, trimming trailing zeros. */
function fmt(n: number): string {
  if (!Number.isFinite(n)) return '0';
  // toPrecision(6) keeps ~6 significant digits; parseFloat drops trailing
  // zeros and any exponent noise, then we re-stringify a clean decimal.
  return String(parseFloat(n.toPrecision(6)));
}

/**
 * Serialize a geometry to an ASCII PLY string.
 *
 * Emits a standard PLY header (`ply`, `format ascii 1.0`, vertex/face element
 * declarations, `end_header`), then N `x y z` vertex lines and M
 * `3 a b c` triangle-face lines. Vertex indices are 0-based (PLY convention),
 * so indexed geometry indices are used as-is and non-indexed geometry is
 * walked in triples.
 */
export function geometryToPly(geometry: THREE.BufferGeometry): string {
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
  const vertexCount = pos ? pos.count : 0;

  // Gather faces first so the header counts are accurate.
  const faces: Array<[number, number, number]> = [];
  if (pos) {
    const index = geometry.getIndex();
    if (index) {
      for (let i = 0; i + 2 < index.count; i += 3) {
        faces.push([index.getX(i), index.getX(i + 1), index.getX(i + 2)]);
      }
    } else {
      for (let i = 0; i + 2 < vertexCount; i += 3) {
        faces.push([i, i + 1, i + 2]);
      }
    }
  }

  const lines: string[] = [
    'ply',
    'format ascii 1.0',
    `element vertex ${vertexCount}`,
    'property float x',
    'property float y',
    'property float z',
    `element face ${faces.length}`,
    'property list uchar int vertex_index',
    'end_header',
  ];

  if (pos) {
    for (let i = 0; i < vertexCount; i++) {
      lines.push(`${fmt(pos.getX(i))} ${fmt(pos.getY(i))} ${fmt(pos.getZ(i))}`);
    }
  }

  for (const [a, b, c] of faces) {
    // PLY uses 0-based vertex indices — emit as-is.
    lines.push(`3 ${a} ${b} ${c}`);
  }

  return lines.join('\n') + '\n';
}

/** Parse the `element vertex N` / `element face M` counts from a PLY header. */
export function plyStats(ply: string): { vertexCount: number; faceCount: number } {
  let vertexCount = 0;
  let faceCount = 0;
  for (const line of ply.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === 'end_header') break;
    const v = /^element vertex (\d+)$/.exec(trimmed);
    if (v) {
      vertexCount = parseInt(v[1], 10);
      continue;
    }
    const f = /^element face (\d+)$/.exec(trimmed);
    if (f) {
      faceCount = parseInt(f[1], 10);
    }
  }
  return { vertexCount, faceCount };
}
