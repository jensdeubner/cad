/**
 * Konvexe Hülle (Convex Hull) — pure geometry.
 *
 * Builds the convex hull of a point set as a closed triangle mesh using
 * three.js' `ConvexGeometry` addon (an incremental QuickHull). No DOM, no
 * scene — just point math on `THREE.Vector3[]` / `THREE.BufferGeometry`.
 * Reference domain module for the feature-registry seam
 * (see `src/features/solid-convex-hull.ts`).
 */
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';

/**
 * Build a convex-hull geometry from a set of points. Fewer than 4 points can
 * never span a volume, so we guard and return an empty geometry. Vertex normals
 * are computed so the result shades like any other solid body.
 */
export function convexHullGeometry(points: THREE.Vector3[]): THREE.BufferGeometry {
  if (!points || points.length < 4) {
    return new THREE.BufferGeometry();
  }
  // QuickHull throws on collinear / fully-degenerate input — degrade to an
  // empty geometry instead of crashing the feature.
  try {
    const geom = new ConvexGeometry(points);
    geom.computeVertexNormals();
    return geom;
  } catch {
    return new THREE.BufferGeometry();
  }
}

/**
 * Extract a deduplicated-ish list of vertex positions from a geometry as
 * `THREE.Vector3[]`. Positions are rounded to a small grid before dedup so that
 * floating-point near-duplicates (shared seam vertices, welded corners) collapse
 * to one point — this keeps the hull input small without changing the result.
 * Handles indexed and non-indexed geometries; returns [] when there is no
 * position attribute.
 */
export function pointsFromGeometry(geom: THREE.BufferGeometry): THREE.Vector3[] {
  const pos = geom.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (!pos) return [];

  const out: THREE.Vector3[] = [];
  const seen = new Set<string>();
  // 1e-4 mm grid: collapses FP noise, preserves real geometry detail.
  const q = 1e4;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const key = `${Math.round(x * q)},${Math.round(y * q)},${Math.round(z * q)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(new THREE.Vector3(x, y, z));
  }
  return out;
}
