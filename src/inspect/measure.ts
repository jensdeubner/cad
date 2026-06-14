/**
 * 3D measurement tool — point-to-point distance + quick body measure.
 *
 * Pure helpers (`distance`, `bboxDiagonal`) plus a stateful controller factory
 * (`createMeasureController`) built on the `FeatureHost`. The controller attaches
 * pointer listeners to `host.viewport` on demand, uses `host.pickBodySurfaceAt`
 * to collect TWO surface points, draws a line + endpoint markers into
 * `host.overlay`, and reports the world-space distance.
 *
 * `quickMeasure` needs no interaction: it measures the active body's world-space
 * bounding-box diagonal, draws it into `host.overlay`, and returns the numbers.
 */
import type { FeatureHost } from '../features/host';
import type * as THREE from 'three';

const OVERLAY_NAME = 'inspect-measure-overlay';

/** Euclidean distance between two points (mm world units). */
export function distance(a: THREE.Vector3, b: THREE.Vector3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Space diagonal length of an axis-aligned box. Empty box → 0. */
export function bboxDiagonal(box: THREE.Box3): number {
  if (box.isEmpty()) return 0;
  const dx = box.max.x - box.min.x;
  const dy = box.max.y - box.min.y;
  const dz = box.max.z - box.min.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export interface QuickMeasureResult {
  /** Space-diagonal length of the active body's world bbox (mm). */
  diagonal: number;
  /** World-space bounding box {min:[x,y,z], max:[x,y,z]}. */
  bbox: { min: [number, number, number]; max: [number, number, number] };
}

export interface MeasureController {
  /** Arm interactive two-point picking (idempotent). */
  arm(): void;
  /** Disarm picking and clear any in-progress markers (idempotent). */
  disarm(): void;
  /** Whether the controller is currently listening for picks. */
  isArmed(): boolean;
  /** Last completed point-to-point distance, or null. */
  getDistance(): number | null;
  /** Remove every overlay object this controller created. */
  clearOverlay(): void;
}

/** Compute the active body's world-space bounding box (empty if no geometry). */
function activeBodyWorldBox(host: FeatureHost): THREE.Box3 {
  const THREE = host.THREE;
  const box = new THREE.Box3();
  const body = host.getActiveBody();
  const geom = body?.geometry ?? null;
  if (!body || !geom) return box; // empty
  if (!geom.boundingBox) geom.computeBoundingBox();
  const local = geom.boundingBox;
  if (!local) return box;
  body.meshGroup.updateMatrixWorld(true);
  box.copy(local).applyMatrix4(body.meshGroup.matrixWorld);
  return box;
}

/** A small sphere marker added to the overlay at a world point. */
function makeMarker(host: FeatureHost, p: THREE.Vector3, color: number): THREE.Mesh {
  const THREE = host.THREE;
  const r = Math.max(host.cadScene.bounds.getSize(new THREE.Vector3()).length() * 0.012, 0.4);
  const geom = new THREE.SphereGeometry(r, 16, 12);
  const mat = new THREE.MeshBasicMaterial({ color, depthTest: false, clippingPlanes: [] });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.name = OVERLAY_NAME;
  mesh.position.copy(p);
  mesh.renderOrder = 1000;
  return mesh;
}

/** A line segment between two world points added to the overlay. */
function makeLine(host: FeatureHost, a: THREE.Vector3, b: THREE.Vector3, color: number): THREE.Line {
  const THREE = host.THREE;
  const geom = new THREE.BufferGeometry().setFromPoints([a.clone(), b.clone()]);
  const mat = new THREE.LineBasicMaterial({ color, depthTest: false, clippingPlanes: [] });
  const line = new THREE.Line(geom, mat);
  line.name = OVERLAY_NAME;
  line.renderOrder = 1000;
  return line;
}

/**
 * Quick-measure the active body's world-space bbox diagonal. Draws the diagonal
 * line + endpoint markers into `host.overlay`. Returns the diagonal + bbox.
 */
export function quickMeasure(host: FeatureHost): QuickMeasureResult {
  const box = activeBodyWorldBox(host);
  const diagonal = bboxDiagonal(box);
  const bbox = {
    min: [box.min.x, box.min.y, box.min.z] as [number, number, number],
    max: [box.max.x, box.max.y, box.max.z] as [number, number, number],
  };

  if (!box.isEmpty()) {
    const a = box.min.clone();
    const b = box.max.clone();
    host.overlay.add(makeLine(host, a, b, 0xffd400));
    host.overlay.add(makeMarker(host, a, 0xff44ff));
    host.overlay.add(makeMarker(host, b, 0x00e676));
  }

  return { diagonal, bbox };
}

/** Remove every overlay object tagged by this measure module. */
function clearMeasureOverlay(host: FeatureHost): void {
  const stale = host.overlay.children.filter((c) => c.name === OVERLAY_NAME);
  for (const obj of stale) {
    host.overlay.remove(obj);
    const m = obj as THREE.Mesh;
    m.geometry?.dispose?.();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else mat?.dispose?.();
  }
}

/**
 * Create a stateful two-point measurement controller bound to a feature host.
 * `arm()` attaches a pointerdown listener to `host.viewport`; the first hit sets
 * the start point, the second draws the connecting line and reports the
 * distance through `onMeasure`.
 */
export function createMeasureController(
  host: FeatureHost,
  onMeasure?: (d: number, a: THREE.Vector3, b: THREE.Vector3) => void,
): MeasureController {
  const THREE = host.THREE;
  let armed = false;
  let first: THREE.Vector3 | null = null;
  let lastDistance: number | null = null;

  const onPointerDown = (ev: PointerEvent): void => {
    if (!armed) return;
    const pick = host.pickBodySurfaceAt(ev.clientX, ev.clientY);
    if (!pick) return;
    const point = pick.point.clone();

    if (!first) {
      first = point;
      host.overlay.add(makeMarker(host, point, 0xff44ff));
      return;
    }

    const second = point;
    host.overlay.add(makeMarker(host, second, 0x00e676));
    host.overlay.add(makeLine(host, first, second, 0xffd400));
    const d = distance(first, second);
    lastDistance = d;
    onMeasure?.(d, first.clone(), second.clone());
    first = null;
  };

  function arm(): void {
    if (armed) return;
    armed = true;
    host.viewport.addEventListener('pointerdown', onPointerDown);
  }

  function disarm(): void {
    if (!armed) return;
    armed = false;
    first = null;
    host.viewport.removeEventListener('pointerdown', onPointerDown);
  }

  return {
    arm,
    disarm,
    isArmed: () => armed,
    getDistance: () => lastDistance,
    clearOverlay: () => {
      first = null;
      clearMeasureOverlay(host);
    },
  };
}
