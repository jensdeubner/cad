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

interface ObjImportResult {
  tris: number;
}

/** Read `window.__cadFeature.objImport` once it exists. */
async function readObjImport(page: import('@playwright/test').Page): Promise<ObjImportResult> {
  await page.waitForFunction(
    () =>
      typeof (window as unknown as { __cadFeature?: { objImport?: unknown } }).__cadFeature
        ?.objImport !== 'undefined',
    undefined,
    { timeout: 15_000 },
  );
  return page.evaluate(
    () =>
      (window as unknown as { __cadFeature: { objImport: ObjImportResult } }).__cadFeature.objImport,
  );
}

test.describe('io-obj-import — import a body from a built-in sample OBJ', () => {
  test('imports the sample cube via the debug bridge', async ({ page }) => {
    const guard = await bootApp(page);

    const before = await cadDebug<number>(page, 'bodyCount');

    await runFeature(page, 'io-obj-import');
    await waitForBodyCountAbove(page, before);

    // Hard state assertions: a body was created with a cube's worth of tris.
    expect(await cadDebug<number>(page, 'bodyCount')).toBeGreaterThan(before);
    expect(await cadDebug<number>(page, 'triangleCount')).toBeGreaterThanOrEqual(12);

    const result = await readObjImport(page);
    expect(result.tris).toBe(12);

    expectNoConsoleErrors(guard);
  });

  test('imports via the real ribbon button on the Body tab (EN locale)', async ({ page }) => {
    const guard = await bootApp(page);
    await page.evaluate(() => localStorage.setItem('cad.locale', 'en'));
    await page.reload();
    await page.waitForFunction(
      () => typeof (window as unknown as { __cadDebug?: unknown }).__cadDebug !== 'undefined',
    );

    const before = await cadDebug<number>(page, 'bodyCount');

    // Real ribbon path: switch to Body tab, click the mounted button.
    await selectTab(page, 'body');
    await expect(page.locator('[data-feature="io-obj-import"]')).toBeVisible();
    await clickFeatureButton(page, 'io-obj-import');
    await waitForBodyCountAbove(page, before);

    expect(await cadDebug<number>(page, 'bodyCount')).toBeGreaterThan(before);
    expect(await cadDebug<number>(page, 'triangleCount')).toBeGreaterThanOrEqual(12);
    expect(await cadDebug<string>(page, 'lastFeature')).toBe('io-obj-import');

    expectNoConsoleErrors(guard);
  });
});
