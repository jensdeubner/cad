import { test, expect } from '@playwright/test';
import {
  bootApp,
  cadDebug,
  clickRibbonTool,
  expectNoConsoleErrors,
  runFeature,
  selectTab,
} from './_helpers';
import { ALL_TOOLS, BODY_TOOLS, SKETCH_TOOLS, TOOL_RIBBON_TAB } from './_tool-matrix';

async function prepSketch(page: import('@playwright/test').Page) {
  await cadDebug(page, 'beginSketchOnAxis', 'xy');
}

async function prepBodyMesh(page: import('@playwright/test').Page) {
  await runFeature(page, 'primitive-box');
}

test.describe('Wave B — Werkzeuge (Bridge)', () => {
  for (const tool of ALL_TOOLS) {
    test(`setActiveTool("${tool}") activates tool`, async ({ page }) => {
      const guard = await bootApp(page);
      if (SKETCH_TOOLS.has(tool)) await prepSketch(page);
      if (BODY_TOOLS.has(tool)) await prepBodyMesh(page);
      if (tool === 'align') await selectTab(page, 'align');
      if (tool === 'polyline' || tool === 'lasso') await selectTab(page, 'draw');

      const active = await cadDebug<string>(page, 'setActiveTool', tool);
      expect(active).toBe(tool);
      expectNoConsoleErrors(guard);
    });
  }
});

test.describe('Wave B — Werkzeuge (Ribbon)', () => {
  for (const tool of ALL_TOOLS) {
    test(`ribbon data-tool="${tool}" activates tool`, async ({ page }) => {
      const guard = await bootApp(page);
      if (SKETCH_TOOLS.has(tool)) await prepSketch(page);
      if (BODY_TOOLS.has(tool)) {
        await prepBodyMesh(page);
        // body tools toggle off when re-clicked — start from navigate
        await cadDebug(page, 'setActiveTool', 'navigate');
      }

      const tab = TOOL_RIBBON_TAB[tool];
      // navigate lives on the draw ribbon; toggle off when re-clicked
      if (tool === 'navigate') {
        await selectTab(page, 'draw');
        await cadDebug(page, 'setActiveTool', 'polyline');
      }
      await clickRibbonTool(page, tool, tab);
      const active = await cadDebug<string>(page, 'activeTool');
      expect(active).toBe(tool);
      expectNoConsoleErrors(guard);
    });
  }
});