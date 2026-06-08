/**
 * Fusion-style Revolve — pick closed profile, drag angle in viewport, live preview.
 */
import * as THREE from 'three';
import { t } from './i18n';
import { listClosedProfiles, pickClosedProfileAt, type ParsedLoftMesh, type ProfilePickHost } from './solid-pick';
import type { LoftContourPayload } from './solid-features';
import { contourLoftPayload, revolutionAxisForPlane } from './solid-ops';
import type { Contour, PlaneAxis } from './types';

export type RevolvePhase = 'idle' | 'pickProfile' | 'dragAngle';

export type RevolveHost = ProfilePickHost & {
  setStatus: (msg: string) => void;
  revolveProfile: (base: LoftContourPayload, axis: PlaneAxis, angleDeg: number) => ParsedLoftMesh | null;
  showRevolvePreview: (mesh: ParsedLoftMesh) => void;
  clearRevolvePreview: () => void;
  commitRevolve: (mesh: ParsedLoftMesh, angleDeg: number) => Promise<void>;
  highlightContour: (id: string | null) => void;
  syncOrbitControls: () => void;
};

let phase: RevolvePhase = 'idle';
let basePayload: LoftContourPayload | null = null;
let profileAxis: PlaneAxis = 'xy';
let dragging = false;
let dragStartClientX = 0;
let dragAngleDeg = 360;
let lastPreviewMs = 0;

const PREVIEW_INTERVAL_MS = 80;
const MIN_REVOLVE_DEG = 1;
const MAX_REVOLVE_DEG = 360;

export function revolvePhase(): RevolvePhase {
  return phase;
}

export function isRevolveActive(): boolean {
  return phase !== 'idle';
}

function resetState(host?: Pick<RevolveHost, 'clearRevolvePreview' | 'highlightContour' | 'syncOrbitControls'>) {
  phase = 'idle';
  basePayload = null;
  dragging = false;
  dragAngleDeg = 360;
  dragStartClientX = 0;
  lastPreviewMs = 0;
  host?.clearRevolvePreview();
  host?.highlightContour(null);
  host?.syncOrbitControls();
}

export function cancelRevolve(host?: Pick<RevolveHost, 'clearRevolvePreview' | 'highlightContour' | 'syncOrbitControls'>) {
  resetState(host);
}

export function beginRevolve(host: RevolveHost) {
  resetState(host);
  phase = 'pickProfile';
  const profiles = listClosedProfiles(host);
  if (profiles.length === 1 && prepareProfile(profiles[0]!.id, host)) {
    host.setStatus(t('status.revolveDragAngle'));
    host.syncOrbitControls();
    return;
  }
  host.setStatus(
    profiles.length ? t('status.revolvePickProfile') : t('status.revolveNeedClosedProfile'),
  );
  host.syncOrbitControls();
}

function prepareProfile(contourId: string, host: RevolveHost): boolean {
  const raw = host.findContour(contourId);
  if (!raw || !raw.closed || raw.points.length < 3) {
    host.setStatus(t('status.revolveNeedClosedProfile'));
    return false;
  }
  const wm = host.getContourWorldMatrix(raw);
  basePayload = contourLoftPayload(raw, wm);
  profileAxis = raw.axis;
  phase = 'dragAngle';
  dragAngleDeg = 360;
  host.highlightContour(contourId);
  host.clearRevolvePreview();
  host.setStatus(t('status.revolveDragAngle'));
  return true;
}

function computeAngleDeg(clientX: number): number {
  const delta = clientX - dragStartClientX;
  return THREE.MathUtils.clamp(Math.abs(delta) * 0.85, MIN_REVOLVE_DEG, MAX_REVOLVE_DEG);
}

function updatePreview(angleDeg: number, host: RevolveHost) {
  if (!basePayload) return;
  const now = performance.now();
  if (now - lastPreviewMs < PREVIEW_INTERVAL_MS) return;
  lastPreviewMs = now;
  dragAngleDeg = angleDeg;
  const mesh = host.revolveProfile(basePayload, profileAxis, angleDeg);
  if (mesh) host.showRevolvePreview(mesh);
  host.setStatus(t('status.revolveDragLive', { angle: angleDeg.toFixed(0) }));
}

async function commitIfValid(host: RevolveHost) {
  if (!basePayload || dragAngleDeg < MIN_REVOLVE_DEG) {
    host.setStatus(t('status.revolveNeedAngle'));
    phase = 'dragAngle';
    host.syncOrbitControls();
    return;
  }
  const mesh = host.revolveProfile(basePayload, profileAxis, dragAngleDeg);
  if (!mesh) {
    host.setStatus(t('status.revolveFailed'));
    phase = 'dragAngle';
    host.syncOrbitControls();
    return;
  }
  const angle = dragAngleDeg;
  resetState(host);
  await host.commitRevolve(mesh, angle);
}

export function handleRevolvePointerDown(e: PointerEvent, host: RevolveHost): boolean {
  if (phase === 'idle' || e.button !== 0) return false;

  if (phase === 'pickProfile') {
    const picked = pickClosedProfileAt(host, e.clientX, e.clientY);
    if (!picked) {
      host.setStatus(t('status.revolvePickProfileFace'));
      return true;
    }
    if (!prepareProfile(picked.id, host)) return true;
    dragging = true;
    dragStartClientX = e.clientX;
    host.getDom().setPointerCapture(e.pointerId);
    host.syncOrbitControls();
    return true;
  }

  if (phase === 'dragAngle') {
    dragging = true;
    dragStartClientX = e.clientX;
    host.getDom().setPointerCapture(e.pointerId);
    host.syncOrbitControls();
    return true;
  }

  return false;
}

export function handleRevolvePointerMove(e: PointerEvent, host: RevolveHost): boolean {
  if (phase !== 'dragAngle' || !dragging || !basePayload) return false;
  updatePreview(computeAngleDeg(e.clientX), host);
  return true;
}

export function handleRevolvePointerUp(e: PointerEvent, host: RevolveHost): boolean {
  if (phase !== 'dragAngle' || !dragging) return false;
  dragging = false;
  if (host.getDom().hasPointerCapture(e.pointerId)) {
    host.getDom().releasePointerCapture(e.pointerId);
  }
  void commitIfValid(host);
  return true;
}

export function buildRevolvePayload(
  base: LoftContourPayload,
  axis: PlaneAxis,
  angleDeg: number,
): string {
  return JSON.stringify({
    contour: base,
    revolution_axis: revolutionAxisForPlane(axis),
    segments: 48,
    angle_deg: angleDeg,
  });
}