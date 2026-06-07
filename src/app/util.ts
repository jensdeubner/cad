/**
 * Small shared utilities used across domains.
 */

let statusEl: HTMLElement | null = null;

/** Wire the status bar element once at boot. */
export function initStatusElement(el: HTMLElement) {
  statusEl = el;
}

/** Update the bottom status line (German user-facing text). */
export function setStatus(msg: string) {
  if (statusEl) statusEl.textContent = msg;
}

/** Short random id for contours, sketches, dimensions. */
export function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

/** True when keyboard shortcuts should be ignored (user is typing). */
export function isTypingTarget(target: EventTarget | null): boolean {
  const tag = (target as HTMLElement)?.tagName;
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
}