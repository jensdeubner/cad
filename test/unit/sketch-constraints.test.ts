import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import type { Contour, PlaneAxis } from '../../src/types';
import {
  CONSTRAINT_POINT_COUNT,
  cloneSketchConstraint,
  constraintNeedsValue,
  constraintRefsValid,
  dropConstraintsForContour,
  remapConstraintsAfterPointDelete,
  remapConstraintsAfterPointInsert,
  requiredPointCount,
  sketchDegreesOfFreedom,
  solveSketchConstraints,
  type SketchConstraint,
} from '../../src/sketch/sketch-constraints';

let nextId = 0;
function contourFromUV(
  uv: [number, number][],
  opts: { axis?: PlaneAxis; position?: number; closed?: boolean; id?: string } = {},
): Contour {
  const axis = opts.axis ?? 'xy';
  const position = opts.position ?? 0;
  // On the XY plane (position 0) sketch UV maps directly to world (u, v, 0).
  return {
    id: opts.id ?? `c${nextId++}`,
    componentId: 'comp',
    sketchId: 's1',
    axis,
    position,
    points: uv.map(([u, v]) => new THREE.Vector3(u, v, position)),
    closed: opts.closed ?? true,
    color: '#fff',
    visible: true,
  };
}

const con = (
  kind: SketchConstraint['kind'],
  refs: [string, number][],
  extra: Partial<SketchConstraint> = {},
): SketchConstraint => ({
  id: `k${nextId++}`,
  sketchId: 's1',
  kind,
  refs: refs.map(([contourId, pointIndex]) => ({ contourId, pointIndex })),
  ...extra,
});

const dist2 = (a: THREE.Vector3, b: THREE.Vector3) => Math.hypot(b.x - a.x, b.y - a.y);

describe('solveSketchConstraints (#11 live binding)', () => {
  it('solves a rough 4-corner contour into a 10×5 rectangle', () => {
    const c = contourFromUV([
      [0.1, -0.2],
      [10.3, 0.1],
      [10.1, 5.2],
      [-0.2, 4.9],
    ], { id: 'rect' });
    const res = solveSketchConstraints([c], [
      con('fix', [['rect', 0]], { target: [0, 0] }),
      con('horizontal', [['rect', 0], ['rect', 1]]),
      con('vertical', [['rect', 1], ['rect', 2]]),
      con('horizontal', [['rect', 2], ['rect', 3]]),
      con('vertical', [['rect', 3], ['rect', 0]]),
      con('distance', [['rect', 0], ['rect', 1]], { value: 10 }),
      con('distance', [['rect', 1], ['rect', 2]], { value: 5 }),
    ]);
    expect(res.ran).toBe(true);
    expect(res.converged).toBe(true);
    expect(res.maxResidual).toBeLessThan(1e-4);
    expect(c.points[0].x).toBeCloseTo(0, 3);
    expect(c.points[0].y).toBeCloseTo(0, 3);
    expect(c.points[1].x).toBeCloseTo(10, 2);
    expect(c.points[1].y).toBeCloseTo(0, 2);
    expect(c.points[2].x).toBeCloseTo(10, 2);
    expect(c.points[2].y).toBeCloseTo(5, 2);
    expect(c.points[3].x).toBeCloseTo(0, 2);
    expect(c.points[3].y).toBeCloseTo(5, 2);
    // points stay on the sketch plane (z == position)
    for (const p of c.points) expect(p.z).toBeCloseTo(0, 6);
  });

  it('coincident pulls points from two different contours together', () => {
    const a = contourFromUV([[0, 0], [5, 0]], { id: 'a', closed: false });
    const b = contourFromUV([[6, 1], [10, 1]], { id: 'b', closed: false });
    const res = solveSketchConstraints([a, b], [
      con('fix', [['a', 1]], { target: [5, 0] }),
      con('coincident', [['a', 1], ['b', 0]]),
    ]);
    expect(res.ran).toBe(true);
    expect(dist2(a.points[1], b.points[0])).toBeLessThan(1e-4);
    expect(b.points[0].x).toBeCloseTo(5, 3);
    expect(b.points[0].y).toBeCloseTo(0, 3);
  });

  it('horizontal equalises y of a contour edge', () => {
    const c = contourFromUV([[0, 0], [5, 3]], { id: 'h', closed: false });
    const res = solveSketchConstraints([c], [con('horizontal', [['h', 0], ['h', 1]])]);
    expect(res.ran).toBe(true);
    expect(Math.abs(c.points[0].y - c.points[1].y)).toBeLessThan(1e-4);
  });

  it('vertical equalises x of a contour edge', () => {
    const c = contourFromUV([[0, 0], [3, 5]], { id: 'v', closed: false });
    solveSketchConstraints([c], [con('vertical', [['v', 0], ['v', 1]])]);
    expect(Math.abs(c.points[0].x - c.points[1].x)).toBeLessThan(1e-4);
  });

  it('distance against a fixed anchor reaches the target length', () => {
    const c = contourFromUV([[0, 0], [3, 0]], { id: 'd', closed: false });
    const res = solveSketchConstraints([c], [
      con('fix', [['d', 0]], { target: [0, 0] }),
      con('distance', [['d', 0], ['d', 1]], { value: 12 }),
    ]);
    expect(res.ran).toBe(true);
    expect(c.points[0].x).toBeCloseTo(0, 6);
    expect(dist2(c.points[0], c.points[1])).toBeCloseTo(12, 3);
  });

  it('fix without explicit target pins the point to its current location', () => {
    const c = contourFromUV([[2, 3], [9, 9]], { id: 'f', closed: false });
    const res = solveSketchConstraints([c], [con('fix', [['f', 0]])]);
    expect(res.ran).toBe(true);
    expect(c.points[0].x).toBeCloseTo(2, 6);
    expect(c.points[0].y).toBeCloseTo(3, 6);
  });

  it('parallel makes a free edge parallel to a fixed one', () => {
    const c = contourFromUV([[0, 0], [5, 0], [0, 3], [4, 4]], { id: 'p', closed: false });
    const res = solveSketchConstraints([c], [
      con('fix', [['p', 0]], { target: [0, 0] }),
      con('fix', [['p', 1]], { target: [5, 0] }),
      con('fix', [['p', 2]], { target: [0, 3] }),
      con('parallel', [['p', 0], ['p', 1], ['p', 2], ['p', 3]]),
    ]);
    expect(res.ran).toBe(true);
    const u = { x: c.points[1].x - c.points[0].x, y: c.points[1].y - c.points[0].y };
    const v = { x: c.points[3].x - c.points[2].x, y: c.points[3].y - c.points[2].y };
    expect(Math.abs(u.x * v.y - u.y * v.x)).toBeLessThan(1e-4);
  });

  it('perpendicular makes a free edge perpendicular to a fixed one', () => {
    // edge A = (0,0)->(5,0) horizontal (fixed); edge B = (2,0)->(5,1) free at p3.
    const c = contourFromUV([[0, 0], [5, 0], [2, 0], [5, 1]], { id: 'pp', closed: false });
    const res = solveSketchConstraints([c], [
      con('fix', [['pp', 0]], { target: [0, 0] }),
      con('fix', [['pp', 1]], { target: [5, 0] }),
      con('fix', [['pp', 2]], { target: [2, 0] }),
      con('perpendicular', [['pp', 0], ['pp', 1], ['pp', 2], ['pp', 3]]),
    ]);
    expect(res.ran).toBe(true);
    const u = { x: c.points[1].x - c.points[0].x, y: c.points[1].y - c.points[0].y };
    const v = { x: c.points[3].x - c.points[2].x, y: c.points[3].y - c.points[2].y };
    expect(Math.abs(u.x * v.x + u.y * v.y)).toBeLessThan(1e-4); // dot ≈ 0
    // p3 stays directly above p2 in x (the segment became vertical).
    expect(c.points[3].x).toBeCloseTo(2, 3);
  });

  it('skips a distance constraint that has no value (never collapses points to coincident)', () => {
    const c = contourFromUV([[0, 0], [4, 0]], { id: 'dv', closed: false });
    const before = c.points.map((p) => p.clone());
    const res = solveSketchConstraints([c], [con('distance', [['dv', 0], ['dv', 1]])]); // no value
    expect(res.ran).toBe(false);
    c.points.forEach((p, i) => expect(p.equals(before[i])).toBe(true));
  });

  it('skips a fix constraint whose captured target would be non-finite', () => {
    const c = contourFromUV([[0, 0], [4, 0]], { id: 'nan', closed: false });
    c.points[0].set(NaN, NaN, 0);
    const before1 = c.points[1].clone();
    const res = solveSketchConstraints([c], [con('fix', [['nan', 0]])]);
    // The NaN point is rejected, so no solver constraint survives.
    expect(res.ran).toBe(false);
    expect(c.points[1].equals(before1)).toBe(true);
  });

  it('skips cross-plane references (points from contours on different planes)', () => {
    const a = contourFromUV([[0, 0], [5, 0]], { id: 'pa', closed: false, axis: 'xy', position: 0 });
    const b = contourFromUV([[0, 0], [5, 0]], { id: 'pb', closed: false, axis: 'xz', position: 0 });
    const beforeA = a.points.map((p) => p.clone());
    const beforeB = b.points.map((p) => p.clone());
    const res = solveSketchConstraints([a, b], [con('coincident', [['pa', 1], ['pb', 0]])]);
    expect(res.ran).toBe(false);
    a.points.forEach((p, i) => expect(p.equals(beforeA[i])).toBe(true));
    b.points.forEach((p, i) => expect(p.equals(beforeB[i])).toBe(true));
  });

  it('dropConstraintsForContour removes only constraints touching that contour', () => {
    const cs: SketchConstraint[] = [
      con('horizontal', [['a', 0], ['a', 1]]),
      con('coincident', [['a', 1], ['b', 0]]),
      con('vertical', [['b', 0], ['b', 1]]),
    ];
    const out = dropConstraintsForContour(cs, 'a');
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('vertical');
  });

  it('remapConstraintsAfterPointDelete drops touching refs and shifts higher indices', () => {
    const cs: SketchConstraint[] = [
      con('horizontal', [['a', 0], ['a', 1]]), // touches deleted index 1 -> dropped
      con('vertical', [['a', 2], ['a', 3]]), // indices 2,3 -> 1,2
      con('coincident', [['a', 0], ['b', 2]]), // 'a' index 0 unchanged; 'b' untouched
    ];
    const out = remapConstraintsAfterPointDelete(cs, 'a', 1);
    expect(out).toHaveLength(2);
    expect(out[0].kind).toBe('vertical');
    expect(out[0].refs).toEqual([{ contourId: 'a', pointIndex: 1 }, { contourId: 'a', pointIndex: 2 }]);
    expect(out[1].kind).toBe('coincident');
    expect(out[1].refs).toEqual([{ contourId: 'a', pointIndex: 0 }, { contourId: 'b', pointIndex: 2 }]);
  });

  it('remapConstraintsAfterPointInsert shifts indices >= insert position up by one', () => {
    const cs: SketchConstraint[] = [
      con('horizontal', [['a', 0], ['a', 1]]),
      con('vertical', [['a', 2], ['b', 0]]),
    ];
    const out = remapConstraintsAfterPointInsert(cs, 'a', 1);
    // a:0 stays, a:1 -> a:2, a:2 -> a:3, b untouched
    expect(out[0].refs).toEqual([{ contourId: 'a', pointIndex: 0 }, { contourId: 'a', pointIndex: 2 }]);
    expect(out[1].refs).toEqual([{ contourId: 'a', pointIndex: 3 }, { contourId: 'b', pointIndex: 0 }]);
  });

  it('remap returns independent clones (no shared ref objects with the input)', () => {
    const cs: SketchConstraint[] = [con('distance', [['a', 0], ['a', 5]], { value: 7, target: [1, 2] })];
    const out = remapConstraintsAfterPointInsert(cs, 'a', 2);
    expect(out[0]).not.toBe(cs[0]);
    expect(out[0].refs[0]).not.toBe(cs[0].refs[0]);
    out[0].refs[0].pointIndex = 99;
    expect(cs[0].refs[0].pointIndex).toBe(0);
  });

  it('returns ran:false for an empty constraint list and leaves geometry untouched', () => {
    const c = contourFromUV([[1, 1], [2, 2]], { id: 'e', closed: false });
    const before = c.points.map((p) => p.clone());
    const res = solveSketchConstraints([c], []);
    expect(res.ran).toBe(false);
    expect(res.changed).toBe(false);
    c.points.forEach((p, i) => expect(p.equals(before[i])).toBe(true));
  });

  it('skips constraints that reference missing contours or out-of-range points', () => {
    const c = contourFromUV([[0, 0], [5, 5]], { id: 'g', closed: false });
    const before = c.points.map((p) => p.clone());
    const res = solveSketchConstraints([c], [
      con('horizontal', [['ghost', 0], ['ghost', 1]]),
      con('coincident', [['g', 0], ['g', 99]]),
    ]);
    expect(res.ran).toBe(false);
    c.points.forEach((p, i) => expect(p.equals(before[i])).toBe(true));
  });

  it('does not move points of contours not referenced by any constraint', () => {
    const a = contourFromUV([[0, 0], [5, 3]], { id: 'a', closed: false });
    const untouched = contourFromUV([[20, 20], [30, 30]], { id: 'u', closed: false });
    const before = untouched.points.map((p) => p.clone());
    solveSketchConstraints([a, untouched], [con('horizontal', [['a', 0], ['a', 1]])]);
    untouched.points.forEach((p, i) => expect(p.equals(before[i])).toBe(true));
  });

  it('helpers: requiredPointCount / constraintNeedsValue / clone / refsValid', () => {
    expect(requiredPointCount('coincident')).toBe(2);
    expect(requiredPointCount('parallel')).toBe(4);
    expect(requiredPointCount('fix')).toBe(1);
    expect(CONSTRAINT_POINT_COUNT.perpendicular).toBe(4);
    expect(constraintNeedsValue('distance')).toBe(true);
    expect(constraintNeedsValue('horizontal')).toBe(false);

    const c = contourFromUV([[0, 0], [1, 1]], { id: 'z', closed: false });
    const k = con('distance', [['z', 0], ['z', 1]], { value: 7, target: [1, 2] });
    const clone = cloneSketchConstraint(k);
    expect(clone).not.toBe(k);
    expect(clone.refs).not.toBe(k.refs);
    expect(clone.refs[0]).not.toBe(k.refs[0]);
    expect(clone.value).toBe(7);
    expect(clone.target).toEqual([1, 2]);
    clone.refs[0].pointIndex = 5;
    expect(k.refs[0].pointIndex).toBe(0); // deep clone

    expect(constraintRefsValid([c], con('coincident', [['z', 0], ['z', 1]]))).toBe(true);
    expect(constraintRefsValid([c], con('coincident', [['z', 0], ['z', 9]]))).toBe(false);
    expect(constraintRefsValid([c], con('coincident', [['z', 0]]))).toBe(false); // too few refs
  });
});

describe('sketchDegreesOfFreedom', () => {
  it('reports "empty" for a sketch with no points', () => {
    const dof = sketchDegreesOfFreedom([], [], 's1');
    expect(dof.state).toBe('empty');
    expect(dof.freeDof).toBe(0);
  });

  it('reports "under" with the remaining DOF count', () => {
    const c = contourFromUV([[0, 0], [5, 3]], { id: 'a', closed: false }); // 2 pts -> 4 DOF
    const dof = sketchDegreesOfFreedom([c], [con('horizontal', [['a', 0], ['a', 1]])], 's1'); // -1
    expect(dof.points).toBe(2);
    expect(dof.freeDof).toBe(4);
    expect(dof.equations).toBe(1);
    expect(dof.remaining).toBe(3);
    expect(dof.state).toBe('under');
  });

  it('reports "full" for a fully-constrained rectangle (8 DOF, 8 equations)', () => {
    const c = contourFromUV([[0, 0], [10, 0], [10, 5], [0, 5]], { id: 'r' }); // 4 pts -> 8 DOF
    const dof = sketchDegreesOfFreedom([c], [
      con('fix', [['r', 0]], { target: [0, 0] }), // 2
      con('horizontal', [['r', 0], ['r', 1]]), // 1
      con('vertical', [['r', 1], ['r', 2]]), // 1
      con('horizontal', [['r', 2], ['r', 3]]), // 1
      con('vertical', [['r', 3], ['r', 0]]), // 1
      con('distance', [['r', 0], ['r', 1]], { value: 10 }), // 1
      con('distance', [['r', 1], ['r', 2]], { value: 5 }), // 1
    ], 's1');
    expect(dof.equations).toBe(8);
    expect(dof.remaining).toBe(0);
    expect(dof.state).toBe('full');
  });

  it('reports "over" once equations exceed free DOF', () => {
    const c = contourFromUV([[0, 0], [5, 0]], { id: 'a', closed: false }); // 4 DOF
    const dof = sketchDegreesOfFreedom([c], [
      con('fix', [['a', 0]], { target: [0, 0] }), // 2
      con('fix', [['a', 1]], { target: [5, 0] }), // 2
      con('horizontal', [['a', 0], ['a', 1]]), // 1 -> total 5 > 4
    ], 's1');
    expect(dof.state).toBe('over');
    expect(dof.remaining).toBeLessThan(0);
  });

  it('ignores constraints with broken refs and constraints of other sketches', () => {
    const c = contourFromUV([[0, 0], [5, 0]], { id: 'a', closed: false });
    const other = { ...con('horizontal', [['a', 0], ['a', 1]]), sketchId: 'other' };
    const broken = con('horizontal', [['a', 0], ['a', 9]]);
    const dof = sketchDegreesOfFreedom([c], [other, broken], 's1');
    expect(dof.equations).toBe(0);
    expect(dof.state).toBe('under');
  });
});
