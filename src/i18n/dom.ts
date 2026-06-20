import { t } from './index';

type DomBinding = {
  selector: string;
  key: string;
  attr?: 'text' | 'html' | 'title' | 'aria-label';
};

const TAB_KEYS: Record<string, string> = {
  start: 'tabs.start',
  sketch: 'tabs.sketch',
  solid: 'tabs.solid',
  body: 'tabs.body',
  align: 'tabs.align',
  draw: 'tabs.draw',
  view: 'tabs.view',
  contours: 'tabs.contours',
};

const SCAN_MODE_OPTIONS = ['cad', 'flaeche', 'kontrast', 'punkte', 'dunkel'] as const;

const DOM_BINDINGS: DomBinding[] = [
  { selector: '#undo-point', key: 'quick.undo', attr: 'title' },
  { selector: '#redo-point', key: 'quick.redo', attr: 'title' },
  { selector: '#save-project', key: 'quick.save', attr: 'title' },
  { selector: '#load-project-start', key: 'ribbon.openProject', attr: 'title' },
  { selector: '#body-transform-reset', key: 'ribbon.resetTransformTitle', attr: 'title' },
  { selector: '#body-cut-plane', key: 'ribbon.cutPlane', attr: 'title' },
  { selector: '#body-mirror-x', key: 'ribbon.mirrorX', attr: 'title' },
  { selector: '#finish-sketch', key: 'ribbon.finishSketch', attr: 'title' },
  { selector: '#discard-draft', key: 'ribbon.discardDraftTitle', attr: 'title' },
  { selector: '#timeline-undo', key: 'timeline.undo', attr: 'title' },
  { selector: '#timeline-redo', key: 'timeline.redo', attr: 'title' },
  { selector: '#timeline-undo', key: 'timeline.undo', attr: 'aria-label' },
  { selector: '#timeline-redo', key: 'timeline.redo', attr: 'aria-label' },

  { selector: '#sketch-panel-pick-hint', key: 'panel.sketch.pickHint', attr: 'html' },
  { selector: '#sketch-dim-hud-apply', key: 'common.ok' },
  { selector: '#browser-ctx-title', key: 'browser.entry' },
  { selector: '#timeline-position', key: 'timeline.none' },
  { selector: '#sketch-dim-hud', key: 'viewport.dimTitle', attr: 'aria-label' },
  { selector: '.sketch-dim-hud-title', key: 'viewport.dimHudTitle' },
  { selector: '.sketch-dim-hud-hint', key: 'viewport.dimHudHint' },
  { selector: '#view-cube-host', key: 'viewport.viewCube', attr: 'aria-label' },
  { selector: '#viewport-menu', key: 'viewport.contextMenu', attr: 'aria-label' },
  { selector: '#browser-context-menu', key: 'viewport.browserContextMenu', attr: 'aria-label' },
  { selector: '#point-menu', key: 'menu.point.title', attr: 'aria-label' },
  { selector: '#body-color-menu', key: 'menu.bodyColor.title', attr: 'aria-label' },
  { selector: '#fusion-timeline', key: 'timeline.label', attr: 'aria-label' },
  { selector: '.fusion-tabs', key: 'app.workspaceAria', attr: 'aria-label' },
  { selector: '#browser-panel', key: 'browser.title', attr: 'aria-label' },
  { selector: '#panel-start', key: 'panel.start.title', attr: 'aria-label' },
  { selector: '#panel-body', key: 'panel.body.title', attr: 'aria-label' },
  { selector: '#panel-align', key: 'panel.align.title', attr: 'aria-label' },
  { selector: '#panel-solid', key: 'panel.solid.title', attr: 'aria-label' },
  { selector: '#panel-sketch', key: 'panel.sketch.title', attr: 'aria-label' },
  { selector: '#panel-draw', key: 'panel.draw.title', attr: 'aria-label' },
  { selector: '#panel-view', key: 'panel.view.title', attr: 'aria-label' },
  { selector: '#panel-contours', key: 'panel.contours.title', attr: 'aria-label' },
  { selector: '#panel-view .shortcut-table', key: 'shortcut.tableAria', attr: 'aria-label' },
];

const RIBBON_TITLE_BINDINGS: DomBinding[] = [
  { selector: '[data-tool="move-body"]', key: 'ribbon.moveTitle', attr: 'title' },
  { selector: '[data-tool="press-pull"]', key: 'ribbon.pressPullTitle', attr: 'title' },
  { selector: '[data-tool="smooth-body"]', key: 'ribbon.smoothTitle', attr: 'title' },
  { selector: '[data-tool="smooth-section"]', key: 'ribbon.smoothSectionTitle', attr: 'title' },
  { selector: '[data-open-panel="body"]', key: 'ribbon.propertiesTitle', attr: 'title' },
  { selector: '[data-tool="sketch-pick"]', key: 'ribbon.newSketchTitle', attr: 'title' },
  { selector: '[data-sketch-axis="xy"]', key: 'ribbon.xyTitle', attr: 'title' },
  { selector: '[data-sketch-axis="xz"]', key: 'ribbon.xzTitle', attr: 'title' },
  { selector: '[data-sketch-axis="yz"]', key: 'ribbon.yzTitle', attr: 'title' },
  { selector: '[data-tool="sketch-line"]', key: 'ribbon.lineTitle', attr: 'title' },
  { selector: '[data-tool="sketch-circle"]', key: 'ribbon.circleTitle', attr: 'title' },
  { selector: '[data-tool="sketch-arc"]', key: 'ribbon.arcTitle', attr: 'title' },
  { selector: '[data-tool="sketch-rect"]', key: 'ribbon.rectTitle', attr: 'title' },
  { selector: '[data-tool="sketch-dim"]', key: 'ribbon.dimensionTitle', attr: 'title' },
  { selector: '[data-open-panel="sketch"]', key: 'ribbon.settingsTitle', attr: 'title' },
  { selector: '[data-open-panel="draw"]', key: 'ribbon.helpTitle', attr: 'title' },
  { selector: '[data-open-panel="view"]', key: 'ribbon.shortcutsTitle', attr: 'title' },
  { selector: '[data-open-panel="contours"]', key: 'ribbon.contoursTitle', attr: 'title' },
];

const RIBBON_KBD_BINDINGS: DomBinding[] = [
  { selector: '[data-tool="move-body"] .ribbon-btn-label', key: 'ribbon.moveBtn', attr: 'html' },
  { selector: '[data-tool="press-pull"] .ribbon-btn-label', key: 'ribbon.pressPullBtn', attr: 'html' },
  { selector: '[data-tool="sketch-pick"] .ribbon-btn-label', key: 'ribbon.newSketchBtn', attr: 'html' },
  { selector: '[data-tool="sketch-line"] .ribbon-btn-label', key: 'ribbon.lineBtn', attr: 'html' },
  { selector: '[data-tool="sketch-circle"] .ribbon-btn-label', key: 'ribbon.circleBtn', attr: 'html' },
  { selector: '[data-tool="sketch-arc"] .ribbon-btn-label', key: 'ribbon.arcBtn', attr: 'html' },
  { selector: '[data-tool="sketch-rect"] .ribbon-btn-label', key: 'ribbon.rectBtn', attr: 'html' },
  { selector: '[data-tool="sketch-dim"] .ribbon-btn-label', key: 'ribbon.dimensionBtn', attr: 'html' },
  { selector: '#finish-sketch .ribbon-btn-label', key: 'ribbon.finishBtn', attr: 'html' },
  { selector: '#finish-contour .ribbon-btn-label', key: 'ribbon.finish', attr: 'text' },
];

const VIEWPORT_MENU_BINDINGS: DomBinding[] = [
  { selector: '#viewport-menu .vm-section:nth-of-type(1)', key: 'menu.tool' },
  { selector: '#viewport-menu [data-menu-tool="navigate"]', key: 'menu.navigate' },
  { selector: '#viewport-menu [data-menu-tool="align"]', key: 'menu.align' },
  { selector: '#viewport-menu [data-menu-tool="polyline"]', key: 'menu.polyline' },
  { selector: '#viewport-menu [data-menu-tool="freehand"]', key: 'menu.freehand' },
  { selector: '#viewport-menu [data-menu-tool="lasso"]', key: 'menu.lasso' },
  { selector: '#viewport-menu [data-menu-tool="edit"]', key: 'menu.edit' },
  { selector: '#viewport-menu .vm-section:nth-of-type(2)', key: 'menu.alignSection' },
  { selector: '#viewport-menu [data-menu-action="panel-align"]', key: 'menu.panelAlign' },
  { selector: '#viewport-menu [data-menu-tmode="translate"]', key: 'menu.translate' },
  { selector: '#viewport-menu [data-menu-tmode="rotate"]', key: 'menu.rotate' },
  { selector: '#viewport-menu [data-menu-action="world"]', key: 'menu.worldLocal' },
  { selector: '#viewport-menu [data-menu-action="align-reset"]', key: 'menu.alignReset' },
  { selector: '#viewport-menu .vm-section:nth-of-type(3)', key: 'menu.view' },
  { selector: '#viewport-menu [data-menu-view="perspective"]', key: 'menu.viewPerspective' },
  { selector: '#viewport-menu [data-menu-view="top"]', key: 'menu.viewTop' },
  { selector: '#viewport-menu [data-menu-view="front"]', key: 'menu.viewFront' },
  { selector: '#viewport-menu [data-menu-view="side"]', key: 'menu.viewSide' },
  { selector: '#point-menu .vm-section:nth-of-type(1)', key: 'menu.point.title' },
  { selector: '#point-menu [data-point-action="corner"]', key: 'menu.point.corner' },
  { selector: '#point-menu [data-point-action="smooth"]', key: 'menu.point.smooth' },
  { selector: '#point-menu [data-point-action="curve"]', key: 'menu.point.curve' },
  { selector: '#point-menu .vm-section:nth-of-type(2)', key: 'menu.contour' },
  { selector: '#point-menu [data-point-action="insert"]', key: 'menu.point.insert' },
  { selector: '#point-menu [data-point-action="delete"]', key: 'menu.point.delete' },
  { selector: '#point-menu [data-point-action="toggle-closed"]', key: 'menu.point.toggleClosed' },
  { selector: '#body-color-menu .vm-section', key: 'menu.bodyColor.title' },
  { selector: '#body-color-menu [data-body-color="#e8ecf4"]', key: 'menu.bodyColor.silver', attr: 'title' },
  { selector: '#body-color-menu [data-body-color="#ffffff"]', key: 'menu.bodyColor.white', attr: 'title' },
  { selector: '#body-color-menu [data-body-color="#ff5a36"]', key: 'menu.bodyColor.orange', attr: 'title' },
  { selector: '#body-color-menu [data-body-color="#2563eb"]', key: 'menu.bodyColor.blue', attr: 'title' },
  { selector: '#body-color-menu [data-body-color="#16a34a"]', key: 'menu.bodyColor.green', attr: 'title' },
  { selector: '#body-color-menu [data-body-color="#db2777"]', key: 'menu.bodyColor.magenta', attr: 'title' },
  { selector: '#body-color-menu [data-body-color="#eab308"]', key: 'menu.bodyColor.yellow', attr: 'title' },
  { selector: '#body-color-menu [data-body-color="#4b5563"]', key: 'menu.bodyColor.anthracite', attr: 'title' },
  { selector: '#body-color-menu .body-color-picker-row span', key: 'menu.bodyColor.custom' },
];

const TRANSFORM_BINDINGS: DomBinding[] = [
  { selector: '[data-tmode="translate"]', key: 'transform.translate' },
  { selector: '[data-tmode="rotate"]', key: 'transform.rotate' },
  { selector: '[data-tmode="translate"]', key: 'transform.translateTitle', attr: 'title' },
  { selector: '[data-tmode="rotate"]', key: 'transform.rotateTitle', attr: 'title' },
  { selector: '#tmode-world', key: 'transform.worldTitle', attr: 'title' },
];

function setElementTranslation(el: Element, key: string, attr: DomBinding['attr'] = 'text') {
  const value = t(key);
  if (attr === 'html') {
    el.innerHTML = value;
    return;
  }
  if (attr === 'text') {
    el.textContent = value;
    return;
  }
  el.setAttribute(attr, value);
}

function applyBindingList(bindings: DomBinding[]) {
  for (const { selector, key, attr } of bindings) {
    document.querySelectorAll(selector).forEach((el) => setElementTranslation(el, key, attr));
  }
}

function setLabelPrefix(label: Element, key: string) {
  let span = label.querySelector('[data-i18n-label]');
  if (!span) {
    span = document.createElement('span');
    span.setAttribute('data-i18n-label', key);
    const child = label.querySelector('input, select, .fp-dim-input-group');
    if (child) label.insertBefore(span, child);
    else label.prepend(span);
  } else {
    span.setAttribute('data-i18n-label', key);
  }
  span.textContent = t(key);
  // Drop the original hard-coded label text left in the markup — otherwise the
  // source-language text and the injected translation render stacked together.
  for (const node of [...label.childNodes]) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
      label.removeChild(node);
    }
  }
}

function setCheckLabel(label: Element, key: string) {
  const input = label.querySelector('input');
  if (!input) return;
  label.textContent = '';
  label.appendChild(input);
  const span = document.createElement('span');
  span.innerHTML = t(key);
  label.appendChild(span);
}

function setStrideLabel(label: Element) {
  const input = label.querySelector('#scan-stride');
  if (!input) return;
  label.textContent = '';
  const prefix = document.createElement('span');
  prefix.setAttribute('data-i18n-label', 'panel.body.stride');
  prefix.textContent = t('panel.body.stride');
  const suffix = document.createElement('span');
  suffix.setAttribute('data-i18n-label', 'panel.body.triangle');
  suffix.textContent = t('panel.body.triangle');
  label.appendChild(prefix);
  label.appendChild(document.createTextNode(' '));
  label.appendChild(input);
  label.appendChild(suffix);
}

function applyTabs() {
  document.querySelectorAll('[data-fusion-tab]').forEach((el) => {
    const tab = (el as HTMLElement).dataset.fusionTab;
    if (tab && TAB_KEYS[tab]) setElementTranslation(el, TAB_KEYS[tab]);
  });
}

function applyDataI18n(root: ParentNode = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (!key) return;
    const attr = (el.getAttribute('data-i18n-attr') ?? 'text') as DomBinding['attr'];
    setElementTranslation(el, key, attr);
  });
  root.querySelectorAll('[data-i18n-key]').forEach((el) => {
    const key = el.getAttribute('data-i18n-key');
    if (key) setElementTranslation(el, key);
  });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const key = el.getAttribute('data-i18n-title');
    if (key) setElementTranslation(el, key, 'title');
  });
  root.querySelectorAll('[data-i18n-html]').forEach((el) => {
    const key = el.getAttribute('data-i18n-html');
    if (key) setElementTranslation(el, key, 'html');
  });
}

function applyFpTitles() {
  const panels: Array<[string, string]> = [
    ['panel-start', 'panel.start.title'],
    ['panel-body', 'panel.body.title'],
    ['panel-align', 'panel.align.title'],
    ['panel-solid', 'panel.solid.title'],
    ['panel-sketch', 'panel.sketch.title'],
    ['panel-draw', 'panel.draw.title'],
    ['panel-view', 'panel.view.title'],
    ['panel-contours', 'panel.contours.title'],
  ];
  for (const [id, key] of panels) {
    const title = document.querySelector(`#${id} .fp-title`);
    if (title) setElementTranslation(title, key);
  }
}

function applyCloseButtons() {
  document.querySelectorAll('.fp-close').forEach((el) => {
    setElementTranslation(el, 'common.close', 'aria-label');
  });
}

function applyPanelStart() {
  const panel = document.getElementById('panel-start');
  if (!panel) return;
  const lead = panel.querySelector('.fp-lead');
  if (lead) setElementTranslation(lead, 'panel.start.lead');
  const items = panel.querySelectorAll('.fp-list li');
  const keys = [
    'panel.start.itemStart',
    'panel.start.itemSketch',
    'panel.start.itemSolid',
    'panel.start.itemBody',
    'panel.start.itemAlign',
    'panel.start.itemDraw',
    'panel.start.itemContours',
    'panel.start.itemProject',
  ];
  items.forEach((li, i) => {
    if (keys[i]) setElementTranslation(li, keys[i], 'html');
  });
  const hints = panel.querySelectorAll('.fp-hint');
  if (hints[0]) setElementTranslation(hints[0], 'panel.start.hintShortcuts', 'html');
  if (hints[1]) setElementTranslation(hints[1], 'panel.start.hintEsc', 'html');
}

function applyPanelBody() {
  const panel = document.getElementById('panel-body');
  if (!panel) return;
  const rows = panel.querySelectorAll('label.fp-row');
  const rowKeys = [
    'panel.body.display',
    'panel.body.brightness',
    'panel.body.opacity',
    'panel.body.stride',
    'panel.body.slicePlane',
    'panel.body.slicePos',
  ];
  rows.forEach((row, i) => {
    if (!rowKeys[i]) return;
    if (rowKeys[i] === 'panel.body.stride') setStrideLabel(row);
    else setLabelPrefix(row, rowKeys[i]);
  });
  const checks = panel.querySelectorAll('label.fp-check');
  if (checks[0]) setCheckLabel(checks[0], 'panel.body.edges');
  if (checks[1]) setCheckLabel(checks[1], 'panel.body.pointSprites');
  const hint = panel.querySelector('.fp-hint');
  if (hint) setElementTranslation(hint, 'panel.body.surfaceHint', 'html');
  const reload = panel.querySelector('#reload-scan-panel');
  if (reload) setElementTranslation(reload, 'panel.body.reload');
}

function applyPanelAlign() {
  const panel = document.getElementById('panel-align');
  if (!panel) return;
  const lead = panel.querySelector('.fp-lead');
  if (lead) setElementTranslation(lead, 'panel.align.lead');
  const sections = panel.querySelectorAll('.fp-section-title');
  if (sections[0]) setElementTranslation(sections[0], 'panel.align.bodyManual');
  if (sections[1]) setElementTranslation(sections[1], 'panel.align.workPlane');
  const labels = panel.querySelectorAll('.align-stepper-label');
  if (labels[0]) setElementTranslation(labels[0], 'panel.align.translate');
  if (labels[1]) setElementTranslation(labels[1], 'panel.align.rotate');
  const hints = panel.querySelectorAll('.fp-hint');
  if (hints[0]) setElementTranslation(hints[0], 'panel.align.stepperHint');
  if (hints[1]) setElementTranslation(hints[1], 'panel.align.autoAlignHint', 'html');
  if (hints[2]) setElementTranslation(hints[2], 'panel.align.gizmoHint', 'html');
  const rows = panel.querySelectorAll('label.fp-row');
  const rowKeys = ['panel.align.plane', 'panel.align.position', 'panel.align.tolerance'];
  rows.forEach((row, i) => {
    if (rowKeys[i]) setLabelPrefix(row, rowKeys[i]);
  });
  const showHits = panel.querySelector('#hit-plane')?.closest('label.fp-check');
  if (showHits) setCheckLabel(showHits, 'panel.align.showHits');
  const dragBtn = panel.querySelector('#plane-drag-toggle');
  if (dragBtn) setElementTranslation(dragBtn, 'panel.align.dragPlane');
  const autoBtn = panel.querySelector('#align-to-plane');
  if (autoBtn) setElementTranslation(autoBtn, 'panel.align.autoAlign');
  const resetBtn = panel.querySelector('#align-reset');
  if (resetBtn) setElementTranslation(resetBtn, 'panel.align.resetBody');
}

function applyPanelSketch() {
  const panel = document.getElementById('panel-sketch');
  if (!panel) return;
  const items = panel.querySelectorAll('#sketch-panel-draw-hint .fp-list li');
  const keys = [
    'panel.sketch.lineCircleRect',
    'panel.sketch.arcTriangle',
    'panel.sketch.freehand',
    'panel.sketch.edit',
    'panel.sketch.dimension',
  ];
  items.forEach((li, i) => {
    if (keys[i]) setElementTranslation(li, keys[i], 'html');
  });
  const rows = panel.querySelectorAll('#sketch-panel-draw-hint label.fp-row');
  const rowKeys = ['panel.sketch.dimKind', 'panel.sketch.unit', 'panel.sketch.enterValue', 'panel.sketch.grid'];
  rows.forEach((row, i) => {
    if (rowKeys[i]) setLabelPrefix(row, rowKeys[i]);
  });
  const snap = panel.querySelector('#sketch-grid-snap')?.closest('label.fp-check');
  if (snap) setCheckLabel(snap, 'panel.sketch.gridSnap');
  const applyBtn = panel.querySelector('#sketch-dim-apply');
  if (applyBtn) setElementTranslation(applyBtn, 'common.ok');
}

function applyPanelDraw() {
  const panel = document.getElementById('panel-draw');
  if (!panel) return;
  const lead = panel.querySelector('.fp-lead');
  if (lead) setElementTranslation(lead, 'panel.draw.lead', 'html');
  const hitPoints = panel.querySelector('#hit-points')?.closest('label.fp-check');
  if (hitPoints) setCheckLabel(hitPoints, 'panel.draw.hitPoints');
  const hints = panel.querySelectorAll('.fp-hint');
  if (hints[0]) setElementTranslation(hints[0], 'panel.draw.hitLegend', 'html');
  if (hints[1]) setElementTranslation(hints[1], 'panel.draw.colors', 'html');
  if (hints[2]) setElementTranslation(hints[2], 'panel.draw.tools', 'html');
  if (hints[3]) setElementTranslation(hints[3], 'panel.draw.editHint', 'html');
}

function applyPanelView() {
  const panel = document.getElementById('panel-view');
  if (!panel) return;
  const viewBtns = panel.querySelectorAll('.view-buttons button');
  const keys = ['panel.view.perspective', 'panel.view.top', 'panel.view.front', 'panel.view.side'];
  viewBtns.forEach((btn, i) => {
    if (keys[i]) setElementTranslation(btn, keys[i]);
  });
  const gridRow = panel.querySelector('label.fp-row');
  if (gridRow) setLabelPrefix(gridRow, 'panel.view.grid');
  const hint = panel.querySelector('.fp-hint');
  if (hint) setElementTranslation(hint, 'panel.view.viewCubeHint', 'html');
  const ths = panel.querySelectorAll('.shortcut-table th');
  if (ths[0]) setElementTranslation(ths[0], 'panel.view.shortcutKeys');
  if (ths[1]) setElementTranslation(ths[1], 'panel.view.shortcutAction');
  if (ths[2]) setElementTranslation(ths[2], 'panel.view.shortcutScope');
}

function applyPanelContours() {
  const panel = document.getElementById('panel-contours');
  if (!panel) return;
  const hint = panel.querySelector('.fp-hint');
  if (hint) setElementTranslation(hint, 'panel.contours.hint', 'html');
  const clearBtn = panel.querySelector('#clear-contours-panel');
  if (clearBtn) setElementTranslation(clearBtn, 'panel.contours.clearAll');
}

function applyRibbonHints() {
  const smoothHint = document.querySelector('[data-ribbon="body"] .ribbon-group-hint .ribbon-hint');
  if (smoothHint) setElementTranslation(smoothHint, 'ribbon.smoothHint', 'html');
  const sketchActiveHint = document.querySelector('[data-ribbon="sketch"] [data-sketch-active-only] .ribbon-hint');
  if (sketchActiveHint) setElementTranslation(sketchActiveHint, 'ribbon.sketchActiveHint', 'html');
  const sketchPickHint = document.querySelector('[data-ribbon="sketch"] .sketch-pick-hint .ribbon-hint');
  if (sketchPickHint) setElementTranslation(sketchPickHint, 'ribbon.sketchPickHint', 'html');
  const smoothLabel = document.querySelector('[data-ribbon="body"] .ribbon-group-hint > .ribbon-label');
  if (smoothLabel) setElementTranslation(smoothLabel, 'ribbon.smooth');
  const sketchPickLabel = document.querySelector('[data-ribbon="sketch"] .sketch-pick-hint > .ribbon-label');
  if (sketchPickLabel) setElementTranslation(sketchPickLabel, 'ribbon.hint');
  const brushRow = document.querySelector('[data-ribbon="body"] .ribbon-mini-row:nth-of-type(1) span');
  if (brushRow) {
    const val = document.getElementById('body-brush-val');
    brushRow.innerHTML = `${t('ribbon.brush')} ${val?.outerHTML ?? ''}`;
  }
  const strengthRow = document.querySelector('[data-ribbon="body"] .ribbon-mini-row:nth-of-type(2) span');
  if (strengthRow) {
    const val = document.getElementById('smooth-strength-val');
    strengthRow.innerHTML = `${t('ribbon.strength')} ${val?.outerHTML ?? ''}`;
  }
  const sectionRow = document.querySelector('[data-ribbon="body"] .ribbon-mini-row:nth-of-type(3) span');
  if (sectionRow) {
    const val = document.getElementById('smooth-section-depth-val');
    sectionRow.innerHTML = `${t('ribbon.sectionDepth')} ${val?.outerHTML ?? ''} ${t('common.mm')}`;
  }
  const edgeOnly = document.querySelector('#smooth-edge-only')?.closest('.ribbon-mini-check span');
  if (edgeOnly) setElementTranslation(edgeOnly, 'ribbon.edgeOnly');
}

function applyScanModeOptions() {
  const select = document.getElementById('scan-mode');
  if (!select) return;
  select.querySelectorAll('option').forEach((opt) => {
    const value = (opt as HTMLOptionElement).value;
    if (SCAN_MODE_OPTIONS.includes(value as (typeof SCAN_MODE_OPTIONS)[number])) {
      opt.textContent = t(`scanMode.${value}`);
    }
  });
}

function applySliceAxisOptions() {
  const select = document.getElementById('slice-axis');
  if (!select) return;
  select.querySelectorAll('option').forEach((opt) => {
    const value = (opt as HTMLOptionElement).value;
    if (value === 'none') opt.textContent = t('panel.body.sliceOff');
  });
}

function applySketchDimKindOptions() {
  const select = document.getElementById('sketch-dim-kind');
  if (!select) return;
  const map: Record<string, string> = {
    linear: 'panel.sketch.dimLinear',
    radius: 'panel.sketch.dimRadius',
    diameter: 'panel.sketch.dimDiameter',
  };
  select.querySelectorAll('option').forEach((opt) => {
    const value = (opt as HTMLOptionElement).value;
    if (map[value]) opt.textContent = t(map[value]);
  });
}

function applySketchConstraintKindOptions() {
  const select = document.getElementById('sketch-constraint-kind');
  if (!select) return;
  select.querySelectorAll('option').forEach((opt) => {
    const value = (opt as HTMLOptionElement).value;
    const label = t(`sketchConstraint.kind.${value}`);
    // value === '' means the key was missing; keep the static fallback then.
    if (label && label !== `sketchConstraint.kind.${value}`) {
      opt.textContent = value === 'distance' ? `${label} (mm)` : label;
    }
  });
}

function applySketchUnitOptions() {
  const select = document.getElementById('sketch-unit');
  if (!select) return;
  const map: Record<string, string> = {
    mm: 'panel.sketch.unitMm',
    cm: 'panel.sketch.unitCm',
    m: 'panel.sketch.unitM',
    in: 'panel.sketch.unitIn',
  };
  select.querySelectorAll('option').forEach((opt) => {
    const value = (opt as HTMLOptionElement).value;
    if (map[value]) opt.textContent = t(map[value]);
  });
}

function applyPlaneAxisOptions() {
  const select = document.getElementById('plane-axis');
  if (!select) return;
  const map: Record<string, string> = {
    xy: 'panel.align.planeXY',
    xz: 'panel.align.planeXZ',
    yz: 'panel.align.planeYZ',
  };
  select.querySelectorAll('option').forEach((opt) => {
    const value = (opt as HTMLOptionElement).value;
    if (map[value]) opt.textContent = t(map[value]);
  });
}

function applyTransformWorldLabel(isLocal: boolean) {
  const el = document.getElementById('tmode-world');
  if (el) setElementTranslation(el, isLocal ? 'transform.local' : 'transform.world');
}

export function applyDomTranslations(opts?: { transformLocal?: boolean }) {
  document.title = t('app.title');
  applyTabs();
  applyDataI18n();
  applyBindingList(DOM_BINDINGS);
  applyBindingList(RIBBON_TITLE_BINDINGS);
  applyBindingList(RIBBON_KBD_BINDINGS);
  applyBindingList(VIEWPORT_MENU_BINDINGS);
  applyBindingList(TRANSFORM_BINDINGS);
  applyFpTitles();
  applyCloseButtons();
  applyPanelStart();
  applyPanelBody();
  applyPanelAlign();
  applyPanelSketch();
  applyPanelDraw();
  applyPanelView();
  applyPanelContours();
  applyRibbonHints();
  applyScanModeOptions();
  applySliceAxisOptions();
  applySketchDimKindOptions();
  applySketchConstraintKindOptions();
  applySketchUnitOptions();
  applyPlaneAxisOptions();
  if (opts?.transformLocal !== undefined) {
    applyTransformWorldLabel(opts.transformLocal);
  } else {
    const worldBtn = document.getElementById('tmode-world');
    if (worldBtn) {
      const isLocal = worldBtn.textContent?.trim() === t('transform.local');
      applyTransformWorldLabel(isLocal);
    }
  }
}

/** Update workspace badge text (dynamic). */
export function setWorkspaceModeLabel(
  key: 'workspace.sketch' | 'workspace.body' | 'workspace.contour',
) {
  const el = document.getElementById('workspace-mode-label');
  if (el) {
    el.textContent = t(key);
    el.setAttribute('aria-label', t('app.workspaceAria'));
  }
}