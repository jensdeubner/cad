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
 * E2E for the Duplicate-body feature. Proves the whole chain:
 * registerFeature → mountFeatures → real ribbon button → host.run → a brand-new
 * duplicated body, with zero console errors. We seed a box as the source body
 * and assert a new body with real triangles appears. EN locale.
 */
test.describe('Körper duplizieren (Duplicate body)', () => {
  test('the ribbon button duplicates the active body into a new body (EN)', async ({ page }) => {
    const guard = await bootApp(page);
    await page.evaluate(() => localStorage.setItem('cad.locale', 'en'));
    await page.reload();
    await page.waitForFunction(
      () => typeof (window as unknown as { __cadDebug?: unknown }).__cadDebug !== 'undefined',
    );

    // 0. Feature is registered.
    const ids = await cadDebug<string[]>(page, 'features');
    expect(ids).toContain('solid-duplicate');

    // 1. Seed a source body (box — a real, non-empty solid).
    await runFeature(page, 'primitive-box');
    await waitForBodyCountAbove(page, 0);
    const before = await cadDebug<number>(page, 'bodyCount');
    expect(before).toBeGreaterThan(0);

    // 2. The real ribbon button exists on the Solid tab and is clickable.
    await selectTab(page, 'solid');
    await expect(page.locator('[data-feature="solid-duplicate"]')).toBeVisible();
    await clickFeatureButton(page, 'solid-duplicate');

    // 3. A new duplicated body appeared (hard state assertion).
    await waitForBodyCountAbove(page, before);
    expect(await cadDebug<number>(page, 'bodyCount')).toBeGreaterThan(before);
    expect(await cadDebug<string>(page, 'lastFeature')).toBe('solid-duplicate');

    // 4. The active (duplicated) body has real geometry.
    expect(await cadDebug<number>(page, 'triangleCount')).toBeGreaterThan(0);

    // 5. The feature stashed its result flag for downstream assertions.
    const ok = await page.evaluate(
      () =>
        (window as unknown as { __cadFeature?: { duplicate?: { ok?: boolean } } }).__cadFeature
          ?.duplicate?.ok,
    );
    expect(ok).toBe(true);

    // 6. Non-negotiable: no console errors / page errors.
    expectNoConsoleErrors(guard);
  });

  test('runs via the debug bridge and produces a body with triangles', async ({ page }) => {
    const guard = await bootApp(page);

    await runFeature(page, 'primitive-box');
    await waitForBodyCountAbove(page, 0);
    const before = await cadDebug<number>(page, 'bodyCount');

    await runFeature(page, 'solid-duplicate');
    await waitForBodyCountAbove(page, before);

    expect(await cadDebug<number>(page, 'bodyCount')).toBeGreaterThan(before);
    expect(await cadDebug<number>(page, 'triangleCount')).toBeGreaterThan(0);

    expectNoConsoleErrors(guard);
  });
});
