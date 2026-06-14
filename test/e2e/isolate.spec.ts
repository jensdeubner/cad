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

/** Read the feature's own test-bridge stash. */
async function isolateStash(
  page: import('@playwright/test').Page,
): Promise<{ isolated: boolean; hiddenCount: number }> {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          __cadFeature: { isolate: { isolated: boolean; hiddenCount: number } };
        }
      ).__cadFeature.isolate,
  );
}

/**
 * E2E for the View → Isolieren feature. Creates two bodies (box, sphere — the
 * sphere is the active one), isolates so only the active body remains, then
 * toggles back to restore all. Proves the whole registry chain via the real
 * ribbon button and the debug bridge, with zero console errors.
 */
test.describe('feat/isolate — Isolieren (Fusion Isolate)', () => {
  test('isolates the active body then restores all, via ribbon + bridge', async ({ page }) => {
    const guard = await bootApp(page);

    // Two bodies. Sphere runs last, so it is the active body.
    const before = await cadDebug<number>(page, 'bodyCount');
    await runFeature(page, 'primitive-box');
    await waitForBodyCountAbove(page, before);
    const afterBox = await cadDebug<number>(page, 'bodyCount');
    await runFeature(page, 'primitive-sphere');
    await waitForBodyCountAbove(page, afterBox);

    expect(await cadDebug<number>(page, 'bodyCount')).toBeGreaterThanOrEqual(2);
    const activeBefore = await cadDebug<string>(page, 'activeBodyId');

    // 1. Isolate via the real ribbon button (View tab).
    await selectTab(page, 'view');
    await expect(page.locator('[data-feature="view-isolate"]')).toBeVisible();
    await clickFeatureButton(page, 'view-isolate');

    let stash = await isolateStash(page);
    expect(stash.isolated).toBe(true);
    // The box was visible and is not the active body → hidden.
    expect(stash.hiddenCount).toBeGreaterThanOrEqual(1);
    expect(await cadDebug<string>(page, 'lastFeature')).toBe('view-isolate');
    // Active body unchanged.
    expect(await cadDebug<string>(page, 'activeBodyId')).toBe(activeBefore);

    // 2. Run again via the debug bridge → restore all, isolated false.
    await runFeature(page, 'view-isolate');
    stash = await isolateStash(page);
    expect(stash.isolated).toBe(false);
    expect(stash.hiddenCount).toBe(0);

    // 3. Non-negotiable: no console errors.
    expectNoConsoleErrors(guard);
  });
});
