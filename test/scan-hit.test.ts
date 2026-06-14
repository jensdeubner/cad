import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  planeWithinScanBounds,
  planeIntersectsScan,
  collectScanPointsOnPlane,
  pointHitsScan,
  getScanSolidMeshes,
} from '../src/scan-hit';
import { computePCANormal, countAlignmentHits } from '../src/scan-plane-align';
import { DEFAULT_ALIGNMENT, type ScanAlignment } from '../src/scan-align';
import type { PlaneAxis } from '../src/types';

// --- helpers --------------------------------------------------------------

// AXIS_INDEX in both modules: xy -> 2 (z), xz -> 1 (y), yz -> 0 (x).
// i.e. the component compared against `position` is z for 'xy', y for 'xz', x for 'yz'.

/** Build a BufferGeometry from an explicit list of vertices (no faces needed). */
function geomFromPoints(pts: [number, number, number][]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const arr = new Float32Array(pts.length * 3);
  pts.forEach(([x, y, z], i) => {
    arr[i * 3] = x;
    arr[i * 3 + 1] = y;
    arr[i * 3 + 2] = z;
  });
  g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  return g;
}

const IDENTITY = new THREE.Matrix4();

function box(min: [number, number, number], max: [number, number, number]): THREE.Box3 {
  return new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max));
}

// =========================================================================
// planeWithinScanBounds
// =========================================================================
describe('planeWithinScanBounds', () => {
  const b = box([-10, -20, -30], [10, 20, 30]);

  it("uses the z component for axis 'xy' (inside range)", () => {
    expect(planeWithinScanBounds('xy', 0, b)).toBe(true);
    expect(planeWithinScanBounds('xy', 30, b)).toBe(true);
    expect(planeWithinScanBounds('xy', -30, b)).toBe(true);
  });

  it("returns false for 'xy' when position is past the z bounds (no margin)", () => {
    expect(planeWithinScanBounds('xy', 30.0001, b)).toBe(false);
    expect(planeWithinScanBounds('xy', -30.0001, b)).toBe(false);
  });

  it("uses the y component for axis 'xz'", () => {
    expect(planeWithinScanBounds('xz', 20, b)).toBe(true);
    expect(planeWithinScanBounds('xz', 21, b)).toBe(false);
    expect(planeWithinScanBounds('xz', -21, b)).toBe(false);
  });

  it("uses the x component for axis 'yz'", () => {
    expect(planeWithinScanBounds('yz', 10, b)).toBe(true);
    expect(planeWithinScanBounds('yz', 11, b)).toBe(false);
    expect(planeWithinScanBounds('yz', -11, b)).toBe(false);
  });

  it('margin widens the accepted interval symmetrically', () => {
    expect(planeWithinScanBounds('yz', 11, b)).toBe(false);
    expect(planeWithinScanBounds('yz', 11, b, 2)).toBe(true); // 11 <= 10 + 2
    expect(planeWithinScanBounds('yz', 12.0001, b, 2)).toBe(false);
    expect(planeWithinScanBounds('yz', -12, b, 2)).toBe(true); // -12 >= -10 - 2
  });

  it('boundary equal to min/max (with margin) is inclusive', () => {
    // position === max + margin is accepted (<=), and min - margin is accepted (>=)
    expect(planeWithinScanBounds('xy', 31, b, 1)).toBe(true);
    expect(planeWithinScanBounds('xy', -31, b, 1)).toBe(true);
    expect(planeWithinScanBounds('xy', 31.5, b, 1)).toBe(false);
  });
});

// =========================================================================
// planeIntersectsScan
// =========================================================================
describe('planeIntersectsScan', () => {
  // A flat sheet of points at z = 5, spread over x/y.
  const sheet = geomFromPoints([
    [0, 0, 5],
    [1, 0, 5],
    [0, 1, 5],
    [2, 2, 5],
    [-3, 1, 5],
    [4, -2, 5],
  ]);
  const sheetBox = box([-3, -2, 5], [4, 2, 5]);

  it('returns false immediately when position is outside bounds+tolerance', () => {
    // z bounds are [5,5]; position 9 with tolerance 1 -> 9 > 5+1 -> short-circuit false
    expect(planeIntersectsScan(sheet, IDENTITY, 'xy', 9, 1, sheetBox)).toBe(false);
  });

  it('returns true when a sampled vertex z is within tolerance of position', () => {
    // With default sampleStride=2, vertices i=0,2,4 are checked; all have z=5.
    expect(planeIntersectsScan(sheet, IDENTITY, 'xy', 5, 0.001, sheetBox)).toBe(true);
  });

  it('returns true when within tolerance band even if not exactly on plane', () => {
    expect(planeIntersectsScan(sheet, IDENTITY, 'xy', 5.4, 0.5, sheetBox)).toBe(true);
  });

  it('returns false when no sampled vertex is within tolerance but bounds allow it', () => {
    // bounds for axis 'yz' use x: x in [-3,4]. position 100 fails bounds first.
    // Use a position inside bounds but far from any vertex component instead.
    // Sheet at z=5; check axis 'xy' position 5.9 tol 0.2 -> band [5.7,6.1], no vertex z=5 hits.
    // But bounds [5,5] with margin tol(0.2): 5.9 > 5+0.2 -> short circuits false.
    // So craft a wider box so bounds pass yet vertices miss:
    const wideBox = box([-3, -2, 0], [4, 2, 10]);
    expect(planeIntersectsScan(sheet, IDENTITY, 'xy', 8, 0.2, wideBox)).toBe(false);
  });

  it('applies the world matrix before comparing components', () => {
    // Translate scan up by +3 in z: sheet z becomes 8.
    const m = new THREE.Matrix4().makeTranslation(0, 0, 3);
    const movedBox = box([-3, -2, 8], [4, 2, 8]);
    expect(planeIntersectsScan(sheet, m, 'xy', 8, 0.01, movedBox)).toBe(true);
    expect(planeIntersectsScan(sheet, m, 'xy', 5, 0.01, movedBox)).toBe(false);
  });

  it('sampleStride=1 inspects every vertex', () => {
    // Single off-stride vertex: only index 1 sits at z=5, others at z=0.
    const g = geomFromPoints([
      [0, 0, 0],
      [1, 0, 5],
      [0, 1, 0],
      [2, 2, 0],
    ]);
    const gBox = box([0, 0, 0], [2, 2, 5]);
    // stride=2 checks i=0,2 (z=0) -> misses the z=5 vertex.
    expect(planeIntersectsScan(g, IDENTITY, 'xy', 5, 0.01, gBox, 2)).toBe(false);
    // stride=1 checks i=1 -> hit.
    expect(planeIntersectsScan(g, IDENTITY, 'xy', 5, 0.01, gBox, 1)).toBe(true);
  });
});

// =========================================================================
// collectScanPointsOnPlane
// =========================================================================
describe('collectScanPointsOnPlane', () => {
  it('projects matched points onto the plane (snaps the along-axis component)', () => {
    const g = geomFromPoints([
      [1, 2, 4.95],
      [3, 4, 5.05],
    ]);
    const out = collectScanPointsOnPlane(g, IDENTITY, 'xy', 5, 0.1, 1);
    expect(out.length).toBe(2);
    // z snapped exactly to plane position 5
    for (const p of out) expect(p.z).toBe(5);
    expect(out[0].x).toBeCloseTo(1, 6);
    expect(out[0].y).toBeCloseTo(2, 6);
    expect(out[1].x).toBeCloseTo(3, 6);
    expect(out[1].y).toBeCloseTo(4, 6);
  });

  it('snaps the y component for axis xz and x component for axis yz', () => {
    const g = geomFromPoints([[7, 4.97, 9]]);
    const outXz = collectScanPointsOnPlane(g, IDENTITY, 'xz', 5, 0.1, 1);
    expect(outXz.length).toBe(1);
    expect(outXz[0].y).toBe(5);
    expect(outXz[0].x).toBeCloseTo(7, 6);
    expect(outXz[0].z).toBeCloseTo(9, 6);

    const g2 = geomFromPoints([[4.97, 7, 9]]);
    const outYz = collectScanPointsOnPlane(g2, IDENTITY, 'yz', 5, 0.1, 1);
    expect(outYz.length).toBe(1);
    expect(outYz[0].x).toBe(5);
  });

  it('excludes points whose along-axis distance exceeds tolerance', () => {
    const g = geomFromPoints([
      [0, 0, 5],
      [0, 0, 6], // |6-5| = 1 > 0.1
    ]);
    const out = collectScanPointsOnPlane(g, IDENTITY, 'xy', 5, 0.1, 1);
    expect(out.length).toBe(1);
  });

  it('deduplicates points that round to the same 0.1 grid key', () => {
    const g = geomFromPoints([
      [1.0, 2.0, 5],
      [1.04, 2.04, 5], // rounds to same x/y at 1 decimal -> deduped
      [1.2, 2.0, 5], // distinct
    ]);
    const out = collectScanPointsOnPlane(g, IDENTITY, 'xy', 5, 0.001, 1);
    expect(out.length).toBe(2);
  });

  it('returns an empty array when nothing is within tolerance', () => {
    const g = geomFromPoints([[0, 0, 0]]);
    expect(collectScanPointsOnPlane(g, IDENTITY, 'xy', 5, 0.1, 1)).toEqual([]);
  });
});

// =========================================================================
// pointHitsScan
// =========================================================================
describe('pointHitsScan', () => {
  it('returns false for an empty geometry', () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
    const pt = new THREE.Vector3(0, 0, 0);
    expect(pointHitsScan(pt, g, IDENTITY, 'xy', 1, 1)).toBe(false);
  });

  it('returns true on a direct 3D proximity hit (within tolerance sphere)', () => {
    const g = geomFromPoints([[0, 0, 0]]);
    const pt = new THREE.Vector3(0.5, 0, 0); // dist 0.5 <= tol 1
    expect(pointHitsScan(pt, g, IDENTITY, 'xy', 1, 1)).toBe(true);
  });

  it('uses the relaxed in-plane window (tolerance*5) when along-axis is within tolerance', () => {
    // axis xy: along-axis = z. Point and vertex share z=0 (delta 0 <= tol).
    // In-plane (x,y) distance must be <= (tol*5). tol=1 -> window radius 5.
    const g = geomFromPoints([[4, 0, 0]]);
    const ptInside = new THREE.Vector3(0, 0, 0); // in-plane dist 4 <= 5 -> hit
    const ptOutside = new THREE.Vector3(-4, 0, 0); // in-plane dist 8 > 5 -> miss
    expect(pointHitsScan(ptInside, g, IDENTITY, 'xy', 1, 1)).toBe(true);
    expect(pointHitsScan(ptOutside, g, IDENTITY, 'xy', 1, 1)).toBe(false);
  });

  it('rejects when along-axis delta exceeds tolerance and 3D distance is too large', () => {
    // vertex z far from point z so along-axis delta > tol, and 3D distance > tol.
    const g = geomFromPoints([[0, 0, 10]]);
    const pt = new THREE.Vector3(0, 0, 0);
    expect(pointHitsScan(pt, g, IDENTITY, 'xy', 1, 1)).toBe(false);
  });

  it('honors sampleStride (can skip the only matching vertex)', () => {
    const g = geomFromPoints([
      [0, 0, 100], // i=0, far
      [0, 0, 0], // i=1, exact match
    ]);
    const pt = new THREE.Vector3(0, 0, 0);
    expect(pointHitsScan(pt, g, IDENTITY, 'xy', 0.1, 2)).toBe(false); // checks only i=0
    expect(pointHitsScan(pt, g, IDENTITY, 'xy', 0.1, 1)).toBe(true); // checks i=1 too
  });

  it('applies the world matrix to scan vertices before comparing', () => {
    const g = geomFromPoints([[0, 0, 0]]);
    const m = new THREE.Matrix4().makeTranslation(5, 0, 0);
    const pt = new THREE.Vector3(5, 0, 0); // matches transformed vertex
    expect(pointHitsScan(pt, g, m, 'xy', 0.1, 1)).toBe(true);
    expect(pointHitsScan(new THREE.Vector3(0, 0, 0), g, m, 'xy', 0.1, 1)).toBe(false);
  });
});

// =========================================================================
// getScanSolidMeshes
// =========================================================================
describe('getScanSolidMeshes', () => {
  it("collects only Meshes named 'solid'", () => {
    const group = new THREE.Group();
    const solidA = new THREE.Mesh();
    solidA.name = 'solid';
    const solidB = new THREE.Mesh();
    solidB.name = 'solid';
    const other = new THREE.Mesh();
    other.name = 'points';
    const notMesh = new THREE.Object3D();
    notMesh.name = 'solid'; // right name, wrong type
    group.add(solidA, solidB, other, notMesh);

    const found = getScanSolidMeshes(group);
    expect(found).toHaveLength(2);
    expect(found).toContain(solidA);
    expect(found).toContain(solidB);
  });

  it('descends into nested children (traverse)', () => {
    const group = new THREE.Group();
    const inner = new THREE.Group();
    const nestedSolid = new THREE.Mesh();
    nestedSolid.name = 'solid';
    inner.add(nestedSolid);
    group.add(inner);

    const found = getScanSolidMeshes(group);
    expect(found).toEqual([nestedSolid]);
  });

  it('returns an empty array when no solid mesh exists', () => {
    const group = new THREE.Group();
    const m = new THREE.Mesh();
    m.name = 'cloud';
    group.add(m);
    expect(getScanSolidMeshes(group)).toEqual([]);
  });
});

// =========================================================================
// computePCANormal
// =========================================================================
describe('computePCANormal', () => {
  it('returns (0,0,1) for fewer than 3 points', () => {
    const n0 = computePCANormal([]);
    const n2 = computePCANormal([new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)]);
    expect(n0.x).toBe(0);
    expect(n0.y).toBe(0);
    expect(n0.z).toBe(1);
    expect(n2.toArray()).toEqual([0, 0, 1]);
  });

  it('recovers the +z normal of a planar cloud lying in z=const', () => {
    const pts: THREE.Vector3[] = [];
    for (let x = -5; x <= 5; x++) {
      for (let y = -5; y <= 5; y++) {
        pts.push(new THREE.Vector3(x, y, 3));
      }
    }
    const n = computePCANormal(pts);
    // normal is along z (sign may be either +1 or -1 from the cross product)
    expect(Math.abs(n.z)).toBeCloseTo(1, 5);
    expect(Math.abs(n.x)).toBeCloseTo(0, 5);
    expect(Math.abs(n.y)).toBeCloseTo(0, 5);
    expect(n.length()).toBeCloseTo(1, 6);
  });

  it('recovers a non-degenerate planar normal along y (plane y=const with a slight in-plane shear)', () => {
    // NOTE: the power-iteration PCA seeds at (0,0,1) and deflates. A perfectly
    // symmetric grid in the plane has equal in-plane eigenvalues and degenerates
    // (see the symmetric cases below). Adding a tiny shear so the seed direction is
    // NOT an eigenvector lets power iteration converge and recover the y normal.
    const pts: THREE.Vector3[] = [];
    for (let x = -8; x <= 8; x++) {
      for (let z = -2; z <= 2; z++) {
        pts.push(new THREE.Vector3(x + 0.01 * z, 2, z));
      }
    }
    const n = computePCANormal(pts);
    expect(Math.abs(n.y)).toBeCloseTo(1, 4);
    expect(Math.abs(n.x)).toBeCloseTo(0, 4);
    expect(Math.abs(n.z)).toBeCloseTo(0, 4);
  });

  it('SURPRISE: a perfectly symmetric x/z grid at y=const degenerates to the (0,0,1) fallback', () => {
    // True plane normal is along y, but because the grid is symmetric (equal x and z
    // extents) the seed vector (0,0,1) is already an eigenvector and deflation makes
    // v1 collinear with v0, so the cross product is ~0 and the code returns its
    // (0,0,1) fallback rather than the geometric normal (0,1,0).
    const pts: THREE.Vector3[] = [];
    for (let x = -4; x <= 4; x++) {
      for (let z = -4; z <= 4; z++) {
        pts.push(new THREE.Vector3(x, 2, z));
      }
    }
    const n = computePCANormal(pts);
    expect(n.toArray()).toEqual([0, 0, 1]);
  });

  it('SURPRISE: an oblique symmetric plane z=x returns the y axis, not its true (1,0,-1) normal', () => {
    // Geometrically the plane z - x = 0 has normal (1,0,-1)/sqrt2. But with a
    // symmetric x/y grid the in-plane (1,0,1) direction and the normal direction
    // have equal variance, so the degenerate PCA picks the y axis instead.
    const pts: THREE.Vector3[] = [];
    for (let x = -5; x <= 5; x++) {
      for (let y = -5; y <= 5; y++) {
        pts.push(new THREE.Vector3(x, y, x));
      }
    }
    const n = computePCANormal(pts);
    expect(Math.abs(n.y)).toBeCloseTo(1, 5);
    expect(Math.abs(n.x)).toBeCloseTo(0, 5);
    expect(Math.abs(n.z)).toBeCloseTo(0, 5);
    expect(n.length()).toBeCloseTo(1, 6);
  });

  it('returns a unit-length vector', () => {
    const pts: THREE.Vector3[] = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(1, 1, 0),
      new THREE.Vector3(2, 0.5, 0),
    ];
    expect(computePCANormal(pts).length()).toBeCloseTo(1, 6);
  });
});

// =========================================================================
// countAlignmentHits
// =========================================================================
describe('countAlignmentHits', () => {
  // A flat planar cloud at z = 5 (axis 'xy' compares the z component).
  function flatSheetGeom(): THREE.BufferGeometry {
    const pts: [number, number, number][] = [];
    for (let x = -3; x <= 3; x++) {
      for (let y = -3; y <= 3; y++) {
        pts.push([x, y, 5]);
      }
    }
    return geomFromPoints(pts);
  }
  const TOTAL = 7 * 7; // 49 points

  it('returns zero hits when the plane misses the cloud entirely', () => {
    const geom = flatSheetGeom();
    const res = countAlignmentHits(geom, DEFAULT_ALIGNMENT, 'xy', 0, 0.1);
    expect(res.hitCount).toBe(0);
    expect(res.hitRatio).toBe(0);
    expect(res.sampleCount).toBe(TOTAL);
  });

  it('with the identity alignment, all points at z=5 hit the z=5 plane', () => {
    const geom = flatSheetGeom();
    const res = countAlignmentHits(geom, DEFAULT_ALIGNMENT, 'xy', 5, 0.1);
    expect(res.hitCount).toBe(TOTAL);
    expect(res.hitRatio).toBeCloseTo(1, 6);
    expect(res.sampleCount).toBe(TOTAL);
  });

  it('hit count is monotonic non-decreasing as tolerance grows', () => {
    // Points spread across several z layers; widening the tolerance band can only
    // add hits, never remove them.
    const pts: [number, number, number][] = [];
    for (let i = 0; i < 11; i++) {
      // z values 0, 0.5, 1.0, ... 5.0
      pts.push([i, 0, i * 0.5]);
    }
    const geom = geomFromPoints(pts);
    const plane = 2.5; // pick a plane position in the middle
    let prev = -1;
    for (const tol of [0.0, 0.1, 0.3, 0.6, 1.0, 2.0, 5.0]) {
      const { hitCount } = countAlignmentHits(geom, DEFAULT_ALIGNMENT, 'xy', plane, tol);
      expect(hitCount).toBeGreaterThanOrEqual(prev);
      prev = hitCount;
    }
    // A large tolerance catches every point (max z spread is 5.0, within band of 5).
    const all = countAlignmentHits(geom, DEFAULT_ALIGNMENT, 'xy', plane, 5.0);
    expect(all.hitCount).toBe(11);
  });

  it('respects rotation in the alignment (rotating a sheet off-plane drops hits)', () => {
    const geom = flatSheetGeom();
    // Rotate 90deg about X: the z=5 sheet maps to a constant-y plane, so the z
    // component spreads out and most points leave the z=5 band.
    const rotated: ScanAlignment = { ...DEFAULT_ALIGNMENT, rotX: 90 };
    const before = countAlignmentHits(geom, DEFAULT_ALIGNMENT, 'xy', 5, 0.1).hitCount;
    const after = countAlignmentHits(geom, rotated, 'xy', 5, 0.1).hitCount;
    expect(before).toBe(TOTAL);
    expect(after).toBeLessThan(before);
  });

  it('respects translation in the alignment (posZ shifts which plane is hit)', () => {
    const geom = flatSheetGeom();
    // Shift the cloud down by 5 in z so it sits at z=0; then the z=0 plane is hit.
    const shifted: ScanAlignment = { ...DEFAULT_ALIGNMENT, posZ: -5 };
    const atZero = countAlignmentHits(geom, shifted, 'xy', 0, 0.1);
    const atFive = countAlignmentHits(geom, shifted, 'xy', 5, 0.1);
    expect(atZero.hitCount).toBe(TOTAL);
    expect(atFive.hitCount).toBe(0);
  });

  it('returns zeros for an empty geometry', () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
    const res = countAlignmentHits(g, DEFAULT_ALIGNMENT, 'xy', 0, 1);
    expect(res).toEqual({ hitCount: 0, hitRatio: 0, sampleCount: 0 });
  });
});
