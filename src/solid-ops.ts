import * as THREE from 'three';
import { contourInWorldSpace, isContourAttached } from './contour-body';
import { contourHas3dDeviation, loftPoints } from './contour-spline';
import type { LoftContourPayload } from './solid-features';
import type { Contour, PlaneAxis } from './types';

export function pickClosedProfileContour(
  contours: Contour[],
  activeSketchId: string | null,
): Contour | undefined {
  const closed = contours.filter((c) => c.closed && c.points.length >= 3);
  if (activeSketchId) {
    const inSketch = closed.filter((c) => c.sketchId === activeSketchId);
    if (inSketch.length) return inSketch[inSketch.length - 1];
  }
  return closed.length ? closed[closed.length - 1] : undefined;
}

export function contourLoftPayload(
  contour: Contour,
  worldMatrix: THREE.Matrix4,
): LoftContourPayload {
  const world = contourInWorldSpace(contour, worldMatrix);
  const useFull3d = isContourAttached(contour) || contourHas3dDeviation(contour);
  return {
    axis: world.axis,
    position: world.position,
    points: loftPoints(world, useFull3d),
    closed: world.closed,
    full_3d: useFull3d,
  };
}

export function revolutionAxisForPlane(axis: PlaneAxis): 'x' | 'y' | 'z' {
  if (axis === 'xy') return 'z';
  if (axis === 'xz') return 'y';
  return 'x';
}

export function parsePromptFloat(
  text: string,
  fallback: number,
): number | null {
  const raw = window.prompt(text, String(fallback));
  if (raw === null) return null;
  const v = parseFloat(raw.replace(',', '.'));
  if (!Number.isFinite(v)) return null;
  return v;
}

export function parsePromptInt(text: string, fallback: number): number | null {
  const raw = window.prompt(text, String(fallback));
  if (raw === null) return null;
  const v = parseInt(raw, 10);
  if (!Number.isFinite(v) || v < 1) return null;
  return v;
}

export function parseMirrorAxis(text: string, fallback: 'x' | 'y' | 'z' = 'x'): 'x' | 'y' | 'z' | null {
  const raw = window.prompt(text, fallback.toUpperCase());
  if (raw === null) return null;
  const a = raw.trim().toLowerCase();
  if (a === 'x' || a === 'y' || a === 'z') return a;
  return null;
}