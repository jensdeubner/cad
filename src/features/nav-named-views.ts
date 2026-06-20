/**
 * Registry features: View → Camera → multi-slot named views.
 *
 * Extends the single-slot `nav-views` save/restore with an ordered list of
 * user-named camera views:
 *   • view-named-save    — capture the current camera into a new auto-named slot
 *   • view-named-restore — re-apply the MOST RECENT saved view
 *
 * A small floating panel lists every saved view as a clickable chip (click =
 * apply that slot) with a `×` delete button. The store is a module-level
 * singleton (host objects are fresh per run, so it can't live on the host).
 *
 * Test bridge: hard numbers under `window.__cadFeature['named-views']`.
 */
import { registerFeature } from './registry';
import type { FeatureHost } from './host';
import { captureView, applyView } from '../nav/views';
import { NamedViewStore } from '../nav/named-views';

/** The one shared store for all runs (host is recreated each call). */
const store = new NamedViewStore();

interface NamedViewsBridge {
  count: number;
  names: string[];
  lastRestoredIndex?: number;
  camPos: [number, number, number];
  /** Test-only: push the camera `d` mm away from the controls target. */
  nudge(d: number): void;
}

const PANEL_ID = 'named-views-panel';
const STYLE_ID = 'named-views-style';

function bridge(): NamedViewsBridge {
  const w = window as unknown as { __cadFeature?: Record<string, unknown> };
  w.__cadFeature ??= {};
  return (w.__cadFeature['named-views'] ??= {
    count: 0,
    names: [],
    camPos: [0, 0, 0],
    nudge: () => {},
  }) as NamedViewsBridge;
}

/** Refresh the camera-position snapshot + count/names on the bridge. */
function publishBridge(host: FeatureHost): void {
  const b = bridge();
  b.count = store.size();
  b.names = store.list().map((v) => v.name);
  b.camPos = host.camera.position.toArray() as [number, number, number];
  b.nudge = (d: number) => {
    const dir = host.camera.position.clone().sub(host.controls.target);
    if (dir.lengthSq() < 1e-9) dir.set(0, 0, 1);
    dir.normalize();
    host.camera.position.addScaledVector(dir, d);
    host.controls.update();
    b.camPos = host.camera.position.toArray() as [number, number, number];
  };
}

/** Inject the panel's stylesheet once. */
function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
#${PANEL_ID} {
  position: fixed; right: 12px; bottom: 96px; z-index: 40;
  display: flex; flex-direction: column; gap: 6px;
  max-width: 220px; padding: 8px 10px;
  font: 12px/1.4 var(--font-ui); color: var(--text);
  background: var(--glass); backdrop-filter: blur(14px) saturate(1.2); -webkit-backdrop-filter: blur(14px) saturate(1.2);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius); box-shadow: var(--shadow-2);
}
#${PANEL_ID} .nv-title {
  font-family: var(--font-display); font-weight: 600; text-transform: uppercase;
  font-size: 10px; opacity: 0.8; letter-spacing: 0.08em; margin-bottom: 2px; color: var(--text-muted);
}
#${PANEL_ID} .nv-chips { display: flex; flex-wrap: wrap; gap: 6px; }
#${PANEL_ID} .nv-chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 3px 6px 3px 9px; border-radius: var(--radius-pill);
  background: var(--surface-2); border: 1px solid var(--border);
}
#${PANEL_ID} .nv-chip .nv-name {
  cursor: pointer; user-select: none; max-width: 120px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
#${PANEL_ID} .nv-chip .nv-name:hover { color: var(--accent); }
#${PANEL_ID} .nv-del {
  cursor: pointer; border: none; background: transparent; color: var(--danger-strong);
  font-size: 13px; line-height: 1; padding: 0 2px; border-radius: 8px;
}
#${PANEL_ID} .nv-del:hover { color: var(--danger); background: var(--danger-soft); }
`;
  document.head.appendChild(style);
}

/** Create (or reuse) the floating panel container. */
function ensurePanel(): HTMLElement {
  ensureStyle();
  let panel = document.getElementById(PANEL_ID);
  if (!panel) {
    panel = document.createElement('div');
    panel.id = PANEL_ID;
    document.body.appendChild(panel);
  }
  return panel;
}

/** Re-render the chip list from the current store state. */
function rebuildPanel(host: FeatureHost): void {
  const panel = ensurePanel();
  panel.replaceChildren();

  const title = document.createElement('div');
  title.className = 'nv-title';
  title.textContent = host.t('panel.namedViews.title');
  panel.appendChild(title);

  const chips = document.createElement('div');
  chips.className = 'nv-chips';
  panel.appendChild(chips);

  for (const view of store.list()) {
    const chip = document.createElement('span');
    chip.className = 'nv-chip';
    chip.dataset.viewId = view.id;

    const name = document.createElement('span');
    name.className = 'nv-name';
    name.textContent = view.name;
    name.title = view.name;
    name.addEventListener('click', () => {
      applyView(host.camera, host.controls, view.state);
      bridge().camPos = host.camera.position.toArray() as [number, number, number];
      host.setStatus(host.t('status.namedViewRestored', { name: view.name }));
    });
    chip.appendChild(name);

    const del = document.createElement('button');
    del.className = 'nv-del';
    del.type = 'button';
    del.textContent = '×';
    del.title = host.t('view.namedDelete');
    del.setAttribute('aria-label', host.t('view.namedDelete'));
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      store.remove(view.id);
      publishBridge(host);
      rebuildPanel(host);
    });
    chip.appendChild(del);

    chips.appendChild(chip);
  }
}

function saveRun(host: FeatureHost): void {
  const n = store.size() + 1;
  const name = host.t('view.namedSlot', { n });
  store.add(name, captureView(host.camera, host.controls));
  rebuildPanel(host);
  publishBridge(host);
  host.markFeatureDone('view-named-save', name);
  host.setStatus(host.t('status.namedViewSaved', { name, count: store.size() }));
}

function restoreRun(host: FeatureHost): void {
  if (store.size() === 0) {
    host.setStatus(host.t('status.namedViewNone'));
    return;
  }
  const views = store.list();
  const last = views[views.length - 1];
  applyView(host.camera, host.controls, last.state);
  const b = bridge();
  b.lastRestoredIndex = views.length - 1;
  publishBridge(host);
  host.markFeatureDone('view-named-restore', last.name);
  host.setStatus(host.t('status.namedViewRestored', { name: last.name }));
}

registerFeature({
  id: 'view-named-save',
  tab: 'view',
  group: 'view.camera',
  labelKey: 'view.namedSave',
  icon: '＋',
  run: saveRun,
});

registerFeature({
  id: 'view-named-restore',
  tab: 'view',
  group: 'view.camera',
  labelKey: 'view.namedRestore',
  icon: '⟲',
  run: restoreRun,
});
