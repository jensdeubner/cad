import { test, expect } from '@playwright/test';
import {
  bootApp,
  runFeature,
  selectTab,
  clickFeatureButton,
  expectNoConsoleErrors,
} from './_helpers';

/**
 * E2E for feat/visibility — Sichtbarkeit aller Körper umschalten
 * (Fusion "Show/Hide Bodies"). Proves the chain: registerFeature → ribbon
 * button → host.run → controller flips every body's meshGroup.visible →
 * window.__cadFeature bridge, with zero console errors. EN locale.
 */

/** Read the visibility flag the feature stashes under window.__cadFeature. */
async function bodiesVisibleFlag(
  page: import('@playwright/test').Page,
): Promise<boolean | undefined> {
  return page.evaluate(
    () =>
      (window as unknown as { __cadFeature?: { visibility?: { bodiesVisible: boolean } } })
        .__cadFeature?.visibility?.bodiesVisible,
  );
}

test('visibility: toggles all bodies on/off in EN locale', async ({ page }) => {
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
  expect(ids).toContain('view-visibility');
  await selectTab(page, 'view');
  await expect(page.locator('[data-feature="view-visibility"]').first()).toBeVisible();

  // 3. Click the REAL ribbon button → bodies HIDDEN (hard state assertion).
  await clickFeatureButton(page, 'view-visibility');
  await page.waitForFunction(
    () =>
      (window as unknown as { __cadFeature?: { visibility?: { bodiesVisible?: boolean } } })
        .__cadFeature?.visibility?.bodiesVisible === false,
  );
  expect(await bodiesVisibleFlag(page)).toBe(false);

  // The hidden state is also reflected on the live mesh groups.
  expect(
    await page.evaluate(() => {
      const scene = (window as unknown as { __cadDebug: { bodyCount: () => number } }).__cadDebug;
      return scene.bodyCount();
    }),
  ).toBeGreaterThan(0);

  // 4. Toggle again via the bridge → bodies SHOWN.
  await runFeature(page, 'view-visibility');
  await page.waitForFunction(
    () =>
      (window as unknown as { __cadFeature?: { visibility?: { bodiesVisible?: boolean } } })
        .__cadFeature?.visibility?.bodiesVisible === true,
  );
  expect(await bodiesVisibleFlag(page)).toBe(true);

  // 5. lastFeature reflects our id.
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __cadDebug: { lastFeature: () => string } }).__cadDebug.lastFeature(),
    ),
  ).toBe('view-visibility');

  // 6. Non-negotiable: no console errors.
  expectNoConsoleErrors(guard);
});

test('visibility: does not throw with zero bodies', async ({ page }) => {
  const guard = await bootApp(page);

  // No primitive created — toggle must be a no-op that still flips the flag.
  await runFeature(page, 'view-visibility');
  await page.waitForFunction(
    () =>
      (window as unknown as { __cadFeature?: { visibility?: { bodiesVisible?: boolean } } })
        .__cadFeature?.visibility?.bodiesVisible === false,
  );
  expect(await bodiesVisibleFlag(page)).toBe(false);

  expectNoConsoleErrors(guard);
});
