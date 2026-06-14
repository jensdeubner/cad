import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import type { Contour, ContourHandle } from '../src/types';
import {
  isContourAttached,
  attachContourToBody,
  detachContourFromBody,
  toggleContourBodyAttach,
  contourInWorldSpace,
  worldToContourStorage,
  migrateContourAttachment,
} from '../src/contour-body';

// DEFAULT_BODY_ID is 'body-0' (see src/cad-scene.ts).
const DEFAULT_BODY_ID = 'body-0';

/** Build a minimal Contour with the given world-space points (and optional handles). */
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
    attachedToBodyId: opts.attachedToBodyId,
    pointTypes: opts.pointTypes,
    handles: opts.handles,
  };
}

/** A non-trivial world matrix: translation + rotation about Z. */
function makeWorldMatrix(): THREE.Matrix4 {
  const m = new THREE.Matrix4();
  m.makeRotationZ(Math.PI / 3); // 60 degrees
  m.setPosition(new THREE.Vector3(10, -5, 3));
  return m;
}

function v(x: number, y: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(x, y, z);
}

function expectVecClose(a: THREE.Vector3, b: THREE.Vector3, prec = 6): void {
  expect(a.x).toBeCloseTo(b.x, prec);
  expect(a.y).toBeCloseTo(b.y, prec);
  expect(a.z).toBeCloseTo(b.z, prec);
}

describe('isContourAttached', () => {
  it('returns false when attachedToBodyId is undefined', () => {
    const c = makeContour([[0, 0, 0]]);
    expect(isContourAttached(c)).toBe(false);
  });

  it('returns false when attachedToBodyId is null', () => {
    const c = makeContour([[0, 0, 0]], { attachedToBodyId: null });
    expect(isContourAttached(c)).toBe(false);
  });

  it('returns false when attachedToBodyId is the empty string', () => {
    const c = makeContour([[0, 0, 0]], { attachedToBodyId: '' });
    expect(isContourAttached(c)).toBe(false);
  });

  it('returns true when attachedToBodyId is a non-empty string', () => {
    const c = makeContour([[0, 0, 0]], { attachedToBodyId: 'body-7' });
    expect(isContourAttached(c)).toBe(true);
  });

  it('returns true for the default body id', () => {
    const c = makeContour([[0, 0, 0]], { attachedToBodyId: DEFAULT_BODY_ID });
    expect(isContourAttached(c)).toBe(true);
  });
});

describe('attachContourToBody', () => {
  it('sets attachedToBodyId and transforms points by the inverse world matrix', () => {
    const m = makeWorldMatrix();
    const worldPoint = v(4, 7, 2);
    const c = makeContour([[worldPoint.x, worldPoint.y, worldPoint.z]]);

    attachContourToBody(c, 'body-3', m);

    expect(c.attachedToBodyId).toBe('body-3');
    // Stored point should be world point transformed by inverse(world).
    const expected = worldPoint.clone().applyMatrix4(new THREE.Matrix4().copy(m).invert());
    expectVecClose(c.points[0], expected);
  });

  it('transforms handle in/out by the inverse world matrix', () => {
    const m = makeWorldMatrix();
    const inv = new THREE.Matrix4().copy(m).invert();
    const handle: ContourHandle = { in: v(1, 2, 3), out: v(4, 5, 6) };
    const expectedIn = handle.in.clone().applyMatrix4(inv);
    const expectedOut = handle.out.clone().applyMatrix4(inv);
    const c = makeContour([[0, 0, 0]], { handles: [handle] });

    attachContourToBody(c, 'body-1', m);

    expectVecClose(c.handles![0]!.in, expectedIn);
    expectVecClose(c.handles![0]!.out, expectedOut);
  });

  it('skips null handle entries without throwing', () => {
    const m = makeWorldMatrix();
    const c = makeContour([[0, 0, 0]], { handles: [null] });
    attachContourToBody(c, 'body-1', m);
    expect(c.handles![0]).toBeNull();
  });

  it('is a no-op when the contour is already attached (does not re-transform)', () => {
    const m = makeWorldMatrix();
    const c = makeContour([[4, 7, 2]], { attachedToBodyId: 'body-existing' });
    const before = c.points[0].clone();

    attachContourToBody(c, 'body-new', m);

    // attachedToBodyId is unchanged and points are untouched.
    expect(c.attachedToBodyId).toBe('body-existing');
    expectVecClose(c.points[0], before);
  });

  it('with identity matrix leaves points unchanged but still attaches', () => {
    const c = makeContour([[2, 3, 4]]);
    attachContourToBody(c, DEFAULT_BODY_ID, new THREE.Matrix4());
    expect(c.attachedToBodyId).toBe(DEFAULT_BODY_ID);
    expectVecClose(c.points[0], v(2, 3, 4));
  });
});

describe('detachContourFromBody', () => {
  it('is a no-op when the contour is not attached', () => {
    const m = makeWorldMatrix();
    const c = makeContour([[4, 7, 2]]);
    const before = c.points[0].clone();

    detachContourFromBody(c, m);

    expect(c.attachedToBodyId == null).toBe(true);
    expectVecClose(c.points[0], before);
  });

  it('clears attachedToBodyId (to null) and transforms points by the world matrix', () => {
    const m = makeWorldMatrix();
    const local = v(1, -2, 0.5);
    const c = makeContour([[local.x, local.y, local.z]], { attachedToBodyId: 'body-2' });

    detachContourFromBody(c, m);

    expect(c.attachedToBodyId).toBeNull();
    expectVecClose(c.points[0], local.clone().applyMatrix4(m));
  });
});

describe('attach/detach round-trip', () => {
  it('attach then detach restores the original world points (with rotation+translation)', () => {
    const m = makeWorldMatrix();
    const original: [number, number, number][] = [
      [4, 7, 2],
      [-3, 0, 11],
      [0.25, -8.5, 1.5],
    ];
    const c = makeContour(original);

    attachContourToBody(c, 'body-9', m);
    expect(isContourAttached(c)).toBe(true);
    detachContourFromBody(c, m);
    expect(isContourAttached(c)).toBe(false);

    original.forEach(([x, y, z], i) => {
      expectVecClose(c.points[i], v(x, y, z));
    });
  });

  it('attach then detach restores handles too', () => {
    const m = makeWorldMatrix();
    const handle: ContourHandle = { in: v(1, 2, 3), out: v(-4, 5, -6) };
    const c = makeContour([[1, 1, 1]], {
      handles: [{ in: handle.in.clone(), out: handle.out.clone() }],
    });

    attachContourToBody(c, 'body-x', m);
    detachContourFromBody(c, m);

    expectVecClose(c.handles![0]!.in, handle.in);
    expectVecClose(c.handles![0]!.out, handle.out);
  });
});

describe('toggleContourBodyAttach', () => {
  it('returns true and attaches when not currently attached', () => {
    const m = makeWorldMatrix();
    const c = makeContour([[4, 7, 2]]);
    const result = toggleContourBodyAttach(c, 'body-5', m);
    expect(result).toBe(true);
    expect(c.attachedToBodyId).toBe('body-5');
  });

  it('returns false and detaches when currently attached', () => {
    const m = makeWorldMatrix();
    const c = makeContour([[1, 2, 3]], { attachedToBodyId: 'body-5' });
    const result = toggleContourBodyAttach(c, 'body-5', m);
    expect(result).toBe(false);
    expect(c.attachedToBodyId).toBeNull();
  });

  it('toggle twice returns to original world coordinates and detached state', () => {
    const m = makeWorldMatrix();
    const original: [number, number, number][] = [[3, -1, 4], [-2, 6, 0]];
    const c = makeContour(original);

    const first = toggleContourBodyAttach(c, 'body-6', m); // attach
    const second = toggleContourBodyAttach(c, 'body-6', m); // detach

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(isContourAttached(c)).toBe(false);
    original.forEach(([x, y, z], i) => expectVecClose(c.points[i], v(x, y, z)));
  });
});

describe('contourInWorldSpace', () => {
  it('returns a clone (no mutation) for an unattached contour, ignoring the matrix', () => {
    const m = makeWorldMatrix();
    const c = makeContour([[4, 7, 2]]);
    const original = c.points[0].clone();

    const world = contourInWorldSpace(c, m);

    // For unattached contours, points are cloned but NOT transformed.
    expectVecClose(world.points[0], original);
    // Source is untouched and clone is a distinct object.
    expectVecClose(c.points[0], original);
    expect(world.points[0]).not.toBe(c.points[0]);
  });

  it('keeps attachedToBodyId unchanged on the source when unattached', () => {
    const c = makeContour([[1, 1, 1]], { attachedToBodyId: null });
    const world = contourInWorldSpace(c, new THREE.Matrix4());
    expect(world.attachedToBodyId).toBeNull();
  });

  it('transforms points by the world matrix and clears attachedToBodyId for an attached contour', () => {
    const m = makeWorldMatrix();
    const local = v(1, -2, 0.5);
    const c = makeContour([[local.x, local.y, local.z]], { attachedToBodyId: 'body-2' });

    const world = contourInWorldSpace(c, m);

    expect(world.attachedToBodyId).toBeNull();
    expectVecClose(world.points[0], local.clone().applyMatrix4(m));
    // Source contour is NOT mutated.
    expect(c.attachedToBodyId).toBe('body-2');
    expectVecClose(c.points[0], local);
  });

  it('transforms handle in/out for an attached contour', () => {
    const m = makeWorldMatrix();
    const handle: ContourHandle = { in: v(1, 0, 0), out: v(0, 1, 0) };
    const c = makeContour([[0, 0, 0]], {
      attachedToBodyId: 'body-2',
      handles: [{ in: handle.in.clone(), out: handle.out.clone() }],
    });

    const world = contourInWorldSpace(c, m);

    expectVecClose(world.handles![0]!.in, handle.in.clone().applyMatrix4(m));
    expectVecClose(world.handles![0]!.out, handle.out.clone().applyMatrix4(m));
  });

  it('preserves null handle entries for an attached contour', () => {
    const m = makeWorldMatrix();
    const c = makeContour([[0, 0, 0]], {
      attachedToBodyId: 'body-2',
      handles: [null],
    });
    const world = contourInWorldSpace(c, m);
    expect(world.handles![0]).toBeNull();
  });

  it('copies pointTypes as a new array', () => {
    const m = makeWorldMatrix();
    const c = makeContour([[0, 0, 0]], {
      attachedToBodyId: 'body-2',
      pointTypes: ['curve'],
    });
    const world = contourInWorldSpace(c, m);
    expect(world.pointTypes).toEqual(['curve']);
    expect(world.pointTypes).not.toBe(c.pointTypes);
  });
});

describe('worldToContourStorage', () => {
  it('returns a clone of the input for an unattached contour (no transform)', () => {
    const m = makeWorldMatrix();
    const c = makeContour([[0, 0, 0]]); // unattached
    const world = v(4, 7, 2);

    const stored = worldToContourStorage(world, c, m);

    expectVecClose(stored, world);
    expect(stored).not.toBe(world);
  });

  it('applies the inverse world matrix for an attached contour', () => {
    const m = makeWorldMatrix();
    const c = makeContour([[0, 0, 0]], { attachedToBodyId: 'body-2' });
    const world = v(4, 7, 2);

    const stored = worldToContourStorage(world, c, m);

    const expected = world.clone().applyMatrix4(new THREE.Matrix4().copy(m).invert());
    expectVecClose(stored, expected);
  });

  it('does not mutate the input world vector', () => {
    const m = makeWorldMatrix();
    const c = makeContour([[0, 0, 0]], { attachedToBodyId: 'body-2' });
    const world = v(4, 7, 2);
    const before = world.clone();

    worldToContourStorage(world, c, m);

    expectVecClose(world, before);
  });
});

describe('contourInWorldSpace / worldToContourStorage are inverses', () => {
  it('storage -> world (contourInWorldSpace) -> storage (worldToContourStorage) round-trips for attached', () => {
    const m = makeWorldMatrix();
    const stored = v(1.5, -3.25, 7);
    const c = makeContour([[stored.x, stored.y, stored.z]], { attachedToBodyId: 'body-2' });

    // Take the stored point to world space.
    const world = contourInWorldSpace(c, m).points[0];
    // Map that world point back to storage space.
    const back = worldToContourStorage(world, c, m);

    expectVecClose(back, stored);
  });

  it('world -> storage -> world round-trips for attached', () => {
    const m = makeWorldMatrix();
    const c = makeContour([[0, 0, 0]], { attachedToBodyId: 'body-2' });
    const world = v(8, -2, 5);

    const stored = worldToContourStorage(world, c, m);
    // Build an attached contour holding the stored point and lift to world.
    const cStored = makeContour([[stored.x, stored.y, stored.z]], {
      attachedToBodyId: 'body-2',
    });
    const backToWorld = contourInWorldSpace(cStored, m).points[0];

    expectVecClose(backToWorld, world);
  });

  it('for an unattached contour both are pure identity clones', () => {
    const m = makeWorldMatrix();
    const c = makeContour([[2, 4, 6]]);
    const world = contourInWorldSpace(c, m).points[0];
    const back = worldToContourStorage(world, c, m);
    expectVecClose(world, v(2, 4, 6));
    expectVecClose(back, v(2, 4, 6));
  });
});

describe('migrateContourAttachment', () => {
  it('keeps an explicit non-empty attachedToBodyId', () => {
    expect(migrateContourAttachment(false, 'body-42')).toBe('body-42');
  });

  it('an explicit body id wins even when attachedToScan is true', () => {
    expect(migrateContourAttachment(true, 'body-42')).toBe('body-42');
  });

  it('maps legacy attachedToScan=true to the default body id', () => {
    expect(migrateContourAttachment(true)).toBe(DEFAULT_BODY_ID);
    expect(migrateContourAttachment(true, null)).toBe(DEFAULT_BODY_ID);
    expect(migrateContourAttachment(true, '')).toBe(DEFAULT_BODY_ID);
  });

  it('maps legacy attachedToScan=false/undefined to null', () => {
    expect(migrateContourAttachment(false)).toBeNull();
    expect(migrateContourAttachment(undefined)).toBeNull();
    expect(migrateContourAttachment(false, '')).toBeNull();
    expect(migrateContourAttachment(undefined, null)).toBeNull();
  });

  it('treats empty-string attachedToBodyId as absent (falls through to scan logic)', () => {
    expect(migrateContourAttachment(false, '')).toBeNull();
    expect(migrateContourAttachment(true, '')).toBe(DEFAULT_BODY_ID);
  });

  it('returns null with no arguments at all', () => {
    expect(migrateContourAttachment()).toBeNull();
  });
});
