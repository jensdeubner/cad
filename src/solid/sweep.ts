/**
 * Sweep — extrude a closed 2D profile along a 3D path.
 *
 * Pure geometry builder — no DOM, no scene. The profile is placed in an
 * orthonormal frame at every path sample. Frames are carried along the path by
 * parallel transport (rotation-minimizing frames) so the profile does not
 * spin / flip as the path bends. Consecutive rings are stitched into quads,
 * each quad split into two triangles. Open paths get end caps when requested.
 *
 * Reference domain module for the feature-registry seam
 * (see `src/features/solid-sweep.ts`).
 */
import * as THREE from 'three';

export interface SweepOptions {
  /** Treat the path as a closed loop (connect last ring back to first). */
  closedPath?: boolean;
  /** Add flat end caps. Only honoured for open paths (a loop needs no caps). */
  cap?: boolean;
}

/** A right-handed orthonormal frame: tangent + the two in-plane axes. */
interface Frame {
  tangent: THREE.Vector3;
  normal: THREE.Vector3;
  binormal: THREE.Vector3;
}

/** Forward-difference tangents along the path (closed loops wrap around). */
function pathTangents(path: THREE.Vector3[], closedPath: boolean): THREE.Vector3[] {
  const n = path.length;
  const tangents: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const prev = path[i === 0 ? (closedPath ? n - 1 : 0) : i - 1];
    const next = path[i === n - 1 ? (closedPath ? 0 : n - 1) : i + 1];
    const t = new THREE.Vector3().subVectors(next, prev);
    if (t.lengthSq() < 1e-12) {
      // Degenerate (coincident neighbours): fall back to a forward segment.
      const a = path[Math.min(i + 1, n - 1)];
      const b = path[Math.max(i - 1, 0)];
      t.subVectors(a, b);
      if (t.lengthSq() < 1e-12) t.set(0, 0, 1);
    }
    tangents.push(t.normalize());
  }
  return tangents;
}

/**
 * Rotation-minimizing frames along the path. The first frame's normal is
 * seeded from a world up-vector that is not parallel to the start tangent;
 * each subsequent normal is parallel-transported by the rotation that maps the
 * previous tangent onto the current one — this avoids the twist/flip that a
 * naive `up`-based frame produces on curved paths.
 */
function transportFrames(tangents: THREE.Vector3[]): Frame[] {
  const frames: Frame[] = [];
  const t0 = tangents[0];

  // Seed normal: a world axis least aligned with the start tangent.
  let up = new THREE.Vector3(0, 1, 0);
  if (Math.abs(t0.dot(up)) > 0.9) up = new THREE.Vector3(1, 0, 0);
  let normal = new THREE.Vector3().crossVectors(up, t0).normalize();
  if (normal.lengthSq() < 1e-12) normal.set(1, 0, 0);
  let binormal = new THREE.Vector3().crossVectors(t0, normal).normalize();
  frames.push({ tangent: t0.clone(), normal: normal.clone(), binormal });

  const q = new THREE.Quaternion();
  for (let i = 1; i < tangents.length; i++) {
    const prevT = tangents[i - 1];
    const curT = tangents[i];
    q.setFromUnitVectors(prevT, curT); // rotation carrying prevT → curT
    normal = normal.clone().applyQuaternion(q).normalize();
    // Re-orthogonalize against the exact current tangent to fight drift.
    normal.sub(curT.clone().multiplyScalar(curT.dot(normal))).normalize();
    if (normal.lengthSq() < 1e-12) {
      let alt = new THREE.Vector3(0, 1, 0);
      if (Math.abs(curT.dot(alt)) > 0.9) alt = new THREE.Vector3(1, 0, 0);
      normal = new THREE.Vector3().crossVectors(alt, curT).normalize();
    }
    binormal = new THREE.Vector3().crossVectors(curT, normal).normalize();
    frames.push({ tangent: curT.clone(), normal: normal.clone(), binormal });
  }
  return frames;
}

/**
 * Sweep `profile` (2D points in the frame's normal/binormal plane) along
 * `path`. Returns an indexed BufferGeometry with computed vertex normals.
 *
 * Guards: needs ≥ 2 path points and ≥ 3 profile points, else returns an empty
 * geometry (callers can detect via an empty position attribute).
 */
export function sweepProfileAlongPath(
  profile: THREE.Vector2[],
  path: THREE.Vector3[],
  opts: SweepOptions = {},
): THREE.BufferGeometry {
  const closedPath = opts.closedPath ?? false;
  const wantCap = opts.cap ?? false;

  if (path.length < 2 || profile.length < 3) {
    return new THREE.BufferGeometry();
  }

  const tangents = pathTangents(path, closedPath);
  const frames = transportFrames(tangents);

  const rings = path.length; // number of path samples
  const sides = profile.length; // points per ring

  const positions: number[] = [];

  // Build one ring of world-space vertices per path sample.
  for (let i = 0; i < rings; i++) {
    const origin = path[i];
    const { normal, binormal } = frames[i];
    for (let j = 0; j < sides; j++) {
      const p = profile[j];
      const x = origin.x + normal.x * p.x + binormal.x * p.y;
      const y = origin.y + normal.y * p.x + binormal.y * p.y;
      const z = origin.z + normal.z * p.x + binormal.z * p.y;
      positions.push(x, y, z);
    }
  }

  const indices: number[] = [];
  const ringStart = (r: number) => r * sides;

  // Stitch the wall between consecutive rings. The profile is always treated
  // as a closed loop (a swept tube), so j wraps modulo `sides`.
  const segs = closedPath ? rings : rings - 1;
  for (let i = 0; i < segs; i++) {
    const a = ringStart(i);
    const b = ringStart((i + 1) % rings);
    for (let j = 0; j < sides; j++) {
      const jn = (j + 1) % sides;
      const v00 = a + j;
      const v01 = a + jn;
      const v10 = b + j;
      const v11 = b + jn;
      // Two triangles per quad (CCW so outward normals point away from path).
      indices.push(v00, v10, v11);
      indices.push(v00, v11, v01);
    }
  }

  // End caps for open paths: triangle-fan each end ring around its centroid.
  if (wantCap && !closedPath) {
    const geom = new THREE.BufferGeometry();
    const sc = new THREE.Vector3();
    const ec = new THREE.Vector3();
    const lastRing = rings - 1;
    for (let j = 0; j < sides; j++) {
      const s = ringStart(0) + j;
      const e = ringStart(lastRing) + j;
      sc.x += positions[s * 3];
      sc.y += positions[s * 3 + 1];
      sc.z += positions[s * 3 + 2];
      ec.x += positions[e * 3];
      ec.y += positions[e * 3 + 1];
      ec.z += positions[e * 3 + 2];
    }
    sc.multiplyScalar(1 / sides);
    ec.multiplyScalar(1 / sides);

    const startCenterIdx = positions.length / 3;
    positions.push(sc.x, sc.y, sc.z);
    const endCenterIdx = positions.length / 3;
    positions.push(ec.x, ec.y, ec.z);

    // Start cap faces backward (opposite the path direction).
    for (let j = 0; j < sides; j++) {
      const jn = (j + 1) % sides;
      indices.push(startCenterIdx, ringStart(0) + jn, ringStart(0) + j);
    }
    // End cap faces forward.
    for (let j = 0; j < sides; j++) {
      const jn = (j + 1) % sides;
      indices.push(endCenterIdx, ringStart(lastRing) + j, ringStart(lastRing) + jn);
    }

    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setIndex(indices);
    geom.computeVertexNormals();
    return geom;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * A watertight torus built by sweeping a circular profile along a closed
 * circular path — the default no-sketch demo for the Sweep feature.
 *
 * @param majorR  distance from the torus centre to the tube centre (mm)
 * @param minorR  tube radius (mm)
 * @param seg     path samples around the major circle
 * @param sides   profile points around the minor circle
 */
export function makeTorusSweep(
  majorR = 20,
  minorR = 6,
  seg = 48,
  sides = 24,
): THREE.BufferGeometry {
  const segCount = Math.max(3, Math.floor(seg));
  const sideCount = Math.max(3, Math.floor(sides));

  // Circular profile in the frame's local (normal, binormal) plane.
  const profile: THREE.Vector2[] = [];
  for (let j = 0; j < sideCount; j++) {
    const a = (j / sideCount) * Math.PI * 2;
    profile.push(new THREE.Vector2(Math.cos(a) * minorR, Math.sin(a) * minorR));
  }

  // Closed circular path in the world XY plane.
  const path: THREE.Vector3[] = [];
  for (let i = 0; i < segCount; i++) {
    const a = (i / segCount) * Math.PI * 2;
    path.push(new THREE.Vector3(Math.cos(a) * majorR, Math.sin(a) * majorR, 0));
  }

  return sweepProfileAlongPath(profile, path, { closedPath: true, cap: false });
}
