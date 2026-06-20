/**
 * Ribbon overflow affordances — keeps every command reachable.
 *
 * The command deck (`.fusion-ribbon`) scrolls horizontally when a workspace
 * has more groups than fit (e.g. the Solid tab). Without affordances the
 * right-most groups were silently clipped. This wires:
 *   - `can-scroll-left` / `can-scroll-right` state classes on the deck
 *     (drive edge fades + chevron visibility via CSS)
 *   - chevron buttons (`[data-ribbon-scroll]`) that page the deck
 *   - vertical wheel → horizontal scroll, so a normal mouse can reach the ends
 *
 * Pure DOM, no app state. Factory returns a disposable controller.
 */

export interface RibbonOverflowController {
  /** Re-measure and refresh state classes (call after a tab/content change). */
  update(): void;
  dispose(): void;
}

const EPSILON = 2; // sub-pixel slack so the end states latch cleanly

export function initRibbonOverflow(
  deck: HTMLElement,
  scroller: HTMLElement,
): RibbonOverflowController {
  let rafId = 0;

  const apply = () => {
    rafId = 0;
    const max = scroller.scrollWidth - scroller.clientWidth;
    const left = scroller.scrollLeft;
    const overflowing = max > EPSILON;
    deck.classList.toggle('can-scroll-left', overflowing && left > EPSILON);
    deck.classList.toggle('can-scroll-right', overflowing && left < max - EPSILON);
  };

  const update = () => {
    if (rafId) return;
    rafId = requestAnimationFrame(apply);
  };

  const onScroll = () => update();

  // Vertical wheel → horizontal scroll (only when there is room to move).
  const onWheel = (e: WheelEvent) => {
    if (e.deltaX !== 0) return; // trackpad already scrolls horizontally
    const max = scroller.scrollWidth - scroller.clientWidth;
    if (max <= EPSILON) return;
    const atStart = scroller.scrollLeft <= EPSILON && e.deltaY < 0;
    const atEnd = scroller.scrollLeft >= max - EPSILON && e.deltaY > 0;
    if (atStart || atEnd) return;
    e.preventDefault();
    scroller.scrollLeft += e.deltaY;
  };

  const onChevron = (e: Event) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-ribbon-scroll]');
    if (!btn) return;
    const dir = Number(btn.dataset.ribbonScroll) || 1;
    const page = Math.max(160, scroller.clientWidth * 0.8);
    scroller.scrollBy({ left: dir * page, behavior: 'smooth' });
  };

  scroller.addEventListener('scroll', onScroll, { passive: true });
  scroller.addEventListener('wheel', onWheel, { passive: false });
  deck.addEventListener('click', onChevron);

  const ro = new ResizeObserver(update);
  ro.observe(scroller);
  // Tab switches toggle `.hidden` on workspaces → subtree mutation changes width.
  const mo = new MutationObserver(update);
  mo.observe(scroller, { attributes: true, childList: true, subtree: true });

  update();

  return {
    update,
    dispose() {
      if (rafId) cancelAnimationFrame(rafId);
      scroller.removeEventListener('scroll', onScroll);
      scroller.removeEventListener('wheel', onWheel);
      deck.removeEventListener('click', onChevron);
      ro.disconnect();
      mo.disconnect();
    },
  };
}
