/**
 * Shared contour picking for Fusion-style solid commands.
 */
import * as THREE from 'three';
import { intersectRayPlane, planeNormal, planePoint, screenToRay } from './drawing';
import { pickEditTarget } from './contour-spline';
import { isContourAttached } from './contour-body';
import { projectToSketch2D, sketchPlaneFrame } from './sketch-geometry';
import type { Contour } from './types';

export type ParsedLoftMesh = {
  positions: Float32Array;
  indices: Uint32Array;
  triangle_count: number;
};

export type ProfilePickHost = {
  getContoursForPicking: () => Contour[];
  findContour: (id: string) => Contour | undefined;
  getContourWorldMatrix: (c: Contour) => THREE.Matrix4;
  getScanSize: () => number;
  getCamera: () => THREE.Camera;
  getDom: () => HTMLElement;
  getActiveSketchId: () => string | null;
};

export function contourPlaneInWorld(
  c: Contour,
  worldMatrix: THREE.Matrix4,
): { normal: THREE.Vector3; point: THREE.Vector3 } {
  const normal = planeNormal(c.axis).clone();
  const point = planePoint(c.axis, c.position).clone();
  if (isContourAttached(c)) {
    normal.transformDirection(worldMatrix).normalize();
    point.applyMatrix4(worldMatrix);
  }
  return { normal, point };
}

function closedCandidates(worldContours: Contour[], activeSketchId: string | null): Contour[] {
  const closed = worldContours.filter(
    (c) => c.closed && c.points.length >= 3 && c.visible !== false,
  );
  if (!activeSketchId) return closed;
  const inSketch = closed.filter((c) => c.sketchId === activeSketchId);
  return inSketch.length ? inSketch : closed;
}

function pointInPolygon2D(x: number, y: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i]![0];
    const yi = poly[i]![1];
    const xj = poly[j]![0];
    const yj = poly[j]![1];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pickClosedProfileFace(
  host: ProfilePickHost,
  clientX: number,
  clientY: number,
): Contour | null {
  const worldContours = host.getContoursForPicking();
  const activeSketchId = host.getActiveSketchId();
  const ray = screenToRay(clientX, clientY, host.getDom(), host.getCamera());

  let best: { id: string; dist: number } | null = null;

  for (const wc of closedCandidates(worldContours, activeSketchId)) {
    const storage = host.findContour(wc.id);
    if (!storage) continue;
    const wm = host.getContourWorldMatrix(storage);
    const { normal, point } = contourPlaneInWorld(storage, wm);
    const hit = intersectRayPlane(ray, normal, point);
    if (!hit) continue;

    const frame = sketchPlaneFrame(storage.axis, storage.position);
    const [hu, hv] = projectToSketch2D(hit, frame);
    const poly: [number, number][] = wc.points.map((p) => {
      const [u, v] = projectToSketch2D(p, frame);
      return [u, v];
    });
    if (!pointInPolygon2D(hu, hv, poly)) continue;

    const dist = ray.origin.distanceTo(hit);
    if (!best || dist < best.dist) best = { id: wc.id, dist };
  }

  return best ? host.findContour(best.id) ?? null : null;
}

/** Edge pick — thin contour lines. */
export function pickClosedContourAt(
  contours: Contour[],
  clientX: number,
  clientY: number,
  dom: HTMLElement,
  camera: THREE.Camera,
  scanSize: number,
  activeSketchId: string | null,
): Contour | null {
  const pick = pickEditTarget(contours, null, clientX, clientY, dom, camera, scanSize);
  if (!pick) return null;
  const c = contours.find((x) => x.id === pick.contourId);
  if (!c || c.visible === false || !c.closed || c.points.length < 3) return null;
  if (activeSketchId) {
    const inSketch = contours.filter(
      (x) => x.sketchId === activeSketchId && x.closed && x.points.length >= 3 && x.visible !== false,
    );
    if (inSketch.length && c.sketchId !== activeSketchId) return null;
  }
  return c;
}

/** Fusion-style: closed profile edge or filled face on sketch plane. */
export function pickClosedProfileAt(host: ProfilePickHost, clientX: number, clientY: number): Contour | null {
  const activeSketchId = host.getActiveSketchId();
  const worldContours = host.getContoursForPicking();
  const edge = pickClosedContourAt(
    worldContours,
    clientX,
    clientY,
    host.getDom(),
    host.getCamera(),
    host.getScanSize(),
    activeSketchId,
  );
  if (edge) {
    return host.findContour(edge.id) ?? edge;
  }
  return pickClosedProfileFace(host, clientX, clientY);
}

export function listClosedProfiles(host: ProfilePickHost): Contour[] {
  const activeSketchId = host.getActiveSketchId();
  const ids = closedCandidates(host.getContoursForPicking(), activeSketchId).map((c) => c.id);
  const out: Contour[] = [];
  for (const id of ids) {
    const c = host.findContour(id);
    if (c) out.push(c);
  }
  return out;
}