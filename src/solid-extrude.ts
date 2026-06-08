/**
 * Fusion-style Extrude — pick closed profile, drag distance in viewport, live preview.
 */
import * as THREE from 'three';
import { contourInWorldSpace } from './contour-body';
import { t } from './i18n';
import { buildExtrudePayload, type LoftContourPayload } from './solid-features';
import { contourLoftPayload } from './solid-ops';
import {
  contourPlaneInWorld,
  listClosedProfiles,
  pickClosedProfileAt,
  type ParsedLoftMesh,
  type ProfilePickHost,
} from './solid-pick';
import type { Contour } from './types';

export type { ParsedLoftMesh } from './solid-pick';

export type ExtrudePhase = 'idle' | 'pickProfile' | 'dragDistance';

export type ExtrudeHost = ProfilePickHost & {
  setStatus: (msg: string) => void;
  getDragScale: () => number;
  loftExtrude: (base: LoftContourPayload, distanceMm: number) => ParsedLoftMesh | null;
  showExtrudePreview: (mesh: ParsedLoftMesh) => void;
  clearExtrudePreview: () => void;
  showExtrudeGizmo: (anchor: THREE.Vector3, normal: THREE.Vector3, distanceMm: number) => void;
  clearExtrudeGizmo: () => void;
  commitExtrude: (mesh: ParsedLoftMesh, distanceMm: number) => Promise<void>;
  highlightContour: (id: string | null) => void;
  syncOrbitControls: () => void;
};

let phase: ExtrudePhase = 'idle';
let basePayload: LoftContourPayload | null = null;
const extrudeNormal = new THREE.Vector3();
const anchorWorld = new THREE.Vector3();
let dragging = false;
let dragDistanceMm = 0;
let dragStartClientY = 0;
let dragStartDistanceMm = 0;
let lastPreviewMs = 0;
let lastGizmoDistance = NaN;

const PREVIEW_INTERVAL_MS = 40;
const MIN_EXTRUDE_MM = 0.5;
const MIN_DRAG_PX = 5;

export function extrudePhase(): ExtrudePhase {
  return phase;
}

export function isExtrudeActive(): boolean {
  return phase !== 'idle';
}

function profileCentroid(raw: Contour, wm: THREE.Matrix4): THREE.Vector3 {
  const world = contourInWorldSpace(raw, wm);
  const c = new THREE.Vector3();
  for (const p of world.points) c.add(p);
  if (world.points.length) c.multiplyScalar(1 / world.points.length);
  return c;
}

function resetState(
  host?: Pick<
    ExtrudeHost,
    'clearExtrudePreview' | 'clearExtrudeGizmo' | 'highlightContour' | 'syncOrbitControls'
  >,
) {
  phase = 'idle';
  basePayload = null;
  dragging = false;
  dragDistanceMm = 0;
  dragStartClientY = 0;
  dragStartDistanceMm = 0;
  lastPreviewMs = 0;
  lastGizmoDistance = NaN;
  host?.clearExtrudePreview();
  host?.clearExtrudeGizmo();
  host?.highlightContour(null);
  host?.syncOrbitControls();
}

export function cancelExtrude(
  host?: Pick<
    ExtrudeHost,
    'clearExtrudePreview' | 'clearExtrudeGizmo' | 'highlightContour' | 'syncOrbitControls'
  >,
) {
  resetState(host);
}

function updateGizmo(distanceMm: number, host: ExtrudeHost) {
  if (Math.abs(distanceMm - lastGizmoDistance) < 0.35) return;
  lastGizmoDistance = distanceMm;
  host.showExtrudeGizmo(anchorWorld, extrudeNormal, distanceMm);
}

function updatePreview(distanceMm: number, host: ExtrudeHost, force = false) {
  if (!basePayload) return;
  const now = performance.now();
  if (!force && now - lastPreviewMs < PREVIEW_INTERVAL_MS) return;
  lastPreviewMs = now;
  dragDistanceMm = distanceMm;
  if (Math.abs(distanceMm) >= MIN_EXTRUDE_MM) {
    const mesh = host.loftExtrude(basePayload, distanceMm);
    if (mesh && mesh.triangle_count > 0) host.showExtrudePreview(mesh);
  } else {
    host.clearExtrudePreview();
  }
  updateGizmo(distanceMm, host);
  if (Math.abs(distanceMm) >= MIN_EXTRUDE_MM) {
    host.setStatus(t('status.extrudeDragLive', { distance: Math.abs(distanceMm).toFixed(1) }));
  } else {
    host.setStatus(t('status.extrudeDragDistance'));
  }
}

function showGizmoIdle(host: ExtrudeHost) {
  lastGizmoDistance = NaN;
  host.showExtrudeGizmo(anchorWorld, extrudeNormal, 0);
  host.setStatus(t('status.extrudeDragDistance'));
}

function beginDrag(clientY: number) {
  dragging = true;
  dragStartClientY = clientY;
  dragStartDistanceMm = dragDistanceMm;
}

function computeDistanceFromDrag(clientY: number, host: ExtrudeHost): number {
  const deltaPx = dragStartClientY - clientY;
  return dragStartDistanceMm + deltaPx * host.getDragScale();
}

function prepareProfile(contourId: string, host: ExtrudeHost): boolean {
  const raw = host.findContour(contourId);
  if (!raw || !raw.closed || raw.points.length < 3) {
    host.setStatus(t('status.extrudeNeedClosedProfile'));
    return false;
  }
  const wm = host.getContourWorldMatrix(raw);
  basePayload = contourLoftPayload(raw, wm);
  const plane = contourPlaneInWorld(raw, wm);
  extrudeNormal.copy(plane.normal);
  anchorWorld.copy(profileCentroid(raw, wm));
  phase = 'dragDistance';
  dragDistanceMm = 0;
  host.highlightContour(contourId);
  host.clearExtrudePreview();
  showGizmoIdle(host);
  return true;
}

export function beginExtrude(host: ExtrudeHost) {
  resetState(host);
  phase = 'pickProfile';
  const profiles = listClosedProfiles(host);
  if (profiles.length === 1 && prepareProfile(profiles[0]!.id, host)) {
    host.syncOrbitControls();
    return;
  }
  host.setStatus(
    profiles.length ? t('status.extrudePickProfile') : t('status.extrudeNeedClosedProfile'),
  );
  host.syncOrbitControls();
}

async function commitIfValid(host: ExtrudeHost) {
  if (!basePayload || Math.abs(dragDistanceMm) < MIN_EXTRUDE_MM) {
    host.setStatus(t('status.extrudeNeedDistance'));
    phase = 'dragDistance';
    dragDistanceMm = 0;
    host.clearExtrudePreview();
    showGizmoIdle(host);
    host.syncOrbitControls();
    return;
  }
  const mesh = host.loftExtrude(basePayload, dragDistanceMm);
  if (!mesh || mesh.triangle_count === 0) {
    host.setStatus(t('status.extrudeFailed'));
    phase = 'dragDistance';
    host.syncOrbitControls();
    return;
  }
  const distance = dragDistanceMm;
  resetState(host);
  await host.commitExtrude(mesh, distance);
}

export function handleExtrudePointerDown(e: PointerEvent, host: ExtrudeHost): boolean {
  if (phase === 'idle' || e.button !== 0) return false;

  if (phase === 'pickProfile') {
    const picked = pickClosedProfileAt(host, e.clientX, e.clientY);
    if (!picked) {
      host.setStatus(t('status.extrudePickProfileFace'));
      return true;
    }
    if (!prepareProfile(picked.id, host)) return true;
    beginDrag(e.clientY);
    host.getDom().setPointerCapture(e.pointerId);
    host.syncOrbitControls();
    return true;
  }

  if (phase === 'dragDistance') {
    beginDrag(e.clientY);
    host.getDom().setPointerCapture(e.pointerId);
    host.syncOrbitControls();
    return true;
  }

  return false;
}

export function handleExtrudePointerMove(e: PointerEvent, host: ExtrudeHost): boolean {
  if (phase !== 'dragDistance' || !dragging || !basePayload) return false;
  updatePreview(computeDistanceFromDrag(e.clientY, host), host);
  return true;
}

function releaseDragPointer(e: PointerEvent, host: ExtrudeHost) {
  dragging = false;
  if (host.getDom().hasPointerCapture(e.pointerId)) {
    host.getDom().releasePointerCapture(e.pointerId);
  }
}

export function handleExtrudePointerUp(e: PointerEvent, host: ExtrudeHost): boolean {
  if (phase !== 'dragDistance' || !dragging) return false;
  releaseDragPointer(e, host);
  const movedPx = Math.abs(e.clientY - dragStartClientY);
  if (movedPx < MIN_DRAG_PX && Math.abs(dragDistanceMm) < MIN_EXTRUDE_MM) {
    dragDistanceMm = 0;
    host.clearExtrudePreview();
    showGizmoIdle(host);
    host.syncOrbitControls();
    return true;
  }
  void commitIfValid(host);
  return true;
}

export function handleExtrudePointerCancel(e: PointerEvent, host: ExtrudeHost): boolean {
  if (phase !== 'dragDistance' || !dragging) return false;
  releaseDragPointer(e, host);
  dragDistanceMm = 0;
  host.clearExtrudePreview();
  showGizmoIdle(host);
  host.syncOrbitControls();
  return true;
}

export function buildExtrudeLoftPayload(base: LoftContourPayload, distanceMm: number): string {
  return JSON.stringify(buildExtrudePayload(base, distanceMm));
}