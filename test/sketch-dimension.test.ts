import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  sketchLengthMm,
  formatSketchLength,
  formatSketchDimInputLabel,
  parseUserDimensionValue,
  dimensionDisplayMm,
  measuredMmForDisplay,
  circleCenter2D,
  applyDimensionValueToContour,
  cloneSketchDimension,
  sketchEdgeKey,
  sketchEdgesEqual,
  SKETCH_UNIT_LABELS,
  type SketchUnit,
  type SketchDimensionKind,
  type SketchDimension,
} from '../src/sketch-dimension';
import type { Contour } from '../src/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a closed circle contour on the xy plane (z=0).
 * On the xy frame projectToSketch2D(p) = [p.x, p.y], so a point at (x, y, 0)
 * lives at UV (x, y) with center at (cx, cy). */
function makeCircleContour(
  cx: number,
  cy: number,
  r: number,
  n = 16,
  overrides: Partial<Contour> = {},
): Contour {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    points.push(new THREE.Vector3(cx + r * Math.cos(t), cy + r * Math.sin(t), 0));
  }
  return {
    id: 'c1',
    componentId: 'comp1',
    sketchId: 's1',
    axis: 'xy',
    position: 0,
    points,
    closed: true,
    color: '#fff',
    visible: true,
    ...overrides,
  };
}

function makeLineContour(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  overrides: Partial<Contour> = {},
): Contour {
  return {
    id: 'line1',
    componentId: 'comp1',
    sketchId: 's1',
    axis: 'xy',
    position: 0,
    points: [new THREE.Vector3(ax, ay, 0), new THREE.Vector3(bx, by, 0)],
    closed: false,
    color: '#fff',
    visible: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// sketchLengthMm
// ---------------------------------------------------------------------------

describe('sketchLengthMm', () => {
  it('returns euclidean distance between two points', () => {
    const a = new THREE.Vector3(0, 0, 0);
    const b = new THREE.Vector3(3, 4, 0);
    expect(sketchLengthMm(a, b)).toBeCloseTo(5, 10);
  });

  it('returns 0 for coincident points', () => {
    const a = new THREE.Vector3(1, 2, 3);
    expect(sketchLengthMm(a, a.clone())).toBe(0);
  });

  it('works in 3D', () => {
    const a = new THREE.Vector3(0, 0, 0);
    const b = new THREE.Vector3(2, 3, 6);
    expect(sketchLengthMm(a, b)).toBeCloseTo(7, 10); // sqrt(4+9+36)=7
  });
});

// ---------------------------------------------------------------------------
// dimensionDisplayMm / measuredMmForDisplay  (the "display doubling" for diameter)
// ---------------------------------------------------------------------------

describe('dimensionDisplayMm', () => {
  it('doubles the measured value for diameter (measured = radius)', () => {
    expect(dimensionDisplayMm(10, 'diameter')).toBe(20);
  });
  it('passes through for linear', () => {
    expect(dimensionDisplayMm(10, 'linear')).toBe(10);
  });
  it('passes through for radius', () => {
    expect(dimensionDisplayMm(10, 'radius')).toBe(10);
  });
});

describe('measuredMmForDisplay', () => {
  it('halves the display value for diameter', () => {
    expect(measuredMmForDisplay(20, 'diameter')).toBe(10);
  });
  it('passes through for linear', () => {
    expect(measuredMmForDisplay(10, 'linear')).toBe(10);
  });
  it('passes through for radius', () => {
    expect(measuredMmForDisplay(10, 'radius')).toBe(10);
  });
  it('is the inverse of dimensionDisplayMm for diameter', () => {
    expect(measuredMmForDisplay(dimensionDisplayMm(7.5, 'diameter'), 'diameter')).toBeCloseTo(
      7.5,
      10,
    );
  });
});

// ---------------------------------------------------------------------------
// formatSketchLength  (unit conversion + formatting + kind prefix)
// ---------------------------------------------------------------------------

describe('formatSketchLength - linear unit conversion & decimals', () => {
  it('mm: 1 decimal, " mm" suffix, no prefix', () => {
    expect(formatSketchLength(12.34, 'mm', 'linear')).toBe('12.3 mm');
  });
  it('mm rounds half up at 1 decimal', () => {
    expect(formatSketchLength(12.35, 'mm', 'linear')).toBe('12.3 mm'); // toFixed banker-ish; pin actual
  });
  it('cm: divides by 10, 2 decimals', () => {
    expect(formatSketchLength(123.456, 'cm', 'linear')).toBe('12.35 cm');
  });
  it('m: divides by 1000, 3 decimals', () => {
    // 1234.5 / 1000 = 1.2345; toFixed(3) on the binary float yields '1.234' (not '1.235')
    expect(formatSketchLength(1234.5, 'm', 'linear')).toBe('1.234 m');
  });
  it('in: divides by 25.4, 1 decimal, " in" suffix', () => {
    // 25.4mm -> 1.0 in
    expect(formatSketchLength(25.4, 'in', 'linear')).toBe('1.0 in');
  });
  it('in: 50.8mm -> 2.0 in', () => {
    expect(formatSketchLength(50.8, 'in', 'linear')).toBe('2.0 in');
  });
});

describe('formatSketchLength - radius/diameter prefixes', () => {
  it('radius adds "R " prefix and does NOT double the value', () => {
    expect(formatSketchLength(10, 'mm', 'radius')).toBe('R 10.0 mm');
  });
  it('diameter adds "Ø " prefix AND doubles the measured value', () => {
    // measured radius 10mm -> displayed diameter 20.0mm
    expect(formatSketchLength(10, 'mm', 'diameter')).toBe('Ø 20.0 mm');
  });
  it('diameter doubling combines with cm conversion', () => {
    // measured 50mm radius -> 100mm diameter -> 10.00 cm
    expect(formatSketchLength(50, 'cm', 'diameter')).toBe('Ø 10.00 cm');
  });
  it('radius in inches', () => {
    // 25.4mm radius -> 1.0 in, with R prefix
    expect(formatSketchLength(25.4, 'in', 'radius')).toBe('R 1.0 in');
  });
});

// ---------------------------------------------------------------------------
// formatSketchDimInputLabel  (formatting a typed raw string)
// ---------------------------------------------------------------------------

describe('formatSketchDimInputLabel', () => {
  it('returns null for blank input', () => {
    expect(formatSketchDimInputLabel('   ', 'mm', 'linear')).toBeNull();
  });
  it('returns null for empty string', () => {
    expect(formatSketchDimInputLabel('', 'mm', 'linear')).toBeNull();
  });
  it('trims and keeps raw value, appends unit suffix (linear)', () => {
    expect(formatSketchDimInputLabel('  42  ', 'mm', 'linear')).toBe('42 mm');
  });
  it('replaces a comma decimal with a dot', () => {
    expect(formatSketchDimInputLabel('3,5', 'cm', 'linear')).toBe('3.5 cm');
  });
  it('uses " in" suffix for inches', () => {
    expect(formatSketchDimInputLabel('2', 'in', 'linear')).toBe('2 in');
  });
  it('adds R prefix for radius', () => {
    expect(formatSketchDimInputLabel('5', 'mm', 'radius')).toBe('R 5 mm');
  });
  it('adds Ø prefix for diameter and does NOT transform the number', () => {
    // formatting helper keeps the typed value verbatim (no doubling)
    expect(formatSketchDimInputLabel('20', 'mm', 'diameter')).toBe('Ø 20 mm');
  });
});

// ---------------------------------------------------------------------------
// parseUserDimensionValue  (typed value -> mm)
// ---------------------------------------------------------------------------

describe('parseUserDimensionValue', () => {
  it('mm passes through (factor 1)', () => {
    expect(parseUserDimensionValue('10', 'mm')).toBeCloseTo(10, 10);
  });
  it('cm multiplies by 10', () => {
    expect(parseUserDimensionValue('1.5', 'cm')).toBeCloseTo(15, 10);
  });
  it('m multiplies by 1000', () => {
    expect(parseUserDimensionValue('2', 'm')).toBeCloseTo(2000, 10);
  });
  it('in multiplies by 25.4', () => {
    expect(parseUserDimensionValue('1', 'in')).toBeCloseTo(25.4, 10);
  });
  it('accepts comma as decimal separator', () => {
    expect(parseUserDimensionValue('3,5', 'cm')).toBeCloseTo(35, 10);
  });
  it('trims surrounding whitespace', () => {
    expect(parseUserDimensionValue('  7  ', 'mm')).toBeCloseTo(7, 10);
  });
  it('returns null for blank', () => {
    expect(parseUserDimensionValue('   ', 'mm')).toBeNull();
  });
  it('returns null for empty', () => {
    expect(parseUserDimensionValue('', 'mm')).toBeNull();
  });
  it('returns null for zero (must be > 0)', () => {
    expect(parseUserDimensionValue('0', 'mm')).toBeNull();
  });
  it('returns null for negative values', () => {
    expect(parseUserDimensionValue('-5', 'mm')).toBeNull();
  });
  it('returns null for non-numeric input', () => {
    expect(parseUserDimensionValue('abc', 'mm')).toBeNull();
  });
  it('parseFloat tolerates trailing garbage', () => {
    // parseFloat('12px') -> 12, then * factor
    expect(parseUserDimensionValue('12px', 'mm')).toBeCloseTo(12, 10);
  });
  it('does NOT undo the diameter doubling (kind-agnostic, raw -> mm)', () => {
    // parseUserDimensionValue has no kind param; it returns the raw mm value.
    expect(parseUserDimensionValue('20', 'mm')).toBeCloseTo(20, 10);
  });
});

// ---------------------------------------------------------------------------
// round-trip parse <-> measured for diameter
// ---------------------------------------------------------------------------

describe('parse + measuredMmForDisplay round trip (diameter)', () => {
  it('typed diameter 20mm -> measured radius 10mm', () => {
    const displayMm = parseUserDimensionValue('20', 'mm')!;
    expect(measuredMmForDisplay(displayMm, 'diameter')).toBeCloseTo(10, 10);
  });
});

// ---------------------------------------------------------------------------
// circleCenter2D
// ---------------------------------------------------------------------------

describe('circleCenter2D', () => {
  it('returns null for an open contour', () => {
    const c = makeCircleContour(0, 0, 10, 16, { closed: false });
    expect(circleCenter2D(c)).toBeNull();
  });

  it('returns null when fewer than 8 points', () => {
    const c = makeCircleContour(0, 0, 10, 6); // 6 < 8
    expect(circleCenter2D(c)).toBeNull();
  });

  it('detects center and radius of a circle on xy plane', () => {
    const c = makeCircleContour(5, 7, 12, 24);
    const res = circleCenter2D(c);
    expect(res).not.toBeNull();
    expect(res!.center.x).toBeCloseTo(5, 6);
    expect(res!.center.y).toBeCloseTo(7, 6);
    expect(res!.center.z).toBeCloseTo(0, 6);
    expect(res!.radiusMm).toBeCloseTo(12, 6);
  });

  it('returns null when average radius is ~0 (all points coincident at center)', () => {
    const pts = Array.from({ length: 12 }, () => new THREE.Vector3(3, 3, 0));
    const c = makeCircleContour(0, 0, 1, 12, { points: pts });
    expect(circleCenter2D(c)).toBeNull();
  });

  it('returns null for a square (deviation > 10%)', () => {
    // 8 points roughly along a square outline -> not circular enough
    const pts = [
      new THREE.Vector3(-10, -10, 0),
      new THREE.Vector3(0, -10, 0),
      new THREE.Vector3(10, -10, 0),
      new THREE.Vector3(10, 0, 0),
      new THREE.Vector3(10, 10, 0),
      new THREE.Vector3(0, 10, 0),
      new THREE.Vector3(-10, 10, 0),
      new THREE.Vector3(-10, 0, 0),
    ];
    const c = makeCircleContour(0, 0, 1, 8, { points: pts });
    expect(circleCenter2D(c)).toBeNull();
  });

  it('center lifted onto plane position for non-zero xy position', () => {
    // For xy axis, sketch2DToWorld(u,v) = (u, v, position)
    const c = makeCircleContour(2, 3, 8, 20, { position: 4 });
    // points must lie on the plane z=position to project cleanly
    c.points = c.points.map((p) => new THREE.Vector3(p.x, p.y, 4));
    const res = circleCenter2D(c);
    expect(res).not.toBeNull();
    expect(res!.center.x).toBeCloseTo(2, 6);
    expect(res!.center.y).toBeCloseTo(3, 6);
    expect(res!.center.z).toBeCloseTo(4, 6);
    expect(res!.radiusMm).toBeCloseTo(8, 6);
  });
});

// ---------------------------------------------------------------------------
// applyDimensionValueToContour
// ---------------------------------------------------------------------------

describe('applyDimensionValueToContour - linear', () => {
  it('scales the segment so endpoint distance equals the target', () => {
    const c = makeLineContour(0, 0, 10, 0); // length 10 along +x
    const ok = applyDimensionValueToContour(
      c,
      { pointIndex0: 0, pointIndex1: 1, a: c.points[0], b: c.points[1], kind: 'linear' },
      25,
    );
    expect(ok).toBe(true);
    // point 0 stays put, point 1 moves along the original direction
    expect(c.points[0].x).toBeCloseTo(0, 6);
    expect(c.points[0].y).toBeCloseTo(0, 6);
    expect(c.points[1].x).toBeCloseTo(25, 6);
    expect(c.points[1].y).toBeCloseTo(0, 6);
    expect(c.points[0].distanceTo(c.points[1])).toBeCloseTo(25, 6);
  });

  it('preserves direction when shrinking a diagonal segment', () => {
    const c = makeLineContour(0, 0, 3, 4); // length 5, dir (0.6,0.8)
    const ok = applyDimensionValueToContour(
      c,
      { pointIndex0: 0, pointIndex1: 1, a: c.points[0], b: c.points[1], kind: 'linear' },
      10,
    );
    expect(ok).toBe(true);
    expect(c.points[1].x).toBeCloseTo(6, 6); // 0.6 * 10
    expect(c.points[1].y).toBeCloseTo(8, 6); // 0.8 * 10
  });

  it('returns false when the segment has zero length', () => {
    const c = makeLineContour(2, 2, 2, 2); // coincident
    const ok = applyDimensionValueToContour(
      c,
      { pointIndex0: 0, pointIndex1: 1, a: c.points[0], b: c.points[1], kind: 'linear' },
      10,
    );
    expect(ok).toBe(false);
  });

  it('returns false when pointIndex1 is out of range', () => {
    const c = makeLineContour(0, 0, 10, 0);
    const ok = applyDimensionValueToContour(
      c,
      { pointIndex0: 0, pointIndex1: 5, a: c.points[0], b: c.points[1], kind: 'linear' },
      10,
    );
    expect(ok).toBe(false);
  });
});

describe('applyDimensionValueToContour - radius / diameter', () => {
  it('scales a circle contour to the target radius (radius kind)', () => {
    const c = makeCircleContour(0, 0, 10, 24);
    const ok = applyDimensionValueToContour(
      c,
      { pointIndex0: 0, pointIndex1: 1, a: new THREE.Vector3(), b: new THREE.Vector3(), kind: 'radius' },
      20, // target display radius 20
    );
    expect(ok).toBe(true);
    const res = circleCenter2D(c);
    expect(res).not.toBeNull();
    expect(res!.radiusMm).toBeCloseTo(20, 4);
    // center unchanged
    expect(res!.center.x).toBeCloseTo(0, 4);
    expect(res!.center.y).toBeCloseTo(0, 4);
  });

  it('diameter target sets the radius to half the typed diameter', () => {
    // A typed diameter of 40 must produce a circle of radius 20.
    const c = makeCircleContour(0, 0, 10, 24);
    const ok = applyDimensionValueToContour(
      c,
      { pointIndex0: 0, pointIndex1: 1, a: new THREE.Vector3(), b: new THREE.Vector3(), kind: 'diameter' },
      40,
    );
    expect(ok).toBe(true);
    const res = circleCenter2D(c);
    expect(res!.radiusMm).toBeCloseTo(20, 4);
  });

  it('scales about an off-origin center, keeping the center fixed', () => {
    const c = makeCircleContour(5, -3, 8, 24);
    const ok = applyDimensionValueToContour(
      c,
      { pointIndex0: 0, pointIndex1: 1, a: new THREE.Vector3(), b: new THREE.Vector3(), kind: 'radius' },
      16, // double the radius
    );
    expect(ok).toBe(true);
    const res = circleCenter2D(c);
    expect(res!.center.x).toBeCloseTo(5, 4);
    expect(res!.center.y).toBeCloseTo(-3, 4);
    expect(res!.radiusMm).toBeCloseTo(16, 4);
  });

  it('returns false for a radius/diameter pick on a non-circular contour', () => {
    const c = makeLineContour(0, 0, 10, 0); // open 2-pt line is not a circle
    const ok = applyDimensionValueToContour(
      c,
      { pointIndex0: 0, pointIndex1: 1, a: new THREE.Vector3(), b: new THREE.Vector3(), kind: 'radius' },
      20,
    );
    expect(ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// cloneSketchDimension  (deep-clones a & b vectors)
// ---------------------------------------------------------------------------

describe('cloneSketchDimension', () => {
  function makeDim(): SketchDimension {
    return {
      id: 'd1',
      sketchId: 's1',
      kind: 'linear',
      axis: 'xy',
      position: 0,
      a: new THREE.Vector3(1, 2, 3),
      b: new THREE.Vector3(4, 5, 6),
      offset: 7,
      visible: true,
    };
  }

  it('produces an equal-but-distinct object', () => {
    const d = makeDim();
    const c = cloneSketchDimension(d);
    expect(c).not.toBe(d);
    expect(c.id).toBe('d1');
    expect(c.offset).toBe(7);
    expect(c.a.equals(d.a)).toBe(true);
    expect(c.b.equals(d.b)).toBe(true);
  });

  it('deep-clones the a and b vectors (mutating clone does not affect source)', () => {
    const d = makeDim();
    const c = cloneSketchDimension(d);
    expect(c.a).not.toBe(d.a);
    c.a.x = 999;
    expect(d.a.x).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// sketchEdgeKey / sketchEdgesEqual
// ---------------------------------------------------------------------------

describe('sketchEdgeKey', () => {
  it('joins contourId + indices with colons', () => {
    expect(sketchEdgeKey({ contourId: 'abc', pointIndex0: 1, pointIndex1: 2 })).toBe('abc:1:2');
  });
});

describe('sketchEdgesEqual', () => {
  const mk = (id: string, i0: number, i1: number) => ({
    contourId: id,
    pointIndex0: i0,
    pointIndex1: i1,
    a: new THREE.Vector3(),
    b: new THREE.Vector3(),
    kind: 'linear' as SketchDimensionKind,
  });

  it('two nulls are equal', () => {
    expect(sketchEdgesEqual(null, null)).toBe(true);
  });
  it('null vs non-null is not equal', () => {
    expect(sketchEdgesEqual(null, mk('a', 0, 1))).toBe(false);
    expect(sketchEdgesEqual(mk('a', 0, 1), null)).toBe(false);
  });
  it('same key -> equal (ignores a/b/kind)', () => {
    expect(sketchEdgesEqual(mk('a', 0, 1), mk('a', 0, 1))).toBe(true);
  });
  it('different indices -> not equal', () => {
    expect(sketchEdgesEqual(mk('a', 0, 1), mk('a', 0, 2))).toBe(false);
  });
  it('different contourId -> not equal', () => {
    expect(sketchEdgesEqual(mk('a', 0, 1), mk('b', 0, 1))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SKETCH_UNIT_LABELS constant
// ---------------------------------------------------------------------------

describe('SKETCH_UNIT_LABELS', () => {
  it('maps each unit to a German label', () => {
    const units: SketchUnit[] = ['mm', 'cm', 'm', 'in'];
    for (const u of units) {
      expect(typeof SKETCH_UNIT_LABELS[u]).toBe('string');
      expect(SKETCH_UNIT_LABELS[u].length).toBeGreaterThan(0);
    }
    expect(SKETCH_UNIT_LABELS.mm).toContain('mm');
    expect(SKETCH_UNIT_LABELS.in).toContain('in');
  });
});
