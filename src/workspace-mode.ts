/**
 * Fusion-style workspace separation: sketch · body (solid/mesh) · contour (trace/loft).
 */
import type { FusionTab } from './app-menu';
import { t } from './i18n';
import type { Tool } from './types';

export type WorkspaceMode = 'sketch' | 'body' | 'contour';

const BODY_TABS = new Set<FusionTab>(['body', 'align', 'solid']);
const CONTOUR_TABS = new Set<FusionTab>(['draw', 'contours']);

const SKETCH_ONLY_TOOLS = new Set<Tool>([
  'sketch-pick',
  'sketch-line',
  'sketch-circle',
  'sketch-arc',
  'sketch-rect',
  'sketch-triangle',
  'sketch-dim',
  'sketch-constraint',
]);

const SKETCH_DRAW_TOOLS = new Set<Tool>([
  'sketch-line',
  'sketch-circle',
  'sketch-arc',
  'sketch-rect',
  'sketch-triangle',
  'sketch-dim',
  'sketch-constraint',
]);

const BODY_ONLY_TOOLS = new Set<Tool>([
  'align',
  'move-body',
  'scale-body',
  'press-pull',
  'smooth-body',
  'smooth-section',
]);

const CONTOUR_ONLY_TOOLS = new Set<Tool>(['polyline', 'freehand', 'lasso']);

export function workspaceForTab(tab: FusionTab): WorkspaceMode | null {
  if (tab === 'sketch') return 'sketch';
  if (BODY_TABS.has(tab)) return 'body';
  if (CONTOUR_TABS.has(tab)) return 'contour';
  return null;
}

export function workspaceModeLabel(mode: WorkspaceMode): string {
  if (mode === 'sketch') return t('workspace.sketch');
  if (mode === 'body') return t('workspace.body');
  return t('workspace.contour');
}

export function toolAllowedInWorkspace(
  tool: Tool,
  mode: WorkspaceMode,
  activeSketchId: string | null,
): boolean {
  if (mode === 'sketch') {
    if (tool === 'sketch-pick' || tool === 'navigate') return true;
    if (activeSketchId && (tool === 'edit' || tool === 'freehand')) return true;
    if (SKETCH_DRAW_TOOLS.has(tool)) return !!activeSketchId;
    return false;
  }

  if (mode === 'body') {
    if (activeSketchId || SKETCH_ONLY_TOOLS.has(tool)) return false;
    if (tool === 'navigate' || tool === 'edit') return true;
    return BODY_ONLY_TOOLS.has(tool);
  }

  // contour
  if (activeSketchId || SKETCH_ONLY_TOOLS.has(tool)) return false;
  if (tool === 'navigate' || tool === 'edit') return true;
  return CONTOUR_ONLY_TOOLS.has(tool);
}

export function workspaceHintForTool(tool: Tool, mode: WorkspaceMode): string {
  if (mode === 'sketch') {
    if (BODY_ONLY_TOOLS.has(tool) || CONTOUR_ONLY_TOOLS.has(tool)) return t('workspace.hint.bodyContourBlocked');
    return t('workspace.hint.generic');
  }
  if (mode === 'body') {
    if (SKETCH_ONLY_TOOLS.has(tool)) return t('workspace.hint.sketchBlocked');
    if (CONTOUR_ONLY_TOOLS.has(tool)) return t('workspace.hint.contourBlocked');
    return t('workspace.hint.generic');
  }
  // contour
  if (SKETCH_ONLY_TOOLS.has(tool)) return t('workspace.hint.sketchBlocked');
  if (BODY_ONLY_TOOLS.has(tool)) return t('workspace.hint.bodyBlocked');
  return t('workspace.hint.generic');
}