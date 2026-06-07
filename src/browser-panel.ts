import type { CadBodyId, CadComponentId } from './cad-scene';

export type BrowserItemId =
  | `component:${CadComponentId}`
  | `component-bodies:${CadComponentId}`
  | `component-contours:${CadComponentId}`
  | `body:${CadBodyId}`
  | `body-wire:${CadBodyId}`
  | `body-points:${CadBodyId}`
  | `body-trace:${CadBodyId}`
  | `sketch:${string}`
  | 'origin-planes'
  | 'plane'
  | 'grid'
  | 'form'
  | 'draft'
  | `contour:${string}`;

export interface BrowserBodyItem {
  id: CadBodyId;
  label: string;
  meshName: string;
  hasMesh: boolean;
  visible: boolean;
  wireVisible: boolean;
  pointsVisible: boolean;
  traceAssistVisible: boolean;
  expanded: boolean;
}

export interface BrowserContourItem {
  id: string;
  name: string;
  meta: string;
  closed: boolean;
  visible: boolean;
  attachedToBodyId: string | null;
  attachedBodyLabel: string | null;
}

export interface BrowserSketchItem {
  id: string;
  label: string;
  axis: string;
  position: number;
  visible: boolean;
  expanded: boolean;
  active: boolean;
  contours: BrowserContourItem[];
  profileCount: number;
}

export interface BrowserComponentItem {
  id: CadComponentId;
  label: string;
  visible: boolean;
  expanded: boolean;
  bodiesExpanded: boolean;
  sketchesExpanded: boolean;
  contoursExpanded: boolean;
  bodies: BrowserBodyItem[];
  sketches: BrowserSketchItem[];
  contours: BrowserContourItem[];
}

export interface BrowserPanelModel {
  componentsFolderExpanded: boolean;
  activeBodyId: CadBodyId;
  activeSketchId: string | null;
  originPlanesVisible: boolean;
  components: BrowserComponentItem[];
  planeVisible: boolean;
  gridVisible: boolean;
  formVisible: boolean;
  hasForm: boolean;
  formInfo: string;
  draftVisible: boolean;
  hasDraft: boolean;
  draftInfo: string;
  canBuildForm: boolean;
}

export type BrowserContextTarget =
  | { kind: 'component'; id: CadComponentId }
  | { kind: 'body'; id: CadBodyId };

export interface BrowserPanelActions {
  onToggleVisibility: (id: BrowserItemId) => void;
  onToggleAttach: (id: BrowserItemId) => void;
  onDelete: (id: BrowserItemId) => void;
  onToggleFolder: (folder: string) => void;
  onSelectBody: (bodyId: CadBodyId) => void;
  onSelectSketch: (sketchId: string) => void;
  onContextMenu: (target: BrowserContextTarget, event: MouseEvent) => void;
  onClearContours: () => void;
  onClearForm: () => void;
  onBuildForm?: () => void;
}

function visCell(
  id: BrowserItemId,
  visible: boolean,
  opts: { canDelete?: boolean; canPin?: boolean; pinned?: boolean; pinTitle?: string } = {},
): string {
  const visClass = visible ? 'is-visible' : 'is-hidden';
  const del = opts.canDelete
    ? `<button type="button" class="browser-del" data-delete="${id}" title="Löschen">×</button>`
    : '';
  const pin = opts.canPin
    ? `<button type="button" class="browser-pin ${opts.pinned ? 'is-pinned' : ''}" data-pin="${id}" title="${opts.pinTitle ?? (opts.pinned ? 'Heftung lösen' : 'Am Körper heften')}">⚓</button>`
    : '';
  return `<span class="browser-vis-cell">
    ${pin}
    <button type="button" class="browser-vis ${visClass}" data-toggle="${id}" title="Ein-/ausblenden" aria-label="Sichtbarkeit">
      <span class="eye-on" aria-hidden="true">◉</span><span class="eye-off" aria-hidden="true">○</span>
    </button>${del}
  </span>`;
}

function folderRow(
  folder: string,
  label: string,
  expanded: boolean,
  indent = 0,
  count?: number,
): string {
  const badge = count !== undefined ? `<span class="browser-badge">${count}</span>` : '';
  return `<div class="browser-item browser-folder" data-indent="${indent}" data-folder="${folder}">
    <button type="button" class="browser-caret ${expanded ? 'expanded' : ''}" data-folder="${folder}" aria-label="Aufklappen">▸</button>
    <span class="browser-folder-icon" aria-hidden="true">▣</span>
    <span class="browser-label">${label}</span>${badge}
  </div>`;
}

function componentRow(comp: BrowserComponentItem): string {
  const loaded = comp.bodies.filter((b) => b.hasMesh);
  const meta =
    loaded.length > 0
      ? loaded.map((b) => `${b.label} (${b.meshName})`).join(', ')
      : comp.bodies.length > 0
        ? `${comp.bodies.length} Körper — STL laden`
        : 'kein Körper';
  return `<div class="browser-item browser-leaf browser-component" data-indent="1" data-context-component="${comp.id}">
    <button type="button" class="browser-caret ${comp.expanded ? 'expanded' : ''}" data-folder="component:${comp.id}" aria-label="Komponente aufklappen">▸</button>
    ${visCell(`component:${comp.id}`, comp.visible)}
    <span class="browser-label">${comp.label}</span>
    <span class="browser-meta">${meta}</span>
  </div>`;
}

function bodyRow(b: BrowserBodyItem, active: boolean): string {
  const tag = b.hasMesh ? 'Mesh' : 'leer';
  const tagClass = b.hasMesh ? '' : 'is-open';
  const activeClass = active ? ' is-active-body' : '';
  return `<div class="browser-item browser-leaf browser-body${activeClass}" data-indent="4" data-select-body="${b.id}">
    <button type="button" class="browser-caret ${b.expanded ? 'expanded' : ''}" data-folder="body-group:${b.id}" aria-label="Körper aufklappen">▸</button>
    ${visCell(`body:${b.id}`, b.visible)}
    <span class="browser-label">${b.label}</span>
    <span class="browser-meta">${b.hasMesh ? b.meshName : 'STL laden…'}</span>
    <span class="browser-tag ${tagClass}">${tag}</span>
  </div>`;
}

function leafRow(
  id: BrowserItemId,
  label: string,
  meta: string,
  visible: boolean,
  opts: {
    indent?: number;
    canDelete?: boolean;
    canPin?: boolean;
    pinned?: boolean;
    pinTitle?: string;
    tag?: string;
    tagClass?: string;
  } = {},
): string {
  const indent = opts.indent ?? 1;
  const tag = opts.tag
    ? `<span class="browser-tag ${opts.tagClass ?? ''}">${opts.tag}</span>`
    : '';
  return `<div class="browser-item browser-leaf" data-indent="${indent}">
    <span class="browser-spacer"></span>
    ${visCell(id, visible, {
      canDelete: opts.canDelete,
      canPin: opts.canPin,
      pinned: opts.pinned,
      pinTitle: opts.pinTitle,
    })}
    <span class="browser-label">${label}</span>
    <span class="browser-meta">${meta}</span>${tag}
  </div>`;
}

export class BrowserPanel {
  private bound = false;

  constructor(
    private readonly tree: HTMLElement,
    private readonly actions: BrowserPanelActions,
  ) {}

  render(model: BrowserPanelModel) {
    const parts: string[] = [];

    parts.push(
      folderRow('components', 'Komponenten', model.componentsFolderExpanded, 0, model.components.length),
    );

    if (model.componentsFolderExpanded) {
      for (const comp of model.components) {
        parts.push(componentRow(comp));

        if (comp.expanded) {
          parts.push('<div class="browser-tree-group">');
          parts.push(
            folderRow(`component-bodies:${comp.id}`, 'Körper', comp.bodiesExpanded, 2, comp.bodies.length),
          );
          if (comp.bodiesExpanded) {
            if (!comp.bodies.length) {
              parts.push(
                `<div class="browser-item browser-leaf browser-muted" data-indent="3">
                  <span class="browser-spacer"></span><span class="browser-label">Kein Körper in dieser Komponente</span>
                </div>`,
              );
            }
            for (const b of comp.bodies) {
              parts.push(bodyRow(b, b.id === model.activeBodyId));
              if (b.expanded && b.hasMesh) {
                parts.push('<div class="browser-tree-group browser-body-group">');
                parts.push(
                  leafRow(`body-wire:${b.id}`, 'Kanten', 'Wireframe', b.wireVisible, { indent: 5 }),
                  leafRow(`body-points:${b.id}`, 'Punkte', 'Punktwolke', b.pointsVisible, { indent: 5 }),
                  leafRow(
                    `body-trace:${b.id}`,
                    'Nachzeichnen',
                    'Festkörper',
                    b.traceAssistVisible,
                    { indent: 5, tag: b.traceAssistVisible ? 'Ein' : '', tagClass: b.traceAssistVisible ? 'is-live' : '' },
                  ),
                );
                parts.push('</div>');
              }
            }
          }

          parts.push(
            folderRow(
              `component-sketches:${comp.id}`,
              'Skizzen',
              comp.sketchesExpanded,
              2,
              comp.sketches.length,
            ),
          );
          if (comp.sketchesExpanded) {
            for (const sk of comp.sketches) {
              const activeClass = sk.active ? ' is-active-sketch' : '';
              parts.push(`<div class="browser-item browser-leaf browser-sketch${activeClass}" data-indent="3" data-select-sketch="${sk.id}">
                <button type="button" class="browser-caret ${sk.expanded ? 'expanded' : ''}" data-folder="sketch-group:${sk.id}" aria-label="Skizze aufklappen">▸</button>
                ${visCell(`sketch:${sk.id}`, sk.visible)}
                <span class="browser-label">${sk.label}</span>
                <span class="browser-meta">${sk.axis.toUpperCase()} @ ${sk.position.toFixed(1)}</span>
                <span class="browser-tag">${sk.profileCount} Profil(e)</span>
              </div>`);
              if (sk.expanded) {
                parts.push('<div class="browser-tree-group">');
                if (!sk.contours.length) {
                  parts.push(`<div class="browser-item browser-leaf browser-muted" data-indent="4">
                    <span class="browser-spacer"></span><span class="browser-label">Noch kein Profil</span>
                  </div>`);
                }
                for (const c of sk.contours) {
                  const pinned = c.attachedToBodyId != null;
                  const pinTitle = pinned
                    ? `Geheftet an ${c.attachedBodyLabel ?? 'Körper'}`
                    : 'Am Körper heften';
                  const tag = pinned ? `↗ ${c.attachedBodyLabel ?? 'Körper'}` : c.closed ? 'geschlossen' : 'offen';
                  parts.push(
                    leafRow(`contour:${c.id}`, c.name, c.meta, c.visible, {
                      indent: 4,
                      canDelete: true,
                      canPin: true,
                      pinned,
                      pinTitle,
                      tag,
                      tagClass: pinned ? 'is-pinned' : c.closed ? '' : 'is-open',
                    }),
                  );
                }
                parts.push('</div>');
              }
            }
            if (!comp.sketches.length) {
              parts.push(`<div class="browser-item browser-leaf browser-muted" data-indent="3">
                <span class="browser-spacer"></span><span class="browser-label">Ebene wählen (Skizze-Reiter)</span>
              </div>`);
            }
          }

          parts.push(
            folderRow(
              `component-contours:${comp.id}`,
              'Konturen (alle)',
              comp.contoursExpanded,
              2,
              comp.contours.length,
            ),
          );
          if (comp.contoursExpanded) {
            if (model.hasDraft) {
              parts.push(
                leafRow('draft', 'Entwurf', model.draftInfo, model.draftVisible, {
                  indent: 4,
                  tag: 'live',
                  tagClass: 'is-live',
                }),
              );
            }
            if (!comp.contours.length && !model.hasDraft) {
              parts.push(
                `<div class="browser-item browser-leaf browser-muted" data-indent="4">
                  <span class="browser-spacer"></span><span class="browser-label">Noch keine Kontur</span>
                </div>`,
              );
            }
            for (const c of comp.contours) {
              const pinned = c.attachedToBodyId != null;
              const pinTitle = pinned
                ? `Geheftet an ${c.attachedBodyLabel ?? 'Körper'} — klicken zum Lösen`
                : 'Am Körper heften — bewegt sich mit Komponente';
              const tag = pinned
                ? `↗ ${c.attachedBodyLabel ?? 'Körper'}`
                : c.closed
                  ? 'geschlossen'
                  : 'offen';
              parts.push(
                leafRow(`contour:${c.id}`, c.name, c.meta, c.visible, {
                  indent: 4,
                  canDelete: true,
                  canPin: true,
                  pinned,
                  pinTitle,
                  tag,
                  tagClass: pinned ? 'is-pinned' : c.closed ? '' : 'is-open',
                }),
              );
            }
            if (comp.contours.length > 0 || model.canBuildForm) {
              parts.push(`<div class="browser-actions" data-indent="4">`);
              if (model.canBuildForm) {
                parts.push(
                  `<button type="button" class="browser-action browser-action-primary" data-action="build-form">Negativform als Körper speichern</button>`,
                );
              }
              parts.push(
                `<button type="button" class="browser-action" data-action="clear-contours">Alle Konturen löschen</button></div>`,
              );
            }
          }
          parts.push('</div>');
        }
      }
    }

    parts.push(
      leafRow(
        'origin-planes',
        'Ursprungsebenen XY/XZ/YZ',
        model.originPlanesVisible ? 'sichtbar' : 'aus',
        model.originPlanesVisible,
      ),
      leafRow('plane', 'Arbeitsebene', `${model.planeVisible ? 'sichtbar' : 'aus'}`, model.planeVisible),
      leafRow('grid', 'Bodenraster', 'Hilfslinien', model.gridVisible),
    );

    if (model.hasForm) {
      parts.push(
        leafRow('form', 'Negativform (Ergebnis)', model.formInfo, model.formVisible, { canDelete: true }),
      );
    }

    this.tree.innerHTML = parts.join('');
    if (!this.bound) {
      this.bound = true;
      this.tree.addEventListener('click', (e) => this.onClick(e));
      this.tree.addEventListener('contextmenu', (e) => this.onContextMenu(e));
    }
  }

  private onContextMenu(e: Event) {
    const ev = e as MouseEvent;
    const t = ev.target as HTMLElement;
    if (t.closest('.browser-caret, .browser-vis, .browser-del, .browser-pin, .browser-action, .browser-action-primary')) {
      return;
    }

    const bodyRow = t.closest('[data-select-body]') as HTMLElement | null;
    if (bodyRow?.dataset.selectBody) {
      ev.preventDefault();
      this.actions.onContextMenu({ kind: 'body', id: bodyRow.dataset.selectBody }, ev);
      return;
    }

    const compRow = t.closest('[data-context-component]') as HTMLElement | null;
    if (compRow?.dataset.contextComponent) {
      ev.preventDefault();
      this.actions.onContextMenu({ kind: 'component', id: compRow.dataset.contextComponent }, ev);
    }
  }

  private onClick(e: Event) {
    const t = e.target as HTMLElement;

    const folderBtn = t.closest('[data-folder]') as HTMLElement | null;
    if (folderBtn?.classList.contains('browser-caret')) {
      this.actions.onToggleFolder(folderBtn.dataset.folder!);
      return;
    }

    const pin = t.closest('[data-pin]') as HTMLElement | null;
    if (pin) {
      this.actions.onToggleAttach(pin.dataset.pin as BrowserItemId);
      return;
    }

    const sketchSelect = t.closest('[data-select-sketch]') as HTMLElement | null;
    if (sketchSelect && !t.closest('[data-toggle], [data-delete], .browser-caret')) {
      this.actions.onSelectSketch(sketchSelect.dataset.selectSketch!);
      return;
    }

    const bodySelect = t.closest('[data-select-body]') as HTMLElement | null;
    if (bodySelect && !t.closest('[data-toggle], [data-delete], [data-folder], .browser-caret')) {
      this.actions.onSelectBody(bodySelect.dataset.selectBody as CadBodyId);
      return;
    }

    const toggle = t.closest('[data-toggle]') as HTMLElement | null;
    if (toggle) {
      this.actions.onToggleVisibility(toggle.dataset.toggle as BrowserItemId);
      return;
    }

    const del = t.closest('[data-delete]') as HTMLElement | null;
    if (del) {
      this.actions.onDelete(del.dataset.delete as BrowserItemId);
      return;
    }

    const action = t.closest('[data-action]') as HTMLElement | null;
    if (action?.dataset.action === 'clear-contours') {
      this.actions.onClearContours();
      return;
    }
    if (action?.dataset.action === 'build-form') {
      this.actions.onBuildForm?.();
    }
  }
}

export function parseBodyIdFromBrowserItem(id: BrowserItemId): CadBodyId | null {
  if (id.startsWith('body-wire:')) return id.slice('body-wire:'.length);
  if (id.startsWith('body-points:')) return id.slice('body-points:'.length);
  if (id.startsWith('body-trace:')) return id.slice('body-trace:'.length);
  if (id.startsWith('body:')) return id.slice('body:'.length);
  return null;
}

export function parseComponentIdFromBrowserItem(id: BrowserItemId): CadComponentId | null {
  if (id.startsWith('component-bodies:')) return id.slice('component-bodies:'.length);
  if (id.startsWith('component-contours:')) return id.slice('component-contours:'.length);
  if (id.startsWith('component:')) return id.slice('component:'.length);
  return null;
}