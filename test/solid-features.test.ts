/**
 * Pure-logic tests for the Fusion Solid ribbon routing and JSON payload builders.
 *
 * Scope: src/solid-features.ts (buildExtrudePayload, runSolidFeature routing,
 * WORKING_SOLID_FEATURES, solidFeatureLabel) plus the pure JSON-payload-building
 * helpers in solid-extrude.ts / solid-revolve.ts / solid-loft.ts / solid-ops.ts.
 *
 * Everything here is pure: no WASM, no WebGL, no canvas2d.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  buildExtrudePayload,
  runSolidFeature,
  solidFeatureLabel,
  WORKING_SOLID_FEATURES,
  type LoftContourPayload,
  type SolidFeatureHost,
  type SolidFeatureId,
} from '../src/solid-features';
import { buildExtrudeLoftPayload } from '../src/solid-extrude';
import { buildRevolvePayload } from '../src/solid-revolve';
import { buildLoftContoursPayload } from '../src/solid-loft';
import { revolutionAxisForPlane } from '../src/solid-ops';

function makeBase(overrides: Partial<LoftContourPayload> = {}): LoftContourPayload {
  return {
    axis: 'xy',
    position: 10,
    points: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
    ],
    closed: true,
    full_3d: false,
    ...overrides,
  };
}

/** A SolidFeatureHost whose every method is a spy, so routing can be asserted. */
function makeMockHost(): SolidFeatureHost & Record<string, ReturnType<typeof vi.fn>> {
  return {
    setStatus: vi.fn(),
    selectTab: vi.fn(),
    setTool: vi.fn(),
    triggerExtrude: vi.fn(),
    triggerRevolve: vi.fn(),
    triggerLoft: vi.fn(),
    triggerSplitBody: vi.fn(),
    triggerRectPattern: vi.fn(),
    triggerCircPattern: vi.fn(),
    triggerMirror: vi.fn(),
    triggerJoin: vi.fn(),
    triggerSubtract: vi.fn(),
  } as SolidFeatureHost & Record<string, ReturnType<typeof vi.fn>>;
}

describe('buildExtrudePayload', () => {
  it('returns two contours and closed_ends:true', () => {
    const base = makeBase();
    const out = buildExtrudePayload(base, 5);
    expect(out.closed_ends).toBe(true);
    expect(out.contours).toHaveLength(2);
  });

  it('first contour is the base reference (same object)', () => {
    const base = makeBase();
    const out = buildExtrudePayload(base, 5);
    expect(out.contours[0]).toBe(base);
  });

  it('second contour is base offset by distance along position', () => {
    const base = makeBase({ position: 10 });
    const out = buildExtrudePayload(base, 5);
    expect(out.contours[1].position).toBeCloseTo(15);
    // all other fields are copied from base
    expect(out.contours[1].axis).toBe('xy');
    expect(out.contours[1].closed).toBe(true);
    expect(out.contours[1].full_3d).toBe(false);
    expect(out.contours[1].points).toEqual(base.points);
  });

  it('handles negative distance (offset subtracts)', () => {
    const base = makeBase({ position: 10 });
    const out = buildExtrudePayload(base, -4);
    expect(out.contours[1].position).toBeCloseTo(6);
  });

  it('handles zero distance (offset clone at same position)', () => {
    const base = makeBase({ position: 7 });
    const out = buildExtrudePayload(base, 0);
    expect(out.contours[1].position).toBeCloseTo(7);
  });

  it('does NOT mutate the original base payload', () => {
    const base = makeBase({ position: 10 });
    buildExtrudePayload(base, 5);
    expect(base.position).toBe(10);
  });

  it('the offset contour is a shallow copy (new object, shared points array)', () => {
    const base = makeBase();
    const out = buildExtrudePayload(base, 5);
    expect(out.contours[1]).not.toBe(base);
    // spread copies the points reference, it is not deep-cloned
    expect(out.contours[1].points).toBe(base.points);
  });
});

describe('WORKING_SOLID_FEATURES', () => {
  const allIds: SolidFeatureId[] = [
    'extrude',
    'revolve',
    'loft',
    'press-pull',
    'split-body',
    'rect-pattern',
    'circ-pattern',
    'mirror',
    'join',
    'subtract',
  ];

  it('contains exactly all 10 SolidFeatureId values', () => {
    expect(WORKING_SOLID_FEATURES).toHaveLength(10);
    expect([...WORKING_SOLID_FEATURES].sort()).toEqual([...allIds].sort());
  });

  it('has no duplicate entries', () => {
    expect(new Set(WORKING_SOLID_FEATURES).size).toBe(WORKING_SOLID_FEATURES.length);
  });

  it.each(allIds)('includes %s', (id) => {
    expect(WORKING_SOLID_FEATURES).toContain(id);
  });
});

describe('solidFeatureLabel', () => {
  it.each(WORKING_SOLID_FEATURES)('returns a non-empty string for %s', (id) => {
    const label = solidFeatureLabel(id);
    expect(typeof label).toBe('string');
    expect(label.length).toBeGreaterThan(0);
  });

  it('resolves known keys to translated labels (default locale de)', () => {
    expect(solidFeatureLabel('extrude')).toBe('Extrusion');
    expect(solidFeatureLabel('revolve')).toBe('Rotation');
    expect(solidFeatureLabel('mirror')).toBe('Spiegeln');
    expect(solidFeatureLabel('join')).toBe('Vereinigen');
  });

  it('falls back to the raw key string for missing catalog keys (subtract)', () => {
    // NOTE: there is no `solid.subtract` entry in en.ts or de.ts, so t() returns
    // the key itself. This pins current behavior: the label is the key, not a word.
    expect(solidFeatureLabel('subtract')).toBe('solid.subtract');
  });
});

describe('runSolidFeature routing', () => {
  it('always selects the solid tab first', () => {
    const host = makeMockHost();
    runSolidFeature('extrude', host);
    expect(host.selectTab).toHaveBeenCalledWith('solid');
  });

  it('extrude -> triggerExtrude only', () => {
    const host = makeMockHost();
    runSolidFeature('extrude', host);
    expect(host.triggerExtrude).toHaveBeenCalledTimes(1);
    expect(host.triggerRevolve).not.toHaveBeenCalled();
    expect(host.triggerLoft).not.toHaveBeenCalled();
  });

  it('revolve -> triggerRevolve only', () => {
    const host = makeMockHost();
    runSolidFeature('revolve', host);
    expect(host.triggerRevolve).toHaveBeenCalledTimes(1);
    expect(host.triggerExtrude).not.toHaveBeenCalled();
  });

  it('loft -> triggerLoft only', () => {
    const host = makeMockHost();
    runSolidFeature('loft', host);
    expect(host.triggerLoft).toHaveBeenCalledTimes(1);
  });

  it('split-body -> triggerSplitBody only', () => {
    const host = makeMockHost();
    runSolidFeature('split-body', host);
    expect(host.triggerSplitBody).toHaveBeenCalledTimes(1);
  });

  it('rect-pattern -> triggerRectPattern only', () => {
    const host = makeMockHost();
    runSolidFeature('rect-pattern', host);
    expect(host.triggerRectPattern).toHaveBeenCalledTimes(1);
  });

  it('circ-pattern -> triggerCircPattern only', () => {
    const host = makeMockHost();
    runSolidFeature('circ-pattern', host);
    expect(host.triggerCircPattern).toHaveBeenCalledTimes(1);
  });

  it('mirror -> triggerMirror only', () => {
    const host = makeMockHost();
    runSolidFeature('mirror', host);
    expect(host.triggerMirror).toHaveBeenCalledTimes(1);
  });

  it('join -> triggerJoin only', () => {
    const host = makeMockHost();
    runSolidFeature('join', host);
    expect(host.triggerJoin).toHaveBeenCalledTimes(1);
  });

  it('subtract -> triggerSubtract only', () => {
    const host = makeMockHost();
    runSolidFeature('subtract', host);
    expect(host.triggerSubtract).toHaveBeenCalledTimes(1);
  });

  it('press-pull -> selects body tab, sets press-pull tool, sets status', () => {
    const host = makeMockHost();
    runSolidFeature('press-pull', host);
    // selectTab called twice: 'solid' then 'body'
    expect(host.selectTab).toHaveBeenNthCalledWith(1, 'solid');
    expect(host.selectTab).toHaveBeenNthCalledWith(2, 'body');
    expect(host.setTool).toHaveBeenCalledWith('press-pull');
    expect(host.setStatus).toHaveBeenCalledTimes(1);
    // press-pull does not fire any of the trigger* hooks
    expect(host.triggerExtrude).not.toHaveBeenCalled();
    expect(host.triggerRevolve).not.toHaveBeenCalled();
  });

  it('does not fire trigger hooks for press-pull but fires for trigger ids', () => {
    const host = makeMockHost();
    runSolidFeature('press-pull', host);
    const triggerCalls = [
      host.triggerExtrude,
      host.triggerRevolve,
      host.triggerLoft,
      host.triggerSplitBody,
      host.triggerRectPattern,
      host.triggerCircPattern,
      host.triggerMirror,
      host.triggerJoin,
      host.triggerSubtract,
    ];
    for (const fn of triggerCalls) expect(fn).not.toHaveBeenCalled();
  });

  it('every trigger-routed id fires exactly one trigger hook and no setTool', () => {
    const cases: Array<[SolidFeatureId, keyof SolidFeatureHost]> = [
      ['extrude', 'triggerExtrude'],
      ['revolve', 'triggerRevolve'],
      ['loft', 'triggerLoft'],
      ['split-body', 'triggerSplitBody'],
      ['rect-pattern', 'triggerRectPattern'],
      ['circ-pattern', 'triggerCircPattern'],
      ['mirror', 'triggerMirror'],
      ['join', 'triggerJoin'],
      ['subtract', 'triggerSubtract'],
    ];
    for (const [id, method] of cases) {
      const host = makeMockHost();
      runSolidFeature(id, host);
      expect(host[method as string]).toHaveBeenCalledTimes(1);
      expect(host.setTool).not.toHaveBeenCalled();
      expect(host.selectTab).toHaveBeenCalledTimes(1); // only 'solid'
    }
  });
});

describe('revolutionAxisForPlane (solid-ops.ts)', () => {
  it('xy plane revolves about z', () => {
    expect(revolutionAxisForPlane('xy')).toBe('z');
  });
  it('xz plane revolves about y', () => {
    expect(revolutionAxisForPlane('xz')).toBe('y');
  });
  it('yz plane revolves about x', () => {
    expect(revolutionAxisForPlane('yz')).toBe('x');
  });
});

describe('buildExtrudeLoftPayload (solid-extrude.ts)', () => {
  it('is the JSON string of buildExtrudePayload output', () => {
    const base = makeBase({ position: 2 });
    const json = buildExtrudeLoftPayload(base, 3);
    expect(json).toBe(JSON.stringify(buildExtrudePayload(base, 3)));
  });

  it('round-trips to an object with two contours and closed_ends', () => {
    const base = makeBase({ position: 2 });
    const parsed = JSON.parse(buildExtrudeLoftPayload(base, 3));
    expect(parsed.closed_ends).toBe(true);
    expect(parsed.contours).toHaveLength(2);
    expect(parsed.contours[1].position).toBeCloseTo(5);
  });
});

describe('buildRevolvePayload (solid-revolve.ts)', () => {
  it('produces JSON with contour, mapped axis, 48 segments, and angle', () => {
    const base = makeBase();
    const parsed = JSON.parse(buildRevolvePayload(base, 'xy', 270));
    expect(parsed.revolution_axis).toBe('z'); // xy -> z via revolutionAxisForPlane
    expect(parsed.segments).toBe(48);
    expect(parsed.angle_deg).toBe(270);
    expect(parsed.contour.axis).toBe('xy');
    expect(parsed.contour.points).toEqual(base.points);
  });

  it('maps xz plane to y axis', () => {
    const parsed = JSON.parse(buildRevolvePayload(makeBase({ axis: 'xz' }), 'xz', 90));
    expect(parsed.revolution_axis).toBe('y');
  });

  it('maps yz plane to x axis', () => {
    const parsed = JSON.parse(buildRevolvePayload(makeBase({ axis: 'yz' }), 'yz', 360));
    expect(parsed.revolution_axis).toBe('x');
    expect(parsed.angle_deg).toBe(360);
  });
});

describe('buildLoftContoursPayload (solid-loft.ts)', () => {
  it('wraps the contour list with closed_ends:true', () => {
    const a = makeBase({ position: 0 });
    const b = makeBase({ position: 10 });
    const parsed = JSON.parse(buildLoftContoursPayload([a, b]));
    expect(parsed.closed_ends).toBe(true);
    expect(parsed.contours).toHaveLength(2);
    expect(parsed.contours[0].position).toBe(0);
    expect(parsed.contours[1].position).toBe(10);
  });

  it('preserves an empty contour list', () => {
    const parsed = JSON.parse(buildLoftContoursPayload([]));
    expect(parsed.contours).toEqual([]);
    expect(parsed.closed_ends).toBe(true);
  });
});
