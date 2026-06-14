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

type Bbox = { min: [number, number, number]; max: [number, number, number] } | null;

/** Largest axis extent (max-min) of a `__cadDebug.bbox()` result. */
function bboxExtent(bbox: Bbox): number {
  if (!bbox) return 0;
  return Math.max(
    bbox.max[0] - bbox.min[0],
    bbox.max[1] - bbox.min[1],
    bbox.max[2] - bbox.min[2],
  );
}

/**
 * E2E for feat/scale-factor (Maßstab ×). Proves the whole chain end-to-end:
 * a 20 mm box (-10..10) is uniformly scaled ×1.5 about its bbox center, both
 * via the debug bridge and via the real ribbon button, with zero console
 * errors. The bbox extent must grow from ~20 to ~30 (±5%).
 */
test.describe('feat/scale-factor — Maßstab × (Scale by factor)', () => {
  test('grows the active body bbox by ≈1.5× via the host bridge', async ({ page }) => {
    const guard = await bootApp(page);

    // Deterministic test geometry: 20 mm box, bbox -10..10.
    const before = await cadDebug<number>(page, 'bodyCount');
    await runFeature(page, 'primitive-box');
    await waitForBodyCountAbove(page, before);

    const extentBefore = bboxExtent(await cadDebug<Bbox>(page, 'bbox'));
    expect(extentBefore).toBeGreaterThan(18);
    expect(extentBefore).toBeLessThan(22); // ~20 mm

    // Run the feature (no new body — mesh replaced in place).
    await runFeature(page, 'solid-scale-factor');
    await page.waitForFunction(
      () =>
        (window as unknown as { __cadFeature?: { scaleFactor?: unknown } }).__cadFeature
          ?.scaleFactor !== undefined,
      undefined,
      { timeout: 15_000 },
    );

    const extentAfter = bboxExtent(await cadDebug<Bbox>(page, 'bbox'));
    const expected = extentBefore * 1.5; // ~30 mm
    // Hard state assertion: grew by ≈1.5× (±5%).
    expect(extentAfter).toBeGreaterThan(expected * 0.95);
    expect(extentAfter).toBeLessThan(expected * 1.05);

    // The feature recorded its factor.
    const factor = await page.evaluate(
      () =>
        (window as unknown as { __cadFeature: { scaleFactor: { factor: number } } }).__cadFeature
          .scaleFactor.factor,
    );
    expect(factor).toBe(1.5);
    expect(await cadDebug<string>(page, 'lastFeature')).toBe('solid-scale-factor');

    expectNoConsoleErrors(guard);
  });

  test('works via the real ribbon button on the Body tab (EN locale)', async ({ page }) => {
    const guard = await bootApp(page);
    await page.evaluate(() => localStorage.setItem('cad.locale', 'en'));
    await page.reload();
    await page.waitForFunction(
      () => typeof (window as unknown as { __cadDebug?: unknown }).__cadDebug !== 'undefined',
    );

    const before = await cadDebug<number>(page, 'bodyCount');
    await runFeature(page, 'primitive-box');
    await waitForBodyCountAbove(page, before);

    const extentBefore = bboxExtent(await cadDebug<Bbox>(page, 'bbox'));

    // Drive the actual ribbon button, not just the bridge.
    await selectTab(page, 'body');
    await expect(page.locator('[data-feature="solid-scale-factor"]')).toBeVisible();
    await clickFeatureButton(page, 'solid-scale-factor');

    await page.waitForFunction(
      () =>
        (window as unknown as { __cadDebug: { lastFeature: () => string } }).__cadDebug.lastFeature() ===
        'solid-scale-factor',
      undefined,
      { timeout: 15_000 },
    );

    const extentAfter = bboxExtent(await cadDebug<Bbox>(page, 'bbox'));
    const expected = extentBefore * 1.5;
    expect(extentAfter).toBeGreaterThan(expected * 0.95);
    expect(extentAfter).toBeLessThan(expected * 1.05);

    expectNoConsoleErrors(guard);
  });
});
