import { describe, it, expect } from 'vitest';
import { rect, circle, polygon, extrudeProfile, revolveProfile } from '../src/cad-script/sketch';
import { triangulate } from '../src/cad-script/triangulate';
import { volume, bounds, isWatertight } from '../src/cad-script/mesh';
import { orient } from '../src/cad-script/mesh';

const near = (a: number, b: number, rel: number) => Math.abs(a - b) <= Math.abs(b) * rel;

describe('triangulate (ear clipping)', () => {
  it('triangulates a convex quad into 2 triangles', () => {
    const tris = triangulate(rect(10, 10));
    expect(tris.length / 3).toBe(2);
  });

  it('triangulates a concave L-shape into n-2 triangles', () => {
    const L: [number, number][] = [
      [0, 0], [4, 0], [4, 2], [2, 2], [2, 4], [0, 4],
    ];
    const tris = triangulate(L);
    expect(tris.length / 3).toBe(L.length - 2);
  });
});

describe('extrudeProfile', () => {
  it('extrudes a rectangle into a watertight box of the right volume', () => {
    const m = orient(extrudeProfile(rect(10, 10), { plane: 'XY', distance: 5 }));
    expect(isWatertight(m)).toBe(true);
    expect(volume(m)).toBeCloseTo(500, 2);
    const b = bounds(m)!;
    expect(b.size[2]).toBeCloseTo(5, 5);
  });

  it('extrudes a circle into a watertight cylinder', () => {
    const m = orient(extrudeProfile(circle(8, 64), { distance: 12 }));
    expect(isWatertight(m)).toBe(true);
    expect(near(volume(m), Math.PI * 64 * 12, 0.02)).toBe(true);
  });

  it('honours the work-plane (XZ extrudes along +Y)', () => {
    const m = orient(extrudeProfile(rect(10, 10), { plane: 'XZ', distance: 6 }));
    const b = bounds(m)!;
    expect(b.size[1]).toBeCloseTo(6, 5); // thickness along Y
  });
});

describe('revolveProfile', () => {
  it('revolves an off-axis rectangle 360° into a washer', () => {
    // ring profile: 8 ≤ x ≤ 12, −2 ≤ y ≤ 2 → washer R∈[8,12], height 4
    const prof = polygon([[8, -2], [12, -2], [12, 2], [8, 2]]);
    const m = orient(revolveProfile(prof, { angle: 360, axis: 'Y', seg: 96 }));
    expect(isWatertight(m)).toBe(true);
    const expected = Math.PI * (12 * 12 - 8 * 8) * 4;
    expect(near(volume(m), expected, 0.02)).toBe(true);
  });

  it('a partial revolve produces end caps and stays watertight', () => {
    const prof = polygon([[8, -2], [12, -2], [12, 2], [8, 2]]);
    const m = orient(revolveProfile(prof, { angle: 90, axis: 'Y', seg: 32 }));
    expect(isWatertight(m)).toBe(true);
    const full = Math.PI * (12 * 12 - 8 * 8) * 4;
    expect(near(volume(m), full / 4, 0.03)).toBe(true);
  });
});
