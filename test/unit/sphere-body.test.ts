import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { sphereGeometryForBounds } from '../../src/solid/sphere-body';

/**
 * `sphereGeometryForBounds` must yield a SphereGeometry of the requested radius
 * translated to the requested center, with finite vertices and a non-degenerate
 * result even for a non-positive (degenerate) radius.
 */
describe('sphereGeometryForBounds', () => {
  it('builds a sphere of the requested radius at the requested center', () => {
    const center = new THREE.Vector3(5, -3, 8);
    const radius = 17.32;
    const geom = sphereGeometryForBounds(center, radius);
    geom.computeBoundingSphere();
    const bs = geom.boundingSphere!;

    expect(bs.center.x).toBeCloseTo(center.x, 4);
    expect(bs.center.y).toBeCloseTo(center.y, 4);
    expect(bs.center.z).toBeCloseTo(center.z, 4);
    expect(bs.radius).toBeCloseTo(radius, 3);
  });

  it('spans exactly center ± radius along each axis', () => {
    const center = new THREE.Vector3(0, 0, 0);
    const radius = 12;
    const geom = sphereGeometryForBounds(center, radius);
    geom.computeBoundingBox();
    const box = geom.boundingBox!;

    expect(box.min.x).toBeCloseTo(-radius, 3);
    expect(box.max.x).toBeCloseTo(radius, 3);
    expect(box.min.y).toBeCloseTo(-radius, 3);
    expect(box.max.y).toBeCloseTo(radius, 3);
  });

  it('produces only finite vertex positions and at least one triangle', () => {
    const geom = sphereGeometryForBounds(new THREE.Vector3(1, 2, 3), 9);
    const arr = geom.getAttribute('position').array as ArrayLike<number>;
    for (let i = 0; i < arr.length; i++) expect(Number.isFinite(arr[i])).toBe(true);

    const index = geom.getIndex();
    const triCount = index ? index.count / 3 : geom.getAttribute('position').count / 3;
    expect(triCount).toBeGreaterThan(0);
  });

  it('falls back to a tiny positive radius for non-positive input', () => {
    for (const r of [0, -5, Number.NaN]) {
      const geom = sphereGeometryForBounds(new THREE.Vector3(), r);
      geom.computeBoundingSphere();
      const bs = geom.boundingSphere!;
      expect(Number.isFinite(bs.radius)).toBe(true);
      expect(bs.radius).toBeGreaterThan(0);
      const arr = geom.getAttribute('position').array as ArrayLike<number>;
      for (let i = 0; i < arr.length; i++) expect(Number.isFinite(arr[i])).toBe(true);
    }
  });
});
