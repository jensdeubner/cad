import { test, expect, type Page } from '@playwright/test';
import { bootApp, expectNoConsoleErrors } from './_helpers';

/** X extent of a body's bounding box via the debug bridge. */
async function xExtent(page: Page, bodyId: string): Promise<number> {
  return page.evaluate((id) => {
    const b = (window as unknown as { __cadDebug: { bbox: (id: string) => { min: number[]; max: number[] } | null } })
      .__cadDebug.bbox(id);
    return b ? b.max[0] - b.min[0] : -1;
  }, bodyId);
}

/**
 * #30 Phase 2 (INC3) — auto-recompute trigger: editing a source contour
 * automatically re-executes the dependent extrude recipe (no manual recompute
 * call). A 20 mm square is extruded; moving a corner to x=40 widens the body
 * via the auto-trigger. EN locale, zero console errors.
 */
test.describe('#30 phase2 — auto-recompute on sketch edit', () => {
  test('moving a source contour point auto-updates the dependent body', async ({ page }) => {
    const guard = await bootApp(page);
    await page.evaluate(() => localStorage.setItem('cad.locale', 'en'));
    await page.reload();
    await page.waitForFunction(
      () => typeof (window as unknown as { __cadDebug?: unknown }).__cadDebug !== 'undefined',
    );

    const setup = await page.evaluate(async () => {
      const dbg = (window as unknown as {
        __cadDebug: {
          beginSketchOnAxis: (a: string) => string | null;
          addSketchContourUV: (uv: [number, number][], closed: boolean) => string | null;
          testExtrudeContour: (cid: string, mm: number) => Promise<string | null>;
        };
      }).__cadDebug;
      const sketchId = dbg.beginSketchOnAxis('xy');
      const cid = dbg.addSketchContourUV(
        [
          [0, 0],
          [20, 0],
          [20, 20],
          [0, 20],
        ],
        true,
      );
      if (!cid) return null;
      const bodyId = await dbg.testExtrudeContour(cid, 10);
      return bodyId ? { sketchId, cid, bodyId } : null;
    });

    expect(setup, 'sketch + extrude succeeded').not.toBeNull();
    const { sketchId, cid, bodyId } = setup as { sketchId: string; cid: string; bodyId: string };

    // Initial width ≈ 20 mm.
    const w1 = await xExtent(page, bodyId);
    expect(w1).toBeGreaterThan(18);
    expect(w1).toBeLessThan(22);

    // Move corner (20,0) → (40,0); the auto-trigger recomputes the body (async).
    await page.evaluate(
      ({ sketchId, cid }) => {
        const dbg = (window as unknown as {
          __cadDebug: {
            activateSketchById: (id: string) => unknown;
            editContourPointUV: (cid: string, i: number, uv: [number, number]) => boolean;
          };
        }).__cadDebug;
        dbg.activateSketchById(sketchId);
        dbg.editContourPointUV(cid, 1, [40, 0]);
      },
      { sketchId, cid },
    );

    // Auto-recompute is async (fire-and-forget) — poll until the body widens.
    await page.waitForFunction(
      (id) => {
        const b = (window as unknown as { __cadDebug: { bbox: (id: string) => { min: number[]; max: number[] } | null } })
          .__cadDebug.bbox(id);
        return !!b && b.max[0] - b.min[0] > 30;
      },
      bodyId,
      { timeout: 10_000 },
    );

    const w2 = await xExtent(page, bodyId);
    expect(w2).toBeGreaterThan(30);

    expectNoConsoleErrors(guard);
  });
});
