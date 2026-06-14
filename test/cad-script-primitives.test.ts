import { describe, it, expect } from 'vitest';
import { box, cylinder, sphere, cone, torus, wedge } from '../src/cad-script/primitives';
import { volume, bounds, isWatertight, triangleCount } from '../src/cad-script/mesh';

const near = (a: number, b: number, relTol: number) => Math.abs(a - b) <= Math.abs(b) * relTol;

describe('cad-script primitives', () => {
  it('box is watertight with exact volume and centred bounds', () => {
    const m = box(20, 20, 20);
    expect(isWatertight(m)).toBe(true);
    expect(volume(m)).toBeCloseTo(8000, 3);
    const b = bounds(m)!;
    expect(b.min).toEqual([-10, -10, -10]);
    expect(b.max).toEqual([10, 10, 10]);
    expect(triangleCount(m)).toBe(12);
  });

  it('cylinder approximates π·r²·h and is watertight', () => {
    const m = cylinder(10, 20, 48);
    expect(isWatertight(m)).toBe(true);
    expect(near(volume(m), Math.PI * 100 * 20, 0.02)).toBe(true);
  });

  it('sphere approximates 4/3·π·r³ and is watertight', () => {
    const m = sphere(10, 48, 32);
    expect(isWatertight(m)).toBe(true);
    expect(near(volume(m), (4 / 3) * Math.PI * 1000, 0.05)).toBe(true);
  });

  it('cone approximates 1/3·π·r²·h and is watertight', () => {
    const m = cone(10, 20, 48);
    expect(isWatertight(m)).toBe(true);
    expect(near(volume(m), (1 / 3) * Math.PI * 100 * 20, 0.03)).toBe(true);
  });

  it('torus approximates 2·π²·R·r² and is watertight', () => {
    const m = torus(18, 6, 64, 32);
    expect(isWatertight(m)).toBe(true);
    expect(near(volume(m), 2 * Math.PI * Math.PI * 18 * 36, 0.03)).toBe(true);
  });

  it('wedge is a triangular prism with the expected volume', () => {
    const m = wedge(20, 20, 20);
    expect(isWatertight(m)).toBe(true);
    // cross-section triangle (½·20·20) × depth 20
    expect(volume(m)).toBeCloseTo(4000, 1);
  });
});
