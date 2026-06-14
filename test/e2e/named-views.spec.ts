import { test, expect, type Page } from '@playwright/test';
import {
  bootApp,
  cadDebug,
  runFeature,
  selectTab,
  clickFeatureButton,
  expectNoConsoleErrors,
} from './_helpers';

/**
 * E2E for feat/named-views — multi-slot custom named views.
 *
 * Proves a real save → move → restore round-trip through the registry seam:
 * a saved view captures the camera, the test-only `nudge()` moves it far away,
 * and "Restore last view" returns the camera to (near) the saved position.
 * Also exercises the real ribbon button on the View tab. EN locale, zero
 * console errors.
 */

type Vec3 = [number, number, number];

interface NamedViewsBridge {
  count: number;
  names: string[];
  lastRestoredIndex?: number;
  camPos: Vec3;
}

function readBridge(page: Page): Promise<NamedViewsBridge> {
  return page.evaluate(
    () =>
      ((window as unknown as { __cadFeature?: { 'named-views'?: NamedViewsBridge } }).__cadFeature?.[
        'named-views'
      ] ?? { count: 0, names: [], camPos: [0, 0, 0] }) as NamedViewsBridge,
  );
}

function nudge(page: Page, d: number): Promise<void> {
  return page.evaluate(
    (dd) =>
      (
        window as unknown as { __cadFeature: { 'named-views': { nudge: (d: number) => void } } }
      ).__cadFeature['named-views'].nudge(dd),
    d,
  );
}

function maxAxisDelta(a: Vec3, b: Vec3): number {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}

async function switchToEn(page: Page): Promise<void> {
  await page.evaluate(() => localStorage.setItem('cad.locale', 'en'));
  await page.reload();
  await page.waitForFunction(
    () => typeof (window as unknown as { __cadDebug?: unknown }).__cadDebug !== 'undefined',
    undefined,
    { timeout: 30_000 },
  );
}

test.describe('feat/named-views — multi-slot custom named views', () => {
  test('save → move → restore round-trips the camera (EN locale)', async ({ page }) => {
    const guard = await bootApp(page);
    await switchToEn(page);

    await runFeature(page, 'primitive-box');

    // Establish a defined camera state, then save it as a named view.
    await runFeature(page, 'view-look-at');
    await runFeature(page, 'view-named-save');

    const afterSave = await readBridge(page);
    expect(afterSave.count).toBe(1);
    expect(afterSave.names[0]).toBe('View 1'); // EN i18n for view.namedSlot {{n=1}}
    const p1 = afterSave.camPos;

    // Move the camera far away from the saved state via the test-only helper.
    await nudge(page, 200);
    const moved = await readBridge(page);
    const p2 = moved.camPos;
    expect(maxAxisDelta(p1, p2)).toBeGreaterThan(50);

    // Restore the most recent view → camera returns ~P1 (within a few mm/axis).
    await runFeature(page, 'view-named-restore');
    const restored = await readBridge(page);
    expect(restored.lastRestoredIndex).toBe(0);
    const p3 = restored.camPos;
    expect(maxAxisDelta(p1, p3)).toBeLessThan(2);

    expect(await cadDebug<string>(page, 'lastFeature')).toBe('view-named-restore');
    expectNoConsoleErrors(guard);
  });

  test('the real View-tab ribbon button increments the saved count', async ({ page }) => {
    const guard = await bootApp(page);
    await runFeature(page, 'primitive-box');

    await selectTab(page, 'view');
    const btn = page.locator('[data-feature="view-named-save"]');
    await expect(btn).toBeVisible();

    await clickFeatureButton(page, 'view-named-save');
    let bridge = await readBridge(page);
    expect(bridge.count).toBe(1);

    await clickFeatureButton(page, 'view-named-save');
    bridge = await readBridge(page);
    expect(bridge.count).toBe(2);
    expect(bridge.names).toHaveLength(2);

    // The floating panel rendered both saved-view chips.
    await expect(page.locator('#named-views-panel .nv-chip')).toHaveCount(2);

    expect(await cadDebug<string>(page, 'lastFeature')).toBe('view-named-save');
    expectNoConsoleErrors(guard);
  });
});
