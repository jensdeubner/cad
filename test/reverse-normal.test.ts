import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { reverseWinding, signedVolume } from '../src/mesh/reverse-normal';

function indicesOf(geom: THREE.BufferGeometry): number[] {
  const idx = geom.getIndex();
  return idx ? Array.from(idx.array) : [];
}

function volumeOf(geom: THREE.BufferGeometry): number {
  const pos = geom.getAttribute('position').array as ArrayLike<number>;
  const idx = geom.getIndex()?.array ?? null;
  return signedVolume(pos, idx);
}

describe('reverseWinding (indexed cube)', () => {
  it('swaps the 2nd/3rd index of every triangle without mutating the input', () => {
    const cube = new THREE.BoxGeometry(20, 20, 20).toNonIndexed();
    // Re-index so we exercise the indexed branch deterministically.
    const indexed = new THREE.BoxGeometry(20, 20, 20); // BoxGeometry is indexed
    const before = indicesOf(indexed);
    expect(before.length).toBeGreaterThan(0);

    const out = reverseWinding(indexed);
    const after = indicesOf(out);

    // Input untouched.
    expect(indicesOf(indexed)).toEqual(before);
    // Each (a,b,c) triple becomes (a,c,b).
    for (let i = 0; i + 2 < before.length; i += 3) {
      expect(after[i]).toBe(before[i]);
      expect(after[i + 1]).toBe(before[i + 2]);
      expect(after[i + 2]).toBe(before[i + 1]);
    }
    expect(out.getAttribute('normal')).toBeTruthy();
    void cube;
  });

  it('inverts the signed volume sign', () => {
    const cube = new THREE.BoxGeometry(20, 20, 20);
    const vBefore = volumeOf(cube);
    const out = reverseWinding(cube);
    const vAfter = volumeOf(out);

    expect(vBefore).not.toBe(0);
    expect(Math.sign(vAfter)).toBe(-Math.sign(vBefore));
    // Magnitude of a closed cube is preserved (= ±8000 for a 20mm cube).
    expect(Math.abs(vAfter)).toBeCloseTo(Math.abs(vBefore), 6);
    expect(Math.abs(vAfter)).toBeCloseTo(8000, 3);
  });
});

describe('reverseWinding (non-indexed cube)', () => {
  it('swaps vertices 2/3 of every triangle and inverts the volume', () => {
    const cube = new THREE.BoxGeometry(20, 20, 20).toNonIndexed();
    expect(cube.getIndex()).toBeNull();
    const vBefore = volumeOf(cube);

    const out = reverseWinding(cube);
    expect(out.getIndex()).toBeNull();
    const vAfter = volumeOf(out);

    expect(Math.sign(vAfter)).toBe(-Math.sign(vBefore));
    expect(Math.abs(vAfter)).toBeCloseTo(Math.abs(vBefore), 3);
    expect(out.getAttribute('normal')).toBeTruthy();
  });
});

describe('signedVolume', () => {
  it('handles indexed and non-indexed input equivalently', () => {
    const indexed = new THREE.BoxGeometry(20, 20, 20);
    const nonIndexed = indexed.clone().toNonIndexed();
    expect(Math.abs(volumeOf(indexed))).toBeCloseTo(Math.abs(volumeOf(nonIndexed)), 3);
  });
});
