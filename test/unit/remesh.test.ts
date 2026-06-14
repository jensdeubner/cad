import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { maxEdgeLength, refineToEdgeLength } from '../../src/mesh/remesh';

/** Sum of all triangle areas of an indexed or non-indexed geometry. */
function totalArea(geometry: THREE.BufferGeometry): number {
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
  const idx = geometry.getIndex();
  const triCount = idx ? idx.count / 3 : pos.count / 3;
  const corner = idx ? (k: number) => idx.getX(k) : (k: number) => k;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  let area = 0;
  for (let t = 0; t < triCount; t++) {
    a.fromBufferAttribute(pos, corner(t * 3));
    b.fromBufferAttribute(pos, corner(t * 3 + 1));
    c.fromBufferAttribute(pos, corner(t * 3 + 2));
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    area += ab.cross(ac).length() * 0.5;
  }
  return area;
}

/** True iff no position/normal component is NaN or non-finite. */
function isFiniteGeometry(geometry: THREE.BufferGeometry): boolean {
  for (const name of ['position', 'normal']) {
    const attr = geometry.getAttribute(name) as THREE.BufferAttribute | undefined;
    if (!attr) continue;
    const arr = attr.array as ArrayLike<number>;
    for (let i = 0; i < arr.length; i++) {
      if (!Number.isFinite(arr[i])) return false;
    }
  }
  return true;
}

function triCount(geometry: THREE.BufferGeometry): number {
  const idx = geometry.getIndex();
  if (idx) return idx.count / 3;
  return (geometry.getAttribute('position')?.count ?? 0) / 3;
}

describe('maxEdgeLength', () => {
  it('reports the longest edge of a unit box (face diagonal)', () => {
    const box = new THREE.BoxGeometry(2, 2, 2);
    // Each quad face is two right triangles; the longest edge is the hypotenuse
    // across a 2×2 face: sqrt(2^2 + 2^2) = 2*sqrt(2) ≈ 2.828.
    expect(maxEdgeLength(box)).toBeCloseTo(2 * Math.SQRT2, 6);
  });

  it('returns 0 for empty geometry', () => {
    expect(maxEdgeLength(new THREE.BufferGeometry())).toBe(0);
  });
});

describe('refineToEdgeLength', () => {
  it('refines a 20mm box so every edge <= target, preserving area exactly', () => {
    const box = new THREE.BoxGeometry(20, 20, 20);
    const area0 = totalArea(box);
    const tris0 = triCount(box);
    expect(area0).toBeCloseTo(6 * 20 * 20, 6); // 6 faces × 400 = 2400

    const target = 5;
    const r = refineToEdgeLength(box, target);

    // Every triangle edge must now be at or below the target (tiny fp epsilon).
    const maxEdge = maxEdgeLength(r.geometry);
    expect(maxEdge).toBeLessThanOrEqual(target + 1e-6);

    // Triangle count strictly increased and addedTriangles is consistent.
    const tris1 = triCount(r.geometry);
    expect(tris1).toBeGreaterThan(tris0);
    expect(r.addedTriangles).toBe(tris1 - triCount__welded(box));
    expect(r.iterations).toBeGreaterThan(0);

    // Surface area is preserved within 1e-3 relative — midpoint subdivision keeps
    // every new vertex on the original straight edge, so planar area is exact.
    const area1 = totalArea(r.geometry);
    expect(Math.abs(area1 - area0) / area0).toBeLessThan(1e-3);

    // No NaN / non-finite values anywhere.
    expect(isFiniteGeometry(r.geometry)).toBe(true);
  });

  it('stops once all edges already satisfy the target (no needless passes)', () => {
    const box = new THREE.BoxGeometry(4, 4, 4);
    // Longest edge of a 4mm box face diagonal is 4*sqrt(2) ≈ 5.657; a generous
    // target of 100 needs zero subdivision passes.
    const r = refineToEdgeLength(box, 100);
    expect(r.iterations).toBe(0);
    expect(r.addedTriangles).toBe(0);
    expect(maxEdgeLength(r.geometry)).toBeLessThanOrEqual(100);
  });

  it('respects the maxIterations cap (bounded blow-up)', () => {
    const box = new THREE.BoxGeometry(20, 20, 20);
    // A tiny target that could never be met within 2 passes — cap must bound it.
    const r = refineToEdgeLength(box, 0.001, 2);
    expect(r.iterations).toBe(2);
    expect(isFiniteGeometry(r.geometry)).toBe(true);
    // Still NaN-free and area-preserving despite stopping early.
    const area0 = totalArea(box);
    const area1 = totalArea(r.geometry);
    expect(Math.abs(area1 - area0) / area0).toBeLessThan(1e-3);
  });

  it('does not mutate the input geometry', () => {
    const box = new THREE.BoxGeometry(20, 20, 20);
    const trisBefore = triCount(box);
    const posBefore = (box.getAttribute('position') as THREE.BufferAttribute).count;
    refineToEdgeLength(box, 5);
    expect(triCount(box)).toBe(trisBefore);
    expect((box.getAttribute('position') as THREE.BufferAttribute).count).toBe(posBefore);
  });

  it('guards a non-positive target (no subdivision, returns a usable clone)', () => {
    const box = new THREE.BoxGeometry(20, 20, 20);
    const area0 = totalArea(box);

    const zero = refineToEdgeLength(box, 0);
    expect(zero.iterations).toBe(0);
    expect(zero.addedTriangles).toBe(0);
    expect(isFiniteGeometry(zero.geometry)).toBe(true);
    expect(Math.abs(totalArea(zero.geometry) - area0) / area0).toBeLessThan(1e-3);

    const neg = refineToEdgeLength(box, -10);
    expect(neg.iterations).toBe(0);
    expect(neg.addedTriangles).toBe(0);

    const nan = refineToEdgeLength(box, Number.NaN);
    expect(nan.iterations).toBe(0);
    expect(nan.addedTriangles).toBe(0);
  });
});

/**
 * Triangle count of the welded starting point used internally by
 * `refineToEdgeLength`, so `addedTriangles` can be asserted against the true
 * baseline (welding may drop degenerate triangles, though a box has none).
 */
function triCount__welded(box: THREE.BufferGeometry): number {
  // A box has no coincident vertices beyond shared corners; welding keeps all 12
  // triangles. Recompute via the same path the module uses by refining with a
  // target that triggers zero passes, then reading the geometry count.
  const r0 = refineToEdgeLength(box, Number.POSITIVE_INFINITY);
  return triCount(r0.geometry);
}
