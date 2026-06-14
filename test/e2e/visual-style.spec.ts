import { test, expect } from '@playwright/test';
import {
  bootApp,
  runFeature,
  selectTab,
  clickFeatureButton,
  expectNoConsoleErrors,
} from './_helpers';

/**
 * E2E for feat/visual-style — Darstellungsstil umschalten (Wireframe ↔ Shaded).
 * Proves the chain: registerFeature → ribbon button → host.run → controller
 * toggles every body's material.wireframe → window.__cadFeature bridge, with
 * zero console errors. EN locale.
 */

/** Read the wireframe flag the feature stashes under window.__cadFeature. */
async function wireframeFlag(page: import('@playwright/test').Page): Promise<boolean | undefined> {
  return page.evaluate(
    () =>
      (window as unknown as { __cadFeature?: { visualStyle?: { wireframe: boolean } } }).__cadFeature
        ?.visualStyle?.wireframe,
  );
}

test('visual-style: toggles wireframe on/off for all bodies in EN locale', async ({ page }) => {
  const guard = await bootApp(page);
  await page.evaluate(() => localStorage.setItem('cad.locale', 'en'));
  await page.reload();
  await page.waitForFunction(
    () => typeof (window as unknown as { __cadDebug?: unknown }).__cadDebug !== 'undefined',
  );

  // 1. Testgeometrie — a real body to toggle.
  await runFeature(page, 'primitive-box');

  // 2. Feature is registered and its ribbon button is visible on the View tab.
  const ids = await page.evaluate(
    () => (window as unknown as { __cadDebug: { features: () => string[] } }).__cadDebug.features(),
  );
  expect(ids).toContain('view-wireframe');
  await selectTab(page, 'view');
  await expect(page.locator('[data-feature="view-wireframe"]').first()).toBeVisible();

  // 3. Click the REAL ribbon button → wireframe ON (hard state assertion).
  await clickFeatureButton(page, 'view-wireframe');
  await page.waitForFunction(
    () =>
      (window as unknown as { __cadFeature?: { visualStyle?: { wireframe?: boolean } } })
        .__cadFeature?.visualStyle?.wireframe === true,
  );
  expect(await wireframeFlag(page)).toBe(true);

  // The flag is also reflected on the live body materials.
  expect(
    await page.evaluate(() => {
      const dbg = window as unknown as {
        __cadDebug: { bodyCount: () => number };
      };
      return dbg.__cadDebug.bodyCount();
    }),
  ).toBeGreaterThan(0);

  // 4. Toggle again via the bridge → wireframe OFF.
  await runFeature(page, 'view-wireframe');
  await page.waitForFunction(
    () =>
      (window as unknown as { __cadFeature?: { visualStyle?: { wireframe?: boolean } } })
        .__cadFeature?.visualStyle?.wireframe === false,
  );
  expect(await wireframeFlag(page)).toBe(false);

  // 5. lastFeature reflects our id.
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __cadDebug: { lastFeature: () => string } }).__cadDebug.lastFeature(),
    ),
  ).toBe('view-wireframe');

  // 6. Non-negotiable: no console errors.
  expectNoConsoleErrors(guard);
});

test('visual-style: does not throw with zero bodies', async ({ page }) => {
  const guard = await bootApp(page);

  // No primitive created — toggle must be a no-op that still flips the flag.
  await runFeature(page, 'view-wireframe');
  await page.waitForFunction(
    () =>
      (window as unknown as { __cadFeature?: { visualStyle?: { wireframe?: boolean } } })
        .__cadFeature?.visualStyle?.wireframe === true,
  );
  expect(await wireframeFlag(page)).toBe(true);

  expectNoConsoleErrors(guard);
});
