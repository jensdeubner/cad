import * as THREE from 'three';
import { disposeLine2, makeContourLine, planeNormal } from './drawing';
import { Line2 } from 'three/addons/lines/Line2.js';

import { projectToSketch2D, sketch2DToWorld, sketchPlaneFrame } from './sketch-geometry';
import type { Contour } from './types';
import type { PlaneAxis } from './types';

export const SKETCH_EDGE_HOVER_COLOR = '#00e8ff';
export const SKETCH_EDGE_HOVER_WIDTH = 14;
export const SKETCH_EDGE_PICK_PX = 16;
export const SKETCH_DIM_LABEL_PICK_PX = 28;

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
  contourId?: string;
  pointIndex0?: number;
  pointIndex1?: number;
}

export interface SketchEdgePick {
  contourId: string;
  pointIndex0: number;
  pointIndex1: number;
  a: THREE.Vector3;
  b: THREE.Vector3;
  kind: SketchDimensionKind;
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

export interface SketchDimensionDrawOptions {
  /** Override label (e.g. live value while placing). */
  labelText?: string;
  /** Highlight active placement / edit. */
  active?: boolean;
  resolution?: THREE.Vector2;
  camera?: THREE.Camera;
  viewportHeightPx?: number;
}

const DIM_COLOR = 0x1d4ed8;
const DIM_COLOR_ACTIVE = 0x2563eb;
const EXT_COLOR = 0x5b8fd6;

/** World-space height for a label that appears ~`pixelHeight` tall on screen. */
export function worldUnitsPerPixel(
  camera: THREE.Camera,
  worldPoint: THREE.Vector3,
  viewportHeightPx: number,
): number {
  if (!(camera instanceof THREE.PerspectiveCamera)) return 1;
  const dist = Math.max(camera.position.distanceTo(worldPoint), 0.001);
  const vFovRad = (camera.fov * Math.PI) / 180;
  const worldSpan = 2 * Math.tan(vFovRad / 2) * dist;
  return worldSpan / Math.max(viewportHeightPx, 1);
}

export function sketchDimLabelWorldHeight(
  camera: THREE.Camera,
  labelWorldPos: THREE.Vector3,
  viewportHeightPx: number,
  pixelHeight = 48,
): number {
  return worldUnitsPerPixel(camera, labelWorldPos, viewportHeightPx) * pixelHeight;
}

export function sketchDimArrowWorldSize(
  camera: THREE.Camera,
  worldPoint: THREE.Vector3,
  viewportHeightPx: number,
  pixelSize = 14,
): number {
  return worldUnitsPerPixel(camera, worldPoint, viewportHeightPx) * pixelSize;
}

function applyLabelSpriteScale(sprite: THREE.Sprite, worldHeight: number) {
  const aspect = 320 / 80;
  sprite.scale.set(worldHeight * aspect, worldHeight, 1);
}

export function updateSketchDimensionLabelScales(
  root: THREE.Object3D,
  camera: THREE.Camera,
  viewportHeightPx: number,
) {
  root.traverse((child) => {
    if (!(child instanceof THREE.Sprite) || !child.userData.sketchDimLabel) return;
    const anchor = child.userData.labelAnchor as THREE.Vector3 | undefined;
    const px = (child.userData.labelPixelHeight as number) ?? 48;
    const worldH = sketchDimLabelWorldHeight(camera, anchor ?? child.position, viewportHeightPx, px);
    applyLabelSpriteScale(child, worldH);
  });
}

function makeLabelSprite(text: string, worldHeight: number, active = false): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 80;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const pad = 10;
  ctx.font = '700 32px system-ui, sans-serif';
  const w = Math.min(ctx.measureText(text).width + pad * 2, canvas.width - 8);
  const x = (canvas.width - w) / 2;
  ctx.fillStyle = active ? 'rgba(255, 251, 235, 0.98)' : 'rgba(255,255,255,0.97)';
  ctx.fillRect(x, 14, w, 52);
  ctx.strokeStyle = active ? '#f59e0b' : '#2563eb';
  ctx.lineWidth = active ? 4 : 3;
  ctx.strokeRect(x + 1, 15, w - 2, 50);
  ctx.fillStyle = active ? '#b45309' : '#1e3a8a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, 40);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.name = 'sketch-dim-label';
  sprite.userData.sketchDimLabel = true;
  sprite.userData.labelPixelHeight = 48;
  applyLabelSpriteScale(sprite, worldHeight);
  sprite.renderOrder = 16;
  return sprite;
}

function addLine(
  group: THREE.Group,
  p0: THREE.Vector3,
  p1: THREE.Vector3,
  color = DIM_COLOR,
  opacity = 0.95,
  renderOrder = 14,
) {
  const geom = new THREE.BufferGeometry();
  geom.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([p0.x, p0.y, p0.z, p1.x, p1.y, p1.z], 3),
  );
  const line = new THREE.Line(
    geom,
    new THREE.LineBasicMaterial({
      color,
      depthWrite: false,
      transparent: true,
      opacity,
    }),
  );
  line.renderOrder = renderOrder;
  group.add(line);
}

function addDimLine2(
  group: THREE.Group,
  p0: THREE.Vector3,
  p1: THREE.Vector3,
  resolution: THREE.Vector2,
  color: string,
  width: number,
) {
  const line = makeContourLine([p0, p1], false, color, resolution, width);
  line.renderOrder = 15;
  group.add(line);
}

/** Fusion-style arrow ticks at dimension line ends. */
function addArrowHead(
  group: THREE.Group,
  tip: THREE.Vector3,
  toward: THREE.Vector3,
  size: number,
  color: number,
) {
  const dir = toward.clone().sub(tip);
  if (dir.lengthSq() < 1e-12) return;
  dir.normalize();
  const up = Math.abs(dir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const right = new THREE.Vector3().crossVectors(dir, up).normalize();
  const wing = size * 0.55;
  const p1 = tip.clone().add(dir.clone().multiplyScalar(size)).add(right.clone().multiplyScalar(wing));
  const p2 = tip.clone().add(dir.clone().multiplyScalar(size)).add(right.clone().multiplyScalar(-wing));
  addLine(group, tip, p1, color, 1, 15);
  addLine(group, tip, p2, color, 1, 15);
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

export function formatSketchDimInputLabel(
  raw: string,
  unit: SketchUnit,
  kind: SketchDimensionKind,
): string | null {
  const cleaned = raw.trim().replace(',', '.');
  if (!cleaned) return null;
  const prefix = kind === 'radius' ? 'R ' : kind === 'diameter' ? 'Ø ' : '';
  const suffix = unit === 'in' ? ' in' : ` ${unit}`;
  return `${prefix}${cleaned}${suffix}`;
}

export function buildSketchDimensionGroup(
  dim: SketchDimension,
  unit: SketchUnit,
  _labelScale: number,
  options: SketchDimensionDrawOptions = {},
): THREE.Group {
  const group = new THREE.Group();
  group.name = `sketch-dim:${dim.id}`;
  const frame = sketchPlaneFrame(dim.axis, dim.position);
  const normal = planeNormal(dim.axis);
  const lift = normal.clone().multiplyScalar(0.2);
  const active = options.active === true;
  const mainColor = active ? DIM_COLOR_ACTIVE : DIM_COLOR;
  const mainHex = `#${mainColor.toString(16).padStart(6, '0')}`;
  const camera = options.camera;
  const vh = options.viewportHeightPx ?? 800;
  const dimLineWidth = active ? 12 : 10;
  const extLineWidth = 5;

  const measured = sketchLengthMm(dim.a, dim.b);
  const label = options.labelText ?? formatSketchLength(measured, unit, dim.kind);

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

    const labelPos = aOff.clone().add(bOff).multiplyScalar(0.5);
    const arrowSize = camera
      ? sketchDimArrowWorldSize(camera, labelPos, vh)
      : Math.max(sketchLengthMm(aOff, bOff) * 0.08, 4);

    if (options.resolution) {
      addDimLine2(group, aLift, aOff, options.resolution, '#7aa8d8', extLineWidth);
      addDimLine2(group, bLift, bOff, options.resolution, '#7aa8d8', extLineWidth);
      addDimLine2(group, aOff, bOff, options.resolution, mainHex, dimLineWidth);
    } else {
      addLine(group, aLift, aOff, EXT_COLOR, 0.9, 13);
      addLine(group, bLift, bOff, EXT_COLOR, 0.9, 13);
      addLine(group, aOff, bOff, mainColor, 1, 15);
    }
    addArrowHead(group, aOff, bOff, arrowSize, mainColor);
    addArrowHead(group, bOff, aOff, arrowSize, mainColor);

    const labelH = camera ? sketchDimLabelWorldHeight(camera, labelPos, vh) : 8;
    const sprite = makeLabelSprite(label, labelH, active);
    sprite.position.copy(labelPos);
    sprite.userData.labelAnchor = labelPos.clone();
    group.add(sprite);
  } else {
    const center = dim.a.clone().add(lift);
    const rim = dim.b.clone().add(lift);
    const labelPos = center.clone().lerp(rim, 0.55);
    const arrowSize = camera
      ? sketchDimArrowWorldSize(camera, labelPos, vh)
      : Math.max(sketchLengthMm(center, rim) * 0.08, 4);

    if (options.resolution) {
      addDimLine2(group, center, rim, options.resolution, mainHex, dimLineWidth);
    } else {
      addLine(group, center, rim, mainColor, 1, 15);
    }
    addArrowHead(group, rim, center, arrowSize, mainColor);
    const labelH = camera ? sketchDimLabelWorldHeight(camera, labelPos, vh) : 8;
    const sprite = makeLabelSprite(label, labelH, active);
    sprite.position.copy(labelPos);
    sprite.userData.labelAnchor = labelPos.clone();
    group.add(sprite);
  }

  return group;
}

export function disposeSketchDimensionGroup(group: THREE.Object3D) {
  group.traverse((child) => {
    if (child instanceof Line2) {
      disposeLine2(child);
      return;
    }
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

/**
 * Re-anchor dimensions to their contour geometry after points moved (e.g. the
 * constraint solver shifted them). Linear dims follow their endpoint indices;
 * radius/diameter dims recompute centre + nearest rim. Dims without a resolvable
 * contour are returned unchanged. Returns a new array (cloned where updated).
 */
export function syncDimensionsToContours(
  dims: SketchDimension[],
  contours: Contour[],
): SketchDimension[] {
  const byId = new Map(contours.map((c) => [c.id, c]));
  return dims.map((d) => {
    if (!d.contourId) return d;
    const c = byId.get(d.contourId);
    if (!c) return d;
    if (d.kind === 'linear') {
      const i0 = d.pointIndex0 ?? 0;
      const i1 = d.pointIndex1 ?? 1;
      if (i0 < 0 || i1 < 0 || i0 >= c.points.length || i1 >= c.points.length) return d;
      return { ...d, a: c.points[i0].clone(), b: c.points[i1].clone() };
    }
    const circle = circleCenter2D(c);
    if (!circle) return d;
    let nearest = c.points[0];
    let nearestD = circle.center.distanceTo(c.points[0]);
    for (const p of c.points) {
      const pd = circle.center.distanceTo(p);
      if (pd < nearestD) {
        nearestD = pd;
        nearest = p;
      }
    }
    return { ...d, a: circle.center.clone(), b: nearest.clone() };
  });
}

export function sketchEdgeKey(
  edge: Pick<SketchEdgePick, 'contourId' | 'pointIndex0' | 'pointIndex1'>,
): string {
  return `${edge.contourId}:${edge.pointIndex0}:${edge.pointIndex1}`;
}

export function sketchEdgesEqual(a: SketchEdgePick | null, b: SketchEdgePick | null): boolean {
  if (!a || !b) return a === b;
  return sketchEdgeKey(a) === sketchEdgeKey(b);
}

function worldToClient(
  p: THREE.Vector3,
  dom: HTMLElement,
  camera: THREE.Camera,
): { x: number; y: number } {
  const v = p.clone().project(camera);
  const rect = dom.getBoundingClientRect();
  return {
    x: (v.x * 0.5 + 0.5) * rect.width + rect.left,
    y: (-v.y * 0.5 + 0.5) * rect.height + rect.top,
  };
}

function distScreenToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-12) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = THREE.MathUtils.clamp(t, 0, 1);
  const qx = ax + t * dx;
  const qy = ay + t * dy;
  return Math.hypot(px - qx, py - qy);
}

function distScreenSegment(
  clientX: number,
  clientY: number,
  a: THREE.Vector3,
  b: THREE.Vector3,
  dom: HTMLElement,
  camera: THREE.Camera,
): number {
  const sa = worldToClient(a, dom, camera);
  const sb = worldToClient(b, dom, camera);
  return distScreenToSegment(clientX, clientY, sa.x, sa.y, sb.x, sb.y);
}

export function circleCenter2D(
  contour: Contour,
): { center: THREE.Vector3; radiusMm: number } | null {
  if (!contour.closed || contour.points.length < 8) return null;
  const frame = sketchPlaneFrame(contour.axis, contour.position);
  let cu = 0;
  let cv = 0;
  for (const p of contour.points) {
    const [u, v] = projectToSketch2D(p, frame);
    cu += u;
    cv += v;
  }
  cu /= contour.points.length;
  cv /= contour.points.length;
  const radii = contour.points.map((p) => {
    const [u, v] = projectToSketch2D(p, frame);
    return Math.hypot(u - cu, v - cv);
  });
  const avgR = radii.reduce((sum, r) => sum + r, 0) / radii.length;
  if (avgR < 1e-6) return null;
  const maxDev = Math.max(...radii.map((r) => Math.abs(r - avgR)));
  if (maxDev / avgR > 0.1) return null;
  return { center: sketch2DToWorld(cu, cv, frame), radiusMm: avgR };
}

function segmentEndpoints(contour: Contour, segIndex: number): [number, number] {
  const n = contour.points.length;
  const i0 = segIndex;
  const i1 = contour.closed ? (segIndex + 1) % n : segIndex + 1;
  return [i0, i1];
}

function inferDimKindForContour(
  contour: Contour,
  preferred: SketchDimensionKind,
): SketchDimensionKind {
  if (circleCenter2D(contour) && preferred !== 'linear') return preferred;
  return 'linear';
}

function collectSketchEdgeCandidates(
  contours: Contour[],
  sketchId: string,
  preferredKind: SketchDimensionKind,
): SketchEdgePick[] {
  const out: SketchEdgePick[] = [];
  const sketchContours = contours.filter((c) => c.sketchId === sketchId && c.visible !== false);

  for (const c of sketchContours) {
    const circle = circleCenter2D(c);
    const n = c.points.length;
    const segCount = c.closed ? n : Math.max(0, n - 1);

    for (let si = 0; si < segCount; si++) {
      const [i0, i1] = segmentEndpoints(c, si);
      if (i1 >= n) continue;
      const a = c.points[i0];
      const b = c.points[i1];

      if (circle) {
        let nearest = c.points[0];
        let nearestD = circle.center.distanceTo(c.points[0]);
        for (const p of c.points) {
          const pd = circle.center.distanceTo(p);
          if (pd < nearestD) {
            nearestD = pd;
            nearest = p;
          }
        }
        out.push({
          contourId: c.id,
          pointIndex0: i0,
          pointIndex1: i1,
          a: circle.center.clone(),
          b: nearest.clone(),
          kind: inferDimKindForContour(c, preferredKind),
        });
        continue;
      }

      out.push({
        contourId: c.id,
        pointIndex0: i0,
        pointIndex1: i1,
        a: a.clone(),
        b: b.clone(),
        kind: 'linear',
      });
    }
  }
  return out;
}

/** Pick a sketch contour edge or circle for dimensioning (Fusion-style, screen-space). */
export function pickSketchEdge(
  contours: Contour[],
  sketchId: string,
  clientX: number,
  clientY: number,
  dom: HTMLElement,
  camera: THREE.Camera,
  _scanSize: number,
  preferredKind: SketchDimensionKind,
  pickPx = SKETCH_EDGE_PICK_PX,
): SketchEdgePick | null {
  let best: SketchEdgePick | null = null;
  let bestDist = pickPx;

  for (const edge of collectSketchEdgeCandidates(contours, sketchId, preferredKind)) {
    const d = distScreenSegment(clientX, clientY, edge.a, edge.b, dom, camera);
    if (d >= bestDist) continue;
    bestDist = d;
    best = edge;
  }

  return best;
}

export function sketchDimensionLabelWorld(dim: SketchDimension): THREE.Vector3 {
  const frame = sketchPlaneFrame(dim.axis, dim.position);
  const normal = planeNormal(dim.axis);
  const lift = normal.clone().multiplyScalar(0.15);

  if (dim.kind === 'linear') {
    const perp = sketchPerp2D(dim.axis, dim.position, dim.a, dim.b);
    const offU = perp.x * dim.offset;
    const offV = perp.y * dim.offset;
    const a2d = projectToSketch2D(dim.a, frame);
    const b2d = projectToSketch2D(dim.b, frame);
    const aOff = sketch2DToWorld(a2d[0] + offU, a2d[1] + offV, frame).add(lift);
    const bOff = sketch2DToWorld(b2d[0] + offU, b2d[1] + offV, frame).add(lift);
    return aOff.clone().add(bOff).multiplyScalar(0.5);
  }

  const center = dim.a.clone().add(lift);
  const rim = dim.b.clone().add(lift);
  return center.clone().lerp(rim, 0.55);
}

/** Pick an existing dimension label (double-click to edit). */
export function pickSketchDimension(
  dimensions: SketchDimension[],
  sketchId: string,
  clientX: number,
  clientY: number,
  dom: HTMLElement,
  camera: THREE.Camera,
  pickPx = SKETCH_DIM_LABEL_PICK_PX,
): SketchDimension | null {
  let best: SketchDimension | null = null;
  let bestDist = pickPx;
  for (const dim of dimensions) {
    if (dim.sketchId !== sketchId || dim.visible === false) continue;
    const label = sketchDimensionLabelWorld(dim);
    const s = worldToClient(label, dom, camera);
    const d = Math.hypot(clientX - s.x, clientY - s.y);
    if (d >= bestDist) continue;
    bestDist = d;
    best = dim;
  }
  return best;
}

export function buildSketchEdgeHighlight(
  edge: SketchEdgePick,
  axis: PlaneAxis,
  position: number,
  resolution: THREE.Vector2,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'sketch-edge-hover';
  const frame = sketchPlaneFrame(axis, position);
  const normal = planeNormal(axis);
  const lift = normal.clone().multiplyScalar(0.2);

  const a = edge.a.clone().add(lift);
  const b = edge.b.clone().add(lift);
  const line = makeContourLine([a, b], false, SKETCH_EDGE_HOVER_COLOR, resolution, SKETCH_EDGE_HOVER_WIDTH);
  line.renderOrder = 14;
  group.add(line);

  const dotR = Math.max(a.distanceTo(b) * 0.045, 1.2);
  for (const p of [a, b]) {
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(dotR, 10, 10),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(SKETCH_EDGE_HOVER_COLOR).getHex(),
        depthWrite: false,
        transparent: true,
        opacity: 0.95,
      }),
    );
    dot.position.copy(p);
    dot.renderOrder = 15;
    group.add(dot);
  }

  if (edge.kind !== 'linear') {
    const ringVerts: number[] = [];
    const [cu, cv] = projectToSketch2D(edge.a, frame);
    const [ru, rv] = projectToSketch2D(edge.b, frame);
    const r = Math.hypot(ru - cu, rv - cv);
    const segments = 48;
    for (let i = 0; i <= segments; i++) {
      const t = (i / segments) * Math.PI * 2;
      const p = sketch2DToWorld(cu + r * Math.cos(t), cv + r * Math.sin(t), frame).add(lift);
      ringVerts.push(p.x, p.y, p.z);
    }
    const ringGeom = new THREE.BufferGeometry();
    ringGeom.setAttribute('position', new THREE.Float32BufferAttribute(ringVerts, 3));
    const ring = new THREE.Line(
      ringGeom,
      new THREE.LineBasicMaterial({
        color: new THREE.Color(SKETCH_EDGE_HOVER_COLOR).getHex(),
        depthWrite: false,
        transparent: true,
        opacity: 0.85,
      }),
    );
    ring.renderOrder = 13;
    group.add(ring);
  }

  return group;
}

export function disposeSketchEdgeHighlight(group: THREE.Object3D) {
  group.traverse((child) => {
    if (child instanceof Line2) {
      disposeLine2(child);
      return;
    }
    if (child instanceof THREE.Line) {
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
      return;
    }
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
    }
  });
}

export function parseUserDimensionValue(text: string, unit: SketchUnit): number | null {
  const cleaned = text.trim().replace(',', '.');
  if (!cleaned) return null;
  const v = parseFloat(cleaned);
  if (!isFinite(v) || v <= 0) return null;
  const factor = unit === 'mm' ? 1 : unit === 'cm' ? 10 : unit === 'm' ? 1000 : 25.4;
  return v * factor;
}

/** Apply a driven dimension value to sketch geometry (returns true if geometry changed). */
export function applyDimensionValueToContour(
  contour: Contour,
  pick: Pick<SketchEdgePick, 'pointIndex0' | 'pointIndex1' | 'a' | 'b' | 'kind'>,
  targetDisplayMm: number,
): boolean {
  const targetMeasured = measuredMmForDisplay(targetDisplayMm, pick.kind);

  if (pick.kind === 'linear') {
    const i0 = pick.pointIndex0;
    const i1 = pick.pointIndex1;
    if (i1 >= contour.points.length) return false;
    const a = contour.points[i0];
    const b = contour.points[i1];
    const len = a.distanceTo(b);
    if (len < 1e-6) return false;
    const dir = b.clone().sub(a).normalize();
    contour.points[i1].copy(a.clone().add(dir.multiplyScalar(targetMeasured)));
    return true;
  }

  const circle = circleCenter2D(contour);
  if (!circle) return false;
  // measuredMmForDisplay() already converts a typed diameter to its radius,
  // so targetMeasured is the radius for both 'radius' and 'diameter' picks.
  const targetRadius = targetMeasured;
  if (targetRadius < 1e-6) return false;
  const frame = sketchPlaneFrame(contour.axis, contour.position);
  const [cu, cv] = projectToSketch2D(circle.center, frame);
  const scale = targetRadius / circle.radiusMm;
  for (let i = 0; i < contour.points.length; i++) {
    const [u, v] = projectToSketch2D(contour.points[i], frame);
    const du = u - cu;
    const dv = v - cv;
    contour.points[i] = sketch2DToWorld(cu + du * scale, cv + dv * scale, frame);
  }
  return true;
}