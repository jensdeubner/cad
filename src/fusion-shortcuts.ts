import type { FusionTab } from './app-menu';
import type { Tool } from './types';

export type FusionShortcutAction =
  | { type: 'tool'; tool: Tool }
  | { type: 'tab'; tab: FusionTab }
  | { type: 'transform'; mode: 'translate' | 'rotate' | 'scale' }
  | { type: 'view'; preset: 'top' | 'front' | 'side' | 'perspective' | 'fit' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'save' }
  | { type: 'finish-sketch' }
  | { type: 'cancel' }
  | { type: 'toggle-world-local' }
  | { type: 'enter-sketch' };

export interface FusionShortcutContext {
  tool: Tool;
  activeSketchId: string | null;
}

/** i18n key suffixes for shortcut table rows (see `shortcut.<id>.*` in i18n catalogs). */
export const FUSION_SHORTCUT_IDS = [
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
] as const;

export type FusionShortcutId = (typeof FUSION_SHORTCUT_IDS)[number];

function keyLower(e: KeyboardEvent): string {
  return e.key.length === 1 ? e.key.toLowerCase() : e.key;
}

function bodyGizmoTool(tool: Tool): boolean {
  return tool === 'move-body' || tool === 'scale-body' || tool === 'align';
}

export function resolveFusionShortcut(
  e: KeyboardEvent,
  ctx: FusionShortcutContext,
): FusionShortcutAction | null {
  const k = keyLower(e);
  const mod = e.ctrlKey || e.metaKey;
  const inSketch = !!ctx.activeSketchId;

  if (mod && k === 'z') {
    return e.shiftKey ? { type: 'redo' } : { type: 'undo' };
  }
  if (mod && k === 'y') {
    return { type: 'redo' };
  }
  if (mod && k === 's') {
    return { type: 'save' };
  }

  if (mod || e.altKey) return null;

  if (k === 'Escape') {
    return { type: 'cancel' };
  }

  if (k === 'f' || k === 'F') {
    return { type: 'view', preset: 'fit' };
  }

  if (k === '1') return { type: 'view', preset: 'top' };
  if (k === '2') return { type: 'view', preset: 'front' };
  if (k === '3') return { type: 'view', preset: 'side' };

  if (k === 'n' || k === 'N') {
    return { type: 'tool', tool: 'navigate' };
  }

  if (inSketch) {
    if (k === 'l') return { type: 'tool', tool: 'sketch-line' };
    if (k === 'c') return { type: 'tool', tool: 'sketch-circle' };
    if (k === 'r') return { type: 'tool', tool: 'sketch-rect' };
    if (k === 'a') return { type: 'tool', tool: 'sketch-arc' };
    if (k === 'd') return { type: 'tool', tool: 'sketch-dim' };
    if (k === 'e') return { type: 'tool', tool: 'edit' };
    if (k === 'x' || k === 'Enter') return { type: 'finish-sketch' };
    return null;
  }

  if (k === 's' || k === 'S') {
    if (ctx.tool === 'scale-body') return { type: 'transform', mode: 'scale' };
    return { type: 'enter-sketch' };
  }

  if (k === 'm' || k === 'M') {
    return { type: 'tool', tool: 'move-body' };
  }

  if (k === 'p' || k === 'P') {
    return { type: 'tool', tool: 'press-pull' };
  }

  if (bodyGizmoTool(ctx.tool)) {
    if (k === 'g' || k === 'G') return { type: 'transform', mode: 'translate' };
    if (k === 'r' || k === 'R') return { type: 'transform', mode: 'rotate' };
    if (k === 'w' || k === 'W') return { type: 'toggle-world-local' };
  }

  return null;
}