import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { convexHullGeometry } from '../../src/solid/convex-hull';
import { scaleGeometry } from '../../src/solid/scale-factor';

/** Regression guards from the wave-3 adversarial review (crash vectors). */
describe('wave3 robustness guards', () => {
  it('convexHullGeometry degrades to empty geometry on collinear points (no throw)', () => {
    const collinear = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(2, 0, 0),
      new THREE.Vector3(3, 0, 0),
    ];
    let geom: THREE.BufferGeometry | undefined;
    expect(() => {
      geom = convexHullGeometry(collinear);
    }).not.toThrow();
    const pos = geom!.getAttribute('position') as THREE.BufferAttribute | undefined;
    expect(pos === undefined || pos.count === 0).toBe(true);
  });

  it('convexHullGeometry builds a real hull for a non-degenerate cloud', () => {
    const cloud = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(10, 0, 0),
      new THREE.Vector3(0, 10, 0),
      new THREE.Vector3(0, 0, 10),
      new THREE.Vector3(10, 10, 10),
    ];
    const geom = convexHullGeometry(cloud);
    expect((geom.getAttribute('position') as THREE.BufferAttribute).count).toBeGreaterThan(0);
  });

  it('scaleGeometry returns the geometry without throwing when there is no position attribute', () => {
    const empty = new THREE.BufferGeometry();
    let out: THREE.BufferGeometry | undefined;
    expect(() => {
      out = scaleGeometry(empty, 1.5);
    }).not.toThrow();
    expect(out).toBeInstanceOf(THREE.BufferGeometry);
  });

  it('scaleGeometry still rejects a non-positive factor', () => {
    const box = new THREE.BoxGeometry(2, 2, 2);
    expect(() => scaleGeometry(box, 0)).toThrow();
    expect(() => scaleGeometry(box, -1)).toThrow();
  });
});
