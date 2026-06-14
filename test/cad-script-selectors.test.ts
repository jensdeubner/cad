import { describe, it, expect } from 'vitest';
import { Solid } from '../src/cad-script/solid';

describe('cad-script typed selectors (§5 topological naming)', () => {
  const cube = Solid.box(20, 20, 20);

  it('recovers exactly 6 planar faces from a box', () => {
    expect(cube.faces().length).toBe(6);
  });

  it('"the topmost face" → max by z has a +Z normal', () => {
    const top = cube.faces().max((f) => f.position[2]).first()!;
    expect(top.normal[2]).toBeGreaterThan(0.9);
    expect(top.centroid[2]).toBeCloseTo(10, 5);
  });

  it('"the face pointing −X" via filterByNormal', () => {
    const left = cube.faces().filterByNormal([-1, 0, 0]);
    expect(left.length).toBe(1);
    expect(left.first()!.centroid[0]).toBeCloseTo(-10, 5);
  });

  it('recovers 12 feature edges from a box', () => {
    expect(cube.edges().length).toBe(12);
  });

  it('"the edge farthest in +X" via max on position.x', () => {
    const e = cube.edges().max((e) => e.position[0]).first()!;
    expect(e.position[0]).toBeGreaterThan(9);
  });

  it('filterByPosition keeps only shapes within a band', () => {
    const topHalf = cube.faces().filterByPosition('z', 5, 20);
    // only the +Z cap centroid sits above z=5
    expect(topHalf.length).toBe(1);
  });

  it('toJSON is compact and context-frugal', () => {
    const json = cube.faces().toJSON() as { count: number; items: unknown[] };
    expect(json.count).toBe(6);
    expect(json.items.length).toBe(6);
  });
});
