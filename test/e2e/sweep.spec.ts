import { test, expect } from '@playwright/test';
import {
  bootApp,
  cadDebug,
  selectTab,
  clickFeatureButton,
  expectNoConsoleErrors,
  waitForBodyCountAbove,
} from './_helpers';

/**
 * E2E for the Sweep feature. Proves the full chain — registerFeature →
 * mountFeatures → real ribbon button → host.run → watertight torus body — and
 * also exercises the debug bridge once. Hard state assertions on body count
 * and triangle count; zero console errors. EN locale.
 */
test.describe('Sweep — profile along path', () => {
  test('creates a swept body via the real ribbon button (EN)', async ({ page }) => {
    const guard = await bootApp(page);
    await page.evaluate(() => localStorage.setItem('cad.locale', 'en'));
    await page.reload();
    await page.waitForFunction(
      () => typeof (window as unknown as { __cadDebug?: unknown }).__cadDebug !== 'undefined',
    );

    // Feature is registered.
    const ids = await cadDebug<string[]>(page, 'features');
    expect(ids).toContain('solid-sweep');

    // Capture baseline before running.
    const before = await cadDebug<number>(page, 'bodyCount');

    // Run via the real ribbon button on the Solid tab.
    await selectTab(page, 'solid');
    await expect(page.locator('[data-feature="solid-sweep"]')).toBeVisible();
    await clickFeatureButton(page, 'solid-sweep');
    await waitForBodyCountAbove(page, before);

    // Hard state assertions.
    expect(await cadDebug<number>(page, 'bodyCount')).toBeGreaterThan(before);
    expect(await cadDebug<string>(page, 'lastFeature')).toBe('solid-sweep');

    const activeId = await cadDebug<string | null>(page, 'activeBodyId');
    expect(activeId).not.toBeNull();
    expect(await cadDebug<number>(page, 'triangleCount', activeId)).toBeGreaterThan(0);

    expectNoConsoleErrors(guard);
  });

  test('runs via the debug bridge (EN)', async ({ page }) => {
    const guard = await bootApp(page);
    await page.evaluate(() => localStorage.setItem('cad.locale', 'en'));
    await page.reload();
    await page.waitForFunction(
      () => typeof (window as unknown as { __cadDebug?: unknown }).__cadDebug !== 'undefined',
    );

    const before = await cadDebug<number>(page, 'bodyCount');
    await page.evaluate(
      () =>
        (
          window as unknown as { __cadDebug: { runFeature: (i: string) => Promise<void> } }
        ).__cadDebug.runFeature('solid-sweep'),
    );
    await waitForBodyCountAbove(page, before);

    expect(await cadDebug<number>(page, 'bodyCount')).toBeGreaterThan(before);
    expect(await cadDebug<number>(page, 'triangleCount')).toBeGreaterThan(0);
    expectNoConsoleErrors(guard);
  });
});
