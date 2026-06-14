import { test, expect } from '@playwright/test';
import { bootApp, cadDebug, runFeature, expectNoConsoleErrors } from './_helpers';

/**
 * E2E for #30 Phase 1 — timeline rollback (feature suppression). Bodies created
 * by features rolled past the marker are hidden; rolling forward restores them.
 * Uses the real recordSolidFeature path via the recordFeatureTest bridge.
 */

test('#30 timeline rollback: marker hides/restores a feature body (bridge)', async ({ page }) => {
  const guard = await bootApp(page);
  await page.evaluate(() => localStorage.setItem('cad.locale', 'en'));
  await page.reload();
  await page.waitForFunction(
    () => typeof (window as unknown as { __cadDebug?: unknown }).__cadDebug !== 'undefined',
  );

  await runFeature(page, 'primitive-box');
  const boxId = (await cadDebug<string | null>(page, 'activeBodyId'))!;
  expect(boxId).toBeTruthy();
  await cadDebug(page, 'recordFeatureTest', 'extrude', 'Box-Extrude', boxId);

  expect(await cadDebug<number>(page, 'timelineFeatureCount')).toBe(1);
  expect(await cadDebug<number>(page, 'timelineMarker')).toBe(1);
  expect(await cadDebug<number>(page, 'timelineActiveCount')).toBe(1);
  const visibleAll = await cadDebug<number>(page, 'visibleBodyCount');

  // Roll the marker back to the start → the box feature is suppressed (hidden).
  expect(await cadDebug<number>(page, 'setTimelineMarker', 0)).toBe(0);
  expect(await cadDebug<number>(page, 'timelineActiveCount')).toBe(0);
  expect(await cadDebug<number>(page, 'visibleBodyCount')).toBe(visibleAll - 1);

  // Roll forward → the body reappears.
  expect(await cadDebug<number>(page, 'setTimelineMarker', 1)).toBe(1);
  expect(await cadDebug<number>(page, 'visibleBodyCount')).toBe(visibleAll);

  expectNoConsoleErrors(guard);
});

test('#30 timeline rollback: clicking a feature chip rolls the marker (UI)', async ({ page }) => {
  const guard = await bootApp(page);

  await runFeature(page, 'primitive-box');
  const id1 = (await cadDebug<string | null>(page, 'activeBodyId'))!;
  await cadDebug(page, 'recordFeatureTest', 'extrude', 'E1', id1);
  await runFeature(page, 'primitive-box');
  const id2 = (await cadDebug<string | null>(page, 'activeBodyId'))!;
  await cadDebug(page, 'recordFeatureTest', 'revolve', 'E2', id2);
  expect(id2).not.toBe(id1);

  expect(await cadDebug<number>(page, 'timelineFeatureCount')).toBe(2);
  const visibleAll = await cadDebug<number>(page, 'visibleBodyCount');

  // Click the SECOND feature chip → roll back to before it (feature 2 suppressed).
  const chip1 = page.locator('#timeline-features [data-feature-index="1"]');
  await expect(chip1).toBeVisible();
  await chip1.click();
  expect(await cadDebug<number>(page, 'timelineActiveCount')).toBe(1);
  expect(await cadDebug<number>(page, 'visibleBodyCount')).toBe(visibleAll - 1);

  // Click the (now suppressed) chip again → roll forward to include it (all active).
  await page.locator('#timeline-features [data-feature-index="1"]').click();
  expect(await cadDebug<number>(page, 'timelineActiveCount')).toBe(2);
  expect(await cadDebug<number>(page, 'visibleBodyCount')).toBe(visibleAll);

  expectNoConsoleErrors(guard);
});

test('#30 timeline rollback: recording a new feature after a rollback re-activates the model', async ({ page }) => {
  const guard = await bootApp(page);

  await runFeature(page, 'primitive-box');
  const id1 = (await cadDebug<string | null>(page, 'activeBodyId'))!;
  await cadDebug(page, 'recordFeatureTest', 'extrude', 'E1', id1);
  await runFeature(page, 'primitive-box');
  const id2 = (await cadDebug<string | null>(page, 'activeBodyId'))!;
  await cadDebug(page, 'recordFeatureTest', 'revolve', 'E2', id2);
  const visibleAll = await cadDebug<number>(page, 'visibleBodyCount');

  // Roll all the way back → both feature bodies suppressed.
  await cadDebug(page, 'setTimelineMarker', 0);
  expect(await cadDebug<number>(page, 'visibleBodyCount')).toBe(visibleAll - 2);

  // Recording a fresh feature jumps the marker to the end and clears suppression.
  await runFeature(page, 'primitive-box');
  const id3 = (await cadDebug<string | null>(page, 'activeBodyId'))!;
  await cadDebug(page, 'recordFeatureTest', 'extrude', 'E3', id3);
  expect(await cadDebug<number>(page, 'timelineActiveCount')).toBe(3);
  // All previously-suppressed bodies are visible again, plus the new one.
  expect(await cadDebug<number>(page, 'visibleBodyCount')).toBe(visibleAll + 1);

  expectNoConsoleErrors(guard);
});

async function threeRecordedFeatures(page: import('@playwright/test').Page): Promise<string[]> {
  const ids: string[] = [];
  const kinds = ['extrude', 'revolve', 'loft'] as const;
  for (let i = 0; i < 3; i++) {
    await runFeature(page, 'primitive-box');
    const id = (await cadDebug<string | null>(page, 'activeBodyId'))!;
    ids.push(id);
    await cadDebug(page, 'recordFeatureTest', kinds[i], `E${i + 1}`, id);
  }
  return ids;
}

test('#30 timeline rollback: first chip suppresses all, clicking again re-activates one (3 features)', async ({ page }) => {
  const guard = await bootApp(page);
  await threeRecordedFeatures(page);
  expect(await cadDebug<number>(page, 'timelineFeatureCount')).toBe(3);
  const visibleAll = await cadDebug<number>(page, 'visibleBodyCount');

  const chip0 = () => page.locator('#timeline-features [data-feature-index="0"]');
  await chip0().click(); // active first chip → roll back before it → all suppressed
  expect(await cadDebug<number>(page, 'timelineActiveCount')).toBe(0);
  expect(await cadDebug<number>(page, 'visibleBodyCount')).toBe(visibleAll - 3);

  await chip0().click(); // now suppressed → roll forward to include it → 1 active
  expect(await cadDebug<number>(page, 'timelineActiveCount')).toBe(1);
  expect(await cadDebug<number>(page, 'visibleBodyCount')).toBe(visibleAll - 2);

  expectNoConsoleErrors(guard);
});

test('#30 timeline rollback: a suppressed body stays hidden across a visibility toggle', async ({ page }) => {
  const guard = await bootApp(page);
  await runFeature(page, 'primitive-box');
  await cadDebug(page, 'recordFeatureTest', 'extrude', 'E1', (await cadDebug<string | null>(page, 'activeBodyId'))!);
  await runFeature(page, 'primitive-box');
  await cadDebug(page, 'recordFeatureTest', 'revolve', 'E2', (await cadDebug<string | null>(page, 'activeBodyId'))!);
  const visibleAll = await cadDebug<number>(page, 'visibleBodyCount');

  await cadDebug(page, 'setTimelineMarker', 1); // suppress the 2nd feature body
  expect(await cadDebug<number>(page, 'visibleBodyCount')).toBe(visibleAll - 1);

  await runFeature(page, 'view-visibility'); // hide all bodies
  expect(await cadDebug<number>(page, 'visibleBodyCount')).toBe(0);
  await runFeature(page, 'view-visibility'); // show all — the suppressed body must stay hidden
  expect(await cadDebug<number>(page, 'visibleBodyCount')).toBe(visibleAll - 1);

  expectNoConsoleErrors(guard);
});

test('#30 timeline rollback: a suppressed body stays hidden across an isolate cycle', async ({ page }) => {
  const guard = await bootApp(page);
  await runFeature(page, 'primitive-box');
  await cadDebug(page, 'recordFeatureTest', 'extrude', 'E1', (await cadDebug<string | null>(page, 'activeBodyId'))!);
  await runFeature(page, 'primitive-box');
  await cadDebug(page, 'recordFeatureTest', 'revolve', 'E2', (await cadDebug<string | null>(page, 'activeBodyId'))!);
  const visibleAll = await cadDebug<number>(page, 'visibleBodyCount');

  await cadDebug(page, 'setTimelineMarker', 1); // suppress the 2nd feature body
  expect(await cadDebug<number>(page, 'visibleBodyCount')).toBe(visibleAll - 1);

  await runFeature(page, 'view-isolate'); // isolate active body
  await runFeature(page, 'view-isolate'); // restore — suppression must survive
  expect(await cadDebug<number>(page, 'visibleBodyCount')).toBe(visibleAll - 1);

  expectNoConsoleErrors(guard);
});
