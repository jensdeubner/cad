import { test, expect, type Page } from '@playwright/test';
import { bootApp, cadDebug, expectNoConsoleErrors } from './_helpers';

async function zExtent(page: Page, bodyId: string): Promise<number> {
  return page.evaluate((id) => {
    const b = (window as unknown as { __cadDebug: { bbox: (id: string) => { min: number[]; max: number[] } | null } })
      .__cadDebug.bbox(id);
    return b ? b.max[2] - b.min[2] : -1;
  }, bodyId);
}

/**
 * #30 Phase 2 (INC3) — timeline feature edit: the extrude feature chip carries a
 * ✎ edit button; clicking it prompts for a new distance and recomputes the body.
 * Proves both the bridge logic and the real ✎ UI path. EN locale, no console errors.
 */
test.describe('#30 phase2 — timeline feature parameter edit', () => {
  test('editing the extrude feature recomputes the body (bridge + ✎ button)', async ({ page }) => {
    const guard = await bootApp(page);
    await page.evaluate(() => localStorage.setItem('cad.locale', 'en'));
    await page.reload();
    await page.waitForFunction(
      () => typeof (window as unknown as { __cadDebug?: unknown }).__cadDebug !== 'undefined',
    );

    // Extrude a 20mm square by 10mm → records a timeline feature with a recipe.
    const bodyId = await page.evaluate(async () => {
      const dbg = (window as unknown as {
        __cadDebug: {
          beginSketchOnAxis: (a: string) => string | null;
          addSketchContourUV: (uv: [number, number][], closed: boolean) => string | null;
          testExtrudeContour: (cid: string, mm: number) => Promise<string | null>;
        };
      }).__cadDebug;
      dbg.beginSketchOnAxis('xy');
      const cid = dbg.addSketchContourUV([[0, 0], [20, 0], [20, 20], [0, 20]], true);
      return cid ? await dbg.testExtrudeContour(cid, 10) : null;
    });
    expect(bodyId).toBeTruthy();
    const id = bodyId as string;
    expect(await zExtent(page, id)).toBeLessThan(12);

    // (1) Bridge path: edit recipe param to 25 → body recomputes.
    const ok = await page.evaluate(
      (bid) =>
        (window as unknown as { __cadDebug: { editFeatureRecipeParam: (id: string, v: number) => Promise<boolean> } })
          .__cadDebug.editFeatureRecipeParam(bid, 25),
      id,
    );
    expect(ok).toBe(true);
    const hMid = await zExtent(page, id);
    expect(hMid).toBeGreaterThan(23);
    expect(hMid).toBeLessThan(27);

    // (2) Real ✎ button on the timeline chip → prompt → recompute to 40.
    page.on('dialog', (d) => d.accept('40'));
    const editBtn = page.locator('.timeline-feature-edit').first();
    await expect(editBtn).toBeVisible();
    await editBtn.click();

    await page.waitForFunction(
      (bid) => {
        const b = (window as unknown as { __cadDebug: { bbox: (id: string) => { min: number[]; max: number[] } | null } })
          .__cadDebug.bbox(bid);
        return !!b && b.max[2] - b.min[2] > 36;
      },
      id,
      { timeout: 10_000 },
    );
    expect(await zExtent(page, id)).toBeGreaterThan(36);

    // Recipe reflects the edited value.
    const recipe = await cadDebug<{ distanceMm: number } | null>(page, 'featureRecipeForBody', id);
    expect(recipe!.distanceMm).toBe(40);

    expectNoConsoleErrors(guard);
  });
});
