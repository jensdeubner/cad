import { describe, it, expect } from 'vitest';
import { orthoHalfExtents } from '../../src/nav/projection';

describe('orthoHalfExtents — match perspective framing', () => {
  it('fov 90°, aspect 1, distance 10 → halfH = halfW = 10', () => {
    const { halfW, halfH } = orthoHalfExtents(90, 1, 10);
    expect(halfH).toBeCloseTo(10, 5); // tan(45°) = 1
    expect(halfW).toBeCloseTo(10, 5);
  });

  it('scales width by the aspect ratio', () => {
    const { halfW, halfH } = orthoHalfExtents(55, 2, 5);
    const h = 5 * Math.tan((55 * Math.PI) / 180 / 2);
    expect(halfH).toBeCloseTo(h, 6);
    expect(halfW).toBeCloseTo(h * 2, 6);
  });

  it('grows the frustum linearly with distance', () => {
    const a = orthoHalfExtents(55, 1, 5);
    const b = orthoHalfExtents(55, 1, 10);
    expect(b.halfH).toBeCloseTo(a.halfH * 2, 6);
  });

  it('guards non-positive / non-finite inputs (finite, strictly positive)', () => {
    for (const r of [
      orthoHalfExtents(0, 0, 0),
      orthoHalfExtents(-5, -1, -10),
      orthoHalfExtents(NaN, NaN, NaN),
      orthoHalfExtents(Infinity, Infinity, Infinity),
    ]) {
      expect(Number.isFinite(r.halfW)).toBe(true);
      expect(Number.isFinite(r.halfH)).toBe(true);
      expect(r.halfH).toBeGreaterThan(0);
      expect(r.halfW).toBeGreaterThan(0);
    }
  });
});
