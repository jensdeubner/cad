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
 * E2E for the Convex Hull feature. Proves the whole chain: a source body
 * (sphere) → run via debug bridge AND via the real ribbon button → a brand-new
 * hull body with triangles, zero console errors. EN-locale pass included.
 */
test.describe('feat/convex-hull — Konvexe Hülle', () => {
  // The Solid ribbon has many groups; the Create group (our button) is last and
  // would sit in the horizontal overflow at the default 1280px width. Give this
  // suite a wider viewport so the real ribbon button is fully on-screen.
  test.use({ viewport: { width: 1600, height: 900 } });

  test('builds a convex hull body via bridge and real ribbon button', async ({ page }) => {
    const guard = await bootApp(page);

    // Source geometry: a sphere → many vertices to wrap.
    await runFeature(page, 'primitive-sphere');
    await waitForBodyCountAbove(page, 0);

    // The feature registered and its ribbon button is visible on Solid.
    const ids = await cadDebug<string[]>(page, 'features');
    expect(ids).toContain('solid-convex-hull');
    await selectTab(page, 'solid');
    await expect(page.locator('[data-feature="solid-convex-hull"]')).toBeVisible();

    // 1. Run via the REAL ribbon button (full mount → host chain).
    let before = await cadDebug<number>(page, 'bodyCount');
    await clickFeatureButton(page, 'solid-convex-hull');
    await waitForBodyCountAbove(page, before);
    expect(await cadDebug<number>(page, 'bodyCount')).toBeGreaterThan(before);
    expect(await cadDebug<string>(page, 'lastFeature')).toBe('solid-convex-hull');

    // The new hull body has real triangles.
    expect(await cadDebug<number>(page, 'triangleCount')).toBeGreaterThan(0);

    // Our own metric exposes the hull triangle count.
    const tris = await page.evaluate(
      () =>
        (window as unknown as { __cadFeature: { convexHull: { tris: number } } }).__cadFeature
          .convexHull.tris,
    );
    expect(tris).toBeGreaterThan(0);

    // 2. Run once more via the debug bridge (tab-independent).
    before = await cadDebug<number>(page, 'bodyCount');
    await runFeature(page, 'solid-convex-hull');
    await waitForBodyCountAbove(page, before);
    expect(await cadDebug<number>(page, 'bodyCount')).toBeGreaterThan(before);

    // Non-negotiable: no console errors / page errors.
    expectNoConsoleErrors(guard);
  });

  test('runs in EN locale without console errors', async ({ page }) => {
    const guard = await bootApp(page);
    await page.evaluate(() => localStorage.setItem('cad.locale', 'en'));
    await page.reload();
    await page.waitForFunction(
      () => typeof (window as unknown as { __cadDebug?: unknown }).__cadDebug !== 'undefined',
    );

    await runFeature(page, 'primitive-box');
    await waitForBodyCountAbove(page, 0);

    const before = await cadDebug<number>(page, 'bodyCount');
    await runFeature(page, 'solid-convex-hull');
    await waitForBodyCountAbove(page, before);

    expect(await cadDebug<number>(page, 'bodyCount')).toBeGreaterThan(before);
    expect(await cadDebug<number>(page, 'triangleCount')).toBeGreaterThan(0);
    expectNoConsoleErrors(guard);
  });
});
