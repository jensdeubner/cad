import { test, expect } from '@playwright/test';
import { bootApp, cadDebug, expectNoConsoleErrors, openPanel, runFeature, selectTab } from './_helpers';
import { FUSION_TABS } from './_tool-matrix';

test.describe('Wave D — UI & Chrome', () => {
  for (const tab of FUSION_TABS) {
    test(`fusion tab "${tab}" is clickable`, async ({ page }) => {
      const guard = await bootApp(page);
      await selectTab(page, tab);
      await expect(page.locator(`[data-fusion-tab="${tab}"]`)).toHaveClass(/active/);
      expectNoConsoleErrors(guard);
    });
  }

  test('browser tree lists default component on boot', async ({ page }) => {
    const guard = await bootApp(page);
    const rows = await cadDebug<number>(page, 'browserTreeRowCount');
    expect(rows).toBeGreaterThan(0);
    await expect(page.locator('#browser-tree')).toBeVisible();
    expectNoConsoleErrors(guard);
  });

  test('browser tree grows after primitive body + sketch', async ({ page }) => {
    const guard = await bootApp(page);
    const before = await cadDebug<number>(page, 'browserTreeRowCount');
    await runFeature(page, 'primitive-box');
    await cadDebug(page, 'beginSketchOnAxis', 'xy');
    await cadDebug(page, 'addSketchContourUV', [[0, 0], [5, 5]], false);
    const after = await cadDebug<number>(page, 'browserTreeRowCount');
    expect(after).toBeGreaterThan(before);
    expectNoConsoleErrors(guard);
  });

  test('toggle origin planes via browser bridge', async ({ page }) => {
    const guard = await bootApp(page);
    const on = (await cadDebug<{ originPlanesVisible: boolean }>(page, 'browserState'))
      .originPlanesVisible;
    expect(on).toBe(true);
    await cadDebug(page, 'toggleBrowserSceneItem', 'origin-planes');
    const off = (await cadDebug<{ originPlanesVisible: boolean }>(page, 'browserState'))
      .originPlanesVisible;
    expect(off).toBe(false);
    await cadDebug(page, 'toggleBrowserSceneItem', 'origin-planes');
    expect(
      (await cadDebug<{ originPlanesVisible: boolean }>(page, 'browserState')).originPlanesVisible,
    ).toBe(true);
    expectNoConsoleErrors(guard);
  });

  test('toggle work plane visibility via browser bridge', async ({ page }) => {
    const guard = await bootApp(page);
    const initial = (await cadDebug<{ planeVisible: boolean }>(page, 'browserState')).planeVisible;
    await cadDebug(page, 'toggleBrowserSceneItem', 'plane');
    const toggled = (await cadDebug<{ planeVisible: boolean }>(page, 'browserState')).planeVisible;
    expect(toggled).toBe(!initial);
    expectNoConsoleErrors(guard);
  });

  test('toggle sketch grid visibility via browser bridge', async ({ page }) => {
    const guard = await bootApp(page);
    await cadDebug(page, 'toggleBrowserSceneItem', 'grid');
    const state = await cadDebug<{ gridVisible: boolean }>(page, 'browserState');
    expect(state.gridVisible).toBe(false);
    expectNoConsoleErrors(guard);
  });

  test('view cube host is mounted after boot', async ({ page }) => {
    const guard = await bootApp(page);
    expect(await cadDebug<boolean>(page, 'viewCubeMounted')).toBe(true);
    await expect(page.locator('#view-cube-host')).toBeVisible();
    expectNoConsoleErrors(guard);
  });

  test('fusion shortcuts help table is rendered', async ({ page }) => {
    const guard = await bootApp(page);
    await selectTab(page, 'view');
    await openPanel(page, 'view');
    const rows = page.locator('#panel-view #fusion-shortcuts-list tr');
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThan(10);
    expectNoConsoleErrors(guard);
  });

  test('status bar updates after sketch finish', async ({ page }) => {
    const guard = await bootApp(page);
    await cadDebug(page, 'beginSketchOnAxis', 'xy');
    await cadDebug(page, 'finishActiveSketch');
    const status = await cadDebug<string>(page, 'status');
    expect(status.length).toBeGreaterThan(0);
    expectNoConsoleErrors(guard);
  });

  test('empty project restores after closing sketch with no mesh', async ({ page }) => {
    const guard = await bootApp(page);
    await cadDebug(page, 'beginSketchOnAxis', 'xy');
    await cadDebug(page, 'finishActiveSketch');
    expect(await cadDebug<boolean>(page, 'isEmptyProject')).toBe(true);
    expectNoConsoleErrors(guard);
  });
});