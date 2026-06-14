import { test, expect } from '@playwright/test';
import {
  bootApp,
  runFeature,
  selectTab,
  clickFeatureButton,
  expectNoConsoleErrors,
} from './_helpers';

interface PlyExportResult {
  vertexCount: number;
  faceCount: number;
  sample: string;
}

function readPlyExport(page: import('@playwright/test').Page): Promise<PlyExportResult | undefined> {
  return page.evaluate(
    () =>
      (window as unknown as { __cadFeature?: { plyExport?: PlyExportResult } }).__cadFeature
        ?.plyExport,
  );
}

test.describe('io-ply-export — PLY export of the active body', () => {
  test('exports a box body to ASCII PLY via the debug bridge', async ({ page }) => {
    const guard = await bootApp(page);

    // Deterministic test geometry: 20 mm cube, 12 triangles.
    await runFeature(page, 'primitive-box');
    await runFeature(page, 'io-ply-export');

    const result = await readPlyExport(page);
    expect(result).toBeDefined();
    // A box is 12 triangles regardless of indexing.
    expect(result!.faceCount).toBe(12);
    expect(result!.vertexCount).toBeGreaterThan(0);
    expect(result!.sample.startsWith('ply')).toBe(true);

    expectNoConsoleErrors(guard);
  });

  test('exports via the real ribbon button on the Body tab', async ({ page }) => {
    const guard = await bootApp(page);

    await runFeature(page, 'primitive-box');

    // Drive the real ribbon: switch to Body tab, click the feature button.
    await selectTab(page, 'body');
    await expect(page.locator('[data-feature="io-ply-export"]')).toBeVisible();
    await clickFeatureButton(page, 'io-ply-export');

    await page.waitForFunction(
      () =>
        typeof (window as unknown as { __cadFeature?: { plyExport?: unknown } }).__cadFeature
          ?.plyExport !== 'undefined',
    );

    const result = await readPlyExport(page);
    expect(result).toBeDefined();
    expect(result!.faceCount).toBe(12);
    expect(result!.vertexCount).toBeGreaterThan(0);
    expect(result!.sample.startsWith('ply')).toBe(true);

    expect(await page.evaluate(() =>
      (window as unknown as { __cadDebug: { lastFeature: () => string } }).__cadDebug.lastFeature(),
    )).toBe('io-ply-export');

    expectNoConsoleErrors(guard);
  });
});
