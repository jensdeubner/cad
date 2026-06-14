import { test, expect } from '@playwright/test';
import {
  bootApp,
  cadDebug,
  runFeature,
  selectTab,
  expectNoConsoleErrors,
  waitForBodyCountAbove,
} from './_helpers';

/**
 * E2E for the CAD-Skript-Konsole (the LLM-driven CAD layer).
 *
 * Exercises the write→execute→observe→repair loop end-to-end in a real browser:
 * open the console, run a Track-A script (box − cylinder), confirm a body lands
 * in the scene; run a Track-B SDF blend; trigger an actionable error and confirm
 * no body is created; and drive the three-tool API programmatically via the
 * `window.__cadScript` bridge.
 */
test.describe('feat/cad-script — LLM CAD console', () => {
  test('runs Track A + Track B scripts, surfaces actionable errors, exposes the 3 tools', async ({ page }) => {
    const guard = await bootApp(page);

    // The feature is registered.
    const ids = await cadDebug<string[]>(page, 'features');
    expect(ids).toEqual(expect.arrayContaining(['cad-script']));

    // Open the console (bridge); the ribbon button is present on the Solid tab.
    await runFeature(page, 'cad-script');
    await selectTab(page, 'solid');
    await expect(page.locator('[data-feature="cad-script"]')).toBeVisible();
    await expect(page.locator('[data-cadscript="code"]')).toBeVisible();

    // ── Track A: parametric box with a through hole ──
    const before = await cadDebug<number>(page, 'bodyCount');
    await page.locator('[data-cadscript="code"]').fill(
      'const part = box(30, 20, 10); emit(part.cut(cylinder(4, 30)), "Platte");',
    );
    await page.locator('[data-cadscript="run"]').click();
    await waitForBodyCountAbove(page, before);
    expect(await cadDebug<number>(page, 'triangleCount')).toBeGreaterThan(0);

    const afterA = await page.evaluate(
      () => (window as unknown as { __cadFeature: { cadScript: { ok: boolean; created: string[]; error: string | null } } }).__cadFeature.cadScript,
    );
    expect(afterA.ok).toBe(true);
    expect(afterA.created).toContain('Platte');
    expect(afterA.error).toBeNull();

    // ── Track B: SDF smooth-min blob meshes into a body ──
    const beforeB = await cadDebug<number>(page, 'bodyCount');
    await page.locator('[data-cadscript="code"]').fill(
      'const b = sdf.smoothUnion(sdf.sphere(10), sdf.translate(sdf.sphere(8), 12, 0, 0), 5); emit(b, "Blob", { min: [-12,-12,-12], max: [22,12,12], res: 40 });',
    );
    await page.locator('[data-cadscript="run"]').click();
    await waitForBodyCountAbove(page, beforeB);

    // ── Actionable error: unknown name does NOT create a body ──
    const beforeErr = await cadDebug<number>(page, 'bodyCount');
    await page.locator('[data-cadscript="code"]').fill('emit(boxx(5));');
    await page.locator('[data-cadscript="run"]').click();
    const errState = await page.evaluate(
      () => (window as unknown as { __cadFeature: { cadScript: { ok: boolean; error: string | null } } }).__cadFeature.cadScript,
    );
    expect(errState.ok).toBe(false);
    expect(errState.error).toBe('UNKNOWN_NAME');
    expect(await cadDebug<number>(page, 'bodyCount')).toBe(beforeErr);

    // ── render_view computes framings for each requested view ──
    await page.locator('[data-cadscript="render"]').click();
    const render = await page.evaluate(
      () => (window as unknown as { __cadScript: { lastRender?: { views: unknown[] } } }).__cadScript.lastRender,
    );
    expect(render?.views.length).toBe(3);

    // ── Programmatic 3-tool API via the bridge (run_cad_code + query_geometry) ──
    const topFace = await page.evaluate(() => {
      const s = (window as unknown as {
        __cadScript: {
          run: (c: string) => { ok: boolean };
          query: (r: unknown) => { count: number; items: { normal: number[] }[] };
        };
      }).__cadScript;
      s.run('emit(box(20), "Q");');
      return s.query({ target: 'Q', kind: 'faces', pick: 'max', metricAxis: 'z' });
    });
    expect(topFace.count).toBe(1);
    expect(topFace.items[0].normal[2]).toBeGreaterThan(0.9);

    expectNoConsoleErrors(guard);
  });
});
