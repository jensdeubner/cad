import { describe, it, expect } from 'vitest';
import {
  workspaceForTab,
  toolAllowedInWorkspace,
  workspaceHintForTool,
  workspaceModeLabel,
  type WorkspaceMode,
} from '../src/workspace-mode';
import {
  bodyGizmoTool,
  orbitToolActive,
  smoothToolActive,
  meshSculptTool,
  isSketchPrimitiveTool,
  isSketchDrawTool,
} from '../src/tools/helpers';
import type { Tool } from '../src/types';
import type { FusionTab } from '../src/app-menu';

// Exhaustive Tool union from src/types.ts (18 members).
const ALL_TOOLS: Tool[] = [
  'navigate',
  'align',
  'move-body',
  'scale-body',
  'press-pull',
  'smooth-body',
  'smooth-section',
  'sketch-pick',
  'sketch-line',
  'sketch-circle',
  'sketch-arc',
  'sketch-rect',
  'sketch-triangle',
  'sketch-dim',
  'polyline',
  'freehand',
  'lasso',
  'edit',
];

const ALL_TABS: FusionTab[] = [
  'start',
  'sketch',
  'solid',
  'body',
  'align',
  'draw',
  'view',
  'contours',
];

const ALL_MODES: WorkspaceMode[] = ['sketch', 'body', 'contour'];

describe('workspace-mode: union sanity', () => {
  it('the Tool union under test has 18 distinct members', () => {
    expect(new Set(ALL_TOOLS).size).toBe(18);
    expect(ALL_TOOLS).toHaveLength(18);
  });

  it('the FusionTab union under test has 8 distinct members', () => {
    expect(new Set(ALL_TABS).size).toBe(8);
    expect(ALL_TABS).toHaveLength(8);
  });
});

describe('workspaceForTab', () => {
  it('maps "sketch" tab to sketch workspace', () => {
    expect(workspaceForTab('sketch')).toBe('sketch');
  });

  it('maps body-group tabs (body, align, solid) to body workspace', () => {
    expect(workspaceForTab('body')).toBe('body');
    expect(workspaceForTab('align')).toBe('body');
    expect(workspaceForTab('solid')).toBe('body');
  });

  it('maps contour-group tabs (draw, contours) to contour workspace', () => {
    expect(workspaceForTab('draw')).toBe('contour');
    expect(workspaceForTab('contours')).toBe('contour');
  });

  it('returns null for tabs with no workspace (start, view)', () => {
    expect(workspaceForTab('start')).toBeNull();
    expect(workspaceForTab('view')).toBeNull();
  });

  it('every tab resolves to a known mode or null (exhaustive)', () => {
    const expected: Record<FusionTab, WorkspaceMode | null> = {
      start: null,
      sketch: 'sketch',
      solid: 'body',
      body: 'body',
      align: 'body',
      draw: 'contour',
      view: null,
      contours: 'contour',
    };
    for (const tab of ALL_TABS) {
      expect(workspaceForTab(tab)).toBe(expected[tab]);
    }
  });
});

describe('workspaceModeLabel', () => {
  it('returns a distinct non-empty label per mode', () => {
    const labels = ALL_MODES.map((m) => workspaceModeLabel(m));
    for (const l of labels) {
      expect(typeof l).toBe('string');
      expect(l.length).toBeGreaterThan(0);
    }
    expect(new Set(labels).size).toBe(3);
  });
});

describe('toolAllowedInWorkspace — sketch mode', () => {
  // In sketch mode: sketch-pick & navigate always allowed.
  // edit/freehand allowed only WITH activeSketchId.
  // sketch draw tools (line/circle/arc/rect/triangle/dim) allowed only WITH activeSketchId.
  // everything else: false.

  it('sketch-pick and navigate are allowed regardless of activeSketchId', () => {
    expect(toolAllowedInWorkspace('sketch-pick', 'sketch', null)).toBe(true);
    expect(toolAllowedInWorkspace('sketch-pick', 'sketch', 's1')).toBe(true);
    expect(toolAllowedInWorkspace('navigate', 'sketch', null)).toBe(true);
    expect(toolAllowedInWorkspace('navigate', 'sketch', 's1')).toBe(true);
  });

  it('edit and freehand require an active sketch', () => {
    expect(toolAllowedInWorkspace('edit', 'sketch', null)).toBe(false);
    expect(toolAllowedInWorkspace('edit', 'sketch', 's1')).toBe(true);
    expect(toolAllowedInWorkspace('freehand', 'sketch', null)).toBe(false);
    expect(toolAllowedInWorkspace('freehand', 'sketch', 's1')).toBe(true);
  });

  it('sketch draw tools require an active sketch', () => {
    const draw: Tool[] = [
      'sketch-line',
      'sketch-circle',
      'sketch-arc',
      'sketch-rect',
      'sketch-triangle',
      'sketch-dim',
    ];
    for (const tool of draw) {
      expect(toolAllowedInWorkspace(tool, 'sketch', null)).toBe(false);
      expect(toolAllowedInWorkspace(tool, 'sketch', 's1')).toBe(true);
    }
  });

  it('body and contour tools are never allowed in sketch mode', () => {
    const blocked: Tool[] = [
      'align',
      'move-body',
      'scale-body',
      'press-pull',
      'smooth-body',
      'smooth-section',
      'polyline',
      'lasso',
    ];
    for (const tool of blocked) {
      expect(toolAllowedInWorkspace(tool, 'sketch', null)).toBe(false);
      expect(toolAllowedInWorkspace(tool, 'sketch', 's1')).toBe(false);
    }
  });

  it('exhaustive truth table for sketch mode without active sketch', () => {
    const allowed = new Set<Tool>(['sketch-pick', 'navigate']);
    for (const tool of ALL_TOOLS) {
      expect(toolAllowedInWorkspace(tool, 'sketch', null)).toBe(allowed.has(tool));
    }
  });

  it('exhaustive truth table for sketch mode WITH active sketch', () => {
    const allowed = new Set<Tool>([
      'sketch-pick',
      'navigate',
      'edit',
      'freehand',
      'sketch-line',
      'sketch-circle',
      'sketch-arc',
      'sketch-rect',
      'sketch-triangle',
      'sketch-dim',
    ]);
    for (const tool of ALL_TOOLS) {
      expect(toolAllowedInWorkspace(tool, 'sketch', 's1')).toBe(allowed.has(tool));
    }
  });
});

describe('toolAllowedInWorkspace — body mode', () => {
  // With an active sketch, NOTHING is allowed in body mode (guard returns false first).
  it('an active sketch blocks every tool in body mode', () => {
    for (const tool of ALL_TOOLS) {
      expect(toolAllowedInWorkspace(tool, 'body', 's1')).toBe(false);
    }
  });

  it('navigate and edit are allowed (no active sketch)', () => {
    expect(toolAllowedInWorkspace('navigate', 'body', null)).toBe(true);
    expect(toolAllowedInWorkspace('edit', 'body', null)).toBe(true);
  });

  it('body-only tools are allowed (no active sketch)', () => {
    const body: Tool[] = [
      'align',
      'move-body',
      'scale-body',
      'press-pull',
      'smooth-body',
      'smooth-section',
    ];
    for (const tool of body) {
      expect(toolAllowedInWorkspace(tool, 'body', null)).toBe(true);
    }
  });

  it('sketch-only and contour-only tools are blocked (no active sketch)', () => {
    const blocked: Tool[] = [
      'sketch-pick',
      'sketch-line',
      'sketch-circle',
      'sketch-arc',
      'sketch-rect',
      'sketch-triangle',
      'sketch-dim',
      'polyline',
      'freehand',
      'lasso',
    ];
    for (const tool of blocked) {
      expect(toolAllowedInWorkspace(tool, 'body', null)).toBe(false);
    }
  });

  it('exhaustive truth table for body mode without active sketch', () => {
    const allowed = new Set<Tool>([
      'navigate',
      'edit',
      'align',
      'move-body',
      'scale-body',
      'press-pull',
      'smooth-body',
      'smooth-section',
    ]);
    for (const tool of ALL_TOOLS) {
      expect(toolAllowedInWorkspace(tool, 'body', null)).toBe(allowed.has(tool));
    }
  });
});

describe('toolAllowedInWorkspace — contour mode', () => {
  it('an active sketch blocks every tool in contour mode', () => {
    for (const tool of ALL_TOOLS) {
      expect(toolAllowedInWorkspace(tool, 'contour', 's1')).toBe(false);
    }
  });

  it('navigate and edit are allowed (no active sketch)', () => {
    expect(toolAllowedInWorkspace('navigate', 'contour', null)).toBe(true);
    expect(toolAllowedInWorkspace('edit', 'contour', null)).toBe(true);
  });

  it('contour-only tools (polyline, freehand, lasso) are allowed (no active sketch)', () => {
    expect(toolAllowedInWorkspace('polyline', 'contour', null)).toBe(true);
    expect(toolAllowedInWorkspace('freehand', 'contour', null)).toBe(true);
    expect(toolAllowedInWorkspace('lasso', 'contour', null)).toBe(true);
  });

  it('sketch-only and body-only tools are blocked (no active sketch)', () => {
    const blocked: Tool[] = [
      'sketch-pick',
      'sketch-line',
      'sketch-circle',
      'sketch-arc',
      'sketch-rect',
      'sketch-triangle',
      'sketch-dim',
      'align',
      'move-body',
      'scale-body',
      'press-pull',
      'smooth-body',
      'smooth-section',
    ];
    for (const tool of blocked) {
      expect(toolAllowedInWorkspace(tool, 'contour', null)).toBe(false);
    }
  });

  it('exhaustive truth table for contour mode without active sketch', () => {
    const allowed = new Set<Tool>(['navigate', 'edit', 'polyline', 'freehand', 'lasso']);
    for (const tool of ALL_TOOLS) {
      expect(toolAllowedInWorkspace(tool, 'contour', null)).toBe(allowed.has(tool));
    }
  });
});

describe('workspaceHintForTool', () => {
  // The four hint keys map to four distinct strings; we assert which key is chosen
  // by comparing against the actual t() output for that key, indirectly via distinctness.
  // Re-derive the strings through workspaceHintForTool's own branches so the test is
  // locale-independent.

  it('sketch mode: body/contour tools yield the body-contour-blocked hint; others generic', () => {
    // generic baseline (a sketch tool in sketch mode is generic)
    const generic = workspaceHintForTool('sketch-line', 'sketch');
    const blockedHint = workspaceHintForTool('move-body', 'sketch');
    expect(blockedHint).not.toBe(generic);
    // all body-only + contour-only tools share the same bodyContourBlocked hint
    const bodyContour: Tool[] = [
      'align',
      'move-body',
      'scale-body',
      'press-pull',
      'smooth-body',
      'smooth-section',
      'polyline',
      'freehand',
      'lasso',
    ];
    for (const tool of bodyContour) {
      expect(workspaceHintForTool(tool, 'sketch')).toBe(blockedHint);
    }
    // a non-body/contour tool stays generic
    expect(workspaceHintForTool('navigate', 'sketch')).toBe(generic);
  });

  it('body mode: sketch-only tools => sketchBlocked, contour-only => contourBlocked, else generic', () => {
    const sketchBlocked = workspaceHintForTool('sketch-line', 'body');
    const contourBlocked = workspaceHintForTool('polyline', 'body');
    const generic = workspaceHintForTool('move-body', 'body');
    expect(sketchBlocked).not.toBe(generic);
    expect(contourBlocked).not.toBe(generic);
    expect(sketchBlocked).not.toBe(contourBlocked);

    const sketchOnly: Tool[] = [
      'sketch-pick',
      'sketch-line',
      'sketch-circle',
      'sketch-arc',
      'sketch-rect',
      'sketch-triangle',
      'sketch-dim',
    ];
    for (const tool of sketchOnly) {
      expect(workspaceHintForTool(tool, 'body')).toBe(sketchBlocked);
    }
    // CONTOUR_ONLY_TOOLS = {polyline, freehand, lasso} — all yield contourBlocked.
    for (const tool of ['polyline', 'freehand', 'lasso'] as Tool[]) {
      expect(workspaceHintForTool(tool, 'body')).toBe(contourBlocked);
    }
    expect(workspaceHintForTool('navigate', 'body')).toBe(generic);
  });

  it('contour mode: sketch-only => sketchBlocked, body-only => bodyBlocked, else generic', () => {
    const sketchBlocked = workspaceHintForTool('sketch-line', 'contour');
    const bodyBlocked = workspaceHintForTool('move-body', 'contour');
    const generic = workspaceHintForTool('polyline', 'contour');
    expect(sketchBlocked).not.toBe(generic);
    expect(bodyBlocked).not.toBe(generic);
    expect(sketchBlocked).not.toBe(bodyBlocked);

    const sketchOnly: Tool[] = [
      'sketch-pick',
      'sketch-line',
      'sketch-circle',
      'sketch-arc',
      'sketch-rect',
      'sketch-triangle',
      'sketch-dim',
    ];
    for (const tool of sketchOnly) {
      expect(workspaceHintForTool(tool, 'contour')).toBe(sketchBlocked);
    }
    const bodyOnly: Tool[] = [
      'align',
      'move-body',
      'scale-body',
      'press-pull',
      'smooth-body',
      'smooth-section',
    ];
    for (const tool of bodyOnly) {
      expect(workspaceHintForTool(tool, 'contour')).toBe(bodyBlocked);
    }
    expect(workspaceHintForTool('navigate', 'contour')).toBe(generic);
    expect(workspaceHintForTool('freehand', 'contour')).toBe(generic);
  });

  it('every (tool, mode) pair returns a non-empty string', () => {
    for (const mode of ALL_MODES) {
      for (const tool of ALL_TOOLS) {
        const hint = workspaceHintForTool(tool, mode);
        expect(typeof hint).toBe('string');
        expect(hint.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('helpers.bodyGizmoTool', () => {
  it('true only for move-body and scale-body', () => {
    const expected = new Set<Tool>(['move-body', 'scale-body']);
    for (const tool of ALL_TOOLS) {
      expect(bodyGizmoTool(tool)).toBe(expected.has(tool));
    }
  });
});

describe('helpers.smoothToolActive', () => {
  it('true only for smooth-body and smooth-section', () => {
    const expected = new Set<Tool>(['smooth-body', 'smooth-section']);
    for (const tool of ALL_TOOLS) {
      expect(smoothToolActive(tool)).toBe(expected.has(tool));
    }
  });
});

describe('helpers.meshSculptTool', () => {
  it('true for press-pull, smooth-body, smooth-section only', () => {
    const expected = new Set<Tool>(['press-pull', 'smooth-body', 'smooth-section']);
    for (const tool of ALL_TOOLS) {
      expect(meshSculptTool(tool)).toBe(expected.has(tool));
    }
  });
});

describe('helpers.orbitToolActive', () => {
  it('true for navigate, align, sketch-pick, move-body, scale-body only', () => {
    const expected = new Set<Tool>([
      'navigate',
      'align',
      'sketch-pick',
      'move-body',
      'scale-body',
    ]);
    for (const tool of ALL_TOOLS) {
      expect(orbitToolActive(tool)).toBe(expected.has(tool));
    }
  });
});

describe('helpers.isSketchPrimitiveTool', () => {
  it('true for line/circle/arc/rect/triangle only (NOT sketch-dim, NOT sketch-pick)', () => {
    const expected = new Set<Tool>([
      'sketch-line',
      'sketch-circle',
      'sketch-arc',
      'sketch-rect',
      'sketch-triangle',
    ]);
    for (const tool of ALL_TOOLS) {
      expect(isSketchPrimitiveTool(tool)).toBe(expected.has(tool));
    }
  });

  it('explicitly excludes sketch-dim and sketch-pick', () => {
    expect(isSketchPrimitiveTool('sketch-dim')).toBe(false);
    expect(isSketchPrimitiveTool('sketch-pick')).toBe(false);
  });
});

describe('helpers.isSketchDrawTool', () => {
  it('primitive tools are draw tools regardless of activeSketchId', () => {
    const primitives: Tool[] = [
      'sketch-line',
      'sketch-circle',
      'sketch-arc',
      'sketch-rect',
      'sketch-triangle',
    ];
    for (const tool of primitives) {
      expect(isSketchDrawTool(tool, null)).toBe(true);
      expect(isSketchDrawTool(tool, 's1')).toBe(true);
    }
  });

  it('freehand is a draw tool ONLY with an active sketch', () => {
    expect(isSketchDrawTool('freehand', null)).toBe(false);
    expect(isSketchDrawTool('freehand', 's1')).toBe(true);
  });

  it('sketch-dim is NOT a draw tool (it is not a primitive nor freehand)', () => {
    expect(isSketchDrawTool('sketch-dim', null)).toBe(false);
    expect(isSketchDrawTool('sketch-dim', 's1')).toBe(false);
  });

  it('exhaustive truth table without active sketch', () => {
    const allowed = new Set<Tool>([
      'sketch-line',
      'sketch-circle',
      'sketch-arc',
      'sketch-rect',
      'sketch-triangle',
    ]);
    for (const tool of ALL_TOOLS) {
      expect(isSketchDrawTool(tool, null)).toBe(allowed.has(tool));
    }
  });

  it('exhaustive truth table WITH active sketch (adds freehand)', () => {
    const allowed = new Set<Tool>([
      'sketch-line',
      'sketch-circle',
      'sketch-arc',
      'sketch-rect',
      'sketch-triangle',
      'freehand',
    ]);
    for (const tool of ALL_TOOLS) {
      expect(isSketchDrawTool(tool, 's1')).toBe(allowed.has(tool));
    }
  });
});
