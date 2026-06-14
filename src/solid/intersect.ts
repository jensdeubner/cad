/**
 * Boolean Intersect (Schneiden) + interference helpers.
 *
 * Pure domain module for the feature-registry seam (see
 * `src/features/solid-intersect.ts`). No DOM, no scene wiring — operates on
 * three.js geometries and the `mesh_boolean_subtract_json` kernel.
 *
 * Intersection is composed from the existing subtract kernel:
 *   A ∩ B = A − (A − B)
 * The first subtract removes B from A (leaving the part of A outside B); the
 * second subtract removes that remainder from A, leaving exactly the overlap.
 */
import * as THREE from 'three';
import { mesh_boolean_subtract_json } from '../../wasm-stl/pkg/wasm_stl';
import type { CadBodyRecord } from '../cad-scene';

/** World-space mesh data: flat positions + triangle indices. */
export interface MeshData {
  positions: number[];
  indices: number[];
}

/** Minimal parsed-mesh shape returned by the wasm kernel. */
export interface ParsedMesh {
  positions: Float32Array;
  indices: Uint32Array;
}

/**
 * Bake a body's geometry to WORLD space (applies `meshGroup.matrixWorld`) and
 * return flat, vertex-welded `{positions, indices}`. Returns `null` for bodies
 * without mesh.
 *
 * Welding is essential: three.js primitives (BoxGeometry, SphereGeometry) keep
 * per-face vertices, so every shared edge looks like a boundary edge to the
 * boolean kernel ("Input mesh must not contain boundary edges"). Merging
 * coincident positions makes the mesh manifold/watertight.
 */
export function bakeBodyWorld(body: CadBodyRecord): MeshData | null {
  if (!body.geometry) return null;
  body.meshGroup.updateMatrixWorld(true);
  const g = body.geometry.clone();
  g.applyMatrix4(body.meshGroup.matrixWorld);
  const data = weldMeshData(geometryToMeshData(g));
  g.dispose();
  return data;
}

/**
 * Merge vertices that share a position (quantized to `tol`), rewriting indices.
 * Drops triangles that collapse to a degenerate (two corners welded together).
 */
export function weldMeshData(mesh: MeshData, tol = 1e-4): MeshData {
  const inv = 1 / tol;
  const map = new Map<string, number>();
  const positions: number[] = [];
  const remap = new Int32Array(mesh.positions.length / 3);

  for (let v = 0; v < remap.length; v++) {
    const x = mesh.positions[v * 3];
    const y = mesh.positions[v * 3 + 1];
    const z = mesh.positions[v * 3 + 2];
    const key = `${Math.round(x * inv)},${Math.round(y * inv)},${Math.round(z * inv)}`;
    let slot = map.get(key);
    if (slot === undefined) {
      slot = positions.length / 3;
      map.set(key, slot);
      positions.push(x, y, z);
    }
    remap[v] = slot;
  }

  const indices: number[] = [];
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = remap[mesh.indices[i]];
    const b = remap[mesh.indices[i + 1]];
    const c = remap[mesh.indices[i + 2]];
    if (a === b || b === c || a === c) continue; // degenerate after weld
    indices.push(a, b, c);
  }
  return { positions, indices };
}

/** Flatten a (possibly non-indexed) BufferGeometry to `{positions, indices}`. */
export function geometryToMeshData(geom: THREE.BufferGeometry): MeshData {
  const posAttr = geom.getAttribute('position');
  const positions = Array.from(posAttr.array as ArrayLike<number>);
  let indices: number[];
  const index = geom.getIndex();
  if (index) {
    indices = Array.from(index.array as ArrayLike<number>);
  } else {
    indices = new Array(posAttr.count);
    for (let i = 0; i < posAttr.count; i++) indices[i] = i;
  }
  return { positions, indices };
}

function subtract(target: MeshData, tool: MeshData): ParsedMesh | null {
  // The kernel throws (JsValue) on non-manifold / boundary-edge input. Catch it
  // so a bad pair degrades to "no result" instead of an unhandled exception.
  try {
    return mesh_boolean_subtract_json(
      JSON.stringify({ target, tool }),
    ) as unknown as ParsedMesh;
  } catch {
    return null;
  }
}

function parsedToMeshData(mesh: ParsedMesh): MeshData {
  return {
    positions: Array.from(mesh.positions),
    indices: Array.from(mesh.indices),
  };
}

/**
 * Intersection of two WORLD-space meshes via `A ∩ B = A − (A − B)`.
 * Two subtract calls; the wasm module must be initialised first
 * (`await host.ensureWasm()`). Returns `null` if the overlap is empty.
 */
export function meshIntersect(
  targetWorld: MeshData,
  toolWorld: MeshData,
): ParsedMesh | null {
  // A − B → the part of A that lies OUTSIDE B.
  const aMinusB = subtract(targetWorld, toolWorld);
  if (aMinusB === null) return null; // kernel rejected the operands
  if (aMinusB.indices.length === 0) {
    // Nothing was removed-or A is entirely inside B; fall back: if A−B is empty
    // the whole of A is the overlap.
    return targetWorldHasVolume(targetWorld) ? meshDataToParsed(targetWorld) : null;
  }
  // A − (A − B) → exactly the overlap A ∩ B.
  const result = subtract(targetWorld, weldMeshData(parsedToMeshData(aMinusB)));
  if (result === null || result.indices.length === 0) return null;
  return result;
}

function targetWorldHasVolume(m: MeshData): boolean {
  return m.indices.length > 0;
}

function meshDataToParsed(m: MeshData): ParsedMesh {
  return {
    positions: Float32Array.from(m.positions),
    indices: Uint32Array.from(m.indices),
  };
}

/** Build a three.js BufferGeometry (with normals) from a parsed mesh. */
export function parsedMeshToGeometry(mesh: ParsedMesh): THREE.BufferGeometry {
  const geom = new THREE.BufferGeometry();
  geom.setAttribute(
    'position',
    new THREE.BufferAttribute(Float32Array.from(mesh.positions), 3),
  );
  geom.setIndex(Array.from(mesh.indices));
  geom.computeVertexNormals();
  return geom;
}

/**
 * Signed-tetrahedron volume of an indexed triangle mesh, absolute value.
 * Units are whatever the positions are in (mm³ for this app).
 */
export function meshVolume(positions: ArrayLike<number>, indices: ArrayLike<number>): number {
  let vol = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3;
    const b = indices[i + 1] * 3;
    const c = indices[i + 2] * 3;
    const ax = positions[a], ay = positions[a + 1], az = positions[a + 2];
    const bx = positions[b], by = positions[b + 1], bz = positions[b + 2];
    const cx = positions[c], cy = positions[c + 1], cz = positions[c + 2];
    // Signed volume of tetra (origin, a, b, c) = (a · (b × c)) / 6.
    vol +=
      (ax * (by * cz - bz * cy) -
        ay * (bx * cz - bz * cx) +
        az * (bx * cy - by * cx)) /
      6;
  }
  return Math.abs(vol);
}

/**
 * Pick the two operands for a combine op: the two most-recently-created bodies
 * that have geometry. `getBodies()` returns Map-insertion order (oldest first),
 * so the newest two are the last two with a mesh. Returns `[target, tool]` with
 * the more-recent body as `target` and the previous as `tool`, or `null`.
 */
export function pickTwoNewestBodies(
  bodies: CadBodyRecord[],
): [CadBodyRecord, CadBodyRecord] | null {
  const withMesh = bodies.filter((b) => b.geometry && b.geometry.getAttribute('position'));
  if (withMesh.length < 2) return null;
  const newest = withMesh[withMesh.length - 1];
  const previous = withMesh[withMesh.length - 2];
  return [newest, previous];
}
