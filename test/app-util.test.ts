import { describe, it, expect, beforeEach } from 'vitest';
import {
  uid,
  isTypingTarget,
  initStatusElement,
  setStatus,
} from '../src/app/util';
import {
  toolRequiresActiveSketch,
  SKETCH_TOOLS_REQUIRE_ACTIVE,
} from '../src/sketch-mode/ribbon-state';
import {
  appendFeature,
  featureTimelineCount,
  clearFeatureTimeline,
} from '../src/feature-timeline';
import type { Tool } from '../src/types';

describe('app/util uid()', () => {
  it('returns a string', () => {
    expect(typeof uid()).toBe('string');
  });

  it('matches /^[0-9a-z]+$/ (base36 lowercase, no separators)', () => {
    for (let i = 0; i < 100; i++) {
      expect(uid()).toMatch(/^[0-9a-z]+$/);
    }
  });

  it('produces ids of at most 7 chars (slice(2,9))', () => {
    // Math.random().toString(36).slice(2, 9) -> up to 7 chars
    for (let i = 0; i < 100; i++) {
      expect(uid().length).toBeLessThanOrEqual(7);
    }
  });

  it('is highly unique across 1000 calls', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) seen.add(uid());
    // Collisions are astronomically unlikely; allow a tiny tolerance.
    expect(seen.size).toBeGreaterThan(995);
  });
});

describe('app/util isTypingTarget()', () => {
  it('is true for an INPUT element', () => {
    expect(isTypingTarget(document.createElement('input'))).toBe(true);
  });

  it('is true for a SELECT element', () => {
    expect(isTypingTarget(document.createElement('select'))).toBe(true);
  });

  it('is true for a TEXTAREA element', () => {
    expect(isTypingTarget(document.createElement('textarea'))).toBe(true);
  });

  it('is false for a DIV element', () => {
    expect(isTypingTarget(document.createElement('div'))).toBe(false);
  });

  it('is false for a BUTTON element', () => {
    expect(isTypingTarget(document.createElement('button'))).toBe(false);
  });

  it('is false for null', () => {
    expect(isTypingTarget(null)).toBe(false);
  });

  it('is false for a non-element EventTarget (no tagName)', () => {
    // tagName access via optional chaining yields undefined -> false
    expect(isTypingTarget(new EventTarget())).toBe(false);
  });
});

describe('app/util status element', () => {
  // NOTE: statusEl is module-level state shared across tests. Because there is
  // no reset export, once initStatusElement is called the element stays wired.
  // These tests pin current behavior and run in declared order.

  it('setStatus before init is a no-op (does not throw, nothing wired yet)', () => {
    // No element has been initialized at this point in the file.
    expect(() => setStatus('vor init')).not.toThrow();
  });

  it('initStatusElement + setStatus updates textContent', () => {
    const el = document.createElement('div');
    initStatusElement(el);
    setStatus('bereit');
    expect(el.textContent).toBe('bereit');
  });

  it('setStatus overwrites textContent on subsequent calls', () => {
    const el = document.createElement('div');
    initStatusElement(el);
    setStatus('eins');
    expect(el.textContent).toBe('eins');
    setStatus('zwei');
    expect(el.textContent).toBe('zwei');
  });

  it('re-initializing points setStatus at the newest element', () => {
    const first = document.createElement('div');
    const second = document.createElement('div');
    initStatusElement(first);
    initStatusElement(second);
    setStatus('hallo');
    expect(second.textContent).toBe('hallo');
    expect(first.textContent).toBe('');
  });
});

describe('sketch-mode/ribbon-state toolRequiresActiveSketch()', () => {
  const requiring: Tool[] = [
    'sketch-line',
    'sketch-circle',
    'sketch-arc',
    'sketch-rect',
    'sketch-triangle',
    'sketch-dim',
    'sketch-constraint',
    'freehand',
    'edit',
  ];

  it('SKETCH_TOOLS_REQUIRE_ACTIVE has exactly 9 members', () => {
    expect(SKETCH_TOOLS_REQUIRE_ACTIVE.size).toBe(9);
  });

  for (const tool of requiring) {
    it(`returns true for '${tool}'`, () => {
      expect(toolRequiresActiveSketch(tool)).toBe(true);
      expect(SKETCH_TOOLS_REQUIRE_ACTIVE.has(tool)).toBe(true);
    });
  }

  const notRequiring: Tool[] = [
    'navigate',
    'align',
    'move-body',
    'scale-body',
    'press-pull',
    'smooth-body',
    'smooth-section',
    'sketch-pick',
    'polyline',
    'lasso',
  ];

  for (const tool of notRequiring) {
    it(`returns false for '${tool}'`, () => {
      expect(toolRequiresActiveSketch(tool)).toBe(false);
      expect(SKETCH_TOOLS_REQUIRE_ACTIVE.has(tool)).toBe(false);
    });
  }

  it('returns false for an unknown tool string (not in the set)', () => {
    expect(toolRequiresActiveSketch('not-a-tool' as Tool)).toBe(false);
  });
});

describe('feature-timeline append/count/clear', () => {
  beforeEach(() => {
    clearFeatureTimeline();
  });

  it('count is 0 after clear', () => {
    expect(featureTimelineCount()).toBe(0);
  });

  it('appendFeature increments the count', () => {
    appendFeature({ kind: 'extrude', label: 'Extrude 1' });
    expect(featureTimelineCount()).toBe(1);
    appendFeature({ kind: 'revolve', label: 'Revolve 1' });
    expect(featureTimelineCount()).toBe(2);
  });

  it('appendFeature accepts an optional bodyId without changing count semantics', () => {
    appendFeature({ kind: 'subtract', label: 'Cut', bodyId: 'body-7' as never });
    expect(featureTimelineCount()).toBe(1);
  });

  it('clearFeatureTimeline resets the count back to 0', () => {
    appendFeature({ kind: 'join', label: 'A' });
    appendFeature({ kind: 'mirror', label: 'B' });
    expect(featureTimelineCount()).toBe(2);
    clearFeatureTimeline();
    expect(featureTimelineCount()).toBe(0);
  });

  it('append/clear/append sequence yields the expected running count', () => {
    appendFeature({ kind: 'loft', label: 'L1' });
    appendFeature({ kind: 'rect-pattern', label: 'R1' });
    appendFeature({ kind: 'circ-pattern', label: 'C1' });
    expect(featureTimelineCount()).toBe(3);
    clearFeatureTimeline();
    expect(featureTimelineCount()).toBe(0);
    appendFeature({ kind: 'split-body', label: 'S1' });
    expect(featureTimelineCount()).toBe(1);
  });
});
