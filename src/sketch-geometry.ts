import * as THREE from 'three';
import { planeNormal } from './drawing';
import type { PlaneAxis } from './types';

export interface SketchPlaneFrame {
  origin: THREE.Vector3;
  tangent: THREE.Vector3;
  bitangent: THREE.Vector3;
  normal: THREE.Vector3;
}

export function sketchPlaneFrame(axis: PlaneAxis, position: number): SketchPlaneFrame {
  const normal = planeNormal(axis);
  const origin =
    axis === 'xy'
      ? new THREE.Vector3(0, 0, position)
      : axis === 'xz'
        ? new THREE.Vector3(0, position, 0)
        : new THREE.Vector3(position, 0, 0);

  let tangent =
    axis === 'xy' || axis === 'xz'
      ? new THREE.Vector3(1, 0, 0)
      : new THREE.Vector3(0, 1, 0);
  const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize();
  tangent = new THREE.Vector3().crossVectors(bitangent, normal).normalize();

  return { origin, tangent, bitangent, normal };
}

export function projectToSketch2D(p: THREE.Vector3, frame: SketchPlaneFrame): [number, number] {
  const d = p.clone().sub(frame.origin);
  return [d.dot(frame.tangent), d.dot(frame.bitangent)];
}

export function sketch2DToWorld(u: number, v: number, frame: SketchPlaneFrame): THREE.Vector3 {
  return frame.origin
    .clone()
    .add(frame.tangent.clone().multiplyScalar(u))
    .add(frame.bitangent.clone().multiplyScalar(v));
}

export function sketchPlaneOrigin(axis: PlaneAxis, position: number): THREE.Vector3 {
  return sketchPlaneFrame(axis, position).origin.clone();
}

/** Screen-independent snap radius around sketch origin (0,0) in plane UV. */
export function sketchOriginSnapThreshold(spacing: number): number {
  return Math.max(spacing * 0.55, 4);
}

export function isNearSketchOrigin2D(u: number, v: number, spacing: number): boolean {
  const t = sketchOriginSnapThreshold(spacing);
  return Math.hypot(u, v) <= t;
}

export interface SketchSnapResult {
  point: THREE.Vector3;
  snappedOrigin: boolean;
  snappedGrid: boolean;
}

export function snapSketch2D(
  u: number,
  v: number,
  spacing: number,
  snapOrigin = true,
): { u: number; v: number; snappedOrigin: boolean; snappedGrid: boolean } {
  if (snapOrigin && isNearSketchOrigin2D(u, v, spacing)) {
    return { u: 0, v: 0, snappedOrigin: true, snappedGrid: false };
  }
  if (spacing <= 0) return { u, v, snappedOrigin: false, snappedGrid: false };
  return {
    u: Math.round(u / spacing) * spacing,
    v: Math.round(v / spacing) * spacing,
    snappedOrigin: false,
    snappedGrid: true,
  };
}

export function snapSketchPointWithMeta(
  p: THREE.Vector3,
  axis: PlaneAxis,
  position: number,
  spacing: number,
  snapOrigin = true,
): SketchSnapResult {
  const frame = sketchPlaneFrame(axis, position);
  const [u, v] = projectToSketch2D(p, frame);
  const snapped = snapSketch2D(u, v, spacing, snapOrigin);
  return {
    point: sketch2DToWorld(snapped.u, snapped.v, frame),
    snappedOrigin: snapped.snappedOrigin,
    snappedGrid: snapped.snappedGrid,
  };
}

export function snapSketchPoint(
  p: THREE.Vector3,
  axis: PlaneAxis,
  position: number,
  spacing: number,
  snapOrigin = true,
): THREE.Vector3 {
  return snapSketchPointWithMeta(p, axis, position, spacing, snapOrigin).point;
}

function circumcircle2D(
  a: [number, number],
  b: [number, number],
  c: [number, number],
): { cx: number; cy: number; r: number } | null {
  const ax = a[0];
  const ay = a[1];
  const bx = b[0];
  const by = b[1];
  const cx = c[0];
  const cy = c[1];
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-9) return null;
  const ux =
    ((ax * ax + ay * ay) * (by - cy) +
      (bx * bx + by * by) * (cy - ay) +
      (cx * cx + cy * cy) * (ay - by)) /
    d;
  const uy =
    ((ax * ax + ay * ay) * (cx - bx) +
      (bx * bx + by * by) * (ax - cx) +
      (cx * cx + cy * cy) * (bx - ax)) /
    d;
  return { cx: ux, cy: uy, r: Math.hypot(ax - ux, ay - uy) };
}

function normAngle(t: number): number {
  let x = t;
  while (x < 0) x += Math.PI * 2;
  while (x >= Math.PI * 2) x -= Math.PI * 2;
  return x;
}

function ccwBetween(start: number, end: number, test: number): boolean {
  const s = normAngle(start);
  const e = normAngle(end);
  const t = normAngle(test);
  if (s <= e) return t >= s && t <= e;
  return t >= s || t <= e;
}

export function circlePoints(
  center: THREE.Vector3,
  rim: THREE.Vector3,
  axis: PlaneAxis,
  position: number,
  segments = 32,
): THREE.Vector3[] {
  const frame = sketchPlaneFrame(axis, position);
  const [cu, cv] = projectToSketch2D(center, frame);
  const [ru, rv] = projectToSketch2D(rim, frame);
  const r = Math.hypot(ru - cu, rv - cv);
  if (r < 1e-6) return [];

  const out: THREE.Vector3[] = [];
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    out.push(sketch2DToWorld(cu + r * Math.cos(t), cv + r * Math.sin(t), frame));
  }
  return out;
}

export function arc3Points(
  start: THREE.Vector3,
  through: THREE.Vector3,
  end: THREE.Vector3,
  axis: PlaneAxis,
  position: number,
  segments = 28,
): THREE.Vector3[] {
  const frame = sketchPlaneFrame(axis, position);
  const a = projectToSketch2D(start, frame);
  const b = projectToSketch2D(through, frame);
  const c = projectToSketch2D(end, frame);
  const circ = circumcircle2D(a, b, c);
  if (!circ) return [start.clone(), end.clone()];

  const ang = (p: [number, number]) => Math.atan2(p[1] - circ.cy, p[0] - circ.cx);
  const a0 = ang(a);
  const am = ang(b);
  const a1 = ang(c);
  const useCcw = ccwBetween(a0, a1, am);
  let delta = useCcw ? a1 - a0 : a0 - a1;
  if (delta < 0) delta += Math.PI * 2;
  if (delta < 1e-6) return [start.clone()];

  const out: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const angle = useCcw ? a0 + delta * t : a0 - delta * t;
    out.push(
      sketch2DToWorld(
        circ.cx + circ.r * Math.cos(angle),
        circ.cy + circ.r * Math.sin(angle),
        frame,
      ),
    );
  }
  return out;
}

export function rectanglePoints(
  c1: THREE.Vector3,
  c2: THREE.Vector3,
  axis: PlaneAxis,
  position: number,
): THREE.Vector3[] {
  const frame = sketchPlaneFrame(axis, position);
  const [u1, v1] = projectToSketch2D(c1, frame);
  const [u2, v2] = projectToSketch2D(c2, frame);
  const minU = Math.min(u1, u2);
  const maxU = Math.max(u1, u2);
  const minV = Math.min(v1, v2);
  const maxV = Math.max(v1, v2);
  return [
    sketch2DToWorld(minU, minV, frame),
    sketch2DToWorld(maxU, minV, frame),
    sketch2DToWorld(maxU, maxV, frame),
    sketch2DToWorld(minU, maxV, frame),
  ];
}

export function linePoints(a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3[] {
  return [a.clone(), b.clone()];
}

export function trianglePoints(
  p1: THREE.Vector3,
  p2: THREE.Vector3,
  p3: THREE.Vector3,
): THREE.Vector3[] {
  return [p1.clone(), p2.clone(), p3.clone()];
}