import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { geometryToObj, objStats } from '../../src/io/obj-export';

describe('geometryToObj', () => {
  it('serializes a box to a valid OBJ with 12 triangle faces', () => {
    const geom = new THREE.BoxGeometry(20, 20, 20);
    const obj = geometryToObj(geom, 'cube');

    expect(obj.startsWith('o cube\n')).toBe(true);
    expect(obj.endsWith('\n')).toBe(true);

    const { vertexCount, faceCount } = objStats(obj);
    // A box is 12 triangles regardless of indexing.
    expect(faceCount).toBe(12);
    expect(vertexCount).toBeGreaterThan(0);

    // BoxGeometry carries normals → faces use the v//vn form.
    expect(obj).toContain('vn ');
    expect(obj).toMatch(/^f \d+\/\/\d+ \d+\/\/\d+ \d+\/\/\d+$/m);
  });

  it('emits 1-indexed faces within the vertex range', () => {
    const geom = new THREE.BoxGeometry(1, 1, 1);
    const obj = geometryToObj(geom);
    const { vertexCount } = objStats(obj);

    for (const line of obj.split('\n')) {
      if (!line.startsWith('f ')) continue;
      const idxs = line
        .slice(2)
        .split(/\s+/)
        .map((tok) => parseInt(tok.split('/')[0], 10));
      for (const i of idxs) {
        expect(i).toBeGreaterThanOrEqual(1);
        expect(i).toBeLessThanOrEqual(vertexCount);
      }
    }
  });

  it('handles non-indexed geometry', () => {
    const indexed = new THREE.BoxGeometry(2, 2, 2);
    const geom = indexed.toNonIndexed();
    expect(geom.getIndex()).toBeNull();

    const obj = geometryToObj(geom, 'flat');
    const { faceCount, vertexCount } = objStats(obj);
    expect(faceCount).toBe(12);
    // Non-indexed: 12 tris * 3 = 36 vertices.
    expect(vertexCount).toBe(36);
  });

  it('serializes positions without normals when no normal attribute', () => {
    const geom = new THREE.BufferGeometry();
    // One triangle, positions only.
    geom.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3),
    );
    const obj = geometryToObj(geom, 'tri');
    expect(obj).not.toContain('vn ');
    expect(obj).toContain('f 1 2 3');
    expect(objStats(obj)).toEqual({ vertexCount: 3, faceCount: 1 });
  });

  it('rounds coordinates to ~6 significant digits', () => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([1.23456789, 0, 0, 0, 0, 0, 0, 0, 0]), 3),
    );
    const obj = geometryToObj(geom);
    expect(obj).toContain('v 1.23457 0 0');
  });
});
