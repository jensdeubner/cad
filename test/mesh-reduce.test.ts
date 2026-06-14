import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { vertexClusterReduce } from '../src/mesh/reduce';

function triCount(geom: THREE.BufferGeometry): number {
  const idx = geom.getIndex();
  if (idx) return idx.count / 3;
  return (geom.getAttribute('position')?.count ?? 0) / 3;
}

function hasNaN(geom: THREE.BufferGeometry): boolean {
  const pos = geom.getAttribute('position');
  const arr = pos.array as ArrayLike<number>;
  for (let i = 0; i < arr.length; i++) if (Number.isNaN(arr[i])) return true;
  const nrm = geom.getAttribute('normal');
  if (nrm) {
    const narr = nrm.array as ArrayLike<number>;
    for (let i = 0; i < narr.length; i++) if (Number.isNaN(narr[i])) return true;
  }
  return false;
}

describe('vertexClusterReduce', () => {
  it('reduces the triangle count of a dense subdivided sphere', () => {
    const dense = new THREE.SphereGeometry(10, 64, 48);
    const before = triCount(dense);
    expect(before).toBeGreaterThan(2000);

    const reduced = vertexClusterReduce(dense, 12);
    const after = triCount(reduced);

    expect(after).toBeLessThan(before);
    expect(after).toBeGreaterThan(0);
  });

  it('reduces a subdivided box and produces no NaN', () => {
    const box = new THREE.BoxGeometry(20, 20, 20, 32, 32, 32);
    const before = triCount(box);

    const reduced = vertexClusterReduce(box, 8);

    expect(triCount(reduced)).toBeLessThan(before);
    expect(triCount(reduced)).toBeGreaterThan(0);
    expect(hasNaN(reduced)).toBe(false);
    expect(reduced.getAttribute('normal')).toBeTruthy();
  });

  it('returns a NEW geometry and never mutates the input', () => {
    const src = new THREE.SphereGeometry(5, 24, 16);
    const srcTris = triCount(src);
    const srcPosRef = src.getAttribute('position');

    const reduced = vertexClusterReduce(src, 6);

    expect(reduced).not.toBe(src);
    // Input untouched.
    expect(triCount(src)).toBe(srcTris);
    expect(src.getAttribute('position')).toBe(srcPosRef);
  });

  it('handles a degenerate (zero-extent) mesh without NaN or throwing', () => {
    const geom = new THREE.BufferGeometry();
    // Three coincident points -> a fully degenerate triangle.
    geom.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0]), 3),
    );
    const reduced = vertexClusterReduce(geom, 16);
    expect(hasNaN(reduced)).toBe(false);
    // Everything welds to one vertex -> no surviving triangles (no index set).
    expect(reduced.getIndex()).toBeNull();
  });
});
