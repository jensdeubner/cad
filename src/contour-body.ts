import * as THREE from 'three';
import { DEFAULT_BODY_ID, type CadBodyId } from './cad-body';
import { cloneHandle } from './contour-spline';
import type { Contour } from './types';

const _inv = new THREE.Matrix4();

function transformPoint(p: THREE.Vector3, m: THREE.Matrix4): THREE.Vector3 {
  return p.clone().applyMatrix4(m);
}

function transformContourPoints(contour: Contour, m: THREE.Matrix4): void {
  for (const p of contour.points) p.applyMatrix4(m);
  if (!contour.handles) return;
  for (const h of contour.handles) {
    if (!h) continue;
    h.in.applyMatrix4(m);
    h.out.applyMatrix4(m);
  }
}

export function isContourAttached(contour: Contour): boolean {
  return contour.attachedToBodyId != null && contour.attachedToBodyId !== '';
}

export function attachContourToBody(
  contour: Contour,
  bodyId: CadBodyId,
  bodyWorldMatrix: THREE.Matrix4,
): void {
  if (isContourAttached(contour)) return;
  _inv.copy(bodyWorldMatrix).invert();
  transformContourPoints(contour, _inv);
  contour.attachedToBodyId = bodyId;
}

export function detachContourFromBody(contour: Contour, bodyWorldMatrix: THREE.Matrix4): void {
  if (!isContourAttached(contour)) return;
  transformContourPoints(contour, bodyWorldMatrix);
  contour.attachedToBodyId = null;
}

export function toggleContourBodyAttach(
  contour: Contour,
  bodyId: CadBodyId,
  bodyWorldMatrix: THREE.Matrix4,
): boolean {
  if (isContourAttached(contour)) {
    detachContourFromBody(contour, bodyWorldMatrix);
    return false;
  }
  attachContourToBody(contour, bodyId, bodyWorldMatrix);
  return true;
}

/** Weltkoordinaten für Anzeige, Loft und Treffer. */
export function contourInWorldSpace(contour: Contour, bodyWorldMatrix: THREE.Matrix4): Contour {
  if (!isContourAttached(contour)) {
    return {
      ...contour,
      points: contour.points.map((p) => p.clone()),
      pointTypes: contour.pointTypes ? [...contour.pointTypes] : undefined,
      handles: contour.handles ? contour.handles.map((h) => cloneHandle(h)) : undefined,
    };
  }

  return {
    ...contour,
    attachedToBodyId: null,
    points: contour.points.map((p) => transformPoint(p, bodyWorldMatrix)),
    pointTypes: contour.pointTypes ? [...contour.pointTypes] : undefined,
    handles: contour.handles
      ? contour.handles.map((h) =>
          h
            ? {
                in: transformPoint(h.in, bodyWorldMatrix),
                out: transformPoint(h.out, bodyWorldMatrix),
              }
            : null,
        )
      : undefined,
  };
}

export function worldToContourStorage(
  world: THREE.Vector3,
  contour: Contour,
  bodyWorldMatrix: THREE.Matrix4,
): THREE.Vector3 {
  if (!isContourAttached(contour)) return world.clone();
  _inv.copy(bodyWorldMatrix).invert();
  return world.clone().applyMatrix4(_inv);
}

/** Migration alter Projektdateien (attachedToScan → body-0). */
export function migrateContourAttachment(
  attachedToScan?: boolean,
  attachedToBodyId?: string | null,
): string | null {
  if (attachedToBodyId != null && attachedToBodyId !== '') return attachedToBodyId;
  return attachedToScan ? DEFAULT_BODY_ID : null;
}