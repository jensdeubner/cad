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

interface WeldStats {
  before: number;
  after: number;
}

/** Read `window.__cadFeature.weld` produced by the mesh-weld feature. */
async function weldStats(page: import('@playwright/test').Page): Promise<WeldStats> {
  return page.evaluate(
    () =>
      (window as unknown as { __cadFeature: { weld: WeldStats } }).__cadFeature.weld,
  );
}

/**
 * E2E for Make Closed / Weld (Vertex-Verschweißen). A BoxGeometry ships 24
 * position vertices (4 per face × 6 faces) but only 8 geometric corners, so
 * welding within epsilon must collapse 24 → 8 while keeping all 12 triangles
 * intact. Runs in EN locale; zero console errors is non-negotiable.
 */
test.describe('mesh-weld — Vertex-Verschweißen', () => {
  test('welds the box corners (24 → 8 vertices) via the debug bridge', async ({ page }) => {
    const guard = await bootApp(page);
    await page.evaluate(() => localStorage.setItem('cad.locale', 'en'));
    await page.reload();
    await page.waitForFunction(
      () => typeof (window as unknown as { __cadDebug?: unknown }).__cadDebug !== 'undefined',
    );

    // Test geometry: 20 mm box — 24 verts, 12 tris.
    const before = await cadDebug<number>(page, 'bodyCount');
    await runFeature(page, 'primitive-box');
    await waitForBodyCountAbove(page, before);

    const trisBefore = await cadDebug<number>(page, 'triangleCount');
    expect(trisBefore).toBe(12);

    // Weld via the bridge.
    await runFeature(page, 'mesh-weld');

    const stats = await weldStats(page);
    expect(stats.before).toBe(24);
    expect(stats.after).toBe(8);
    expect(stats.after).toBeLessThan(stats.before);
    expect(stats.after).toBeGreaterThan(0);

    // Triangles preserved: a cube has no degenerate faces.
    expect(await cadDebug<number>(page, 'triangleCount')).toBe(12);
    expect(await cadDebug<string>(page, 'lastFeature')).toBe('mesh-weld');

    expectNoConsoleErrors(guard);
  });

  test('welds via the real ribbon button on the Body tab', async ({ page }) => {
    const guard = await bootApp(page);

    const before = await cadDebug<number>(page, 'bodyCount');
    await runFeature(page, 'primitive-box');
    await waitForBodyCountAbove(page, before);

    // Real button path: select the Body tab and click the mounted button.
    await selectTab(page, 'body');
    await expect(page.locator('[data-feature="mesh-weld"]')).toBeVisible();
    await clickFeatureButton(page, 'mesh-weld');

    await page.waitForFunction(
      () =>
        (window as unknown as { __cadFeature?: { weld?: WeldStats } }).__cadFeature?.weld !==
        undefined,
    );

    const stats = await weldStats(page);
    expect(stats.before).toBe(24);
    expect(stats.after).toBe(8);
    expect(await cadDebug<number>(page, 'triangleCount')).toBe(12);
    expect(await cadDebug<string>(page, 'lastFeature')).toBe('mesh-weld');

    expectNoConsoleErrors(guard);
  });
});
