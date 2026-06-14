import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { scaleGeometry } from '../../src/solid/scale-factor';

/** Axis-aligned extent (max-min) of a geometry's bounding box per axis. */
function extent(geom: THREE.BufferGeometry): THREE.Vector3 {
  geom.computeBoundingBox();
  const box = geom.boundingBox!;
  return new THREE.Vector3().subVectors(box.max, box.min);
}

describe('scaleGeometry', () => {
  it('doubles a centered cube about its bbox center (factor 2)', () => {
    const cube = new THREE.BoxGeometry(20, 20, 20); // -10..10 on every axis
    const out = scaleGeometry(cube, 2);

    out.computeBoundingBox();
    const box = out.boundingBox!;
    // Extent doubles: 20 → 40.
    expect(box.max.x - box.min.x).toBeCloseTo(40);
    expect(box.max.y - box.min.y).toBeCloseTo(40);
    expect(box.max.z - box.min.z).toBeCloseTo(40);
    // Center stays at the origin (symmetric about the pivot).
    const c = new THREE.Vector3();
    box.getCenter(c);
    expect(c.x).toBeCloseTo(0);
    expect(c.y).toBeCloseTo(0);
    expect(c.z).toBeCloseTo(0);
  });

  it('scales an off-center body about its OWN bbox center (center stays put)', () => {
    const cube = new THREE.BoxGeometry(10, 10, 10).translate(50, 0, 0); // center (50,0,0)
    const beforeCenter = new THREE.Vector3();
    cube.computeBoundingBox();
    cube.boundingBox!.getCenter(beforeCenter);

    const out = scaleGeometry(cube, 3);
    out.computeBoundingBox();
    const afterCenter = new THREE.Vector3();
    out.boundingBox!.getCenter(afterCenter);

    // Default pivot = bbox center, so the center does not drift.
    expect(afterCenter.x).toBeCloseTo(beforeCenter.x);
    expect(afterCenter.y).toBeCloseTo(beforeCenter.y);
    expect(afterCenter.z).toBeCloseTo(beforeCenter.z);
    // Extent triples: 10 → 30.
    const e = extent(out);
    expect(e.x).toBeCloseTo(30);
    expect(e.y).toBeCloseTo(30);
    expect(e.z).toBeCloseTo(30);
  });

  it('honors an explicit center', () => {
    const cube = new THREE.BoxGeometry(10, 10, 10); // -5..5
    const out = scaleGeometry(cube, 2, new THREE.Vector3(0, 0, 0));
    out.computeBoundingBox();
    const box = out.boundingBox!;
    // About origin, factor 2 → corners move from ±5 to ±10.
    expect(box.min.x).toBeCloseTo(-10);
    expect(box.max.x).toBeCloseTo(10);
  });

  it('returns a NEW geometry and leaves the input untouched', () => {
    const cube = new THREE.BoxGeometry(20, 20, 20);
    const original = (cube.getAttribute('position').array as Float32Array).slice();

    const out = scaleGeometry(cube, 1.5);
    expect(out).not.toBe(cube);

    const stillSame = cube.getAttribute('position').array as Float32Array;
    for (let i = 0; i < original.length; i++) expect(stillSame[i]).toBeCloseTo(original[i]);
  });

  it('recomputes vertex normals (unit length)', () => {
    const out = scaleGeometry(new THREE.BoxGeometry(20, 20, 20), 1.5);
    const normals = out.getAttribute('normal');
    expect(normals).toBeTruthy();
    const n = normals.array as Float32Array;
    for (let i = 0; i < n.length; i += 3) {
      const len = Math.hypot(n[i], n[i + 1], n[i + 2]);
      expect(len).toBeCloseTo(1, 3);
    }
  });

  it('rejects a non-positive factor', () => {
    const cube = new THREE.BoxGeometry(10, 10, 10);
    expect(() => scaleGeometry(cube, 0)).toThrow();
    expect(() => scaleGeometry(cube, -2)).toThrow();
    expect(() => scaleGeometry(cube, NaN)).toThrow();
  });
});
