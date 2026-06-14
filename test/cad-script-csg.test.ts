import { describe, it, expect } from 'vitest';
import { Solid } from '../src/cad-script/solid';
import { Select } from '../src/cad-script/selectors';

describe('cad-script CSG booleans', () => {
  it('cut drills a through-hole (volume drops by ~the cylinder)', () => {
    const plate = Solid.box(20, 20, 20);
    const drill = Solid.cylinder(6, 40, 64); // taller than the plate → through hole
    const result = plate.cut(drill);
    const expected = 8000 - Math.PI * 36 * 20;
    expect(result.volume()).toBeGreaterThan(expected * 0.95);
    expect(result.volume()).toBeLessThan(expected * 1.05);
    expect(result.triangleCount()).toBeGreaterThan(0);
  });

  it('fuse of two overlapping boxes is between max(part) and sum(parts)', () => {
    const a = Solid.box(20, 20, 20);
    const b = Solid.box(20, 20, 20).translate(10, 0, 0);
    const u = a.fuse(b);
    // overlap is a 10×20×20 = 4000 slab → union = 8000 + 8000 − 4000 = 12000
    expect(u.volume()).toBeGreaterThan(11500);
    expect(u.volume()).toBeLessThan(12500);
  });

  it('intersect of two overlapping boxes is the overlap volume', () => {
    const a = Solid.box(20, 20, 20);
    const b = Solid.box(20, 20, 20).translate(10, 0, 0);
    const i = a.intersect(b);
    expect(i.volume()).toBeGreaterThan(3500);
    expect(i.volume()).toBeLessThan(4500);
  });

  it('disjoint cut leaves the target unchanged', () => {
    const a = Solid.box(10, 10, 10);
    const far = Solid.box(10, 10, 10).translate(100, 0, 0);
    const r = a.cut(far);
    expect(r.volume()).toBeCloseTo(1000, 0);
  });

  it('provenance: Select.LAST after a cut isolates the newly created faces', () => {
    const plate = Solid.box(30, 30, 10);
    const drill = Solid.cylinder(5, 40, 48);
    const holed = plate.cut(drill);
    const all = holed.faces(Select.ALL).length;
    const last = holed.faces(Select.LAST).length;
    expect(last).toBeGreaterThanOrEqual(1);
    expect(last).toBeLessThan(all);
  });
});
