/**
 * Interactive sketch-constraint tool (#11, Phase 2) — Fusion-style.
 *
 * Flow: pick the kind in the sketch panel, then click sketch points. Once enough
 * points for the kind are picked (1 for fix, 2 for coincident/h/v/distance, 4 for
 * parallel/perpendicular) the constraint is created and the solver runs, snapping
 * the geometry. Mirrors the dimension tool (`./dimensions`): a `createX(host)`
 * controller with a host interface, pointer handling, an overlay group and a
 * project-side list.
 */
import * as THREE from 'three';
import type { Contour } from '../types';
import {
  constraintNeedsValue,
  requiredPointCount,
  type SketchConstraint,
  type SketchConstraintKind,
  type SketchPointRef,
  type SketchSolveResult,
} from '../sketch/sketch-constraints';
import { projectToSketch2D, sketch2DToWorld, sketchPlaneFrame } from '../sketch-geometry';

export const SKETCH_POINT_PICK_PX = 18;
const PICK_COLOR = 0xffb300;
const PENDING_COLOR = 0x00e5ff;

export interface SketchConstraintHost {
  getActiveSketchId(): string | null;
  getContours(): Contour[];
  getSketchConstraints(): SketchConstraint[];
  setSketchConstraints(cs: SketchConstraint[]): void;
  /** Active kind from the panel selector. */
  getConstraintKind(): SketchConstraintKind;
  /** Parsed value for a `distance` constraint (mm), or null when empty/invalid. */
  getConstraintValueMm(): number | null;
  getPlaneAxis(): import('../types').PlaneAxis;
  getPlanePosition(): number;
  getSceneSize(): number;
  getRendererDom(): HTMLElement;
  getCamera(): THREE.Camera;
  /** Overlay group for pick markers (added to the scene by main.ts). */
  getPickGroup(): THREE.Group;
  pushUndo(label?: string): void;
  /** Run the solver on the active sketch and redraw contour geometry. */
  solveActiveSketch(): SketchSolveResult;
  rebuildContourLines(): void;
  setStatus(msg: string): void;
  t(key: string, params?: Record<string, string | number>): string;
  onWorkflowEnd(): void;
}

export interface SketchConstraintApi {
  readonly pendingCount: number;
  /** Returns true when the click was consumed (a point was picked). */
  handlePointerDown(clientX: number, clientY: number): boolean;
  clearPending(): void;
  rebuildPickVisual(): void;
  /** Programmatic create + solve (UI completion + test bridge share this). */
  addConstraint(
    kind: SketchConstraintKind,
    refs: SketchPointRef[],
    value?: number,
  ): SketchConstraint | null;
  deleteConstraint(id: string): void;
  deleteLast(): boolean;
  refreshList(): void;
  /** Count for the active sketch. */
  activeCount(): number;
}

interface ScreenPoint {
  contourId: string;
  pointIndex: number;
}

function worldToClient(p: THREE.Vector3, dom: HTMLElement, camera: THREE.Camera) {
  const v = p.clone().project(camera);
  const rect = dom.getBoundingClientRect();
  return {
    x: (v.x * 0.5 + 0.5) * rect.width + rect.left,
    y: (-v.y * 0.5 + 0.5) * rect.height + rect.top,
  };
}

/** Nearest sketch contour point to (clientX, clientY) within `pickPx`. */
export function pickSketchPoint(
  contours: Contour[],
  sketchId: string,
  clientX: number,
  clientY: number,
  dom: HTMLElement,
  camera: THREE.Camera,
  pickPx = SKETCH_POINT_PICK_PX,
): ScreenPoint | null {
  let best: ScreenPoint | null = null;
  let bestDist = pickPx;
  for (const c of contours) {
    if (c.sketchId !== sketchId || c.visible === false) continue;
    for (let i = 0; i < c.points.length; i++) {
      const s = worldToClient(c.points[i], dom, camera);
      const d = Math.hypot(clientX - s.x, clientY - s.y);
      if (d >= bestDist) continue;
      bestDist = d;
      best = { contourId: c.id, pointIndex: i };
    }
  }
  return best;
}

let uidCounter = 0;
function constraintUid(): string {
  uidCounter += 1;
  return `sc-${uidCounter}-${uidCounter * 2654435761 % 100000}`;
}

export function constraintSummary(
  c: SketchConstraint,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  const name = t(`sketchConstraint.kind.${c.kind}`);
  if (c.kind === 'distance' && typeof c.value === 'number') {
    return `${name} · ${c.value.toFixed(1)} mm`;
  }
  return name;
}

export function createSketchConstraintApi(host: SketchConstraintHost): SketchConstraintApi {
  const pending: SketchPointRef[] = [];

  function frame() {
    return sketchPlaneFrame(host.getPlaneAxis(), host.getPlanePosition());
  }

  function pointWorld(ref: SketchPointRef): THREE.Vector3 | null {
    const c = host.getContours().find((x) => x.id === ref.contourId);
    if (!c || ref.pointIndex < 0 || ref.pointIndex >= c.points.length) return null;
    return c.points[ref.pointIndex];
  }

  function clearPickVisual() {
    const group = host.getPickGroup();
    group.children.slice().forEach((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
      child.removeFromParent();
    });
    group.visible = false;
  }

  function rebuildPickVisual() {
    clearPickVisual();
    if (pending.length === 0) return;
    const group = host.getPickGroup();
    const r = Math.max(host.getSceneSize() * 0.006, 0.7);
    pending.forEach((ref, i) => {
      const w = pointWorld(ref);
      if (!w) return;
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(r, 12, 12),
        new THREE.MeshBasicMaterial({
          color: i === pending.length - 1 ? PENDING_COLOR : PICK_COLOR,
          depthTest: false,
          depthWrite: false,
          transparent: true,
          opacity: 0.95,
        }),
      );
      mesh.position.copy(w);
      mesh.renderOrder = 1003;
      group.add(mesh);
    });
    group.visible = true;
  }

  function distanceMm(a: SketchPointRef, b: SketchPointRef): number {
    const wa = pointWorld(a);
    const wb = pointWorld(b);
    if (!wa || !wb) return 0;
    const f = frame();
    const [au, av] = projectToSketch2D(wa, f);
    const [bu, bv] = projectToSketch2D(wb, f);
    return Math.hypot(bu - au, bv - av);
  }

  function commit(
    kind: SketchConstraintKind,
    refs: SketchPointRef[],
    value?: number,
  ): SketchConstraint | null {
    const sketchId = host.getActiveSketchId();
    if (!sketchId) return null;
    const need = requiredPointCount(kind);
    if (refs.length < need) return null;
    // Validate refs resolve.
    for (let i = 0; i < need; i++) {
      if (!pointWorld(refs[i])) return null;
    }

    const constraint: SketchConstraint = {
      id: constraintUid(),
      sketchId,
      kind,
      refs: refs.slice(0, need).map((r) => ({ contourId: r.contourId, pointIndex: r.pointIndex })),
    };
    if (kind === 'distance') {
      constraint.value = value ?? distanceMm(refs[0], refs[1]);
    }
    if (kind === 'fix') {
      const w = pointWorld(refs[0])!;
      const [u, v] = projectToSketch2D(w, frame());
      constraint.target = [u, v];
    }

    host.pushUndo(host.t('undo.sketchConstraint', { kind: host.t(`sketchConstraint.kind.${kind}`) }));
    host.setSketchConstraints([...host.getSketchConstraints(), constraint]);
    const res = host.solveActiveSketch();
    refreshList();
    if (!res.converged) {
      host.setStatus(host.t('status.sketchConstraintOver'));
    } else {
      host.setStatus(host.t('status.sketchConstraintSet', { kind: host.t(`sketchConstraint.kind.${kind}`) }));
    }
    return constraint;
  }

  function refreshList() {
    const list = document.getElementById('sketch-constraint-list');
    if (!list) return;
    list.innerHTML = '';
    const sketchId = host.getActiveSketchId();
    if (!sketchId) return;
    const cs = host.getSketchConstraints().filter((c) => c.sketchId === sketchId);
    cs.forEach((c, i) => {
      const li = document.createElement('li');
      const label = document.createElement('span');
      label.textContent = `${i + 1}. ${constraintSummary(c, host.t)}`;
      const del = document.createElement('button');
      del.type = 'button';
      del.title = host.t('sketchConstraint.delete');
      del.textContent = '×';
      del.onclick = () => deleteConstraint(c.id);
      li.appendChild(label);
      li.appendChild(del);
      list.appendChild(li);
    });
  }

  function deleteConstraint(id: string) {
    if (!host.getSketchConstraints().some((c) => c.id === id)) return;
    host.pushUndo(host.t('undo.sketchConstraintDelete'));
    host.setSketchConstraints(host.getSketchConstraints().filter((c) => c.id !== id));
    refreshList();
    host.setStatus(host.t('status.sketchConstraintDeleted'));
  }

  return {
    get pendingCount() {
      return pending.length;
    },

    handlePointerDown(clientX, clientY) {
      const sketchId = host.getActiveSketchId();
      if (!sketchId) return false;
      const hit = pickSketchPoint(
        host.getContours(),
        sketchId,
        clientX,
        clientY,
        host.getRendererDom(),
        host.getCamera(),
      );
      if (!hit) {
        // Empty click clears an in-progress pick.
        if (pending.length) {
          this.clearPending();
          host.setStatus(host.t('status.sketchConstraintCancelled'));
        }
        return false;
      }

      const kind = host.getConstraintKind();
      const need = requiredPointCount(kind);
      // Reject re-picking a point already in the buffer: every multi-point
      // constraint kind needs its references to be distinct points.
      const dup = pending.some((r) => r.contourId === hit.contourId && r.pointIndex === hit.pointIndex);
      if (dup) {
        host.setStatus(host.t('status.sketchConstraintPickAgain'));
        return true;
      }
      pending.push({ contourId: hit.contourId, pointIndex: hit.pointIndex });
      rebuildPickVisual();

      if (pending.length >= need) {
        const refs = pending.slice(0, need);
        const value = constraintNeedsValue(kind) ? (host.getConstraintValueMm() ?? undefined) : undefined;
        pending.length = 0;
        commit(kind, refs, value);
        clearPickVisual();
      } else {
        host.setStatus(
          host.t('status.sketchConstraintPick', {
            have: pending.length,
            need,
            kind: host.t(`sketchConstraint.kind.${kind}`),
          }),
        );
      }
      return true;
    },

    clearPending() {
      pending.length = 0;
      clearPickVisual();
    },

    rebuildPickVisual,

    addConstraint(kind, refs, value) {
      return commit(kind, refs, value);
    },

    deleteConstraint,

    deleteLast() {
      const sketchId = host.getActiveSketchId();
      if (!sketchId) return false;
      const cs = host.getSketchConstraints().filter((c) => c.sketchId === sketchId);
      const last = cs[cs.length - 1];
      if (!last) return false;
      deleteConstraint(last.id);
      return true;
    },

    refreshList,

    activeCount() {
      const sketchId = host.getActiveSketchId();
      if (!sketchId) return 0;
      return host.getSketchConstraints().filter((c) => c.sketchId === sketchId).length;
    },
  };
}

/** Build a sketch contour from 2D UV coordinates on a plane (test/utility). */
export function contourPointsFromUV(
  uv: [number, number][],
  axis: import('../types').PlaneAxis,
  position: number,
): THREE.Vector3[] {
  const f = sketchPlaneFrame(axis, position);
  return uv.map(([u, v]) => sketch2DToWorld(u, v, f));
}
