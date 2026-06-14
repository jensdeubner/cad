/**
 * Shared E2E helpers (PR0). The app exposes a read-only `window.__cadDebug`
 * bridge so tests can assert real state (body counts, active tool, last
 * feature) instead of just DOM presence.
 */
import { type Page, expect } from '@playwright/test';

export interface ConsoleGuard {
  errors: string[];
}

/** Attach console-error + pageerror capture. Inspect `.errors` after the run. */
export function captureConsoleErrors(page: Page): ConsoleGuard {
  const guard: ConsoleGuard = { errors: [] };
  page.on('console', (m) => {
    if (m.type() === 'error') {
      const loc = m.location();
      guard.errors.push(`${m.text()} @ ${loc.url}:${loc.lineNumber}:${loc.columnNumber}`);
    }
  });
  page.on('pageerror', (e) => guard.errors.push(e.stack ?? String(e)));
  return guard;
}

/** Navigate to the app and wait until boot finished (`__cadDebug` installed). */
export async function bootApp(page: Page): Promise<ConsoleGuard> {
  const guard = captureConsoleErrors(page);
  await page.goto('/');
  await page.waitForFunction(
    () => typeof (window as unknown as { __cadDebug?: unknown }).__cadDebug !== 'undefined',
    undefined,
    { timeout: 30_000 },
  );
  return guard;
}

/** Call a `__cadDebug` getter (e.g. `bodyCount`, `activeTool`, `features`). */
export async function cadDebug<T>(page: Page, fn: string, ...args: unknown[]): Promise<T> {
  return page.evaluate(
    ({ fn, args }) => {
      const dbg = (window as unknown as { __cadDebug: Record<string, (...a: unknown[]) => unknown> })
        .__cadDebug;
      return dbg[fn](...args) as unknown;
    },
    { fn, args },
  ) as Promise<T>;
}

/** Trigger a registered feature by id via the debug bridge (tab-independent). */
export async function runFeature(page: Page, id: string): Promise<void> {
  await page.evaluate(
    (id) =>
      (window as unknown as { __cadDebug: { runFeature: (id: string) => Promise<void> } }).__cadDebug
        .runFeature(id),
    id,
  );
}

/** Switch the ribbon to a tab by its `data-fusion-tab` value. */
export async function selectTab(page: Page, tab: string): Promise<void> {
  await page.locator(`[data-fusion-tab="${tab}"]`).click();
}

/** Click a feature's ribbon button by its `data-feature` id. */
export async function clickFeatureButton(page: Page, id: string): Promise<void> {
  await page.locator(`[data-feature="${id}"]`).first().click();
}

/** Hard gate: zero console errors during the run. */
export function expectNoConsoleErrors(guard: ConsoleGuard): void {
  expect(guard.errors, guard.errors.join('\n')).toHaveLength(0);
}

/** Wait until `__cadDebug.bodyCount()` exceeds `baseline`. */
export async function waitForBodyCountAbove(page: Page, baseline: number, timeout = 15_000): Promise<void> {
  await page.waitForFunction(
    (b) =>
      (window as unknown as { __cadDebug: { bodyCount: () => number } }).__cadDebug.bodyCount() >
      (b as number),
    baseline,
    { timeout },
  );
}
