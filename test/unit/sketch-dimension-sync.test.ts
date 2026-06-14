import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { syncDimensionsToContours, type SketchDimension } from '../../src/sketch-dimension';
import type { Contour } from '../../src/types';

function contour(uv: [number, number][], id: string, closed = false): Contour {
  return {
    id,
    componentId: 'comp',
    sketchId: 's1',
    axis: 'xy',
    position: 0,
    points: uv.map(([u, v]) => new THREE.Vector3(u, v, 0)),
    closed,
    color: '#fff',
    visible: true,
  };
}

const linearDim = (over: Partial<SketchDimension> = {}): SketchDimension => ({
  id: 'd1',
  sketchId: 's1',
  kind: 'linear',
  axis: 'xy',
  position: 0,
  a: new THREE.Vector3(0, 0, 0),
  b: new THREE.Vector3(5, 0, 0),
  offset: 2,
  visible: true,
  contourId: 'a',
  pointIndex0: 0,
  pointIndex1: 1,
  ...over,
});

describe('syncDimensionsToContours', () => {
  it('re-anchors a linear dimension to its (moved) contour endpoints', () => {
    const c = contour([[1, 1], [9, 1]], 'a'); // points moved from the dim snapshot
    const [d] = syncDimensionsToContours([linearDim()], [c]);
    expect(d.a.x).toBeCloseTo(1, 6);
    expect(d.a.y).toBeCloseTo(1, 6);
    expect(d.b.x).toBeCloseTo(9, 6);
    expect(d.b.y).toBeCloseTo(1, 6);
  });

  it('clones the points (does not alias the contour vectors)', () => {
    const c = contour([[1, 1], [9, 1]], 'a');
    const [d] = syncDimensionsToContours([linearDim()], [c]);
    expect(d.a).not.toBe(c.points[0]);
    c.points[0].set(99, 99, 0);
    expect(d.a.x).toBeCloseTo(1, 6); // unaffected by later contour mutation
  });

  it('leaves a dimension unchanged when it has no contourId', () => {
    const d0 = linearDim({ contourId: undefined });
    const [d] = syncDimensionsToContours([d0], [contour([[1, 1], [9, 1]], 'a')]);
    expect(d).toBe(d0);
  });

  it('leaves a dimension unchanged when its contour is missing', () => {
    const d0 = linearDim({ contourId: 'ghost' });
    const [d] = syncDimensionsToContours([d0], [contour([[1, 1], [9, 1]], 'a')]);
    expect(d).toBe(d0);
  });

  it('leaves a dimension unchanged when an endpoint index is out of range', () => {
    const d0 = linearDim({ pointIndex1: 9 });
    const [d] = syncDimensionsToContours([d0], [contour([[1, 1], [9, 1]], 'a')]);
    expect(d).toBe(d0);
  });

  it('re-anchors a radius dimension to the recomputed circle centre + rim', () => {
    const r = 5;
    const uv: [number, number][] = [];
    for (let i = 0; i < 16; i++) {
      const t = (i / 16) * Math.PI * 2;
      uv.push([3 + r * Math.cos(t), 2 + r * Math.sin(t)]); // circle centred at (3,2)
    }
    const c = contour(uv, 'circ', true);
    const dim = linearDim({ kind: 'radius', contourId: 'circ', a: new THREE.Vector3(), b: new THREE.Vector3() });
    const [d] = syncDimensionsToContours([dim], [c]);
    expect(d.a.x).toBeCloseTo(3, 1);
    expect(d.a.y).toBeCloseTo(2, 1);
    expect(Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y)).toBeCloseTo(r, 1);
  });
});
