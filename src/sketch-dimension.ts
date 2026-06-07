import * as THREE from 'three';
import { planeNormal } from './drawing';
import { projectToSketch2D, sketch2DToWorld, sketchPlaneFrame } from './sketch-geometry';
import type { PlaneAxis } from './types';

export type SketchUnit = 'mm' | 'cm' | 'm' | 'in';
export type SketchDimensionKind = 'linear' | 'radius' | 'diameter';

export interface SketchDimension {
  id: string;
  sketchId: string;
  kind: SketchDimensionKind;
  axis: PlaneAxis;
  position: number;
  a: THREE.Vector3;
  b: THREE.Vector3;
  /** Senkrechter Abstand der Bemaßungslinie in mm (Skizzenebene). */
  offset: number;
  visible: boolean;
}

export const SKETCH_UNIT_LABELS: Record<SketchUnit, string> = {
  mm: 'Millimeter (mm)',
  cm: 'Zentimeter (cm)',
  m: 'Meter (m)',
  in: 'Zoll (in)',
};

export function sketchLengthMm(a: THREE.Vector3, b: THREE.Vector3): number {
  return a.distanceTo(b);
}

export function formatSketchLength(mm: number, unit: SketchUnit, kind: SketchDimensionKind): string {
  const value = dimensionDisplayMm(mm, kind);
  const n = unit === 'mm' ? 1 : unit === 'cm' ? 10 : unit === 'm' ? 1000 : 25.4;
  const v = value / n;
  const decimals = unit === 'm' ? 3 : unit === 'cm' ? 2 : 1;
  const prefix = kind === 'radius' ? 'R ' : kind === 'diameter' ? 'Ø ' : '';
  const suffix = unit === 'in' ? ' in' : ` ${unit}`;
  return `${prefix}${v.toFixed(decimals)}${suffix}`;
}

export function dimensionDisplayMm(measuredMm: number, kind: SketchDimensionKind): number {
  if (kind === 'diameter') return measuredMm * 2;
  return measuredMm;
}

export function measuredMmForDisplay(displayMm: number, kind: SketchDimensionKind): number {
  if (kind === 'diameter') return displayMm / 2;
  return displayMm;
}

function makeLabelSprite(text: string, scale: number): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = 3;
  const pad = 8;
  ctx.font = '600 28px system-ui, sans-serif';
  const w = ctx.measureText(text).width + pad * 2;
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.fillRect((canvas.width - w) / 2, 10, w, 44);
  ctx.strokeRect((canvas.width - w) / 2 + 1, 11, w - 2, 42);
  ctx.fillStyle = '#1e3a8a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, 32);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(scale * 1.8, scale * 0.45, 1);
  sprite.renderOrder = 12;
  return sprite;
}

function addLine(
  group: THREE.Group,
  p0: THREE.Vector3,
  p1: THREE.Vector3,
  color = 0x2563eb,
) {
  const geom = new THREE.BufferGeometry();
  geom.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([p0.x, p0.y, p0.z, p1.x, p1.y, p1.z], 3),
  );
  const line = new THREE.Line(
    geom,
    new THREE.LineBasicMaterial({ color, depthWrite: false, transparent: true, opacity: 0.95 }),
  );
  line.renderOrder = 11;
  group.add(line);
}

function sketchPerp2D(
  axis: PlaneAxis,
  position: number,
  a: THREE.Vector3,
  b: THREE.Vector3,
): THREE.Vector2 {
  const frame = sketchPlaneFrame(axis, position);
  const [au, av] = projectToSketch2D(a, frame);
  const [bu, bv] = projectToSketch2D(b, frame);
  const du = bu - au;
  const dv = bv - av;
  const len = Math.hypot(du, dv) || 1;
  return new THREE.Vector2(-dv / len, du / len);
}

export function offsetFromPick(
  axis: PlaneAxis,
  position: number,
  a: THREE.Vector3,
  b: THREE.Vector3,
  pick: THREE.Vector3,
): number {
  const frame = sketchPlaneFrame(axis, position);
  const perp = sketchPerp2D(axis, position, a, b);
  const midU = (projectToSketch2D(a, frame)[0] + projectToSketch2D(b, frame)[0]) * 0.5;
  const midV = (projectToSketch2D(a, frame)[1] + projectToSketch2D(b, frame)[1]) * 0.5;
  const [pu, pv] = projectToSketch2D(pick, frame);
  return (pu - midU) * perp.x + (pv - midV) * perp.y;
}

export function buildSketchDimensionGroup(
  dim: SketchDimension,
  unit: SketchUnit,
  labelScale: number,
): THREE.Group {
  const group = new THREE.Group();
  group.name = `sketch-dim:${dim.id}`;
  const frame = sketchPlaneFrame(dim.axis, dim.position);
  const normal = planeNormal(dim.axis);
  const lift = normal.clone().multiplyScalar(0.15);

  const measured = sketchLengthMm(dim.a, dim.b);
  const label = formatSketchLength(measured, unit, dim.kind);

  if (dim.kind === 'linear') {
    const perp = sketchPerp2D(dim.axis, dim.position, dim.a, dim.b);
    const offU = perp.x * dim.offset;
    const offV = perp.y * dim.offset;

    const a2d = projectToSketch2D(dim.a, frame);
    const b2d = projectToSketch2D(dim.b, frame);
    const aOff = sketch2DToWorld(a2d[0] + offU, a2d[1] + offV, frame).add(lift);
    const bOff = sketch2DToWorld(b2d[0] + offU, b2d[1] + offV, frame).add(lift);
    const aLift = dim.a.clone().add(lift);
    const bLift = dim.b.clone().add(lift);

    addLine(group, aLift, aOff);
    addLine(group, bLift, bOff);
    addLine(group, aOff, bOff, 0x1d4ed8);

    const sprite = makeLabelSprite(label, labelScale);
    sprite.position.copy(aOff.clone().add(bOff).multiplyScalar(0.5));
    group.add(sprite);
  } else {
    const center = dim.a.clone().add(lift);
    const rim = dim.b.clone().add(lift);
    addLine(group, center, rim, 0x1d4ed8);
    const sprite = makeLabelSprite(label, labelScale);
    sprite.position.copy(center.clone().lerp(rim, 0.55));
    group.add(sprite);
  }

  return group;
}

export function disposeSketchDimensionGroup(group: THREE.Object3D) {
  group.traverse((child) => {
    if (child instanceof THREE.Sprite) {
      const mat = child.material as THREE.SpriteMaterial;
      mat.map?.dispose();
      mat.dispose();
      return;
    }
    if (child instanceof THREE.Line) {
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
    }
  });
}

export function cloneSketchDimension(d: SketchDimension): SketchDimension {
  return {
    ...d,
    a: d.a.clone(),
    b: d.b.clone(),
  };
}