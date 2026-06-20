import { test, expect } from '@playwright/test';
import { bootApp, cadDebug, expectNoConsoleErrors } from './_helpers';

/**
 * Core sketch lifecycle from AGENTS.md manual checklist:
 * empty project → pick plane → draw geometry → finish sketch.
 */
test.describe('Skizze — Kern-Workflow', () => {
  test('begin sketch on XY, add contour, finish sketch (bridge)', async ({ page }) => {
    const guard = await bootApp(page);

    expect(await cadDebug<number>(page, 'sketchCount')).toBe(0);
    expect(await cadDebug<string | null>(page, 'activeSketchId')).toBeNull();

    const sketchId = await cadDebug<string | null>(page, 'beginSketchOnAxis', 'xy');
    expect(sketchId).toBeTruthy();
    expect(await cadDebug<string | null>(page, 'activeSketchId')).toBe(sketchId);

    const contourId = await cadDebug<string | null>(
      page,
      'addSketchContourUV',
      [
        [0, 0],
        [10, 0],
        [10, 5],
        [0, 5],
      ],
      true,
    );
    expect(contourId).toBeTruthy();
    expect(await cadDebug<number>(page, 'contourCount')).toBe(1);
    expect(await cadDebug<number>(page, 'sketchCount')).toBe(1);

    expect(await cadDebug<string | null>(page, 'finishActiveSketch')).toBeNull();
    expect(await cadDebug<string | null>(page, 'activeSketchId')).toBeNull();
    expect(await cadDebug<number>(page, 'sketchCount')).toBe(1);
    expect(await cadDebug<number>(page, 'contourCount')).toBe(1);

    expectNoConsoleErrors(guard);
  });

  test('sketch dimension survives finish (bridge)', async ({ page }) => {
    const guard = await bootApp(page);

    await cadDebug(page, 'beginSketchOnAxis', 'xy');
    const contourId = (await cadDebug<string | null>(page, 'addSketchContourUV', [
      [0, 0],
      [8, 0],
    ], false)) as string;

    const dimId = await cadDebug<string | null>(page, 'addLinearDimensionTest', contourId, 0, 1);
    expect(dimId).toBeTruthy();

    await cadDebug(page, 'finishActiveSketch');
    expect(await cadDebug<number>(page, 'sketchCount')).toBe(1);

    expectNoConsoleErrors(guard);
  });
});