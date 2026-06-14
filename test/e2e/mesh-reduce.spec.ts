import { test, expect } from '@playwright/test';
import {
  bootApp,
  cadDebug,
  runFeature,
  selectTab,
  clickFeatureButton,
  expectNoConsoleErrors,
} from './_helpers';

/**
 * E2E for feat/mesh-reduce. Creates a dense sphere (~3000 tris) and decimates
 * it via vertex clustering, asserting the active body's real triangle count
 * dropped (but stayed > 0) — both through the debug bridge and via the real
 * ribbon button on the Body tab. Zero console errors. EN locale.
 */
test.describe('feat/mesh-reduce — vertex-cluster decimation', () => {
  test('reduces the active body triangle count without console errors', async ({ page }) => {
    const guard = await bootApp(page);
    await page.evaluate(() => localStorage.setItem('cad.locale', 'en'));
    await page.reload();
    await page.waitForFunction(
      () => typeof (window as unknown as { __cadDebug?: unknown }).__cadDebug !== 'undefined',
    );

    // The feature must be registered + mounted.
    const ids = await cadDebug<string[]>(page, 'features');
    expect(ids).toContain('mesh-reduce');

    // 1. Dense test geometry — a sphere is ~3000 triangles.
    await runFeature(page, 'primitive-sphere');
    const before = await cadDebug<number>(page, 'triangleCount');
    expect(before).toBeGreaterThan(1000);

    // 2. Run the feature via the debug bridge.
    await runFeature(page, 'mesh-reduce');
    await page.waitForFunction(
      (b) =>
        (window as unknown as { __cadDebug: { triangleCount: () => number } }).__cadDebug
          .triangleCount() < (b as number),
      before,
      { timeout: 15_000 },
    );

    const after = await cadDebug<number>(page, 'triangleCount');
    // Hard state assertions: fewer triangles, but still a real mesh.
    expect(after).toBeLessThan(before);
    expect(after).toBeGreaterThan(0);
    expect(await cadDebug<string>(page, 'lastFeature')).toBe('mesh-reduce');

    // Feature-owned debug namespace mirrors the same numbers.
    const stash = await page.evaluate(
      () =>
        (window as unknown as { __cadFeature: { reduce: { before: number; after: number } } })
          .__cadFeature.reduce,
    );
    expect(stash.after).toBeLessThan(stash.before);
    expect(stash.after).toBeGreaterThan(0);

    // 3. Now prove the whole chain via the REAL ribbon button on the Body tab.
    await runFeature(page, 'primitive-sphere'); // fresh dense body
    const before2 = await cadDebug<number>(page, 'triangleCount');
    expect(before2).toBeGreaterThan(1000);

    await selectTab(page, 'body');
    await expect(page.locator('[data-feature="mesh-reduce"]')).toBeVisible();
    await clickFeatureButton(page, 'mesh-reduce');
    await page.waitForFunction(
      (b) =>
        (window as unknown as { __cadDebug: { triangleCount: () => number } }).__cadDebug
          .triangleCount() < (b as number),
      before2,
      { timeout: 15_000 },
    );

    const after2 = await cadDebug<number>(page, 'triangleCount');
    expect(after2).toBeLessThan(before2);
    expect(after2).toBeGreaterThan(0);

    // 4. Non-negotiable: no console errors / page errors.
    expectNoConsoleErrors(guard);
  });
});
