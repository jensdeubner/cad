import { describe, it, expect } from 'vitest';
import { parseObj, SAMPLE_CUBE_OBJ } from '../../src/io/obj-import';

/** Count triangles in an (indexed) geometry. */
function triangleCount(geom: import('three').BufferGeometry): number {
  const index = geom.getIndex();
  return index ? index.count / 3 : 0;
}

describe('parseObj', () => {
  it('parses the built-in sample cube into 12 triangles', () => {
    const geom = parseObj(SAMPLE_CUBE_OBJ);
    // 8 unique vertices, 6 quad faces → 12 triangles after fan triangulation.
    expect(geom.getAttribute('position')?.count).toBe(8);
    expect(triangleCount(geom)).toBe(12);
    // computeVertexNormals ran.
    expect(geom.getAttribute('normal')).toBeTruthy();
  });

  it('fan-triangulates a quad face into two triangles', () => {
    const obj = `v 0 0 0
v 1 0 0
v 1 1 0
v 0 1 0
f 1 2 3 4`;
    const geom = parseObj(obj);
    expect(geom.getAttribute('position')?.count).toBe(4);
    expect(triangleCount(geom)).toBe(2);
    const index = geom.getIndex()!;
    // Fan from vertex 0: (0,1,2) and (0,2,3) (0-based).
    expect([
      index.getX(0), index.getX(1), index.getX(2),
      index.getX(3), index.getX(4), index.getX(5),
    ]).toEqual([0, 1, 2, 0, 2, 3]);
  });

  it('ignores normal/uv indices in face tokens (a/b/c and a//c)', () => {
    const obj = `v 0 0 0
v 1 0 0
v 0 1 0
f 1/1/1 2/2/2 3/3/3`;
    const objSlash = `v 0 0 0
v 1 0 0
v 0 1 0
f 1//1 2//2 3//3`;
    expect(triangleCount(parseObj(obj))).toBe(1);
    expect(triangleCount(parseObj(objSlash))).toBe(1);
  });

  it('supports negative (relative) vertex indices', () => {
    const obj = `v 0 0 0
v 1 0 0
v 0 1 0
f -3 -2 -1`;
    const geom = parseObj(obj);
    expect(triangleCount(geom)).toBe(1);
    const index = geom.getIndex()!;
    expect([index.getX(0), index.getX(1), index.getX(2)]).toEqual([0, 1, 2]);
  });

  it('returns an empty geometry for empty input without throwing', () => {
    const geom = parseObj('');
    expect(geom.getAttribute('position')).toBeUndefined();
    expect(geom.getIndex()).toBeNull();
  });

  it('returns an empty geometry for garbage input without throwing', () => {
    const geom = parseObj('not an obj\nrandom 1 2 3\n###');
    expect(geom.getAttribute('position')).toBeUndefined();
    expect(triangleCount(geom)).toBe(0);
  });

  it('ignores faces that reference out-of-range vertices', () => {
    const obj = `v 0 0 0
v 1 0 0
v 0 1 0
f 1 2 99`;
    // Only two valid corners → no triangle.
    expect(triangleCount(parseObj(obj))).toBe(0);
  });
});
