import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  geometryMeshData,
  mirrorGeometry,
  clipGeometryByPlane,
  mergeBodyGeometries,
} from '../src/body-edit';
import type { CadBodyRecord } from '../src/cad-scene';

// ---------------------------------------------------------------------------
// Helpers (no WebGL, no canvas, no WASM)
// ---------------------------------------------------------------------------

/** A single triangle in the XY plane (z=0). Non-indexed by default. */
function makeTriangle(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const positions = new Float32Array([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
  ]);
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return g;
}

/** A unit quad (two triangles) built from 4 shared vertices, indexed. */
function makeIndexedQuad(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const positions = new Float32Array([
    0, 0, 0, // 0
    1, 0, 0, // 1
    1, 1, 0, // 2
    0, 1, 0, // 3
  ]);
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

/** Minimal CadBodyRecord stand-in: mergeBodyGeometries only reads .geometry and .meshGroup. */
function makeBody(geometry: THREE.BufferGeometry | null, group?: THREE.Group): CadBodyRecord {
  const meshGroup = group ?? new THREE.Group();
  return { geometry, meshGroup } as unknown as CadBodyRecord;
}

// ---------------------------------------------------------------------------
// geometryMeshData
// ---------------------------------------------------------------------------

describe('geometryMeshData', () => {
  it('generates sequential indices for a non-indexed geometry', () => {
    const tri = makeTriangle();
    const { positions, indices } = geometryMeshData(tri);
    expect(positions.length).toBe(9); // 3 verts * 3 components
    expect(indices.length).toBe(3); // 3 verts -> 3 indices
    expect(Array.from(indices)).toEqual([0, 1, 2]);
    expect(indices).toBeInstanceOf(Uint32Array);
  });

  it('returns the same positions reference (no copy) for non-indexed geometry', () => {
    const tri = makeTriangle();
    const posArray = tri.getAttribute('position').array as Float32Array;
    const { positions } = geometryMeshData(tri);
    expect(positions).toBe(posArray);
  });

  it('returns the existing index array when geometry is already indexed (Uint32)', () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array([0, 1, 2, 0, 2, 3]), 1));
    const { indices } = geometryMeshData(g);
    expect(Array.from(indices)).toEqual([0, 1, 2, 0, 2, 3]);
    // already Uint32Array -> passed through as-is
    expect(indices).toBe(g.getIndex()!.array);
  });

  it('converts a non-Uint32 index buffer to a Uint32Array copy', () => {
    const g = makeIndexedQuad(); // setIndex([...numbers]) -> Uint16Array under threshold
    const idxAttr = g.getIndex()!;
    // sanity: small index -> not Uint32 in three.js
    expect(idxAttr.array).not.toBeInstanceOf(Uint32Array);
    const { indices } = geometryMeshData(g);
    expect(indices).toBeInstanceOf(Uint32Array);
    expect(Array.from(indices)).toEqual([0, 1, 2, 0, 2, 3]);
  });
});

// ---------------------------------------------------------------------------
// mirrorGeometry
// ---------------------------------------------------------------------------

describe('mirrorGeometry', () => {
  it('returns a new geometry (clone), not the original', () => {
    const tri = makeTriangle();
    const out = mirrorGeometry(tri, 'x');
    expect(out).not.toBe(tri);
  });

  it('does not mutate the source geometry', () => {
    const tri = makeTriangle();
    mirrorGeometry(tri, 'x');
    const src = tri.getAttribute('position').array as Float32Array;
    expect(Array.from(src)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  });

  it('negates the x coordinate for axis "x"', () => {
    const tri = makeTriangle();
    const out = mirrorGeometry(tri, 'x');
    const p = out.getAttribute('position').array as Float32Array;
    // vertex 1 was (1,0,0) -> (-1,0,0)
    expect(p[3]).toBeCloseTo(-1, 6);
    expect(p[4]).toBeCloseTo(0, 6);
    expect(p[5]).toBeCloseTo(0, 6);
    // vertex 2 (0,1,0) unaffected on x
    expect(p[6]).toBeCloseTo(0, 6);
    expect(p[7]).toBeCloseTo(1, 6);
  });

  it('negates the y coordinate for axis "y"', () => {
    const tri = makeTriangle();
    const out = mirrorGeometry(tri, 'y');
    const p = out.getAttribute('position').array as Float32Array;
    // vertex 2 was (0,1,0) -> (0,-1,0)
    expect(p[6]).toBeCloseTo(0, 6);
    expect(p[7]).toBeCloseTo(-1, 6);
    expect(p[8]).toBeCloseTo(0, 6);
    // x of vertex 1 unaffected
    expect(p[3]).toBeCloseTo(1, 6);
  });

  it('negates the z coordinate for axis "z"', () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([0, 0, 2, 1, 1, -3, 0, 0, 0]), 3),
    );
    const out = mirrorGeometry(g, 'z');
    const p = out.getAttribute('position').array as Float32Array;
    expect(p[2]).toBeCloseTo(-2, 6);
    expect(p[5]).toBeCloseTo(3, 6);
    expect(p[8]).toBeCloseTo(0, 6);
  });

  it('swaps winding (index b<->c) of an indexed geometry to keep faces outward', () => {
    const quad = makeIndexedQuad();
    const before = Array.from(quad.getIndex()!.array);
    expect(before).toEqual([0, 1, 2, 0, 2, 3]);
    const out = mirrorGeometry(quad, 'x');
    const after = Array.from(out.getIndex()!.array);
    // each triangle's 2nd and 3rd index get swapped
    expect(after).toEqual([0, 2, 1, 0, 3, 2]);
  });

  it('preserves vertex count', () => {
    const quad = makeIndexedQuad();
    const out = mirrorGeometry(quad, 'y');
    expect(out.getAttribute('position').count).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// clipGeometryByPlane
// ---------------------------------------------------------------------------

describe('clipGeometryByPlane', () => {
  it('keeps a triangle fully on the positive side of the plane', () => {
    const tri = makeTriangle(); // all z=0
    // Plane z >= 0 : normal (0,0,1), constant 0. distanceToPoint = z.
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const out = clipGeometryByPlane(tri, plane);
    expect(out).not.toBeNull();
    expect(out!.getIndex()!.count).toBe(3);
  });

  it('returns null when every triangle is on the negative side', () => {
    const tri = makeTriangle(); // z=0
    // Plane requiring z >= 1 (normal +z, constant -1 => distance = z - 1 < 0 for z=0)
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -1);
    const out = clipGeometryByPlane(tri, plane);
    expect(out).toBeNull();
  });

  it('drops triangles with any vertex below the plane (whole-triangle test)', () => {
    // Two triangles: one entirely at x>=0, one straddling into x<0.
    const g = new THREE.BufferGeometry();
    const positions = new Float32Array([
      // triangle A: all x >= 0
      1, 0, 0,
      2, 0, 0,
      1, 1, 0,
      // triangle B: one vertex at x = -1 (below plane x>=0)
      -1, 0, 0,
      0, 1, 0,
      0, 0, 1,
    ]);
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0); // keep x >= 0
    const out = clipGeometryByPlane(g, plane);
    expect(out).not.toBeNull();
    // only triangle A survives -> 3 indices
    expect(out!.getIndex()!.count).toBe(3);
    // surviving indices reference triangle A's vertices (0,1,2)
    expect(Array.from(out!.getIndex()!.array)).toEqual([0, 1, 2]);
  });

  it('copies the full original positions buffer regardless of which faces survive', () => {
    const quad = makeIndexedQuad(); // 4 verts, z=0
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const out = clipGeometryByPlane(quad, plane);
    expect(out).not.toBeNull();
    // positions buffer is a full slice of the original (4 verts)
    expect(out!.getAttribute('position').count).toBe(4);
    expect(out!.getIndex()!.count).toBe(6); // both triangles kept
  });

  it('keeps faces lying exactly on the plane (within epsilon)', () => {
    const tri = makeTriangle(); // z=0, exactly on plane z=0
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const out = clipGeometryByPlane(tri, plane);
    expect(out).not.toBeNull();
    expect(out!.getIndex()!.count).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// mergeBodyGeometries
// ---------------------------------------------------------------------------

describe('mergeBodyGeometries', () => {
  it('returns null when no bodies have geometry', () => {
    const out = mergeBodyGeometries([makeBody(null), makeBody(null)]);
    expect(out).toBeNull();
  });

  it('returns null for an empty list', () => {
    expect(mergeBodyGeometries([])).toBeNull();
  });

  it('skips bodies without geometry but merges the rest', () => {
    const tri = makeTriangle();
    const out = mergeBodyGeometries([makeBody(null), makeBody(tri)]);
    expect(out).not.toBeNull();
    expect(out!.getAttribute('position').count).toBe(3);
    expect(out!.getIndex()!.count).toBe(3);
  });

  it('concatenates two indexed geometries with offset indices', () => {
    const a = makeIndexedQuad(); // 4 verts, 6 indices
    const b = makeIndexedQuad(); // 4 verts, 6 indices
    const out = mergeBodyGeometries([makeBody(a), makeBody(b)]);
    expect(out).not.toBeNull();
    expect(out!.getAttribute('position').count).toBe(8); // 4 + 4
    const idx = out!.getIndex()!;
    expect(idx.count).toBe(12); // 6 + 6
    // First quad indices unchanged, second quad offset by 4 verts.
    expect(Array.from(idx.array)).toEqual([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  });

  it('builds sequential indices for non-indexed parts', () => {
    const a = makeTriangle(); // 3 verts, non-indexed
    const b = makeTriangle(); // 3 verts, non-indexed
    const out = mergeBodyGeometries([makeBody(a), makeBody(b)]);
    expect(out).not.toBeNull();
    expect(out!.getAttribute('position').count).toBe(6);
    const idx = out!.getIndex()!;
    expect(idx.count).toBe(6);
    expect(Array.from(idx.array)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('applies the body meshGroup world transform to merged positions', () => {
    const tri = makeTriangle();
    const group = new THREE.Group();
    group.position.set(10, 0, 0); // translate +10 in x
    const out = mergeBodyGeometries([makeBody(tri, group)]);
    expect(out).not.toBeNull();
    const p = out!.getAttribute('position').array as Float32Array;
    // vertex 0 (0,0,0) -> (10,0,0)
    expect(p[0]).toBeCloseTo(10, 6);
    expect(p[1]).toBeCloseTo(0, 6);
    expect(p[2]).toBeCloseTo(0, 6);
    // vertex 1 (1,0,0) -> (11,0,0)
    expect(p[3]).toBeCloseTo(11, 6);
  });

  it('does not mutate the original body geometry (works on a clone)', () => {
    const tri = makeTriangle();
    const group = new THREE.Group();
    group.position.set(5, 5, 5);
    mergeBodyGeometries([makeBody(tri, group)]);
    const src = tri.getAttribute('position').array as Float32Array;
    expect(Array.from(src)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  });
});
