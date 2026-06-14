import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { duplicateGeometry } from '../../src/solid/duplicate';

describe('duplicateGeometry', () => {
  it('translates every vertex by the offset (clone shifted)', () => {
    const box = new THREE.BoxGeometry(10, 20, 30);
    const before = (box.getAttribute('position').array as Float32Array).slice();
    const offset = new THREE.Vector3(12, -3, 5);

    const out = duplicateGeometry(box, offset);
    const after = out.getAttribute('position').array as Float32Array;

    expect(after.length).toBe(before.length);
    for (let i = 0; i < before.length; i += 3) {
      expect(after[i]).toBeCloseTo(before[i] + offset.x);
      expect(after[i + 1]).toBeCloseTo(before[i + 1] + offset.y);
      expect(after[i + 2]).toBeCloseTo(before[i + 2] + offset.z);
    }
  });

  it('returns a NEW geometry and leaves the input untouched (immutability)', () => {
    const box = new THREE.BoxGeometry(10, 10, 10).translate(0, 4, 0);
    const original = (box.getAttribute('position').array as Float32Array).slice();

    const out = duplicateGeometry(box, new THREE.Vector3(7, 0, 0));
    expect(out).not.toBe(box);
    expect(out.getAttribute('position')).not.toBe(box.getAttribute('position'));

    // Source positions are unchanged.
    const stillSame = box.getAttribute('position').array as Float32Array;
    for (let i = 0; i < original.length; i++) expect(stillSame[i]).toBeCloseTo(original[i]);
  });

  it('keeps the triangle count and normals intact', () => {
    const box = new THREE.BoxGeometry(10, 10, 10);
    const beforeNormals = (box.getAttribute('normal').array as Float32Array).slice();

    const out = duplicateGeometry(box, new THREE.Vector3(5, 0, 0));
    const afterNormals = out.getAttribute('normal').array as Float32Array;

    expect(out.getAttribute('position').count).toBe(box.getAttribute('position').count);
    expect(afterNormals.length).toBe(beforeNormals.length);
    for (let i = 0; i < beforeNormals.length; i++) {
      expect(afterNormals[i]).toBeCloseTo(beforeNormals[i], 5);
    }
  });

  it('guards empty geometry — returns a bare clone without throwing', () => {
    const empty = new THREE.BufferGeometry();
    const out = duplicateGeometry(empty, new THREE.Vector3(10, 0, 0));
    expect(out).not.toBe(empty);
    expect(out.getAttribute('position')).toBeUndefined();
  });
});
