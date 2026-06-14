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
 * E2E for the Reverse Normal (Mesh) feature. Proves the whole chain:
 * registerFeature → mountFeatures → ribbon button (Body tab) → host.run →
 * winding flip → signed-volume sign inversion, triangle count preserved, with
 * zero console errors. Runs in DE (default) and EN locales.
 */

interface ReverseNormalResult {
  signBefore: number;
  signAfter: number;
}

async function readReverseNormal(page: import('@playwright/test').Page): Promise<ReverseNormalResult> {
  return page.evaluate(
    () =>
      (window as unknown as { __cadFeature: { reverseNormal: ReverseNormalResult } }).__cadFeature
        .reverseNormal,
  );
}

test.describe('Reverse Normal (Mesh)', () => {
  test('flips winding via the Body ribbon button, signed volume inverts', async ({ page }) => {
    const guard = await bootApp(page);

    // Registered + mounted.
    const ids = await cadDebug<string[]>(page, 'features');
    expect(ids).toContain('mesh-reverse-normal');

    // Test geometry: 20mm box (12 triangles).
    await runFeature(page, 'primitive-box');
    await waitForBodyCountAbove(page, 0);
    const trianglesBefore = await cadDebug<number>(page, 'triangleCount');
    expect(trianglesBefore).toBeGreaterThan(0);

    // Real ribbon button on the Body tab.
    await selectTab(page, 'body');
    await expect(page.locator('[data-feature="mesh-reverse-normal"]')).toBeVisible();
    await clickFeatureButton(page, 'mesh-reverse-normal');

    await page.waitForFunction(
      () =>
        !!(window as unknown as { __cadFeature?: { reverseNormal?: unknown } }).__cadFeature
          ?.reverseNormal,
      undefined,
      { timeout: 15_000 },
    );

    // Hard assertions: opposite sign, triangle count unchanged, feature logged.
    const res = await readReverseNormal(page);
    expect(res.signBefore).not.toBe(0);
    expect(res.signAfter).not.toBe(0);
    expect(Math.sign(res.signAfter)).toBe(-Math.sign(res.signBefore));

    expect(await cadDebug<number>(page, 'triangleCount')).toBe(trianglesBefore);
    expect(await cadDebug<string>(page, 'lastFeature')).toBe('mesh-reverse-normal');

    expectNoConsoleErrors(guard);
  });

  test('runs via the debug bridge in EN locale', async ({ page }) => {
    const guard = await bootApp(page);
    await page.evaluate(() => localStorage.setItem('cad.locale', 'en'));
    await page.reload();
    await page.waitForFunction(
      () => typeof (window as unknown as { __cadDebug?: unknown }).__cadDebug !== 'undefined',
    );

    await runFeature(page, 'primitive-box');
    await waitForBodyCountAbove(page, 0);
    const trianglesBefore = await cadDebug<number>(page, 'triangleCount');

    await runFeature(page, 'mesh-reverse-normal');
    await page.waitForFunction(
      () =>
        !!(window as unknown as { __cadFeature?: { reverseNormal?: unknown } }).__cadFeature
          ?.reverseNormal,
      undefined,
      { timeout: 15_000 },
    );

    const res = await readReverseNormal(page);
    expect(Math.sign(res.signAfter)).toBe(-Math.sign(res.signBefore));
    expect(await cadDebug<number>(page, 'triangleCount')).toBe(trianglesBefore);
    expect(await cadDebug<string>(page, 'lastFeature')).toBe('mesh-reverse-normal');

    expectNoConsoleErrors(guard);
  });
});
