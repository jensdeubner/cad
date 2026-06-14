import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { angleAtVertex } from '../../src/inspect/measure-angle';

describe('angleAtVertex — 3-point angle (degrees)', () => {
  it('is 90° for perpendicular rays (1,0,0)-(0,0,0)-(0,1,0)', () => {
    const a = new THREE.Vector3(1, 0, 0);
    const v = new THREE.Vector3(0, 0, 0);
    const c = new THREE.Vector3(0, 1, 0);
    expect(angleAtVertex(a, v, c)).toBeCloseTo(90, 9);
  });

  it('is 180° for opposite rays (-1,0,0)-(0,0,0)-(1,0,0)', () => {
    const a = new THREE.Vector3(-1, 0, 0);
    const v = new THREE.Vector3(0, 0, 0);
    const c = new THREE.Vector3(1, 0, 0);
    expect(angleAtVertex(a, v, c)).toBeCloseTo(180, 9);
  });

  it('is 45° for (1,0,0)-(0,0,0)-(1,1,0)', () => {
    const a = new THREE.Vector3(1, 0, 0);
    const v = new THREE.Vector3(0, 0, 0);
    const c = new THREE.Vector3(1, 1, 0);
    expect(angleAtVertex(a, v, c)).toBeCloseTo(45, 9);
  });

  it('returns 0 (not NaN) when a ray has zero length', () => {
    const v = new THREE.Vector3(2, 3, 4);
    const a = v.clone(); // zero-length ray V→A
    const c = new THREE.Vector3(5, 3, 4);
    const deg = angleAtVertex(a, v, c);
    expect(Number.isNaN(deg)).toBe(false);
    expect(deg).toBe(0);
  });

  it('returns 0 (not NaN) when both rays have zero length', () => {
    const v = new THREE.Vector3(0, 0, 0);
    const deg = angleAtVertex(v.clone(), v, v.clone());
    expect(Number.isNaN(deg)).toBe(false);
    expect(deg).toBe(0);
  });

  it('is 90° at the box corner V=(min) with A and C along the axes', () => {
    // Mirrors quickAngle corner construction for an axis-aligned box.
    const v = new THREE.Vector3(-10, -10, -10);
    const a = new THREE.Vector3(10, -10, -10);
    const c = new THREE.Vector3(-10, 10, -10);
    expect(angleAtVertex(a, v, c)).toBeCloseTo(90, 9);
  });
});
