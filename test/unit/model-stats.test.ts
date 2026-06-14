import { describe, it, expect } from 'vitest';
import { computeMeshStats } from '../../src/inspect/model-stats';

/**
 * A unit cube of edge length 2 centered at the origin (−1..1 on every axis):
 *   volume = 2³ = 8
 *   surface area = 6 · 2² = 24
 *   centroid = origin
 * Built from 12 triangles (2 per face) with outward winding.
 */
function unitCube(scale = 1): { positions: Float32Array; indices: Uint32Array } {
  const s = scale;
  // 8 corners.
  const v: number[][] = [
    [-s, -s, -s], // 0
    [s, -s, -s], // 1
    [s, s, -s], // 2
    [-s, s, -s], // 3
    [-s, -s, s], // 4
    [s, -s, s], // 5
    [s, s, s], // 6
    [-s, s, s], // 7
  ];
  const positions = new Float32Array(v.flat());
  // Outward-facing (CCW seen from outside) triangles for each of the 6 faces.
  const indices = new Uint32Array([
    // -Z face
    0, 2, 1, 0, 3, 2,
    // +Z face
    4, 5, 6, 4, 6, 7,
    // -Y face
    0, 1, 5, 0, 5, 4,
    // +Y face
    3, 7, 6, 3, 6, 2,
    // -X face
    0, 4, 7, 0, 7, 3,
    // +X face
    1, 2, 6, 1, 6, 5,
  ]);
  return { positions, indices };
}

describe('computeMeshStats — indexed unit cube', () => {
  const { positions, indices } = unitCube(1);
  const stats = computeMeshStats(positions, indices);

  it('computes exact volume (2³ = 8)', () => {
    expect(stats.volume).toBeCloseTo(8, 6);
  });

  it('computes exact surface area (6·2² = 24)', () => {
    expect(stats.area).toBeCloseTo(24, 6);
  });

  it('places the centroid at the origin', () => {
    expect(stats.centroid[0]).toBeCloseTo(0, 6);
    expect(stats.centroid[1]).toBeCloseTo(0, 6);
    expect(stats.centroid[2]).toBeCloseTo(0, 6);
  });

  it('reports the axis-aligned bounding box', () => {
    expect(stats.bbox.min).toEqual([-1, -1, -1]);
    expect(stats.bbox.max).toEqual([1, 1, 1]);
  });

  it('counts 12 triangles', () => {
    expect(stats.triangleCount).toBe(12);
  });
});

describe('computeMeshStats — 20 mm box like the app primitive', () => {
  // BoxGeometry(20,20,20) spans −10..10 → volume 8000, area 2400.
  const { positions, indices } = unitCube(10);
  const stats = computeMeshStats(positions, indices);

  it('volume ≈ 8000 mm³', () => {
    expect(stats.volume).toBeCloseTo(8000, 3);
  });
  it('area ≈ 2400 mm²', () => {
    expect(stats.area).toBeCloseTo(2400, 3);
  });
  it('bbox −10..10', () => {
    expect(stats.bbox.min).toEqual([-10, -10, -10]);
    expect(stats.bbox.max).toEqual([10, 10, 10]);
  });
});

describe('computeMeshStats — reversed winding stays positive', () => {
  it('reports abs(volume) even with flipped triangles', () => {
    const { positions, indices } = unitCube(1);
    // Reverse every triangle's winding.
    const flipped = new Uint32Array(indices.length);
    for (let t = 0; t < indices.length / 3; t++) {
      flipped[t * 3] = indices[t * 3];
      flipped[t * 3 + 1] = indices[t * 3 + 2];
      flipped[t * 3 + 2] = indices[t * 3 + 1];
    }
    const stats = computeMeshStats(positions, flipped);
    expect(stats.volume).toBeCloseTo(8, 6);
    expect(stats.area).toBeCloseTo(24, 6);
  });
});

describe('computeMeshStats — non-indexed mesh', () => {
  it('handles null indices (every triple is a triangle)', () => {
    const { positions, indices } = unitCube(1);
    // Expand to a non-indexed buffer.
    const flat = new Float32Array(indices.length * 3);
    for (let i = 0; i < indices.length; i++) {
      const vi = indices[i] * 3;
      flat[i * 3] = positions[vi];
      flat[i * 3 + 1] = positions[vi + 1];
      flat[i * 3 + 2] = positions[vi + 2];
    }
    const stats = computeMeshStats(flat, null);
    expect(stats.volume).toBeCloseTo(8, 6);
    expect(stats.area).toBeCloseTo(24, 6);
    expect(stats.triangleCount).toBe(12);
  });
});

describe('computeMeshStats — degenerate (open/flat) mesh', () => {
  it('falls back to the bbox center for the centroid', () => {
    // A single triangle in the z=0 plane — zero enclosed volume.
    const positions = new Float32Array([0, 0, 0, 4, 0, 0, 0, 6, 0]);
    const stats = computeMeshStats(positions, null);
    expect(stats.volume).toBeCloseTo(0, 9);
    expect(stats.area).toBeCloseTo(12, 6); // ½·4·6
    expect(stats.centroid).toEqual([2, 3, 0]); // bbox center of (0..4, 0..6, 0)
  });
});
