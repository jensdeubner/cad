/**
 * Sketch dimension workflow (Fusion-style):
 *   1. Hover edge (strong highlight)
 *   2. Click edge → drag dimension offset
 *   3. Enter mm/cm value → geometry updates
 *   4. Double-click label → edit value
 */
import * as THREE from 'three';
import { t } from '../i18n';
import type { Contour } from '../types';
import {
  applyDimensionValueToContour,
  buildSketchDimensionGroup,
  buildSketchEdgeHighlight,
  dimensionDisplayMm,
  disposeSketchDimensionGroup,
  disposeSketchEdgeHighlight,
  formatSketchDimInputLabel,
  formatSketchLength,
  offsetFromPick,
  parseUserDimensionValue,
  type SketchDimensionDrawOptions,
  pickSketchDimension,
  pickSketchEdge,
  sketchEdgesEqual,
  sketchLengthMm,
  syncDimensionsToContours,
  updateSketchDimensionLabelScales,
  type SketchDimension,
  type SketchDimensionKind,
  type SketchEdgePick,
  type SketchUnit,
} from '../sketch-dimension';
import type { DimSession } from '../app/types';
import { isTypingTarget, setStatus, uid } from '../app/util';

export interface SketchDimensionHost {
  getActiveSketchId(): string | null;
  getContours(): Contour[];
  getSketchDimensions(): SketchDimension[];
  setSketchDimensions(dims: SketchDimension[]): void;
  getSketchUnit(): SketchUnit;
  getSketchDimKind(): SketchDimensionKind;
  getSketchGridSpacing(): number;
  getPlaneAxis(): import('../types').PlaneAxis;
  getPlanePosition(): number;
  getSceneSize(): number;
  getSketchDimGroup(): THREE.Group;
  getSketchDimHoverGroup(): THREE.Group;
  getLineResolution(): THREE.Vector2;
  getRendererDom(): HTMLElement;
  getCamera(): THREE.Camera;
  pickSketchHit(clientX: number, clientY: number): THREE.Vector3 | null;
  pushUndo(label?: string): void;
  rebuildContourLines(): void;
  /** After a dimension value edit mutates a contour's geometry (#30 recompute trigger). */
  onContourGeometryEdited?(contourId: string): void;
  setDimPickCursor(canPick: boolean): void;
  openSketchPanel(): void;
  /** After placing/editing a dimension or cancelling placement — e.g. switch to navigate. */
  onWorkflowEnd(): void;
  releasePointerCapture(): void;
  sketchDimInputRow: HTMLElement;
  sketchDimValueInput: HTMLInputElement;
  sketchDimUnitLabel: HTMLElement;
  sketchDimApplyBtn: HTMLButtonElement;
  sketchDimHud: HTMLElement;
  sketchDimHudValue: HTMLInputElement;
  sketchDimHudUnit: HTMLElement;
  sketchDimHudApply: HTMLButtonElement;
}

export interface SketchDimensionApi {
  readonly preselectedEdge: SketchEdgePick | null;
  readonly hoveredEdge: SketchEdgePick | null;
  readonly dimDragActive: boolean;
  readonly hasSession: boolean;
  readonly awaitingValue: boolean;
  shouldFinishPlacement(): boolean;
  setPreselectedEdge(edge: SketchEdgePick | null): void;
  clearSession(): void;
  tryPreselectEdge(clientX: number, clientY: number): boolean;
  beginDragFromEdge(edge: SketchEdgePick): void;
  finishDrag(): void;
  readonly selectedDimensionId: string | null;
  handlePointerDown(e: PointerEvent, capture: (id: number) => void): boolean;
  handlePointerMove(clientX: number, clientY: number): void;
  handleDoubleClick(clientX: number, clientY: number): boolean;
  selectDimensionAt(clientX: number, clientY: number): boolean;
  hasPickableEdgeAt(clientX: number, clientY: number): boolean;
  deleteDimension(id: string): void;
  deleteSelectedDimension(): boolean;
  applyPendingValue(): void;
  rebuild(preview?: SketchDimension | null): void;
  refreshList(): void;
  /** Re-anchor dimensions to current contour geometry (after a solver move). */
  syncToContours(): void;
  dimensionsToProject(): ReturnType<typeof serializeDimensions>;
  onUnitChanged(): void;
  updateScreenScales(): void;
  bindUi(onKindChange: () => void): void;
}

function serializeDimensions(dims: SketchDimension[]) {
  return dims.map((d) => ({
    id: d.id,
    sketchId: d.sketchId,
    kind: d.kind,
    axis: d.axis,
    position: d.position,
    a: [d.a.x, d.a.y, d.a.z] as [number, number, number],
    b: [d.b.x, d.b.y, d.b.z] as [number, number, number],
    offset: d.offset,
    visible: d.visible !== false,
    contourId: d.contourId,
    pointIndex0: d.pointIndex0,
    pointIndex1: d.pointIndex1,
  }));
}

function edgeFromContour(contour: Contour, dim: SketchDimension): SketchEdgePick | null {
  const i0 = dim.pointIndex0 ?? 0;
  const i1 = dim.pointIndex1 ?? 1;
  if (i1 >= contour.points.length) return null;
  return {
    contourId: contour.id,
    pointIndex0: i0,
    pointIndex1: i1,
    a: contour.points[i0].clone(),
    b: contour.points[i1].clone(),
    kind: dim.kind,
  };
}

export function createSketchDimensionApi(host: SketchDimensionHost): SketchDimensionApi {
  let preselectedEdge: SketchEdgePick | null = null;
  let hoveredEdge: SketchEdgePick | null = null;
  let dimSession: DimSession | null = null;
  let dimDragActive = false;
  let placementPointerDown = false;
  let selectedDimensionId: string | null = null;

  function currentDimValueText(): string {
    return host.sketchDimHudValue.value || host.sketchDimValueInput.value;
  }

  function setDimValueText(text: string) {
    host.sketchDimHudValue.value = text;
    host.sketchDimValueInput.value = text;
  }

  function hideValueInput() {
    host.sketchDimInputRow.classList.add('hidden');
    host.sketchDimHud.classList.add('hidden');
  }

  function showValueInput(editing = false) {
    if (!dimSession) return;
    const unit = host.getSketchUnit();
    const mm = sketchLengthMm(dimSession.edge.a, dimSession.edge.b);
    const displayMm = dimensionDisplayMm(mm, dimSession.edge.kind);
    const unitDiv = unit === 'mm' ? 1 : unit === 'cm' ? 10 : unit === 'm' ? 1000 : 25.4;
    const decimals = unit === 'm' ? 3 : unit === 'cm' ? 2 : 1;
    const text = (displayMm / unitDiv).toFixed(decimals);
    setDimValueText(text);
    host.sketchDimUnitLabel.textContent = unit;
    host.sketchDimHudUnit.textContent = unit;
    host.sketchDimInputRow.classList.remove('hidden');
    host.sketchDimHud.classList.remove('hidden');
    host.openSketchPanel();
    requestAnimationFrame(() => {
      host.sketchDimHudValue.focus();
      host.sketchDimHudValue.select();
    });
    rebuildPreview();
    setStatus(
      editing
        ? t('status.dimEdit')
        : t('status.dimValue', { value: formatSketchLength(mm, unit, dimSession.edge.kind) }),
    );
  }

  function clearHoverVisual() {
    const hoverGroup = host.getSketchDimHoverGroup();
    hoverGroup.children.slice().forEach((child) => {
      disposeSketchEdgeHighlight(child);
      child.removeFromParent();
    });
    hoverGroup.visible = false;
  }

  function setHoveredEdge(edge: SketchEdgePick | null) {
    if (sketchEdgesEqual(hoveredEdge, edge)) return;
    hoveredEdge = edge;
    clearHoverVisual();
    host.setDimPickCursor(!!edge);
    if (!edge) return;
    const hoverGroup = host.getSketchDimHoverGroup();
    hoverGroup.add(
      buildSketchEdgeHighlight(edge, host.getPlaneAxis(), host.getPlanePosition(), host.getLineResolution()),
    );
    hoverGroup.visible = true;
  }

  function dimPreview(): SketchDimension | null {
    const activeSketchId = host.getActiveSketchId();
    if (!dimSession || !activeSketchId) return null;
    const { edge, offset } = dimSession;
    return {
      id: 'preview',
      sketchId: activeSketchId,
      kind: edge.kind,
      axis: host.getPlaneAxis(),
      position: host.getPlanePosition(),
      a: edge.a.clone(),
      b: edge.b.clone(),
      offset,
      visible: true,
    };
  }

  function inlinePreviewLabel(): string {
    if (!dimSession) return '';
    const unit = host.getSketchUnit();
    const typed = formatSketchDimInputLabel(currentDimValueText(), unit, dimSession.edge.kind);
    if (typed && dimSession.phase === 'value') return typed;
    const mm = sketchLengthMm(dimSession.edge.a, dimSession.edge.b);
    return formatSketchLength(mm, unit, dimSession.edge.kind);
  }

  function drawContext(): Pick<SketchDimensionDrawOptions, 'resolution' | 'camera' | 'viewportHeightPx'> {
    return {
      resolution: host.getLineResolution(),
      camera: host.getCamera(),
      viewportHeightPx: host.getRendererDom().clientHeight || 800,
    };
  }

  function previewDrawOptions(): SketchDimensionDrawOptions {
    return {
      labelText: inlinePreviewLabel(),
      active: true,
      ...drawContext(),
    };
  }

  function rebuildPreview() {
    rebuild(dimPreview(), dimSession ? previewDrawOptions() : undefined);
  }

  function rebuild(preview?: SketchDimension | null, previewOpts?: SketchDimensionDrawOptions) {
    const group = host.getSketchDimGroup();
    group.children.slice().forEach((child) => {
      disposeSketchDimensionGroup(child);
      child.removeFromParent();
    });
    const activeSketchId = host.getActiveSketchId();
    if (!activeSketchId) {
      group.visible = false;
      return;
    }
    const unit = host.getSketchUnit();
    const ctx = drawContext();
    const dims = host.getSketchDimensions().filter(
      (d) => d.sketchId === activeSketchId && d.visible !== false,
    );
    for (const d of dims) {
      group.add(
        buildSketchDimensionGroup(d, unit, 1, {
          ...ctx,
          active: d.id === selectedDimensionId,
        }),
      );
    }
    if (preview) {
      group.add(buildSketchDimensionGroup(preview, unit, 1, previewOpts ?? previewDrawOptions()));
    }
    group.visible = dims.length > 0 || !!preview;
  }

  function commit(input: {
    a: THREE.Vector3;
    b: THREE.Vector3;
    offset: number;
    kind: SketchDimensionKind;
    contourId?: string;
    pointIndex0?: number;
    pointIndex1?: number;
  }) {
    const activeSketchId = host.getActiveSketchId();
    if (!activeSketchId) return;
    const dim: SketchDimension = {
      id: uid(),
      sketchId: activeSketchId,
      kind: input.kind,
      axis: host.getPlaneAxis(),
      position: host.getPlanePosition(),
      a: input.a.clone(),
      b: input.b.clone(),
      offset: input.offset,
      visible: true,
      contourId: input.contourId,
      pointIndex0: input.pointIndex0,
      pointIndex1: input.pointIndex1,
    };
    host.setSketchDimensions([...host.getSketchDimensions(), dim]);
    rebuild();
    refreshList();
    const unit = host.getSketchUnit();
    setStatus(
      t('status.dimSet', {
        value: formatSketchLength(sketchLengthMm(dim.a, dim.b), unit, dim.kind),
      }),
    );
  }

  function deleteDimension(id: string) {
    if (!host.getSketchDimensions().some((d) => d.id === id)) return;
    host.pushUndo(t('undo.dimDelete'));
    host.setSketchDimensions(host.getSketchDimensions().filter((d) => d.id !== id));
    if (selectedDimensionId === id) selectedDimensionId = null;
    if (dimSession?.editingId === id) {
      dimSession = null;
      dimDragActive = false;
      placementPointerDown = false;
      hideValueInput();
    }
    rebuild();
    refreshList();
    setStatus(t('status.dimDeleted'));
  }

  function selectDimension(dim: SketchDimension | null) {
    selectedDimensionId = dim?.id ?? null;
    rebuild();
    if (dim) {
      const unit = host.getSketchUnit();
      setStatus(
        t('status.dimSelected', {
          value: formatSketchLength(sketchLengthMm(dim.a, dim.b), unit, dim.kind),
        }),
      );
    }
  }

  function pickDimensionAt(clientX: number, clientY: number): SketchDimension | null {
    const activeSketchId = host.getActiveSketchId();
    if (!activeSketchId) return null;
    return pickSketchDimension(
      host.getSketchDimensions(),
      activeSketchId,
      clientX,
      clientY,
      host.getRendererDom(),
      host.getCamera(),
    );
  }

  function refreshList() {
    const list = document.getElementById('sketch-dim-list');
    if (!list) return;
    list.innerHTML = '';
    const activeSketchId = host.getActiveSketchId();
    if (!activeSketchId) return;
    const unit = host.getSketchUnit();
    const dims = host.getSketchDimensions().filter((d) => d.sketchId === activeSketchId);
    dims.forEach((d, i) => {
      const mm = sketchLengthMm(d.a, d.b);
      const li = document.createElement('li');
      const label = document.createElement('span');
      label.textContent = `${i + 1}. ${formatSketchLength(mm, unit, d.kind)}`;
      label.title = t('panel.sketch.dimListEdit');
      const del = document.createElement('button');
      del.type = 'button';
      del.title = t('panel.sketch.dimDelete');
      del.textContent = '×';
      del.onclick = () => deleteDimension(d.id);
      li.appendChild(label);
      li.appendChild(del);
      list.appendChild(li);
    });
  }

  function pickEdgeAt(clientX: number, clientY: number): SketchEdgePick | null {
    const activeSketchId = host.getActiveSketchId();
    if (!activeSketchId) return null;
    return pickSketchEdge(
      host.getContours(),
      activeSketchId,
      clientX,
      clientY,
      host.getRendererDom(),
      host.getCamera(),
      host.getSceneSize(),
      host.getSketchDimKind(),
    );
  }

  function beginEditDimension(dim: SketchDimension) {
    const contour = host.getContours().find((c) => c.id === dim.contourId);
    if (!contour) {
      setStatus(t('status.dimProfileNotFound'));
      return;
    }
    const edge = edgeFromContour(contour, dim);
    if (!edge) {
      setStatus(t('status.dimLoadFailed'));
      return;
    }
    dimSession = {
      edge,
      offset: dim.offset,
      phase: 'value',
      editingId: dim.id,
    };
    dimDragActive = false;
    setHoveredEdge(null);
    rebuild();
    showValueInput(true);
  }

  function updateHover(clientX: number, clientY: number) {
    if (dimSession?.phase === 'value') return;
    const edge = pickEdgeAt(clientX, clientY);
    setHoveredEdge(edge);
    if (edge) {
      const unit = host.getSketchUnit();
      setStatus(
        t('status.dimEdgeHover', {
          value: formatSketchLength(sketchLengthMm(edge.a, edge.b), unit, edge.kind),
        }),
      );
    } else if (!dimSession) {
      setStatus(t('status.dimHint'));
    }
  }

  return {
    get preselectedEdge() {
      return preselectedEdge;
    },
    get hoveredEdge() {
      return hoveredEdge;
    },
    get dimDragActive() {
      return dimDragActive;
    },
    get hasSession() {
      return dimSession !== null;
    },
    get awaitingValue() {
      return dimSession?.phase === 'value';
    },

    setPreselectedEdge(edge) {
      preselectedEdge = edge;
    },

    clearSession() {
      dimSession = null;
      dimDragActive = false;
      placementPointerDown = false;
      preselectedEdge = null;
      setHoveredEdge(null);
      hideValueInput();
      host.releasePointerCapture();
      rebuild();
    },

    tryPreselectEdge(clientX, clientY) {
      const edge = pickEdgeAt(clientX, clientY);
      if (!edge) return false;
      preselectedEdge = edge;
      setHoveredEdge(edge);
      const unit = host.getSketchUnit();
      setStatus(
        t('status.dimEdgeSelected', {
          value: formatSketchLength(sketchLengthMm(edge.a, edge.b), unit, edge.kind),
        }),
      );
      return true;
    },

    beginDragFromEdge(edge) {
      dimSession = {
        edge: {
          contourId: edge.contourId,
          pointIndex0: edge.pointIndex0,
          pointIndex1: edge.pointIndex1,
          a: edge.a.clone(),
          b: edge.b.clone(),
          kind: edge.kind,
        },
        offset: host.getSketchGridSpacing() * 1.5,
        phase: 'drag',
      };
      setHoveredEdge(edge);
      rebuildPreview();
      setStatus(t('status.dimDragLine'));
    },

    finishDrag() {
      if (!dimSession || dimSession.phase !== 'drag') return;
      dimSession.phase = 'value';
      dimDragActive = false;
      placementPointerDown = false;
      setHoveredEdge(null);
      rebuildPreview();
      showValueInput(false);
    },

    shouldFinishPlacement() {
      return !!dimSession && dimSession.phase === 'drag' && placementPointerDown;
    },

    get selectedDimensionId() {
      return selectedDimensionId;
    },

    selectDimensionAt(clientX, clientY) {
      const dim = pickDimensionAt(clientX, clientY);
      if (!dim) {
        if (selectedDimensionId) {
          selectedDimensionId = null;
          rebuild();
        }
        return false;
      }
      selectDimension(dim);
      return true;
    },

    hasPickableEdgeAt(clientX, clientY) {
      return !!pickEdgeAt(clientX, clientY);
    },

    deleteDimension(id) {
      deleteDimension(id);
    },

    deleteSelectedDimension() {
      if (!selectedDimensionId) return false;
      deleteDimension(selectedDimensionId);
      return true;
    },

    handlePointerDown(e, capture) {
      const activeSketchId = host.getActiveSketchId();
      if (!activeSketchId) {
        setStatus(t('status.dimNeedSketch'));
        return false;
      }

      if (dimSession?.phase === 'value') {
        this.clearSession();
        host.onWorkflowEnd();
        return false;
      }

      if (dimSession?.phase === 'drag') {
        placementPointerDown = true;
        dimDragActive = true;
        capture(e.pointerId);
        this.handlePointerMove(e.clientX, e.clientY);
        return true;
      }

      const edge = preselectedEdge ?? hoveredEdge ?? pickEdgeAt(e.clientX, e.clientY);
      if (!edge) {
        if (selectedDimensionId) {
          selectedDimensionId = null;
          rebuild();
        }
        return false;
      }
      preselectedEdge = null;
      selectedDimensionId = null;
      this.beginDragFromEdge(edge);
      placementPointerDown = true;
      dimDragActive = true;
      capture(e.pointerId);
      this.handlePointerMove(e.clientX, e.clientY);
      return true;
    },

    handlePointerMove(clientX, clientY) {
      if (dimSession?.phase === 'drag' && dimDragActive && host.getActiveSketchId()) {
        const hit = host.pickSketchHit(clientX, clientY);
        if (!hit) return;
        const { a, b } = dimSession.edge;
        dimSession.offset = offsetFromPick(
          host.getPlaneAxis(),
          host.getPlanePosition(),
          a,
          b,
          hit,
        );
        rebuildPreview();
        return;
      }
      if (dimSession?.phase === 'value') return;
      updateHover(clientX, clientY);
    },

    handleDoubleClick(clientX, clientY) {
      const activeSketchId = host.getActiveSketchId();
      if (!activeSketchId) return false;
      const dim = pickSketchDimension(
        host.getSketchDimensions(),
        activeSketchId,
        clientX,
        clientY,
        host.getRendererDom(),
        host.getCamera(),
      );
      if (!dim) return false;
      beginEditDimension(dim);
      return true;
    },

    applyPendingValue() {
      const activeSketchId = host.getActiveSketchId();
      if (!dimSession || dimSession.phase !== 'value' || !activeSketchId) return;
      const targetDisplayMm = parseUserDimensionValue(currentDimValueText(), host.getSketchUnit());
      if (targetDisplayMm === null) {
        setStatus(t('status.dimInvalidValue'));
        return;
      }
      const contour = host.getContours().find((c) => c.id === dimSession!.edge.contourId);
      if (!contour) {
        setStatus(t('status.dimProfileMissing'));
        this.clearSession();
        return;
      }
      host.pushUndo(dimSession.editingId ? t('undo.dimEdit') : t('undo.dimSet'));
      const edge = dimSession.edge;
      if (!applyDimensionValueToContour(contour, edge, targetDisplayMm)) {
        setStatus(t('status.dimApplyFailed'));
        return;
      }
      edge.a.copy(contour.points[edge.pointIndex0]);
      edge.b.copy(contour.points[edge.pointIndex1]);
      host.rebuildContourLines();
      host.onContourGeometryEdited?.(edge.contourId);

      if (dimSession.editingId) {
        const dims = host.getSketchDimensions();
        const idx = dims.findIndex((d) => d.id === dimSession!.editingId);
        if (idx >= 0) {
          const updated = [...dims];
          updated[idx] = {
            ...updated[idx],
            a: edge.a.clone(),
            b: edge.b.clone(),
            offset: dimSession.offset,
          };
          host.setSketchDimensions(updated);
          rebuild();
          refreshList();
          const unit = host.getSketchUnit();
          setStatus(
            t('status.dimUpdated', {
              value: formatSketchLength(sketchLengthMm(edge.a, edge.b), unit, edge.kind),
            }),
          );
        }
        this.clearSession();
        host.onWorkflowEnd();
        return;
      }

      commit({
        a: edge.a,
        b: edge.b,
        offset: dimSession.offset,
        kind: edge.kind,
        contourId: edge.contourId,
        pointIndex0: edge.pointIndex0,
        pointIndex1: edge.pointIndex1,
      });
      this.clearSession();
      host.onWorkflowEnd();
    },

    rebuild,
    refreshList,

    syncToContours() {
      host.setSketchDimensions(syncDimensionsToContours(host.getSketchDimensions(), host.getContours()));
    },

    dimensionsToProject() {
      return serializeDimensions(host.getSketchDimensions());
    },

    onUnitChanged() {
      const unit = host.getSketchUnit();
      host.sketchDimUnitLabel.textContent = unit;
      rebuildPreview();
      refreshList();
      if (dimSession?.phase === 'value') showValueInput(!!dimSession.editingId);
    },

    updateScreenScales() {
      if (!host.getSketchDimGroup().visible) return;
      updateSketchDimensionLabelScales(
        host.getSketchDimGroup(),
        host.getCamera(),
        host.getRendererDom().clientHeight || 800,
      );
    },

    bindUi(onKindChange) {
      const apply = () => this.applyPendingValue();
      host.sketchDimApplyBtn.addEventListener('click', apply);
      host.sketchDimHudApply.addEventListener('click', apply);
      const onEnter = (ev: KeyboardEvent) => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          ev.stopPropagation();
          apply();
        }
      };
      host.sketchDimValueInput.addEventListener('keydown', onEnter);
      host.sketchDimHudValue.addEventListener('keydown', onEnter);
      host.sketchDimHudValue.addEventListener('input', () => {
        host.sketchDimValueInput.value = host.sketchDimHudValue.value;
        if (dimSession) rebuildPreview();
      });
      host.sketchDimValueInput.addEventListener('input', () => {
        host.sketchDimHudValue.value = host.sketchDimValueInput.value;
        if (dimSession) rebuildPreview();
      });
      document.getElementById('sketch-dim-kind')?.addEventListener('change', () => onKindChange());
      window.addEventListener('keydown', (ev) => {
        if (isTypingTarget(ev.target)) return;
        if (
          (ev.key === 'Delete' || ev.key === 'Backspace') &&
          selectedDimensionId &&
          host.getActiveSketchId()
        ) {
          ev.preventDefault();
          deleteDimension(selectedDimensionId);
          return;
        }
        if (!dimSession || dimSession.phase !== 'value') return;
        if (ev.key === 'Enter' && !isTypingTarget(ev.target)) {
          ev.preventDefault();
          apply();
          return;
        }
        if (!isTypingTarget(ev.target) && /^[0-9.,]$/.test(ev.key) && !ev.ctrlKey && !ev.metaKey) {
          host.sketchDimHudValue.focus();
          if (host.sketchDimHudValue.selectionStart === host.sketchDimHudValue.selectionEnd) {
            host.sketchDimHudValue.select();
          }
        }
        if (!isTypingTarget(ev.target) && dimSession?.phase === 'value' && /^[0-9.,]$/.test(ev.key)) {
          const next = ev.key === ',' ? '.' : ev.key;
          if (host.sketchDimHudValue.selectionStart === 0 && host.sketchDimHudValue.selectionEnd === host.sketchDimHudValue.value.length) {
            setDimValueText(next);
          } else {
            setDimValueText(host.sketchDimHudValue.value + next);
          }
          rebuildPreview();
          ev.preventDefault();
        }
      });
    },
  };
}