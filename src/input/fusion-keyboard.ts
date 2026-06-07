/**
 * Global Fusion-style keyboard shortcuts and shortcut help panel.
 */
import { FUSION_SHORTCUTS, resolveFusionShortcut, type FusionShortcutAction } from '../fusion-shortcuts';
import { isTypingTarget, setStatus } from '../app/util';
import type { Tool } from '../types';

export interface FusionKeyboardContext {
  getTool(): Tool;
  getActiveSketchId(): string | null;
  onCancel(): boolean;
  onAction(action: FusionShortcutAction): void;
  closeMenus(): void;
}

/** Render shortcut table into the view panel. */
export function renderFusionShortcutsPanel() {
  const host = document.getElementById('fusion-shortcuts-list');
  if (!host) return;
  host.innerHTML = FUSION_SHORTCUTS.map(
    (s) =>
      `<tr><td><kbd>${s.keys}</kbd></td><td>${s.action}</td><td class="shortcut-scope">${s.scope}</td></tr>`,
  ).join('');
}

/** Attach window keydown handler for Escape + Fusion shortcuts. */
export function bindFusionKeyboard(ctx: FusionKeyboardContext) {
  window.addEventListener('keydown', (e) => {
    if (isTypingTarget(e.target)) return;

    if (e.key === 'Escape') {
      if (ctx.onCancel()) {
        e.preventDefault();
        setStatus('Abgebrochen (Esc)');
        return;
      }
      ctx.closeMenus();
      e.preventDefault();
      return;
    }

    const action = resolveFusionShortcut(e, {
      tool: ctx.getTool(),
      activeSketchId: ctx.getActiveSketchId(),
    });
    if (!action) return;
    if (action.type === 'cancel') return;

    e.preventDefault();
    ctx.onAction(action);
  });
}