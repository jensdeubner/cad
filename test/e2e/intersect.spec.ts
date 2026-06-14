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
 * E2E for Boolean Intersect (Schneiden) + Interferenz-Prüfung.
 *
 * A 20 mm box and a sphere are both created centered at the origin, so they
 * overlap. `solid-intersect` must add a non-empty body (the overlap), and
 * `inspect-interference` must report a positive overlap volume without adding
 * a body. Both the debug bridge and the real ribbon button are exercised.
 */
test.describe('feat/intersect — Schneiden + Interferenz', () => {
  test('intersects two overlapping bodies and reports interference (EN)', async ({ page }) => {
    const guard = await bootApp(page);
    await page.evaluate(() => localStorage.setItem('cad.locale', 'en'));
    await page.reload();
    await page.waitForFunction(
      () => typeof (window as unknown as { __cadDebug?: unknown }).__cadDebug !== 'undefined',
    );

    // Two overlapping primitives, both centered at the origin.
    await runFeature(page, 'primitive-box');
    await waitForBodyCountAbove(page, 0);
    const afterBox = await cadDebug<number>(page, 'bodyCount');
    await runFeature(page, 'primitive-sphere');
    await waitForBodyCountAbove(page, afterBox);

    // The intersect feature is registered.
    const ids = await cadDebug<string[]>(page, 'features');
    expect(ids).toEqual(
      expect.arrayContaining(['solid-intersect', 'inspect-interference']),
    );

    // 1) Bridge run: intersection of box ∩ sphere adds a non-empty body.
    const beforeFirst = await cadDebug<number>(page, 'bodyCount');
    await runFeature(page, 'solid-intersect');
    await waitForBodyCountAbove(page, beforeFirst);
    const afterBridge = await cadDebug<number>(page, 'bodyCount');
    expect(afterBridge).toBeGreaterThan(beforeFirst);
    expect(await cadDebug<number>(page, 'triangleCount')).toBeGreaterThan(0);

    // 2) Real ribbon button: build a fresh overlapping box + sphere pair (so the
    //    two newest bodies are clean primitives again), then click the button.
    await runFeature(page, 'primitive-box');
    await waitForBodyCountAbove(page, afterBridge);
    const afterBox2 = await cadDebug<number>(page, 'bodyCount');
    await runFeature(page, 'primitive-sphere');
    await waitForBodyCountAbove(page, afterBox2);

    await selectTab(page, 'solid');
    await expect(page.locator('[data-feature="solid-intersect"]')).toBeVisible();
    const beforeClick = await cadDebug<number>(page, 'bodyCount');
    await clickFeatureButton(page, 'solid-intersect');
    await waitForBodyCountAbove(page, beforeClick);
    expect(await cadDebug<number>(page, 'bodyCount')).toBeGreaterThan(beforeClick);
    expect(await cadDebug<number>(page, 'triangleCount')).toBeGreaterThan(0);

    // 3) Interference check on a fresh overlapping pair: positive overlap volume,
    //    no new body created.
    await runFeature(page, 'primitive-box');
    await waitForBodyCountAbove(page, beforeClick + 1);
    const afterBox3 = await cadDebug<number>(page, 'bodyCount');
    await runFeature(page, 'primitive-sphere');
    await waitForBodyCountAbove(page, afterBox3);

    const beforeInspect = await cadDebug<number>(page, 'bodyCount');
    await runFeature(page, 'inspect-interference');
    const interference = await page.evaluate(
      () =>
        (window as unknown as { __cadFeature: { interference: { volume: number; overlaps: boolean } } })
          .__cadFeature.interference,
    );
    expect(interference.overlaps).toBe(true);
    expect(interference.volume).toBeGreaterThan(0);
    expect(await cadDebug<number>(page, 'bodyCount')).toBe(beforeInspect);

    expectNoConsoleErrors(guard);
  });
});
