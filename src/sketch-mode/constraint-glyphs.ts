/**
 * Visual glyphs for sketch constraints (#11) — small pixel-sized badges drawn
 * near the constrained geometry (Fusion-style): H / V / ∥ / ⊥ / coincident /
 * fix / distance. Pure position math (`computeGlyphAnchors`) is separated from
 * the three.js builder so it can be unit-tested without a renderer.
 */
import * as THREE from 'three';
import type { Contour, PlaneAxis } from '../types';
import type { SketchConstraint, SketchConstraintKind } from '../sketch/sketch-constraints';
import { requiredPointCount } from '../sketch/sketch-constraints';
import { projectToSketch2D, sketch2DToWorld, sketchPlaneFrame } from '../sketch-geometry';
import { worldUnitsPerPixel } from '../sketch-dimension';

export const GLYPH_PIXEL_SIZE = 24;
const GLYPH_COLOR = '#f59e0b';
const GLYPH_COLOR_SELECTED = '#22d3ee';

/** Fixed badge label per kind; `distance` shows its value instead. */
const GLYPH_LABEL: Record<SketchConstraintKind, string> = {
  coincident: '⊙',
  horizontal: 'H',
  vertical: 'V',
  parallel: '∥',
  perpendicular: '⊥',
  distance: '',
  fix: '⚓',
};

export interface GlyphAnchor {
  constraintId: string;
  kind: SketchConstraintKind;
  position: THREE.Vector3;
  label: string;
}

function formatDistance(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * Compute one world-space badge anchor per constraint that fully resolves
 * against the given contours. Constraints whose refs are missing/out-of-range
 * are skipped (no glyph). Positions are lifted slightly off the sketch plane.
 */
export function computeGlyphAnchors(
  constraints: SketchConstraint[],
  contours: Contour[],
  axis: PlaneAxis,
  position: number,
): GlyphAnchor[] {
  const byId = new Map(contours.map((c) => [c.id, c]));
  const frame = sketchPlaneFrame(axis, position);
  const lift = frame.normal.clone().multiplyScalar(0.35);

  const resolve = (cId: string, idx: number): THREE.Vector3 | null => {
    const c = byId.get(cId);
    if (!c || idx < 0 || idx >= c.points.length) return null;
    return c.points[idx];
  };

  const out: GlyphAnchor[] = [];
  for (const sc of constraints) {
    const need = requiredPointCount(sc.kind);
    if (sc.refs.length < need) continue;
    const pts: THREE.Vector3[] = [];
    let ok = true;
    for (let i = 0; i < need; i++) {
      const p = resolve(sc.refs[i].contourId, sc.refs[i].pointIndex);
      if (!p) {
        ok = false;
        break;
      }
      pts.push(p);
    }
    if (!ok) continue;

    const center = new THREE.Vector3();
    for (const p of pts) center.add(p);
    center.multiplyScalar(1 / pts.length).add(lift);

    const label = sc.kind === 'distance' ? formatDistance(sc.value ?? 0) : GLYPH_LABEL[sc.kind];
    out.push({ constraintId: sc.id, kind: sc.kind, position: center, label });
  }
  // Nudge overlapping badges (same resolved center) apart along the plane tangent.
  spreadColocated(out, frame);
  return out;
}

/** Offset badges that landed on the same point so they don't fully overlap. */
function spreadColocated(anchors: GlyphAnchor[], frame: ReturnType<typeof sketchPlaneFrame>): void {
  const seen = new Map<string, number>();
  for (const a of anchors) {
    const [u, v] = projectToSketch2D(a.position, frame);
    const key = `${Math.round(u * 100)}:${Math.round(v * 100)}`;
    const n = seen.get(key) ?? 0;
    if (n > 0) {
      // shift along tangent by an increasing amount (world units; sprites are
      // pixel-scaled so this only needs to break exact overlap)
      a.position.add(frame.tangent.clone().multiplyScalar(n * 1.2));
    }
    seen.set(key, n + 1);
  }
}

function makeBadgeSprite(text: string, worldHeight: number, selected: boolean): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 64, 64);
  const color = selected ? GLYPH_COLOR_SELECTED : GLYPH_COLOR;
  ctx.fillStyle = 'rgba(17,24,39,0.92)';
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  const r = 14;
  // rounded square
  ctx.beginPath();
  ctx.moveTo(8 + r, 8);
  ctx.arcTo(56, 8, 56, 56, r);
  ctx.arcTo(56, 56, 8, 56, r);
  ctx.arcTo(8, 56, 8, 8, r);
  ctx.arcTo(8, 8, 56, 8, r);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = '700 30px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 32, 34);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(worldHeight, worldHeight, 1);
  sprite.renderOrder = 20;
  return sprite;
}

/** Build a group of constraint badge sprites, sized to ~GLYPH_PIXEL_SIZE px. */
export function buildConstraintGlyphGroup(
  anchors: GlyphAnchor[],
  camera: THREE.Camera,
  viewportHeightPx: number,
  selectedId: string | null = null,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'sketch-constraint-glyphs';
  for (const a of anchors) {
    const worldH = worldUnitsPerPixel(camera, a.position, viewportHeightPx) * GLYPH_PIXEL_SIZE;
    const sprite = makeBadgeSprite(a.label, worldH, a.constraintId === selectedId);
    sprite.position.copy(a.position);
    sprite.userData.constraintGlyph = true;
    sprite.userData.constraintId = a.constraintId;
    sprite.userData.anchor = a.position.clone();
    group.add(sprite);
  }
  group.visible = anchors.length > 0;
  return group;
}

export function updateConstraintGlyphScales(
  group: THREE.Object3D,
  camera: THREE.Camera,
  viewportHeightPx: number,
): void {
  group.traverse((child) => {
    if (!(child instanceof THREE.Sprite) || !child.userData.constraintGlyph) return;
    const anchor = (child.userData.anchor as THREE.Vector3 | undefined) ?? child.position;
    const worldH = worldUnitsPerPixel(camera, anchor, viewportHeightPx) * GLYPH_PIXEL_SIZE;
    child.scale.set(worldH, worldH, 1);
  });
}

export function disposeConstraintGlyphGroup(group: THREE.Object3D): void {
  group.traverse((child) => {
    if (child instanceof THREE.Sprite) {
      const mat = child.material as THREE.SpriteMaterial;
      mat.map?.dispose();
      mat.dispose();
    }
  });
}

/** Nearest constraint glyph to a screen point, within `pickPx`. */
export function pickConstraintGlyphAt(
  anchors: GlyphAnchor[],
  clientX: number,
  clientY: number,
  dom: HTMLElement,
  camera: THREE.Camera,
  pickPx = 22,
): string | null {
  const rect = dom.getBoundingClientRect();
  let best: string | null = null;
  let bestDist = pickPx;
  for (const a of anchors) {
    const v = a.position.clone().project(camera);
    const sx = (v.x * 0.5 + 0.5) * rect.width + rect.left;
    const sy = (-v.y * 0.5 + 0.5) * rect.height + rect.top;
    const d = Math.hypot(clientX - sx, clientY - sy);
    if (d >= bestDist) continue;
    bestDist = d;
    best = a.constraintId;
  }
  return best;
}
