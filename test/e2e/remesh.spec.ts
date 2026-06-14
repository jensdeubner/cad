import { test, expect, type Page } from '@playwright/test';
import {
  bootApp,
  cadDebug,
  runFeature,
  selectTab,
  clickFeatureButton,
  expectNoConsoleErrors,
  waitForBodyCountAbove,
} from './_helpers';

interface RemeshStats {
  before: number;
  after: number;
  targetLen: number;
  maxEdgeAfter: number;
}

/** Read `window.__cadFeature.remesh` produced by the mesh-remesh feature. */
async function remeshStats(page: Page): Promise<RemeshStats> {
  return page.evaluate(
    () =>
      (window as unknown as { __cadFeature: { remesh: RemeshStats } }).__cadFeature.remesh,
  );
}

/**
 * E2E for Remesh (refine). The feature uniformly subdivides the active body's
 * mesh until every edge is <= 1/8 of its world bbox diagonal — raising triangle
 * density WITHOUT distorting geometry. A 20 mm box (12 tris) must blow up well
 * past a dozen triangles and end with a longest edge at or under the target.
 * Runs in EN locale; drives the real ribbon button on the Body tab; zero
 * console errors is non-negotiable.
 */
test.describe('mesh-remesh — Remesh (refine)', () => {
  test('refines the box past 12 triangles, edges within target (EN, debug bridge)', async ({
    page,
  }) => {
    const guard = await bootApp(page);

    // EN locale: set, reload, wait for the bridge to come back.
    await page.evaluate(() => localStorage.setItem('cad.locale', 'en'));
    await page.reload();
    await page.waitForFunction(
      () => typeof (window as unknown as { __cadDebug?: unknown }).__cadDebug !== 'undefined',
    );

    // Deterministic test geometry: 20 mm box — 12 tris.
    const baseline = await cadDebug<number>(page, 'bodyCount');
    await runFeature(page, 'primitive-box');
    await waitForBodyCountAbove(page, baseline);

    const trisBefore = await cadDebug<number>(page, 'triangleCount');
    expect(trisBefore).toBe(12);

    // Remesh via the bridge.
    await runFeature(page, 'mesh-remesh');

    const stats = await remeshStats(page);
    expect(stats.before).toBe(12);
    // Hard numeric assertions: refinement strictly grew the mesh well past a
    // dozen triangles, and every edge is now within ~2% of the target.
    expect(stats.after).toBeGreaterThan(stats.before);
    expect(stats.after).toBeGreaterThan(12);
    expect(stats.targetLen).toBeGreaterThan(0);
    expect(stats.maxEdgeAfter).toBeLessThanOrEqual(stats.targetLen * 1.02);

    // Live mesh now carries the refined triangle count.
    const trisAfter = await cadDebug<number>(page, 'triangleCount');
    expect(trisAfter).toBe(stats.after);
    expect(trisAfter).toBeGreaterThan(trisBefore);
    expect(await cadDebug<string>(page, 'lastFeature')).toBe('mesh-remesh');

    expectNoConsoleErrors(guard);
  });

  test('refines via the real ribbon button on the Body tab', async ({ page }) => {
    const guard = await bootApp(page);

    const baseline = await cadDebug<number>(page, 'bodyCount');
    await runFeature(page, 'primitive-box');
    await waitForBodyCountAbove(page, baseline);

    const trisBefore = await cadDebug<number>(page, 'triangleCount');
    expect(trisBefore).toBe(12);

    // Real button path: select the Body tab, confirm the button mounted, click.
    await selectTab(page, 'body');
    await expect(page.locator('[data-feature="mesh-remesh"]')).toBeVisible();
    await clickFeatureButton(page, 'mesh-remesh');

    await page.waitForFunction(
      () =>
        (window as unknown as { __cadFeature?: { remesh?: RemeshStats } }).__cadFeature
          ?.remesh !== undefined,
    );

    const stats = await remeshStats(page);
    expect(stats.before).toBe(12);
    expect(stats.after).toBeGreaterThan(12);
    expect(stats.maxEdgeAfter).toBeLessThanOrEqual(stats.targetLen * 1.02);

    expect(await cadDebug<number>(page, 'triangleCount')).toBe(stats.after);
    expect(await cadDebug<string>(page, 'lastFeature')).toBe('mesh-remesh');

    expectNoConsoleErrors(guard);
  });
});
