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

/**
 * E2E for "Weitere Grundkörper" (Torus / Cone / Pyramid). Extends PR0's
 * primitives. Proves each feature creates a real body with triangles via the
 * debug bridge, and at least one via the real ribbon button — with zero
 * console errors. EN locale.
 */
const EXTRA_IDS = ['primitive-torus', 'primitive-cone', 'primitive-pyramid'] as const;

test.describe('Weitere Grundkörper — Torus / Kegel / Pyramide', () => {
  test('each extra primitive creates a body with triangles via the bridge', async ({ page }) => {
    const guard = await bootApp(page);

    // EN locale.
    await page.evaluate(() => localStorage.setItem('cad.locale', 'en'));
    await page.reload();
    await page.waitForFunction(
      () => typeof (window as unknown as { __cadDebug?: unknown }).__cadDebug !== 'undefined',
    );

    // Registry mounted the three extra features.
    const ids = await cadDebug<string[]>(page, 'features');
    expect(ids).toEqual(expect.arrayContaining([...EXTRA_IDS]));

    for (const id of EXTRA_IDS) {
      const before = await cadDebug<number>(page, 'bodyCount');
      await runFeature(page, id);
      await waitForBodyCountAbove(page, before);

      // Hard state assertions: body count grew, last feature is this one,
      // and the new body actually has triangles.
      expect(await cadDebug<number>(page, 'bodyCount')).toBeGreaterThan(before);
      expect(await cadDebug<string>(page, 'lastFeature')).toBe(id);
      expect(await cadDebug<number>(page, 'triangleCount')).toBeGreaterThan(0);
    }

    expect(await cadDebug<number>(page, 'bodyCount')).toBeGreaterThanOrEqual(3);
    expectNoConsoleErrors(guard);
  });

  test('creates a body via the real ribbon button (Solid tab)', async ({ page }) => {
    const guard = await bootApp(page);

    await selectTab(page, 'solid');
    await expect(page.locator('[data-feature="primitive-torus"]')).toBeVisible();
    await expect(page.locator('[data-feature="primitive-cone"]')).toBeVisible();
    await expect(page.locator('[data-feature="primitive-pyramid"]')).toBeVisible();

    const before = await cadDebug<number>(page, 'bodyCount');
    await clickFeatureButton(page, 'primitive-cone');
    await waitForBodyCountAbove(page, before);

    expect(await cadDebug<number>(page, 'bodyCount')).toBeGreaterThan(before);
    expect(await cadDebug<string>(page, 'lastFeature')).toBe('primitive-cone');
    expect(await cadDebug<number>(page, 'triangleCount')).toBeGreaterThan(0);

    expectNoConsoleErrors(guard);
  });
});
