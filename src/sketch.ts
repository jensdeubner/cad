import * as THREE from 'three';
import { sketch2DToWorld, sketchPlaneFrame } from './sketch-geometry';
import type { PlaneAxis } from './types';

export const SKETCH_GRID_COLOR = 0x6b7c9e;
export const SKETCH_ORIGIN_COLOR = 0xe53935;

export interface Sketch {
  id: string;
  componentId: string;
  label: string;
  axis: PlaneAxis;
  position: number;
  visible: boolean;
}

export const ORIGIN_PLANE_COLORS: Record<PlaneAxis, number> = {
  xy: 0xffd966,
  xz: 0x6ee7b7,
  yz: 0xf9a8d4,
};

export const ORIGIN_PLANE_NAMES: Record<PlaneAxis, string> = {
  xy: 'origin-plane-xy',
  xz: 'origin-plane-xz',
  yz: 'origin-plane-yz',
};

export const EMPTY_PROJECT_VIEW_SIZE = 200;

export function sketchLabelForAxis(axis: PlaneAxis, index = 0): string {
  const base = axis.toUpperCase();
  return index > 0 ? `Skizze ${base} ${index + 1}` : `Skizze ${base}`;
}

export function parseOriginPlaneName(name: string): PlaneAxis | null {
  if (name === 'origin-plane-xy' || name === 'origin-plane-group-xy') return 'xy';
  if (name === 'origin-plane-xz' || name === 'origin-plane-group-xz') return 'xz';
  if (name === 'origin-plane-yz' || name === 'origin-plane-group-yz') return 'yz';
  return null;
}

export function originPlaneAxisFromObject(obj: THREE.Object3D): PlaneAxis | null {
  let cur: THREE.Object3D | null = obj;
  while (cur) {
    const axis = parseOriginPlaneName(cur.name);
    if (axis) return axis;
    cur = cur.parent;
  }
  return null;
}

function makeOriginPlaneLabel(axis: PlaneAxis, size: number): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 80;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = '700 40px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const hex = `#${ORIGIN_PLANE_COLORS[axis].toString(16).padStart(6, '0')}`;
  ctx.strokeStyle = hex;
  ctx.lineWidth = 4;
  ctx.strokeText(axis.toUpperCase(), 80, 40);
  ctx.fillStyle = '#1e293b';
  ctx.fillText(axis.toUpperCase(), 80, 40);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.name = `origin-plane-label-${axis}`;
  sprite.renderOrder = 6;
  const labelScale = size * 0.3;
  sprite.scale.set(labelScale, labelScale * 0.48, 1);
  return sprite;
}

export function makeOriginPlaneMesh(axis: PlaneAxis, size: number): THREE.Mesh {
  const geom = new THREE.PlaneGeometry(size, size, 1, 1);
  const mat = new THREE.MeshBasicMaterial({
    color: ORIGIN_PLANE_COLORS[axis],
    transparent: true,
    opacity: 0.28,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.name = ORIGIN_PLANE_NAMES[axis];
  mesh.renderOrder = 4;
  if (axis === 'xy') {
    mesh.position.set(0, 0, 0);
  } else if (axis === 'xz') {
    mesh.rotation.x = -Math.PI / 2;
  } else {
    mesh.rotation.y = Math.PI / 2;
  }
  return mesh;
}

/** Fusion-Style: Ebene + Beschriftung als anklickbare Gruppe. */
export function makeOriginPlaneGroup(axis: PlaneAxis, size: number): THREE.Group {
  const group = new THREE.Group();
  group.name = `origin-plane-group-${axis}`;
  const mesh = makeOriginPlaneMesh(axis, size);
  group.add(mesh);
  const label = makeOriginPlaneLabel(axis, size);
  label.position.set(0, 0, 0.4);
  group.add(label);
  return group;
}

/** Fusion-nahe Kachelgröße für XY/XZ/YZ im Skizzen-Start (kompakt um den Ursprung). */
export const ORIGIN_PLANE_SCENE_FACTOR = 0.34;
export const ORIGIN_PLANE_MIN = 52;
export const ORIGIN_PLANE_MAX = 96;

export function originPlaneSize(sceneSize: number): number {
  const scaled = sceneSize * ORIGIN_PLANE_SCENE_FACTOR;
  return Math.min(Math.max(scaled, ORIGIN_PLANE_MIN), ORIGIN_PLANE_MAX);
}

/** Arbeitsraster in der aktiven Skizze — größer als die Ebenen-Kacheln. */
export function sketchGridExtent(sceneSize: number): number {
  return Math.max(sceneSize * 0.45, originPlaneSize(sceneSize) * 0.85);
}

export function viewPresetForSketchAxis(axis: PlaneAxis): 'top' | 'front' | 'side' {
  if (axis === 'xy') return 'top';
  if (axis === 'xz') return 'front';
  return 'side';
}

export function makeSketchGrid(
  axis: PlaneAxis,
  position: number,
  extent: number,
  spacing: number,
): THREE.LineSegments {
  const frame = sketchPlaneFrame(axis, position);
  const verts: number[] = [];
  const count = Math.ceil(extent / spacing);

  for (let i = -count; i <= count; i++) {
    const o = i * spacing;
    const u0 = sketch2DToWorld(-extent, o, frame);
    const u1 = sketch2DToWorld(extent, o, frame);
    verts.push(u0.x, u0.y, u0.z, u1.x, u1.y, u1.z);

    const v0 = sketch2DToWorld(o, -extent, frame);
    const v1 = sketch2DToWorld(o, extent, frame);
    verts.push(v0.x, v0.y, v0.z, v1.x, v1.y, v1.z);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  const mat = new THREE.LineBasicMaterial({
    color: SKETCH_GRID_COLOR,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
  });
  const grid = new THREE.LineSegments(geom, mat);
  grid.name = 'sketch-grid-lines';
  grid.renderOrder = 3;
  return grid;
}

export function makeSketchOriginMarker(
  axis: PlaneAxis,
  position: number,
  spacing: number,
): THREE.Group {
  const frame = sketchPlaneFrame(axis, position);
  const group = new THREE.Group();
  group.name = 'sketch-origin';

  const arm = Math.max(spacing * 2.5, 8);
  const dotR = Math.max(spacing * 0.35, 1.2);
  const crossVerts: number[] = [];

  const hx0 = sketch2DToWorld(-arm, 0, frame);
  const hx1 = sketch2DToWorld(arm, 0, frame);
  const hy0 = sketch2DToWorld(0, -arm, frame);
  const hy1 = sketch2DToWorld(0, arm, frame);
  crossVerts.push(hx0.x, hx0.y, hx0.z, hx1.x, hx1.y, hx1.z);
  crossVerts.push(hy0.x, hy0.y, hy0.z, hy1.x, hy1.y, hy1.z);

  const crossGeom = new THREE.BufferGeometry();
  crossGeom.setAttribute('position', new THREE.Float32BufferAttribute(crossVerts, 3));
  const cross = new THREE.LineSegments(
    crossGeom,
    new THREE.LineBasicMaterial({
      color: SKETCH_ORIGIN_COLOR,
      depthWrite: false,
      transparent: true,
      opacity: 0.9,
    }),
  );
  cross.renderOrder = 5;
  group.add(cross);

  const ringVerts: number[] = [];
  const segments = 24;
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    const p = sketch2DToWorld(dotR * Math.cos(t), dotR * Math.sin(t), frame);
    ringVerts.push(p.x, p.y, p.z);
  }
  const ringGeom = new THREE.BufferGeometry();
  ringGeom.setAttribute('position', new THREE.Float32BufferAttribute(ringVerts, 3));
  const ring = new THREE.Line(
    ringGeom,
    new THREE.LineBasicMaterial({
      color: SKETCH_ORIGIN_COLOR,
      depthWrite: false,
    }),
  );
  ring.renderOrder = 5;
  group.add(ring);

  const dotGeom = new THREE.SphereGeometry(dotR * 0.55, 10, 10);
  const dot = new THREE.Mesh(
    dotGeom,
    new THREE.MeshBasicMaterial({
      color: SKETCH_ORIGIN_COLOR,
      depthWrite: false,
      transparent: true,
      opacity: 0.85,
    }),
  );
  dot.name = 'sketch-origin-dot';
  dot.userData.sketchOriginPick = true;
  dot.position.copy(frame.origin);
  dot.renderOrder = 5;
  group.add(dot);

  group.userData.baseDotScale = dot.scale.x;
  group.userData.baseDotOpacity = (dot.material as THREE.MeshBasicMaterial).opacity;

  return group;
}

const SKETCH_ORIGIN_HIGHLIGHT = 0xffeb3b;

/** Fusion-style feedback when cursor snaps to sketch center. */
export function setSketchOriginMarkerHighlighted(group: THREE.Object3D | null, on: boolean) {
  if (!group || group.name !== 'sketch-origin') return;
  const dot = group.getObjectByName('sketch-origin-dot') as THREE.Mesh | undefined;
  if (!dot) return;
  const mat = dot.material as THREE.MeshBasicMaterial;
  const baseScale = (group.userData.baseDotScale as number) ?? 1;
  const baseOpacity = (group.userData.baseDotOpacity as number) ?? 0.85;
  mat.color.setHex(on ? SKETCH_ORIGIN_HIGHLIGHT : SKETCH_ORIGIN_COLOR);
  mat.opacity = on ? 1 : baseOpacity;
  dot.scale.setScalar(on ? baseScale * 1.45 : baseScale);
  for (const child of group.children) {
    if (!(child instanceof THREE.Line || child instanceof THREE.LineSegments)) continue;
    const lineMat = child.material as THREE.LineBasicMaterial;
    lineMat.color.setHex(on ? SKETCH_ORIGIN_HIGHLIGHT : SKETCH_ORIGIN_COLOR);
    lineMat.opacity = on ? 1 : child.name === 'sketch-origin' ? 0.9 : 1;
  }
}