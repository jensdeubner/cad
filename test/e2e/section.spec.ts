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
 * E2E for the Section Analysis feature (inspect-section). Proves the live
 * clipping plane toggles on and off: on → window.__cadFeature.section.active,
 * one renderer clipping plane, overlay objects added; off → reverted to the
 * pre-section baseline. Also drives the real ribbon button. Zero console errors.
 */

interface SectionState {
  active: boolean;
  planeCount: number;
}

/** Read the feature's own debug namespace. */
async function sectionState(page: import('@playwright/test').Page): Promise<SectionState> {
  return page.evaluate(
    () =>
      (window as unknown as { __cadFeature: { section: SectionState } }).__cadFeature.section,
  );
}

test.describe('inspect-section — live clipping plane (Inspect standard)', () => {
  test('toggles a clipping plane + overlay on and off via the bridge', async ({ page }) => {
    const guard = await bootApp(page);

    // Deterministic test geometry.
    const before = await cadDebug<number>(page, 'bodyCount');
    await runFeature(page, 'primitive-box');
    await waitForBodyCountAbove(page, before);

    // Feature registered.
    const ids = await cadDebug<string[]>(page, 'features');
    expect(ids).toContain('inspect-section');

    // Baseline overlay count before any section.
    const baselineOverlay = await cadDebug<number>(page, 'overlayCount');

    // 1. Enable — hard state assertions.
    await runFeature(page, 'inspect-section');
    {
      const s = await sectionState(page);
      expect(s.active).toBe(true);
      expect(s.planeCount).toBe(1);
      expect(await cadDebug<number>(page, 'overlayCount')).toBeGreaterThan(baselineOverlay);
      expect(await cadDebug<string>(page, 'lastFeature')).toBe('inspect-section');
    }

    // 2. Disable — reverts to baseline.
    await runFeature(page, 'inspect-section');
    {
      const s = await sectionState(page);
      expect(s.active).toBe(false);
      expect(s.planeCount).toBe(0);
      expect(await cadDebug<number>(page, 'overlayCount')).toBe(baselineOverlay);
    }

    expectNoConsoleErrors(guard);
  });

  test('works with no body present (clipping must not throw)', async ({ page }) => {
    const guard = await bootApp(page);

    // No primitive created on purpose.
    await runFeature(page, 'inspect-section');
    const on = await sectionState(page);
    expect(on.active).toBe(true);
    expect(on.planeCount).toBe(1);

    await runFeature(page, 'inspect-section');
    const off = await sectionState(page);
    expect(off.active).toBe(false);
    expect(off.planeCount).toBe(0);

    expectNoConsoleErrors(guard);
  });

  test('real ribbon button on the View tab toggles the section', async ({ page }) => {
    const guard = await bootApp(page);

    const before = await cadDebug<number>(page, 'bodyCount');
    await runFeature(page, 'primitive-box');
    await waitForBodyCountAbove(page, before);

    const baselineOverlay = await cadDebug<number>(page, 'overlayCount');

    // The button lives on the View tab.
    await selectTab(page, 'view');
    await expect(page.locator('[data-feature="inspect-section"]')).toBeVisible();

    await clickFeatureButton(page, 'inspect-section');
    await page.waitForFunction(
      () =>
        (window as unknown as { __cadFeature?: { section?: { active: boolean } } }).__cadFeature
          ?.section?.active === true,
    );
    expect((await sectionState(page)).planeCount).toBe(1);
    expect(await cadDebug<number>(page, 'overlayCount')).toBeGreaterThan(baselineOverlay);

    await clickFeatureButton(page, 'inspect-section');
    await page.waitForFunction(
      () =>
        (window as unknown as { __cadFeature?: { section?: { active: boolean } } }).__cadFeature
          ?.section?.active === false,
    );
    expect(await cadDebug<number>(page, 'overlayCount')).toBe(baselineOverlay);

    expectNoConsoleErrors(guard);
  });

  test('runs in EN locale without console errors', async ({ page }) => {
    const guard = await bootApp(page);
    await page.evaluate(() => localStorage.setItem('cad.locale', 'en'));
    await page.reload();
    await page.waitForFunction(
      () => typeof (window as unknown as { __cadDebug?: unknown }).__cadDebug !== 'undefined',
    );

    const before = await cadDebug<number>(page, 'bodyCount');
    await runFeature(page, 'primitive-box');
    await waitForBodyCountAbove(page, before);

    await runFeature(page, 'inspect-section');
    expect((await sectionState(page)).active).toBe(true);
    // EN status string is set.
    expect(await cadDebug<string>(page, 'status')).toContain('Section plane');

    await runFeature(page, 'inspect-section');
    expect((await sectionState(page)).active).toBe(false);

    expectNoConsoleErrors(guard);
  });
});
