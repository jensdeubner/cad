import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ViewCube, type ViewCubePreset, type ViewCubeFlight } from '../src/view-cube';

// Tests target ONLY the pure static ViewCube.flightFor(preset, center, dist).
// We never construct a ViewCube (its constructor builds a WebGLRenderer + canvas
// label textures, neither of which work under jsdom). flightFor is static and
// allocates plain THREE.Vector3 values, so it is safe to call directly.

const center = new THREE.Vector3(10, 20, 30);
const dist = 100;

function flight(preset: ViewCubePreset): ViewCubeFlight {
  return ViewCube.flightFor(preset, center, dist);
}

// Offset of the camera position relative to the focus center.
function offset(preset: ViewCubePreset): THREE.Vector3 {
  return flight(preset).position.clone().sub(center);
}

describe('ViewCube.flightFor — return shape', () => {
  it('returns a fresh THREE.Vector3 for position and up', () => {
    const f = flight('top');
    expect(f.position).toBeInstanceOf(THREE.Vector3);
    expect(f.up).toBeInstanceOf(THREE.Vector3);
  });

  it('does not mutate the passed-in center vector', () => {
    const c = new THREE.Vector3(10, 20, 30);
    ViewCube.flightFor('right', c, dist);
    expect(c.x).toBe(10);
    expect(c.y).toBe(20);
    expect(c.z).toBe(30);
  });

  it('returns a position distinct from (not aliased to) the center', () => {
    const f = flight('front');
    expect(f.position).not.toBe(center);
  });
});

describe('ViewCube.flightFor — top', () => {
  it('offsets the camera along +Z by dist', () => {
    const o = offset('top');
    expect(o.x).toBeCloseTo(0, 10);
    expect(o.y).toBeCloseTo(0, 10);
    expect(o.z).toBeCloseTo(100, 10);
  });

  it('absolute position is (center.x, center.y, center.z + dist)', () => {
    const p = flight('top').position;
    expect(p.x).toBeCloseTo(10, 10);
    expect(p.y).toBeCloseTo(20, 10);
    expect(p.z).toBeCloseTo(130, 10);
  });

  it('up vector is +Y (0,1,0)', () => {
    const up = flight('top').up;
    expect(up.x).toBeCloseTo(0, 10);
    expect(up.y).toBeCloseTo(1, 10);
    expect(up.z).toBeCloseTo(0, 10);
  });

  it("planeAxis is 'xy'", () => {
    expect(flight('top').planeAxis).toBe('xy');
  });
});

describe('ViewCube.flightFor — bottom', () => {
  it('offsets the camera along -Z by dist', () => {
    const o = offset('bottom');
    expect(o.x).toBeCloseTo(0, 10);
    expect(o.y).toBeCloseTo(0, 10);
    expect(o.z).toBeCloseTo(-100, 10);
  });

  it('up vector is +Y (0,1,0)', () => {
    const up = flight('bottom').up;
    expect(up.x).toBeCloseTo(0, 10);
    expect(up.y).toBeCloseTo(1, 10);
    expect(up.z).toBeCloseTo(0, 10);
  });

  it('has no planeAxis (undefined) — only the +Z "top" face carries xy', () => {
    expect(flight('bottom').planeAxis).toBeUndefined();
  });
});

describe('ViewCube.flightFor — front', () => {
  it('offsets the camera along +Y by dist', () => {
    const o = offset('front');
    expect(o.x).toBeCloseTo(0, 10);
    expect(o.y).toBeCloseTo(100, 10);
    expect(o.z).toBeCloseTo(0, 10);
  });

  it('absolute position is (center.x, center.y + dist, center.z)', () => {
    const p = flight('front').position;
    expect(p.x).toBeCloseTo(10, 10);
    expect(p.y).toBeCloseTo(120, 10);
    expect(p.z).toBeCloseTo(30, 10);
  });

  it('up vector is +Z (0,0,1)', () => {
    const up = flight('front').up;
    expect(up.x).toBeCloseTo(0, 10);
    expect(up.y).toBeCloseTo(0, 10);
    expect(up.z).toBeCloseTo(1, 10);
  });

  it("planeAxis is 'xz'", () => {
    expect(flight('front').planeAxis).toBe('xz');
  });
});

describe('ViewCube.flightFor — back', () => {
  it('offsets the camera along -Y by dist', () => {
    const o = offset('back');
    expect(o.x).toBeCloseTo(0, 10);
    expect(o.y).toBeCloseTo(-100, 10);
    expect(o.z).toBeCloseTo(0, 10);
  });

  it('up vector is +Z (0,0,1)', () => {
    const up = flight('back').up;
    expect(up.x).toBeCloseTo(0, 10);
    expect(up.y).toBeCloseTo(0, 10);
    expect(up.z).toBeCloseTo(1, 10);
  });

  it('has no planeAxis (undefined) — only the +Y "front" face carries xz', () => {
    expect(flight('back').planeAxis).toBeUndefined();
  });
});

describe('ViewCube.flightFor — right', () => {
  it('offsets the camera along +X by dist', () => {
    const o = offset('right');
    expect(o.x).toBeCloseTo(100, 10);
    expect(o.y).toBeCloseTo(0, 10);
    expect(o.z).toBeCloseTo(0, 10);
  });

  it('absolute position is (center.x + dist, center.y, center.z)', () => {
    const p = flight('right').position;
    expect(p.x).toBeCloseTo(110, 10);
    expect(p.y).toBeCloseTo(20, 10);
    expect(p.z).toBeCloseTo(30, 10);
  });

  it('up vector is +Z (0,0,1)', () => {
    const up = flight('right').up;
    expect(up.x).toBeCloseTo(0, 10);
    expect(up.y).toBeCloseTo(0, 10);
    expect(up.z).toBeCloseTo(1, 10);
  });

  it("planeAxis is 'yz'", () => {
    expect(flight('right').planeAxis).toBe('yz');
  });
});

describe('ViewCube.flightFor — left', () => {
  it('offsets the camera along -X by dist', () => {
    const o = offset('left');
    expect(o.x).toBeCloseTo(-100, 10);
    expect(o.y).toBeCloseTo(0, 10);
    expect(o.z).toBeCloseTo(0, 10);
  });

  it('up vector is +Z (0,0,1)', () => {
    const up = flight('left').up;
    expect(up.x).toBeCloseTo(0, 10);
    expect(up.y).toBeCloseTo(0, 10);
    expect(up.z).toBeCloseTo(1, 10);
  });

  it('has no planeAxis (undefined) — only the +X "right" face carries yz', () => {
    expect(flight('left').planeAxis).toBeUndefined();
  });
});

describe('ViewCube.flightFor — opposite faces are mirror offsets', () => {
  it('top and bottom offsets negate each other', () => {
    expect(offset('top').clone().add(offset('bottom')).length()).toBeCloseTo(0, 10);
  });

  it('front and back offsets negate each other', () => {
    expect(offset('front').clone().add(offset('back')).length()).toBeCloseTo(0, 10);
  });

  it('right and left offsets negate each other', () => {
    expect(offset('right').clone().add(offset('left')).length()).toBeCloseTo(0, 10);
  });
});

describe('ViewCube.flightFor — every offset has magnitude dist along one axis', () => {
  const presets: ViewCubePreset[] = ['top', 'bottom', 'front', 'back', 'right', 'left'];
  for (const preset of presets) {
    it(`${preset} offset length equals dist (${dist})`, () => {
      expect(offset(preset).length()).toBeCloseTo(dist, 10);
    });
  }
});

describe('ViewCube.flightFor — dist scaling', () => {
  it('scales the offset linearly with dist (right preset, dist=5)', () => {
    const o = ViewCube.flightFor('right', center, 5).position.clone().sub(center);
    expect(o.x).toBeCloseTo(5, 10);
    expect(o.y).toBeCloseTo(0, 10);
    expect(o.z).toBeCloseTo(0, 10);
  });

  it('produces a zero offset when dist is 0 (top preset)', () => {
    const p = ViewCube.flightFor('top', center, 0).position;
    expect(p.x).toBeCloseTo(10, 10);
    expect(p.y).toBeCloseTo(20, 10);
    expect(p.z).toBeCloseTo(30, 10);
  });
});
