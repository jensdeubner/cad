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
 * E2E for Rectangular Pattern. Boots the app, creates a box as test geometry,
 * then runs the feature both via the debug bridge and via the real ribbon
 * button. cols=3, rows=2 → 5 new bodies per run. Asserts bodyCount grows,
 * geometry is real (triangleCount > 0) and zero console errors. EN locale.
 */
test.use({ viewport: { width: 1600, height: 900 } });

test('solid-pattern-rect: creates a grid of translated copies as new bodies', async ({ page }) => {
  const guard = await bootApp(page);
  await page.evaluate(() => localStorage.setItem('cad.locale', 'en'));
  await page.reload();
  await page.waitForFunction(
    () => typeof (window as unknown as { __cadDebug?: unknown }).__cadDebug !== 'undefined',
  );

  // Test geometry: a box.
  await runFeature(page, 'primitive-box');
  await page.waitForFunction(
    () => (window as unknown as { __cadDebug: { bodyCount: () => number } }).__cadDebug.bodyCount() >= 1,
  );

  const before = await cadDebug<number>(page, 'bodyCount');

  // Run 1: via the debug bridge → cols*rows - 1 = 5 new bodies.
  await runFeature(page, 'solid-pattern-rect');
  await waitForBodyCountAbove(page, before);

  const afterBridge = await cadDebug<number>(page, 'bodyCount');
  expect(afterBridge).toBeGreaterThan(before);
  expect(await cadDebug<string>(page, 'lastFeature')).toBe('solid-pattern-rect');

  // The feature exposed its own measurement.
  const measured = await page.evaluate(
    () =>
      (window as unknown as { __cadFeature: { patternRect: { cols: number; rows: number } } })
        .__cadFeature.patternRect,
  );
  expect(measured.cols).toBe(3);
  expect(measured.rows).toBe(2);

  // Run 2: via the real ribbon button on the Solid tab. Click IMMEDIATELY
  // after selecting the tab.
  await selectTab(page, 'solid');
  await clickFeatureButton(page, 'solid-pattern-rect');
  await waitForBodyCountAbove(page, afterBridge);

  const after = await cadDebug<number>(page, 'bodyCount');
  expect(after).toBeGreaterThan(before);

  // Hard geometry assertion: the active (last-created) body has real triangles.
  expect(await cadDebug<number>(page, 'triangleCount')).toBeGreaterThan(0);

  expectNoConsoleErrors(guard);
});
