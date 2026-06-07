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

export interface FusionShortcutEntry {
  keys: string;
  action: string;
  scope: string;
}

/** Fusion-360-nahe Tastenkürzel (Referenz & Hilfe-Panel). */
export const FUSION_SHORTCUTS: FusionShortcutEntry[] = [
  { keys: 'S', action: 'Skizze starten / Ebene wählen', scope: 'Global' },
  { keys: 'L', action: 'Linie', scope: 'Skizze aktiv' },
  { keys: 'C', action: 'Kreis', scope: 'Skizze aktiv' },
  { keys: 'R', action: 'Rechteck', scope: 'Skizze aktiv' },
  { keys: 'A', action: 'Bogen (3 Punkte)', scope: 'Skizze aktiv' },
  { keys: 'D', action: 'Bemaßung (Kante wählen → Maßlinie ziehen → Wert)', scope: 'Skizze aktiv' },
  { keys: 'E', action: 'Bearbeiten', scope: 'Skizze aktiv' },
  { keys: 'Esc', action: 'Abbrechen / Panels schließen', scope: 'Global' },
  { keys: 'F', action: 'Ansicht anpassen (Fit)', scope: 'Global' },
  { keys: '1', action: 'Drauf (XY)', scope: 'Ansicht' },
  { keys: '2', action: 'Vorne (XZ)', scope: 'Ansicht' },
  { keys: '3', action: 'Seite (YZ)', scope: 'Ansicht' },
  { keys: 'N', action: 'Navigieren', scope: 'Global' },
  { keys: 'M', action: 'Körper bewegen', scope: 'Körper' },
  { keys: 'G', action: 'Gizmo: Verschieben', scope: 'Ausrichten / Körper' },
  { keys: 'R', action: 'Gizmo: Drehen', scope: 'Ausrichten / Körper' },
  { keys: 'S', action: 'Gizmo: Skalieren', scope: 'Skalieren-Werkzeug' },
  { keys: 'W', action: 'Welt / Lokal umschalten', scope: 'Gizmo aktiv' },
  { keys: 'P', action: 'Press Pull', scope: 'Körper' },
  { keys: 'Strg+Z', action: 'Rückgängig', scope: 'Global' },
  { keys: 'Strg+Umschalt+Z', action: 'Wiederholen', scope: 'Global' },
  { keys: 'Verlauf', action: 'Timeline unten — Schritt anklicken zum Springen', scope: 'Global' },
  { keys: 'Strg+Y', action: 'Wiederholen', scope: 'Global' },
  { keys: 'Strg+S', action: 'Projekt speichern', scope: 'Global' },
];

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