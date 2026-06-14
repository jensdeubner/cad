/**
 * Körper duplizieren (Duplicate body) — pure geometry.
 *
 * Cloning a body just copies its buffers and shifts the copy by an offset so
 * the duplicate is visible next to the original. A pure translation preserves
 * winding and normals, so we simply clone, translate the position buffer, and
 * leave the existing normals intact (a rigid translation does not change them).
 * No DOM, no scene — just buffer math on a THREE.BufferGeometry. Reference
 * domain module for the feature-registry seam (see
 * `src/features/solid-duplicate.ts`).
 */
import * as THREE from 'three';

/**
 * Return a NEW geometry equal to `geometry` cloned and translated by `offset`.
 * Normals are untouched (a translation is normal-preserving). The input is left
 * completely untouched. Empty geometries (no position attribute / zero vertices)
 * are cloned and returned as-is without translation, so the caller never throws.
 */
export function duplicateGeometry(
  geometry: THREE.BufferGeometry,
  offset: THREE.Vector3,
): THREE.BufferGeometry {
  const out = geometry.clone();

  const pos = out.getAttribute('position') as THREE.BufferAttribute | undefined;
  // Guard: empty geometry — nothing to translate, return the bare clone.
  if (!pos || pos.count === 0) return out;

  // Rigid translation of the position buffer; normals stay valid as-is.
  out.translate(offset.x, offset.y, offset.z);
  return out;
}
