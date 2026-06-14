import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { brightenColor, SCAN_THEMES } from '../src/scan-visual';

describe('test harness smoke', () => {
  it('can import three and do vector math', () => {
    const v = new THREE.Vector3(3, 4, 0);
    expect(v.length()).toBe(5);
  });

  it('can import a src module (scan-visual)', () => {
    // 0x80 * 2 = 256 -> clamped to 255 on every channel
    expect(brightenColor(0x808080, 2)).toBe(0xffffff);
    // identity scale keeps the colour
    expect(brightenColor(0x102030, 1)).toBe(0x102030);
  });

  it('SCAN_THEMES exposes the documented display modes', () => {
    expect(Object.keys(SCAN_THEMES).sort()).toEqual(
      ['cad', 'dunkel', 'flaeche', 'kontrast', 'punkte'].sort(),
    );
  });
});
