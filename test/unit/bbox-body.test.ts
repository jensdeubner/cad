import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { boxGeometryForBounds } from '../../src/solid/bbox-body';

/**
 * `boxGeometryForBounds` must yield a closed BoxGeometry whose bounding box
 * spans exactly the requested min..max corners, with finite vertices and a
 * non-degenerate result even for flat (zero-extent) inputs.
 */
describe('boxGeometryForBounds', () => {
  it('spans exactly the requested min..max corners', () => {
    const min = new THREE.Vector3(-3, 5, -10);
    const max = new THREE.Vector3(7, 12, 4);
    const geom = boxGeometryForBounds(min, max);
    geom.computeBoundingBox();
    const box = geom.boundingBox!;

    expect(box.min.x).toBeCloseTo(min.x, 5);
    expect(box.min.y).toBeCloseTo(min.y, 5);
    expect(box.min.z).toBeCloseTo(min.z, 5);
    expect(box.max.x).toBeCloseTo(max.x, 5);
    expect(box.max.y).toBeCloseTo(max.y, 5);
    expect(box.max.z).toBeCloseTo(max.z, 5);
  });

  it('produces only finite vertex positions and at least one triangle', () => {
    const geom = boxGeometryForBounds(
      new THREE.Vector3(-12, -12, -12),
      new THREE.Vector3(12, 12, 12),
    );
    const arr = geom.getAttribute('position').array as ArrayLike<number>;
    for (let i = 0; i < arr.length; i++) expect(Number.isFinite(arr[i])).toBe(true);

    const index = geom.getIndex();
    const triCount = index ? index.count / 3 : geom.getAttribute('position').count / 3;
    expect(triCount).toBeGreaterThan(0);
  });

  it('matches a symmetric sphere-like bbox (-12..12)', () => {
    const geom = boxGeometryForBounds(
      new THREE.Vector3(-12, -12, -12),
      new THREE.Vector3(12, 12, 12),
    );
    geom.computeBoundingBox();
    const box = geom.boundingBox!;
    expect(box.max.x - box.min.x).toBeCloseTo(24, 5);
    expect(box.max.y - box.min.y).toBeCloseTo(24, 5);
    expect(box.max.z - box.min.z).toBeCloseTo(24, 5);
  });

  it('guards a zero-extent (flat) bounding box without producing NaN', () => {
    const min = new THREE.Vector3(2, 2, 2);
    const max = new THREE.Vector3(2, 8, 8); // X extent is zero
    const geom = boxGeometryForBounds(min, max);
    geom.computeBoundingBox();
    const box = geom.boundingBox!;

    const arr = geom.getAttribute('position').array as ArrayLike<number>;
    for (let i = 0; i < arr.length; i++) expect(Number.isFinite(arr[i])).toBe(true);

    // The collapsed axis is clamped to a tiny positive extent (not zero/NaN).
    expect(box.max.x - box.min.x).toBeGreaterThan(0);
    // The healthy axes still span exactly.
    expect(box.min.y).toBeCloseTo(2, 5);
    expect(box.max.z).toBeCloseTo(8, 5);
  });
});
