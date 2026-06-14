import { test, expect, type Page } from '@playwright/test';
import {
  bootApp,
  cadDebug,
  runFeature,
  selectTab,
  clickFeatureButton,
  expectNoConsoleErrors,
  waitForBodyCountAbove,
} from './_helpers';

interface SeparateStats {
  shells: number;
  newBodies: number;
}

/** Read `window.__cadFeature.separate` produced by the mesh-separate feature. */
async function separateStats(page: Page): Promise<SeparateStats> {
  return page.evaluate(
    () => (window as unknown as { __cadFeature: { separate: SeparateStats } }).__cadFeature.separate,
  );
}

/**
 * E2E for Körper trennen / Separate bodies. A primitive box is a single
 * connected shell, so Separate must report shells===1, create no new bodies and
 * leave the body count unchanged with the "one shell" status. Zero console
 * errors is non-negotiable.
 */
test.describe('mesh-separate — split disconnected shells', () => {
  test('single-shell box reports one shell and adds no body (EN locale, via bridge)', async ({
    page,
  }) => {
    const guard = await bootApp(page);
    await page.evaluate(() => localStorage.setItem('cad.locale', 'en'));
    await page.reload();
    await page.waitForFunction(
      () => typeof (window as unknown as { __cadDebug?: unknown }).__cadDebug !== 'undefined',
    );

    const before = await cadDebug<number>(page, 'bodyCount');
    await runFeature(page, 'primitive-box');
    await waitForBodyCountAbove(page, before);
    const afterBox = await cadDebug<number>(page, 'bodyCount');

    await runFeature(page, 'mesh-separate');

    // Hard numeric assertions on real feature state.
    const stats = await separateStats(page);
    expect(stats.shells).toBe(1);
    expect(stats.newBodies).toBe(0);

    // A single-shell box adds no body.
    expect(await cadDebug<number>(page, 'bodyCount')).toBe(afterBox);

    // EN "one shell" status message.
    expect(await cadDebug<string>(page, 'status')).toBe(
      'Only one connected shell — nothing to separate',
    );

    expectNoConsoleErrors(guard);
  });

  test('runs via the real ribbon button on the Body tab', async ({ page }) => {
    const guard = await bootApp(page);

    const before = await cadDebug<number>(page, 'bodyCount');
    await runFeature(page, 'primitive-box');
    await waitForBodyCountAbove(page, before);
    const afterBox = await cadDebug<number>(page, 'bodyCount');

    // Real button path: select the Body tab and click the mounted button.
    await selectTab(page, 'body');
    await expect(page.locator('[data-feature="mesh-separate"]')).toBeVisible();
    await clickFeatureButton(page, 'mesh-separate');

    await page.waitForFunction(
      () =>
        (window as unknown as { __cadFeature?: { separate?: SeparateStats } }).__cadFeature
          ?.separate !== undefined,
    );

    const stats = await separateStats(page);
    expect(stats.shells).toBe(1);
    expect(stats.newBodies).toBe(0);
    // No new body for a single connected shell.
    expect(await cadDebug<number>(page, 'bodyCount')).toBe(afterBox);

    expectNoConsoleErrors(guard);
  });
});
