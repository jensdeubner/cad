/**
 * Additional parametric primitive solids (torus / cone / pyramid).
 *
 * Pure geometry builders — no DOM, no scene. Extends PR0's primitives
 * (see `src/solid/primitives.ts`). All sizes in millimetres, centered at
 * the origin. Used by `src/features/solid-primitives-extra.ts`.
 */
import * as THREE from 'three';

/** Torus (ring) — `R` = ring radius, `r` = tube radius, both in mm. */
export function makeTorus(R = 18, r = 6): THREE.BufferGeometry {
  return new THREE.TorusGeometry(R, r, 24, 64);
}

/** Right circular cone — base `radius` and `height` in mm, centered. */
export function makeCone(radius = 12, height = 24): THREE.BufferGeometry {
  return new THREE.ConeGeometry(radius, height, 48);
}

/**
 * Square pyramid — `base` edge length and `height` in mm, centered.
 * Built from a 4-sided cone; the circumradius makes the square's edge
 * length equal `base`.
 */
export function makePyramid(base = 22, height = 24): THREE.BufferGeometry {
  // A 4-radial-segment cone is a square pyramid. The radial segments span
  // the circumcircle, so the square's edge length is radius * sqrt(2).
  const radius = (base * Math.SQRT2) / 2;
  const geom = new THREE.ConeGeometry(radius, height, 4);
  // Rotate so the square base is axis-aligned (flat sides face X/Z).
  geom.rotateY(Math.PI / 4);
  return geom;
}
