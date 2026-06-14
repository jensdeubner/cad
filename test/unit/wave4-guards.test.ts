import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { cutAbovePlaneZ } from '../../src/solid/plane-cut';

/** Regression guards from the wave-4 adversarial review. */
describe('plane-cut robustness guards', () => {
  it('emits no NaN normals when triangle vertices lie exactly on the cut plane', () => {
    // A 20mm cube spans z −10..10; cutting at z=10 makes side-triangle vertices
    // land exactly on the plane — the case that produced duplicate verts → NaN.
    const cut = cutAbovePlaneZ(new THREE.BoxGeometry(20, 20, 20), 10);
    const n = cut.getAttribute('normal') as THREE.BufferAttribute | null;
    if (n) {
      for (let i = 0; i < n.count; i++) {
        expect(Number.isFinite(n.getX(i))).toBe(true);
        expect(Number.isFinite(n.getY(i))).toBe(true);
        expect(Number.isFinite(n.getZ(i))).toBe(true);
      }
    }
    const p = cut.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      expect(Number.isFinite(p.getX(i)) && Number.isFinite(p.getY(i)) && Number.isFinite(p.getZ(i))).toBe(true);
    }
  });

  it('keeps the upper half of a cube cut through the middle', () => {
    const cut = cutAbovePlaneZ(new THREE.BoxGeometry(20, 20, 20), 0);
    cut.computeBoundingBox();
    expect(cut.getAttribute('position').count).toBeGreaterThan(0);
    expect(cut.boundingBox!.min.z).toBeCloseTo(0, 4);
    // No NaN normals here either.
    const n = cut.getAttribute('normal') as THREE.BufferAttribute | null;
    if (n) for (let i = 0; i < n.count; i++) expect(Number.isFinite(n.getX(i))).toBe(true);
  });
});
