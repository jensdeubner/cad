import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { weldVertices, countVertices } from '../../src/mesh/weld';

function hasNaN(geom: THREE.BufferGeometry): boolean {
  const pos = geom.getAttribute('position');
  if (pos) {
    const arr = pos.array as ArrayLike<number>;
    for (let i = 0; i < arr.length; i++) if (Number.isNaN(arr[i])) return true;
  }
  const nrm = geom.getAttribute('normal');
  if (nrm) {
    const narr = nrm.array as ArrayLike<number>;
    for (let i = 0; i < narr.length; i++) if (Number.isNaN(narr[i])) return true;
  }
  return false;
}

function triCount(geom: THREE.BufferGeometry): number {
  const idx = geom.getIndex();
  if (idx) return idx.count / 3;
  return (geom.getAttribute('position')?.count ?? 0) / 3;
}

describe('weldVertices', () => {
  it('collapses a non-indexed box (24 verts) to its 8 unique corners', () => {
    const box = new THREE.BoxGeometry(20, 20, 20); // 24 position verts, 12 tris
    expect(countVertices(box)).toBe(24);

    const welded = weldVertices(box);

    expect(countVertices(welded)).toBe(8);
    expect(triCount(welded)).toBe(12); // a cube has no degenerate faces
    expect(hasNaN(welded)).toBe(false);
    expect(welded.getAttribute('normal')).toBeTruthy();
  });

  it('merges duplicated coincident vertices of an explicit cube', () => {
    // Two coincident copies of every corner of a unit cube (16 verts → 8).
    const base = [
      [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
      [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
    ];
    const positions: number[] = [];
    for (const [x, y, z] of base) {
      positions.push(x, y, z); // original
      positions.push(x, y, z); // exact duplicate
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(positions), 3),
    );
    // One triangle referencing three distinct corners (slots 0, 2, 4).
    geom.setIndex([0, 2, 4]);

    expect(countVertices(geom)).toBe(16);

    const welded = weldVertices(geom);

    expect(countVertices(welded)).toBe(8);
    expect(hasNaN(welded)).toBe(false);
    expect(triCount(welded)).toBe(1);
  });

  it('merges vertices that differ by less than epsilon', () => {
    const geom = new THREE.BufferGeometry();
    // Three near-coincident points (within 1e-5) + one far apart.
    geom.setAttribute(
      'position',
      new THREE.BufferAttribute(
        new Float32Array([
          0, 0, 0,
          1e-5, 0, 0,
          0, 1e-5, 0,
          5, 0, 0,
        ]),
        3,
      ),
    );
    geom.setIndex([0, 1, 3, 1, 2, 3]);

    const welded = weldVertices(geom, 1e-4);

    // The three near-coincident points merge → 2 unique vertices remain.
    expect(countVertices(welded)).toBe(2);
    expect(hasNaN(welded)).toBe(false);
  });

  it('drops triangles that collapse to fewer than 3 distinct corners', () => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute(
      'position',
      new THREE.BufferAttribute(
        new Float32Array([
          0, 0, 0,
          0, 0, 0, // coincident with vertex 0
          1, 0, 0,
          0, 1, 0,
        ]),
        3,
      ),
    );
    // tri 0: corners 0,1,2 — but 0 & 1 weld together → degenerate, dropped.
    // tri 1: corners 0,2,3 — three distinct corners → kept.
    geom.setIndex([0, 1, 2, 0, 2, 3]);

    const welded = weldVertices(geom);

    expect(triCount(welded)).toBe(1);
    expect(hasNaN(welded)).toBe(false);
  });

  it('returns a NEW geometry and never mutates the input', () => {
    const src = new THREE.BoxGeometry(10, 10, 10);
    const srcVerts = countVertices(src);
    const srcPosRef = src.getAttribute('position');

    const welded = weldVertices(src);

    expect(welded).not.toBe(src);
    expect(countVertices(src)).toBe(srcVerts); // input untouched
    expect(src.getAttribute('position')).toBe(srcPosRef);
  });

  it('handles an empty geometry without throwing', () => {
    const geom = new THREE.BufferGeometry();
    const welded = weldVertices(geom);
    expect(countVertices(welded)).toBe(0);
    expect(hasNaN(welded)).toBe(false);
  });
});
