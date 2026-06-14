import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { relativeLuminance, gradientStops } from '../src/scene/environment';
import { createInfiniteGrid, niceGridStep } from '../src/scene/grid';

describe('environment: relativeLuminance', () => {
  it('white maps to ~1', () => {
    expect(relativeLuminance(0xffffff)).toBeCloseTo(1, 6);
  });

  it('black maps to 0', () => {
    expect(relativeLuminance(0x000000)).toBe(0);
  });

  it('mid grey 0x808080 maps to a known value just above 0.5', () => {
    // 128/255 = 0.50196..., and the coefficients sum to 1
    expect(relativeLuminance(0x808080)).toBeCloseTo(0.5019607843, 8);
  });

  it('uses Rec.709 weights (pure red channel)', () => {
    expect(relativeLuminance(0xff0000)).toBeCloseTo(0.2126, 6);
  });

  it('uses Rec.709 weights (pure green channel)', () => {
    expect(relativeLuminance(0x00ff00)).toBeCloseTo(0.7152, 6);
  });

  it('uses Rec.709 weights (pure blue channel)', () => {
    expect(relativeLuminance(0x0000ff)).toBeCloseTo(0.0722, 6);
  });
});

describe('environment: gradientStops', () => {
  it('dark background: top is brighter than bottom (top lum >= bottom lum)', () => {
    const stops = gradientStops(0x101824); // luminance ~0.09 -> dark branch
    expect(relativeLuminance(stops.top)).toBeGreaterThanOrEqual(
      relativeLuminance(stops.bottom),
    );
  });

  it('dark background: top is lifted above the base, bottom is dropped below', () => {
    const base = 0x1a1a1a;
    const stops = gradientStops(base);
    expect(relativeLuminance(stops.top)).toBeGreaterThan(relativeLuminance(base));
    expect(relativeLuminance(stops.bottom)).toBeLessThan(relativeLuminance(base));
  });

  it('dark background: pins exact derived stop colors', () => {
    // base 0x1a1a1a -> top = scaleChannels(x1.42, blueBoost 6), bottom = scaleChannels(x0.5)
    const stops = gradientStops(0x1a1a1a);
    expect(stops.top).toBe(0x25252b);
    expect(stops.bottom).toBe(0x0d0d0d);
  });

  it('light background: top luminance >= bottom luminance (gentle lift)', () => {
    const stops = gradientStops(0xf0f0f0); // luminance ~0.94 -> light branch
    expect(relativeLuminance(stops.top)).toBeGreaterThanOrEqual(
      relativeLuminance(stops.bottom),
    );
  });

  it('light background: pins exact derived stop colors', () => {
    // base 0xf0f0f0 -> top = scaleChannels(x1.05, blueBoost 4), bottom = scaleChannels(x0.86)
    const stops = gradientStops(0xf0f0f0);
    expect(stops.top).toBe(0xfcfcff);
    expect(stops.bottom).toBe(0xcecece);
  });

  it('light branch uses gentler scale FACTORS than the dark branch (relative contrast)', () => {
    // Same base under each branch: light factors (1.05 / 0.86) compress the
    // top/bottom ratio far more than the dark factors (1.42 / 0.5).
    // NOTE: in ABSOLUTE luminance the light branch can still span more (its base
    // is brighter); this asserts the RELATIVE top/bottom ratio instead.
    const base = 0x404040; // lum ~0.25 -> dark branch
    const darkStops = gradientStops(base);
    const darkRatio =
      relativeLuminance(darkStops.top) / relativeLuminance(darkStops.bottom);

    const lightBase = 0xc0c0c0; // lum ~0.75 -> light branch
    const lightStops = gradientStops(lightBase);
    const lightRatio =
      relativeLuminance(lightStops.top) / relativeLuminance(lightStops.bottom);

    expect(lightRatio).toBeLessThan(darkRatio);
  });

  it('branch boundary: 0x808080 (lum ~0.502) takes the light branch', () => {
    // luminance is >= 0.5 so dark === false -> light factors (1.05 / 0.86)
    // r,g: round(128*1.05)=134 (0x86); b: round(128*1.05+4)=138 (0x8a)
    const stops = gradientStops(0x808080);
    expect(stops.top).toBe(0x86868a);
    expect(stops.bottom).toBe(0x6e6e6e); // round(128*0.86)=110
  });
});

describe('grid: niceGridStep', () => {
  it('niceGridStep(200) === 10', () => {
    expect(niceGridStep(200)).toBe(10);
  });

  it('niceGridStep(20) === 1', () => {
    expect(niceGridStep(20)).toBe(1);
  });

  it('returns 1/2/5 * 10^n nice steps across a range', () => {
    expect(niceGridStep(2)).toBeCloseTo(0.1, 10);
    expect(niceGridStep(4)).toBeCloseTo(0.2, 10);
    expect(niceGridStep(50)).toBe(2);
    expect(niceGridStep(70)).toBe(5);
    expect(niceGridStep(90)).toBe(5);
    expect(niceGridStep(500)).toBe(20);
    expect(niceGridStep(1000)).toBe(50);
    expect(niceGridStep(5000)).toBe(200);
  });

  it('clamps sceneSize to a floor of 1 (tiny scenes collapse to 0.05)', () => {
    // Math.max(sceneSize, 1)/20 -> both 0.5 and 1 give target 0.05 -> step 0.05
    expect(niceGridStep(1)).toBeCloseTo(0.05, 10);
    expect(niceGridStep(0.5)).toBeCloseTo(0.05, 10);
    expect(niceGridStep(0)).toBeCloseTo(0.05, 10);
  });

  it('respects the normalized step boundaries (1.5 / 3.5 / 7.5)', () => {
    expect(niceGridStep(29)).toBe(1); // norm 1.45 -> 1
    expect(niceGridStep(30)).toBe(2); // norm 1.5 -> 2
    expect(niceGridStep(140)).toBe(5); // norm 7.0 -> 5
    expect(niceGridStep(150)).toBe(10); // norm 7.5 -> 10
  });
});

describe('grid: createInfiniteGrid uniforms and defaults', () => {
  it('exposes the expected uniforms on the shader material', () => {
    const grid = createInfiniteGrid();
    const u = grid.material.uniforms;
    for (const key of [
      'uCellSize',
      'uSectionSize',
      'uCellColor',
      'uSectionColor',
      'uAxisXColor',
      'uAxisZColor',
      'uFadeNear',
      'uFadeFar',
      'uCenter',
      'uOpacity',
    ]) {
      expect(u[key]).toBeDefined();
    }
    grid.dispose();
  });

  it('default scalar uniforms', () => {
    const grid = createInfiniteGrid();
    const u = grid.material.uniforms;
    expect(u.uCellSize.value).toBe(10);
    expect(u.uSectionSize.value).toBe(100);
    expect(u.uFadeNear.value).toBe(200);
    expect(u.uFadeFar.value).toBe(800);
    expect(u.uOpacity.value).toBe(1);
    grid.dispose();
  });

  it('color uniforms are THREE.Color from defaults', () => {
    const grid = createInfiniteGrid();
    const u = grid.material.uniforms;
    expect(u.uCellColor.value).toBeInstanceOf(THREE.Color);
    expect((u.uCellColor.value as THREE.Color).getHex()).toBe(0x2a3346);
    expect((u.uSectionColor.value as THREE.Color).getHex()).toBe(0x3d4a63);
    expect((u.uAxisXColor.value as THREE.Color).getHex()).toBe(0xff6b6b);
    expect((u.uAxisZColor.value as THREE.Color).getHex()).toBe(0x5a9bff);
    grid.dispose();
  });

  it('uCenter is a THREE.Vector2 at the origin by default', () => {
    const grid = createInfiniteGrid();
    const center = grid.material.uniforms.uCenter.value as THREE.Vector2;
    expect(center).toBeInstanceOf(THREE.Vector2);
    expect(center.x).toBe(0);
    expect(center.y).toBe(0);
    grid.dispose();
  });

  it('honors config overrides at construction', () => {
    const grid = createInfiniteGrid({
      cellSize: 5,
      sectionSize: 50,
      fadeNear: 100,
      fadeFar: 400,
      opacity: 0.5,
      colors: { cell: 0x123456 },
    });
    const u = grid.material.uniforms;
    expect(u.uCellSize.value).toBe(5);
    expect(u.uSectionSize.value).toBe(50);
    expect(u.uFadeNear.value).toBe(100);
    expect(u.uFadeFar.value).toBe(400);
    expect(u.uOpacity.value).toBe(0.5);
    expect((u.uCellColor.value as THREE.Color).getHex()).toBe(0x123456);
    // un-overridden colors keep defaults
    expect((u.uSectionColor.value as THREE.Color).getHex()).toBe(0x3d4a63);
    grid.dispose();
  });
});

describe('grid: createInfiniteGrid mesh', () => {
  it('mesh is a Mesh with renderOrder -1, named, not frustum culled', () => {
    const grid = createInfiniteGrid();
    expect(grid.mesh).toBeInstanceOf(THREE.Mesh);
    expect(grid.mesh.renderOrder).toBe(-1);
    expect(grid.mesh.name).toBe('infinite-grid');
    expect(grid.mesh.frustumCulled).toBe(false);
    grid.dispose();
  });

  it('geometry is rotated flat into the XZ plane (a +Z plane vertex maps to +Y... actually -Y)', () => {
    // PlaneGeometry default faces +Z; rotateX(-PI/2) sends +Z -> -Y? Pin actual.
    const grid = createInfiniteGrid();
    const geom = grid.mesh.geometry as THREE.PlaneGeometry;
    const pos = geom.getAttribute('position');
    // All vertices should now lie in the XZ plane (y ~ 0) since the flat plane is horizontal.
    let maxAbsY = 0;
    let maxAbsZ = 0;
    for (let i = 0; i < pos.count; i++) {
      maxAbsY = Math.max(maxAbsY, Math.abs(pos.getY(i)));
      maxAbsZ = Math.max(maxAbsZ, Math.abs(pos.getZ(i)));
    }
    // The plane lies flat: y is ~0 for every vertex, extent moved into z.
    expect(maxAbsY).toBeCloseTo(0, 6);
    expect(maxAbsZ).toBeCloseTo(0.5, 6);
    grid.dispose();
  });

  it('mesh scale follows fadeFar (far * 2.6) at construction', () => {
    const grid = createInfiniteGrid({ fadeFar: 800 });
    expect(grid.mesh.scale.x).toBeCloseTo(800 * 2.6, 4);
    expect(grid.mesh.scale.y).toBeCloseTo(800 * 2.6, 4);
    expect(grid.mesh.scale.z).toBeCloseTo(800 * 2.6, 4);
    grid.dispose();
  });
});

describe('grid: configure / setColors / setCenter', () => {
  it('configure updates uCellSize and uFadeFar (and rescales the mesh)', () => {
    const grid = createInfiniteGrid();
    grid.configure({ cellSize: 25, fadeFar: 1000 });
    expect(grid.material.uniforms.uCellSize.value).toBe(25);
    expect(grid.material.uniforms.uFadeFar.value).toBe(1000);
    expect(grid.mesh.scale.x).toBeCloseTo(1000 * 2.6, 4);
    grid.dispose();
  });

  it('configure leaves unspecified fields untouched', () => {
    const grid = createInfiniteGrid();
    grid.configure({ cellSize: 7 });
    expect(grid.material.uniforms.uCellSize.value).toBe(7);
    // sectionSize untouched
    expect(grid.material.uniforms.uSectionSize.value).toBe(100);
    grid.dispose();
  });

  it('configure with nested colors delegates to setColors', () => {
    const grid = createInfiniteGrid();
    grid.configure({ colors: { section: 0xabcdef } });
    expect((grid.material.uniforms.uSectionColor.value as THREE.Color).getHex()).toBe(
      0xabcdef,
    );
    grid.dispose();
  });

  it('setColors mutates the existing THREE.Color uniform instances in place', () => {
    const grid = createInfiniteGrid();
    const before = grid.material.uniforms.uCellColor.value as THREE.Color;
    grid.setColors({ cell: 0x010203, axisX: 0x040506 });
    const after = grid.material.uniforms.uCellColor.value as THREE.Color;
    expect(after).toBe(before); // same Color object, mutated via setHex
    expect(after.getHex()).toBe(0x010203);
    expect((grid.material.uniforms.uAxisXColor.value as THREE.Color).getHex()).toBe(
      0x040506,
    );
    grid.dispose();
  });

  it('setColors only changes provided channels', () => {
    const grid = createInfiniteGrid();
    grid.setColors({ axisZ: 0x111111 });
    expect((grid.material.uniforms.uAxisZColor.value as THREE.Color).getHex()).toBe(
      0x111111,
    );
    // others stay at defaults
    expect((grid.material.uniforms.uCellColor.value as THREE.Color).getHex()).toBe(
      0x2a3346,
    );
    grid.dispose();
  });

  it('setCenter updates the uCenter Vector2 in place', () => {
    const grid = createInfiniteGrid();
    const center = grid.material.uniforms.uCenter.value as THREE.Vector2;
    grid.setCenter(12, -34);
    expect(grid.material.uniforms.uCenter.value).toBe(center); // mutated, same instance
    expect(center.x).toBe(12);
    expect(center.y).toBe(-34);
    grid.dispose();
  });

  it('setOpacity updates uOpacity', () => {
    const grid = createInfiniteGrid();
    grid.setOpacity(0.25);
    expect(grid.material.uniforms.uOpacity.value).toBe(0.25);
    grid.dispose();
  });
});
