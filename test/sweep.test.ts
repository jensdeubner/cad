import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { sweepProfileAlongPath, makeTorusSweep } from '../src/solid/sweep';

const tris = (g: THREE.BufferGeometry): number => {
  const idx = g.getIndex();
  return idx ? idx.count / 3 : (g.getAttribute('position')?.count ?? 0) / 3;
};

/** A mesh is closed iff every undirected edge is shared by exactly 2 triangles. */
function isWatertight(g: THREE.BufferGeometry): boolean {
  const idx = g.getIndex();
  if (!idx) return false;
  const edges = new Map<string, number>();
  const key = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`);
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i);
    const b = idx.getX(i + 1);
    const c = idx.getX(i + 2);
    for (const [u, v] of [
      [a, b],
      [b, c],
      [c, a],
    ] as const) {
      const k = key(u, v);
      edges.set(k, (edges.get(k) ?? 0) + 1);
    }
  }
  for (const count of edges.values()) if (count !== 2) return false;
  return true;
}

describe('sweepProfileAlongPath', () => {
  const square: THREE.Vector2[] = [
    new THREE.Vector2(-5, -5),
    new THREE.Vector2(5, -5),
    new THREE.Vector2(5, 5),
    new THREE.Vector2(-5, 5),
  ];
  const line: THREE.Vector3[] = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, 10),
    new THREE.Vector3(0, 0, 20),
  ];

  it('guards against too few path points', () => {
    const g = sweepProfileAlongPath(square, [new THREE.Vector3()]);
    expect(tris(g)).toBe(0);
  });

  it('guards against too few profile points', () => {
    const g = sweepProfileAlongPath([new THREE.Vector2(), new THREE.Vector2(1, 0)], line);
    expect(tris(g)).toBe(0);
  });

  it('sweeps an open path into a wall (no caps by default)', () => {
    const g = sweepProfileAlongPath(square, line);
    // 2 segments × 4 sides × 2 tris = 16
    expect(tris(g)).toBe(16);
    expect(g.getAttribute('normal')).toBeTruthy();
  });

  it('caps an open path into a closed solid', () => {
    const g = sweepProfileAlongPath(square, line, { cap: true });
    // walls (16) + 2 caps × 4 fan tris = 24
    expect(tris(g)).toBe(24);
    expect(isWatertight(g)).toBe(true);
  });

  it('does not flip the frame on a bent path', () => {
    const bent: THREE.Vector3[] = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 10),
      new THREE.Vector3(10, 0, 10),
      new THREE.Vector3(10, 0, 20),
    ];
    const g = sweepProfileAlongPath(square, bent);
    const pos = g.getAttribute('position');
    // No NaNs from a degenerate frame.
    for (let i = 0; i < pos.count; i++) {
      expect(Number.isFinite(pos.getX(i))).toBe(true);
      expect(Number.isFinite(pos.getY(i))).toBe(true);
      expect(Number.isFinite(pos.getZ(i))).toBe(true);
    }
  });
});

describe('makeTorusSweep', () => {
  it('builds a watertight torus with the expected triangle count', () => {
    const seg = 48;
    const sides = 24;
    const g = makeTorusSweep(20, 6, seg, sides);
    // closed path: seg segments × sides × 2 tris
    expect(tris(g)).toBe(seg * sides * 2);
    expect(isWatertight(g)).toBe(true);
  });

  it('respects guards via clamping to a minimum valid mesh', () => {
    const g = makeTorusSweep(20, 6, 1, 1); // clamped to 3 × 3
    expect(tris(g)).toBe(3 * 3 * 2);
    expect(isWatertight(g)).toBe(true);
  });
});
