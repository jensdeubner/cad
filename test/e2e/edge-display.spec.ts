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
 * E2E for the "Show Edges" feature (Fusion "Visual Styles → Shaded with
 * Edges"). Proves the whole chain: a primitive body → toggle edges ON via the
 * bridge (overlay grows, edges.on === true) → toggle again via the real ribbon
 * button (overlay back to baseline, edges.on === false), with zero console
 * errors.
 */
type EdgeState = { on: boolean; count: number } | undefined;

function readEdges(page: import('@playwright/test').Page): Promise<EdgeState> {
  return page.evaluate(
    () =>
      (window as unknown as { __cadFeature?: { edges?: { on: boolean; count: number } } })
        .__cadFeature?.edges,
  );
}

test.describe('feat/edge-display — Kanten anzeigen', () => {
  test('toggles an edge overlay for every body via bridge + ribbon button', async ({ page }) => {
    const guard = await bootApp(page);

    // Registry mounted the feature.
    const ids = await cadDebug<string[]>(page, 'features');
    expect(ids).toContain('view-edges');

    // Deterministic test geometry (20 mm box).
    const before = await cadDebug<number>(page, 'bodyCount');
    await runFeature(page, 'primitive-box');
    await waitForBodyCountAbove(page, before);

    // Baseline overlay count (other overlay helpers may already be present).
    const baseOverlay = await cadDebug<number>(page, 'overlayCount');

    // 1. Toggle edges ON via the debug bridge.
    await runFeature(page, 'view-edges');
    await page.waitForFunction(
      () =>
        (window as unknown as { __cadFeature?: { edges?: { on: boolean } } }).__cadFeature?.edges
          ?.on === true,
    );

    const edgesOn = await readEdges(page);
    expect(edgesOn?.on).toBe(true);
    expect(edgesOn?.count).toBeGreaterThan(0);

    const overlayWithEdges = await cadDebug<number>(page, 'overlayCount');
    expect(overlayWithEdges).toBeGreaterThan(baseOverlay);
    expect(await cadDebug<string>(page, 'lastFeature')).toBe('view-edges');

    // 2. Toggle OFF via the REAL ribbon button (selectTab + clickFeatureButton).
    await selectTab(page, 'view');
    await expect(page.locator('[data-feature="view-edges"]')).toBeVisible();
    await clickFeatureButton(page, 'view-edges');
    await page.waitForFunction(
      () =>
        (window as unknown as { __cadFeature?: { edges?: { on: boolean } } }).__cadFeature?.edges
          ?.on === false,
    );

    const edgesOff = await readEdges(page);
    expect(edgesOff?.on).toBe(false);
    expect(edgesOff?.count).toBe(0);

    // Overlay back to baseline (all edge objects removed + disposed).
    expect(await cadDebug<number>(page, 'overlayCount')).toBe(baseOverlay);

    // Non-negotiable: zero console errors / page errors.
    expectNoConsoleErrors(guard);
  });

  test('runs in EN locale without console errors', async ({ page }) => {
    const guard = await bootApp(page);
    await page.evaluate(() => localStorage.setItem('cad.locale', 'en'));
    await page.reload();
    await page.waitForFunction(
      () => typeof (window as unknown as { __cadDebug?: unknown }).__cadDebug !== 'undefined',
    );

    const before = await cadDebug<number>(page, 'bodyCount');
    await runFeature(page, 'primitive-box');
    await waitForBodyCountAbove(page, before);

    const baseOverlay = await cadDebug<number>(page, 'overlayCount');

    await runFeature(page, 'view-edges'); // on
    await page.waitForFunction(
      () =>
        (window as unknown as { __cadFeature?: { edges?: { on: boolean } } }).__cadFeature?.edges
          ?.on === true,
    );
    expect(await cadDebug<number>(page, 'overlayCount')).toBeGreaterThan(baseOverlay);

    await runFeature(page, 'view-edges'); // off
    await page.waitForFunction(
      () =>
        (window as unknown as { __cadFeature?: { edges?: { on: boolean } } }).__cadFeature?.edges
          ?.on === false,
    );
    expect(await cadDebug<number>(page, 'overlayCount')).toBe(baseOverlay);

    expectNoConsoleErrors(guard);
  });
});
