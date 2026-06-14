/**
 * 3D angle measurement tool — 3-point angle at a vertex + quick body measure.
 *
 * Pure helper (`angleAtVertex`) plus a stateful controller factory
 * (`createAngleController`) built on the `FeatureHost`. The controller attaches
 * a pointer listener to `host.viewport` on demand, uses `host.pickBodySurfaceAt`
 * to collect THREE surface points (ray-end A, vertex V, ray-end C), draws the
 * two rays + endpoint markers into `host.overlay`, and reports the world-space
 * angle in degrees.
 *
 * `quickAngle` needs no interaction: it picks three corners of the active body's
 * world-space bounding box (V, A, C), draws the two rays into `host.overlay`,
 * and returns the angle (90° for an axis-aligned box) + the points.
 */
import type { FeatureHost } from '../features/host';
import type * as THREE from 'three';

const OVERLAY_NAME = 'inspect-measure-angle-overlay';

/**
 * Angle in DEGREES at `vertex` between rays vertex→a and vertex→c.
 * NaN-safe: if either ray has ~zero length, returns 0. The cosine is clamped
 * to [-1, 1] before acos.
 */
export function angleAtVertex(a: THREE.Vector3, vertex: THREE.Vector3, c: THREE.Vector3): number {
  const ax = a.x - vertex.x;
  const ay = a.y - vertex.y;
  const az = a.z - vertex.z;
  const cx = c.x - vertex.x;
  const cy = c.y - vertex.y;
  const cz = c.z - vertex.z;

  const lenA = Math.sqrt(ax * ax + ay * ay + az * az);
  const lenC = Math.sqrt(cx * cx + cy * cy + cz * cz);
  if (lenA < 1e-12 || lenC < 1e-12) return 0;

  let cos = (ax * cx + ay * cy + az * cz) / (lenA * lenC);
  if (cos > 1) cos = 1;
  else if (cos < -1) cos = -1;

  return (Math.acos(cos) * 180) / Math.PI;
}

export interface QuickAngleResult {
  /** Angle in degrees at the vertex (90 for an axis-aligned box). */
  angle: number;
  /** World-space vertex point [x,y,z]. */
  vertex: [number, number, number];
  /** World-space ray-end A point [x,y,z]. */
  a: [number, number, number];
  /** World-space ray-end C point [x,y,z]. */
  c: [number, number, number];
}

export interface AngleController {
  /** Arm interactive three-point picking (idempotent). */
  arm(): void;
  /** Disarm picking and clear any in-progress markers (idempotent). */
  disarm(): void;
  /** Whether the controller is currently listening for picks. */
  isArmed(): boolean;
  /** Last completed 3-point angle in degrees, or null. */
  getAngle(): number | null;
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

/** Remove every overlay object tagged by this angle-measure module. */
function clearAngleOverlay(host: FeatureHost): void {
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

/** Draw the two rays V→A and V→C plus markers at V/A/C. */
function drawAngle(host: FeatureHost, v: THREE.Vector3, a: THREE.Vector3, c: THREE.Vector3): void {
  host.overlay.add(makeLine(host, v, a, 0xffd400));
  host.overlay.add(makeLine(host, v, c, 0xffd400));
  host.overlay.add(makeMarker(host, v, 0xff44ff));
  host.overlay.add(makeMarker(host, a, 0x00e676));
  host.overlay.add(makeMarker(host, c, 0x00b0ff));
}

/**
 * Quick-measure the angle at a corner of the active body's world-space bbox.
 * Builds V=(min.x,min.y,min.z), A=(max.x,min.y,min.z), C=(min.x,max.y,min.z),
 * draws the two rays + markers into `host.overlay`, and returns the angle +
 * points. For an axis-aligned box the angle is 90°.
 */
export function quickAngle(host: FeatureHost): QuickAngleResult {
  const THREE = host.THREE;
  // Idempotent: drop any prior overlay so repeated runs don't accumulate.
  clearAngleOverlay(host);

  const box = activeBodyWorldBox(host);
  const v = new THREE.Vector3(box.min.x, box.min.y, box.min.z);
  const a = new THREE.Vector3(box.max.x, box.min.y, box.min.z);
  const c = new THREE.Vector3(box.min.x, box.max.y, box.min.z);

  const angle = box.isEmpty() ? 0 : angleAtVertex(a, v, c);

  if (!box.isEmpty()) {
    drawAngle(host, v, a, c);
  }

  return {
    angle,
    vertex: [v.x, v.y, v.z],
    a: [a.x, a.y, a.z],
    c: [c.x, c.y, c.z],
  };
}

/**
 * Create a stateful three-point angle controller bound to a feature host.
 * `arm()` attaches a pointerdown listener to `host.viewport`. Picks are
 * collected in order: ray-end A, vertex V, ray-end C. On the third pick the
 * two rays V→A / V→C and markers are drawn, the angle is computed via
 * `angleAtVertex(A, V, C)`, `onAngle` is invoked, and the triple resets.
 */
export function createAngleController(
  host: FeatureHost,
  onAngle?: (deg: number) => void,
): AngleController {
  let armed = false;
  let pa: THREE.Vector3 | null = null; // ray-end A
  let pv: THREE.Vector3 | null = null; // vertex V
  let lastAngle: number | null = null;

  const onPointerDown = (ev: PointerEvent): void => {
    if (!armed) return;
    const pick = host.pickBodySurfaceAt(ev.clientX, ev.clientY);
    if (!pick) return;
    const point = pick.point.clone();

    if (!pa) {
      pa = point;
      host.overlay.add(makeMarker(host, point, 0x00e676));
      return;
    }
    if (!pv) {
      pv = point;
      host.overlay.add(makeMarker(host, point, 0xff44ff));
      return;
    }

    const pc = point;
    drawAngle(host, pv, pa, pc);
    const deg = angleAtVertex(pa, pv, pc);
    lastAngle = deg;
    onAngle?.(deg);
    pa = null;
    pv = null;
  };

  function arm(): void {
    if (armed) return;
    armed = true;
    host.viewport.addEventListener('pointerdown', onPointerDown);
  }

  function disarm(): void {
    if (!armed) return;
    armed = false;
    pa = null;
    pv = null;
    host.viewport.removeEventListener('pointerdown', onPointerDown);
  }

  return {
    arm,
    disarm,
    isArmed: () => armed,
    getAngle: () => lastAngle,
    clearOverlay: () => {
      pa = null;
      pv = null;
      clearAngleOverlay(host);
    },
  };
}
