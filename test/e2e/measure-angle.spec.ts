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

/** Read `window.__cadFeature['measure-angle']` from the page. */
async function angleBridge(page: import('@playwright/test').Page) {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          __cadFeature?: {
            'measure-angle'?: {
              angle: number;
              vertex: number[];
              a: number[];
              c: number[];
              pointAngle?: number;
            };
          };
        }
      ).__cadFeature?.['measure-angle'] ?? null,
  );
}

/**
 * 3D angle measurement tool — proves the whole chain: an axis-aligned 20 mm box
 * yields a 90° angle at the corner V=(min) between rays toward A=(max.x,…) and
 * C=(…,max.y,…). Runs once via the debug bridge (EN locale) and once via the
 * real ribbon button, drawing measurement overlays. Zero console errors.
 */
test.describe('feat/measure-angle — 3D-Winkelmesswerkzeug', () => {
  const EXPECTED = 90;
  const TOL = 0.5;

  test('quick-measures the active body corner angle in EN locale', async ({ page }) => {
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

    // Run the angle-measure feature via the bridge.
    await runFeature(page, 'inspect-measure-angle');

    // Hard assertion: corner angle ≈ 90° (±0.5°).
    const bridge = await angleBridge(page);
    expect(bridge, "window.__cadFeature['measure-angle'] was not set").not.toBeNull();
    expect(bridge!.angle).toBeGreaterThan(EXPECTED - TOL);
    expect(bridge!.angle).toBeLessThan(EXPECTED + TOL);

    // Corner points: V at (min.x,min.y,…), A at (max.x,…), C at (…,max.y,…).
    expect(bridge!.vertex[0]).toBeCloseTo(-10, 3);
    expect(bridge!.vertex[1]).toBeCloseTo(-10, 3);
    expect(bridge!.a[0]).toBeCloseTo(10, 3);
    expect(bridge!.c[1]).toBeCloseTo(10, 3);

    // The two rays + corner markers were drawn into the overlay.
    expect(await cadDebug<number>(page, 'overlayCount')).toBeGreaterThan(overlayBefore);
    expect(await cadDebug<string>(page, 'lastFeature')).toBe('inspect-measure-angle');

    expectNoConsoleErrors(guard);
  });

  test('runs via the real ribbon button on the Body tab', async ({ page }) => {
    const guard = await bootApp(page);

    const before = await cadDebug<number>(page, 'bodyCount');
    await runFeature(page, 'primitive-box');
    await waitForBodyCountAbove(page, before);

    // Real ribbon: Body tab → measure-angle button.
    await selectTab(page, 'body');
    await expect(page.locator('[data-feature="inspect-measure-angle"]')).toBeVisible();
    await clickFeatureButton(page, 'inspect-measure-angle');

    await page.waitForFunction(() => {
      const m = (
        window as unknown as { __cadFeature?: { 'measure-angle'?: { angle?: number } } }
      ).__cadFeature?.['measure-angle'];
      return typeof m?.angle === 'number';
    });

    const bridge = await angleBridge(page);
    expect(bridge!.angle).toBeGreaterThan(EXPECTED - TOL);
    expect(bridge!.angle).toBeLessThan(EXPECTED + TOL);
    expect(await cadDebug<string>(page, 'lastFeature')).toBe('inspect-measure-angle');

    expectNoConsoleErrors(guard);
  });
});
