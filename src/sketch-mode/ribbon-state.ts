/**
 * Sketch ribbon / panel visibility — drawing tools only when a sketch is active.
 */
import type { Tool } from '../types';

/** Tools that require `activeSketchId` (Fusion: only inside an open sketch). */
export const SKETCH_TOOLS_REQUIRE_ACTIVE: ReadonlySet<Tool> = new Set([
  'sketch-line',
  'sketch-circle',
  'sketch-arc',
  'sketch-rect',
  'sketch-triangle',
  'sketch-dim',
  'sketch-constraint',
  'freehand',
  'edit',
]);

export function toolRequiresActiveSketch(tool: Tool): boolean {
  return SKETCH_TOOLS_REQUIRE_ACTIVE.has(tool);
}

const RIBBON_SKETCH = '[data-ribbon="sketch"]';

function clearSketchDrawToolHighlights() {
  document.querySelectorAll('[data-sketch-active-only] [data-tool]').forEach((btn) => {
    btn.classList.remove('active');
  });
}

/** Sync ribbon highlight — only one tool lit; draw tools only inside an active sketch. */
export function syncToolButtonHighlight(active: Tool, activeSketchId: string | null) {
  document.querySelectorAll('[data-tool], [data-menu-tool]').forEach((b) => {
    const el = b as HTMLElement;
    const t = (el.dataset.tool ?? el.dataset.menuTool) as Tool | undefined;
    if (!t) return;
    let on = t === active;
    if (on && toolRequiresActiveSketch(t) && !activeSketchId) on = false;
    el.classList.toggle('active', on);
  });

  if (!activeSketchId) {
    clearSketchDrawToolHighlights();
    document.querySelectorAll('[data-tool="sketch-pick"]').forEach((btn) => {
      btn.classList.toggle('active', active === 'sketch-pick');
    });
  }
}

/** Show/hide elements marked with `data-sketch-active-only`. */
export function updateSketchRibbonState(activeSketchId: string | null, activeTool?: Tool) {
  const ribbon = document.querySelector(RIBBON_SKETCH);
  ribbon?.classList.toggle('sketch-no-active', !activeSketchId);

  document.querySelectorAll('[data-sketch-active-only]').forEach((el) => {
    el.classList.toggle('hidden', !activeSketchId);
  });

  const pickHint = document.getElementById('sketch-panel-pick-hint');
  const drawHint = document.getElementById('sketch-panel-draw-hint');
  if (pickHint) pickHint.classList.toggle('hidden', !!activeSketchId);
  if (drawHint) drawHint.classList.toggle('hidden', !activeSketchId);

  if (!activeSketchId) {
    clearSketchDrawToolHighlights();
    document.querySelectorAll('[data-tool="sketch-pick"]').forEach((btn) => {
      btn.classList.toggle('active', activeTool === 'sketch-pick' || activeTool === undefined);
    });
  }
}