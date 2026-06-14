import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { connectedComponents, separateShells } from '../../src/mesh/separate';

/** Triangle count of an indexed or non-indexed geometry. */
function triCount(geom: THREE.BufferGeometry): number {
  const idx = geom.getIndex();
  if (idx) return idx.count / 3;
  return (geom.getAttribute('position')?.count ?? 0) / 3;
}

/** True if any position/normal value is NaN. */
function hasNaN(geom: THREE.BufferGeometry): boolean {
  for (const name of ['position', 'normal']) {
    const a = geom.getAttribute(name);
    if (!a) continue;
    const arr = a.array as ArrayLike<number>;
    for (let i = 0; i < arr.length; i++) if (Number.isNaN(arr[i])) return true;
  }
  return false;
}

/** A single 10mm box flattened to a non-indexed triangle soup (12 tris, 36 verts). */
function nonIndexedBox(offsetX = 0): THREE.BufferGeometry {
  const box = new THREE.BoxGeometry(10, 10, 10).toNonIndexed();
  box.translate(offsetX, 0, 0);
  return box;
}

/**
 * Concatenate the position attributes of several non-indexed geometries into one
 * non-indexed `BufferGeometry` — a triangle soup with no shared topology between
 * the inputs, exactly like an STL that packs several physical shells.
 */
function concatNonIndexed(...parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const arrays = parts.map((p) => (p.getAttribute('position') as THREE.BufferAttribute).array as Float32Array);
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const merged = new Float32Array(total);
  let off = 0;
  for (const a of arrays) {
    merged.set(a, off);
    off += a.length;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(merged, 3));
  return g;
}

describe('connectedComponents', () => {
  it('reports a single connected box as exactly one component', () => {
    const box = nonIndexedBox();
    expect(triCount(box)).toBe(12);

    const comps = connectedComponents(box);
    expect(comps.length).toBe(1);
    // Every welded triangle of the box belongs to that one component.
    expect(comps[0].length).toBe(12);
  });

  it('reports two disjoint boxes as two components of 12 triangles each', () => {
    const two = concatNonIndexed(nonIndexedBox(0), nonIndexedBox(100));
    expect(triCount(two)).toBe(24);

    const comps = connectedComponents(two);
    expect(comps.length).toBe(2);
    expect(comps[0].length).toBe(12);
    expect(comps[1].length).toBe(12);
    // The two groups partition all 24 welded triangles with no overlap.
    expect(comps[0].length + comps[1].length).toBe(24);
    const all = new Set([...comps[0], ...comps[1]]);
    expect(all.size).toBe(24);
  });
});

describe('separateShells', () => {
  it('returns one geometry for a single connected box', () => {
    const box = nonIndexedBox();
    const shells = separateShells(box);
    expect(shells.length).toBe(1);
    expect(triCount(shells[0])).toBe(12);
    // Welded box: 8 unique corners.
    expect(shells[0].getAttribute('position').count).toBe(8);
    expect(hasNaN(shells[0])).toBe(false);
  });

  it('splits two disjoint boxes into two valid 12-triangle shells', () => {
    const two = concatNonIndexed(nonIndexedBox(0), nonIndexedBox(100));
    const shells = separateShells(two);
    expect(shells.length).toBe(2);

    for (const s of shells) {
      expect(triCount(s)).toBe(12);
      // Each shell is a welded cube: 8 corners.
      expect(s.getAttribute('position').count).toBe(8);
      expect(hasNaN(s)).toBe(false);
      s.computeBoundingBox();
      expect(s.boundingBox).not.toBeNull();
    }

    // The two shells sit at distinct X positions (0 and +100), so their
    // bounding-box centers are ~100 mm apart — proof they were truly separated.
    const centers = shells.map((s) => {
      const c = new THREE.Vector3();
      s.boundingBox!.getCenter(c);
      return c.x;
    });
    centers.sort((a, b) => a - b);
    expect(Math.abs(centers[1] - centers[0])).toBeGreaterThan(90);
  });

  it('does not mutate the input geometry', () => {
    const box = nonIndexedBox();
    const before = triCount(box);
    separateShells(box);
    expect(triCount(box)).toBe(before);
  });
});
