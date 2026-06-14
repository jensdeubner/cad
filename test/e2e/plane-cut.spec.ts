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
 * E2E for the Ebenenschnitt (Plane Cut) feature. Proves the whole chain:
 * registerFeature → mountFeatures → ribbon button (Body tab) → host.run →
 * keep only the +Z half of the active body. A primitive box spans z -10..10
 * (Z height 20mm); cutting at its bbox-center (z = 0) removes the lower half,
 * so the result's Z extent collapses to ~10mm (±1 mm) while X/Y are untouched,
 * with triangles still present and zero console errors.
 *
 * NB: the host re-centers every replaced geometry to the origin
 * (`centerGeometry` in `buildScanMesh`), so the local-bbox min Z reads ~-5, not
 * 0 — the load-bearing, host-independent signal of "lower half removed" is the
 * halved Z extent. The pure `cutAbovePlaneZ` unit test asserts the exact
 * `min z = planeZ` on the un-centered geometry. Runs in DE (default ribbon
 * button) and EN locale (debug bridge).
 */

interface Bbox {
  min: [number, number, number];
  max: [number, number, number];
}

interface PlaneCutResult {
  before: number;
  after: number;
}

async function readPlaneCut(page: import('@playwright/test').Page): Promise<PlaneCutResult> {
  return page.evaluate(
    () =>
      (window as unknown as { __cadFeature: { planeCut: PlaneCutResult } }).__cadFeature.planeCut,
  );
}

test.describe('Ebenenschnitt (Plane Cut)', () => {
  test('removes the lower half via the Body ribbon button', async ({ page }) => {
    const guard = await bootApp(page);

    // Registered + mounted.
    const ids = await cadDebug<string[]>(page, 'features');
    expect(ids).toContain('solid-plane-cut');

    // Test geometry: 20mm box, z -10..10.
    await runFeature(page, 'primitive-box');
    await waitForBodyCountAbove(page, 0);

    const bboxBefore = await cadDebug<Bbox>(page, 'bbox');
    const trianglesBefore = await cadDebug<number>(page, 'triangleCount');
    const zExtentBefore = bboxBefore.max[2] - bboxBefore.min[2];
    const xExtentBefore = bboxBefore.max[0] - bboxBefore.min[0];
    const yExtentBefore = bboxBefore.max[1] - bboxBefore.min[1];
    expect(zExtentBefore).toBeCloseTo(20, 1);
    expect(trianglesBefore).toBeGreaterThan(0);

    // Real ribbon button on the Body tab.
    await selectTab(page, 'body');
    await expect(page.locator('[data-feature="solid-plane-cut"]')).toBeVisible();
    await clickFeatureButton(page, 'solid-plane-cut');

    await page.waitForFunction(
      () =>
        !!(window as unknown as { __cadFeature?: { planeCut?: unknown } }).__cadFeature?.planeCut,
      undefined,
      { timeout: 15_000 },
    );

    // Hard assertions: the lower half is gone — Z extent halved (20→~10mm, ±1mm),
    // X/Y untouched, tris > 0.
    const bboxAfter = await cadDebug<Bbox>(page, 'bbox');
    const zExtentAfter = bboxAfter.max[2] - bboxAfter.min[2];
    expect(zExtentAfter).toBeGreaterThan(9);
    expect(zExtentAfter).toBeLessThan(11);
    expect(bboxAfter.max[0] - bboxAfter.min[0]).toBeCloseTo(xExtentBefore, 1);
    expect(bboxAfter.max[1] - bboxAfter.min[1]).toBeCloseTo(yExtentBefore, 1);

    const trianglesAfter = await cadDebug<number>(page, 'triangleCount');
    expect(trianglesAfter).toBeGreaterThan(0);

    const res = await readPlaneCut(page);
    expect(res.before).toBe(trianglesBefore);
    expect(res.after).toBeGreaterThan(0);
    expect(await cadDebug<string>(page, 'lastFeature')).toBe('solid-plane-cut');

    expectNoConsoleErrors(guard);
  });

  test('runs via the debug bridge in EN locale', async ({ page }) => {
    const guard = await bootApp(page);
    await page.evaluate(() => localStorage.setItem('cad.locale', 'en'));
    await page.reload();
    await page.waitForFunction(
      () => typeof (window as unknown as { __cadDebug?: unknown }).__cadDebug !== 'undefined',
    );

    await runFeature(page, 'primitive-box');
    await waitForBodyCountAbove(page, 0);
    const bboxBefore = await cadDebug<Bbox>(page, 'bbox');
    expect(bboxBefore.max[2] - bboxBefore.min[2]).toBeCloseTo(20, 1);

    await runFeature(page, 'solid-plane-cut');
    await page.waitForFunction(
      () =>
        !!(window as unknown as { __cadFeature?: { planeCut?: unknown } }).__cadFeature?.planeCut,
      undefined,
      { timeout: 15_000 },
    );

    const bboxAfter = await cadDebug<Bbox>(page, 'bbox');
    const zExtentAfter = bboxAfter.max[2] - bboxAfter.min[2];
    expect(zExtentAfter).toBeGreaterThan(9);
    expect(zExtentAfter).toBeLessThan(11);
    expect(await cadDebug<number>(page, 'triangleCount')).toBeGreaterThan(0);
    expect(await cadDebug<string>(page, 'lastFeature')).toBe('solid-plane-cut');

    expectNoConsoleErrors(guard);
  });
});
