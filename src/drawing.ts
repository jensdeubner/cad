import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import type { PlaneAxis } from './types';

export function planeNormal(axis: PlaneAxis): THREE.Vector3 {
  if (axis === 'xy') return new THREE.Vector3(0, 0, 1);
  if (axis === 'xz') return new THREE.Vector3(0, 1, 0);
  return new THREE.Vector3(1, 0, 0);
}

export function planePoint(axis: PlaneAxis, position: number): THREE.Vector3 {
  if (axis === 'xy') return new THREE.Vector3(0, 0, position);
  if (axis === 'xz') return new THREE.Vector3(0, position, 0);
  return new THREE.Vector3(position, 0, 0);
}

export function rayHitWorkPlane(
  ray: THREE.Ray,
  axis: PlaneAxis,
  position: number,
): THREE.Vector3 | null {
  const normal = planeNormal(axis);
  const point = planePoint(axis, position);
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, point);
  const target = new THREE.Vector3();
  return ray.intersectPlane(plane, target) ? target.clone() : null;
}

export function intersectRayPlane(
  ray: THREE.Ray,
  planeNormal: THREE.Vector3,
  coplanarPoint: THREE.Vector3,
): THREE.Vector3 | null {
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, coplanarPoint);
  const hit = new THREE.Vector3();
  return ray.intersectPlane(plane, hit) ? hit.clone() : null;
}

/** Ebene senkrecht zur Kamera — zum freien Ziehen von Kurvengriffen (3D-Bogen). */
export function intersectViewPlane(
  clientX: number,
  clientY: number,
  dom: HTMLElement,
  camera: THREE.Camera,
  through: THREE.Vector3,
): THREE.Vector3 | null {
  const ray = screenToRay(clientX, clientY, dom, camera);
  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);
  return intersectRayPlane(ray, camDir, through);
}

export function screenToRay(
  clientX: number,
  clientY: number,
  dom: HTMLElement,
  camera: THREE.Camera,
): THREE.Ray {
  const rect = dom.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(ndc, camera);
  return raycaster.ray;
}

export function pickOnPlane(
  clientX: number,
  clientY: number,
  dom: HTMLElement,
  camera: THREE.Camera,
  workPlaneMesh: THREE.Mesh,
  scanGroup: THREE.Group,
  axis: PlaneAxis,
  position: number,
): THREE.Vector3 | null {
  const rect = dom.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(ndc, camera);

  const planeHits = raycaster.intersectObject(workPlaneMesh, false);
  if (planeHits.length) return planeHits[0].point.clone();

  const mathHit = rayHitWorkPlane(raycaster.ray, axis, position);
  if (mathHit) return mathHit;

  const scanMeshes: THREE.Mesh[] = [];
  scanGroup.traverse((child) => {
    if (child instanceof THREE.Mesh && child.name === 'solid') scanMeshes.push(child);
  });
  const scanHits = raycaster.intersectObjects(scanMeshes, false);
  if (scanHits.length) {
    const p = scanHits[0].point.clone();
    if (axis === 'xy') p.z = position;
    else if (axis === 'xz') p.y = position;
    else p.x = position;
    return p;
  }

  return null;
}

export function simplifyStroke(points: THREE.Vector3[], minDist: number): THREE.Vector3[] {
  if (points.length < 2) return points.slice();
  const out = [points[0].clone()];
  for (let i = 1; i < points.length; i++) {
    if (out[out.length - 1].distanceTo(points[i]) >= minDist) {
      out.push(points[i].clone());
    }
  }
  return out;
}

export function makeContourLine(
  points: THREE.Vector3[],
  closed: boolean,
  color: string,
  resolution: THREE.Vector2,
  lineWidth = 5,
): Line2 {
  const curvePoints = closed && points.length > 2 ? [...points, points[0]] : points;
  const positions: number[] = [];
  curvePoints.forEach((p) => positions.push(p.x, p.y, p.z));
  const geometry = new LineGeometry();
  geometry.setPositions(positions);
  const material = new LineMaterial({
    color: new THREE.Color(color).getHex(),
    linewidth: lineWidth,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    opacity: 1,
  });
  material.resolution.copy(resolution);
  const line = new Line2(geometry, material);
  line.renderOrder = 1000;
  line.computeLineDistances();
  return line;
}

export function makePointMarkers(
  points: THREE.Vector3[],
  colors: string[] | string,
  baseSize: number,
  sizes?: number[],
): THREE.Group {
  const group = new THREE.Group();
  points.forEach((p, i) => {
    const color = Array.isArray(colors) ? colors[i] : colors;
    const s = sizes?.[i] ?? baseSize;
    const geom = new THREE.SphereGeometry(s, 12, 12);
    const mat = new THREE.MeshBasicMaterial({
      color,
      depthTest: false,
      depthWrite: false,
    });
    const m = new THREE.Mesh(geom, mat);
    m.position.copy(p);
    m.renderOrder = 1001;
    group.add(m);

    if (sizes && sizes[i] > baseSize * 1.2) {
      const glowGeom = new THREE.SphereGeometry(s * 1.45, 10, 10);
      const glowMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.28,
        depthTest: false,
        depthWrite: false,
      });
      const glow = new THREE.Mesh(glowGeom, glowMat);
      glow.position.copy(p);
      glow.renderOrder = 1000;
      group.add(glow);
    }
  });
  return group;
}

export function disposeLine2(line: Line2): void {
  line.geometry.dispose();
  (line.material as LineMaterial).dispose();
}

export type PlaneHitVisual = 'neutral' | 'hit' | 'miss';

const PLANE_COLORS: Record<PlaneHitVisual, number> = {
  neutral: 0x2563eb,
  hit: 0x22c55e,
  miss: 0xef4444,
};

export function makeWorkPlaneMesh(
  axis: PlaneAxis,
  position: number,
  size: number,
  drawing = false,
  hitVisual: PlaneHitVisual = 'neutral',
): THREE.Mesh {
  const geom = new THREE.PlaneGeometry(size, size, 1, 1);
  const mat = new THREE.MeshBasicMaterial({
    color: PLANE_COLORS[hitVisual],
    transparent: true,
    opacity: hitVisual === 'neutral' ? (drawing ? 0.22 : 0.1) : hitVisual === 'hit' ? 0.42 : 0.32,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.name = 'work-plane';
  mesh.renderOrder = 2;
  if (axis === 'xy') mesh.position.z = position;
  else if (axis === 'xz') {
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = position;
  } else {
    mesh.rotation.y = Math.PI / 2;
    mesh.position.x = position;
  }
  return mesh;
}