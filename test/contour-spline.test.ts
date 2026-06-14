import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import type { Contour, ContourPointType } from '../src/types';
import {
  ensurePointMeta,
  constrainToContourPlane,
  contourHas3dDeviation,
  sampleContour,
  contourHasCurves,
  displayPoints,
  initCurveHandles,
  setPointType,
  moveAnchor,
  moveHandle,
  insertPoint,
  deletePoint,
  applyContourWorkPlane,
  loftPoints,
  findInsertOnContour,
  cloneHandle,
} from '../src/contour-spline';

// Helper to build a minimal Contour from raw point tuples.
function makeContour(
  pts: [number, number, number][],
  opts: Partial<Contour> = {},
): Contour {
  return {
    id: opts.id ?? 'c1',
    componentId: opts.componentId ?? 'comp1',
    axis: opts.axis ?? 'xy',
    position: opts.position ?? 0,
    points: pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
    closed: opts.closed ?? false,
    color: opts.color ?? '#ffffff',
    visible: opts.visible ?? true,
    pointTypes: opts.pointTypes,
    handles: opts.handles,
  };
}

describe('ensurePointMeta', () => {
  it('initializes pointTypes and handles to corner/null when missing', () => {
    const c = makeContour([
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
    ]);
    expect(c.pointTypes).toBeUndefined();
    expect(c.handles).toBeUndefined();
    ensurePointMeta(c);
    expect(c.pointTypes).toEqual(['corner', 'corner', 'corner']);
    expect(c.handles).toEqual([null, null, null]);
  });

  it('preserves existing pointTypes/handles when length already matches', () => {
    const c = makeContour([
      [0, 0, 0],
      [1, 0, 0],
    ]);
    c.pointTypes = ['curve', 'corner'];
    const h = { in: new THREE.Vector3(-1, 0, 0), out: new THREE.Vector3(1, 0, 0) };
    c.handles = [h, null];
    ensurePointMeta(c);
    expect(c.pointTypes).toEqual(['curve', 'corner']);
    expect(c.handles![0]).toBe(h); // same reference, untouched
  });

  it('grows arrays to match a longer point list, keeping known entries', () => {
    const c = makeContour([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
    ]);
    c.pointTypes = ['curve']; // shorter than points -> rebuilt
    c.handles = [null]; // shorter than points -> rebuilt
    ensurePointMeta(c);
    expect(c.pointTypes).toEqual(['curve', 'corner', 'corner']);
    expect(c.handles).toEqual([null, null, null]);
  });
});

describe('constrainToContourPlane', () => {
  it('clamps z for xy plane and clones (does not mutate input)', () => {
    const p = new THREE.Vector3(3, 4, 9);
    const out = constrainToContourPlane(p, 'xy', 2);
    expect(out.toArray()).toEqual([3, 4, 2]);
    expect(p.z).toBe(9); // original untouched
    expect(out).not.toBe(p);
  });

  it('clamps y for xz plane', () => {
    const out = constrainToContourPlane(new THREE.Vector3(3, 4, 9), 'xz', 7);
    expect(out.toArray()).toEqual([3, 7, 9]);
  });

  it('clamps x for yz plane', () => {
    const out = constrainToContourPlane(new THREE.Vector3(3, 4, 9), 'yz', -5);
    expect(out.toArray()).toEqual([-5, 4, 9]);
  });
});

describe('contourHas3dDeviation', () => {
  it('returns false when all points sit on the xy plane at position', () => {
    const c = makeContour(
      [
        [0, 0, 5],
        [1, 1, 5],
        [2, 0, 5],
      ],
      { axis: 'xy', position: 5 },
    );
    expect(contourHas3dDeviation(c)).toBe(false);
  });

  it('returns true when a point deviates beyond epsilon off the plane', () => {
    const c = makeContour(
      [
        [0, 0, 5],
        [1, 1, 5.01],
        [2, 0, 5],
      ],
      { axis: 'xy', position: 5 },
    );
    expect(contourHas3dDeviation(c)).toBe(true);
  });

  it('respects a custom epsilon (deviation within epsilon -> false)', () => {
    const c = makeContour(
      [
        [0, 0, 0],
        [1, 0, 0.5],
      ],
      { axis: 'xy', position: 0 },
    );
    expect(contourHas3dDeviation(c, 1)).toBe(false);
    expect(contourHas3dDeviation(c, 0.1)).toBe(true);
  });

  it('detects deviation in a handle even when anchors are on-plane', () => {
    const c = makeContour(
      [
        [0, 0, 0],
        [1, 0, 0],
      ],
      { axis: 'xy', position: 0 },
    );
    c.pointTypes = ['curve', 'corner'];
    c.handles = [
      { in: new THREE.Vector3(-1, 0, 0), out: new THREE.Vector3(1, 0, 9) },
      null,
    ];
    expect(contourHas3dDeviation(c)).toBe(true);
  });

  it('uses xz axis (deviation measured on y)', () => {
    const c = makeContour(
      [
        [0, 3, 0],
        [1, 3, 1],
      ],
      { axis: 'xz', position: 3 },
    );
    expect(contourHas3dDeviation(c)).toBe(false);
    c.points[1].y = 4;
    expect(contourHas3dDeviation(c)).toBe(true);
  });
});

describe('sampleContour', () => {
  it('returns clones of the points (length < 2) without sampling', () => {
    const c = makeContour([[1, 2, 3]]);
    const out = sampleContour(c);
    expect(out).toHaveLength(1);
    expect(out[0].toArray()).toEqual([1, 2, 3]);
    expect(out[0]).not.toBe(c.points[0]); // cloned
  });

  it('samples an open 2-corner contour into 15 points along a straight line', () => {
    const c = makeContour([
      [0, 0, 0],
      [10, 0, 0],
    ]);
    const out = sampleContour(c, 14);
    expect(out).toHaveLength(15);
    // endpoints exact, midpoint linear
    expect(out[0].toArray()).toEqual([0, 0, 0]);
    expect(out[14].x).toBeCloseTo(10, 6);
    expect(out[7].x).toBeCloseTo((7 / 14) * 10, 6);
    expect(out[7].y).toBeCloseTo(0, 6);
  });

  it('open contour with all corners: non-last segs contribute spp points, last contributes spp+1', () => {
    const c = makeContour([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
    ]);
    // segs=3. Each non-last seg loops `spp` steps but DROPS its final
    // duplicate point (k===steps-1 && s<segs-1), so it yields spp-1 points.
    // The last seg uses spp+1 steps and keeps all of them.
    // => (spp-1) + (spp-1) + (spp+1) = 3*spp - 1. For spp=4 -> 11.
    const out = sampleContour(c, 4);
    expect(out).toHaveLength(11);
  });

  it('closed contour with all corners (3 pts): count = 40 for spp=14', () => {
    const c = makeContour(
      [
        [0, 0, 0],
        [1, 0, 0],
        [1, 1, 0],
      ],
      { closed: true },
    );
    // segs=3, each 14 steps; first two skip last -> 13+13+14 = 40
    expect(sampleContour(c, 14)).toHaveLength(40);
  });

  it('closed contour count = segs*spp for spp=4 (last point skipped per seg, wrap closes)', () => {
    const c = makeContour(
      [
        [0, 0, 0],
        [1, 0, 0],
        [1, 1, 0],
      ],
      { closed: true },
    );
    // segs=3, all but last seg skip last point: 3+3+4 = 10
    expect(sampleContour(c, 4)).toHaveLength(10);
  });
});

describe('contourHasCurves / displayPoints', () => {
  it('all corners -> no curves, displayPoints returns the raw points array', () => {
    const c = makeContour([
      [0, 0, 0],
      [1, 0, 0],
    ]);
    expect(contourHasCurves(c)).toBe(false);
    expect(displayPoints(c)).toBe(c.points); // identity, not a sample
  });

  it('a smooth point counts as a curve (non-corner type)', () => {
    const c = makeContour([
      [0, 0, 0],
      [1, 0, 0],
    ]);
    c.pointTypes = ['smooth', 'corner'];
    expect(contourHasCurves(c)).toBe(true);
  });

  it('a curve point makes displayPoints return a sampled array', () => {
    const c = makeContour([
      [0, 0, 0],
      [2, 0, 0],
      [4, 0, 0],
    ]);
    setPointType(c, 1, 'curve');
    expect(contourHasCurves(c)).toBe(true);
    const dp = displayPoints(c);
    expect(dp).not.toBe(c.points);
    expect(dp.length).toBeGreaterThan(c.points.length);
  });
});

describe('initCurveHandles / autoHandles geometry', () => {
  it('open contour: handles use wrapped neighbors (index 0 prev = last point)', () => {
    const c = makeContour([
      [0, 0, 0],
      [6, 0, 0],
      [6, 6, 0],
    ]);
    initCurveHandles(c, 1);
    // prev=pts[0]=(0,0,0), next=pts[2]=(6,6,0); tangent=(next-prev)/6=(1,1,0)
    const h = c.handles![1]!;
    expect(h.in.toArray()).toEqual([5, -1, 0]); // p - tangent
    expect(h.out.toArray()).toEqual([7, 1, 0]); // p + tangent
  });

  it('index 0 wraps to the last point for prev neighbor', () => {
    const c = makeContour([
      [0, 0, 0],
      [6, 0, 0],
      [0, 6, 0],
    ]);
    initCurveHandles(c, 0);
    // i=0: prev=pts[2]=(0,6,0), next=pts[1]=(6,0,0); tangent=(6,-6,0)/6=(1,-1,0)
    const h = c.handles![0]!;
    expect(h.in.toArray()).toEqual([-1, 1, 0]); // (0,0,0)-(1,-1,0)
    expect(h.out.toArray()).toEqual([1, -1, 0]);
  });
});

describe('setPointType', () => {
  it('setting curve initializes handles; setting back to corner nulls them', () => {
    const c = makeContour([
      [0, 0, 0],
      [2, 0, 0],
      [2, 2, 0],
    ]);
    setPointType(c, 1, 'curve');
    expect(c.pointTypes![1]).toBe('curve');
    expect(c.handles![1]).not.toBeNull();
    setPointType(c, 1, 'corner');
    expect(c.pointTypes![1]).toBe('corner');
    expect(c.handles![1]).toBeNull();
  });

  it('setting smooth nulls the handle (only curve gets handles)', () => {
    const c = makeContour([
      [0, 0, 0],
      [2, 0, 0],
      [2, 2, 0],
    ]);
    setPointType(c, 1, 'curve');
    expect(c.handles![1]).not.toBeNull();
    setPointType(c, 1, 'smooth' as ContourPointType);
    expect(c.pointTypes![1]).toBe('smooth');
    expect(c.handles![1]).toBeNull();
  });
});

describe('moveAnchor', () => {
  it('moves the anchor and translates handles by the same delta', () => {
    const c = makeContour([
      [0, 0, 0],
      [2, 0, 0],
      [2, 2, 0],
    ]);
    setPointType(c, 1, 'curve');
    const before = c.handles![1]!;
    const inBefore = before.in.clone();
    const outBefore = before.out.clone();
    moveAnchor(c, 1, new THREE.Vector3(5, 1, 0));
    expect(c.points[1].toArray()).toEqual([5, 1, 0]);
    // delta = (5,1,0) - (2,0,0) = (3,1,0)
    expect(c.handles![1]!.in.toArray()).toEqual([
      inBefore.x + 3,
      inBefore.y + 1,
      inBefore.z,
    ]);
    expect(c.handles![1]!.out.toArray()).toEqual([
      outBefore.x + 3,
      outBefore.y + 1,
      outBefore.z,
    ]);
  });

  it('moveHandles=false leaves handles in place', () => {
    const c = makeContour([
      [0, 0, 0],
      [2, 0, 0],
      [2, 2, 0],
    ]);
    setPointType(c, 1, 'curve');
    const inBefore = c.handles![1]!.in.clone();
    moveAnchor(c, 1, new THREE.Vector3(9, 9, 0), false);
    expect(c.points[1].toArray()).toEqual([9, 9, 0]);
    expect(c.handles![1]!.in.toArray()).toEqual(inBefore.toArray());
  });

  it('moving a corner anchor (no handle) just moves the point', () => {
    const c = makeContour([
      [0, 0, 0],
      [2, 0, 0],
    ]);
    moveAnchor(c, 0, new THREE.Vector3(-1, -1, 0));
    expect(c.points[0].toArray()).toEqual([-1, -1, 0]);
    expect(c.handles![0]).toBeNull();
  });
});

describe('moveHandle', () => {
  it('creates handles and forces type=curve when moving a handle on a corner', () => {
    const c = makeContour([
      [0, 0, 0],
      [2, 0, 0],
      [2, 2, 0],
    ]);
    expect(c.pointTypes).toBeUndefined();
    moveHandle(c, 1, 'out', new THREE.Vector3(4, 4, 0));
    expect(c.pointTypes![1]).toBe('curve');
    expect(c.handles![1]!.out.toArray()).toEqual([4, 4, 0]);
  });

  it('copies position into the requested handle (in)', () => {
    const c = makeContour([
      [0, 0, 0],
      [2, 0, 0],
      [2, 2, 0],
    ]);
    setPointType(c, 1, 'curve');
    moveHandle(c, 1, 'in', new THREE.Vector3(-3, -3, 0));
    expect(c.handles![1]!.in.toArray()).toEqual([-3, -3, 0]);
  });
});

describe('insertPoint', () => {
  it('inserts after the given index and returns the new index', () => {
    const c = makeContour([
      [0, 0, 0],
      [2, 0, 0],
      [4, 0, 0],
    ]);
    const newIdx = insertPoint(c, 0, new THREE.Vector3(1, 0, 0));
    expect(newIdx).toBe(1);
    expect(c.points.map((p) => p.x)).toEqual([0, 1, 2, 4]);
    expect(c.pointTypes).toEqual(['corner', 'corner', 'corner', 'corner']);
    expect(c.handles).toEqual([null, null, null, null]);
  });

  it('clones the inserted position (caller mutation does not leak)', () => {
    const c = makeContour([
      [0, 0, 0],
      [2, 0, 0],
    ]);
    const pos = new THREE.Vector3(1, 0, 0);
    insertPoint(c, 0, pos);
    pos.set(99, 99, 99);
    expect(c.points[1].toArray()).toEqual([1, 0, 0]);
  });

  it('inserts a corner type even between curve points', () => {
    const c = makeContour([
      [0, 0, 0],
      [4, 0, 0],
      [4, 4, 0],
    ]);
    setPointType(c, 0, 'curve');
    setPointType(c, 1, 'curve');
    insertPoint(c, 0, new THREE.Vector3(2, 0, 0));
    expect(c.pointTypes![1]).toBe('corner');
    expect(c.handles![1]).toBeNull();
  });
});

describe('deletePoint', () => {
  it('deletes a point on an open contour above the minimum', () => {
    const c = makeContour([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
    ]);
    expect(deletePoint(c, 1)).toBe(true);
    expect(c.points.map((p) => p.x)).toEqual([0, 2]);
    expect(c.pointTypes).toHaveLength(2);
    expect(c.handles).toHaveLength(2);
  });

  it('refuses to delete below the open minimum of 2 points', () => {
    const c = makeContour([
      [0, 0, 0],
      [1, 0, 0],
    ]);
    expect(deletePoint(c, 0)).toBe(false);
    expect(c.points).toHaveLength(2);
  });

  it('refuses to delete below the closed minimum of 3 points', () => {
    const c = makeContour(
      [
        [0, 0, 0],
        [1, 0, 0],
        [1, 1, 0],
      ],
      { closed: true },
    );
    expect(deletePoint(c, 0)).toBe(false);
    expect(c.points).toHaveLength(3);
  });

  it('allows deletion on a closed contour with 4 points', () => {
    const c = makeContour(
      [
        [0, 0, 0],
        [1, 0, 0],
        [1, 1, 0],
        [0, 1, 0],
      ],
      { closed: true },
    );
    expect(deletePoint(c, 2)).toBe(true);
    expect(c.points).toHaveLength(3);
  });

  it('keeps pointTypes/handles in sync with the removed index', () => {
    const c = makeContour([
      [0, 0, 0],
      [2, 0, 0],
      [4, 0, 0],
    ]);
    setPointType(c, 1, 'curve');
    expect(c.handles![1]).not.toBeNull();
    deletePoint(c, 1);
    expect(c.pointTypes).toEqual(['corner', 'corner']);
    expect(c.handles).toEqual([null, null]);
  });
});

describe('applyContourWorkPlane', () => {
  it('returns the contour axis and position verbatim', () => {
    const c = makeContour([[0, 0, 0]], { axis: 'yz', position: 7.5 });
    expect(applyContourWorkPlane(c)).toEqual({ axis: 'yz', position: 7.5 });
  });
});

describe('loftPoints', () => {
  it('flattens samples onto the xy plane position by default (z forced)', () => {
    const c = makeContour(
      [
        [0, 0, 9],
        [10, 0, 9],
      ],
      { axis: 'xy', position: 3 },
    );
    const lp = loftPoints(c);
    // every z is forced to position 3 regardless of sample z
    expect(lp.every(([, , z]) => z === 3)).toBe(true);
    expect(lp[0]).toEqual([0, 0, 3]);
  });

  it('xz axis forces the y coordinate to position', () => {
    const c = makeContour(
      [
        [0, 5, 0],
        [10, 5, 0],
      ],
      { axis: 'xz', position: 2 },
    );
    const lp = loftPoints(c);
    expect(lp.every(([, y]) => y === 2)).toBe(true);
  });

  it('yz axis forces the x coordinate to position', () => {
    const c = makeContour(
      [
        [5, 0, 0],
        [5, 10, 0],
      ],
      { axis: 'yz', position: -4 },
    );
    const lp = loftPoints(c);
    expect(lp.every(([x]) => x === -4)).toBe(true);
  });

  it('full3d=true preserves the raw sampled coordinates', () => {
    const c = makeContour(
      [
        [0, 0, 1],
        [10, 0, 1],
      ],
      { axis: 'xy', position: 99 },
    );
    const lp = loftPoints(c, true);
    expect(lp[0]).toEqual([0, 0, 1]);
    // not forced to position 99
    expect(lp.some(([, , z]) => z === 99)).toBe(false);
  });

  it('produces (spp adjusted) sample count for an open 2-corner line (spp=16 -> 17)', () => {
    const c = makeContour([
      [0, 0, 0],
      [10, 0, 0],
    ]);
    // loftPoints samples at 16/segment; open single seg -> 17 points
    expect(loftPoints(c)).toHaveLength(17);
  });
});

describe('findInsertOnContour', () => {
  it('returns null for a contour with fewer than 2 points', () => {
    const c = makeContour([[0, 0, 0]]);
    expect(findInsertOnContour(c, new THREE.Vector3(0, 0, 0))).toBeNull();
  });

  it('finds the nearest segment and a point close to the query on a straight line', () => {
    const c = makeContour([
      [0, 0, 0],
      [10, 0, 0],
    ]);
    const res = findInsertOnContour(c, new THREE.Vector3(5, 0.2, 0));
    expect(res).not.toBeNull();
    expect(res!.afterIndex).toBe(0);
    expect(res!.point.x).toBeCloseTo(5, 1);
    expect(res!.point.y).toBeCloseTo(0, 6); // projected onto the line
  });

  it('picks the correct segment on a multi-point open contour', () => {
    const c = makeContour([
      [0, 0, 0],
      [10, 0, 0],
      [10, 10, 0],
    ]);
    // query near the second segment (vertical leg)
    const res = findInsertOnContour(c, new THREE.Vector3(10, 5, 0));
    expect(res!.afterIndex).toBe(1);
    expect(res!.point.x).toBeCloseTo(10, 1);
    expect(res!.point.y).toBeCloseTo(5, 0);
  });
});

describe('cloneHandle', () => {
  it('returns null for null', () => {
    expect(cloneHandle(null)).toBeNull();
  });

  it('deep-clones in/out vectors (mutating original does not affect clone)', () => {
    const orig = {
      in: new THREE.Vector3(1, 2, 3),
      out: new THREE.Vector3(4, 5, 6),
    };
    const clone = cloneHandle(orig)!;
    expect(clone.in.toArray()).toEqual([1, 2, 3]);
    expect(clone.out.toArray()).toEqual([4, 5, 6]);
    expect(clone.in).not.toBe(orig.in);
    orig.in.set(9, 9, 9);
    expect(clone.in.toArray()).toEqual([1, 2, 3]);
  });
});
