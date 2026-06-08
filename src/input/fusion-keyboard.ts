/**
 * Global Fusion-style keyboard shortcuts and shortcut help panel.
 */
import { FUSION_SHORTCUT_IDS, resolveFusionShortcut, type FusionShortcutAction } from '../fusion-shortcuts';
import { t } from '../i18n';
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
  host.innerHTML = FUSION_SHORTCUT_IDS.map(
    (id) =>
      `<tr><td><kbd>${t(`shortcut.${id}.keys`)}</kbd></td><td>${t(`shortcut.${id}.action`)}</td><td class="shortcut-scope">${t(`shortcut.${id}.scope`)}</td></tr>`,
  ).join('');
}

/** Attach window keydown handler for Escape + Fusion shortcuts. */
export function bindFusionKeyboard(ctx: FusionKeyboardContext) {
  window.addEventListener('keydown', (e) => {
    if (isTypingTarget(e.target)) return;

    if (e.key === 'Escape') {
      if (ctx.onCancel()) {
        e.preventDefault();
        setStatus(t('status.cancelled'));
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