/**
 * Cached DOM references for the Fusion-style shell.
 * Query once at startup — avoids repeated getElementById in hot paths.
 */

export interface DomRefs {
  viewport: HTMLElement;
  toolHint: HTMLElement;
  status: HTMLElement;
  viewportMenu: HTMLElement;
  pointMenu: HTMLElement;
  bodyColorMenu: HTMLElement;
  bodyColorInput: HTMLInputElement;
  browserPanel: HTMLElement;
  browserContextMenu: HTMLElement;
  browserCtxTitle: HTMLElement;
  browserCtxActions: HTMLElement;
  contourList: HTMLElement;
  contourCount: HTMLElement;
  planeAxisSel: HTMLSelectElement;
  planePos: HTMLInputElement;
  planePosVal: HTMLElement;
  scanFile: HTMLInputElement;
  projectFile: HTMLInputElement;
  viewCubeHost: HTMLElement;
  sketchDimInputRow: HTMLElement;
  sketchDimValueInput: HTMLInputElement;
  sketchDimUnitLabel: HTMLElement;
  sketchDimApplyBtn: HTMLButtonElement;
  sketchDimHud: HTMLElement;
  sketchDimHudValue: HTMLInputElement;
  sketchDimHudUnit: HTMLElement;
  sketchDimHudApply: HTMLButtonElement;
}

/** Resolve required DOM nodes; throws if markup in index.html is incomplete. */
export function queryDomRefs(): DomRefs {
  const req = <T extends HTMLElement>(id: string) => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`DOM element #${id} fehlt`);
    return el as T;
  };

  return {
    viewport: req('viewport'),
    toolHint: req('tool-hint'),
    status: req('status'),
    viewportMenu: req('viewport-menu'),
    pointMenu: req('point-menu'),
    bodyColorMenu: req('body-color-menu'),
    bodyColorInput: req('body-color-input') as HTMLInputElement,
    browserPanel: req('browser-panel'),
    browserContextMenu: req('browser-context-menu'),
    browserCtxTitle: req('browser-ctx-title'),
    browserCtxActions: req('browser-ctx-actions'),
    contourList: req('contour-list'),
    contourCount: req('contour-count'),
    planeAxisSel: req('plane-axis') as HTMLSelectElement,
    planePos: req('plane-pos') as HTMLInputElement,
    planePosVal: req('plane-pos-val'),
    scanFile: req('scan-file') as HTMLInputElement,
    projectFile: req('project-file') as HTMLInputElement,
    viewCubeHost: req('view-cube-host'),
    sketchDimInputRow: req('sketch-dim-input-row'),
    sketchDimValueInput: req('sketch-dim-value') as HTMLInputElement,
    sketchDimUnitLabel: req('sketch-dim-unit-label'),
    sketchDimApplyBtn: req('sketch-dim-apply') as HTMLButtonElement,
    sketchDimHud: req('sketch-dim-hud'),
    sketchDimHudValue: req('sketch-dim-hud-value') as HTMLInputElement,
    sketchDimHudUnit: req('sketch-dim-hud-unit'),
    sketchDimHudApply: req('sketch-dim-hud-apply') as HTMLButtonElement,
  };
}