import { test, expect } from '@playwright/test';
import { bootApp, cadDebug, runFeature, selectTab, clickFeatureButton, expectNoConsoleErrors } from './_helpers';

/**
 * #16 Offset construction plane: starts a sketch on an origin plane offset
 * along its normal (a construction plane the user can immediately draw on).
 */
test.describe('#16 Offset-Konstruktionsebene', () => {
  test('creates an offset sketch plane (bridge + ribbon), DE default', async ({ page }) => {
    const guard = await bootApp(page);

    const before = await cadDebug<number>(page, 'sketchCount');
    await runFeature(page, 'construct-plane-xy');
    await page.waitForFunction(
      (b) => (window as unknown as { __cadDebug: { sketchCount: () => number } }).__cadDebug.sketchCount() > (b as number),
      before,
    );
    expect(await cadDebug<number>(page, 'sketchCount')).toBe(before + 1);

    const op = await page.evaluate(
      () => (window as unknown as { __cadFeature: { offsetPlane: { axis: string; position: number; sketchId: string } } }).__cadFeature.offsetPlane,
    );
    expect(op.axis).toBe('xy');
    expect(op.position).toBeGreaterThan(0); // genuinely offset, not the origin plane
    expect(op.sketchId.length).toBeGreaterThan(0);
    expect(await cadDebug<string>(page, 'lastFeature')).toBe('construct-plane-xy');

    // Real ribbon button on the Sketch tab (XZ variant).
    await selectTab(page, 'sketch');
    await clickFeatureButton(page, 'construct-plane-xz');
    await page.waitForFunction(
      (b) => (window as unknown as { __cadDebug: { sketchCount: () => number } }).__cadDebug.sketchCount() > (b as number),
      before + 1,
    );
    expect(await cadDebug<number>(page, 'sketchCount')).toBe(before + 2);

    expectNoConsoleErrors(guard);
  });

  test('offsets above the active body and works in EN locale', async ({ page }) => {
    const guard = await bootApp(page);
    await page.evaluate(() => localStorage.setItem('cad.locale', 'en'));
    await page.reload();
    await page.waitForFunction(
      () => typeof (window as unknown as { __cadDebug?: unknown }).__cadDebug !== 'undefined',
    );

    // A 20mm box spans z -10..10 → an offset XY plane should sit above z=10.
    await runFeature(page, 'primitive-box');
    await runFeature(page, 'construct-plane-xy');
    const op = await page.evaluate(
      () => (window as unknown as { __cadFeature: { offsetPlane: { position: number } } }).__cadFeature.offsetPlane,
    );
    expect(op.position).toBeGreaterThan(10); // above the body's top face

    expectNoConsoleErrors(guard);
  });
});
