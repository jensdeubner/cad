import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { cutAbovePlaneZ } from '../../src/solid/plane-cut';

/**
 * `cutAbovePlaneZ` keeps only the part of a mesh on the +Z side of `z = planeZ`.
 * A cube cut through its center must lose its lower half: the result's min Z
 * lands exactly on the plane, all vertices stay finite, and at least one
 * triangle survives. Empty/degenerate inputs must not throw or emit NaN.
 */
function triCount(geom: THREE.BufferGeometry): number {
  const index = geom.getIndex();
  if (index) return index.count / 3;
  const pos = geom.getAttribute('position');
  return pos ? pos.count / 3 : 0;
}

function allFinite(geom: THREE.BufferGeometry): boolean {
  const arr = geom.getAttribute('position')?.array as ArrayLike<number> | undefined;
  if (!arr) return true;
  for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) return false;
  return true;
}

describe('cutAbovePlaneZ', () => {
  it('cuts a centered cube in half — min Z = planeZ, tris > 0', () => {
    // 20mm cube spanning z -10..10, like primitive-box.
    const cube = new THREE.BoxGeometry(20, 20, 20);
    const planeZ = 0;
    const cut = cutAbovePlaneZ(cube, planeZ);

    expect(triCount(cut)).toBeGreaterThan(0);
    expect(allFinite(cut)).toBe(true);

    cut.computeBoundingBox();
    const box = cut.boundingBox!;
    expect(box.min.z).toBeCloseTo(planeZ, 5);
    expect(box.max.z).toBeCloseTo(10, 5);
    // X/Y span is untouched by a Z cut.
    expect(box.min.x).toBeCloseTo(-10, 5);
    expect(box.max.x).toBeCloseTo(10, 5);
  });

  it('keeps a wholly-above mesh verbatim and drops a wholly-below one', () => {
    const cube = new THREE.BoxGeometry(20, 20, 20); // z -10..10
    const fullTris = triCount(cube);

    // Plane below the cube → everything kept.
    const above = cutAbovePlaneZ(cube, -50);
    expect(triCount(above)).toBe(fullTris);

    // Plane above the cube → nothing kept.
    const below = cutAbovePlaneZ(cube, 50);
    expect(triCount(below)).toBe(0);
    expect(allFinite(below)).toBe(true);
  });

  it('handles a non-centered cut plane', () => {
    const cube = new THREE.BoxGeometry(20, 20, 20); // z -10..10
    const planeZ = 5;
    const cut = cutAbovePlaneZ(cube, planeZ);

    expect(triCount(cut)).toBeGreaterThan(0);
    cut.computeBoundingBox();
    expect(cut.boundingBox!.min.z).toBeCloseTo(planeZ, 5);
    expect(cut.boundingBox!.max.z).toBeCloseTo(10, 5);
  });

  it('returns an empty geometry for empty input without throwing', () => {
    const empty = new THREE.BufferGeometry();
    empty.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
    let cut!: THREE.BufferGeometry;
    expect(() => {
      cut = cutAbovePlaneZ(empty, 0);
    }).not.toThrow();
    expect(triCount(cut)).toBe(0);
    expect(allFinite(cut)).toBe(true);
  });

  it('tolerates a NaN plane without producing NaN output', () => {
    const cube = new THREE.BoxGeometry(20, 20, 20);
    const cut = cutAbovePlaneZ(cube, Number.NaN);
    expect(triCount(cut)).toBe(0);
    expect(allFinite(cut)).toBe(true);
  });
});
