import { test, expect } from '@playwright/test';
import {
  bootApp,
  cadDebug,
  runFeature,
  selectTab,
  clickFeatureButton,
  expectNoConsoleErrors,
} from './_helpers';

/** Read our feature's exposed `window.__cadFeature.construct` payload. */
async function constructState(page: import('@playwright/test').Page) {
  return page.evaluate(
    () =>
      (window as unknown as { __cadFeature?: { construct?: { added: boolean; objects: number } } })
        .__cadFeature?.construct ?? null,
  );
}

test.describe('Konstruktionsgeometrie — Achse + Punkt', () => {
  test('adds construction axes + origin point to the overlay (bridge + ribbon)', async ({
    page,
  }) => {
    const guard = await bootApp(page);

    // The feature registered itself.
    const ids = await cadDebug<string[]>(page, 'features');
    expect(ids).toContain('construct-axis-point');

    // Baseline overlay child count before running anything.
    const baseline = await cadDebug<number>(page, 'overlayCount');

    // 1. Run via the debug bridge — overlay grows, feature payload set.
    await runFeature(page, 'construct-axis-point');
    const afterBridge = await cadDebug<number>(page, 'overlayCount');
    expect(afterBridge).toBeGreaterThan(baseline);

    const state1 = await constructState(page);
    expect(state1).not.toBeNull();
    expect(state1!.added).toBe(true);
    expect(state1!.objects).toBeGreaterThan(0);
    expect(await cadDebug<string>(page, 'lastFeature')).toBe('construct-axis-point');

    // 2. Run again via the REAL ribbon button (Body tab) — idempotent clear-add.
    await selectTab(page, 'body');
    await expect(page.locator('[data-feature="construct-axis-point"]')).toBeVisible();
    await clickFeatureButton(page, 'construct-axis-point');

    const afterRibbon = await cadDebug<number>(page, 'overlayCount');
    // Clear-then-add: overlay must NOT keep growing — same count as after first run.
    expect(afterRibbon).toBe(afterBridge);
    expect(afterRibbon).toBeGreaterThan(baseline);

    const state2 = await constructState(page);
    expect(state2!.added).toBe(true);

    // 3. A third run stays bounded too.
    await clickFeatureButton(page, 'construct-axis-point');
    expect(await cadDebug<number>(page, 'overlayCount')).toBe(afterBridge);

    // Non-negotiable: zero console / page errors.
    expectNoConsoleErrors(guard);
  });

  test('runs in EN locale without console errors', async ({ page }) => {
    const guard = await bootApp(page);
    await page.evaluate(() => localStorage.setItem('cad.locale', 'en'));
    await page.reload();
    await page.waitForFunction(
      () => typeof (window as unknown as { __cadDebug?: unknown }).__cadDebug !== 'undefined',
    );

    const baseline = await cadDebug<number>(page, 'overlayCount');
    await runFeature(page, 'construct-axis-point');
    expect(await cadDebug<number>(page, 'overlayCount')).toBeGreaterThan(baseline);

    const state = await constructState(page);
    expect(state!.added).toBe(true);

    expectNoConsoleErrors(guard);
  });
});
