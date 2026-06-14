import { describe, it, expect } from 'vitest';
import { centerOfMass } from '../../src/inspect/com-marker';

/**
 * A cube of half-edge `scale`, optionally offset by `(ox, oy, oz)`.
 * Centered at the offset → center of mass = the offset. 12 outward triangles.
 */
function cube(
  scale = 1,
  ox = 0,
  oy = 0,
  oz = 0,
): { positions: Float32Array; indices: Uint32Array } {
  const s = scale;
  const v: number[][] = [
    [-s, -s, -s],
    [s, -s, -s],
    [s, s, -s],
    [-s, s, -s],
    [-s, -s, s],
    [s, -s, s],
    [s, s, s],
    [-s, s, s],
  ].map(([x, y, z]) => [x + ox, y + oy, z + oz]);
  const positions = new Float32Array(v.flat());
  const indices = new Uint32Array([
    0, 2, 1, 0, 3, 2, // -Z
    4, 5, 6, 4, 6, 7, // +Z
    0, 1, 5, 0, 5, 4, // -Y
    3, 7, 6, 3, 6, 2, // +Y
    0, 4, 7, 0, 7, 3, // -X
    1, 2, 6, 1, 6, 5, // +X
  ]);
  return { positions, indices };
}

/** De-index a mesh: expand into a flat non-indexed position buffer. */
function deindex(positions: Float32Array, indices: Uint32Array): Float32Array {
  const out = new Float32Array(indices.length * 3);
  for (let i = 0; i < indices.length; i++) {
    const src = indices[i] * 3;
    out[i * 3] = positions[src];
    out[i * 3 + 1] = positions[src + 1];
    out[i * 3 + 2] = positions[src + 2];
  }
  return out;
}

describe('centerOfMass — indexed cube', () => {
  it('places the COM of a centered cube at the origin', () => {
    const { positions, indices } = cube(10);
    const com = centerOfMass(positions, indices);
    expect(com[0]).toBeCloseTo(0, 6);
    expect(com[1]).toBeCloseTo(0, 6);
    expect(com[2]).toBeCloseTo(0, 6);
  });

  it('tracks the COM of an offset cube', () => {
    const { positions, indices } = cube(5, 3, -7, 12);
    const com = centerOfMass(positions, indices);
    expect(com[0]).toBeCloseTo(3, 5);
    expect(com[1]).toBeCloseTo(-7, 5);
    expect(com[2]).toBeCloseTo(12, 5);
  });
});

describe('centerOfMass — non-indexed cube', () => {
  it('matches the indexed result when indices is null', () => {
    const { positions, indices } = cube(8, 1, 2, 3);
    const flat = deindex(positions, indices);
    const com = centerOfMass(flat, null);
    expect(com[0]).toBeCloseTo(1, 5);
    expect(com[1]).toBeCloseTo(2, 5);
    expect(com[2]).toBeCloseTo(3, 5);
  });
});

describe('centerOfMass — degenerate fallback', () => {
  it('falls back to the bbox center for a flat (zero-volume) mesh', () => {
    // A single flat quad on z = 0 spanning x,y ∈ [0,4] → bbox center (2, 2, 0).
    const positions = new Float32Array([
      0, 0, 0, 4, 0, 0, 4, 4, 0,
      0, 0, 0, 4, 4, 0, 0, 4, 0,
    ]);
    const com = centerOfMass(positions, null);
    expect(com[0]).toBeCloseTo(2, 6);
    expect(com[1]).toBeCloseTo(2, 6);
    expect(com[2]).toBeCloseTo(0, 6);
  });

  it('returns the origin for an empty mesh', () => {
    expect(centerOfMass(new Float32Array(0), null)).toEqual([0, 0, 0]);
  });
});
