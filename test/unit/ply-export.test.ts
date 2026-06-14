import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { geometryToPly, plyStats } from '../../src/io/ply-export';

describe('geometryToPly', () => {
  it('serializes a box to a valid ASCII PLY with 12 triangle faces', () => {
    const geom = new THREE.BoxGeometry(20, 20, 20);
    const ply = geometryToPly(geom);

    // Header in canonical order.
    const header = ply.split('\n');
    expect(header[0]).toBe('ply');
    expect(header[1]).toBe('format ascii 1.0');
    expect(ply).toContain('property float x');
    expect(ply).toContain('property float y');
    expect(ply).toContain('property float z');
    expect(ply).toContain('property list uchar int vertex_index');
    expect(ply).toContain('end_header');
    expect(ply.endsWith('\n')).toBe(true);

    const { vertexCount, faceCount } = plyStats(ply);
    // A box is 12 triangles regardless of indexing.
    expect(faceCount).toBe(12);
    expect(vertexCount).toBeGreaterThan(0);

    // Header counts must match the actual emitted lines.
    expect(ply).toContain(`element vertex ${vertexCount}`);
    expect(ply).toContain(`element face ${faceCount}`);
  });

  it('emits 0-based face indices within the vertex range', () => {
    const geom = new THREE.BoxGeometry(1, 1, 1);
    const ply = geometryToPly(geom);
    const { vertexCount } = plyStats(ply);

    let sawZero = false;
    for (const line of ply.split('\n')) {
      if (!/^3 \d+ \d+ \d+$/.test(line)) continue;
      const idxs = line.split(/\s+/).slice(1).map((t) => parseInt(t, 10));
      for (const i of idxs) {
        expect(i).toBeGreaterThanOrEqual(0); // 0-based, NOT 1-based.
        expect(i).toBeLessThan(vertexCount);
        if (i === 0) sawZero = true;
      }
    }
    // A correctly 0-indexed mesh references vertex 0.
    expect(sawZero).toBe(true);
  });

  it('handles non-indexed geometry', () => {
    const indexed = new THREE.BoxGeometry(2, 2, 2);
    const geom = indexed.toNonIndexed();
    expect(geom.getIndex()).toBeNull();

    const ply = geometryToPly(geom);
    const { faceCount, vertexCount } = plyStats(ply);
    expect(faceCount).toBe(12);
    // Non-indexed: 12 tris * 3 = 36 vertices.
    expect(vertexCount).toBe(36);
    // First face of a non-indexed mesh is 0 1 2.
    expect(ply).toContain('3 0 1 2');
  });

  it('serializes a single positions-only triangle', () => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3),
    );
    const ply = geometryToPly(geom);
    expect(ply).toContain('3 0 1 2');
    expect(plyStats(ply)).toEqual({ vertexCount: 3, faceCount: 1 });
  });

  it('rounds coordinates to ~6 significant digits', () => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([1.23456789, 0, 0, 0, 0, 0, 0, 0, 0]), 3),
    );
    const ply = geometryToPly(geom);
    expect(ply).toContain('1.23457 0 0');
  });
});

describe('plyStats', () => {
  it('reads counts from the header and ignores body lines', () => {
    const ply = [
      'ply',
      'format ascii 1.0',
      'element vertex 3',
      'property float x',
      'property float y',
      'property float z',
      'element face 1',
      'property list uchar int vertex_index',
      'end_header',
      '0 0 0',
      '1 0 0',
      '0 1 0',
      '3 0 1 2',
    ].join('\n');
    expect(plyStats(ply)).toEqual({ vertexCount: 3, faceCount: 1 });
  });
});
