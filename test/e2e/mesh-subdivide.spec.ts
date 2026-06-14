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

interface SubdivideStats {
  before: number;
  after: number;
}

/** Read `window.__cadFeature.subdivide` produced by the mesh-subdivide feature. */
async function subdivideStats(
  page: import('@playwright/test').Page,
): Promise<SubdivideStats> {
  return page.evaluate(
    () =>
      (window as unknown as { __cadFeature: { subdivide: SubdivideStats } }).__cadFeature
        .subdivide,
  );
}

/**
 * E2E for Mesh unterteilen (Subdivide). One subdivision level splits every
 * triangle into four via its edge midpoints, so a 20 mm box (12 tris) must
 * become exactly 48. Drives the real ribbon button on the Body tab; runs in
 * EN locale; zero console errors is non-negotiable.
 */
test.describe('mesh-subdivide — Mesh unterteilen', () => {
  test('subdivides the box (12 → 48 triangles) via the debug bridge', async ({ page }) => {
    const guard = await bootApp(page);
    await page.evaluate(() => localStorage.setItem('cad.locale', 'en'));
    await page.reload();
    await page.waitForFunction(
      () => typeof (window as unknown as { __cadDebug?: unknown }).__cadDebug !== 'undefined',
    );

    // Test geometry: 20 mm box — 12 tris.
    const before = await cadDebug<number>(page, 'bodyCount');
    await runFeature(page, 'primitive-box');
    await waitForBodyCountAbove(page, before);

    const trisBefore = await cadDebug<number>(page, 'triangleCount');
    expect(trisBefore).toBe(12);

    // Subdivide once via the bridge.
    await runFeature(page, 'mesh-subdivide');

    const stats = await subdivideStats(page);
    expect(stats.before).toBe(12);
    expect(stats.after).toBe(48); // exactly 4× the input
    expect(stats.after).toBe(stats.before * 4);

    // Hard state assertion: the live mesh now carries 48 triangles.
    expect(await cadDebug<number>(page, 'triangleCount')).toBe(48);
    expect(await cadDebug<string>(page, 'lastFeature')).toBe('mesh-subdivide');

    expectNoConsoleErrors(guard);
  });

  test('subdivides via the real ribbon button on the Body tab', async ({ page }) => {
    const guard = await bootApp(page);

    const before = await cadDebug<number>(page, 'bodyCount');
    await runFeature(page, 'primitive-box');
    await waitForBodyCountAbove(page, before);

    const trisBefore = await cadDebug<number>(page, 'triangleCount');
    expect(trisBefore).toBe(12);

    // Real button path: select the Body tab and click the mounted button.
    await selectTab(page, 'body');
    await expect(page.locator('[data-feature="mesh-subdivide"]')).toBeVisible();
    await clickFeatureButton(page, 'mesh-subdivide');

    await page.waitForFunction(
      () =>
        (window as unknown as { __cadFeature?: { subdivide?: SubdivideStats } }).__cadFeature
          ?.subdivide !== undefined,
    );

    const stats = await subdivideStats(page);
    expect(stats.before).toBe(12);
    expect(stats.after).toBe(48);
    expect(stats.after).toBe(stats.before * 4);

    expect(await cadDebug<number>(page, 'triangleCount')).toBe(48);
    expect(await cadDebug<string>(page, 'lastFeature')).toBe('mesh-subdivide');

    expectNoConsoleErrors(guard);
  });
});
