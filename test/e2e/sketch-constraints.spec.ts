import { test, expect } from '@playwright/test';
import { bootApp, cadDebug, selectTab, expectNoConsoleErrors } from './_helpers';

type Ref = { contourId: string; pointIndex: number };
type Vec3 = [number, number, number];
const d2 = (a: Vec3, b: Vec3) => Math.hypot(b[0] - a[0], b[1] - a[1]);

test('#11 sketch constraints: solves a rough quad into a 10×5 rectangle (bridge)', async ({ page }) => {
  const guard = await bootApp(page);

  const sketchId = await cadDebug<string | null>(page, 'beginSketchOnAxis', 'xy');
  expect(sketchId).toBeTruthy();

  const contourId = await cadDebug<string | null>(page, 'addSketchContourUV', [
    [0.1, -0.2],
    [10.3, 0.1],
    [10.1, 5.2],
    [-0.2, 4.9],
  ], true);
  expect(contourId).toBeTruthy();
  const cid = contourId as string;

  const ref = (i: number): Ref => ({ contourId: cid, pointIndex: i });
  // Fix corner 0, then make it an axis-aligned 10×5 rectangle.
  for (const [kind, refs, value] of [
    ['fix', [ref(0)]],
    ['horizontal', [ref(0), ref(1)]],
    ['vertical', [ref(1), ref(2)]],
    ['horizontal', [ref(2), ref(3)]],
    ['vertical', [ref(3), ref(0)]],
    ['distance', [ref(0), ref(1)], 10],
    ['distance', [ref(1), ref(2)], 5],
  ] as [string, Ref[], number?][]) {
    const id = await cadDebug<string | null>(page, 'addSketchConstraint', kind, refs, value);
    expect(id, `constraint ${kind} created`).toBeTruthy();
  }

  expect(await cadDebug<number>(page, 'sketchConstraintCount')).toBe(7);
  expect(await cadDebug<number>(page, 'activeSketchConstraintCount')).toBe(7);
  // Every constraint gets a visual badge glyph.
  expect(await cadDebug<number>(page, 'constraintGlyphCount')).toBe(7);

  const solve = await cadDebug<{ converged: boolean; maxResidual: number }>(page, 'solveActiveSketch');
  expect(solve.converged).toBe(true);
  expect(solve.maxResidual).toBeLessThan(1e-3);

  const p0 = (await cadDebug<Vec3>(page, 'contourPointAt', cid, 0))!;
  const p1 = (await cadDebug<Vec3>(page, 'contourPointAt', cid, 1))!;
  const p2 = (await cadDebug<Vec3>(page, 'contourPointAt', cid, 2))!;
  const p3 = (await cadDebug<Vec3>(page, 'contourPointAt', cid, 3))!;

  // Fixed anchor stays put.
  expect(p0[0]).toBeCloseTo(0.1, 2);
  expect(p0[1]).toBeCloseTo(-0.2, 2);
  // Axis alignment.
  expect(Math.abs(p0[1] - p1[1])).toBeLessThan(0.02); // edge 0-1 horizontal
  expect(Math.abs(p2[1] - p3[1])).toBeLessThan(0.02); // edge 2-3 horizontal
  expect(Math.abs(p1[0] - p2[0])).toBeLessThan(0.02); // edge 1-2 vertical
  expect(Math.abs(p3[0] - p0[0])).toBeLessThan(0.02); // edge 3-0 vertical
  // Driven dimensions.
  expect(d2(p0, p1)).toBeCloseTo(10, 1);
  expect(d2(p1, p2)).toBeCloseTo(5, 1);
  // Still on the sketch plane.
  for (const p of [p0, p1, p2, p3]) expect(Math.abs(p[2])).toBeLessThan(1e-6);

  expectNoConsoleErrors(guard);
});

test('#11 sketch constraints: horizontal via the ribbon button + point picking (EN locale)', async ({ page }) => {
  const guard = await bootApp(page);
  await page.evaluate(() => localStorage.setItem('cad.locale', 'en'));
  await page.reload();
  await page.waitForFunction(
    () => typeof (window as unknown as { __cadDebug?: unknown }).__cadDebug !== 'undefined',
  );

  const sketchId = await cadDebug<string | null>(page, 'beginSketchOnAxis', 'xy');
  expect(sketchId).toBeTruthy();
  const contourId = (await cadDebug<string | null>(page, 'addSketchContourUV', [
    [0, 0],
    [8, 3],
  ], false))!;

  // Activate the real ribbon Constraint tool.
  await selectTab(page, 'sketch');
  await page.locator('[data-tool="sketch-constraint"]').click();
  expect(await cadDebug<string>(page, 'activeTool')).toBe('sketch-constraint');

  // Pick the constraint kind (the panel select drives `sketchConstraintKind`).
  await page.evaluate(() => {
    const sel = document.getElementById('sketch-constraint-kind') as HTMLSelectElement;
    sel.value = 'horizontal';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });

  // Click the two contour points on screen → horizontal constraint + solve.
  const s0 = (await cadDebug<{ x: number; y: number }>(page, 'pointScreenAt', contourId, 0))!;
  const s1 = (await cadDebug<{ x: number; y: number }>(page, 'pointScreenAt', contourId, 1))!;
  await page.mouse.click(s0.x, s0.y);
  await page.mouse.click(s1.x, s1.y);

  await page.waitForFunction(
    () => (window as unknown as { __cadDebug: { sketchConstraintCount: () => number } }).__cadDebug.sketchConstraintCount() === 1,
    undefined,
    { timeout: 5000 },
  );

  const p0 = (await cadDebug<Vec3>(page, 'contourPointAt', contourId, 0))!;
  const p1 = (await cadDebug<Vec3>(page, 'contourPointAt', contourId, 1))!;
  // Horizontal: the two y-coordinates are now equal.
  expect(Math.abs(p0[1] - p1[1])).toBeLessThan(0.02);

  expectNoConsoleErrors(guard);
});

test('#11 sketch constraints: parallel across two contours, then delete drops the count', async ({ page }) => {
  const guard = await bootApp(page);
  expect(await cadDebug<string | null>(page, 'beginSketchOnAxis', 'xy')).toBeTruthy();

  const a = (await cadDebug<string | null>(page, 'addSketchContourUV', [[0, 0], [5, 0]], false))!;
  const b = (await cadDebug<string | null>(page, 'addSketchContourUV', [[6, 1], [10, 3]], false))!;
  const r = (cid: string, i: number): Ref => ({ contourId: cid, pointIndex: i });

  await cadDebug(page, 'addSketchConstraint', 'fix', [r(a, 0)]);
  await cadDebug(page, 'addSketchConstraint', 'fix', [r(a, 1)]);
  await cadDebug(page, 'addSketchConstraint', 'parallel', [r(a, 0), r(a, 1), r(b, 0), r(b, 1)]);
  expect(await cadDebug<number>(page, 'sketchConstraintCount')).toBe(3);
  expect(await cadDebug<number>(page, 'constraintGlyphCount')).toBe(3);

  // a is horizontal and fixed → parallel forces edge b horizontal (equal y).
  const b0 = (await cadDebug<Vec3>(page, 'contourPointAt', b, 0))!;
  const b1 = (await cadDebug<Vec3>(page, 'contourPointAt', b, 1))!;
  expect(Math.abs(b0[1] - b1[1])).toBeLessThan(0.02);

  // Delete the last constraint via the panel-list delete path (bridge).
  expect(await cadDebug<boolean>(page, 'deleteLastSketchConstraint')).toBe(true);
  expect(await cadDebug<number>(page, 'sketchConstraintCount')).toBe(2);
  expect(await cadDebug<number>(page, 'constraintGlyphCount')).toBe(2);

  expectNoConsoleErrors(guard);
});

test('#11 sketch constraints: select a glyph in the viewport and delete it with Del', async ({ page }) => {
  const guard = await bootApp(page);
  expect(await cadDebug<string | null>(page, 'beginSketchOnAxis', 'xy')).toBeTruthy();
  const c = (await cadDebug<string | null>(page, 'addSketchContourUV', [[0, 0], [5, 3]], false))!;
  await cadDebug(page, 'addSketchConstraint', 'horizontal', [
    { contourId: c, pointIndex: 0 },
    { contourId: c, pointIndex: 1 },
  ]);
  expect(await cadDebug<number>(page, 'constraintGlyphCount')).toBe(1);

  // Activate the constraint tool, then click the glyph badge to select it.
  await selectTab(page, 'sketch');
  await page.locator('[data-tool="sketch-constraint"]').click();
  const s = (await cadDebug<{ x: number; y: number }>(page, 'constraintGlyphScreenAt', 0))!;
  await page.mouse.click(s.x, s.y);
  expect(await cadDebug<string | null>(page, 'selectedConstraintId')).toBeTruthy();

  // Delete key removes the selected constraint (and its glyph).
  await page.keyboard.press('Delete');
  await page.waitForFunction(
    () => (window as unknown as { __cadDebug: { sketchConstraintCount: () => number } }).__cadDebug.sketchConstraintCount() === 0,
    undefined,
    { timeout: 4000 },
  );
  expect(await cadDebug<number>(page, 'constraintGlyphCount')).toBe(0);
  expect(await cadDebug<string | null>(page, 'selectedConstraintId')).toBeNull();

  expectNoConsoleErrors(guard);
});

test('#11 sketch constraints: deleting a contour drops its constraints and glyphs', async ({ page }) => {
  const guard = await bootApp(page);
  expect(await cadDebug<string | null>(page, 'beginSketchOnAxis', 'xy')).toBeTruthy();
  const a = (await cadDebug<string | null>(page, 'addSketchContourUV', [[0, 0], [5, 0]], false))!;
  const b = (await cadDebug<string | null>(page, 'addSketchContourUV', [[0, 2], [5, 2]], false))!;
  const r = (cid: string, i: number): Ref => ({ contourId: cid, pointIndex: i });
  await cadDebug(page, 'addSketchConstraint', 'horizontal', [r(a, 0), r(a, 1)]);
  await cadDebug(page, 'addSketchConstraint', 'parallel', [r(a, 0), r(a, 1), r(b, 0), r(b, 1)]);
  expect(await cadDebug<number>(page, 'sketchConstraintCount')).toBe(2);
  expect(await cadDebug<number>(page, 'constraintGlyphCount')).toBe(2);

  // Deleting contour b drops the parallel (references b); the horizontal (only a) stays.
  await cadDebug(page, 'deleteContourById', b);
  expect(await cadDebug<number>(page, 'sketchConstraintCount')).toBe(1);
  expect(await cadDebug<number>(page, 'constraintGlyphCount')).toBe(1);

  expectNoConsoleErrors(guard);
});

test('#11 sketch constraints: glyphs follow the active sketch when switching', async ({ page }) => {
  const guard = await bootApp(page);
  const s1 = (await cadDebug<string | null>(page, 'beginSketchOnAxis', 'xy'))!;
  const c1 = (await cadDebug<string | null>(page, 'addSketchContourUV', [[0, 0], [5, 0]], false))!;
  await cadDebug(page, 'addSketchConstraint', 'horizontal', [
    { contourId: c1, pointIndex: 0 },
    { contourId: c1, pointIndex: 1 },
  ]);
  expect(await cadDebug<number>(page, 'constraintGlyphCount')).toBe(1);

  // Creating a second sketch switches the active sketch — sketch 1's glyphs must clear.
  const s2 = (await cadDebug<string | null>(page, 'beginSketchOnAxis', 'xz'))!;
  expect(await cadDebug<number>(page, 'constraintGlyphCount')).toBe(0);
  const c2 = (await cadDebug<string | null>(page, 'addSketchContourUV', [[0, 0], [4, 0]], false))!;
  await cadDebug(page, 'addSketchConstraint', 'vertical', [
    { contourId: c2, pointIndex: 0 },
    { contourId: c2, pointIndex: 1 },
  ]);
  expect(await cadDebug<number>(page, 'constraintGlyphCount')).toBe(1);

  // Switching back and forth shows exactly the active sketch's glyphs.
  await cadDebug(page, 'activateSketchById', s1);
  expect(await cadDebug<number>(page, 'constraintGlyphCount')).toBe(1);
  await cadDebug(page, 'activateSketchById', s2);
  expect(await cadDebug<number>(page, 'constraintGlyphCount')).toBe(1);

  expectNoConsoleErrors(guard);
});
