import * as THREE from 'three';
import type { Contour, ContourHandle, ContourPointType, PlaneAxis } from './types';
import { planeNormal, planePoint, screenToRay } from './drawing';

const CORNER: ContourPointType = 'corner';

export function ensurePointMeta(contour: Contour): void {
  const n = contour.points.length;
  if (!contour.pointTypes || contour.pointTypes.length !== n) {
    const prev = contour.pointTypes ?? [];
    contour.pointTypes = contour.points.map((_, i) => prev[i] ?? CORNER);
  }
  if (!contour.handles || contour.handles.length !== n) {
    const prev = contour.handles ?? [];
    contour.handles = contour.points.map((_, i) => prev[i] ?? null);
  }
}

export function constrainToContourPlane(
  p: THREE.Vector3,
  axis: PlaneAxis,
  position: number,
): THREE.Vector3 {
  const out = p.clone();
  if (axis === 'xy') out.z = position;
  else if (axis === 'xz') out.y = position;
  else out.x = position;
  return out;
}

export function contourHas3dDeviation(contour: Contour, epsilon = 1e-4): boolean {
  const offPlane = (p: THREE.Vector3): boolean => {
    if (contour.axis === 'xy') return Math.abs(p.z - contour.position) > epsilon;
    if (contour.axis === 'xz') return Math.abs(p.y - contour.position) > epsilon;
    return Math.abs(p.x - contour.position) > epsilon;
  };
  if (contour.points.some(offPlane)) return true;
  if (!contour.handles) return false;
  for (const h of contour.handles) {
    if (h && (offPlane(h.in) || offPlane(h.out))) return true;
  }
  return false;
}

function idx(contour: Contour, i: number): number {
  const n = contour.points.length;
  return ((i % n) + n) % n;
}

function neighbor(contour: Contour, i: number, delta: number): THREE.Vector3 {
  return contour.points[idx(contour, i + delta)];
}

function autoHandles(contour: Contour, i: number): ContourHandle {
  const p = contour.points[i];
  const prev = neighbor(contour, i, -1);
  const next = neighbor(contour, i, 1);
  const tangent = next.clone().sub(prev).multiplyScalar(1 / 6);
  return {
    in: p.clone().sub(tangent),
    out: p.clone().add(tangent),
  };
}

function segmentControls(
  contour: Contour,
  segStart: number,
): { p0: THREE.Vector3; p1: THREE.Vector3; p2: THREE.Vector3; p3: THREE.Vector3 } {
  ensurePointMeta(contour);
  const i0 = segStart;
  const i1 = idx(contour, segStart + 1);
  const a = contour.points[i0];
  const b = contour.points[i1];
  const t0 = contour.pointTypes![i0];
  const t1 = contour.pointTypes![i1];

  if (t0 === CORNER && t1 === CORNER) {
    return { p0: a, p1: a, p2: b, p3: b };
  }

  const h0 =
    t0 === 'curve' && contour.handles![i0]
      ? contour.handles![i0]!
      : autoHandles(contour, i0);
  const h1 =
    t1 === 'curve' && contour.handles![i1]
      ? contour.handles![i1]!
      : autoHandles(contour, i1);

  const out0 = t0 === CORNER ? a : h0.out;
  const in1 = t1 === CORNER ? b : h1.in;
  return { p0: a, p1: out0, p2: in1, p3: b };
}

function cubicAt(
  p0: THREE.Vector3,
  p1: THREE.Vector3,
  p2: THREE.Vector3,
  p3: THREE.Vector3,
  t: number,
): THREE.Vector3 {
  const u = 1 - t;
  const u2 = u * u;
  const t2 = t * t;
  return new THREE.Vector3(
    u2 * u * p0.x + 3 * u2 * t * p1.x + 3 * u * t2 * p2.x + t2 * t * p3.x,
    u2 * u * p0.y + 3 * u2 * t * p1.y + 3 * u * t2 * p2.y + t2 * t * p3.y,
    u2 * u * p0.z + 3 * u2 * t * p1.z + 3 * u * t2 * p2.z + t2 * t * p3.z,
  );
}

export function sampleContour(contour: Contour, samplesPerSegment = 14): THREE.Vector3[] {
  const n = contour.points.length;
  if (n < 2) return contour.points.map((p) => p.clone());
  ensurePointMeta(contour);

  const segs = contour.closed ? n : n - 1;
  const out: THREE.Vector3[] = [];

  for (let s = 0; s < segs; s++) {
    const ctrl = segmentControls(contour, s);
    const steps = contour.closed || s < segs - 1 ? samplesPerSegment : samplesPerSegment + 1;
    for (let k = 0; k < steps; k++) {
      if (k === steps - 1 && s < segs - 1) continue;
      const t = k / samplesPerSegment;
      out.push(cubicAt(ctrl.p0, ctrl.p1, ctrl.p2, ctrl.p3, t));
    }
  }
  return out;
}

export function contourHasCurves(contour: Contour): boolean {
  ensurePointMeta(contour);
  return contour.pointTypes!.some((t) => t !== CORNER);
}

export function displayPoints(contour: Contour): THREE.Vector3[] {
  return contourHasCurves(contour) ? sampleContour(contour) : contour.points;
}

export function initCurveHandles(contour: Contour, index: number): void {
  ensurePointMeta(contour);
  const h = autoHandles(contour, index);
  contour.handles![index] = {
    in: h.in.clone(),
    out: h.out.clone(),
  };
}

export function setPointType(contour: Contour, index: number, type: ContourPointType): void {
  ensurePointMeta(contour);
  contour.pointTypes![index] = type;
  if (type === 'curve') initCurveHandles(contour, index);
  else contour.handles![index] = null;
}

export function moveAnchor(
  contour: Contour,
  index: number,
  next: THREE.Vector3,
  moveHandles = true,
): void {
  ensurePointMeta(contour);
  const prev = contour.points[index].clone();
  const delta = next.clone().sub(prev);
  contour.points[index].copy(next);
  const h = contour.handles![index];
  if (moveHandles && h) {
    h.in.add(delta);
    h.out.add(delta);
  }
}

export function moveHandle(
  contour: Contour,
  index: number,
  which: 'in' | 'out',
  pos: THREE.Vector3,
): void {
  ensurePointMeta(contour);
  if (!contour.handles![index]) initCurveHandles(contour, index);
  contour.pointTypes![index] = 'curve';
  contour.handles![index]![which].copy(pos);
}

export function insertPoint(contour: Contour, afterIndex: number, pos: THREE.Vector3): number {
  ensurePointMeta(contour);
  const insertAt = afterIndex + 1;
  contour.points.splice(insertAt, 0, pos.clone());
  contour.pointTypes!.splice(insertAt, 0, CORNER);
  contour.handles!.splice(insertAt, 0, null);
  return insertAt;
}

export function deletePoint(contour: Contour, index: number): boolean {
  const min = contour.closed ? 3 : 2;
  if (contour.points.length <= min) return false;
  ensurePointMeta(contour);
  contour.points.splice(index, 1);
  contour.pointTypes!.splice(index, 1);
  contour.handles!.splice(index, 1);
  return true;
}

function distRayPoint(ray: THREE.Ray, p: THREE.Vector3): number {
  const closest = new THREE.Vector3();
  ray.closestPointToPoint(p, closest);
  return closest.distanceTo(p);
}

function distRaySegment(ray: THREE.Ray, a: THREE.Vector3, b: THREE.Vector3): number {
  const seg = new THREE.Vector3().subVectors(b, a);
  const len = seg.length();
  if (len < 1e-9) return distRayPoint(ray, a);
  let best = Infinity;
  for (let t = 0; t <= 1.001; t += 0.05) {
    const p = a.clone().lerp(b, Math.min(t, 1));
    best = Math.min(best, distRayPoint(ray, p));
  }
  return best;
}

export type EditPick =
  | { kind: 'anchor'; contourId: string; pointIndex: number }
  | { kind: 'handle-in' | 'handle-out'; contourId: string; pointIndex: number }
  | { kind: 'segment'; contourId: string; segmentIndex: number; point: THREE.Vector3 }
  | { kind: 'contour'; contourId: string };

export function pickEditTarget(
  contours: Contour[],
  selectedId: string | null,
  clientX: number,
  clientY: number,
  dom: HTMLElement,
  camera: THREE.Camera,
  scanSize: number,
): EditPick | null {
  const ray = screenToRay(clientX, clientY, dom, camera);
  const anchorTol = Math.max(scanSize * 0.012, 1.8);
  const handleTol = Math.max(scanSize * 0.009, 1.2);
  const lineTol = Math.max(scanSize * 0.018, 2.5);

  const ordered = selectedId
    ? [...contours.filter((c) => c.id === selectedId), ...contours.filter((c) => c.id !== selectedId)]
    : contours;

  for (const c of ordered) {
    if (c.visible === false) continue;
    ensurePointMeta(c);

    for (let i = 0; i < c.points.length; i++) {
      if (c.pointTypes![i] === 'curve' && c.handles![i]) {
        const h = c.handles![i]!;
        if (distRayPoint(ray, h.out) < handleTol) {
          return { kind: 'handle-out', contourId: c.id, pointIndex: i };
        }
        if (distRayPoint(ray, h.in) < handleTol) {
          return { kind: 'handle-in', contourId: c.id, pointIndex: i };
        }
      }
    }

    for (let i = 0; i < c.points.length; i++) {
      if (distRayPoint(ray, c.points[i]) < anchorTol) {
        return { kind: 'anchor', contourId: c.id, pointIndex: i };
      }
    }
  }

  let bestSeg: EditPick | null = null;
  let bestDist = lineTol;

  for (const c of ordered) {
    if (c.visible === false) continue;
    const pts = sampleContour(c, 10);
    for (let i = 0; i < pts.length - 1; i++) {
      const d = distRaySegment(ray, pts[i], pts[i + 1]);
      if (d < bestDist) {
        const mid = pts[i].clone().add(pts[i + 1]).multiplyScalar(0.5);
        bestDist = d;
        bestSeg = { kind: 'segment', contourId: c.id, segmentIndex: i, point: mid };
      }
    }
  }

  if (bestSeg) {
    const seg = bestSeg as Extract<EditPick, { kind: 'segment' }>;
    const c = contours.find((x) => x.id === seg.contourId);
    if (c) {
      const insert = findInsertOnContour(c, seg.point);
      if (insert) {
        return {
          kind: 'segment',
          contourId: c.id,
          segmentIndex: insert.afterIndex,
          point: insert.point,
        };
      }
    }
    return bestSeg;
  }

  for (const c of ordered) {
    if (c.visible === false) continue;
    const pts = sampleContour(c, 8);
    for (let i = 0; i < pts.length - 1; i++) {
      if (distRaySegment(ray, pts[i], pts[i + 1]) < lineTol * 1.4) {
        return { kind: 'contour', contourId: c.id };
      }
    }
  }

  return null;
}

export function applyContourWorkPlane(contour: Contour): {
  axis: PlaneAxis;
  position: number;
} {
  return { axis: contour.axis, position: contour.position };
}

export function loftPoints(
  contour: Contour,
  full3d = false,
): [number, number, number][] {
  const pts = sampleContour(contour, 16);
  return pts.map((p) => {
    if (full3d) return [p.x, p.y, p.z];
    if (contour.axis === 'xy') return [p.x, p.y, contour.position];
    if (contour.axis === 'xz') return [p.x, contour.position, p.z];
    return [contour.position, p.y, p.z];
  });
}

export function findInsertOnContour(
  contour: Contour,
  near: THREE.Vector3,
): { afterIndex: number; point: THREE.Vector3 } | null {
  const n = contour.points.length;
  if (n < 2) return null;
  ensurePointMeta(contour);
  const segs = contour.closed ? n : n - 1;
  let bestI = 0;
  let bestT = 0;
  let bestDist = Infinity;

  for (let s = 0; s < segs; s++) {
    const ctrl = segmentControls(contour, s);
    for (let k = 0; k <= 20; k++) {
      const t = k / 20;
      const p = cubicAt(ctrl.p0, ctrl.p1, ctrl.p2, ctrl.p3, t);
      const d = p.distanceToSquared(near);
      if (d < bestDist) {
        bestDist = d;
        bestI = s;
        bestT = t;
      }
    }
  }

  const ctrl = segmentControls(contour, bestI);
  const point = cubicAt(ctrl.p0, ctrl.p1, ctrl.p2, ctrl.p3, bestT);
  return { afterIndex: bestI, point };
}

export function cloneHandle(h: ContourHandle | null): ContourHandle | null {
  if (!h) return null;
  return { in: h.in.clone(), out: h.out.clone() };
}