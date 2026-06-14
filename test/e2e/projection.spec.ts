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

/** Read `window.__cadFeature.projection.mode` from the page. */
async function projMode(page: Page): Promise<string | null> {
  return page.evaluate(
    () =>
      (window as unknown as { __cadFeature?: { projection?: { mode?: string } } })
        .__cadFeature?.projection?.mode ?? null,
  );
}

/**
 * Perspective ⇄ orthographic camera toggle. Proves the active render camera is
 * swapped (and swapped back) without losing the model or emitting console
 * errors. EN locale; zero console errors is non-negotiable.
 */
test.describe('view-projection — Perspektive/Ortho-Umschalter', () => {
  test('toggles perspective → orthographic → perspective (EN, bridge)', async ({ page }) => {
    const guard = await bootApp(page);
    await page.evaluate(() => localStorage.setItem('cad.locale', 'en'));
    await page.reload();
    await page.waitForFunction(
      () => typeof (window as unknown as { __cadDebug?: unknown }).__cadDebug !== 'undefined',
    );

    const before = await cadDebug<number>(page, 'bodyCount');
    await runFeature(page, 'primitive-box');
    await waitForBodyCountAbove(page, before);
    const bodies = await cadDebug<number>(page, 'bodyCount');

    await runFeature(page, 'view-projection-toggle');
    expect(await projMode(page)).toBe('orthographic');
    // The model survives the projection swap.
    expect(await cadDebug<number>(page, 'bodyCount')).toBe(bodies);
    expect(await cadDebug<number>(page, 'triangleCount')).toBe(12);

    await runFeature(page, 'view-projection-toggle');
    expect(await projMode(page)).toBe('perspective');

    expect(await cadDebug<string>(page, 'lastFeature')).toBe('view-projection-toggle');
    expectNoConsoleErrors(guard);
  });

  test('toggles via the real ribbon button on the View tab', async ({ page }) => {
    const guard = await bootApp(page);

    await selectTab(page, 'view');
    await expect(page.locator('[data-feature="view-projection-toggle"]')).toBeVisible();
    await clickFeatureButton(page, 'view-projection-toggle');
    expect(await projMode(page)).toBe('orthographic');

    expectNoConsoleErrors(guard);
  });
});
