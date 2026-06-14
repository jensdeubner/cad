import { describe, it, expect } from 'vitest';
import {
  resolveFusionShortcut,
  FUSION_SHORTCUT_IDS,
  type FusionShortcutContext,
  type FusionShortcutAction,
} from '../src/fusion-shortcuts';
import type { Tool } from '../src/types';

/**
 * Build a KeyboardEvent-shaped plain object. The implementation only reads
 * .key, .ctrlKey, .shiftKey, .metaKey, .altKey, so a partial cast is enough.
 */
function ev(
  key: string,
  mods: Partial<{
    ctrlKey: boolean;
    shiftKey: boolean;
    metaKey: boolean;
    altKey: boolean;
  }> = {},
): KeyboardEvent {
  return {
    key,
    ctrlKey: !!mods.ctrlKey,
    shiftKey: !!mods.shiftKey,
    metaKey: !!mods.metaKey,
    altKey: !!mods.altKey,
  } as KeyboardEvent;
}

function ctx(tool: Tool, activeSketchId: string | null): FusionShortcutContext {
  return { tool, activeSketchId };
}

const NO_SKETCH = (tool: Tool = 'navigate') => ctx(tool, null);
const IN_SKETCH = (tool: Tool = 'navigate') => ctx(tool, 'sketch-1');

function resolve(
  key: string,
  c: FusionShortcutContext,
  mods?: Parameters<typeof ev>[1],
): FusionShortcutAction | null {
  return resolveFusionShortcut(ev(key, mods), c);
}

describe('FUSION_SHORTCUT_IDS catalog shape', () => {
  it('is a readonly array of 24 string ids', () => {
    expect(Array.isArray(FUSION_SHORTCUT_IDS)).toBe(true);
    expect(FUSION_SHORTCUT_IDS).toHaveLength(24);
    for (const id of FUSION_SHORTCUT_IDS) {
      expect(typeof id).toBe('string');
    }
  });

  it('contains the documented ids in order', () => {
    expect([...FUSION_SHORTCUT_IDS]).toEqual([
      's',
      'l',
      'c',
      'r',
      'a',
      'd',
      'e',
      'esc',
      'f',
      'key1',
      'key2',
      'key3',
      'n',
      'm',
      'g',
      'rGizmo',
      'sScale',
      'w',
      'p',
      'ctrlZ',
      'ctrlShiftZ',
      'timeline',
      'ctrlY',
      'ctrlS',
    ]);
  });

  it('has no duplicate ids', () => {
    expect(new Set(FUSION_SHORTCUT_IDS).size).toBe(FUSION_SHORTCUT_IDS.length);
  });
});

describe('undo / redo / save (mod = ctrl or meta)', () => {
  it('Ctrl+Z -> undo', () => {
    expect(resolve('z', NO_SKETCH(), { ctrlKey: true })).toEqual({ type: 'undo' });
  });

  it('Cmd(meta)+Z -> undo (meta counts as mod)', () => {
    expect(resolve('z', NO_SKETCH(), { metaKey: true })).toEqual({ type: 'undo' });
  });

  it('Ctrl+Shift+Z -> redo', () => {
    expect(resolve('z', NO_SKETCH(), { ctrlKey: true, shiftKey: true })).toEqual({
      type: 'redo',
    });
  });

  it('Ctrl+Y -> redo', () => {
    expect(resolve('y', NO_SKETCH(), { ctrlKey: true })).toEqual({ type: 'redo' });
  });

  it('Ctrl+S -> save', () => {
    expect(resolve('s', NO_SKETCH(), { ctrlKey: true })).toEqual({ type: 'save' });
  });

  it('Cmd+S -> save (and wins over enter-sketch because mod is checked first)', () => {
    expect(resolve('s', NO_SKETCH(), { metaKey: true })).toEqual({ type: 'save' });
  });

  it('Ctrl+S in an active sketch still saves (mod branch precedes inSketch)', () => {
    expect(resolve('s', IN_SKETCH(), { ctrlKey: true })).toEqual({ type: 'save' });
  });

  it('uppercase Z with ctrl still resolves (key is lowercased)', () => {
    expect(resolve('Z', NO_SKETCH(), { ctrlKey: true })).toEqual({ type: 'undo' });
  });

  it('an unmapped mod combo (Ctrl+Q) returns null', () => {
    expect(resolve('q', NO_SKETCH(), { ctrlKey: true })).toBeNull();
  });
});

describe('view presets and fit (work regardless of sketch state)', () => {
  it('1 -> top', () => {
    expect(resolve('1', NO_SKETCH())).toEqual({ type: 'view', preset: 'top' });
  });

  it('2 -> front', () => {
    expect(resolve('2', NO_SKETCH())).toEqual({ type: 'view', preset: 'front' });
  });

  it('3 -> side', () => {
    expect(resolve('3', NO_SKETCH())).toEqual({ type: 'view', preset: 'side' });
  });

  it('f -> fit', () => {
    expect(resolve('f', NO_SKETCH())).toEqual({ type: 'view', preset: 'fit' });
  });

  it('uppercase F -> fit (key lowercased before the f check)', () => {
    expect(resolve('F', NO_SKETCH())).toEqual({ type: 'view', preset: 'fit' });
  });

  it('view presets also resolve while in a sketch (checked before inSketch block)', () => {
    expect(resolve('1', IN_SKETCH())).toEqual({ type: 'view', preset: 'top' });
    expect(resolve('f', IN_SKETCH())).toEqual({ type: 'view', preset: 'fit' });
  });
});

describe('Escape -> cancel', () => {
  it('Escape -> cancel (no sketch)', () => {
    expect(resolve('Escape', NO_SKETCH())).toEqual({ type: 'cancel' });
  });

  it('Escape -> cancel (in sketch, checked before inSketch block)', () => {
    expect(resolve('Escape', IN_SKETCH())).toEqual({ type: 'cancel' });
  });
});

describe('navigate (n) works regardless of sketch state', () => {
  it('n -> navigate tool (no sketch)', () => {
    expect(resolve('n', NO_SKETCH())).toEqual({ type: 'tool', tool: 'navigate' });
  });

  it('uppercase N -> navigate tool', () => {
    expect(resolve('N', NO_SKETCH())).toEqual({ type: 'tool', tool: 'navigate' });
  });

  it('n in sketch -> navigate (checked before inSketch block)', () => {
    expect(resolve('n', IN_SKETCH())).toEqual({ type: 'tool', tool: 'navigate' });
  });
});

describe('S key: enter-sketch vs scale-body transform (no active sketch)', () => {
  it('s with no active sketch and non-scale tool -> enter-sketch', () => {
    expect(resolve('s', NO_SKETCH('navigate'))).toEqual({ type: 'enter-sketch' });
  });

  it('uppercase S with no active sketch -> enter-sketch', () => {
    expect(resolve('S', NO_SKETCH('navigate'))).toEqual({ type: 'enter-sketch' });
  });

  it('s with tool=scale-body -> transform scale (not enter-sketch)', () => {
    expect(resolve('s', NO_SKETCH('scale-body'))).toEqual({
      type: 'transform',
      mode: 'scale',
    });
  });
});

describe('sketch primitive tools (require active sketch)', () => {
  it('l -> sketch-line', () => {
    expect(resolve('l', IN_SKETCH())).toEqual({ type: 'tool', tool: 'sketch-line' });
  });

  it('c -> sketch-circle', () => {
    expect(resolve('c', IN_SKETCH())).toEqual({ type: 'tool', tool: 'sketch-circle' });
  });

  it('r -> sketch-rect', () => {
    expect(resolve('r', IN_SKETCH())).toEqual({ type: 'tool', tool: 'sketch-rect' });
  });

  it('a -> sketch-arc', () => {
    expect(resolve('a', IN_SKETCH())).toEqual({ type: 'tool', tool: 'sketch-arc' });
  });

  it('d -> sketch-dim (dimension)', () => {
    expect(resolve('d', IN_SKETCH())).toEqual({ type: 'tool', tool: 'sketch-dim' });
  });

  it('e -> edit', () => {
    expect(resolve('e', IN_SKETCH())).toEqual({ type: 'tool', tool: 'edit' });
  });

  it('x -> finish-sketch', () => {
    expect(resolve('x', IN_SKETCH())).toEqual({ type: 'finish-sketch' });
  });

  it('Enter -> finish-sketch', () => {
    expect(resolve('Enter', IN_SKETCH())).toEqual({ type: 'finish-sketch' });
  });

  it('an unmapped key in sketch returns null (inSketch block early-returns)', () => {
    expect(resolve('q', IN_SKETCH())).toBeNull();
  });
});

describe('sketch primitives are NOT active without an active sketch', () => {
  it('l with no sketch -> null', () => {
    expect(resolve('l', NO_SKETCH())).toBeNull();
  });

  it('c with no sketch -> null', () => {
    expect(resolve('c', NO_SKETCH())).toBeNull();
  });

  it('a with no sketch -> null', () => {
    expect(resolve('a', NO_SKETCH())).toBeNull();
  });

  it('d with no sketch -> null', () => {
    expect(resolve('d', NO_SKETCH())).toBeNull();
  });

  it('e with no sketch -> null', () => {
    expect(resolve('e', NO_SKETCH())).toBeNull();
  });

  it('x with no sketch -> null', () => {
    expect(resolve('x', NO_SKETCH())).toBeNull();
  });
});

describe('body tools (no active sketch): move and press-pull', () => {
  it('m -> move-body tool', () => {
    expect(resolve('m', NO_SKETCH())).toEqual({ type: 'tool', tool: 'move-body' });
  });

  it('uppercase M -> move-body tool', () => {
    expect(resolve('M', NO_SKETCH())).toEqual({ type: 'tool', tool: 'move-body' });
  });

  it('p -> press-pull tool', () => {
    expect(resolve('p', NO_SKETCH())).toEqual({ type: 'tool', tool: 'press-pull' });
  });

  it('uppercase P -> press-pull tool', () => {
    expect(resolve('P', NO_SKETCH())).toEqual({ type: 'tool', tool: 'press-pull' });
  });

  it('m is swallowed (null) while in a sketch (inSketch block returns before m)', () => {
    expect(resolve('m', IN_SKETCH())).toBeNull();
  });

  it('p is swallowed (null) while in a sketch', () => {
    expect(resolve('p', IN_SKETCH())).toBeNull();
  });
});

describe('gizmo context: g/r/w only when tool is a body-gizmo tool', () => {
  // bodyGizmoTool = move-body | scale-body | align

  it('g with move-body -> transform translate', () => {
    expect(resolve('g', NO_SKETCH('move-body'))).toEqual({
      type: 'transform',
      mode: 'translate',
    });
  });

  it('g with align -> transform translate', () => {
    expect(resolve('g', NO_SKETCH('align'))).toEqual({
      type: 'transform',
      mode: 'translate',
    });
  });

  it('r with move-body -> transform rotate', () => {
    expect(resolve('r', NO_SKETCH('move-body'))).toEqual({
      type: 'transform',
      mode: 'rotate',
    });
  });

  it('r with scale-body -> transform rotate', () => {
    expect(resolve('r', NO_SKETCH('scale-body'))).toEqual({
      type: 'transform',
      mode: 'rotate',
    });
  });

  it('w with move-body -> toggle-world-local', () => {
    expect(resolve('w', NO_SKETCH('move-body'))).toEqual({ type: 'toggle-world-local' });
  });

  it('uppercase G/R/W with align resolve to gizmo actions', () => {
    expect(resolve('G', NO_SKETCH('align'))).toEqual({
      type: 'transform',
      mode: 'translate',
    });
    expect(resolve('R', NO_SKETCH('align'))).toEqual({
      type: 'transform',
      mode: 'rotate',
    });
    expect(resolve('W', NO_SKETCH('align'))).toEqual({ type: 'toggle-world-local' });
  });

  it('g with a non-gizmo tool (navigate) -> null', () => {
    expect(resolve('g', NO_SKETCH('navigate'))).toBeNull();
  });

  it('w with a non-gizmo tool (navigate) -> null', () => {
    expect(resolve('w', NO_SKETCH('navigate'))).toBeNull();
  });

  it('s wins over gizmo-scale: scale-body + s -> transform scale (handled earlier)', () => {
    // The "s" branch sits above the gizmo block, so scale is via the s key.
    expect(resolve('s', NO_SKETCH('scale-body'))).toEqual({
      type: 'transform',
      mode: 'scale',
    });
  });

  it('r with scale-body resolves to rotate (gizmo r), even though s-key does scale', () => {
    expect(resolve('r', NO_SKETCH('scale-body'))).toEqual({
      type: 'transform',
      mode: 'rotate',
    });
  });
});

describe('Alt modifier disables non-mod shortcuts', () => {
  it('Alt+f -> null (altKey short-circuits)', () => {
    expect(resolve('f', NO_SKETCH(), { altKey: true })).toBeNull();
  });

  it('Alt+1 -> null', () => {
    expect(resolve('1', NO_SKETCH(), { altKey: true })).toBeNull();
  });

  it('Alt+s -> null (does not enter-sketch)', () => {
    expect(resolve('s', NO_SKETCH(), { altKey: true })).toBeNull();
  });
});

describe('precedence: ctrl-combos with view keys', () => {
  it('Ctrl+1 -> null (mod short-circuits before view presets)', () => {
    expect(resolve('1', NO_SKETCH(), { ctrlKey: true })).toBeNull();
  });

  it('Ctrl+F -> null (no fit while ctrl held)', () => {
    expect(resolve('f', NO_SKETCH(), { ctrlKey: true })).toBeNull();
  });
});
