import { test, expect } from '@playwright/test';
import {
  bootApp,
  cadDebug,
  runFeature,
  selectTab,
  clickFeatureButton,
  expectNoConsoleErrors,
} from './_helpers';

/**
 * E2E for feat/mesh-smooth (Laplace-Glätten). Proves the whole chain on a dense,
 * well-conditioned sphere: registry → ribbon button → host.run → in-place
 * geometry replacement, with zero console errors. Asserts the smooth is stable
 * (triangle count unchanged, bbox stays finite / no NaN) and exposes a hard
 * result via window.__cadFeature.smooth. EN locale.
 */
interface SmoothResult {
  ok: boolean;
  tris: number;
}
interface Bbox {
  min: [number, number, number];
  max: [number, number, number];
}

function bboxFinite(b: Bbox | null): boolean {
  if (!b) return false;
  return [...b.min, ...b.max].every((v) => Number.isFinite(v));
}

test.describe('feat/mesh-smooth — Laplace-Glätten', () => {
  test('smooths a sphere in place without exploding (bridge + real button), EN', async ({
    page,
  }) => {
    const guard = await bootApp(page);
    await page.evaluate(() => localStorage.setItem('cad.locale', 'en'));
    await page.reload();
    await page.waitForFunction(
      () => typeof (window as unknown as { __cadDebug?: unknown }).__cadDebug !== 'undefined',
    );

    // 1. Feature registered.
    const ids = await cadDebug<string[]>(page, 'features');
    expect(ids).toContain('mesh-smooth-laplacian');

    // 2. Dense, well-conditioned test geometry to smooth.
    await runFeature(page, 'primitive-sphere');
    const activeId = await cadDebug<string>(page, 'activeBodyId');
    expect(activeId).toBeTruthy();

    const trisBefore = await cadDebug<number>(page, 'triangleCount');
    const bboxBefore = await cadDebug<Bbox | null>(page, 'bbox');
    expect(bboxFinite(bboxBefore)).toBe(true);

    // 3a. Run once via the debug bridge.
    await runFeature(page, 'mesh-smooth-laplacian');

    // 3b. Run once via the REAL ribbon button on the Body tab.
    await selectTab(page, 'body');
    await expect(page.locator('[data-feature="mesh-smooth-laplacian"]')).toBeVisible();
    await clickFeatureButton(page, 'mesh-smooth-laplacian');
    await page.waitForFunction(
      () =>
        (window as unknown as { __cadFeature?: { smooth?: { ok?: boolean } } }).__cadFeature?.smooth
          ?.ok === true,
    );

    // 4. Hard assertions: feature succeeded, topology preserved, no NaN/explosion.
    const result = await page.evaluate(
      () => (window as unknown as { __cadFeature: { smooth: SmoothResult } }).__cadFeature.smooth,
    );
    expect(result.ok).toBe(true);

    expect(await cadDebug<string>(page, 'lastFeature')).toBe('mesh-smooth-laplacian');

    // Laplacian smoothing keeps the triangle count of a clean closed mesh.
    expect(await cadDebug<number>(page, 'triangleCount')).toBe(trisBefore);
    expect(result.tris).toBe(trisBefore);

    // Bounding box must still be finite (no NaN explosion).
    const bboxAfter = await cadDebug<Bbox | null>(page, 'bbox');
    expect(bboxFinite(bboxAfter)).toBe(true);

    // 5. Non-negotiable: zero console / page errors.
    expectNoConsoleErrors(guard);
  });
});
