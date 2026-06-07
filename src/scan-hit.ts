import * as THREE from 'three';
import { planeNormal } from './drawing';
import type { PlaneAxis } from './types';

const AXIS_INDEX: Record<PlaneAxis, 0 | 1 | 2> = { xy: 2, xz: 1, yz: 0 };

export function planeWithinScanBounds(
  axis: PlaneAxis,
  position: number,
  box: THREE.Box3,
  margin = 0,
): boolean {
  const idx = AXIS_INDEX[axis];
  const min = [box.min.x, box.min.y, box.min.z][idx];
  const max = [box.max.x, box.max.y, box.max.z][idx];
  return position >= min - margin && position <= max + margin;
}

const _v = new THREE.Vector3();

function inPlaneDistanceSq(a: THREE.Vector3, b: THREE.Vector3, axis: PlaneAxis): number {
  if (axis === 'xy') return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  if (axis === 'xz') return (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
  return (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
}

function alongAxisDelta(a: THREE.Vector3, b: THREE.Vector3, axis: PlaneAxis): number {
  const idx = AXIS_INDEX[axis];
  return Math.abs([a.x - b.x, a.y - b.y, a.z - b.z][idx]);
}

export function planeIntersectsScan(
  geom: THREE.BufferGeometry,
  worldMatrix: THREE.Matrix4,
  axis: PlaneAxis,
  position: number,
  tolerance: number,
  box: THREE.Box3,
  sampleStride = 2,
): boolean {
  if (!planeWithinScanBounds(axis, position, box, tolerance)) return false;

  const pos = geom.attributes.position;
  const idx = AXIS_INDEX[axis];
  for (let i = 0; i < pos.count; i += sampleStride) {
    _v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(worldMatrix);
    const c = [_v.x, _v.y, _v.z][idx];
    if (Math.abs(c - position) <= tolerance) return true;
  }
  return false;
}

export function collectScanPointsOnPlane(
  geom: THREE.BufferGeometry,
  worldMatrix: THREE.Matrix4,
  axis: PlaneAxis,
  position: number,
  tolerance: number,
  sampleStride = 2,
): THREE.Vector3[] {
  const pos = geom.attributes.position;
  const idx = AXIS_INDEX[axis];
  const out: THREE.Vector3[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < pos.count; i += sampleStride) {
    _v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(worldMatrix);
    const c = [_v.x, _v.y, _v.z][idx];
    if (Math.abs(c - position) > tolerance) continue;

    const p = _v.clone();
    if (axis === 'xy') p.z = position;
    else if (axis === 'xz') p.y = position;
    else p.x = position;

    const key = `${p.x.toFixed(1)}|${p.y.toFixed(1)}|${p.z.toFixed(1)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

/** Prüft ob ein Punkt auf der Arbeitsebene nahe genug am Scan liegt (Punktwolke, kein Raycast). */
export function pointHitsScan(
  point: THREE.Vector3,
  geom: THREE.BufferGeometry,
  worldMatrix: THREE.Matrix4,
  axis: PlaneAxis,
  tolerance: number,
  sampleStride = 2,
): boolean {
  const pos = geom.attributes.position;
  if (!pos?.count) return false;

  const tol2 = tolerance * tolerance;
  const inPlaneTol2 = (tolerance * 5) ** 2;

  for (let i = 0; i < pos.count; i += sampleStride) {
    _v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(worldMatrix);

    if (point.distanceToSquared(_v) <= tol2) return true;

    if (alongAxisDelta(_v, point, axis) > tolerance) continue;
    if (inPlaneDistanceSq(_v, point, axis) <= inPlaneTol2) return true;
  }
  return false;
}

export function getScanSolidMeshes(scanGroup: THREE.Group): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  scanGroup.traverse((child) => {
    if (child instanceof THREE.Mesh && child.name === 'solid') meshes.push(child);
  });
  return meshes;
}