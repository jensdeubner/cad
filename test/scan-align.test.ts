import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  DEFAULT_ALIGNMENT,
  applyAlignment,
  readAlignmentFromObject,
  blendAlignmentToward,
  alignmentRemainder,
  centerGeometry,
  getWorldScanBox,
  type ScanAlignment,
} from '../src/scan-align';

describe('DEFAULT_ALIGNMENT', () => {
  it('is the all-zero alignment', () => {
    expect(DEFAULT_ALIGNMENT).toEqual({
      rotX: 0,
      rotY: 0,
      rotZ: 0,
      posX: 0,
      posY: 0,
      posZ: 0,
    });
  });

  it('has exactly the six documented keys', () => {
    expect(Object.keys(DEFAULT_ALIGNMENT).sort()).toEqual(
      ['posX', 'posY', 'posZ', 'rotX', 'rotY', 'rotZ'].sort(),
    );
  });
});

describe('applyAlignment', () => {
  it('sets object position from pos fields verbatim', () => {
    const obj = new THREE.Object3D();
    applyAlignment(obj, { rotX: 0, rotY: 0, rotZ: 0, posX: 1.5, posY: -2, posZ: 3.25 });
    expect(obj.position.x).toBe(1.5);
    expect(obj.position.y).toBe(-2);
    expect(obj.position.z).toBe(3.25);
  });

  it('converts rotation degrees to radians on the euler', () => {
    const obj = new THREE.Object3D();
    applyAlignment(obj, { rotX: 90, rotY: 180, rotZ: -45, posX: 0, posY: 0, posZ: 0 });
    expect(obj.rotation.x).toBeCloseTo(Math.PI / 2, 10);
    expect(obj.rotation.y).toBeCloseTo(Math.PI, 10);
    expect(obj.rotation.z).toBeCloseTo(-Math.PI / 4, 10);
  });

  it('sets the euler order to XYZ', () => {
    const obj = new THREE.Object3D();
    applyAlignment(obj, { rotX: 10, rotY: 20, rotZ: 30, posX: 0, posY: 0, posZ: 0 });
    expect(obj.rotation.order).toBe('XYZ');
  });

  it('updates the world matrix so translation lands in matrixWorld', () => {
    const obj = new THREE.Object3D();
    applyAlignment(obj, { rotX: 0, rotY: 0, rotZ: 0, posX: 5, posY: 6, posZ: 7 });
    const t = new THREE.Vector3();
    obj.matrixWorld.decompose(t, new THREE.Quaternion(), new THREE.Vector3());
    expect(t.x).toBeCloseTo(5, 10);
    expect(t.y).toBeCloseTo(6, 10);
    expect(t.z).toBeCloseTo(7, 10);
  });

  it('works on a THREE.Group instance', () => {
    const group = new THREE.Group();
    applyAlignment(group, { rotX: 0, rotY: 0, rotZ: 0, posX: -1, posY: -1, posZ: -1 });
    expect(group.position.toArray()).toEqual([-1, -1, -1]);
  });
});

describe('readAlignmentFromObject', () => {
  it('reads position verbatim and converts rotation radians to degrees', () => {
    const obj = new THREE.Object3D();
    obj.position.set(2, 4, 6);
    obj.rotation.set(Math.PI / 2, 0, Math.PI);
    const a = readAlignmentFromObject(obj);
    expect(a.posX).toBe(2);
    expect(a.posY).toBe(4);
    expect(a.posZ).toBe(6);
    expect(a.rotX).toBeCloseTo(90, 10);
    expect(a.rotY).toBeCloseTo(0, 10);
    expect(a.rotZ).toBeCloseTo(180, 10);
  });

  it('reports DEFAULT_ALIGNMENT for a fresh object', () => {
    const obj = new THREE.Object3D();
    expect(readAlignmentFromObject(obj)).toEqual(DEFAULT_ALIGNMENT);
  });
});

describe('applyAlignment <-> readAlignmentFromObject round-trip', () => {
  it('round-trips a simple alignment exactly', () => {
    const src: ScanAlignment = { rotX: 30, rotY: 45, rotZ: 60, posX: 1, posY: 2, posZ: 3 };
    const obj = new THREE.Object3D();
    applyAlignment(obj, src);
    const out = readAlignmentFromObject(obj);
    expect(out.posX).toBeCloseTo(src.posX, 10);
    expect(out.posY).toBeCloseTo(src.posY, 10);
    expect(out.posZ).toBeCloseTo(src.posZ, 10);
    expect(out.rotX).toBeCloseTo(src.rotX, 8);
    expect(out.rotY).toBeCloseTo(src.rotY, 8);
    expect(out.rotZ).toBeCloseTo(src.rotZ, 8);
  });

  it('round-trips negative rotations within the principal euler range', () => {
    const src: ScanAlignment = { rotX: -15, rotY: -80, rotZ: -120, posX: -4, posY: 0.5, posZ: 9 };
    const obj = new THREE.Object3D();
    applyAlignment(obj, src);
    const out = readAlignmentFromObject(obj);
    expect(out.rotX).toBeCloseTo(-15, 8);
    expect(out.rotY).toBeCloseTo(-80, 8);
    expect(out.rotZ).toBeCloseTo(-120, 8);
    expect(out.posX).toBeCloseTo(-4, 10);
  });
});

describe('alignmentRemainder', () => {
  const zero: ScanAlignment = { rotX: 0, rotY: 0, rotZ: 0, posX: 0, posY: 0, posZ: 0 };

  it('returns zero remainder when current equals target', () => {
    const r = alignmentRemainder(zero, zero);
    expect(r.rotDeg).toBeCloseTo(0, 10);
    expect(r.pos).toBeCloseTo(0, 10);
  });

  it('measures positional distance as the euclidean norm', () => {
    const target: ScanAlignment = { ...zero, posX: 3, posY: 4, posZ: 0 };
    const r = alignmentRemainder(zero, target);
    expect(r.pos).toBeCloseTo(5, 10);
    expect(r.rotDeg).toBeCloseTo(0, 10);
  });

  it('measures the geodesic rotation angle in degrees', () => {
    const target: ScanAlignment = { ...zero, rotZ: 30 };
    const r = alignmentRemainder(zero, target);
    expect(r.rotDeg).toBeCloseTo(30, 6);
  });

  it('is symmetric in rotation magnitude', () => {
    const a: ScanAlignment = { ...zero, rotX: 20 };
    const b: ScanAlignment = { ...zero, rotX: -10 };
    const r1 = alignmentRemainder(a, b);
    const r2 = alignmentRemainder(b, a);
    expect(r1.rotDeg).toBeCloseTo(r2.rotDeg, 6);
    expect(r1.rotDeg).toBeCloseTo(30, 6);
  });
});

describe('blendAlignmentToward', () => {
  const zero: ScanAlignment = { rotX: 0, rotY: 0, rotZ: 0, posX: 0, posY: 0, posZ: 0 };

  it('takes a fractional step toward the target position (posFraction default 0.45)', () => {
    // posDist = 10, step = min(10*0.45, 25) = 4.5 -> moves 4.5 along +x
    const target: ScanAlignment = { ...zero, posX: 10 };
    const out = blendAlignmentToward(zero, target);
    expect(out.posX).toBeCloseTo(4.5, 8);
    expect(out.posY).toBeCloseTo(0, 10);
    expect(out.posZ).toBeCloseTo(0, 10);
  });

  it('clamps the positional step to maxPos (default 25)', () => {
    // posDist = 100, fractional step 45 but clamped to 25
    const target: ScanAlignment = { ...zero, posX: 100 };
    const out = blendAlignmentToward(zero, target);
    expect(out.posX).toBeCloseTo(25, 8);
  });

  it('honours a custom posFraction and maxPos', () => {
    const target: ScanAlignment = { ...zero, posX: 0, posY: 8, posZ: 0 };
    const out = blendAlignmentToward(zero, target, { posFraction: 0.25, maxPos: 1 });
    // step = min(8*0.25, 1) = 1
    expect(out.posY).toBeCloseTo(1, 8);
  });

  it('rotation step is fractional and clamped by maxRotDeg (default 15)', () => {
    // full angle 60deg, rotFraction 0.4 -> 24deg, clamped to 15deg
    const target: ScanAlignment = { ...zero, rotZ: 60 };
    const out = blendAlignmentToward(zero, target);
    const rem = alignmentRemainder(out, target);
    // remaining ~ 60 - 15 = 45 deg
    expect(rem.rotDeg).toBeCloseTo(45, 4);
    expect(out.rotZ).toBeCloseTo(15, 4);
  });

  it('rotation step uses rotFraction when below maxRotDeg', () => {
    // full angle 20deg, rotFraction 0.4 -> 8deg (< maxRotDeg 15)
    const target: ScanAlignment = { ...zero, rotZ: 20 };
    const out = blendAlignmentToward(zero, target);
    expect(out.rotZ).toBeCloseTo(8, 4);
  });

  it('does not overshoot: repeated blending converges toward the target', () => {
    const target: ScanAlignment = { rotX: 0, rotY: 0, rotZ: 40, posX: 12, posY: -6, posZ: 3 };
    let cur: ScanAlignment = { ...zero };
    const start = alignmentRemainder(cur, target);
    for (let i = 0; i < 80; i++) {
      cur = blendAlignmentToward(cur, target);
    }
    const end = alignmentRemainder(cur, target);
    expect(end.rotDeg).toBeLessThan(start.rotDeg);
    expect(end.pos).toBeLessThan(start.pos);
    expect(end.rotDeg).toBeLessThan(0.5);
    expect(end.pos).toBeLessThan(0.5);
  });

  it('returns the current alignment essentially unchanged when already at target', () => {
    const at: ScanAlignment = { rotX: 5, rotY: 10, rotZ: 15, posX: 1, posY: 2, posZ: 3 };
    const out = blendAlignmentToward(at, at);
    expect(out.posX).toBeCloseTo(1, 10);
    expect(out.posY).toBeCloseTo(2, 10);
    expect(out.posZ).toBeCloseTo(3, 10);
    expect(out.rotX).toBeCloseTo(5, 6);
    expect(out.rotY).toBeCloseTo(10, 6);
    expect(out.rotZ).toBeCloseTo(15, 6);
  });

  it('each step monotonically reduces the rotation remainder', () => {
    const target: ScanAlignment = { ...zero, rotY: 90 };
    let cur: ScanAlignment = { ...zero };
    let prev = alignmentRemainder(cur, target).rotDeg;
    for (let i = 0; i < 30; i++) {
      cur = blendAlignmentToward(cur, target);
      const now = alignmentRemainder(cur, target).rotDeg;
      expect(now).toBeLessThanOrEqual(prev + 1e-6);
      prev = now;
    }
  });
});

describe('centerGeometry', () => {
  it('recenters a translated box so its bounding-box center is at the origin', () => {
    const geom = new THREE.BoxGeometry(2, 2, 2);
    geom.translate(10, 20, 30);
    centerGeometry(geom);
    geom.computeBoundingBox();
    const center = new THREE.Vector3();
    geom.boundingBox!.getCenter(center);
    expect(center.x).toBeCloseTo(0, 8);
    expect(center.y).toBeCloseTo(0, 8);
    expect(center.z).toBeCloseTo(0, 8);
  });

  it('leaves an already-centered geometry centered', () => {
    const geom = new THREE.BoxGeometry(4, 4, 4);
    centerGeometry(geom);
    const center = new THREE.Vector3();
    geom.boundingBox!.getCenter(center);
    expect(center.length()).toBeCloseTo(0, 8);
  });
});

describe('getWorldScanBox', () => {
  it('returns the world-space bounding box of a mesh, reflecting its position', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    mesh.position.set(5, 0, 0);
    mesh.updateMatrixWorld(true);
    const box = getWorldScanBox(mesh);
    const center = new THREE.Vector3();
    box.getCenter(center);
    expect(center.x).toBeCloseTo(5, 8);
    expect(box.min.x).toBeCloseTo(4, 8);
    expect(box.max.x).toBeCloseTo(6, 8);
  });
});
