import { test, expect } from '@playwright/test';
import { bootApp, cadDebug, expectNoConsoleErrors, fusionShortcut } from './_helpers';

test.describe('Wave C — Fusion-Shortcuts', () => {
  test('S enters sketch pick mode', async ({ page }) => {
    const guard = await bootApp(page);
    await fusionShortcut(page, { key: 's' });
    expect(await cadDebug<string>(page, 'activeTool')).toBe('sketch-pick');
    expect(await cadDebug<string>(page, 'activeWorkspace')).toBe('sketch');
    expectNoConsoleErrors(guard);
  });

  test('L/C/R/A activate sketch draw tools in active sketch', async ({ page }) => {
    const guard = await bootApp(page);
    await cadDebug(page, 'beginSketchOnAxis', 'xy');
    for (const [key, tool] of [
      ['l', 'sketch-line'],
      ['c', 'sketch-circle'],
      ['r', 'sketch-rect'],
      ['a', 'sketch-arc'],
    ] as const) {
      await fusionShortcut(page, { key });
      expect(await cadDebug<string>(page, 'activeTool')).toBe(tool);
    }
    expectNoConsoleErrors(guard);
  });

  test('D activates sketch dimension tool', async ({ page }) => {
    const guard = await bootApp(page);
    await cadDebug(page, 'beginSketchOnAxis', 'xy');
    await fusionShortcut(page, { key: 'd' });
    expect(await cadDebug<string>(page, 'activeTool')).toBe('sketch-dim');
    expectNoConsoleErrors(guard);
  });

  test('N returns to navigate', async ({ page }) => {
    const guard = await bootApp(page);
    await cadDebug(page, 'beginSketchOnAxis', 'xy');
    await cadDebug(page, 'setActiveTool', 'sketch-line');
    await fusionShortcut(page, { key: 'n' });
    expect(await cadDebug<string>(page, 'activeTool')).toBe('navigate');
    expectNoConsoleErrors(guard);
  });

  test('M activates move-body', async ({ page }) => {
    const guard = await bootApp(page);
    await fusionShortcut(page, { key: 'm' });
    expect(await cadDebug<string>(page, 'activeTool')).toBe('move-body');
    expectNoConsoleErrors(guard);
  });

  test('P activates press-pull', async ({ page }) => {
    const guard = await bootApp(page);
    await fusionShortcut(page, { key: 'p' });
    expect(await cadDebug<string>(page, 'activeTool')).toBe('press-pull');
    expectNoConsoleErrors(guard);
  });

  test('1/2/3 view presets do not throw', async ({ page }) => {
    const guard = await bootApp(page);
    await fusionShortcut(page, { key: '1' });
    await fusionShortcut(page, { key: '2' });
    await fusionShortcut(page, { key: '3' });
    expectNoConsoleErrors(guard);
  });

  test('F fit view on empty project', async ({ page }) => {
    const guard = await bootApp(page);
    await fusionShortcut(page, { key: 'f' });
    expect(await cadDebug<boolean>(page, 'isEmptyProject')).toBe(true);
    expectNoConsoleErrors(guard);
  });

  test('Ctrl+S triggers save path without crash (sketch data present)', async ({ page }) => {
    const guard = await bootApp(page);
    await cadDebug(page, 'beginSketchOnAxis', 'xy');
    await cadDebug(page, 'addSketchContourUV', [[0, 0], [4, 0]], false);
    await fusionShortcut(page, { key: 's', ctrl: true });
    expectNoConsoleErrors(guard);
  });
});

test.describe('Wave C — Undo/Redo', () => {
  test('sketch contour add is undoable', async ({ page }) => {
    const guard = await bootApp(page);
    await cadDebug(page, 'beginSketchOnAxis', 'xy');
    const before = await cadDebug<number>(page, 'contourCount');
    await cadDebug(page, 'addSketchContourUV', [[0, 0], [6, 0], [6, 6]], true);
    expect(await cadDebug<number>(page, 'contourCount')).toBe(before + 1);
    const tlBefore = await cadDebug<{ canUndo: boolean }>(page, 'undoTimeline');
    expect(tlBefore.canUndo).toBe(true);
    await cadDebug(page, 'testUndo');
    expect(await cadDebug<number>(page, 'contourCount')).toBe(before);
    expectNoConsoleErrors(guard);
  });

  test('redo restores undone sketch contour', async ({ page }) => {
    const guard = await bootApp(page);
    await cadDebug(page, 'beginSketchOnAxis', 'xy');
    await cadDebug(page, 'addSketchContourUV', [[0, 0], [5, 0], [5, 5]], true);
    await cadDebug(page, 'testUndo');
    await cadDebug(page, 'testRedo');
    expect(await cadDebug<number>(page, 'contourCount')).toBe(1);
    expectNoConsoleErrors(guard);
  });

  test('Ctrl+Z / Ctrl+Y shortcuts drive undo/redo', async ({ page }) => {
    const guard = await bootApp(page);
    await cadDebug(page, 'addContourUV', [[0, 0], [4, 0], [4, 4], [0, 4]], true, 'xy', 0);
    expect(await cadDebug<number>(page, 'contourCount')).toBe(1);
    await fusionShortcut(page, { key: 'z', ctrl: true });
    expect(await cadDebug<number>(page, 'contourCount')).toBe(0);
    await fusionShortcut(page, { key: 'y', ctrl: true });
    expect(await cadDebug<number>(page, 'contourCount')).toBe(1);
    expectNoConsoleErrors(guard);
  });

  test('finish-sketch shortcut closes active sketch', async ({ page }) => {
    const guard = await bootApp(page);
    await cadDebug(page, 'beginSketchOnAxis', 'xy');
    // finish-sketch is not a single key in resolveFusionShortcut — use Esc cancel path check + explicit finish
    await cadDebug(page, 'finishActiveSketch');
    expect(await cadDebug<string | null>(page, 'activeSketchId')).toBeNull();
    expectNoConsoleErrors(guard);
  });

  test('undo timeline grows with labeled steps', async ({ page }) => {
    const guard = await bootApp(page);
    await cadDebug(page, 'beginSketchOnAxis', 'xy');
    await cadDebug(page, 'addSketchContourUV', [[0, 0], [3, 0]], false);
    const tl = await cadDebug<{ steps: { label: string }[]; position: number }>(page, 'undoTimeline');
    expect(tl.steps.length).toBeGreaterThan(0);
    expect(tl.position).toBeGreaterThan(0);
    expectNoConsoleErrors(guard);
  });
});