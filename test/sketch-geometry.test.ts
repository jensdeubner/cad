import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  sketchPlaneFrame,
  sketch2DToWorld,
  projectToSketch2D,
  sketchPlaneOrigin,
  sketchOriginSnapThreshold,
  isNearSketchOrigin2D,
  snapSketch2D,
  snapSketchPoint,
  snapSketchPointWithMeta,
  circlePoints,
  arc3Points,
  rectanglePoints,
  linePoints,
  trianglePoints,
} from '../src/sketch-geometry';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function expectVec(v: THREE.Vector3, x: number, y: number, z: number, p = 9) {
  expect(v.x).toBeCloseTo(x, p);
  expect(v.y).toBeCloseTo(y, p);
  expect(v.z).toBeCloseTo(z, p);
}

describe('sketchPlaneFrame', () => {
  it('xy: origin offset on z, normal +z, u=x, v=y', () => {
    const f = sketchPlaneFrame('xy', 5);
    expectVec(f.origin, 0, 0, 5);
    expectVec(f.normal, 0, 0, 1);
    expectVec(f.tangent, 1, 0, 0);
    expectVec(f.bitangent, 0, 1, 0);
  });

  it('xz: origin offset on y, normal +y, u=x, v=-z', () => {
    const f = sketchPlaneFrame('xz', 3);
    expectVec(f.origin, 0, 3, 0);
    expectVec(f.normal, 0, 1, 0);
    expectVec(f.tangent, 1, 0, 0);
    // bitangent = normal x tangent = (0,1,0) x (1,0,0) = (0,0,-1)
    expectVec(f.bitangent, 0, 0, -1);
  });

  it('yz: origin offset on x, normal +x, u=y, v=z', () => {
    const f = sketchPlaneFrame('yz', -2);
    expectVec(f.origin, -2, 0, 0);
    expectVec(f.normal, 1, 0, 0);
    expectVec(f.tangent, 0, 1, 0);
    expectVec(f.bitangent, 0, 0, 1);
  });

  it('frame vectors are unit length and mutually orthogonal (xz)', () => {
    const f = sketchPlaneFrame('xz', 7);
    expect(f.tangent.length()).toBeCloseTo(1, 9);
    expect(f.bitangent.length()).toBeCloseTo(1, 9);
    expect(f.normal.length()).toBeCloseTo(1, 9);
    expect(f.tangent.dot(f.bitangent)).toBeCloseTo(0, 9);
    expect(f.tangent.dot(f.normal)).toBeCloseTo(0, 9);
    expect(f.bitangent.dot(f.normal)).toBeCloseTo(0, 9);
  });

  it('position=0 puts origin at world origin for all axes', () => {
    expectVec(sketchPlaneFrame('xy', 0).origin, 0, 0, 0);
    expectVec(sketchPlaneFrame('xz', 0).origin, 0, 0, 0);
    expectVec(sketchPlaneFrame('yz', 0).origin, 0, 0, 0);
  });
});

describe('sketchPlaneOrigin', () => {
  it('returns the frame origin for each axis', () => {
    expectVec(sketchPlaneOrigin('xy', 4), 0, 0, 4);
    expectVec(sketchPlaneOrigin('xz', 4), 0, 4, 0);
    expectVec(sketchPlaneOrigin('yz', 4), 4, 0, 0);
  });
});

describe('sketch2DToWorld / projectToSketch2D round-trips', () => {
  it('xy: (u,v) maps to world (u, v, position)', () => {
    const f = sketchPlaneFrame('xy', 2);
    expectVec(sketch2DToWorld(3, 7, f), 3, 7, 2);
  });

  it('xz: (u,v) maps to world (u, position, -v)', () => {
    const f = sketchPlaneFrame('xz', 1);
    // tangent=(1,0,0), bitangent=(0,0,-1)
    expectVec(sketch2DToWorld(3, 7, f), 3, 1, -7);
  });

  it('yz: (u,v) maps to world (position, u, v)', () => {
    const f = sketchPlaneFrame('yz', -5);
    expectVec(sketch2DToWorld(3, 7, f), -5, 3, 7);
  });

  it('projectToSketch2D is the inverse of sketch2DToWorld (all axes)', () => {
    for (const axis of ['xy', 'xz', 'yz'] as const) {
      const f = sketchPlaneFrame(axis, 4.25);
      for (const [u, v] of [
        [0, 0],
        [12.5, -3.75],
        [-100, 50],
      ]) {
        const world = sketch2DToWorld(u, v, f);
        const [ru, rv] = projectToSketch2D(world, f);
        expect(ru).toBeCloseTo(u, 9);
        expect(rv).toBeCloseTo(v, 9);
      }
    }
  });

  it('projecting a world point then mapping back recovers in-plane component', () => {
    const f = sketchPlaneFrame('yz', 2);
    const p = V(2, 6, -8); // exactly on the plane x=2
    const [u, v] = projectToSketch2D(p, f);
    expect(u).toBeCloseTo(6, 9);
    expect(v).toBeCloseTo(-8, 9);
    expectVec(sketch2DToWorld(u, v, f), 2, 6, -8);
  });

  it('out-of-plane component is dropped by project->unproject (xy)', () => {
    const f = sketchPlaneFrame('xy', 0);
    const p = V(3, 4, 99); // 99 is off-plane along normal
    const [u, v] = projectToSketch2D(p, f);
    expect(u).toBeCloseTo(3, 9);
    expect(v).toBeCloseTo(4, 9);
    // z component (off plane) is removed
    expectVec(sketch2DToWorld(u, v, f), 3, 4, 0);
  });
});

describe('sketchOriginSnapThreshold', () => {
  it('uses spacing*0.55 when that exceeds 4', () => {
    expect(sketchOriginSnapThreshold(10)).toBeCloseTo(5.5, 9);
    expect(sketchOriginSnapThreshold(100)).toBeCloseTo(55, 9);
  });

  it('floors at 4 for small spacing', () => {
    expect(sketchOriginSnapThreshold(1)).toBe(4);
    expect(sketchOriginSnapThreshold(0)).toBe(4);
  });

  it('crossover at spacing where 0.55*spacing == 4', () => {
    // 4 / 0.55 ~= 7.2727
    expect(sketchOriginSnapThreshold(7)).toBe(4);
    expect(sketchOriginSnapThreshold(8)).toBeCloseTo(4.4, 9);
  });
});

describe('isNearSketchOrigin2D', () => {
  it('true inside threshold, false outside (spacing 10 => threshold 5.5)', () => {
    expect(isNearSketchOrigin2D(0, 0, 10)).toBe(true);
    expect(isNearSketchOrigin2D(3, 4, 10)).toBe(true); // hypot 5 <= 5.5
    expect(isNearSketchOrigin2D(4, 4, 10)).toBe(false); // hypot ~5.657 > 5.5
  });

  it('uses the 4 floor for small spacing', () => {
    expect(isNearSketchOrigin2D(3.9, 0, 1)).toBe(true);
    expect(isNearSketchOrigin2D(4.1, 0, 1)).toBe(false);
  });
});

describe('snapSketch2D (grid + origin snap)', () => {
  it('snaps to origin when near it', () => {
    const r = snapSketch2D(1, 1, 10);
    expect(r).toEqual({ u: 0, v: 0, snappedOrigin: true, snappedGrid: false });
  });

  it('snaps to nearest grid multiple when away from origin', () => {
    const r = snapSketch2D(12, -7, 5);
    // round(12/5)=2 ->10 ; round(-7/5)=-1 -> -5
    expect(r.u).toBeCloseTo(10, 9);
    expect(r.v).toBeCloseTo(-5, 9);
    expect(r.snappedOrigin).toBe(false);
    expect(r.snappedGrid).toBe(true);
  });

  it('rounds half values away (Math.round behavior: .5 rounds up)', () => {
    const r = snapSketch2D(7.5, 0, 5);
    // 7.5/5 = 1.5 -> Math.round = 2 -> 10. But origin check first:
    // hypot(7.5,0)=7.5 > threshold(5.5) so grid path taken.
    expect(r.u).toBeCloseTo(10, 9);
  });

  it('snapOrigin=false skips origin snap and goes to grid', () => {
    const r = snapSketch2D(1, 1, 10, false);
    expect(r.snappedOrigin).toBe(false);
    expect(r.snappedGrid).toBe(true);
    expect(r.u).toBeCloseTo(0, 9); // round(1/10)=0
    expect(r.v).toBeCloseTo(0, 9);
  });

  it('spacing<=0 returns input unchanged (no grid, no origin) when not near origin', () => {
    // With spacing 0, threshold = max(0, 4) = 4, hypot(100,0) > 4 so not origin
    const r = snapSketch2D(100, 0, 0);
    expect(r).toEqual({ u: 100, v: 0, snappedOrigin: false, snappedGrid: false });
  });

  it('spacing<=0 still origin-snaps when within the 4 floor', () => {
    const r = snapSketch2D(1, 0, 0);
    expect(r).toEqual({ u: 0, v: 0, snappedOrigin: true, snappedGrid: false });
  });
});

describe('snapSketchPoint / snapSketchPointWithMeta', () => {
  it('snaps a world point to the grid in-plane (xy)', () => {
    const p = V(12.4, -7.1, 0);
    const out = snapSketchPoint(p, 'xy', 0, 5);
    // u=12.4 -> 10, v=-7.1 -> -5 ... but check origin: hypot(12.4,7.1) large
    expectVec(out, 10, -5, 0);
  });

  it('meta reports grid snap and reconstructs a world Vector3', () => {
    const p = V(12.4, -7.1, 0);
    const meta = snapSketchPointWithMeta(p, 'xy', 0, 5);
    expect(meta.snappedGrid).toBe(true);
    expect(meta.snappedOrigin).toBe(false);
    expect(meta.point).toBeInstanceOf(THREE.Vector3);
    expectVec(meta.point, 10, -5, 0);
  });

  it('snaps to plane origin world position when near it', () => {
    const p = V(1, 1, 0);
    const meta = snapSketchPointWithMeta(p, 'xy', 3, 10);
    expect(meta.snappedOrigin).toBe(true);
    // origin of xy plane at position 3 is (0,0,3)
    expectVec(meta.point, 0, 0, 3);
  });

  it('snapping projects onto the plane (drops off-plane component) for yz', () => {
    // point off the yz plane (x != position) gets projected
    const p = V(99, 6.1, -8.2);
    const out = snapSketchPoint(p, 'yz', 2, 5);
    // projected u=6.1->5, v=-8.2->-10 ; world (2, 5, -10)
    expectVec(out, 2, 5, -10);
  });
});

describe('circlePoints', () => {
  it('produces `segments` vertices (default 32)', () => {
    const pts = circlePoints(V(0, 0, 0), V(5, 0, 0), 'xy', 0);
    expect(pts.length).toBe(32);
  });

  it('honors a custom segment count', () => {
    const pts = circlePoints(V(0, 0, 0), V(5, 0, 0), 'xy', 0, 8);
    expect(pts.length).toBe(8);
  });

  it('all points lie at the correct radius from center (xy)', () => {
    const center = V(1, 2, 0);
    const rim = V(4, 6, 0); // radius = 5
    const pts = circlePoints(center, rim, 'xy', 0, 16);
    for (const p of pts) {
      const r = Math.hypot(p.x - center.x, p.y - center.y);
      expect(r).toBeCloseTo(5, 6);
      expect(p.z).toBeCloseTo(0, 9);
    }
  });

  it('first point starts at angle 0 (center + (r,0) in uv)', () => {
    const pts = circlePoints(V(0, 0, 0), V(3, 0, 0), 'xy', 0, 4);
    // i=0 -> (cu + r, cv) = (3,0)
    expectVec(pts[0], 3, 0, 0);
    // i=1 -> angle 90deg -> (0, 3)
    expectVec(pts[1], 0, 3, 0);
  });

  it('returns empty array for degenerate (zero radius) circle', () => {
    const pts = circlePoints(V(2, 2, 0), V(2, 2, 0), 'xy', 0);
    expect(pts).toEqual([]);
  });

  it('respects the plane (yz): points sit on x=position', () => {
    const pts = circlePoints(V(7, 0, 0), V(7, 3, 0), 'yz', 7, 12);
    expect(pts.length).toBe(12);
    for (const p of pts) {
      expect(p.x).toBeCloseTo(7, 9);
    }
  });
});

describe('arc3Points', () => {
  it('produces segments+1 points for a valid arc (default 28 -> 29)', () => {
    const pts = arc3Points(V(1, 0, 0), V(0, 1, 0), V(-1, 0, 0), 'xy', 0);
    expect(pts.length).toBe(29);
  });

  it('honors custom segment count (-> segments+1 points)', () => {
    const pts = arc3Points(V(1, 0, 0), V(0, 1, 0), V(-1, 0, 0), 'xy', 0, 10);
    expect(pts.length).toBe(11);
  });

  it('endpoints match start and end (unit circle half arc)', () => {
    const start = V(1, 0, 0);
    const end = V(-1, 0, 0);
    const pts = arc3Points(start, V(0, 1, 0), end, 'xy', 0, 12);
    expectVec(pts[0], 1, 0, 0, 6);
    expectVec(pts[pts.length - 1], -1, 0, 0, 6);
  });

  it('every arc point lies on the circumscribed circle (radius 1, center origin)', () => {
    const pts = arc3Points(V(1, 0, 0), V(0, 1, 0), V(-1, 0, 0), 'xy', 0, 8);
    for (const p of pts) {
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(1, 6);
    }
  });

  it('midpoint of a semicircle arc passes near the "through" point', () => {
    const pts = arc3Points(V(1, 0, 0), V(0, 1, 0), V(-1, 0, 0), 'xy', 0, 8);
    const mid = pts[Math.floor(pts.length / 2)];
    expectVec(mid, 0, 1, 0, 6);
  });

  it('collinear points (no circumcircle) fall back to [start, end]', () => {
    const start = V(0, 0, 0);
    const end = V(4, 0, 0);
    const pts = arc3Points(start, V(2, 0, 0), end, 'xy', 0);
    expect(pts.length).toBe(2);
    expectVec(pts[0], 0, 0, 0);
    expectVec(pts[1], 4, 0, 0);
  });
});

describe('rectanglePoints', () => {
  it('returns exactly 4 corners (not auto-closed)', () => {
    const pts = rectanglePoints(V(0, 0, 0), V(4, 2, 0), 'xy', 0);
    expect(pts.length).toBe(4);
  });

  it('orders corners CCW from min-min regardless of input corner order (xy)', () => {
    // give opposite corners in reversed order; result normalizes to min/max
    const pts = rectanglePoints(V(4, 2, 0), V(0, 0, 0), 'xy', 0);
    expectVec(pts[0], 0, 0, 0); // (minU, minV)
    expectVec(pts[1], 4, 0, 0); // (maxU, minV)
    expectVec(pts[2], 4, 2, 0); // (maxU, maxV)
    expectVec(pts[3], 0, 2, 0); // (minU, maxV)
  });

  it('the 4 corners form a closed loop (last connects back to first edge)', () => {
    const pts = rectanglePoints(V(0, 0, 0), V(4, 2, 0), 'xy', 0);
    // first and third are diagonal; check it is a rectangle with right angles
    const e01 = pts[1].clone().sub(pts[0]);
    const e12 = pts[2].clone().sub(pts[1]);
    const e30 = pts[0].clone().sub(pts[3]);
    expect(e01.dot(e12)).toBeCloseTo(0, 9); // right angle
    // opposite edges equal length
    expect(e01.length()).toBeCloseTo(pts[3].clone().sub(pts[2]).length(), 9);
    expect(e30.length()).toBeCloseTo(pts[2].clone().sub(pts[1]).length(), 9);
  });

  it('respects the plane offset (xz at position 5)', () => {
    const pts = rectanglePoints(V(0, 5, 0), V(3, 5, -2), 'xz', 5);
    expect(pts.length).toBe(4);
    for (const p of pts) {
      expect(p.y).toBeCloseTo(5, 9);
    }
  });
});

describe('linePoints', () => {
  it('returns the two endpoints as clones', () => {
    const a = V(1, 2, 3);
    const b = V(4, 5, 6);
    const pts = linePoints(a, b);
    expect(pts.length).toBe(2);
    expectVec(pts[0], 1, 2, 3);
    expectVec(pts[1], 4, 5, 6);
    expect(pts[0]).not.toBe(a); // cloned, not same reference
    expect(pts[1]).not.toBe(b);
  });
});

describe('trianglePoints', () => {
  it('returns exactly the 3 input points as clones', () => {
    const p1 = V(0, 0, 0);
    const p2 = V(1, 0, 0);
    const p3 = V(0, 1, 0);
    const pts = trianglePoints(p1, p2, p3);
    expect(pts.length).toBe(3);
    expectVec(pts[0], 0, 0, 0);
    expectVec(pts[1], 1, 0, 0);
    expectVec(pts[2], 0, 1, 0);
    expect(pts[0]).not.toBe(p1);
  });
});
