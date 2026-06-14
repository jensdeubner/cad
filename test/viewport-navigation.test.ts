/**
 * Tests for applyViewportNavigation branch/mapping logic.
 *
 * Pure branch logic: we hand it a fake `controls` object ({ mouseButtons: {} }
 * plus boolean flags) and assert the LEFT/MIDDLE/RIGHT mouse-button mapping it
 * writes, per tool / sketch-context / shift state.
 *
 * THREE.MOUSE values (v0.175): ROTATE = 0, PAN = 2, DOLLY = 1.
 * The function uses `null as unknown as THREE.MOUSE` to mean "no binding";
 * we assert that as a literal `null`.
 *
 * isSolidCommandActive() is module-level state that defaults to inactive
 * (all solid command phases start at 'idle'), so in this test environment it
 * is always false — the "solid command" arm of the sketch branch is therefore
 * not separately exercised here.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  applyViewportNavigation,
  type ViewportNavState,
} from '../src/input/viewport-navigation';
import type { Tool } from '../src/types';

/** Minimal stand-in for OrbitControls covering only the fields the function touches. */
type FakeControls = {
  enabled: boolean;
  enableZoom: boolean;
  enablePan: boolean;
  enableRotate: boolean;
  mouseButtons: Partial<{
    LEFT: THREE.MOUSE | null;
    MIDDLE: THREE.MOUSE | null;
    RIGHT: THREE.MOUSE | null;
  }>;
};

function makeControls(): FakeControls {
  return {
    enabled: true,
    enableZoom: false,
    enablePan: false,
    enableRotate: false,
    mouseButtons: {},
  };
}

function makeState(overrides: Partial<ViewportNavState> = {}): ViewportNavState {
  return {
    tool: 'navigate',
    activeSketchId: null,
    shiftKeyHeld: false,
    viewCubeAnimating: false,
    viewCubeDragging: false,
    transformDragging: false,
    draggingPlane: false,
    ...overrides,
  };
}

function apply(controls: FakeControls, state: ViewportNavState): void {
  applyViewportNavigation(controls as unknown as OrbitControls, state);
}

describe('applyViewportNavigation - always-on flags', () => {
  it('enables zoom, pan and rotate regardless of tool', () => {
    const c = makeControls();
    apply(c, makeState({ tool: 'navigate' }));
    expect(c.enableZoom).toBe(true);
    expect(c.enablePan).toBe(true);
    expect(c.enableRotate).toBe(true);
  });

  it('keeps enableZoom/Pan/Rotate true even when blocked', () => {
    const c = makeControls();
    apply(c, makeState({ tool: 'sketch-line', viewCubeAnimating: true }));
    expect(c.enableZoom).toBe(true);
    expect(c.enablePan).toBe(true);
    expect(c.enableRotate).toBe(true);
  });
});

describe('applyViewportNavigation - controls.enabled (blocked flags)', () => {
  it('enabled = true when no blocking flag is set', () => {
    const c = makeControls();
    apply(c, makeState());
    expect(c.enabled).toBe(true);
  });

  it('enabled = false when viewCubeAnimating', () => {
    const c = makeControls();
    apply(c, makeState({ viewCubeAnimating: true }));
    expect(c.enabled).toBe(false);
  });

  it('enabled = false when viewCubeDragging', () => {
    const c = makeControls();
    apply(c, makeState({ viewCubeDragging: true }));
    expect(c.enabled).toBe(false);
  });

  it('enabled = false when transformDragging', () => {
    const c = makeControls();
    apply(c, makeState({ transformDragging: true }));
    expect(c.enabled).toBe(false);
  });

  it('enabled = false when draggingPlane', () => {
    const c = makeControls();
    apply(c, makeState({ draggingPlane: true }));
    expect(c.enabled).toBe(false);
  });

  it('blocking does not change the mouseButtons mapping (still orbit for navigate)', () => {
    const c = makeControls();
    apply(c, makeState({ tool: 'navigate', draggingPlane: true }));
    expect(c.enabled).toBe(false);
    expect(c.mouseButtons.LEFT).toBe(THREE.MOUSE.ROTATE);
    expect(c.mouseButtons.MIDDLE).toBe(THREE.MOUSE.PAN);
    expect(c.mouseButtons.RIGHT).toBe(null);
  });
});

describe('applyViewportNavigation - navigate / align (orbit) branch', () => {
  for (const tool of ['navigate', 'align'] as Tool[]) {
    it(`${tool}: LEFT=ROTATE, MIDDLE=PAN, RIGHT=null`, () => {
      const c = makeControls();
      apply(c, makeState({ tool }));
      expect(c.mouseButtons.LEFT).toBe(THREE.MOUSE.ROTATE);
      expect(c.mouseButtons.MIDDLE).toBe(THREE.MOUSE.PAN);
      expect(c.mouseButtons.RIGHT).toBe(null);
    });

    it(`${tool}: ignores shift (MIDDLE stays PAN)`, () => {
      const c = makeControls();
      apply(c, makeState({ tool, shiftKeyHeld: true }));
      expect(c.mouseButtons.LEFT).toBe(THREE.MOUSE.ROTATE);
      expect(c.mouseButtons.MIDDLE).toBe(THREE.MOUSE.PAN);
      expect(c.mouseButtons.RIGHT).toBe(null);
    });

    it(`${tool}: an activeSketchId does NOT override the navigate/align branch`, () => {
      const c = makeControls();
      apply(c, makeState({ tool, activeSketchId: 'sketch-42' }));
      // navigate/align is checked before the sketch branch
      expect(c.mouseButtons.LEFT).toBe(THREE.MOUSE.ROTATE);
      expect(c.mouseButtons.MIDDLE).toBe(THREE.MOUSE.PAN);
      expect(c.mouseButtons.RIGHT).toBe(null);
    });
  }
});

describe('applyViewportNavigation - sketch context branch (no LMB orbit)', () => {
  const sketchTools: Tool[] = [
    'sketch-pick',
    'sketch-line',
    'sketch-circle',
    'sketch-arc',
    'sketch-rect',
    'sketch-triangle',
    'sketch-dim',
    'edit',
    'freehand',
    'polyline',
    'lasso',
  ];

  for (const tool of sketchTools) {
    it(`${tool} (no shift): LEFT=null, MIDDLE=PAN, RIGHT=null`, () => {
      const c = makeControls();
      apply(c, makeState({ tool }));
      expect(c.mouseButtons.LEFT).toBe(null);
      expect(c.mouseButtons.MIDDLE).toBe(THREE.MOUSE.PAN);
      expect(c.mouseButtons.RIGHT).toBe(null);
    });

    it(`${tool} (shift held): MIDDLE switches to ROTATE`, () => {
      const c = makeControls();
      apply(c, makeState({ tool, shiftKeyHeld: true }));
      expect(c.mouseButtons.LEFT).toBe(null);
      expect(c.mouseButtons.MIDDLE).toBe(THREE.MOUSE.ROTATE);
      expect(c.mouseButtons.RIGHT).toBe(null);
    });
  }

  it('a non-sketch tool gains sketch bindings when activeSketchId is set', () => {
    const c = makeControls();
    // 'move-body' would normally be a body-gizmo branch, but an active sketch
    // promotes it into the sketch context (checked before the gizmo branch).
    apply(c, makeState({ tool: 'move-body', activeSketchId: 's1' }));
    expect(c.mouseButtons.LEFT).toBe(null);
    expect(c.mouseButtons.MIDDLE).toBe(THREE.MOUSE.PAN);
    expect(c.mouseButtons.RIGHT).toBe(null);
  });

  it('active sketch + shift: MIDDLE = ROTATE even for a non-sketch tool', () => {
    const c = makeControls();
    apply(c, makeState({ tool: 'move-body', activeSketchId: 's1', shiftKeyHeld: true }));
    expect(c.mouseButtons.LEFT).toBe(null);
    expect(c.mouseButtons.MIDDLE).toBe(THREE.MOUSE.ROTATE);
    expect(c.mouseButtons.RIGHT).toBe(null);
  });
});

describe('applyViewportNavigation - mesh-sculpt tools (sketch-style bindings)', () => {
  const sculptTools: Tool[] = ['press-pull', 'smooth-body', 'smooth-section'];

  for (const tool of sculptTools) {
    it(`${tool} (no shift): LEFT=null, MIDDLE=PAN, RIGHT=null`, () => {
      const c = makeControls();
      apply(c, makeState({ tool }));
      expect(c.mouseButtons.LEFT).toBe(null);
      expect(c.mouseButtons.MIDDLE).toBe(THREE.MOUSE.PAN);
      expect(c.mouseButtons.RIGHT).toBe(null);
    });

    it(`${tool} (shift held): MIDDLE = ROTATE`, () => {
      const c = makeControls();
      apply(c, makeState({ tool, shiftKeyHeld: true }));
      expect(c.mouseButtons.LEFT).toBe(null);
      expect(c.mouseButtons.MIDDLE).toBe(THREE.MOUSE.ROTATE);
      expect(c.mouseButtons.RIGHT).toBe(null);
    });
  }
});

describe('applyViewportNavigation - body-gizmo branch (move/scale body)', () => {
  const gizmoTools: Tool[] = ['move-body', 'scale-body'];

  for (const tool of gizmoTools) {
    it(`${tool}: LEFT=ROTATE, MIDDLE=PAN, RIGHT=null`, () => {
      const c = makeControls();
      apply(c, makeState({ tool }));
      expect(c.mouseButtons.LEFT).toBe(THREE.MOUSE.ROTATE);
      expect(c.mouseButtons.MIDDLE).toBe(THREE.MOUSE.PAN);
      expect(c.mouseButtons.RIGHT).toBe(null);
    });

    it(`${tool}: shift has no effect (MIDDLE stays PAN)`, () => {
      const c = makeControls();
      apply(c, makeState({ tool, shiftKeyHeld: true }));
      expect(c.mouseButtons.LEFT).toBe(THREE.MOUSE.ROTATE);
      expect(c.mouseButtons.MIDDLE).toBe(THREE.MOUSE.PAN);
      expect(c.mouseButtons.RIGHT).toBe(null);
    });
  }
});

describe('applyViewportNavigation - default branch (RMB orbit)', () => {
  // For every *valid* Tool with activeSketchId=null one of the earlier branches
  // matches, so the default arm is only reachable via an unknown tool value.
  // We force it by casting an out-of-enum string, pinning the documented
  // fallback: LEFT=null, MIDDLE=PAN, RIGHT=ROTATE.
  const fallbackTool = 'some-unknown-tool' as unknown as Tool;

  it('unknown tool: LEFT=null, MIDDLE=PAN, RIGHT=ROTATE', () => {
    const c = makeControls();
    apply(c, makeState({ tool: fallbackTool }));
    expect(c.mouseButtons.LEFT).toBe(null);
    expect(c.mouseButtons.MIDDLE).toBe(THREE.MOUSE.PAN);
    expect(c.mouseButtons.RIGHT).toBe(THREE.MOUSE.ROTATE);
  });

  it('unknown tool: default branch ignores shift (MIDDLE stays PAN)', () => {
    const c = makeControls();
    apply(c, makeState({ tool: fallbackTool, shiftKeyHeld: true }));
    expect(c.mouseButtons.LEFT).toBe(null);
    expect(c.mouseButtons.MIDDLE).toBe(THREE.MOUSE.PAN);
    expect(c.mouseButtons.RIGHT).toBe(THREE.MOUSE.ROTATE);
  });
});

describe('applyViewportNavigation - returns void and mutates in place', () => {
  it('returns undefined', () => {
    const c = makeControls();
    expect(apply(c, makeState())).toBeUndefined();
  });

  it('overwrites a pre-existing mouseButtons mapping', () => {
    const c = makeControls();
    c.mouseButtons = { LEFT: THREE.MOUSE.DOLLY, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.DOLLY };
    apply(c, makeState({ tool: 'sketch-line' }));
    expect(c.mouseButtons.LEFT).toBe(null);
    expect(c.mouseButtons.MIDDLE).toBe(THREE.MOUSE.PAN);
    expect(c.mouseButtons.RIGHT).toBe(null);
  });
});
