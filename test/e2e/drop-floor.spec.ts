import { test, expect } from '@playwright/test';
import {
  bootApp,
  cadDebug,
  runFeature,
  selectTab,
  clickFeatureButton,
  expectNoConsoleErrors,
} from './_helpers';

interface Bbox {
  min: [number, number, number];
  max: [number, number, number];
}

interface DropFloorInfo {
  dz: number;
  worldMin: [number, number, number];
  worldMax: [number, number, number];
}

async function dropFloorInfo(page: import('@playwright/test').Page): Promise<DropFloorInfo> {
  return page.evaluate(
    () => (window as unknown as { __cadFeature: { dropFloor: DropFloorInfo } }).__cadFeature.dropFloor,
  );
}

/**
 * E2E for "Auf Boden setzen" (Drop to floor): the active body is translated so
 * its lowest point sits on the Z=0 ground plane. A centered 20mm box
 * (local geometry z −10..10) must end up resting on the floor: world z 0..20.
 *
 * The app re-centers a body's *local* geometry on every mesh rebuild, so the
 * drop lives on the body's world transform. We therefore assert the resulting
 * world-space bounding box (exposed via `window.__cadFeature.dropFloor`).
 */
test.describe('feat/drop-floor — Auf Boden setzen', () => {
  test('drops the active body so its lowest point lands on Z=0 (EN locale)', async ({ page }) => {
    const guard = await bootApp(page);

    // EN locale to prove i18n parity.
    await page.evaluate(() => localStorage.setItem('cad.locale', 'en'));
    await page.reload();
    await page.waitForFunction(
      () => typeof (window as unknown as { __cadDebug?: unknown }).__cadDebug !== 'undefined',
    );

    // 1. Feature registered.
    const ids = await cadDebug<string[]>(page, 'features');
    expect(ids).toContain('solid-drop-floor');

    // 2. Deterministic test geometry: a centered 20mm box (local z −10..10).
    await runFeature(page, 'primitive-box');
    const before = await cadDebug<Bbox>(page, 'bbox');
    expect(before.min[2]).toBeCloseTo(-10, 1);
    expect(before.max[2]).toBeCloseTo(10, 1);

    // 3. Run once via the bridge — lifts the body by +10 so world min z = 0.
    await runFeature(page, 'solid-drop-floor');
    const bridge = await dropFloorInfo(page);
    expect(bridge.dz).toBeCloseTo(10, 1);
    expect(bridge.worldMin[2]).toBeGreaterThanOrEqual(-0.5);
    expect(bridge.worldMin[2]).toBeLessThanOrEqual(0.5);
    expect(bridge.worldMax[2]).toBeGreaterThanOrEqual(19.5);
    expect(bridge.worldMax[2]).toBeLessThanOrEqual(20.5);

    // 4. Run once via the REAL ribbon button (proves the full mount chain).
    //    Idempotent: the body is already on the floor, so dz ≈ 0.
    await selectTab(page, 'body');
    await expect(page.locator('[data-feature="solid-drop-floor"]')).toBeVisible();
    await clickFeatureButton(page, 'solid-drop-floor');

    // 5. Hard state assertion: lowest point sits on Z=0 (±0.5), top at 20 (±0.5).
    const after = await dropFloorInfo(page);
    expect(after.dz).toBeCloseTo(0, 1);
    expect(after.worldMin[2]).toBeGreaterThanOrEqual(-0.5);
    expect(after.worldMin[2]).toBeLessThanOrEqual(0.5);
    expect(after.worldMax[2]).toBeGreaterThanOrEqual(19.5);
    expect(after.worldMax[2]).toBeLessThanOrEqual(20.5);

    // 6. Non-negotiable: no console errors.
    expectNoConsoleErrors(guard);
  });
});
