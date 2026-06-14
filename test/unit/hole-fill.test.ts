import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { weldVertices } from '../../src/mesh/weld';
import { findBoundaryLoops, fillHoles } from '../../src/mesh/hole-fill';

function hasNaN(geom: THREE.BufferGeometry): boolean {
  const pos = geom.getAttribute('position');
  if (pos) {
    const arr = pos.array as ArrayLike<number>;
    for (let i = 0; i < arr.length; i++) if (Number.isNaN(arr[i])) return true;
  }
  const nrm = geom.getAttribute('normal');
  if (nrm) {
    const narr = nrm.array as ArrayLike<number>;
    for (let i = 0; i < narr.length; i++) if (Number.isNaN(narr[i])) return true;
  }
  return false;
}

function triCount(geom: THREE.BufferGeometry): number {
  const idx = geom.getIndex();
  if (idx) return idx.count / 3;
  return (geom.getAttribute('position')?.count ?? 0) / 3;
}

/**
 * Build a welded, indexed box (8 corners, 12 tris) and then remove the two
 * triangles that make up one face — leaving a single 4-vertex boundary hole.
 */
function openBox(): THREE.BufferGeometry {
  const closed = weldVertices(new THREE.BoxGeometry(20, 20, 20));
  const idx = closed.getIndex()!;
  const all: number[] = [];
  for (let k = 0; k < idx.count; k++) all.push(idx.getX(k));

  // Find one face = two triangles sharing an undirected edge that, together,
  // form a 4-vertex quad. Simplest robust approach: drop the FIRST two triangles
  // only if they form a closed quad (share exactly two corners). The welded box
  // emits faces as consecutive triangle pairs, so triangles 0 and 1 form a face.
  const t0 = all.slice(0, 3);
  const t1 = all.slice(3, 6);
  const shared = t0.filter((v) => t1.includes(v));
  expect(shared.length).toBe(2); // the two triangles share a diagonal edge → one face

  const kept = all.slice(6); // drop triangles 0 and 1 (one full face)
  const open = new THREE.BufferGeometry();
  const pos = closed.getAttribute('position') as THREE.BufferAttribute;
  open.setAttribute('position', pos.clone());
  open.setIndex(kept);
  open.computeVertexNormals();
  return open;
}

describe('findBoundaryLoops', () => {
  it('reports no boundary loops for a closed welded box', () => {
    const closed = weldVertices(new THREE.BoxGeometry(20, 20, 20));
    expect(findBoundaryLoops(closed).length).toBe(0);
  });

  it('finds exactly one 4-vertex loop on a box with one face removed', () => {
    const open = openBox();
    const loops = findBoundaryLoops(open);
    expect(loops.length).toBe(1);
    expect(loops[0].length).toBe(4);
    // All four loop vertices are distinct.
    expect(new Set(loops[0]).size).toBe(4);
  });

  it('returns [] for geometry without an index', () => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3),
    );
    expect(findBoundaryLoops(geom)).toEqual([]);
  });
});

describe('fillHoles', () => {
  it('leaves a closed box untouched (0 holes, 12 tris)', () => {
    const closed = weldVertices(new THREE.BoxGeometry(20, 20, 20));
    expect(triCount(closed)).toBe(12);

    const r = fillHoles(closed);
    expect(r.holesFilled).toBe(0);
    expect(r.addedTriangles).toBe(0);
    expect(triCount(r.geometry)).toBe(12);
    expect(findBoundaryLoops(r.geometry).length).toBe(0);
    expect(hasNaN(r.geometry)).toBe(false);
  });

  it('also handles a raw (unwelded) BoxGeometry — welds then stays closed', () => {
    const box = new THREE.BoxGeometry(20, 20, 20);
    const r = fillHoles(box);
    expect(r.holesFilled).toBe(0);
    expect(triCount(r.geometry)).toBe(12);
    expect(findBoundaryLoops(r.geometry).length).toBe(0);
  });

  it('closes a single-face hole and yields a watertight mesh', () => {
    const open = openBox();
    expect(findBoundaryLoops(open).length).toBe(1);
    expect(triCount(open)).toBe(10); // 12 − 2 removed

    const r = fillHoles(open);

    // One hole filled, capped with a centroid fan (4 triangles for a quad).
    expect(r.holesFilled).toBe(1);
    expect(r.addedTriangles).toBeGreaterThanOrEqual(4);
    expect(r.addedTriangles).toBe(4);

    // Watertight again.
    expect(findBoundaryLoops(r.geometry).length).toBe(0);
    // 10 surviving + 4 cap triangles.
    expect(triCount(r.geometry)).toBe(14);
    expect(hasNaN(r.geometry)).toBe(false);
    expect(r.geometry.getAttribute('normal')).toBeTruthy();
  });

  it('returns a NEW geometry and never mutates the input', () => {
    const open = openBox();
    const srcIdxCount = open.getIndex()!.count;
    const r = fillHoles(open);
    expect(r.geometry).not.toBe(open);
    expect(open.getIndex()!.count).toBe(srcIdxCount); // input untouched
  });

  it('fills multiple holes on a box with two opposite (disjoint) faces removed', () => {
    const closed = weldVertices(new THREE.BoxGeometry(20, 20, 20));
    const idx = closed.getIndex()!;
    const pos = closed.getAttribute('position') as THREE.BufferAttribute;
    const all: number[] = [];
    for (let k = 0; k < idx.count; k++) all.push(idx.getX(k));

    // Identify the two faces on the +X and -X sides (the box spans ±10 in X).
    // A triangle belongs to a side when all three corners lie on that plane.
    // These two faces share no vertices, so their holes stay disjoint.
    const triCountAll = all.length / 3;
    const onPlusX: number[] = []; // triangle indices on +X
    const onMinusX: number[] = []; // triangle indices on -X
    for (let t = 0; t < triCountAll; t++) {
      const c = [all[t * 3], all[t * 3 + 1], all[t * 3 + 2]];
      if (c.every((vi) => pos.getX(vi) > 9.9)) onPlusX.push(t);
      else if (c.every((vi) => pos.getX(vi) < -9.9)) onMinusX.push(t);
    }
    expect(onPlusX.length).toBe(2);
    expect(onMinusX.length).toBe(2);

    const drop = new Set([...onPlusX, ...onMinusX]);
    const kept: number[] = [];
    for (let t = 0; t < triCountAll; t++) {
      if (drop.has(t)) continue;
      kept.push(all[t * 3], all[t * 3 + 1], all[t * 3 + 2]);
    }
    const open = new THREE.BufferGeometry();
    open.setAttribute('position', pos.clone());
    open.setIndex(kept);

    expect(findBoundaryLoops(open).length).toBe(2);

    const r = fillHoles(open);
    expect(r.holesFilled).toBe(2);
    expect(findBoundaryLoops(r.geometry).length).toBe(0);
    expect(hasNaN(r.geometry)).toBe(false);
  });
});
