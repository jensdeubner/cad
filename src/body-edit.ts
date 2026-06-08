import * as THREE from 'three';
import {
  export_binary_stl,
  initWasm,
  mesh_boolean_subtract_json,
  mesh_boolean_union_json,
} from './wasm';
import type { CadBodyRecord } from './cad-scene';
import { applyAlignment, readAlignmentFromObject, type ScanAlignment } from './scan-align';

export type MirrorAxis = 'x' | 'y' | 'z';

export interface SurfacePick {
  bodyId: string;
  point: THREE.Vector3;
  normal: THREE.Vector3;
}

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _n = new THREE.Vector3();

export function geometryMeshData(geom: THREE.BufferGeometry): {
  positions: Float32Array;
  indices: Uint32Array;
} {
  const posAttr = geom.getAttribute('position') as THREE.BufferAttribute;
  const positions = posAttr.array as Float32Array;
  const index = geom.getIndex();
  if (!index) {
    const n = positions.length / 3;
    const indices = new Uint32Array(n);
    for (let i = 0; i < n; i++) indices[i] = i;
    return { positions, indices };
  }
  const raw = index.array;
  const indices =
    raw instanceof Uint32Array ? raw : new Uint32Array(Array.from(raw as ArrayLike<number>));
  return { positions, indices };
}

export async function geometryToMeshBuffer(geom: THREE.BufferGeometry): Promise<ArrayBuffer> {
  await initWasm();
  const { positions, indices } = geometryMeshData(geom);
  const stlBytes = export_binary_stl(positions, indices);
  return stlBytes.buffer.slice(
    stlBytes.byteOffset,
    stlBytes.byteOffset + stlBytes.byteLength,
  ) as ArrayBuffer;
}

export function bakeMeshGroupTransform(meshGroup: THREE.Object3D, geom: THREE.BufferGeometry): ScanAlignment {
  meshGroup.updateMatrix();
  geom.applyMatrix4(meshGroup.matrix);
  geom.computeVertexNormals();
  meshGroup.position.set(0, 0, 0);
  meshGroup.rotation.set(0, 0, 0);
  meshGroup.scale.set(1, 1, 1);
  meshGroup.updateMatrix();
  return readAlignmentFromObject(meshGroup);
}

function smoothstepFalloff(distance: number, radius: number): number {
  const t = 1 - distance / radius;
  if (t <= 0) return 0;
  return t * t * (3 - 2 * t);
}

export function displaceRegion(
  geom: THREE.BufferGeometry,
  center: THREE.Vector3,
  normal: THREE.Vector3,
  amount: number,
  radius: number,
): void {
  const posAttr = geom.getAttribute('position') as THREE.BufferAttribute;
  const pos = posAttr.array as Float32Array;
  const index = geom.getIndex();
  _n.copy(normal).normalize();

  const visit = (vi: number) => {
    _v.fromArray(pos, vi * 3);
    const w = smoothstepFalloff(_v.distanceTo(center), radius);
    if (w <= 0) return;
    pos[vi * 3] += _n.x * amount * w;
    pos[vi * 3 + 1] += _n.y * amount * w;
    pos[vi * 3 + 2] += _n.z * amount * w;
  };

  if (index) {
    const touched = new Set<number>();
    for (let i = 0; i < index.count; i += 3) {
      let near = false;
      for (let j = 0; j < 3; j++) {
        const vi = index.getX(i + j);
        _v.fromArray(pos, vi * 3);
        if (_v.distanceTo(center) <= radius) {
          near = true;
          break;
        }
      }
      if (!near) continue;
      touched.add(index.getX(i));
      touched.add(index.getX(i + 1));
      touched.add(index.getX(i + 2));
    }
    touched.forEach(visit);
  } else {
    for (let i = 0; i < pos.length; i += 3) visit(i / 3);
  }
  posAttr.needsUpdate = true;
}

export type SmoothOptions = {
  /** Nur Punkte zwischen Ursprung und Tiefe entlang sectionNormal */
  sectionOrigin?: THREE.Vector3;
  sectionNormal?: THREE.Vector3;
  sectionDepth?: number;
  /** Kanten & Übergänge stärker glätten (Zacken an Kurven) */
  edgeOnly?: boolean;
  edgeBoost?: number;
  iterations?: number;
};

type MeshAdjacency = {
  neighbors: Map<number, Set<number>>;
  sharpness: Float32Array;
};

const adjacencyCache = new WeakMap<THREE.BufferGeometry, MeshAdjacency>();

function buildAdjacency(geom: THREE.BufferGeometry): MeshAdjacency {
  const cached = adjacencyCache.get(geom);
  if (cached) return cached;

  const posAttr = geom.getAttribute('position') as THREE.BufferAttribute;
  const pos = posAttr.array as Float32Array;
  const index = geom.getIndex();
  if (!index) {
    const empty = { neighbors: new Map(), sharpness: new Float32Array(0) };
    adjacencyCache.set(geom, empty);
    return empty;
  }

  const neighbors = new Map<number, Set<number>>();
  const addEdge = (a: number, b: number) => {
    if (!neighbors.has(a)) neighbors.set(a, new Set());
    neighbors.get(a)!.add(b);
  };

  const faceNormals: THREE.Vector3[] = [];
  const vertFaces = new Map<number, number[]>();

  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i);
    const b = index.getX(i + 1);
    const c = index.getX(i + 2);
    addEdge(a, b);
    addEdge(a, c);
    addEdge(b, a);
    addEdge(b, c);
    addEdge(c, a);
    addEdge(c, b);

    const fi = faceNormals.length;
    _v.fromArray(pos, a * 3);
    _v2.fromArray(pos, b * 3);
    _n.fromArray(pos, c * 3);
    const fn = new THREE.Vector3()
      .subVectors(_v2, _v)
      .cross(new THREE.Vector3().subVectors(_n, _v))
      .normalize();
    faceNormals.push(fn);
    for (const vi of [a, b, c]) {
      if (!vertFaces.has(vi)) vertFaces.set(vi, []);
      vertFaces.get(vi)!.push(fi);
    }
  }

  const vCount = pos.length / 3;
  const sharpness = new Float32Array(vCount);
  for (const [vi, faces] of vertFaces) {
    let maxAngle = 0;
    for (let i = 0; i < faces.length; i++) {
      for (let j = i + 1; j < faces.length; j++) {
        const angle = faceNormals[faces[i]].angleTo(faceNormals[faces[j]]);
        if (angle > maxAngle) maxAngle = angle;
      }
    }
    sharpness[vi] = maxAngle;
  }

  const result = { neighbors, sharpness };
  adjacencyCache.set(geom, result);
  return result;
}

export function invalidateMeshAdjacency(geom: THREE.BufferGeometry): void {
  adjacencyCache.delete(geom);
}

function regionWeight(
  vi: number,
  pos: Float32Array,
  center: THREE.Vector3,
  radius: number,
  opts: SmoothOptions,
  sharpness: Float32Array,
): number {
  _v.fromArray(pos, vi * 3);
  const distW = smoothstepFalloff(_v.distanceTo(center), radius);
  if (distW <= 0) return 0;

  if (opts.sectionOrigin && opts.sectionNormal && opts.sectionDepth != null) {
    const depth = _v.clone().sub(opts.sectionOrigin).dot(opts.sectionNormal);
    if (depth < 0 || depth > opts.sectionDepth) return 0;
    const bandW = 1 - Math.abs(depth - opts.sectionDepth * 0.5) / (opts.sectionDepth * 0.5 + 1e-6);
    if (bandW <= 0) return 0;
  }

  let w = distW;
  if (opts.edgeOnly && sharpness.length) {
    const edgeW = Math.min(1, sharpness[vi] / (28 * (Math.PI / 180)));
    if (edgeW < 0.12) return 0;
    w *= 0.35 + edgeW * (opts.edgeBoost ?? 1.4);
  }
  return w;
}

function laplacianPass(
  pos: Float32Array,
  neighbors: Map<number, Set<number>>,
  center: THREE.Vector3,
  radius: number,
  lambda: number,
  opts: SmoothOptions,
  sharpness: Float32Array,
): Float32Array {
  const deltas = new Float32Array(pos.length);
  for (const [vi, nbs] of neighbors) {
    const w = regionWeight(vi, pos, center, radius, opts, sharpness);
    if (w <= 0 || nbs.size === 0) continue;
    _v2.set(0, 0, 0);
    for (const nb of nbs) {
      _v.fromArray(pos, nb * 3);
      _v2.add(_v);
    }
    _v2.multiplyScalar(1 / nbs.size);
    _v.fromArray(pos, vi * 3);
    _v2.sub(_v).multiplyScalar(lambda * w);
    deltas[vi * 3] = _v2.x;
    deltas[vi * 3 + 1] = _v2.y;
    deltas[vi * 3 + 2] = _v2.z;
  }
  const next = pos.slice();
  for (let i = 0; i < next.length; i++) next[i] += deltas[i];
  return next;
}

/** Taubin-Glättung — eignet sich für Scan-Zacken an Kurven & Übergängen */
export function taubinSmoothRegion(
  geom: THREE.BufferGeometry,
  center: THREE.Vector3,
  radius: number,
  strength: number,
  opts: SmoothOptions = {},
): void {
  const posAttr = geom.getAttribute('position') as THREE.BufferAttribute;
  let pos = posAttr.array as Float32Array;
  const { neighbors, sharpness } = buildAdjacency(geom);
  if (!neighbors.size) return;

  const lambda = 0.42 * strength;
  const mu = -0.48 * strength;
  const passes = Math.max(1, opts.iterations ?? 2);

  for (let p = 0; p < passes; p++) {
    pos = laplacianPass(pos, neighbors, center, radius, lambda, opts, sharpness);
    pos = laplacianPass(pos, neighbors, center, radius, mu, opts, sharpness);
  }

  (posAttr.array as Float32Array).set(pos);
  posAttr.needsUpdate = true;
  invalidateMeshAdjacency(geom);
}

export function smoothRegion(
  geom: THREE.BufferGeometry,
  center: THREE.Vector3,
  radius: number,
  strength: number,
): void {
  taubinSmoothRegion(geom, center, radius, strength, { iterations: 1 });
}

export function mirrorGeometry(
  geom: THREE.BufferGeometry,
  axis: MirrorAxis,
): THREE.BufferGeometry {
  const cloned = geom.clone();
  const posAttr = cloned.getAttribute('position') as THREE.BufferAttribute;
  const pos = posAttr.array as Float32Array;
  const ai = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;

  for (let i = 0; i < pos.length; i += 3) pos[i + ai] *= -1;

  const index = cloned.getIndex();
  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      const b = index.getX(i + 1);
      index.setX(i + 1, index.getX(i + 2));
      index.setX(i + 2, b);
    }
    index.needsUpdate = true;
  }

  cloned.computeVertexNormals();
  return cloned;
}

export function clipGeometryByPlane(
  geom: THREE.BufferGeometry,
  plane: THREE.Plane,
): THREE.BufferGeometry | null {
  const { positions, indices } = geometryMeshData(geom);
  const kept: number[] = [];
  const eps = 1e-5;

  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i] * 3;
    const ib = indices[i + 1] * 3;
    const ic = indices[i + 2] * 3;
    const da = plane.distanceToPoint(_v.set(positions[ia], positions[ia + 1], positions[ia + 2]));
    const db = plane.distanceToPoint(_v2.set(positions[ib], positions[ib + 1], positions[ib + 2]));
    const dc = plane.distanceToPoint(
      _n.set(positions[ic], positions[ic + 1], positions[ic + 2]),
    );
    if (da >= -eps && db >= -eps && dc >= -eps) {
      kept.push(indices[i], indices[i + 1], indices[i + 2]);
    }
  }

  if (!kept.length) return null;

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(positions.slice(), 3));
  out.setIndex(kept);
  out.computeVertexNormals();
  return out;
}

/** Concatenate body meshes (world space) into one non-indexed-merge geometry. */
export function mergeBodyGeometries(
  bodies: CadBodyRecord[],
): THREE.BufferGeometry | null {
  const parts: THREE.BufferGeometry[] = [];
  for (const body of bodies) {
    if (!body.geometry) continue;
    body.meshGroup.updateMatrixWorld(true);
    const g = body.geometry.clone();
    g.applyMatrix4(body.meshGroup.matrixWorld);
    parts.push(g);
  }
  if (!parts.length) return null;

  let totalVerts = 0;
  let totalIdx = 0;
  for (const g of parts) {
    totalVerts += g.getAttribute('position').count;
    const idx = g.getIndex();
    totalIdx += idx ? idx.count : g.getAttribute('position').count;
  }

  const positions = new Float32Array(totalVerts * 3);
  const indices = new Uint32Array(totalIdx);
  let vOff = 0;
  let iOff = 0;

  for (const g of parts) {
    const pos = g.getAttribute('position').array as Float32Array;
    positions.set(pos, vOff * 3);
    const index = g.getIndex();
    if (index) {
      for (let i = 0; i < index.count; i++) {
        indices[iOff + i] = index.getX(i) + vOff;
      }
      iOff += index.count;
    } else {
      const n = pos.length / 3;
      for (let i = 0; i < n; i++) indices[iOff + i] = vOff + i;
      iOff += n;
    }
    vOff += pos.length / 3;
    g.dispose();
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  out.setIndex(Array.from(indices));
  out.computeVertexNormals();
  return out;
}

function bakeBodyGeometryWorld(body: CadBodyRecord): THREE.BufferGeometry | null {
  if (!body.geometry) return null;
  body.meshGroup.updateMatrixWorld(true);
  const g = body.geometry.clone();
  g.applyMatrix4(body.meshGroup.matrixWorld);
  return g;
}

function meshPayloadFromGeometry(geom: THREE.BufferGeometry): {
  positions: number[];
  indices: number[];
} {
  const data = geometryMeshData(geom);
  return {
    positions: Array.from(data.positions),
    indices: Array.from(data.indices),
  };
}

function parsedMeshToGeometry(mesh: {
  positions: Float32Array;
  indices: Uint32Array;
}): THREE.BufferGeometry {
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
  geom.setIndex(Array.from(mesh.indices));
  geom.computeVertexNormals();
  return geom;
}

/** Boolean union of bodies in world space. */
export async function booleanUnionBodies(
  bodies: CadBodyRecord[],
): Promise<THREE.BufferGeometry | null> {
  if (bodies.length < 2) return null;

  const worldParts: THREE.BufferGeometry[] = [];
  for (const body of bodies) {
    const g = bakeBodyGeometryWorld(body);
    if (!g) {
      worldParts.forEach((p) => p.dispose());
      return null;
    }
    worldParts.push(g);
  }

  await initWasm();
  const meshes = worldParts.map((g) => {
    const payload = meshPayloadFromGeometry(g);
    g.dispose();
    return payload;
  });

  let mesh;
  try {
    mesh = mesh_boolean_union_json(JSON.stringify({ meshes }));
  } catch {
    return null;
  }

  return parsedMeshToGeometry(mesh);
}

/** Boolean subtract tool from target in world space; returns geometry in target local space. */
export async function booleanSubtractBodies(
  target: CadBodyRecord,
  tool: CadBodyRecord,
): Promise<THREE.BufferGeometry | null> {
  const targetWorld = bakeBodyGeometryWorld(target);
  const toolWorld = bakeBodyGeometryWorld(tool);
  if (!targetWorld || !toolWorld) return null;

  await initWasm();
  const targetPayload = meshPayloadFromGeometry(targetWorld);
  const toolPayload = meshPayloadFromGeometry(toolWorld);
  targetWorld.dispose();
  toolWorld.dispose();

  let mesh;
  try {
    mesh = mesh_boolean_subtract_json(
      JSON.stringify({
        target: targetPayload,
        tool: toolPayload,
      }),
    );
  } catch {
    return null;
  }

  const geom = parsedMeshToGeometry(mesh);

  target.meshGroup.updateMatrixWorld(true);
  const inv = target.meshGroup.matrixWorld.clone().invert();
  geom.applyMatrix4(inv);
  geom.computeVertexNormals();
  return geom;
}

export function replaceBodyGeometry(body: CadBodyRecord, geom: THREE.BufferGeometry): void {
  body.geometry?.dispose();
  body.geometry = geom;
}

export async function commitBodyGeometry(body: CadBodyRecord): Promise<void> {
  if (!body.geometry) return;
  body.geometry.computeVertexNormals();
  body.geometry.computeBoundingBox();
  body.meshBuffer = await geometryToMeshBuffer(body.geometry);
}