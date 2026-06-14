/**
 * Surface-area measurement tool.
 *
 * Pure helpers (`triangleArea`, `totalSurfaceArea`, `coplanarRegionArea`) plus a
 * stateful controller factory (`createAreaController`) and a no-interaction
 * "quick" path (`quickArea`).
 *
 * `quickArea` sums the area of every triangle of the active body in WORLD space
 * — deterministic and overlay-light (subtle bbox outline), ideal for E2E.
 * The controller raycasts a clicked face and grows the connected COPLANAR region
 * via a shared-vertex adjacency BFS (face normals within a tolerance), reporting
 * that region's area and highlighting it in `host.overlay`.
 *
 * Mirrors the style of `src/inspect/measure.ts`.
 */
import type { FeatureHost } from '../features/host';
import type * as THREE from 'three';
// Concrete three namespace for the pure helpers (vitest + browser both resolve
// the same bundler singleton). Type-only `THREE` above keeps signatures clean.
import * as THREE_NS from 'three';
import { weldVertices } from '../mesh/weld';

const OVERLAY_NAME = 'inspect-measure-area-overlay';

/**
 * Area of triangle (a,b,c) = 0.5·|(b−a)×(c−a)|. NaN-safe: any non-finite
 * coordinate (or a degenerate / zero-area triangle) yields 0.
 */
export function triangleArea(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): number {
  // Edge vectors.
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const uz = b.z - a.z;
  const vx = c.x - a.x;
  const vy = c.y - a.y;
  const vz = c.z - a.z;
  // Cross product u × v.
  const cx = uy * vz - uz * vy;
  const cy = uz * vx - ux * vz;
  const cz = ux * vy - uy * vx;
  const area = 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz);
  return Number.isFinite(area) ? area : 0;
}

/**
 * Sum of every triangle's area in `geometry`. If `matrix` is given, vertices are
 * transformed into WORLD space first. Supports indexed and non-indexed
 * geometries. Empty / position-less geometry → 0.
 */
export function totalSurfaceArea(geometry: THREE.BufferGeometry, matrix?: THREE.Matrix4): number {
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (!pos || pos.count === 0) return 0;

  const index = geometry.getIndex();
  const triCount = index ? index.count / 3 : pos.count / 3;
  const idx = index ? (k: number): number => index.getX(k) : (k: number): number => k;

  // Reusable scratch — avoid allocating a Vector3 per triangle.
  const a = new THREE_NS.Vector3();
  const b = new THREE_NS.Vector3();
  const c = new THREE_NS.Vector3();

  let total = 0;
  for (let t = 0; t < triCount; t++) {
    a.set(pos.getX(idx(t * 3)), pos.getY(idx(t * 3)), pos.getZ(idx(t * 3)));
    b.set(pos.getX(idx(t * 3 + 1)), pos.getY(idx(t * 3 + 1)), pos.getZ(idx(t * 3 + 1)));
    c.set(pos.getX(idx(t * 3 + 2)), pos.getY(idx(t * 3 + 2)), pos.getZ(idx(t * 3 + 2)));
    if (matrix) {
      a.applyMatrix4(matrix);
      b.applyMatrix4(matrix);
      c.applyMatrix4(matrix);
    }
    total += triangleArea(a, b, c);
  }
  return total;
}

/** Per-triangle normal (unit) of the indexed triangle `t` in LOCAL space. */
function triNormal(
  pos: THREE.BufferAttribute,
  idx: (k: number) => number,
  t: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  const ax = pos.getX(idx(t * 3));
  const ay = pos.getY(idx(t * 3));
  const az = pos.getZ(idx(t * 3));
  const bx = pos.getX(idx(t * 3 + 1));
  const by = pos.getY(idx(t * 3 + 1));
  const bz = pos.getZ(idx(t * 3 + 1));
  const cx = pos.getX(idx(t * 3 + 2));
  const cy = pos.getY(idx(t * 3 + 2));
  const cz = pos.getZ(idx(t * 3 + 2));
  const ux = bx - ax;
  const uy = by - ay;
  const uz = bz - az;
  const vx = cx - ax;
  const vy = cy - ay;
  const vz = cz - az;
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  out.set(nx, ny, nz);
  const len = out.length();
  if (len > 0) out.multiplyScalar(1 / len);
  return out;
}

/** Local area of indexed triangle `t`. */
function triAreaLocal(pos: THREE.BufferAttribute, idx: (k: number) => number, t: number): number {
  const a = new THREE_NS.Vector3(pos.getX(idx(t * 3)), pos.getY(idx(t * 3)), pos.getZ(idx(t * 3)));
  const b = new THREE_NS.Vector3(
    pos.getX(idx(t * 3 + 1)),
    pos.getY(idx(t * 3 + 1)),
    pos.getZ(idx(t * 3 + 1)),
  );
  const c = new THREE_NS.Vector3(
    pos.getX(idx(t * 3 + 2)),
    pos.getY(idx(t * 3 + 2)),
    pos.getZ(idx(t * 3 + 2)),
  );
  return triangleArea(a, b, c);
}

/**
 * Area of the connected COPLANAR triangle region that contains `seedTri`.
 *
 * Internally welds a clone of `geometry` (via `weldVertices`) to obtain a
 * shared-vertex indexed mesh, builds an edge → triangles adjacency, then BFS
 * from `seedTri` across shared edges, only crossing into a neighbour whose unit
 * face normal · seed face normal ≥ cos(normalTolDeg). Sums LOCAL triangle areas.
 *
 * @returns `{ area, triangleCount }` for the region (a single planar box face of
 *          a 20 mm box → 400 mm², 2 triangles).
 */
export function coplanarRegionArea(
  geometry: THREE.BufferGeometry,
  seedTri: number,
  normalTolDeg = 1,
): { area: number; triangleCount: number } {
  const welded = weldVertices(geometry.clone());
  const pos = welded.getAttribute('position') as THREE.BufferAttribute | undefined;
  const index = welded.getIndex();
  if (!pos || pos.count === 0 || !index) return { area: 0, triangleCount: 0 };

  const idx = (k: number): number => index.getX(k);
  const triCount = index.count / 3;
  if (seedTri < 0 || seedTri >= triCount) return { area: 0, triangleCount: 0 };

  // ── Edge → triangles adjacency (undirected edge keyed by sorted vert ids) ──
  const edgeToTris = new Map<string, number[]>();
  const edgeKey = (i: number, j: number): string => (i < j ? `${i}_${j}` : `${j}_${i}`);
  for (let t = 0; t < triCount; t++) {
    const v0 = idx(t * 3);
    const v1 = idx(t * 3 + 1);
    const v2 = idx(t * 3 + 2);
    for (const [p, q] of [
      [v0, v1],
      [v1, v2],
      [v2, v0],
    ]) {
      const key = edgeKey(p, q);
      let arr = edgeToTris.get(key);
      if (!arr) {
        arr = [];
        edgeToTris.set(key, arr);
      }
      arr.push(t);
    }
  }

  // Precompute the seed normal once.
  const seedNormal = triNormal(pos, idx, seedTri, new THREE_NS.Vector3());
  const cosTol = Math.cos((normalTolDeg * Math.PI) / 180);

  // ── BFS across coplanar shared edges ──────────────────────────────────────
  const visited = new Uint8Array(triCount);
  const queue: number[] = [seedTri];
  visited[seedTri] = 1;
  let area = 0;
  let count = 0;
  const scratch = new THREE_NS.Vector3();

  while (queue.length > 0) {
    const t = queue.pop() as number;
    area += triAreaLocal(pos, idx, t);
    count += 1;

    const v0 = idx(t * 3);
    const v1 = idx(t * 3 + 1);
    const v2 = idx(t * 3 + 2);
    for (const [p, q] of [
      [v0, v1],
      [v1, v2],
      [v2, v0],
    ]) {
      const neighbours = edgeToTris.get(edgeKey(p, q));
      if (!neighbours) continue;
      for (const nt of neighbours) {
        if (nt === t || visited[nt]) continue;
        const nNormal = triNormal(pos, idx, nt, scratch);
        if (seedNormal.dot(nNormal) >= cosTol) {
          visited[nt] = 1;
          queue.push(nt);
        }
      }
    }
  }

  welded.dispose();
  return { area, triangleCount: count };
}

export interface QuickAreaResult {
  /** Total world-space surface area of the active body (mm²). */
  totalArea: number;
}

/** World matrix-aware bbox of the active body (for the subtle outline). */
function activeBodyWorldBox(host: FeatureHost): THREE.Box3 {
  const THREE = host.THREE;
  const box = new THREE.Box3();
  const body = host.getActiveBody();
  const geom = body?.geometry ?? null;
  if (!body || !geom) return box;
  if (!geom.boundingBox) geom.computeBoundingBox();
  const local = geom.boundingBox;
  if (!local) return box;
  body.meshGroup.updateMatrixWorld(true);
  box.copy(local).applyMatrix4(body.meshGroup.matrixWorld);
  return box;
}

/**
 * Quick total-surface-area of the active body in WORLD space. Draws a subtle
 * bounding-box outline into `host.overlay`. Idempotent: re-running first clears
 * any prior outline so overlays don't accumulate.
 */
export function quickArea(host: FeatureHost): QuickAreaResult {
  clearAreaOverlay(host);
  const body = host.getActiveBody();
  const geom = body?.geometry ?? null;
  if (!body || !geom) return { totalArea: 0 };

  body.meshGroup.updateMatrixWorld(true);
  const totalArea = totalSurfaceArea(geom, body.meshGroup.matrixWorld);

  // Subtle bbox outline so the action has a visible footprint.
  const box = activeBodyWorldBox(host);
  if (!box.isEmpty()) {
    host.overlay.add(makeBoxOutline(host, box, 0x00e5ff));
  }

  return { totalArea };
}

/** A translucent wireframe box outline added to the overlay. */
function makeBoxOutline(host: FeatureHost, box: THREE.Box3, color: number): THREE.Object3D {
  const THREE = host.THREE;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const geom = new THREE.BoxGeometry(size.x, size.y, size.z);
  const edges = new THREE.EdgesGeometry(geom);
  geom.dispose();
  const mat = new THREE.LineBasicMaterial({ color, depthTest: false, clippingPlanes: [] });
  const lines = new THREE.LineSegments(edges, mat);
  lines.position.copy(center);
  lines.name = OVERLAY_NAME;
  lines.renderOrder = 1000;
  return lines;
}

/** A translucent highlight mesh + outline for a coplanar region. */
function makeRegionHighlight(
  host: FeatureHost,
  positions: number[],
  color: number,
): THREE.Object3D {
  const THREE = host.THREE;
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.computeVertexNormals();
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.35,
    depthTest: false,
    side: THREE.DoubleSide,
    clippingPlanes: [],
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.name = OVERLAY_NAME;
  mesh.renderOrder = 1000;
  return mesh;
}

/** Remove + dispose every overlay object tagged by this module. */
function clearAreaOverlay(host: FeatureHost): void {
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

export interface AreaController {
  /** Arm interactive face picking (idempotent). */
  arm(): void;
  /** Disarm picking (idempotent). */
  disarm(): void;
  /** Whether the controller is currently listening for picks. */
  isArmed(): boolean;
  /** Remove every overlay object this controller created. */
  clearOverlay(): void;
}

/**
 * Build the LOCAL-space triangle vertex list for a welded region, mapped through
 * the body's world matrix, so the highlight overlay sits on the real surface.
 */
function regionWorldTriangles(
  geometry: THREE.BufferGeometry,
  matrix: THREE.Matrix4,
  seedTri: number,
  normalTolDeg: number,
): number[] {
  const welded = weldVertices(geometry.clone());
  const pos = welded.getAttribute('position') as THREE.BufferAttribute | undefined;
  const index = welded.getIndex();
  const out: number[] = [];
  if (!pos || !index) {
    welded.dispose();
    return out;
  }
  const idx = (k: number): number => index.getX(k);
  const triCount = index.count / 3;
  if (seedTri < 0 || seedTri >= triCount) {
    welded.dispose();
    return out;
  }

  const edgeToTris = new Map<string, number[]>();
  const edgeKey = (i: number, j: number): string => (i < j ? `${i}_${j}` : `${j}_${i}`);
  for (let t = 0; t < triCount; t++) {
    const a = idx(t * 3);
    const b = idx(t * 3 + 1);
    const c = idx(t * 3 + 2);
    for (const [p, q] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const key = edgeKey(p, q);
      let arr = edgeToTris.get(key);
      if (!arr) {
        arr = [];
        edgeToTris.set(key, arr);
      }
      arr.push(t);
    }
  }

  const seedNormal = triNormal(pos, idx, seedTri, new THREE_NS.Vector3());
  const cosTol = Math.cos((normalTolDeg * Math.PI) / 180);
  const visited = new Uint8Array(triCount);
  const queue: number[] = [seedTri];
  visited[seedTri] = 1;
  const scratch = new THREE_NS.Vector3();
  const v = new THREE_NS.Vector3();

  while (queue.length > 0) {
    const t = queue.pop() as number;
    for (let k = 0; k < 3; k++) {
      v.set(pos.getX(idx(t * 3 + k)), pos.getY(idx(t * 3 + k)), pos.getZ(idx(t * 3 + k)));
      v.applyMatrix4(matrix);
      out.push(v.x, v.y, v.z);
    }
    const a = idx(t * 3);
    const b = idx(t * 3 + 1);
    const c = idx(t * 3 + 2);
    for (const [p, q] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const neighbours = edgeToTris.get(edgeKey(p, q));
      if (!neighbours) continue;
      for (const nt of neighbours) {
        if (nt === t || visited[nt]) continue;
        if (seedNormal.dot(triNormal(pos, idx, nt, scratch)) >= cosTol) {
          visited[nt] = 1;
          queue.push(nt);
        }
      }
    }
  }
  welded.dispose();
  return out;
}

/**
 * Create a stateful face-area controller bound to a feature host. `arm()`
 * attaches a pointerdown listener to `host.viewport`; a hit raycasts the active
 * body, maps the hit face to the welded geometry, grows the connected coplanar
 * region, highlights it in `host.overlay`, and reports `{area, triangleCount}`
 * through `onFace`.
 */
export function createAreaController(
  host: FeatureHost,
  onFace?: (area: number, tris: number) => void,
): AreaController {
  const THREE = host.THREE;
  let armed = false;
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  const onPointerDown = (ev: PointerEvent): void => {
    if (!armed) return;
    const body = host.getActiveBody();
    const geom = body?.geometry ?? null;
    if (!body || !geom) return;

    const rect = host.viewport.getBoundingClientRect();
    ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, host.camera);

    const hits = raycaster.intersectObject(body.meshGroup, true);
    if (hits.length === 0) return;
    const hit = hits[0];

    body.meshGroup.updateMatrixWorld(true);
    const matrix = body.meshGroup.matrixWorld;

    let area: number;
    let tris: number;
    let triPositions: number[];
    if (typeof hit.faceIndex === 'number' && hit.faceIndex >= 0) {
      const region = coplanarRegionArea(geom, hit.faceIndex);
      area = region.area;
      tris = region.triangleCount;
      triPositions = regionWorldTriangles(geom, matrix, hit.faceIndex, 1);
    } else if (hit.face) {
      // Best-effort fallback: single hit triangle's world-space area.
      const f = hit.face;
      const pos = geom.getAttribute('position') as THREE.BufferAttribute;
      const a = new THREE.Vector3(pos.getX(f.a), pos.getY(f.a), pos.getZ(f.a)).applyMatrix4(matrix);
      const b = new THREE.Vector3(pos.getX(f.b), pos.getY(f.b), pos.getZ(f.b)).applyMatrix4(matrix);
      const c = new THREE.Vector3(pos.getX(f.c), pos.getY(f.c), pos.getZ(f.c)).applyMatrix4(matrix);
      area = triangleArea(a, b, c);
      tris = 1;
      triPositions = [a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z];
    } else {
      return;
    }

    clearAreaOverlay(host);
    if (triPositions.length >= 9) {
      host.overlay.add(makeRegionHighlight(host, triPositions, 0xffaa00));
    }
    onFace?.(area, tris);
  };

  function arm(): void {
    if (armed) return;
    armed = true;
    host.viewport.addEventListener('pointerdown', onPointerDown);
  }

  function disarm(): void {
    if (!armed) return;
    armed = false;
    host.viewport.removeEventListener('pointerdown', onPointerDown);
  }

  return {
    arm,
    disarm,
    isArmed: () => armed,
    clearOverlay: () => clearAreaOverlay(host),
  };
}
