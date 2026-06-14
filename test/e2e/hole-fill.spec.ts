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

interface HoleFillStats {
  holesBefore: number;
  holesAfter: number;
  addedTriangles: number;
  triangles: number;
}

/** Read `window.__cadFeature['hole-fill']` produced by the mesh-hole-fill feature. */
async function holeFillStats(page: Page): Promise<HoleFillStats> {
  return page.evaluate(
    () =>
      (window as unknown as { __cadFeature: { ['hole-fill']: HoleFillStats } }).__cadFeature[
        'hole-fill'
      ],
  );
}

/**
 * E2E for Hole-Fill / Make Watertight. A primitive box is already closed, so
 * running hole-fill must leave it watertight (holesAfter === 0) with its 12
 * triangles intact. Runs once in EN locale via the debug bridge and once via
 * the real ribbon button on the Body tab. Zero console errors is non-negotiable.
 */
test.describe('mesh-hole-fill — Löcher füllen', () => {
  test('closed box stays watertight (EN locale, debug bridge)', async ({ page }) => {
    const guard = await bootApp(page);
    await page.evaluate(() => localStorage.setItem('cad.locale', 'en'));
    await page.reload();
    await page.waitForFunction(
      () => typeof (window as unknown as { __cadDebug?: unknown }).__cadDebug !== 'undefined',
    );

    // Test geometry: 20 mm box — 12 tris, already closed.
    const before = await cadDebug<number>(page, 'bodyCount');
    await runFeature(page, 'primitive-box');
    await waitForBodyCountAbove(page, before);

    expect(await cadDebug<number>(page, 'triangleCount')).toBe(12);

    await runFeature(page, 'mesh-hole-fill');

    const stats = await holeFillStats(page);
    expect(stats.holesAfter).toBe(0); // hard state assertion: watertight
    expect(stats.holesBefore).toBe(0); // a primitive box has no holes
    expect(stats.addedTriangles).toBe(0);
    expect(stats.triangles).toBe(12); // triangle count stays 12

    // Geometry in scene unchanged at 12 triangles.
    expect(await cadDebug<number>(page, 'triangleCount')).toBe(12);
    expect(await cadDebug<string>(page, 'lastFeature')).toBe('mesh-hole-fill');

    expectNoConsoleErrors(guard);
  });

  test('runs via the real ribbon button on the Body tab', async ({ page }) => {
    const guard = await bootApp(page);

    const before = await cadDebug<number>(page, 'bodyCount');
    await runFeature(page, 'primitive-box');
    await waitForBodyCountAbove(page, before);

    // Real button path: select the Body tab and click the mounted button.
    await selectTab(page, 'body');
    await expect(page.locator('[data-feature="mesh-hole-fill"]')).toBeVisible();
    await clickFeatureButton(page, 'mesh-hole-fill');

    await page.waitForFunction(
      () =>
        (window as unknown as { __cadFeature?: { ['hole-fill']?: HoleFillStats } }).__cadFeature?.[
          'hole-fill'
        ] !== undefined,
    );

    const stats = await holeFillStats(page);
    expect(stats.holesAfter).toBe(0);
    expect(stats.triangles).toBe(12);
    expect(await cadDebug<number>(page, 'triangleCount')).toBe(12);
    expect(await cadDebug<string>(page, 'lastFeature')).toBe('mesh-hole-fill');

    expectNoConsoleErrors(guard);
  });
});
