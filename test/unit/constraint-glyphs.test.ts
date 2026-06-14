import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  computeGlyphAnchors,
  pickConstraintGlyphAt,
} from '../../src/sketch-mode/constraint-glyphs';
import type { SketchConstraint } from '../../src/sketch/sketch-constraints';
import type { Contour, PlaneAxis } from '../../src/types';

let n = 0;
function contour(uv: [number, number][], id: string, axis: PlaneAxis = 'xy', position = 0): Contour {
  return {
    id,
    componentId: 'comp',
    sketchId: 's1',
    axis,
    position,
    points: uv.map(([u, v]) => new THREE.Vector3(u, v, position)),
    closed: false,
    color: '#fff',
    visible: true,
  };
}
const con = (
  kind: SketchConstraint['kind'],
  refs: [string, number][],
  extra: Partial<SketchConstraint> = {},
): SketchConstraint => ({
  id: `k${n++}`,
  sketchId: 's1',
  kind,
  refs: refs.map(([contourId, pointIndex]) => ({ contourId, pointIndex })),
  ...extra,
});

describe('computeGlyphAnchors', () => {
  it('places a badge at the midpoint of a 2-point constraint, lifted off the plane', () => {
    const c = contour([[0, 0], [10, 0]], 'a');
    const [g] = computeGlyphAnchors([con('horizontal', [['a', 0], ['a', 1]])], [c], 'xy', 0);
    expect(g.kind).toBe('horizontal');
    expect(g.label).toBe('H');
    expect(g.position.x).toBeCloseTo(5, 6);
    expect(g.position.y).toBeCloseTo(0, 6);
    expect(g.position.z).toBeCloseTo(0.35, 6); // lift along +Z (xy normal)
  });

  it('uses the value as the label for a distance constraint', () => {
    const c = contour([[0, 0], [4, 0]], 'a');
    const [g] = computeGlyphAnchors([con('distance', [['a', 0], ['a', 1]], { value: 12 })], [c], 'xy', 0);
    expect(g.kind).toBe('distance');
    expect(g.label).toBe('12');
  });

  it('formats non-integer distance labels to one decimal', () => {
    const c = contour([[0, 0], [4, 0]], 'a');
    const [g] = computeGlyphAnchors([con('distance', [['a', 0], ['a', 1]], { value: 12.5 })], [c], 'xy', 0);
    expect(g.label).toBe('12.5');
  });

  it('places a fix badge at the pinned point', () => {
    const c = contour([[2, 3], [9, 9]], 'a');
    const [g] = computeGlyphAnchors([con('fix', [['a', 0]])], [c], 'xy', 0);
    expect(g.kind).toBe('fix');
    expect(g.label).toBe('⚓');
    expect(g.position.x).toBeCloseTo(2, 6);
    expect(g.position.y).toBeCloseTo(3, 6);
  });

  it('places a single badge at the centroid of a 4-point parallel/perpendicular constraint', () => {
    const c = contour([[0, 0], [4, 0], [0, 4], [4, 4]], 'a');
    const [g] = computeGlyphAnchors([con('parallel', [['a', 0], ['a', 1], ['a', 2], ['a', 3]])], [c], 'xy', 0);
    expect(g.kind).toBe('parallel');
    expect(g.label).toBe('∥');
    expect(g.position.x).toBeCloseTo(2, 6);
    expect(g.position.y).toBeCloseTo(2, 6);
  });

  it('skips constraints whose references do not resolve', () => {
    const c = contour([[0, 0], [5, 0]], 'a');
    const anchors = computeGlyphAnchors(
      [con('horizontal', [['ghost', 0], ['ghost', 1]]), con('coincident', [['a', 0], ['a', 9]])],
      [c],
      'xy',
      0,
    );
    expect(anchors).toHaveLength(0);
  });

  it('nudges colocated badges apart so they do not fully overlap', () => {
    const c = contour([[1, 1], [5, 5]], 'a');
    const anchors = computeGlyphAnchors([con('fix', [['a', 0]]), con('fix', [['a', 0]])], [c], 'xy', 0);
    expect(anchors).toHaveLength(2);
    expect(anchors[0].position.equals(anchors[1].position)).toBe(false);
  });
});

describe('pickConstraintGlyphAt', () => {
  const camera = new THREE.PerspectiveCamera(50, 800 / 600, 0.1, 1000);
  camera.position.set(0, 0, 120);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  const dom = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) }),
  } as unknown as HTMLElement;

  const c = contour([[0, 0], [10, 0]], 'a');
  const anchors = computeGlyphAnchors([con('horizontal', [['a', 0], ['a', 1]], {})], [c], 'xy', 0);

  it('returns the constraint id when clicking near its badge', () => {
    const v = anchors[0].position.clone().project(camera);
    const sx = (v.x * 0.5 + 0.5) * 800;
    const sy = (-v.y * 0.5 + 0.5) * 600;
    expect(pickConstraintGlyphAt(anchors, sx, sy, dom, camera)).toBe(anchors[0].constraintId);
  });

  it('returns null when clicking far from any badge', () => {
    expect(pickConstraintGlyphAt(anchors, 798, 2, dom, camera)).toBeNull();
  });
});
