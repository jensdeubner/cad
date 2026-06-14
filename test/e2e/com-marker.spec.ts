import { test, expect } from '@playwright/test';
import {
  bootApp,
  cadDebug,
  runFeature,
  selectTab,
  clickFeatureButton,
  expectNoConsoleErrors,
} from './_helpers';

interface ComBridge {
  center: [number, number, number];
  bbox: { min: [number, number, number]; max: [number, number, number] } | null;
}

/** Read `window.__cadFeature.com` after a run. */
async function comResult(page: import('@playwright/test').Page): Promise<ComBridge> {
  return page.evaluate(
    () =>
      (window as unknown as { __cadFeature: { com: ComBridge } }).__cadFeature.com,
  );
}

/**
 * E2E for the Schwerpunkt-Marker feature. Proves the full chain: a centered
 * 20 mm primitive box → COM ≈ origin, overlays added to host.overlay (marker +
 * bbox), idempotent re-runs, and the real ribbon button on the Body tab — all
 * with zero console errors. EN locale.
 */
test.describe('feat/com-marker — Schwerpunkt + Bounding-Box', () => {
  test('computes COM ≈ origin, draws overlays, is idempotent (bridge + ribbon)', async ({
    page,
  }) => {
    const guard = await bootApp(page);

    // Centered 20 mm box (−10..10) → COM at the world origin.
    await runFeature(page, 'primitive-box');

    const overlayBefore = await cadDebug<number>(page, 'overlayCount');

    // 1. Run via the debug bridge.
    await runFeature(page, 'inspect-com');

    const overlayAfterBridge = await cadDebug<number>(page, 'overlayCount');
    expect(overlayAfterBridge).toBeGreaterThan(overlayBefore);

    const com1 = await comResult(page);
    for (const c of com1.center) expect(Math.abs(c)).toBeLessThanOrEqual(0.5);
    expect(com1.bbox).not.toBeNull();

    expect(await cadDebug<string>(page, 'lastFeature')).toBe('inspect-com');

    // 2. Idempotent: rerunning clears the prior overlays first, so the overlay
    //    count stays bounded (does not grow on every click).
    await runFeature(page, 'inspect-com');
    const overlayAfterTwice = await cadDebug<number>(page, 'overlayCount');
    expect(overlayAfterTwice).toBe(overlayAfterBridge);

    // 3. Real ribbon button on the Body tab.
    await selectTab(page, 'body');
    await expect(page.locator('[data-feature="inspect-com"]')).toBeVisible();
    await clickFeatureButton(page, 'inspect-com');

    const overlayAfterClick = await cadDebug<number>(page, 'overlayCount');
    expect(overlayAfterClick).toBe(overlayAfterBridge); // still bounded

    const com2 = await comResult(page);
    for (const c of com2.center) expect(Math.abs(c)).toBeLessThanOrEqual(0.5);

    // 4. Non-negotiable: zero console errors.
    expectNoConsoleErrors(guard);
  });
});
