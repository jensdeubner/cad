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
function bboxMaxExtent(bbox: Bbox): number {
  if (!bbox) return 0;
  return Math.max(
    bbox.max[0] - bbox.min[0],
    bbox.max[1] - bbox.min[1],
    bbox.max[2] - bbox.min[2],
  );
}

/**
 * E2E for feat/scale-to-size (Auf Größe skalieren). Proves the whole chain
 * end-to-end: a 20 mm box is uniformly scaled so its LARGEST bbox dimension
 * becomes the 50 mm target — both via the debug bridge and via the real ribbon
 * button on the Body tab — with zero console errors.
 */
test.describe('feat/scale-to-size — Auf Größe skalieren (Scale to size)', () => {
  test('scales the active body so its largest bbox dimension ≈ 50 mm (bridge)', async ({ page }) => {
    const guard = await bootApp(page);

    // Deterministic test geometry: 20 mm box, bbox -10..10.
    const before = await cadDebug<number>(page, 'bodyCount');
    await runFeature(page, 'primitive-box');
    await waitForBodyCountAbove(page, before);

    const maxBefore = bboxMaxExtent(await cadDebug<Bbox>(page, 'bbox'));
    expect(maxBefore).toBeGreaterThan(18);
    expect(maxBefore).toBeLessThan(22); // ~20 mm

    // Run the feature (no new body — mesh replaced in place).
    await runFeature(page, 'solid-scale-to-size');
    await page.waitForFunction(
      () =>
        (window as unknown as { __cadFeature?: { scaleToSize?: unknown } }).__cadFeature
          ?.scaleToSize !== undefined,
      undefined,
      { timeout: 15_000 },
    );

    const maxAfter = bboxMaxExtent(await cadDebug<Bbox>(page, 'bbox'));
    // Hard state assertion: largest dimension is now ≈ 50 mm (±5%).
    expect(maxAfter).toBeGreaterThan(50 * 0.95);
    expect(maxAfter).toBeLessThan(50 * 1.05);

    // The feature recorded its target.
    const target = await page.evaluate(
      () =>
        (window as unknown as { __cadFeature: { scaleToSize: { target: number } } }).__cadFeature
          .scaleToSize.target,
    );
    expect(target).toBe(50);
    expect(await cadDebug<string>(page, 'lastFeature')).toBe('solid-scale-to-size');

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

    const maxBefore = bboxMaxExtent(await cadDebug<Bbox>(page, 'bbox'));
    expect(maxBefore).toBeGreaterThan(18);
    expect(maxBefore).toBeLessThan(22);

    // Drive the actual ribbon button, not just the bridge.
    await selectTab(page, 'body');
    await expect(page.locator('[data-feature="solid-scale-to-size"]')).toBeVisible();
    await clickFeatureButton(page, 'solid-scale-to-size');

    await page.waitForFunction(
      () =>
        (window as unknown as { __cadDebug: { lastFeature: () => string } }).__cadDebug.lastFeature() ===
        'solid-scale-to-size',
      undefined,
      { timeout: 15_000 },
    );

    const maxAfter = bboxMaxExtent(await cadDebug<Bbox>(page, 'bbox'));
    expect(maxAfter).toBeGreaterThan(50 * 0.95);
    expect(maxAfter).toBeLessThan(50 * 1.05);

    expectNoConsoleErrors(guard);
  });
});
