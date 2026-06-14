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

interface Bbox {
  min: [number, number, number];
  max: [number, number, number];
}

/** Per-axis relative closeness check (±tolerance fraction of the reference span). */
function expectBboxClose(actual: Bbox, expected: Bbox, tol: number): void {
  for (const k of ['min', 'max'] as const) {
    for (let axis = 0; axis < 3; axis++) {
      const span = Math.max(expected.max[axis] - expected.min[axis], 1e-6);
      expect(Math.abs(actual[k][axis] - expected[k][axis])).toBeLessThanOrEqual(tol * span);
    }
  }
}

/**
 * Begrenzungsrahmen-Körper (Bounding Box body): creates a new box body that
 * matches the active body's world-space bounding box. Proves the full chain —
 * registry → ribbon button → host.run → new body whose bbox ≈ the source bbox —
 * with zero console errors, in EN locale.
 */
test.describe('feat/bbox-body — Begrenzungsrahmen-Körper', () => {
  test('creates a box body matching the active body bbox (bridge + ribbon)', async ({ page }) => {
    const guard = await bootApp(page);
    await page.evaluate(() => localStorage.setItem('cad.locale', 'en'));
    await page.reload();
    await page.waitForFunction(
      () => typeof (window as unknown as { __cadDebug?: unknown }).__cadDebug !== 'undefined',
    );

    // Registry mounted the feature.
    const ids = await cadDebug<string[]>(page, 'features');
    expect(ids).toContain('solid-bbox-body');

    // Deterministic test geometry: sphere r=12 → bbox ≈ -12..12.
    await runFeature(page, 'primitive-sphere');
    const sphereBbox = await cadDebug<Bbox>(page, 'bbox');
    expect(sphereBbox).not.toBeNull();

    // ── Run #1: via the debug bridge ──
    let before = await cadDebug<number>(page, 'bodyCount');
    await runFeature(page, 'solid-bbox-body');
    await waitForBodyCountAbove(page, before);
    expect(await cadDebug<number>(page, 'bodyCount')).toBeGreaterThan(before);
    expect(await cadDebug<string>(page, 'lastFeature')).toBe('solid-bbox-body');

    // The new active body's local geometry bbox spans ≈ the sphere bbox (±5%).
    const newBbox = await cadDebug<Bbox>(page, 'bbox');
    expect(newBbox).not.toBeNull();
    expectBboxClose(newBbox, sphereBbox, 0.05);

    // Stashed hard numbers from the feature itself.
    const stashed = await page.evaluate(
      () => (window as unknown as { __cadFeature: { bboxBody: Bbox } }).__cadFeature.bboxBody,
    );
    expectBboxClose(stashed, sphereBbox, 0.05);

    // ── Run #2: via the real ribbon button (selectTab + click) ──
    // Re-activate the sphere first so the bbox source is the sphere again.
    await runFeature(page, 'primitive-sphere');
    const sphereBbox2 = await cadDebug<Bbox>(page, 'bbox');
    before = await cadDebug<number>(page, 'bodyCount');
    await selectTab(page, 'solid');
    await expect(page.locator('[data-feature="solid-bbox-body"]').first()).toBeVisible();
    await clickFeatureButton(page, 'solid-bbox-body');
    await waitForBodyCountAbove(page, before);

    const ribbonBbox = await cadDebug<Bbox>(page, 'bbox');
    expect(ribbonBbox).not.toBeNull();
    expectBboxClose(ribbonBbox, sphereBbox2, 0.05);

    // Non-negotiable: no console / page errors.
    expectNoConsoleErrors(guard);
  });
});
