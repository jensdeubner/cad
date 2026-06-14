import { test, expect, type Page } from '@playwright/test';
import { bootApp, cadDebug, expectNoConsoleErrors } from './_helpers';

/** Z extent of a body's bounding box via the debug bridge. */
async function zExtent(page: Page, bodyId: string): Promise<number> {
  return page.evaluate((id) => {
    const b = (window as unknown as { __cadDebug: { bbox: (id: string) => { min: number[]; max: number[] } | null } })
      .__cadDebug.bbox(id);
    return b ? b.max[2] - b.min[2] : -1;
  }, bodyId);
}

/**
 * #30 Phase 2 — proves the parametric loop end-to-end through the REAL WASM
 * kernel: a closed square is extruded (recipe captured), the extrude parameter
 * is edited, and recompute re-executes the recipe so the body's geometry
 * updates. EN locale, zero console errors.
 */
test.describe('#30 phase2 — parametric recompute (real WASM)', () => {
  test('editing the extrude distance + recompute updates the body geometry', async ({ page }) => {
    const guard = await bootApp(page);
    await page.evaluate(() => localStorage.setItem('cad.locale', 'en'));
    await page.reload();
    await page.waitForFunction(
      () => typeof (window as unknown as { __cadDebug?: unknown }).__cadDebug !== 'undefined',
    );

    // Build a closed 20 mm square on the XY sketch plane and extrude it by 10 mm.
    const square: [number, number][] = [
      [0, 0],
      [20, 0],
      [20, 20],
      [0, 20],
    ];
    const bodyId = await page.evaluate(async (uv) => {
      const dbg = (window as unknown as {
        __cadDebug: {
          beginSketchOnAxis: (a: string) => unknown;
          addSketchContourUV: (uv: [number, number][], closed: boolean) => string | null;
          testExtrudeContour: (cid: string, mm: number) => Promise<string | null>;
        };
      }).__cadDebug;
      dbg.beginSketchOnAxis('xy');
      const cid = dbg.addSketchContourUV(uv, true);
      if (!cid) return null;
      return await dbg.testExtrudeContour(cid, 10);
    }, square);

    expect(bodyId, 'extrude produced a body').toBeTruthy();
    const id = bodyId as string;

    // Recipe captured with distance 10.
    const recipe = await cadDebug<{ kind: string; distanceMm: number } | null>(
      page,
      'featureRecipeForBody',
      id,
    );
    expect(recipe).not.toBeNull();
    expect(recipe!.kind).toBe('extrude');
    expect(recipe!.distanceMm).toBe(10);

    // Extruded 10 mm → Z extent ≈ 10.
    const h1 = await zExtent(page, id);
    expect(h1).toBeGreaterThan(8);
    expect(h1).toBeLessThan(12);

    // Edit the extrude parameter to 30 mm, then recompute (real WASM re-exec).
    const status = await page.evaluate(async (bid) => {
      const dbg = (window as unknown as {
        __cadDebug: {
          setExtrudeRecipeDistance: (id: string, mm: number) => boolean;
          recomputeBody: (id: string) => Promise<string>;
        };
      }).__cadDebug;
      dbg.setExtrudeRecipeDistance(bid, 30);
      return await dbg.recomputeBody(bid);
    }, id);
    expect(status).toBe('ok');

    // Geometry updated: Z extent ≈ 30.
    const h2 = await zExtent(page, id);
    expect(h2).toBeGreaterThan(27);
    expect(h2).toBeLessThan(33);

    expectNoConsoleErrors(guard);
  });
});
