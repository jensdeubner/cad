/** Ribbon tab that hosts each `data-tool` button (first match in index.html). */
export const TOOL_RIBBON_TAB: Record<string, string> = {
  'move-body': 'body',
  'scale-body': 'body',
  'press-pull': 'body',
  'smooth-body': 'body',
  'smooth-section': 'body',
  navigate: 'draw',
  align: 'align',
  'sketch-pick': 'sketch',
  'sketch-line': 'sketch',
  'sketch-circle': 'sketch',
  'sketch-arc': 'sketch',
  'sketch-rect': 'sketch',
  'sketch-triangle': 'sketch',
  'sketch-dim': 'sketch',
  'sketch-constraint': 'sketch',
  freehand: 'sketch',
  edit: 'sketch',
  polyline: 'draw',
  lasso: 'draw',
};

export const ALL_TOOLS = Object.keys(TOOL_RIBBON_TAB);

export const SKETCH_TOOLS = new Set([
  'sketch-pick',
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

export const BODY_TOOLS = new Set(['move-body', 'scale-body', 'press-pull', 'smooth-body', 'smooth-section']);

export const FUSION_TABS = [
  'start',
  'sketch',
  'solid',
  'body',
  'align',
  'draw',
  'contours',
  'view',
] as const;