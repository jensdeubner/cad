import { describe, it, expect } from 'vitest';
import {
  coincident,
  horizontal,
  vertical,
  parallel,
  perpendicular,
  distance,
  fix,
  type Point2,
} from '../../src/sketch/constraints';
import { solveConstraints } from '../../src/sketch/solver';

const dist = (a: Point2, b: Point2) => Math.hypot(b.x - a.x, b.y - a.y);

describe('2D constraint solver (#11 Phase 1)', () => {
  it('coincident merges two points', () => {
    const r = solveConstraints([{ x: 0, y: 0 }, { x: 5, y: 3 }], [coincident(0, 1)]);
    expect(r.converged).toBe(true);
    expect(dist(r.points[0], r.points[1])).toBeLessThan(1e-4);
  });

  it('horizontal equalises y', () => {
    const r = solveConstraints([{ x: 0, y: 0 }, { x: 5, y: 3 }], [horizontal(0, 1)]);
    expect(Math.abs(r.points[0].y - r.points[1].y)).toBeLessThan(1e-4);
    expect(r.converged).toBe(true);
  });

  it('vertical equalises x', () => {
    const r = solveConstraints([{ x: 0, y: 0 }, { x: 3, y: 5 }], [vertical(0, 1)]);
    expect(Math.abs(r.points[0].x - r.points[1].x)).toBeLessThan(1e-4);
  });

  it('distance with a fixed anchor reaches the target length', () => {
    const r = solveConstraints(
      [{ x: 0, y: 0 }, { x: 3, y: 0 }],
      [fix(0, { x: 0, y: 0 }), distance(0, 1, 10)],
    );
    expect(r.points[0]).toEqual({ x: 0, y: 0 }); // anchor pinned
    expect(dist(r.points[0], r.points[1])).toBeCloseTo(10, 3);
  });

  it('fix pins a point to its target', () => {
    const r = solveConstraints([{ x: 2, y: 3 }], [fix(0, { x: 7, y: 9 })]);
    expect(r.points[0]).toEqual({ x: 7, y: 9 });
  });

  it('perpendicular makes a free segment perpendicular to a fixed one', () => {
    const r = solveConstraints(
      [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 2, y: 0 }, { x: 5, y: 1 }],
      [fix(0, { x: 0, y: 0 }), fix(1, { x: 5, y: 0 }), fix(2, { x: 2, y: 0 }), perpendicular(0, 1, 2, 3)],
    );
    const u = { x: r.points[1].x - r.points[0].x, y: r.points[1].y - r.points[0].y };
    const v = { x: r.points[3].x - r.points[2].x, y: r.points[3].y - r.points[2].y };
    expect(Math.abs(u.x * v.x + u.y * v.y)).toBeLessThan(1e-4); // dot ≈ 0
    expect(r.points[3].x).toBeCloseTo(2, 3);
  });

  it('parallel makes a free segment parallel to a fixed one', () => {
    const r = solveConstraints(
      [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 0, y: 3 }, { x: 4, y: 4 }],
      [fix(0, { x: 0, y: 0 }), fix(1, { x: 5, y: 0 }), fix(2, { x: 0, y: 3 }), parallel(0, 1, 2, 3)],
    );
    const u = { x: r.points[1].x - r.points[0].x, y: r.points[1].y - r.points[0].y };
    const v = { x: r.points[3].x - r.points[2].x, y: r.points[3].y - r.points[2].y };
    expect(Math.abs(u.x * v.y - u.y * v.x)).toBeLessThan(1e-4); // cross ≈ 0
    expect(r.points[3].y).toBeCloseTo(3, 3);
  });

  it('solves a fully-constrained 10×5 rectangle from rough corners', () => {
    const rough: Point2[] = [
      { x: 0.1, y: -0.2 },
      { x: 10.3, y: 0.1 },
      { x: 10.1, y: 5.2 },
      { x: -0.2, y: 4.9 },
    ];
    const r = solveConstraints(rough, [
      fix(0, { x: 0, y: 0 }),
      horizontal(0, 1),
      vertical(1, 2),
      horizontal(2, 3),
      vertical(3, 0),
      distance(0, 1, 10),
      distance(1, 2, 5),
    ]);
    expect(r.converged).toBe(true);
    expect(r.maxResidual).toBeLessThan(1e-4);
    expect(r.points[0].x).toBeCloseTo(0, 3);
    expect(r.points[0].y).toBeCloseTo(0, 3);
    expect(r.points[1].x).toBeCloseTo(10, 2);
    expect(r.points[1].y).toBeCloseTo(0, 2);
    expect(r.points[2].x).toBeCloseTo(10, 2);
    expect(r.points[2].y).toBeCloseTo(5, 2);
    expect(r.points[3].x).toBeCloseTo(0, 2);
    expect(r.points[3].y).toBeCloseTo(5, 2);
  });

  it('does not mutate the input points', () => {
    const input: Point2[] = [{ x: 1, y: 2 }, { x: 9, y: 9 }];
    const snapshot = JSON.stringify(input);
    solveConstraints(input, [coincident(0, 1)]);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('handles an under-constrained system without exploding', () => {
    const r = solveConstraints([{ x: 0, y: 0 }, { x: 4, y: 0 }], [distance(0, 1, 6)]);
    expect(Number.isFinite(r.points[1].x)).toBe(true);
    expect(dist(r.points[0], r.points[1])).toBeCloseTo(6, 3);
  });
});
