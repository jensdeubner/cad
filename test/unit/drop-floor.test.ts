import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { dropToFloor } from '../../src/solid/drop-floor';

describe('dropToFloor', () => {
  it('moves a centered cube so its min.z lands on Z=0', () => {
    const cube = new THREE.BoxGeometry(20, 20, 20); // -10..10 on every axis
    const { geometry, dz } = dropToFloor(cube);

    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    expect(box.min.z).toBeCloseTo(0);
    expect(box.max.z).toBeCloseTo(20);
    // Translated up by +10 (from min.z = -10).
    expect(dz).toBeCloseTo(10);
    // X and Y are untouched.
    expect(box.min.x).toBeCloseTo(-10);
    expect(box.max.x).toBeCloseTo(10);
    expect(box.min.y).toBeCloseTo(-10);
    expect(box.max.y).toBeCloseTo(10);
  });

  it('returns a NEW geometry, leaving the input untouched', () => {
    const cube = new THREE.BoxGeometry(10, 10, 10).translate(0, 0, 25); // z 20..30
    const { geometry, dz } = dropToFloor(cube);

    expect(geometry).not.toBe(cube);
    expect(dz).toBeCloseTo(-20);

    // Input unchanged.
    cube.computeBoundingBox();
    expect(cube.boundingBox!.min.z).toBeCloseTo(20);
    // Output dropped to floor.
    geometry.computeBoundingBox();
    expect(geometry.boundingBox!.min.z).toBeCloseTo(0);
    expect(geometry.boundingBox!.max.z).toBeCloseTo(10);
  });

  it('is a no-op (dz=0) for a body already resting on the floor', () => {
    const cube = new THREE.BoxGeometry(10, 10, 10).translate(0, 0, 5); // z 0..10
    const { geometry, dz } = dropToFloor(cube);
    expect(dz).toBeCloseTo(0);
    geometry.computeBoundingBox();
    expect(geometry.boundingBox!.min.z).toBeCloseTo(0);
  });

  it('guards empty geometry with dz=0', () => {
    const empty = new THREE.BufferGeometry();
    const { geometry, dz } = dropToFloor(empty);
    expect(dz).toBe(0);
    expect(geometry.getAttribute('position')).toBeUndefined();
  });
});
