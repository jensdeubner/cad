import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { distance, bboxDiagonal } from '../../src/inspect/measure';

describe('distance — point-to-point', () => {
  it('measures a 3-4-5 right triangle hypotenuse', () => {
    const a = new THREE.Vector3(0, 0, 0);
    const b = new THREE.Vector3(3, 4, 0);
    expect(distance(a, b)).toBeCloseTo(5, 9);
  });

  it('measures a space diagonal (1,1,1) = sqrt(3)', () => {
    const a = new THREE.Vector3(0, 0, 0);
    const b = new THREE.Vector3(1, 1, 1);
    expect(distance(a, b)).toBeCloseTo(Math.sqrt(3), 9);
  });

  it('is zero for identical points', () => {
    const a = new THREE.Vector3(5, -2, 7);
    expect(distance(a, a.clone())).toBe(0);
  });
});

describe('bboxDiagonal', () => {
  it('returns the space diagonal of a 20 mm cube (sqrt(3)*20)', () => {
    const box = new THREE.Box3(
      new THREE.Vector3(-10, -10, -10),
      new THREE.Vector3(10, 10, 10),
    );
    expect(bboxDiagonal(box)).toBeCloseTo(Math.sqrt(3) * 20, 9);
  });

  it('returns the diagonal of a non-cubic box', () => {
    const box = new THREE.Box3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(3, 4, 0),
    );
    expect(bboxDiagonal(box)).toBeCloseTo(5, 9);
  });

  it('returns 0 for an empty box', () => {
    expect(bboxDiagonal(new THREE.Box3())).toBe(0);
  });
});
