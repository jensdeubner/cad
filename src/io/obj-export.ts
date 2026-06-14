/**
 * Wavefront OBJ serialization — pure, no DOM, no scene.
 *
 * Domain module for the `io-obj-export` feature (see
 * `src/features/io-obj-export.ts`). Turns a three.js BufferGeometry into a
 * valid `.obj` string with positions, optional vertex normals and 1-indexed
 * triangle faces. Handles both indexed and non-indexed geometry.
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
 * Serialize a geometry to a Wavefront OBJ string.
 *
 * Emits one `o <name>` object, `v x y z` position lines, `vn x y z` normal
 * lines when the geometry carries a `normal` attribute, and `f a/b/c`
 * triangle faces (1-indexed). When normals are present, faces use the
 * `v//vn` form (`a//a b//b c//c`) so vertex/normal indices stay in lockstep.
 */
export function geometryToObj(geometry: THREE.BufferGeometry, name = 'body'): string {
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (!pos) {
    return `o ${name}\n`;
  }
  const normal = geometry.getAttribute('normal') as THREE.BufferAttribute | undefined;
  const vertexCount = pos.count;

  const lines: string[] = [`o ${name}`];

  for (let i = 0; i < vertexCount; i++) {
    lines.push(`v ${fmt(pos.getX(i))} ${fmt(pos.getY(i))} ${fmt(pos.getZ(i))}`);
  }

  const hasNormals = !!normal && normal.count === vertexCount;
  if (hasNormals && normal) {
    for (let i = 0; i < vertexCount; i++) {
      lines.push(`vn ${fmt(normal.getX(i))} ${fmt(normal.getY(i))} ${fmt(normal.getZ(i))}`);
    }
  }

  const face = (a: number, b: number, c: number): string => {
    // OBJ is 1-indexed.
    const ia = a + 1;
    const ib = b + 1;
    const ic = c + 1;
    if (hasNormals) {
      return `f ${ia}//${ia} ${ib}//${ib} ${ic}//${ic}`;
    }
    return `f ${ia} ${ib} ${ic}`;
  };

  const index = geometry.getIndex();
  if (index) {
    for (let i = 0; i + 2 < index.count; i += 3) {
      lines.push(face(index.getX(i), index.getX(i + 1), index.getX(i + 2)));
    }
  } else {
    for (let i = 0; i + 2 < vertexCount; i += 3) {
      lines.push(face(i, i + 1, i + 2));
    }
  }

  return lines.join('\n') + '\n';
}

/** Count `v ` and `f ` lines in a serialized OBJ string. */
export function objStats(obj: string): { vertexCount: number; faceCount: number } {
  let vertexCount = 0;
  let faceCount = 0;
  for (const line of obj.split('\n')) {
    if (line.startsWith('v ')) vertexCount++;
    else if (line.startsWith('f ')) faceCount++;
  }
  return { vertexCount, faceCount };
}
