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
 * E2E for Circular Pattern (arbitrary axis). Boots the app, creates a cylinder
 * as test geometry, then runs the feature both via the debug bridge and via the
 * real ribbon button. count=4 → 3 new bodies per run. Asserts bodyCount grows,
 * geometry is real (triangleCount > 0) and zero console errors. EN locale.
 */
test('solid-pattern-circular: creates rotated copies as new bodies', async ({ page }) => {
  const guard = await bootApp(page);
  await page.evaluate(() => localStorage.setItem('cad.locale', 'en'));
  await page.reload();
  await page.waitForFunction(
    () => typeof (window as unknown as { __cadDebug?: unknown }).__cadDebug !== 'undefined',
  );

  // Test geometry: a cylinder.
  await runFeature(page, 'primitive-cylinder');
  await page.waitForFunction(
    () => (window as unknown as { __cadDebug: { bodyCount: () => number } }).__cadDebug.bodyCount() >= 1,
  );

  const before = await cadDebug<number>(page, 'bodyCount');

  // Run 1: via the debug bridge → count-1 = 3 new bodies.
  await runFeature(page, 'solid-pattern-circular');
  await waitForBodyCountAbove(page, before);

  const afterBridge = await cadDebug<number>(page, 'bodyCount');
  expect(afterBridge).toBeGreaterThan(before);
  expect(await cadDebug<string>(page, 'lastFeature')).toBe('solid-pattern-circular');

  // The feature exposed its own measurement.
  const measured = await page.evaluate(
    () => (window as unknown as { __cadFeature: { patternCircular: { count: number } } }).__cadFeature.patternCircular,
  );
  expect(measured.count).toBe(4);

  // Run 2: via the real ribbon button on the Solid tab.
  await selectTab(page, 'solid');
  await expect(page.locator('[data-feature="solid-pattern-circular"]')).toBeVisible();
  await clickFeatureButton(page, 'solid-pattern-circular');
  await waitForBodyCountAbove(page, afterBridge);

  const after = await cadDebug<number>(page, 'bodyCount');
  expect(after).toBeGreaterThan(before);

  // Hard geometry assertion: the active (last-created) body has real triangles.
  expect(await cadDebug<number>(page, 'triangleCount')).toBeGreaterThan(0);

  expectNoConsoleErrors(guard);
});
