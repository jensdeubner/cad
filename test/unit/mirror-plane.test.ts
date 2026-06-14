import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { mirrorGeometry, mirrorBox } from '../../src/solid/mirror-plane';

/** Triangle index triples of a (possibly non-indexed) geometry. */
function triangles(geom: THREE.BufferGeometry): [number, number, number][] {
  const index = geom.getIndex();
  const tris: [number, number, number][] = [];
  if (index) {
    const a = index.array;
    for (let i = 0; i + 2 < a.length; i += 3) tris.push([a[i], a[i + 1], a[i + 2]]);
  } else {
    const count = geom.getAttribute('position').count;
    for (let v = 0; v + 2 < count; v += 3) tris.push([v, v + 1, v + 2]);
  }
  return tris;
}

describe('mirrorGeometry', () => {
  it('negates only the axis normal to the plane (xz → y)', () => {
    const box = new THREE.BoxGeometry(10, 20, 30);
    box.translate(5, 6, 7); // off-centre so mirroring is observable
    const before = (box.getAttribute('position').array as Float32Array).slice();

    const out = mirrorBox(box, 'xz');
    const after = out.getAttribute('position').array as Float32Array;

    for (let i = 0; i < before.length; i += 3) {
      expect(after[i]).toBeCloseTo(before[i]); // x unchanged
      expect(after[i + 1]).toBeCloseTo(-before[i + 1]); // y negated
      expect(after[i + 2]).toBeCloseTo(before[i + 2]); // z unchanged
    }
  });

  it('negates z for xy and x for yz', () => {
    const box = new THREE.BoxGeometry(10, 10, 10).translate(3, 4, 5);
    const before = (box.getAttribute('position').array as Float32Array).slice();

    const xy = mirrorGeometry(box, 'xy');
    const ay = xy.getAttribute('position').array as Float32Array;
    const yz = mirrorGeometry(box, 'yz');
    const az = yz.getAttribute('position').array as Float32Array;

    for (let i = 0; i < before.length; i += 3) {
      expect(ay[i + 2]).toBeCloseTo(-before[i + 2]); // xy negates z
      expect(ay[i]).toBeCloseTo(before[i]);
      expect(az[i]).toBeCloseTo(-before[i]); // yz negates x
      expect(az[i + 2]).toBeCloseTo(before[i + 2]);
    }
  });

  it('reverses triangle winding (swaps 2nd and 3rd vertex of each triangle)', () => {
    const box = new THREE.BoxGeometry(10, 10, 10);
    const beforeTris = triangles(box);

    const out = mirrorGeometry(box, 'xz');
    const afterTris = triangles(out);

    expect(afterTris.length).toBe(beforeTris.length);
    for (let i = 0; i < beforeTris.length; i++) {
      const [a, b, c] = beforeTris[i];
      expect(afterTris[i]).toEqual([a, c, b]);
    }
  });

  it('returns a NEW geometry and leaves the input untouched', () => {
    const box = new THREE.BoxGeometry(10, 10, 10).translate(0, 4, 0);
    const original = (box.getAttribute('position').array as Float32Array).slice();

    const out = mirrorGeometry(box, 'xz');
    expect(out).not.toBe(box);

    const stillSame = box.getAttribute('position').array as Float32Array;
    for (let i = 0; i < original.length; i++) expect(stillSame[i]).toBeCloseTo(original[i]);

    // Mirroring is an involution on positions: mirror twice ⇒ original coords.
    const back = mirrorGeometry(out, 'xz');
    const backArr = back.getAttribute('position').array as Float32Array;
    for (let i = 0; i < original.length; i++) expect(backArr[i]).toBeCloseTo(original[i]);
  });

  it('recomputes vertex normals (non-degenerate, unit length)', () => {
    const out = mirrorGeometry(new THREE.BoxGeometry(10, 10, 10), 'xz');
    const normals = out.getAttribute('normal');
    expect(normals).toBeTruthy();
    const n = normals.array as Float32Array;
    for (let i = 0; i < n.length; i += 3) {
      const len = Math.hypot(n[i], n[i + 1], n[i + 2]);
      expect(len).toBeCloseTo(1, 3);
    }
  });
});
