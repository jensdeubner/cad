import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  brightenColor,
  applyHeightColors,
  applyNormalColors,
  SCAN_THEMES,
  studioGridColors,
  envIntensityFor,
  makeScanSolidMaterial,
  type ScanDisplayMode,
  type ScanTheme,
} from '../src/scan-visual';

describe('brightenColor', () => {
  it('is identity when amount is 1', () => {
    expect(brightenColor(0x123456, 1)).toBe(0x123456);
    expect(brightenColor(0xffffff, 1)).toBe(0xffffff);
    expect(brightenColor(0x000000, 1)).toBe(0x000000);
  });

  it('scales each channel independently and rounds', () => {
    // r=0x10=16, g=0x20=32, b=0x40=64; *2 -> 32,64,128 = 0x204080
    expect(brightenColor(0x102040, 2)).toBe(0x204080);
  });

  it('clamps channels at 255 (0xff)', () => {
    // 0x80=128 *4 = 512 -> clamped to 255 = 0xff for every channel
    expect(brightenColor(0x808080, 4)).toBe(0xffffff);
  });

  it('clamps only the channels that overflow', () => {
    // r=0x80=128*4=512->255 ; g=0x10=16*4=64 ; b=0x04=4*4=16
    expect(brightenColor(0x801004, 4)).toBe((255 << 16) | (64 << 8) | 16);
  });

  it('rounds fractional results (Math.round)', () => {
    // r=0x0a=10 *1.05 = 10.5 -> round 11 ; g=0=0 ; b=0
    expect(brightenColor(0x0a0000, 1.05)).toBe(11 << 16);
    // 10 * 1.04 = 10.4 -> round 10
    expect(brightenColor(0x0a0000, 1.04)).toBe(10 << 16);
  });

  it('drops channels to 0 when amount is 0', () => {
    expect(brightenColor(0xabcdef, 0)).toBe(0);
  });
});

describe('applyHeightColors', () => {
  it('sets a color BufferAttribute of length 3*vertexCount with values in [0,1]', () => {
    const geom = new THREE.BufferGeometry();
    // 3 vertices
    const positions = new Float32Array([
      0, 0, 0,
      1, 2, 4,
      0.5, 1, 2,
    ]);
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const box = new THREE.Box3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 2, 4),
    );

    applyHeightColors(geom, box);

    const color = geom.attributes.color;
    expect(color).toBeDefined();
    expect(color.itemSize).toBe(3);
    expect(color.count).toBe(3);
    expect((color.array as Float32Array).length).toBe(9);
    for (const v of color.array as Float32Array) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('maps min corner to the channel offsets and max corner to offset+span', () => {
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array([
      0, 0, 0, // min corner
      1, 2, 4, // max corner
    ]);
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const box = new THREE.Box3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 2, 4),
    );

    applyHeightColors(geom, box);
    const arr = geom.attributes.color.array as Float32Array;

    // min corner -> normalized (0,0,0) -> base offsets
    expect(arr[0]).toBeCloseTo(0.25, 6);
    expect(arr[1]).toBeCloseTo(0.2, 6);
    expect(arr[2]).toBeCloseTo(0.35, 6);
    // max corner -> normalized (1,1,1) -> offset + span
    expect(arr[3]).toBeCloseTo(0.25 + 0.75, 6); // 1.0
    expect(arr[4]).toBeCloseTo(0.2 + 0.7, 6); // 0.9
    expect(arr[5]).toBeCloseTo(0.35 + 0.65, 6); // 1.0
  });

  it('guards against a zero-extent box (range falls back to 1)', () => {
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array([0, 0, 0]);
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    // degenerate box: min == max, so rx=ry=rz fall back to 1
    const box = new THREE.Box3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 0),
    );

    applyHeightColors(geom, box);
    const arr = geom.attributes.color.array as Float32Array;
    expect(arr[0]).toBeCloseTo(0.25, 6);
    expect(arr[1]).toBeCloseTo(0.2, 6);
    expect(arr[2]).toBeCloseTo(0.35, 6);
  });
});

describe('applyNormalColors', () => {
  it('sets a color BufferAttribute of length 3*vertexCount with values in [0,1]', () => {
    const geom = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
    applyNormalColors(geom);

    const color = geom.attributes.color;
    const normalCount = geom.attributes.normal.count;
    expect(color).toBeDefined();
    expect(color.itemSize).toBe(3);
    expect(color.count).toBe(normalCount);
    expect((color.array as Float32Array).length).toBe(normalCount * 3);
    for (const v of color.array as Float32Array) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('maps a normal of (1,0,0) to (1,0.5,0.5)', () => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3));
    // provide a normal directly so we skip computeVertexNormals
    geom.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([1, 0, 0]), 3));

    applyNormalColors(geom);
    const arr = geom.attributes.color.array as Float32Array;
    expect(arr[0]).toBeCloseTo(1, 6); // 1*0.5+0.5
    expect(arr[1]).toBeCloseTo(0.5, 6); // 0*0.5+0.5
    expect(arr[2]).toBeCloseTo(0.5, 6);
  });

  it('maps a normal of (-1,-1,-1) to (0,0,0)', () => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3));
    geom.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([-1, -1, -1]), 3));

    applyNormalColors(geom);
    const arr = geom.attributes.color.array as Float32Array;
    expect(arr[0]).toBeCloseTo(0, 6);
    expect(arr[1]).toBeCloseTo(0, 6);
    expect(arr[2]).toBeCloseTo(0, 6);
  });

  it('computes vertex normals when none are present (does not throw)', () => {
    const geom = new THREE.BufferGeometry();
    // a single triangle, no normals supplied
    geom.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3),
    );
    expect(geom.attributes.normal).toBeUndefined();
    applyNormalColors(geom);
    expect(geom.attributes.normal).toBeDefined();
    expect(geom.attributes.color.count).toBe(3);
  });
});

describe('SCAN_THEMES', () => {
  const modes: ScanDisplayMode[] = ['cad', 'kontrast', 'punkte', 'flaeche', 'dunkel'];

  it('has exactly the 5 display modes', () => {
    expect(Object.keys(SCAN_THEMES).sort()).toEqual([...modes].sort());
  });

  it.each(modes)('theme "%s" has all required numeric fields', (mode) => {
    const t = SCAN_THEMES[mode];
    const requiredNumbers: (keyof ScanTheme)[] = [
      'background',
      'solidColor',
      'solidOpacity',
      'edgeColor',
      'edgeOpacity',
      'edgeThreshold',
      'pointOpacity',
      'ambient',
      'hemiSky',
      'hemiGround',
      'hemiIntensity',
      'dirIntensity',
      'fillIntensity',
      'toneExposure',
    ];
    for (const key of requiredNumbers) {
      expect(typeof t[key]).toBe('number');
    }
    // grid is a [number, number] pair
    expect(Array.isArray(t.grid)).toBe(true);
    expect(t.grid).toHaveLength(2);
    expect(typeof t.grid[0]).toBe('number');
    expect(typeof t.grid[1]).toBe('number');
  });

  it('flags shadedSurface on cad/punkte/flaeche but not kontrast/dunkel', () => {
    expect(SCAN_THEMES.cad.shadedSurface).toBe(true);
    expect(SCAN_THEMES.punkte.shadedSurface).toBe(true);
    expect(SCAN_THEMES.flaeche.shadedSurface).toBe(true);
    expect(SCAN_THEMES.kontrast.shadedSurface).toBeUndefined();
    expect(SCAN_THEMES.dunkel.shadedSurface).toBeUndefined();
  });

  it('only cad and dunkel define explicit axis colors and envIntensity', () => {
    expect(SCAN_THEMES.cad.axisX).toBe(0xff6b6b);
    expect(SCAN_THEMES.cad.axisZ).toBe(0x5a9bff);
    expect(SCAN_THEMES.cad.envIntensity).toBeCloseTo(1.05, 6);
    expect(SCAN_THEMES.dunkel.axisX).toBe(0xff7a7a);
    expect(SCAN_THEMES.dunkel.axisZ).toBe(0x6ec8ff);
    expect(SCAN_THEMES.dunkel.envIntensity).toBeCloseTo(0.85, 6);
    expect(SCAN_THEMES.kontrast.axisX).toBeUndefined();
    expect(SCAN_THEMES.kontrast.envIntensity).toBeUndefined();
  });
});

describe('studioGridColors', () => {
  it('maps cell=grid[1], section=grid[0]', () => {
    const c = studioGridColors(SCAN_THEMES.cad);
    expect(c.cell).toBe(SCAN_THEMES.cad.grid[1]);
    expect(c.section).toBe(SCAN_THEMES.cad.grid[0]);
  });

  it('uses theme axis colors when present', () => {
    const c = studioGridColors(SCAN_THEMES.cad);
    expect(c.axisX).toBe(0xff6b6b);
    expect(c.axisZ).toBe(0x5a9bff);
  });

  it('falls back to default axis colors when theme omits them', () => {
    // kontrast has no axisX/axisZ -> defaults
    const c = studioGridColors(SCAN_THEMES.kontrast);
    expect(c.axisX).toBe(0xff6b6b);
    expect(c.axisZ).toBe(0x5a9bff);
    expect(c.cell).toBe(SCAN_THEMES.kontrast.grid[1]);
    expect(c.section).toBe(SCAN_THEMES.kontrast.grid[0]);
  });
});

describe('envIntensityFor', () => {
  it('returns the explicit envIntensity when set', () => {
    expect(envIntensityFor(SCAN_THEMES.cad)).toBeCloseTo(1.05, 6);
    expect(envIntensityFor(SCAN_THEMES.dunkel)).toBeCloseTo(0.85, 6);
  });

  it('defaults to 1 when envIntensity is absent', () => {
    expect(envIntensityFor(SCAN_THEMES.kontrast)).toBe(1);
    expect(envIntensityFor(SCAN_THEMES.punkte)).toBe(1);
    expect(envIntensityFor(SCAN_THEMES.flaeche)).toBe(1);
  });
});

describe('makeScanSolidMaterial', () => {
  it('returns a MeshStandardMaterial when theme.shadedSurface is true', () => {
    const planes = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)];
    const mat = makeScanSolidMaterial(SCAN_THEMES.cad, 0x112233, 0.5, true, planes);
    expect(mat).toBeInstanceOf(THREE.MeshStandardMaterial);
    const std = mat as THREE.MeshStandardMaterial;
    expect(std.color.getHex()).toBe(0x112233);
    expect(std.vertexColors).toBe(true);
    expect(std.side).toBe(THREE.DoubleSide);
    expect(std.clippingPlanes).toBe(planes);
    expect(std.roughness).toBeCloseTo(0.62, 6);
    expect(std.metalness).toBeCloseTo(0.04, 6);
    // envMapIntensity wired from envIntensityFor(theme)
    expect(std.envMapIntensity).toBeCloseTo(1.05, 6);
  });

  it('returns a MeshBasicMaterial when theme.shadedSurface is falsy', () => {
    const planes: THREE.Plane[] = [];
    const mat = makeScanSolidMaterial(SCAN_THEMES.kontrast, 0xabcdef, 1, false, planes);
    expect(mat).toBeInstanceOf(THREE.MeshBasicMaterial);
    const basic = mat as THREE.MeshBasicMaterial;
    expect(basic.color.getHex()).toBe(0xabcdef);
    expect(basic.vertexColors).toBe(false);
    expect(basic.side).toBe(THREE.DoubleSide);
    expect(basic.clippingPlanes).toBe(planes);
  });

  it('is transparent when opacity < 0.98 and opaque (not transparent) at >= 0.98', () => {
    const planes: THREE.Plane[] = [];
    const transp = makeScanSolidMaterial(SCAN_THEMES.cad, 0x000000, 0.5, false, planes);
    expect(transp.transparent).toBe(true);
    expect(transp.opacity).toBeCloseTo(0.5, 6);

    const opaque = makeScanSolidMaterial(SCAN_THEMES.cad, 0x000000, 0.98, false, planes);
    expect(opaque.transparent).toBe(false);
    expect(opaque.opacity).toBeCloseTo(0.98, 6);

    const fully = makeScanSolidMaterial(SCAN_THEMES.cad, 0x000000, 1, false, planes);
    expect(fully.transparent).toBe(false);
  });

  it('standard material depthWrite: true when opaque or opacity > 0.45', () => {
    const planes: THREE.Plane[] = [];
    // opacity 0.5 > 0.45 -> depthWrite true (and transparent)
    const a = makeScanSolidMaterial(SCAN_THEMES.cad, 0x000000, 0.5, false, planes);
    expect(a.depthWrite).toBe(true);
    // opacity 0.4 <= 0.45 and not opaque -> depthWrite false
    const b = makeScanSolidMaterial(SCAN_THEMES.cad, 0x000000, 0.4, false, planes);
    expect(b.depthWrite).toBe(false);
    // opacity 0.45 exactly -> not > 0.45, not opaque -> false
    const c = makeScanSolidMaterial(SCAN_THEMES.cad, 0x000000, 0.45, false, planes);
    expect(c.depthWrite).toBe(false);
  });

  it('basic material depthWrite: true when opaque or opacity > 0.5', () => {
    const planes: THREE.Plane[] = [];
    // opacity 0.6 > 0.5 -> true
    const a = makeScanSolidMaterial(SCAN_THEMES.kontrast, 0x000000, 0.6, false, planes);
    expect(a.depthWrite).toBe(true);
    // opacity 0.5 exactly -> not > 0.5, not opaque -> false
    const b = makeScanSolidMaterial(SCAN_THEMES.kontrast, 0x000000, 0.5, false, planes);
    expect(b.depthWrite).toBe(false);
    // opacity 0.55 (theme's own solidOpacity) -> true
    const c = makeScanSolidMaterial(SCAN_THEMES.kontrast, 0x000000, 0.55, false, planes);
    expect(c.depthWrite).toBe(true);
  });
});
