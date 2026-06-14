import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { triangleArea, totalSurfaceArea, coplanarRegionArea } from '../../src/inspect/measure-area';

describe('triangleArea', () => {
  it('computes the area of a 3-4-5 right triangle as 6', () => {
    const a = new THREE.Vector3(0, 0, 0);
    const b = new THREE.Vector3(3, 0, 0);
    const c = new THREE.Vector3(0, 4, 0);
    expect(triangleArea(a, b, c)).toBeCloseTo(6, 10);
  });

  it('is NaN-safe on a degenerate (zero-area) triangle → 0', () => {
    const a = new THREE.Vector3(0, 0, 0);
    const b = new THREE.Vector3(1, 1, 1);
    const c = new THREE.Vector3(2, 2, 2); // collinear → zero area
    expect(triangleArea(a, b, c)).toBe(0);
  });

  it('is NaN-safe on non-finite coordinates → 0', () => {
    const a = new THREE.Vector3(NaN, 0, 0);
    const b = new THREE.Vector3(3, 0, 0);
    const c = new THREE.Vector3(0, 4, 0);
    expect(triangleArea(a, b, c)).toBe(0);
  });
});

describe('totalSurfaceArea', () => {
  it('sums all triangles of a 20mm box to ~2400 mm²', () => {
    // Surface area of a cube = 6 * side² = 6 * 400 = 2400.
    const box = new THREE.BoxGeometry(20, 20, 20);
    expect(totalSurfaceArea(box)).toBeCloseTo(2400, 1); // within ±0.5
  });

  it('respects a world matrix (uniform scale ×2 → area ×4)', () => {
    const box = new THREE.BoxGeometry(20, 20, 20);
    const m = new THREE.Matrix4().makeScale(2, 2, 2);
    expect(totalSurfaceArea(box, m)).toBeCloseTo(2400 * 4, 0);
  });

  it('returns 0 for empty geometry', () => {
    expect(totalSurfaceArea(new THREE.BufferGeometry())).toBe(0);
  });

  it('handles non-indexed geometry', () => {
    const box = new THREE.BoxGeometry(20, 20, 20).toNonIndexed();
    expect(box.getIndex()).toBeNull();
    expect(totalSurfaceArea(box)).toBeCloseTo(2400, 1);
  });
});

describe('coplanarRegionArea', () => {
  it('measures one box face seeded at triangle 0 as ~400 mm² with 2 triangles', () => {
    const box = new THREE.BoxGeometry(20, 20, 20);
    const region = coplanarRegionArea(box, 0);
    expect(region.area).toBeCloseTo(400, 1);
    expect(region.triangleCount).toBe(2);
  });

  it('every box face seed yields a 400 mm² / 2-triangle region', () => {
    const box = new THREE.BoxGeometry(20, 20, 20);
    // 12 triangles, 6 faces of 2 triangles each.
    for (let t = 0; t < 12; t++) {
      const region = coplanarRegionArea(box, t);
      expect(region.area).toBeCloseTo(400, 1);
      expect(region.triangleCount).toBe(2);
    }
  });

  it('returns zero for an out-of-range seed', () => {
    const box = new THREE.BoxGeometry(20, 20, 20);
    expect(coplanarRegionArea(box, 999)).toEqual({ area: 0, triangleCount: 0 });
  });
});
