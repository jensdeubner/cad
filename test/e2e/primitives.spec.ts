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
 * Reference E2E for the PR0 feature-registry seam. Proves the whole chain:
 * registerFeature → mountFeatures → ribbon button → host.run → real body
 * creation → __cadDebug assertion, with zero console errors. Every feature
 * agent's spec follows this shape.
 */
test.describe('PR0 feature-registry seam — Grundkörper', () => {
  test('registers, mounts and creates a body via the host', async ({ page }) => {
    const guard = await bootApp(page);

    // 1. Registry mounted the three primitive features.
    const ids = await cadDebug<string[]>(page, 'features');
    expect(ids).toEqual(
      expect.arrayContaining(['primitive-box', 'primitive-cylinder', 'primitive-sphere']),
    );

    // 2. Their ribbon buttons exist and are visible on the Solid tab.
    await selectTab(page, 'solid');
    await expect(page.locator('[data-feature="primitive-box"]')).toBeVisible();
    await expect(page.locator('[data-feature="primitive-cylinder"]')).toBeVisible();
    await expect(page.locator('[data-feature="primitive-sphere"]')).toBeVisible();

    // 3. Clicking the real button creates a body (hard state assertion).
    const before = await cadDebug<number>(page, 'bodyCount');
    await clickFeatureButton(page, 'primitive-box');
    await waitForBodyCountAbove(page, before);

    expect(await cadDebug<number>(page, 'bodyCount')).toBeGreaterThan(before);
    expect(await cadDebug<string>(page, 'lastFeature')).toBe('primitive-box');

    // 4. Non-negotiable: no console errors / page errors.
    expectNoConsoleErrors(guard);
  });

  test('runs every primitive via the debug bridge in EN locale', async ({ page }) => {
    const guard = await bootApp(page);
    await page.evaluate(() => localStorage.setItem('cad.locale', 'en'));
    await page.reload();
    await page.waitForFunction(
      () => typeof (window as unknown as { __cadDebug?: unknown }).__cadDebug !== 'undefined',
    );

    for (const id of ['primitive-box', 'primitive-cylinder', 'primitive-sphere']) {
      const before = await cadDebug<number>(page, 'bodyCount');
      await page.evaluate(
        (fid) =>
          (
            window as unknown as { __cadDebug: { runFeature: (i: string) => Promise<void> } }
          ).__cadDebug.runFeature(fid),
        id,
      );
      await waitForBodyCountAbove(page, before);
    }

    expect(await cadDebug<number>(page, 'bodyCount')).toBeGreaterThanOrEqual(3);
    expectNoConsoleErrors(guard);
  });
});
