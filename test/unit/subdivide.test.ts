import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { subdivideOnce } from '../../src/mesh/subdivide';

function hasNaN(geom: THREE.BufferGeometry): boolean {
  for (const name of ['position', 'normal']) {
    const attr = geom.getAttribute(name);
    if (attr) {
      const arr = attr.array as ArrayLike<number>;
      for (let i = 0; i < arr.length; i++) if (Number.isNaN(arr[i])) return true;
    }
  }
  return false;
}

function triCount(geom: THREE.BufferGeometry): number {
  const idx = geom.getIndex();
  if (idx) return idx.count / 3;
  return (geom.getAttribute('position')?.count ?? 0) / 3;
}

describe('subdivideOnce', () => {
  it('quadruples a box: 12 tris → 48', () => {
    const box = new THREE.BoxGeometry(20, 20, 20); // non-indexed, 12 tris
    const sub = subdivideOnce(box);

    expect(triCount(box)).toBe(12);
    expect(triCount(sub)).toBe(48);
    expect(hasNaN(sub)).toBe(false);
    expect(sub.getAttribute('normal')).toBeTruthy();
  });

  it('works on indexed input and quadruples its triangles', () => {
    // A single indexed quad (2 tris) → 8 sub-triangles.
    const geom = new THREE.BufferGeometry();
    geom.setAttribute(
      'position',
      new THREE.BufferAttribute(
        new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
        3,
      ),
    );
    geom.setIndex([0, 1, 2, 0, 2, 3]);

    const sub = subdivideOnce(geom);

    expect(triCount(geom)).toBe(2);
    expect(triCount(sub)).toBe(8);
    expect(hasNaN(sub)).toBe(false);
  });

  it('places the new vertices on the original edge midpoints', () => {
    // One triangle in the z=0 plane.
    const geom = new THREE.BufferGeometry();
    geom.setAttribute(
      'position',
      new THREE.BufferAttribute(
        new Float32Array([0, 0, 0, 2, 0, 0, 0, 2, 0]),
        3,
      ),
    );

    const sub = subdivideOnce(geom);
    const pos = sub.getAttribute('position') as THREE.BufferAttribute;

    // Every emitted vertex stays in the original triangle's plane (z = 0)…
    for (let i = 0; i < pos.count; i++) expect(pos.getZ(i)).toBeCloseTo(0);
    // …and the central sub-triangle uses the three edge midpoints.
    const verts = new Set<string>();
    for (let i = 0; i < pos.count; i++) {
      verts.add(`${pos.getX(i)},${pos.getY(i)}`);
    }
    expect(verts.has('1,0')).toBe(true); // midpoint of (0,0)-(2,0)
    expect(verts.has('1,1')).toBe(true); // midpoint of (2,0)-(0,2)
    expect(verts.has('0,1')).toBe(true); // midpoint of (0,2)-(0,0)
  });

  it('returns a NEW geometry and never mutates the input', () => {
    const src = new THREE.BoxGeometry(10, 10, 10);
    const srcTris = triCount(src);
    const srcPosRef = src.getAttribute('position');

    const sub = subdivideOnce(src);

    expect(sub).not.toBe(src);
    expect(triCount(src)).toBe(srcTris); // input untouched
    expect(src.getAttribute('position')).toBe(srcPosRef);
  });

  it('handles an empty geometry without throwing', () => {
    const geom = new THREE.BufferGeometry();
    const sub = subdivideOnce(geom);
    expect(triCount(sub)).toBe(0);
    expect(hasNaN(sub)).toBe(false);
  });
});
