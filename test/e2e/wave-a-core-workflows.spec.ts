import { test, expect } from '@playwright/test';
import { bootApp, cadDebug, expectNoConsoleErrors, runFeature } from './_helpers';

test.describe('Wave A — Kern-Workflows', () => {
  test('boots into empty project with origin planes', async ({ page }) => {
    const guard = await bootApp(page);
    expect(await cadDebug<boolean>(page, 'isEmptyProject')).toBe(true);
    const state = await cadDebug<{ originPlanesVisible: boolean }>(page, 'browserState');
    expect(state.originPlanesVisible).toBe(true);
    expectNoConsoleErrors(guard);
  });

  test('sketch lifecycle: begin → line primitive → finish', async ({ page }) => {
    const guard = await bootApp(page);
    await cadDebug(page, 'beginSketchOnAxis', 'xy');
    const lineId = await cadDebug<string | null>(page, 'sketchDragPrimitive', 'sketch-line', [0, 0], [12, 0]);
    expect(lineId).toBeTruthy();
    expect(await cadDebug<number>(page, 'contourCount')).toBe(1);
    await cadDebug(page, 'finishActiveSketch');
    expect(await cadDebug<string | null>(page, 'activeSketchId')).toBeNull();
    expect(await cadDebug<number>(page, 'sketchCount')).toBe(1);
    expectNoConsoleErrors(guard);
  });

  test('sketch primitives: circle + rectangle via drag bridge', async ({ page }) => {
    const guard = await bootApp(page);
    await cadDebug(page, 'beginSketchOnAxis', 'xz');
    const circleId = await cadDebug<string | null>(
      page,
      'sketchDragPrimitive',
      'sketch-circle',
      [0, 0],
      [5, 0],
    );
    const rectId = await cadDebug<string | null>(
      page,
      'sketchDragPrimitive',
      'sketch-rect',
      [-4, -3],
      [4, 3],
    );
    expect(circleId).toBeTruthy();
    expect(rectId).toBeTruthy();
    expect(await cadDebug<number>(page, 'contourCount')).toBe(2);
    expectNoConsoleErrors(guard);
  });

  test('sketch dimension persists after finish', async ({ page }) => {
    const guard = await bootApp(page);
    await cadDebug(page, 'beginSketchOnAxis', 'xy');
    const cid = (await cadDebug<string | null>(page, 'addSketchContourUV', [[0, 0], [10, 0]], false))!;
    await cadDebug(page, 'addLinearDimensionTest', cid, 0, 1);
    expect(await cadDebug<number>(page, 'dimensionCount')).toBe(1);
    await cadDebug(page, 'finishActiveSketch');
    expect(await cadDebug<number>(page, 'dimensionCount')).toBe(1);
    expectNoConsoleErrors(guard);
  });

  test('work-plane contours: two closed profiles on XY', async ({ page }) => {
    const guard = await bootApp(page);
    const a = await cadDebug<string | null>(
      page,
      'addContourUV',
      [
        [0, 0],
        [20, 0],
        [20, 20],
        [0, 20],
      ],
      true,
      'xy',
      0,
    );
    const b = await cadDebug<string | null>(
      page,
      'addContourUV',
      [
        [2, 2],
        [18, 2],
        [18, 18],
        [2, 18],
      ],
      true,
      'xy',
      15,
    );
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(await cadDebug<number>(page, 'closedContourCount')).toBe(2);
    expectNoConsoleErrors(guard);
  });

  test('Negativform loft creates a body with triangles', async ({ page }) => {
    const guard = await bootApp(page);
    await cadDebug(page, 'addContourUV', [[0, 0], [15, 0], [15, 15], [0, 15]], true, 'xy', 0);
    await cadDebug(page, 'addContourUV', [[3, 3], [12, 3], [12, 12], [3, 12]], true, 'xy', 20);
    const loft = await cadDebug<{ ok: boolean; triangles?: number; added?: boolean }>(
      page,
      'commitLoftNegativformTest',
    );
    expect(loft.ok).toBe(true);
    expect(loft.triangles).toBeGreaterThan(0);
    expect(loft.added).toBe(true);
    expect(await cadDebug<number>(page, 'triangleCount')).toBeGreaterThan(0);
    expectNoConsoleErrors(guard);
  });

  test('STL load via test box buffer', async ({ page }) => {
    const guard = await bootApp(page);
    const loaded = await cadDebug<{ triangles: number }>(page, 'loadTestBoxStl');
    expect(loaded.triangles).toBeGreaterThan(0);
    expect(await cadDebug<boolean>(page, 'isEmptyProject')).toBe(false);
    expect(await cadDebug<string>(page, 'activeTool')).toBe('navigate');
    expectNoConsoleErrors(guard);
  });

  test('sketch-only .stpr roundtrip preserves counts', async ({ page }) => {
    const guard = await bootApp(page);
    await cadDebug(page, 'beginSketchOnAxis', 'xy');
    await cadDebug(page, 'addSketchContourUV', [[0, 0], [5, 0], [5, 5], [0, 5]], true);
    await cadDebug(page, 'finishActiveSketch');
    const rt = await cadDebug<{
      before: { sketchCount: number; contourCount: number };
      after: { sketchCount: number; contourCount: number };
    }>(page, 'projectRoundtrip');
    expect(rt.after.sketchCount).toBe(rt.before.sketchCount);
    expect(rt.after.contourCount).toBe(rt.before.contourCount);
    expect(rt.after.sketchCount).toBeGreaterThan(0);
    expectNoConsoleErrors(guard);
  });

  test('body + sketch project roundtrip keeps mesh triangles', async ({ page }) => {
    const guard = await bootApp(page);
    await runFeature(page, 'primitive-box');
    const trisBefore = await cadDebug<number>(page, 'triangleCount');
    await cadDebug(page, 'beginSketchOnAxis', 'xy');
    await cadDebug(page, 'addSketchContourUV', [[1, 1], [4, 1], [4, 4]], true);
    await cadDebug(page, 'finishActiveSketch');
    const rt = await cadDebug<{ after: { bodyCount: number } }>(page, 'projectRoundtrip');
    expect(rt.after.bodyCount).toBeGreaterThan(0);
    expect(await cadDebug<number>(page, 'triangleCount')).toBe(trisBefore);
    expectNoConsoleErrors(guard);
  });

  test('undo/redo restores a deleted contour', async ({ page }) => {
    const guard = await bootApp(page);
    const id = (await cadDebug<string | null>(
      page,
      'addContourUV',
      [[0, 0], [8, 0], [8, 8], [0, 8]],
      true,
      'xy',
      0,
    ))!;
    expect(await cadDebug<number>(page, 'contourCount')).toBe(1);
    await cadDebug(page, 'deleteContourById', id);
    expect(await cadDebug<number>(page, 'contourCount')).toBe(0);
    const undo = await cadDebug<{ position: number; canRedo: boolean }>(page, 'testUndo');
    expect(undo.canRedo).toBe(true);
    expect(await cadDebug<number>(page, 'contourCount')).toBe(1);
    await cadDebug(page, 'testRedo');
    expect(await cadDebug<number>(page, 'contourCount')).toBe(0);
    expectNoConsoleErrors(guard);
  });
});