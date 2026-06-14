import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { rectGridCopies } from '../../src/solid/pattern-rect';

describe('rectGridCopies', () => {
  it('returns cols*rows-1 new geometries (origin cell skipped)', () => {
    const geom = new THREE.BoxGeometry(10, 10, 10);
    const copies = rectGridCopies(geom, 3, 2, 20, 30);
    expect(copies).toHaveLength(5); // 3*2 - 1
    for (const c of copies) {
      expect(c).not.toBe(geom);
      expect(c).toBeInstanceOf(THREE.BufferGeometry);
      expect(c.getAttribute('normal')).toBeTruthy();
    }
  });

  it('guards cols < 1 or rows < 1 → empty array', () => {
    const geom = new THREE.BoxGeometry(10, 10, 10);
    expect(rectGridCopies(geom, 0, 2, 20, 30)).toEqual([]);
    expect(rectGridCopies(geom, 3, 0, 20, 30)).toEqual([]);
    expect(rectGridCopies(geom, -1, -1, 20, 30)).toEqual([]);
  });

  it('1x1 grid → no copies (only the original exists)', () => {
    const geom = new THREE.BoxGeometry(10, 10, 10);
    expect(rectGridCopies(geom, 1, 1, 20, 30)).toEqual([]);
  });

  it('translates each copy by (i*dx, 0, j*dy)', () => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
    const dx = 20;
    const dy = 30;
    const copies = rectGridCopies(geom, 2, 2, dx, dy);
    // Grid cells excluding (0,0): (0,1), (1,0), (1,1).
    const offsets = copies.map((c) => {
      const p = c.getAttribute('position');
      return [p.getX(0), p.getY(0), p.getZ(0)] as const;
    });
    expect(offsets).toContainEqual([0, 0, dy]); // (i=0, j=1)
    expect(offsets).toContainEqual([dx, 0, 0]); // (i=1, j=0)
    expect(offsets).toContainEqual([dx, 0, dy]); // (i=1, j=1)
    // Y is never translated.
    for (const [, y] of offsets) expect(y).toBe(0);
  });

  it('does not mutate the source geometry', () => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute([5, 5, 5], 3));
    rectGridCopies(geom, 3, 3, 10, 10);
    const pos = geom.getAttribute('position');
    expect(pos.getX(0)).toBe(5);
    expect(pos.getY(0)).toBe(5);
    expect(pos.getZ(0)).toBe(5);
  });
});
