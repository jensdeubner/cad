import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { circularCopies } from '../../src/solid/pattern-circular';

describe('circularCopies', () => {
  it('returns count-1 new geometries', () => {
    const geom = new THREE.BoxGeometry(10, 10, 10);
    const copies = circularCopies(geom, 4, new THREE.Vector3(0, 0, 1), new THREE.Vector3());
    expect(copies).toHaveLength(3);
    for (const c of copies) {
      expect(c).not.toBe(geom);
      expect(c).toBeInstanceOf(THREE.BufferGeometry);
      expect(c.getAttribute('normal')).toBeTruthy();
    }
  });

  it('guards count < 2 → empty array', () => {
    const geom = new THREE.BoxGeometry(10, 10, 10);
    expect(circularCopies(geom, 1, new THREE.Vector3(0, 0, 1), new THREE.Vector3())).toEqual([]);
    expect(circularCopies(geom, 0, new THREE.Vector3(0, 0, 1), new THREE.Vector3())).toEqual([]);
  });

  it('rotates a point at +X by 90° about Z (count=4) to +Y', () => {
    // Single vertex at (10,0,0); first copy (i=1) → θ = 90°.
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute([10, 0, 0], 3));
    const [first] = circularCopies(geom, 4, new THREE.Vector3(0, 0, 1), new THREE.Vector3());
    const pos = first.getAttribute('position');
    expect(pos.getX(0)).toBeCloseTo(0, 5);
    expect(pos.getY(0)).toBeCloseTo(10, 5);
    expect(pos.getZ(0)).toBeCloseTo(0, 5);
  });

  it('rotates about an arbitrary center, not the origin', () => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute([10, 0, 0], 3));
    // Center at (10,0,0): the source vertex sits on the axis → stays put.
    const [first] = circularCopies(geom, 4, new THREE.Vector3(0, 0, 1), new THREE.Vector3(10, 0, 0));
    const pos = first.getAttribute('position');
    expect(pos.getX(0)).toBeCloseTo(10, 5);
    expect(pos.getY(0)).toBeCloseTo(0, 5);
    expect(pos.getZ(0)).toBeCloseTo(0, 5);
  });

  it('does not mutate the source geometry', () => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute([10, 0, 0], 3));
    circularCopies(geom, 6, new THREE.Vector3(0, 0, 1), new THREE.Vector3());
    const pos = geom.getAttribute('position');
    expect(pos.getX(0)).toBe(10);
    expect(pos.getY(0)).toBe(0);
  });
});
