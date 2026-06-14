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

interface SphereBody {
  center: [number, number, number];
  radius: number;
}

// Wider viewport so the Solid-tab ribbon button is never off-screen.
test.use({ viewport: { width: 1600, height: 900 } });

/**
 * Hüllkugel-Körper (Bounding sphere body): creates a new sphere body matching
 * the active body's world bounding sphere. Proves the full chain — registry →
 * ribbon button → host.run → new body — with zero console errors, EN locale.
 *
 * A 20mm box has bbox -10..10, so its bounding sphere radius is the half-space
 * diagonal 10·√3 ≈ 17.32.
 */
test.describe('feat/sphere-body — Hüllkugel-Körper', () => {
  test('creates a sphere body matching the active body bounding sphere (bridge + ribbon)', async ({
    page,
  }) => {
    const guard = await bootApp(page);
    await page.evaluate(() => localStorage.setItem('cad.locale', 'en'));
    await page.reload();
    await page.waitForFunction(
      () => typeof (window as unknown as { __cadDebug?: unknown }).__cadDebug !== 'undefined',
    );

    // Registry mounted the feature.
    const ids = await cadDebug<string[]>(page, 'features');
    expect(ids).toContain('solid-sphere-body');

    // Deterministic test geometry: 20mm box → bounding sphere radius ≈ 17.3.
    await runFeature(page, 'primitive-box');

    // ── Run #1: via the debug bridge ──
    let before = await cadDebug<number>(page, 'bodyCount');
    await runFeature(page, 'solid-sphere-body');
    await waitForBodyCountAbove(page, before);
    expect(await cadDebug<number>(page, 'bodyCount')).toBeGreaterThan(before);
    expect(await cadDebug<string>(page, 'lastFeature')).toBe('solid-sphere-body');

    // Stashed hard numbers from the feature itself.
    const stashed = await page.evaluate(
      () => (window as unknown as { __cadFeature: { sphereBody: SphereBody } }).__cadFeature.sphereBody,
    );
    expect(stashed.radius).toBeGreaterThan(0);
    // 20mm box → half-diagonal 10·√3 ≈ 17.32 (±5%).
    expect(Math.abs(stashed.radius - 10 * Math.sqrt(3))).toBeLessThanOrEqual(0.05 * 10 * Math.sqrt(3));

    // ── Run #2: via the real ribbon button (selectTab + immediate click) ──
    // Re-activate the box first so the bounding-sphere source is the box again.
    await runFeature(page, 'primitive-box');
    before = await cadDebug<number>(page, 'bodyCount');
    await selectTab(page, 'solid');
    await clickFeatureButton(page, 'solid-sphere-body');
    await waitForBodyCountAbove(page, before);

    const stashed2 = await page.evaluate(
      () => (window as unknown as { __cadFeature: { sphereBody: SphereBody } }).__cadFeature.sphereBody,
    );
    expect(stashed2.radius).toBeGreaterThan(0);

    // Non-negotiable: no console / page errors.
    expectNoConsoleErrors(guard);
  });
});
