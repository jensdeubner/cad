import { describe, it, expect } from 'vitest';
import {
  sdfSphere,
  sdfBox,
  sdfTranslate,
  sdfUnion,
  sdfSmoothUnion,
  sdfSmoothSubtract,
} from '../src/cad-script/sdf';
import { meshSdf } from '../src/cad-script/surface-nets';
import { volume, bounds, isWatertight, triangleCount } from '../src/cad-script/mesh';

describe('cad-script SDF + Surface-Nets (Track B)', () => {
  it('meshes a sphere SDF into a watertight, correctly-sized solid', () => {
    const m = meshSdf(sdfSphere(10), { min: [-12, -12, -12], max: [12, 12, 12], res: 40 });
    expect(triangleCount(m)).toBeGreaterThan(0);
    expect(isWatertight(m)).toBe(true);
    const b = bounds(m)!;
    expect(b.max[0]).toBeGreaterThan(9);
    expect(b.max[0]).toBeLessThan(11);
    expect(b.min[2]).toBeGreaterThan(-11);
    expect(b.min[2]).toBeLessThan(-9);
    // volume within 10 % of the analytic sphere
    expect(Math.abs(volume(m) - (4 / 3) * Math.PI * 1000)).toBeLessThan((4 / 3) * Math.PI * 1000 * 0.1);
  });

  it('smooth-min fills the valley between two shapes (the seamless blend)', () => {
    const a = sdfSphere(10);
    const b = sdfTranslate(sdfSphere(10), 15, 0, 0);
    const hard = sdfUnion(a, b);
    const smooth = sdfSmoothUnion(a, b, 4);
    // at the midpoint the smooth union reads MORE inside (more negative) → material added
    const x = 7.5;
    expect(smooth(x, 0, 0)).toBeLessThan(hard(x, 0, 0));
  });

  it('smoothSubtract matches the canonical iq formula and reduces to hard subtract', () => {
    // Pins the implementation to Inigo Quilez opSmoothSubtraction (a review flagged
    // a sign bug; it was a false alarm — these values match the reference exactly).
    const sub = (av: number, bv: number, k: number) =>
      sdfSmoothSubtract(() => av, () => bv, k)(0, 0, 0);
    expect(sub(0.4, 0.4, 1)).toBeCloseTo(0.41, 5);
    expect(sub(-2, 3, 2)).toBeCloseTo(-1.875, 5);
    // k → 0 ⇒ hard subtraction max(a, −b)
    expect(sub(1, -1, 0.0001)).toBeCloseTo(Math.max(1, 1), 3);
    expect(sub(-5, -1, 0.0001)).toBeCloseTo(Math.max(-5, 1), 3);
  });

  it('smoothSubtract carves a real dent (box minus a sphere)', () => {
    const carved = sdfSmoothSubtract(sdfBox(20, 20, 20), sdfTranslate(sdfSphere(8), 10, 0, 0), 3);
    // a point inside the carved-out sphere region is now OUTSIDE the solid (>0)
    expect(carved(10, 0, 0)).toBeGreaterThan(0);
    // deep inside the box, far from the carve, is still inside (<0)
    expect(carved(-6, 0, 0)).toBeLessThan(0);
  });

  it('a smooth union of two spheres meshes to more than one sphere', () => {
    const blob = sdfSmoothUnion(sdfSphere(10), sdfTranslate(sdfSphere(10), 14, 0, 0), 5);
    const m = meshSdf(blob, { min: [-12, -12, -12], max: [26, 12, 12], res: 48 });
    expect(triangleCount(m)).toBeGreaterThan(0);
    expect(volume(m)).toBeGreaterThan((4 / 3) * Math.PI * 1000); // bigger than a single sphere
  });
});
