import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  constraintSummary,
  contourPointsFromUV,
  pickSketchPoint,
} from '../../src/sketch-mode/constraints';
import type { SketchConstraint } from '../../src/sketch/sketch-constraints';
import type { Contour } from '../../src/types';

function fakeDom(): HTMLElement {
  return {
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      width: 800,
      height: 600,
      right: 800,
      bottom: 600,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  } as unknown as HTMLElement;
}

function makeCamera(): THREE.PerspectiveCamera {
  const c = new THREE.PerspectiveCamera(50, 800 / 600, 0.1, 1000);
  c.position.set(0, 0, 120);
  c.lookAt(0, 0, 0);
  c.updateMatrixWorld(true);
  c.updateProjectionMatrix();
  return c;
}

function screenOf(p: THREE.Vector3, camera: THREE.Camera): { x: number; y: number } {
  const v = p.clone().project(camera);
  return { x: (v.x * 0.5 + 0.5) * 800, y: (-v.y * 0.5 + 0.5) * 600 };
}

function contour(uv: [number, number][], id = 'c1', sketchId = 's1'): Contour {
  return {
    id,
    componentId: 'comp',
    sketchId,
    axis: 'xy',
    position: 0,
    points: contourPointsFromUV(uv, 'xy', 0),
    closed: false,
    color: '#fff',
    visible: true,
  };
}

describe('contourPointsFromUV', () => {
  it('maps XY plane UV directly to world (u, v, 0)', () => {
    const pts = contourPointsFromUV([[3, 4], [-2, 7]], 'xy', 0);
    expect(pts[0].x).toBeCloseTo(3, 6);
    expect(pts[0].y).toBeCloseTo(4, 6);
    expect(pts[0].z).toBeCloseTo(0, 6);
    expect(pts[1].x).toBeCloseTo(-2, 6);
    expect(pts[1].y).toBeCloseTo(7, 6);
  });
});

describe('pickSketchPoint', () => {
  const camera = makeCamera();
  const dom = fakeDom();

  it('returns the nearest contour point when clicking near its screen position', () => {
    const c = contour([[0, 0], [20, 0], [20, 20]]);
    const target = c.points[1];
    const s = screenOf(target, camera);
    const hit = pickSketchPoint([c], 's1', s.x, s.y, dom, camera);
    expect(hit).not.toBeNull();
    expect(hit!.contourId).toBe('c1');
    expect(hit!.pointIndex).toBe(1);
  });

  it('returns null when the click is far from every point', () => {
    const c = contour([[0, 0], [5, 0]]);
    const hit = pickSketchPoint([c], 's1', 798, 2, dom, camera);
    expect(hit).toBeNull();
  });

  it('ignores contours that belong to a different sketch', () => {
    const c = contour([[0, 0], [5, 0]], 'other', 'other-sketch');
    const s = screenOf(c.points[0], camera);
    const hit = pickSketchPoint([c], 's1', s.x, s.y, dom, camera);
    expect(hit).toBeNull();
  });

  it('ignores hidden contours', () => {
    const c = contour([[0, 0], [5, 0]]);
    c.visible = false;
    const s = screenOf(c.points[0], camera);
    const hit = pickSketchPoint([c], 's1', s.x, s.y, dom, camera);
    expect(hit).toBeNull();
  });
});

describe('constraintSummary', () => {
  const t = (key: string) => key;
  const base = (kind: SketchConstraint['kind'], extra: Partial<SketchConstraint> = {}): SketchConstraint => ({
    id: 'k',
    sketchId: 's1',
    kind,
    refs: [{ contourId: 'c1', pointIndex: 0 }],
    ...extra,
  });

  it('uses the localized kind name', () => {
    expect(constraintSummary(base('horizontal'), t)).toBe('sketchConstraint.kind.horizontal');
  });

  it('appends the value for a distance constraint', () => {
    expect(constraintSummary(base('distance', { value: 12.5 }), t)).toBe(
      'sketchConstraint.kind.distance · 12.5 mm',
    );
  });
});
