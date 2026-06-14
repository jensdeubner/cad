import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { recomputeFeature, type RecomputeDeps } from '../../src/feature-recompute';
import type { ParsedLoftMesh } from '../../src/solid-pick';
import type { Contour } from '../../src/types';
import type { ExtrudeRecipe, RevolveRecipe, LoftRecipe } from '../../src/feature-recipe';

function square(id: string): Contour {
  return {
    id,
    componentId: 'comp-0',
    sketchId: 'sk1',
    axis: 'xy',
    position: 0,
    points: [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(10, 0, 0),
      new THREE.Vector3(10, 10, 0),
      new THREE.Vector3(0, 10, 0),
    ],
    closed: true,
    color: '#ffffff',
    visible: true,
    attachedToBodyId: null,
  };
}

const fakeMesh: ParsedLoftMesh = {
  positions: new Float32Array([0, 0, 0, 10, 0, 0, 10, 10, 0]),
  indices: new Uint32Array([0, 1, 2]),
  triangle_count: 1,
};

/** Deps that resolve a single square contour and capture the op JSON. */
function makeDeps(over: Partial<RecomputeDeps> = {}): RecomputeDeps & { lastJson: string | null } {
  const deps: RecomputeDeps & { lastJson: string | null } = {
    lastJson: null,
    getContour: (id) => (id.startsWith('c') ? square(id) : undefined),
    worldMatrix: () => new THREE.Matrix4(),
    loftJson: (json) => {
      deps.lastJson = json;
      return fakeMesh;
    },
    revolveJson: (json) => {
      deps.lastJson = json;
      return fakeMesh;
    },
    ...over,
  };
  return deps;
}

const extrude: ExtrudeRecipe = {
  id: 'recipe:body-1',
  bodyId: 'body-1',
  kind: 'extrude',
  sourceContourIds: ['c1'],
  distanceMm: 15,
};
const revolve: RevolveRecipe = {
  id: 'recipe:body-2',
  bodyId: 'body-2',
  kind: 'revolve',
  sourceContourIds: ['c2'],
  axis: 'xy',
  angleDeg: 270,
  segments: 48,
};
const loft: LoftRecipe = {
  id: 'recipe:body-3',
  bodyId: 'body-3',
  kind: 'loft',
  sourceContourIds: ['c3', 'c4'],
  closedEnds: true,
};

describe('recomputeFeature — extrude', () => {
  it('builds a 2-contour loft offset by distanceMm and returns geometry', () => {
    const deps = makeDeps();
    const res = recomputeFeature(extrude, deps);
    expect(res.status).toBe('ok');
    expect(res.triangleCount).toBe(1);
    expect(res.geometry).not.toBeNull();
    expect(res.geometry!.getAttribute('position').count).toBe(3);
    expect(res.geometry!.getIndex()!.count).toBe(3);

    const payload = JSON.parse(deps.lastJson!);
    expect(payload.contours).toHaveLength(2);
    expect(payload.closed_ends).toBe(true);
    // second contour offset along the plane axis by the extrude distance
    expect(payload.contours[1].position).toBeCloseTo(15, 6);
    expect(payload.contours[0].position).toBeCloseTo(0, 6);
  });
});

describe('recomputeFeature — revolve', () => {
  it('encodes angle + derived revolution axis', () => {
    const deps = makeDeps();
    const res = recomputeFeature(revolve, deps);
    expect(res.status).toBe('ok');
    const payload = JSON.parse(deps.lastJson!);
    expect(payload.angle_deg).toBe(270);
    expect(payload.revolution_axis).toBe('z'); // xy plane → revolve about z
    expect(payload.segments).toBe(48);
  });
});

describe('recomputeFeature — loft', () => {
  it('encodes all ordered source profiles', () => {
    const deps = makeDeps();
    const res = recomputeFeature(loft, deps);
    expect(res.status).toBe('ok');
    const payload = JSON.parse(deps.lastJson!);
    expect(payload.contours).toHaveLength(2);
    expect(payload.closed_ends).toBe(true);
  });
});

describe('recomputeFeature — failure modes', () => {
  it('missing-contour when a source contour is gone', () => {
    const deps = makeDeps({ getContour: () => undefined });
    expect(recomputeFeature(extrude, deps).status).toBe('missing-contour');
  });

  it('op-failed when the WASM op throws (wrapper returns null)', () => {
    const deps = makeDeps({ loftJson: () => null });
    expect(recomputeFeature(extrude, deps).status).toBe('op-failed');
  });

  it('empty when the op returns a zero-triangle mesh', () => {
    const empty: ParsedLoftMesh = {
      positions: new Float32Array(),
      indices: new Uint32Array(),
      triangle_count: 0,
    };
    const deps = makeDeps({ loftJson: () => empty });
    const res = recomputeFeature(extrude, deps);
    expect(res.status).toBe('empty');
    expect(res.geometry).toBeNull();
  });
});
