import { describe, it, expect } from 'vitest';
import { makeTorus, makeCone, makePyramid } from '../../src/solid/primitives-extra';

/**
 * The extra primitive builders are pure THREE.BufferGeometry factories.
 * Every one must yield a non-empty, finite, centered triangle mesh in mm.
 */
function triangleCount(geom: ReturnType<typeof makeTorus>): number {
  const index = geom.getIndex();
  const pos = geom.getAttribute('position');
  return index ? index.count / 3 : pos.count / 3;
}

function allFinite(geom: ReturnType<typeof makeTorus>): boolean {
  const arr = geom.getAttribute('position').array as ArrayLike<number>;
  for (let i = 0; i < arr.length; i++) {
    if (!Number.isFinite(arr[i])) return false;
  }
  return true;
}

const cases: Array<[string, () => ReturnType<typeof makeTorus>]> = [
  ['torus', () => makeTorus()],
  ['cone', () => makeCone()],
  ['pyramid', () => makePyramid()],
];

describe('primitives-extra builders', () => {
  for (const [name, build] of cases) {
    describe(name, () => {
      const geom = build();

      it('produces at least one triangle', () => {
        expect(triangleCount(geom)).toBeGreaterThan(0);
      });

      it('has only finite vertex positions', () => {
        expect(allFinite(geom)).toBe(true);
      });

      it('is centered at the origin within tolerance', () => {
        geom.computeBoundingBox();
        const box = geom.boundingBox!;
        const cx = (box.min.x + box.max.x) / 2;
        const cy = (box.min.y + box.max.y) / 2;
        const cz = (box.min.z + box.max.z) / 2;
        expect(cx).toBeCloseTo(0, 5);
        expect(cy).toBeCloseTo(0, 5);
        expect(cz).toBeCloseTo(0, 5);
      });
    });
  }

  it('makeTorus respects ring and tube radii (bbox = 2*(R+r))', () => {
    const geom = makeTorus(18, 6);
    geom.computeBoundingBox();
    const box = geom.boundingBox!;
    // Torus lies in the XY plane: extent in X/Y is 2*(R+r) = 48.
    expect(box.max.x - box.min.x).toBeCloseTo(48, 3);
    expect(box.max.y - box.min.y).toBeCloseTo(48, 3);
  });

  it('makePyramid base edge ≈ requested base length', () => {
    const base = 22;
    const geom = makePyramid(base, 24);
    geom.computeBoundingBox();
    const box = geom.boundingBox!;
    // After the 45° rotation the square base is axis-aligned with edge = base.
    expect(box.max.x - box.min.x).toBeCloseTo(base, 3);
    expect(box.max.z - box.min.z).toBeCloseTo(base, 3);
    expect(box.max.y - box.min.y).toBeCloseTo(24, 3);
  });
});
