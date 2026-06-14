import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { convexHullGeometry, pointsFromGeometry } from '../../src/solid/convex-hull';

/** The 8 corners of a unit cube (half-edge 1, centered at origin). */
function cubeCorners(): THREE.Vector3[] {
  const c: THREE.Vector3[] = [];
  for (const x of [-1, 1]) {
    for (const y of [-1, 1]) {
      for (const z of [-1, 1]) {
        c.push(new THREE.Vector3(x, y, z));
      }
    }
  }
  return c;
}

describe('convexHullGeometry', () => {
  it('builds a hull with triangles from cube corner points', () => {
    const geom = convexHullGeometry(cubeCorners());
    const pos = geom.getAttribute('position');
    expect(pos).toBeDefined();
    // A cube hull → 12 triangles → 36 non-indexed positions.
    expect(pos.count).toBe(36);
    expect(pos.count % 3).toBe(0);
    // Normals are computed so the body shades correctly.
    expect(geom.getAttribute('normal')).toBeDefined();
  });

  it('returns an empty geometry for fewer than 4 points (cannot span volume)', () => {
    const tri = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 1, 0),
    ];
    const geom = convexHullGeometry(tri);
    expect(geom.getAttribute('position')).toBeUndefined();
  });

  it('returns an empty geometry for an empty point set', () => {
    const geom = convexHullGeometry([]);
    expect(geom.getAttribute('position')).toBeUndefined();
  });

  it('hull of a denser point cloud still wraps to the cube corners (8 extreme verts)', () => {
    // Interior + face-center points must NOT add hull faces beyond the 8 corners.
    const pts = [
      ...cubeCorners(),
      new THREE.Vector3(0, 0, 0), // interior
      new THREE.Vector3(0.5, 0, 0),
      new THREE.Vector3(0, -0.5, 0.2),
    ];
    const geom = convexHullGeometry(pts);
    // Still a cube → 12 triangles.
    expect(geom.getAttribute('position').count).toBe(36);
  });
});

describe('pointsFromGeometry', () => {
  it('extracts the 8 unique corners of a box geometry', () => {
    const box = new THREE.BoxGeometry(2, 2, 2);
    const pts = pointsFromGeometry(box);
    // BoxGeometry has 24 positions (per-face verts) but only 8 unique corners.
    expect(pts.length).toBe(8);
  });

  it('returns [] for a geometry without a position attribute', () => {
    expect(pointsFromGeometry(new THREE.BufferGeometry())).toEqual([]);
  });

  it('round-trips: hull over extracted box points matches a cube hull', () => {
    const box = new THREE.BoxGeometry(2, 2, 2);
    const hull = convexHullGeometry(pointsFromGeometry(box));
    expect(hull.getAttribute('position').count).toBe(36);
  });
});
