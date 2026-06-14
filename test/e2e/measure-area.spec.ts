import { test, expect } from '@playwright/test';
import {
  bootApp,
  cadDebug,
  runFeature,
  selectTab,
  clickFeatureButton,
  expectNoConsoleErrors,
  waitForBodyCountAbove,
} from './_helpers';

/** Read `window.__cadFeature['measure-area']` from the page. */
async function areaBridge(page: import('@playwright/test').Page) {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          __cadFeature?: {
            'measure-area'?: { totalArea: number; faceArea?: number; faceTriangles?: number };
          };
        }
      ).__cadFeature?.['measure-area'] ?? null,
  );
}

/**
 * Surface-area measurement tool. A 20 mm box has a total surface area of
 * 6·400 = 2400 mm². Runs once via the debug bridge (EN locale) and once via the
 * real ribbon button on the Body tab, drawing a bbox outline overlay. Zero
 * console errors.
 */
test.describe('feat/measure-area — surface-area tool', () => {
  const EXPECTED = 2400; // 6 * 20²
  const TOL = 20;

  test('quick-measures total surface area in EN locale', async ({ page }) => {
    const guard = await bootApp(page);

    // EN locale.
    await page.evaluate(() => localStorage.setItem('cad.locale', 'en'));
    await page.reload();
    await page.waitForFunction(
      () => typeof (window as unknown as { __cadDebug?: unknown }).__cadDebug !== 'undefined',
    );

    // Deterministic test geometry: 20 mm box.
    const before = await cadDebug<number>(page, 'bodyCount');
    await runFeature(page, 'primitive-box');
    await waitForBodyCountAbove(page, before);

    const overlayBefore = await cadDebug<number>(page, 'overlayCount');

    // Run the area feature via the bridge.
    await runFeature(page, 'inspect-measure-area');

    // Hard assertion: total surface area ≈ 2400 mm².
    const bridge = await areaBridge(page);
    expect(bridge, "window.__cadFeature['measure-area'] was not set").not.toBeNull();
    expect(bridge!.totalArea).toBeGreaterThan(EXPECTED - TOL);
    expect(bridge!.totalArea).toBeLessThan(EXPECTED + TOL);

    // The bbox outline was drawn into the overlay.
    expect(await cadDebug<number>(page, 'overlayCount')).toBeGreaterThan(overlayBefore);
    expect(await cadDebug<string>(page, 'lastFeature')).toBe('inspect-measure-area');

    expectNoConsoleErrors(guard);
  });

  test('runs via the real ribbon button on the Body tab', async ({ page }) => {
    const guard = await bootApp(page);

    const before = await cadDebug<number>(page, 'bodyCount');
    await runFeature(page, 'primitive-box');
    await waitForBodyCountAbove(page, before);

    // Real ribbon: Body tab → measure-area button.
    await selectTab(page, 'body');
    await expect(page.locator('[data-feature="inspect-measure-area"]')).toBeVisible();
    await clickFeatureButton(page, 'inspect-measure-area');

    await page.waitForFunction(() => {
      const a = (
        window as unknown as { __cadFeature?: { 'measure-area'?: { totalArea?: number } } }
      ).__cadFeature?.['measure-area'];
      return typeof a?.totalArea === 'number';
    });

    const bridge = await areaBridge(page);
    expect(bridge!.totalArea).toBeGreaterThan(EXPECTED - TOL);
    expect(bridge!.totalArea).toBeLessThan(EXPECTED + TOL);

    expectNoConsoleErrors(guard);
  });
});
