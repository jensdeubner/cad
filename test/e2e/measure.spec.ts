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

/** Read `window.__cadFeature.measure` from the page. */
async function measureBridge(page: import('@playwright/test').Page) {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          __cadFeature?: {
            measure?: {
              diagonal: number;
              bbox: { min: number[]; max: number[] };
              pointDistance?: number;
            };
          };
        }
      ).__cadFeature?.measure ?? null,
  );
}

/**
 * 3D measurement tool — proves the whole chain: a 20 mm box (−10..10) yields a
 * world-space bbox diagonal of sqrt(3)·20 ≈ 34.641 mm. Runs once via the debug
 * bridge and once via the real ribbon button, drawing measurement overlays.
 * EN locale, zero console errors.
 */
test.describe('feat/measure — 3D-Messwerkzeug', () => {
  const EXPECTED = Math.sqrt(3) * 20; // ≈ 34.641
  const TOL = EXPECTED * 0.02; // ±2 %

  test('quick-measures the active body diagonal in EN locale', async ({ page }) => {
    const guard = await bootApp(page);

    // EN locale.
    await page.evaluate(() => localStorage.setItem('cad.locale', 'en'));
    await page.reload();
    await page.waitForFunction(
      () => typeof (window as unknown as { __cadDebug?: unknown }).__cadDebug !== 'undefined',
    );

    // Deterministic test geometry: 20 mm box spanning −10..10.
    const before = await cadDebug<number>(page, 'bodyCount');
    await runFeature(page, 'primitive-box');
    await waitForBodyCountAbove(page, before);

    const overlayBefore = await cadDebug<number>(page, 'overlayCount');

    // Run the measure feature via the bridge.
    await runFeature(page, 'inspect-measure');

    // Hard assertion: bbox diagonal ≈ sqrt(3)*20.
    const bridge = await measureBridge(page);
    expect(bridge, 'window.__cadFeature.measure was not set').not.toBeNull();
    expect(bridge!.diagonal).toBeGreaterThan(EXPECTED - TOL);
    expect(bridge!.diagonal).toBeLessThan(EXPECTED + TOL);

    // World bbox spans roughly −10..10.
    expect(bridge!.bbox.min[0]).toBeCloseTo(-10, 3);
    expect(bridge!.bbox.max[0]).toBeCloseTo(10, 3);

    // The diagonal line + endpoint markers were drawn into the overlay.
    expect(await cadDebug<number>(page, 'overlayCount')).toBeGreaterThan(overlayBefore);
    expect(await cadDebug<string>(page, 'lastFeature')).toBe('inspect-measure');

    expectNoConsoleErrors(guard);
  });

  test('runs via the real ribbon button on the Body tab', async ({ page }) => {
    const guard = await bootApp(page);

    const before = await cadDebug<number>(page, 'bodyCount');
    await runFeature(page, 'primitive-box');
    await waitForBodyCountAbove(page, before);

    // Real ribbon: Body tab → measure button.
    await selectTab(page, 'body');
    await expect(page.locator('[data-feature="inspect-measure"]')).toBeVisible();
    await clickFeatureButton(page, 'inspect-measure');

    await page.waitForFunction(() => {
      const m = (
        window as unknown as { __cadFeature?: { measure?: { diagonal?: number } } }
      ).__cadFeature?.measure;
      return typeof m?.diagonal === 'number';
    });

    const bridge = await measureBridge(page);
    expect(bridge!.diagonal).toBeGreaterThan(EXPECTED - TOL);
    expect(bridge!.diagonal).toBeLessThan(EXPECTED + TOL);

    expectNoConsoleErrors(guard);
  });
});
