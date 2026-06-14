import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { laplacianSmooth, countVertices } from '../../src/mesh/smooth';

function hasNaN(geom: THREE.BufferGeometry): boolean {
  for (const name of ['position', 'normal']) {
    const attr = geom.getAttribute(name);
    if (!attr) continue;
    const arr = attr.array as ArrayLike<number>;
    for (let i = 0; i < arr.length; i++) {
      if (!Number.isFinite(arr[i])) return true;
    }
  }
  return false;
}

function bbox(geom: THREE.BufferGeometry): THREE.Box3 {
  geom.computeBoundingBox();
  return geom.boundingBox!.clone();
}

describe('laplacianSmooth', () => {
  it('returns a NEW geometry and never mutates the input', () => {
    const src = new THREE.SphereGeometry(12, 24, 16);
    const srcVerts = countVertices(src);
    const srcPosRef = src.getAttribute('position');

    const out = laplacianSmooth(src, 2, 0.5);

    expect(out).not.toBe(src);
    expect(countVertices(src)).toBe(srcVerts); // input untouched
    expect(src.getAttribute('position')).toBe(srcPosRef);
  });

  it('preserves welded vertex count across iterations and never emits NaN', () => {
    const sphere = new THREE.SphereGeometry(12, 24, 16);
    const out = laplacianSmooth(sphere, 2, 0.5);

    expect(hasNaN(out)).toBe(false);
    expect(out.getAttribute('normal')).toBeTruthy();

    // A welded box keeps 8 corner slots through any number of iterations.
    const box = new THREE.BoxGeometry(20, 20, 20);
    const sm0 = laplacianSmooth(box, 0, 0.5);
    const sm5 = laplacianSmooth(box, 5, 0.5);
    expect(countVertices(sm0)).toBe(8);
    expect(countVertices(sm5)).toBe(8); // welded count is stable
  });

  it('produces finite positions and stays within the original bounds (stable)', () => {
    const sphere = new THREE.SphereGeometry(10, 32, 24);
    const before = bbox(sphere);
    const out = laplacianSmooth(sphere, 2, 0.5);

    expect(hasNaN(out)).toBe(false);

    const after = bbox(out);
    // Smoothing is a convex-combination toward neighbours — it must not blow up
    // past the original AABB (allow a tiny float slack).
    const slack = 1e-3;
    expect(after.min.x).toBeGreaterThanOrEqual(before.min.x - slack);
    expect(after.min.y).toBeGreaterThanOrEqual(before.min.y - slack);
    expect(after.min.z).toBeGreaterThanOrEqual(before.min.z - slack);
    expect(after.max.x).toBeLessThanOrEqual(before.max.x + slack);
    expect(after.max.y).toBeLessThanOrEqual(before.max.y + slack);
    expect(after.max.z).toBeLessThanOrEqual(before.max.z + slack);
  });

  it('actually relaxes a noisy vertex toward its neighbour average', () => {
    // A flat 4-triangle fan around a center vertex pushed off-plane; one pass at
    // lambda=1 must pull the center back to the neighbour average (z → 0).
    const geom = new THREE.BufferGeometry();
    geom.setAttribute(
      'position',
      new THREE.BufferAttribute(
        new Float32Array([
          0, 0, 5, //   0 center, lifted off-plane (noise)
          1, 0, 0, //   1
          0, 1, 0, //   2
          -1, 0, 0, //  3
          0, -1, 0, //  4
        ]),
        3,
      ),
    );
    geom.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 1]);

    const out = laplacianSmooth(geom, 1, 1.0);
    const pos = out.getAttribute('position') as THREE.BufferAttribute;
    // Center vertex (slot 0) neighbour average z = 0 → fully relaxed at lambda 1.
    expect(Math.abs(pos.getZ(0))).toBeLessThan(1e-4);
    expect(hasNaN(out)).toBe(false);
  });

  it('handles an empty geometry without throwing', () => {
    const geom = new THREE.BufferGeometry();
    const out = laplacianSmooth(geom);
    expect(countVertices(out)).toBe(0);
    expect(hasNaN(out)).toBe(false);
  });

  it('treats non-finite / zero parameters as no-ops without NaN', () => {
    const sphere = new THREE.SphereGeometry(8, 16, 12);
    const out = laplacianSmooth(sphere, Number.NaN, Number.NaN);
    expect(hasNaN(out)).toBe(false);
    expect(countVertices(out)).toBeGreaterThan(0);
  });
});
