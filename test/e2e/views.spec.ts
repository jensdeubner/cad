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
 * E2E for feat/views — Look At + named views (save / restore).
 *
 * Proves the whole chain through the registry seam: a real ribbon button on the
 * View tab moves the camera, and the saved/restored camera state round-trips
 * back to the captured position. Zero console errors, EN locale.
 */

type Vec3 = [number, number, number];

interface ViewsBridge {
  lookAt?: { before: Vec3; after: Vec3 };
  saved?: { pos: Vec3; target: Vec3; up: Vec3 };
  restoredTo?: Vec3;
}

function readViews(page: import('@playwright/test').Page): Promise<ViewsBridge> {
  return page.evaluate(
    () =>
      ((window as unknown as { __cadFeature?: { views?: ViewsBridge } }).__cadFeature?.views ?? {}) as ViewsBridge,
  );
}

function camPos(page: import('@playwright/test').Page): Promise<Vec3> {
  return page.evaluate(
    () =>
      (
        window as unknown as { __cadView?: { camPos: () => Vec3 } }
      ).__cadView!.camPos(),
  );
}

function dist(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

test.describe('feat/views — Look At + named views', () => {
  test('Look At moves the camera via the real ribbon button', async ({ page }) => {
    const guard = await bootApp(page);
    await runFeature(page, 'primitive-box');

    // Real ribbon button on the View tab.
    await selectTab(page, 'view');
    await expect(page.locator('[data-feature="view-look-at"]')).toBeVisible();
    await clickFeatureButton(page, 'view-look-at');

    const views = await readViews(page);
    expect(views.lookAt).toBeTruthy();
    const { before, after } = views.lookAt!;
    // Hard assertion: the camera actually moved.
    expect(dist(before, after)).toBeGreaterThan(1);
    expect(await cadDebug<string>(page, 'lastFeature')).toBe('view-look-at');

    expectNoConsoleErrors(guard);
  });

  test('save then restore returns the camera to the saved position (EN locale)', async ({ page }) => {
    const guard = await bootApp(page);
    await page.evaluate(() => localStorage.setItem('cad.locale', 'en'));
    await page.reload();
    await page.waitForFunction(
      () => typeof (window as unknown as { __cadDebug?: unknown }).__cadDebug !== 'undefined',
    );

    await runFeature(page, 'primitive-box');

    // Establish a defined camera state, then save it.
    await runFeature(page, 'view-look-at');
    await runFeature(page, 'view-save');
    const views = await readViews(page);
    expect(views.saved).toBeTruthy();
    const savedPos = views.saved!.pos;

    // Move the camera away from the saved state.
    await page.evaluate(() => {
      const cam = (window as unknown as { __cadView: { moveCamera: (d: number) => void } }).__cadView;
      cam.moveCamera(250);
    });
    const movedPos = await camPos(page);
    expect(dist(savedPos, movedPos)).toBeGreaterThan(50);

    // Restore → camera returns close to the saved position.
    await runFeature(page, 'view-restore');
    const restored = await readViews(page);
    expect(restored.restoredTo).toBeTruthy();
    expect(dist(savedPos, restored.restoredTo!)).toBeLessThan(1);

    const live = await camPos(page);
    expect(dist(savedPos, live)).toBeLessThan(1);

    expectNoConsoleErrors(guard);
  });
});
