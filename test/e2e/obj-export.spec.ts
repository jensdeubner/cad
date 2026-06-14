import { test, expect } from '@playwright/test';
import {
  bootApp,
  runFeature,
  selectTab,
  clickFeatureButton,
  expectNoConsoleErrors,
} from './_helpers';

interface ObjExportResult {
  vertexCount: number;
  faceCount: number;
  sample: string;
}

/** Read `window.__cadFeature.objExport` once it exists. */
async function readObjExport(page: import('@playwright/test').Page): Promise<ObjExportResult> {
  await page.waitForFunction(
    () =>
      typeof (window as unknown as { __cadFeature?: { objExport?: unknown } }).__cadFeature
        ?.objExport !== 'undefined',
    undefined,
    { timeout: 15_000 },
  );
  return page.evaluate(
    () =>
      (window as unknown as { __cadFeature: { objExport: ObjExportResult } }).__cadFeature.objExport,
  );
}

test.describe('io-obj-export — OBJ export of the active body', () => {
  test('exports the active box body via the debug bridge', async ({ page }) => {
    const guard = await bootApp(page);

    // Deterministic test geometry: 20mm box, 12 triangles.
    await runFeature(page, 'primitive-box');

    await runFeature(page, 'io-obj-export');

    const result = await readObjExport(page);
    // Hard state assertions.
    expect(result.faceCount).toBe(12);
    expect(result.vertexCount).toBeGreaterThan(0);
    expect(result.sample).toContain('v ');

    expectNoConsoleErrors(guard);
  });

  test('exports via the real ribbon button on the Body tab (EN locale)', async ({ page }) => {
    const guard = await bootApp(page);
    await page.evaluate(() => localStorage.setItem('cad.locale', 'en'));
    await page.reload();
    await page.waitForFunction(
      () => typeof (window as unknown as { __cadDebug?: unknown }).__cadDebug !== 'undefined',
    );

    await runFeature(page, 'primitive-box');

    // Real ribbon path: switch to Body tab, click the mounted button.
    await selectTab(page, 'body');
    await expect(page.locator('[data-feature="io-obj-export"]')).toBeVisible();
    await clickFeatureButton(page, 'io-obj-export');

    const result = await readObjExport(page);
    expect(result.faceCount).toBe(12);
    expect(result.vertexCount).toBeGreaterThan(0);
    expect(result.sample).toContain('v ');

    expect(await page.evaluate(
      () => (window as unknown as { __cadDebug: { lastFeature: () => string } }).__cadDebug.lastFeature(),
    )).toBe('io-obj-export');

    expectNoConsoleErrors(guard);
  });
});
