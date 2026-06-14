import { describe, it, expect } from 'vitest';
import {
  inferBodyKindFromLabel,
  assignBodyKind,
  bodyKindBadgeKey,
  type BodyKind,
} from '../src/body-kind';

// The BodyKind union, per src/body-kind.ts: 'scan' | 'solid' | 'loft'.
const ALL_KINDS: BodyKind[] = ['scan', 'solid', 'loft'];

describe('inferBodyKindFromLabel', () => {
  it("returns 'loft' for a label containing 'negativform'", () => {
    expect(inferBodyKindFromLabel('Negativform')).toBe('loft');
  });

  it("returns 'loft' for a label that is exactly 'loft'", () => {
    expect(inferBodyKindFromLabel('loft')).toBe('loft');
  });

  it("matches 'negativform' case-insensitively (UPPER)", () => {
    expect(inferBodyKindFromLabel('NEGATIVFORM')).toBe('loft');
  });

  it("matches 'negativform' as a substring within a longer label", () => {
    expect(inferBodyKindFromLabel('Bauteil Negativform 3')).toBe('loft');
  });

  it("matches 'loft' only when the WHOLE (lowercased) label equals 'loft', not as substring", () => {
    // 'Loft1' does not equal 'loft' and contains none of the solid keywords -> falls through to scan.
    expect(inferBodyKindFromLabel('Loft1')).toBe('scan');
    expect(inferBodyKindFromLabel('My Loft')).toBe('scan');
  });

  it("returns 'loft' for 'LOFT' because it is lowercased to exactly 'loft'", () => {
    expect(inferBodyKindFromLabel('LOFT')).toBe('loft');
  });

  it("returns 'solid' for labels containing 'extrusion'", () => {
    expect(inferBodyKindFromLabel('Extrusion 1')).toBe('solid');
  });

  it("returns 'solid' for labels containing 'rotation'", () => {
    expect(inferBodyKindFromLabel('Rotation')).toBe('solid');
  });

  it("returns 'solid' for labels containing 'revolve'", () => {
    expect(inferBodyKindFromLabel('Revolve A')).toBe('solid');
  });

  it("returns 'solid' for labels containing 'vereinigt'", () => {
    expect(inferBodyKindFromLabel('Vereinigt')).toBe('solid');
  });

  it("returns 'solid' for labels containing 'join'", () => {
    expect(inferBodyKindFromLabel('Join result')).toBe('solid');
  });

  it("returns 'solid' for labels containing 'festkörper'", () => {
    expect(inferBodyKindFromLabel('Festkörper')).toBe('solid');
  });

  it('matches solid keywords case-insensitively', () => {
    expect(inferBodyKindFromLabel('EXTRUSION')).toBe('solid');
    expect(inferBodyKindFromLabel('REVOLVE')).toBe('solid');
    expect(inferBodyKindFromLabel('FESTKÖRPER')).toBe('solid');
  });

  it('matches solid keywords as substrings', () => {
    expect(inferBodyKindFromLabel('xx extrusion yy')).toBe('solid');
    expect(inferBodyKindFromLabel('prefix-join-suffix')).toBe('solid');
  });

  it("returns 'scan' for an empty string (no keyword match)", () => {
    expect(inferBodyKindFromLabel('')).toBe('scan');
  });

  it("returns 'scan' for an arbitrary label with no keywords", () => {
    expect(inferBodyKindFromLabel('Mesh 42')).toBe('scan');
    expect(inferBodyKindFromLabel('ScanData')).toBe('scan');
  });

  it("prioritizes 'negativform' (loft) even when a solid keyword is also present", () => {
    // The negativform/loft check runs first, so it wins over 'extrusion'.
    expect(inferBodyKindFromLabel('Negativform Extrusion')).toBe('loft');
    expect(inferBodyKindFromLabel('Extrusion Negativform')).toBe('loft');
  });

  it('always returns a member of the BodyKind union', () => {
    const samples = ['', 'loft', 'Negativform', 'Join', 'random', 'EXTRUSION'];
    for (const s of samples) {
      expect(ALL_KINDS).toContain(inferBodyKindFromLabel(s));
    }
  });
});

describe('assignBodyKind', () => {
  it('mutates the body record, setting bodyKind to the given kind', () => {
    const body = { bodyKind: 'scan' as BodyKind };
    assignBodyKind(body as any, 'solid');
    expect(body.bodyKind).toBe('solid');
  });

  it('returns undefined (void)', () => {
    const body = { bodyKind: 'scan' as BodyKind };
    expect(assignBodyKind(body as any, 'loft')).toBeUndefined();
  });

  it('can assign every kind in the union', () => {
    for (const kind of ALL_KINDS) {
      const body = { bodyKind: 'scan' as BodyKind };
      assignBodyKind(body as any, kind);
      expect(body.bodyKind).toBe(kind);
    }
  });

  it('overwrites an existing non-default kind', () => {
    const body = { bodyKind: 'solid' as BodyKind };
    assignBodyKind(body as any, 'scan');
    expect(body.bodyKind).toBe('scan');
  });
});

describe('bodyKindBadgeKey', () => {
  it("returns the loftNegativform key when kind is 'loft' AND label contains 'negativform'", () => {
    expect(bodyKindBadgeKey('loft', 'Negativform')).toBe(
      'browser.bodyKind.loftNegativform',
    );
  });

  it("matches 'negativform' case-insensitively for the loft special-case", () => {
    expect(bodyKindBadgeKey('loft', 'BAUTEIL NEGATIVFORM')).toBe(
      'browser.bodyKind.loftNegativform',
    );
  });

  it("returns the plain loft key when kind is 'loft' but label lacks 'negativform'", () => {
    expect(bodyKindBadgeKey('loft', 'loft')).toBe('browser.bodyKind.loft');
    expect(bodyKindBadgeKey('loft', 'Some Loft')).toBe('browser.bodyKind.loft');
  });

  it("returns the plain key namespaced by kind for 'scan'", () => {
    expect(bodyKindBadgeKey('scan', 'whatever')).toBe('browser.bodyKind.scan');
  });

  it("returns the plain key namespaced by kind for 'solid'", () => {
    expect(bodyKindBadgeKey('solid', 'Extrusion')).toBe(
      'browser.bodyKind.solid',
    );
  });

  it("does NOT apply the negativform special-case for non-loft kinds, even if label contains 'negativform'", () => {
    // The special-case is gated on kind === 'loft'.
    expect(bodyKindBadgeKey('scan', 'Negativform')).toBe('browser.bodyKind.scan');
    expect(bodyKindBadgeKey('solid', 'Negativform')).toBe(
      'browser.bodyKind.solid',
    );
  });

  it('produces keys with the browser.bodyKind. prefix for every kind', () => {
    for (const kind of ALL_KINDS) {
      expect(bodyKindBadgeKey(kind, 'plainlabel')).toBe(
        `browser.bodyKind.${kind}`,
      );
    }
  });

  it("treats an empty label as not containing 'negativform' for the loft case", () => {
    expect(bodyKindBadgeKey('loft', '')).toBe('browser.bodyKind.loft');
  });
});
