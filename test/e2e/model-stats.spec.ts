import { test, expect } from '@playwright/test';
import {
  bootApp,
  runFeature,
  selectTab,
  clickFeatureButton,
  expectNoConsoleErrors,
} from './_helpers';

/**
 * E2E for the 3D-Modell-Statistik feature. Builds a 20 mm box (−10..10),
 * runs the analyser both via the debug bridge AND via the real ribbon button,
 * and asserts the hard numbers (volume / area / triangle count / bbox) it
 * stashes on `window.__cadFeature.stats`. Zero console errors throughout.
 */

interface Stats {
  volume: number;
  area: number;
  triangleCount: number;
  centroid: [number, number, number];
  bbox: { min: [number, number, number]; max: [number, number, number] };
}

async function readStats(page: import('@playwright/test').Page): Promise<Stats> {
  return page.evaluate(
    () => (window as unknown as { __cadFeature: { stats: Stats } }).__cadFeature.stats,
  );
}

function assertBoxStats(stats: Stats): void {
  // 20 mm cube: volume 8000 mm³, area 2400 mm², 12 triangles, bbox −10..10.
  expect(stats.volume).toBeGreaterThan(8000 * 0.95);
  expect(stats.volume).toBeLessThan(8000 * 1.05);
  expect(stats.area).toBeGreaterThan(2400 * 0.95);
  expect(stats.area).toBeLessThan(2400 * 1.05);
  expect(stats.triangleCount).toBe(12);

  for (const v of stats.bbox.min) expect(v).toBeCloseTo(-10, 3);
  for (const v of stats.bbox.max) expect(v).toBeCloseTo(10, 3);

  // Centroid of a centered box is the origin.
  for (const c of stats.centroid) expect(c).toBeCloseTo(0, 3);
}

test.describe('inspect-stats — 3D model statistics', () => {
  test('computes box volume/area/bbox via bridge and ribbon button (DE)', async ({ page }) => {
    const guard = await bootApp(page);

    // 1. Feature registered + mounted.
    const ids = await page.evaluate(
      () => (window as unknown as { __cadDebug: { features: () => string[] } }).__cadDebug.features(),
    );
    expect(ids).toContain('inspect-stats');

    // 2. Build deterministic test geometry: a 20 mm box (−10..10).
    await runFeature(page, 'primitive-box');

    // 3a. Run via the debug bridge and assert the stashed numbers.
    await runFeature(page, 'inspect-stats');
    assertBoxStats(await readStats(page));
    expect(
      await page.evaluate(
        () => (window as unknown as { __cadDebug: { lastFeature: () => string } }).__cadDebug.lastFeature(),
      ),
    ).toBe('inspect-stats');

    // 3b. Run once via the REAL ribbon button on the Body tab.
    await selectTab(page, 'body');
    await expect(page.locator('[data-feature="inspect-stats"]')).toBeVisible();
    await page.evaluate(() => {
      delete (window as unknown as { __cadFeature?: { stats?: unknown } }).__cadFeature?.stats;
    });
    await clickFeatureButton(page, 'inspect-stats');
    await page.waitForFunction(
      () => Boolean((window as unknown as { __cadFeature?: { stats?: unknown } }).__cadFeature?.stats),
    );
    assertBoxStats(await readStats(page));

    expectNoConsoleErrors(guard);
  });

  test('computes box stats in EN locale', async ({ page }) => {
    const guard = await bootApp(page);
    await page.evaluate(() => localStorage.setItem('cad.locale', 'en'));
    await page.reload();
    await page.waitForFunction(
      () => typeof (window as unknown as { __cadDebug?: unknown }).__cadDebug !== 'undefined',
    );

    await runFeature(page, 'primitive-box');
    await runFeature(page, 'inspect-stats');
    assertBoxStats(await readStats(page));

    // Status line should be the EN catalogue ("Area", not "Fläche").
    const status = await page.evaluate(
      () => (window as unknown as { __cadDebug: { status: () => string } }).__cadDebug.status(),
    );
    expect(status).toContain('Area');

    expectNoConsoleErrors(guard);
  });
});
