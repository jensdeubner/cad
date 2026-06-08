/**
 * Fusion-style Loft — pick profiles in view, live preview, drag spacing or Enter to commit.
 */
import * as THREE from 'three';
import { intersectRayPlane, intersectViewPlane, screenToRay } from './drawing';
import { t } from './i18n';
import { buildExtrudePayload, type LoftContourPayload } from './solid-features';
import { contourLoftPayload } from './solid-ops';
import { contourPlaneInWorld, pickClosedProfileAt, type ParsedLoftMesh, type ProfilePickHost } from './solid-pick';
import type { Contour } from './types';

export type LoftPhase = 'idle' | 'pickProfiles' | 'dragSpacing';

export type LoftHost = ProfilePickHost & {
  setStatus: (msg: string) => void;
  loftContours: (payloads: LoftContourPayload[]) => ParsedLoftMesh | null;
  showLoftPreview: (mesh: ParsedLoftMesh) => void;
  clearLoftPreview: () => void;
  commitLoft: (mesh: ParsedLoftMesh, profileCount: number) => Promise<void>;
  highlightContour: (id: string | null) => void;
  syncOrbitControls: () => void;
};

let phase: LoftPhase = 'idle';
const selectedIds: string[] = [];
let spacingPayload: LoftContourPayload | null = null;
const spacingNormal = new THREE.Vector3();
const anchorWorld = new THREE.Vector3();
let dragging = false;
let spacingFromFirstPick = false;
let dragSpacingMm = 0;
let lastPreviewMs = 0;

const PREVIEW_INTERVAL_MS = 80;
const MIN_SPACING_MM = 0.1;

export function loftPhase(): LoftPhase {
  return phase;
}

export function isLoftActive(): boolean {
  return phase !== 'idle';
}

export function loftSelectedCount(): number {
  return selectedIds.length;
}

function resetState(host?: Pick<LoftHost, 'clearLoftPreview' | 'highlightContour' | 'syncOrbitControls'>) {
  phase = 'idle';
  selectedIds.length = 0;
  spacingPayload = null;
  dragging = false;
  spacingFromFirstPick = false;
  dragSpacingMm = 0;
  lastPreviewMs = 0;
  host?.clearLoftPreview();
  host?.highlightContour(null);
  host?.syncOrbitControls();
}

export function cancelLoft(host?: Pick<LoftHost, 'clearLoftPreview' | 'highlightContour' | 'syncOrbitControls'>) {
  resetState(host);
}

export function beginLoft(host: LoftHost) {
  resetState(host);
  phase = 'pickProfiles';
  host.setStatus(t('status.loftPickProfiles'));
  host.syncOrbitControls();
}

function payloadsForSelection(host: LoftHost): LoftContourPayload[] | null {
  if (!selectedIds.length) return null;
  const payloads: LoftContourPayload[] = [];
  let axis: string | null = null;
  for (const id of selectedIds) {
    const raw = host.findContour(id);
    if (!raw || !raw.closed || raw.points.length < 3) return null;
    const wm = host.getContourWorldMatrix(raw);
    const payload = contourLoftPayload(raw, wm);
    if (axis === null) axis = payload.axis;
    else if (payload.axis !== axis) return null;
    payloads.push(payload);
  }
  return payloads;
}

function refreshMultiPreview(host: LoftHost) {
  if (selectedIds.length < 2) {
    host.clearLoftPreview();
    return;
  }
  const payloads = payloadsForSelection(host);
  if (!payloads) {
    host.setStatus(t('status.contoursSamePlane'));
    return;
  }
  const mesh = host.loftContours(payloads);
  if (mesh) host.showLoftPreview(mesh);
  host.setStatus(
    t('status.loftProfilesLive', { count: selectedIds.length }),
  );
}

function addProfile(contourId: string, host: LoftHost): boolean {
  const raw = host.findContour(contourId);
  if (!raw || !raw.closed || raw.points.length < 3) {
    host.setStatus(t('status.loftNeedClosedProfile'));
    return false;
  }
  if (selectedIds.includes(contourId)) {
    host.setStatus(t('status.loftProfileAlreadySelected'));
    return true;
  }
  if (selectedIds.length) {
    const first = host.findContour(selectedIds[0]!);
    if (first && first.axis !== raw.axis) {
      host.setStatus(t('status.contoursSamePlane'));
      return true;
    }
  }
  selectedIds.push(contourId);
  host.highlightContour(contourId);
  if (selectedIds.length >= 2) refreshMultiPreview(host);
  else host.setStatus(t('status.loftPickSecondProfile'));
  return true;
}

function beginSpacingDrag(contourId: string, host: LoftHost): boolean {
  const raw = host.findContour(contourId);
  if (!raw) return false;
  const wm = host.getContourWorldMatrix(raw);
  spacingPayload = contourLoftPayload(raw, wm);
  const plane = contourPlaneInWorld(raw, wm);
  spacingNormal.copy(plane.normal);
  anchorWorld.copy(plane.point);
  phase = 'dragSpacing';
  dragSpacingMm = 0;
  host.highlightContour(contourId);
  host.clearLoftPreview();
  host.setStatus(t('status.loftDragSpacing'));
  return true;
}

function computeSpacingMm(clientX: number, clientY: number, host: LoftHost): number {
  const dom = host.getDom();
  const camera = host.getCamera();
  const ray = screenToRay(clientX, clientY, dom, camera);
  const axisHit = intersectRayPlane(ray, spacingNormal, anchorWorld);
  if (axisHit) return axisHit.sub(anchorWorld).dot(spacingNormal);
  const viewHit = intersectViewPlane(clientX, clientY, dom, camera, anchorWorld);
  if (viewHit) return viewHit.sub(anchorWorld).dot(spacingNormal);
  return dragSpacingMm;
}

function updateSpacingPreview(distanceMm: number, host: LoftHost) {
  if (!spacingPayload) return;
  const now = performance.now();
  if (now - lastPreviewMs < PREVIEW_INTERVAL_MS) return;
  lastPreviewMs = now;
  dragSpacingMm = distanceMm;
  const mesh = host.loftContours(buildExtrudePayload(spacingPayload, distanceMm).contours);
  if (mesh) host.showLoftPreview(mesh);
  host.setStatus(t('status.loftDragLive', { distance: Math.abs(distanceMm).toFixed(1) }));
}

async function commitSpacing(host: LoftHost) {
  if (!spacingPayload || Math.abs(dragSpacingMm) < MIN_SPACING_MM) {
    host.setStatus(t('status.loftNeedSpacing'));
    phase = 'dragSpacing';
    host.syncOrbitControls();
    return;
  }
  const mesh = host.loftContours(buildExtrudePayload(spacingPayload, dragSpacingMm).contours);
  if (!mesh) {
    host.setStatus(t('status.loftFailed'));
    phase = 'dragSpacing';
    host.syncOrbitControls();
    return;
  }
  resetState(host);
  await host.commitLoft(mesh, 2);
}

export async function tryCommitLoft(host: LoftHost): Promise<boolean> {
  if (phase !== 'pickProfiles' || selectedIds.length < 2) {
    if (phase === 'pickProfiles') host.setStatus(t('status.loftNeedTwoPicked'));
    return false;
  }
  const payloads = payloadsForSelection(host);
  if (!payloads) {
    host.setStatus(t('status.contoursSamePlane'));
    return false;
  }
  const mesh = host.loftContours(payloads);
  if (!mesh) {
    host.setStatus(t('status.loftFailed'));
    return false;
  }
  const count = selectedIds.length;
  resetState(host);
  await host.commitLoft(mesh, count);
  return true;
}

export function handleLoftPointerDown(e: PointerEvent, host: LoftHost): boolean {
  if (phase === 'idle' || e.button !== 0) return false;

  const picked = pickClosedProfileAt(host, e.clientX, e.clientY);

  if (phase === 'pickProfiles') {
    if (!picked) return false;
    if (selectedIds.length === 1 && selectedIds[0] === picked.id) {
      if (!beginSpacingDrag(picked.id, host)) return true;
      dragging = true;
      spacingFromFirstPick = false;
      host.getDom().setPointerCapture(e.pointerId);
      host.syncOrbitControls();
      return true;
    }
    if (!addProfile(picked.id, host)) return true;
    if (selectedIds.length === 1) {
      if (!beginSpacingDrag(picked.id, host)) return true;
      dragging = true;
      spacingFromFirstPick = true;
      host.getDom().setPointerCapture(e.pointerId);
      host.syncOrbitControls();
      return true;
    }
    return true;
  }

  if (phase === 'dragSpacing') {
    dragging = true;
    host.getDom().setPointerCapture(e.pointerId);
    host.syncOrbitControls();
    return true;
  }

  return false;
}

export function handleLoftPointerMove(e: PointerEvent, host: LoftHost): boolean {
  if (!dragging || !spacingPayload) return false;
  if (phase !== 'dragSpacing') return false;
  updateSpacingPreview(computeSpacingMm(e.clientX, e.clientY, host), host);
  return true;
}

export function handleLoftPointerUp(e: PointerEvent, host: LoftHost): boolean {
  if (!dragging) return false;
  dragging = false;
  if (host.getDom().hasPointerCapture(e.pointerId)) {
    host.getDom().releasePointerCapture(e.pointerId);
  }
  if (phase !== 'dragSpacing') return true;
  if (spacingFromFirstPick && Math.abs(dragSpacingMm) < MIN_SPACING_MM) {
    phase = 'pickProfiles';
    spacingPayload = null;
    spacingFromFirstPick = false;
    host.clearLoftPreview();
    host.setStatus(t('status.loftPickSecondProfile'));
    host.syncOrbitControls();
    return true;
  }
  void commitSpacing(host);
  return true;
}

export function buildLoftContoursPayload(payloads: LoftContourPayload[]): string {
  return JSON.stringify({ contours: payloads, closed_ends: true });
}