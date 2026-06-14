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
 * E2E for the Mirror-across-plane feature. Proves the whole chain:
 * registerFeature → mountFeatures → real ribbon button → host.run → a brand-new
 * mirrored body, with zero console errors. We seed a sphere as the source body
 * (any non-empty solid works) and assert a new body with real triangles + a
 * bounding box appears. EN locale.
 */
test.describe('Spiegeln über Ursprungsebene (Mirror across plane)', () => {
  test('the ribbon button mirrors the active body into a new body (EN)', async ({ page }) => {
    const guard = await bootApp(page);
    await page.evaluate(() => localStorage.setItem('cad.locale', 'en'));
    await page.reload();
    await page.waitForFunction(
      () => typeof (window as unknown as { __cadDebug?: unknown }).__cadDebug !== 'undefined',
    );

    // 0. Feature is registered.
    const ids = await cadDebug<string[]>(page, 'features');
    expect(ids).toContain('solid-mirror-plane');

    // 1. Seed a source body (sphere — a real, non-empty solid).
    await runFeature(page, 'primitive-sphere');
    await waitForBodyCountAbove(page, 0);
    const before = await cadDebug<number>(page, 'bodyCount');
    expect(before).toBeGreaterThan(0);

    // 2. The real ribbon button exists on the Solid tab and is clickable.
    await selectTab(page, 'solid');
    await expect(page.locator('[data-feature="solid-mirror-plane"]')).toBeVisible();
    await clickFeatureButton(page, 'solid-mirror-plane');

    // 3. A new mirrored body appeared (hard state assertion).
    await waitForBodyCountAbove(page, before);
    expect(await cadDebug<number>(page, 'bodyCount')).toBeGreaterThan(before);
    expect(await cadDebug<string>(page, 'lastFeature')).toBe('solid-mirror-plane');

    // 4. The active (mirrored) body has real geometry.
    expect(await cadDebug<number>(page, 'triangleCount')).toBeGreaterThan(0);
    const bbox = await cadDebug<{ min: number[]; max: number[] } | null>(page, 'bbox');
    expect(bbox).not.toBeNull();

    // 5. The feature stashed its plane for downstream assertions.
    const plane = await page.evaluate(
      () =>
        (window as unknown as { __cadFeature?: { mirrorPlane?: { plane?: string } } }).__cadFeature
          ?.mirrorPlane?.plane,
    );
    expect(plane).toBe('xz');

    // 6. Non-negotiable: no console errors / page errors.
    expectNoConsoleErrors(guard);
  });

  test('runs via the debug bridge and produces a body with triangles', async ({ page }) => {
    const guard = await bootApp(page);

    await runFeature(page, 'primitive-box');
    await waitForBodyCountAbove(page, 0);
    const before = await cadDebug<number>(page, 'bodyCount');

    await runFeature(page, 'solid-mirror-plane');
    await waitForBodyCountAbove(page, before);

    expect(await cadDebug<number>(page, 'bodyCount')).toBeGreaterThan(before);
    expect(await cadDebug<number>(page, 'triangleCount')).toBeGreaterThan(0);

    expectNoConsoleErrors(guard);
  });
});
