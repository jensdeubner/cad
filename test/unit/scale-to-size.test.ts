import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { scaleToMaxSize } from '../../src/solid/scale-to-size';

/** Axis-aligned extent (max-min) of a geometry's bounding box per axis. */
function extent(geom: THREE.BufferGeometry): THREE.Vector3 {
  geom.computeBoundingBox();
  const box = geom.boundingBox!;
  return new THREE.Vector3().subVectors(box.max, box.min);
}

describe('scaleToMaxSize', () => {
  it('scales a 20 mm cube so its largest dimension is 50 mm (ratio 50/20)', () => {
    const cube = new THREE.BoxGeometry(20, 20, 20); // -10..10 on every axis
    const out = scaleToMaxSize(cube, 50);

    const e = extent(out);
    expect(e.x).toBeCloseTo(50);
    expect(e.y).toBeCloseTo(50);
    expect(e.z).toBeCloseTo(50);

    // Center stays at the origin (scaled about the bbox center).
    out.computeBoundingBox();
    const c = new THREE.Vector3();
    out.boundingBox!.getCenter(c);
    expect(c.x).toBeCloseTo(0);
    expect(c.y).toBeCloseTo(0);
    expect(c.z).toBeCloseTo(0);
  });

  it('sizes the LARGEST dimension to the target on a non-cubic body', () => {
    // Extents 10 / 40 / 20 → largest = 40, factor = 50/40 = 1.25.
    const boxg = new THREE.BoxGeometry(10, 40, 20);
    const out = scaleToMaxSize(boxg, 50);

    const e = extent(out);
    expect(Math.max(e.x, e.y, e.z)).toBeCloseTo(50);
    // Uniform scale keeps proportions: 10→12.5, 40→50, 20→25.
    expect(e.x).toBeCloseTo(12.5);
    expect(e.y).toBeCloseTo(50);
    expect(e.z).toBeCloseTo(25);
  });

  it('scales an off-center body about its OWN bbox center (center stays put)', () => {
    const cube = new THREE.BoxGeometry(20, 20, 20).translate(100, 0, 0); // center (100,0,0)
    const before = new THREE.Vector3();
    cube.computeBoundingBox();
    cube.boundingBox!.getCenter(before);

    const out = scaleToMaxSize(cube, 50);
    out.computeBoundingBox();
    const after = new THREE.Vector3();
    out.boundingBox!.getCenter(after);

    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(after.z).toBeCloseTo(before.z);
    expect(Math.max(...extent(out).toArray())).toBeCloseTo(50);
  });

  it('returns a NEW geometry and leaves the input untouched', () => {
    const cube = new THREE.BoxGeometry(20, 20, 20);
    const original = (cube.getAttribute('position').array as Float32Array).slice();

    const out = scaleToMaxSize(cube, 50);
    expect(out).not.toBe(cube);

    const stillSame = cube.getAttribute('position').array as Float32Array;
    for (let i = 0; i < original.length; i++) expect(stillSame[i]).toBeCloseTo(original[i]);
  });

  it('recomputes vertex normals (unit length)', () => {
    const out = scaleToMaxSize(new THREE.BoxGeometry(20, 20, 20), 50);
    const normals = out.getAttribute('normal');
    expect(normals).toBeTruthy();
    const n = normals.array as Float32Array;
    for (let i = 0; i < n.length; i += 3) {
      const len = Math.hypot(n[i], n[i + 1], n[i + 2]);
      expect(len).toBeCloseTo(1, 3);
    }
  });

  it('returns an unchanged clone for empty geometry', () => {
    const empty = new THREE.BufferGeometry();
    const out = scaleToMaxSize(empty, 50);
    expect(out).not.toBe(empty);
    expect(out.getAttribute('position')).toBeUndefined();
  });

  it('returns an unchanged clone for a non-positive target', () => {
    const cube = new THREE.BoxGeometry(20, 20, 20);
    for (const bad of [0, -50, NaN]) {
      const out = scaleToMaxSize(cube, bad);
      expect(Math.max(...extent(out).toArray())).toBeCloseTo(20); // unchanged
    }
  });
});
