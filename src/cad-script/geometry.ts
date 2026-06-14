/**
 * cad-script · three.js bridge
 *
 * The only module in the kernel that imports three. Converts a neutral `Mesh`
 * (flat arrays) into a `THREE.BufferGeometry` the app can drop into a body via
 * `host.addBodyFromGeometry`. Kept separate so every other cad-script module
 * stays pure and unit-testable without WebGL.
 */
import * as THREE from 'three';
import type { Mesh } from './mesh';

/** Build an indexed `BufferGeometry` (with vertex normals) from a `Mesh`. */
export function meshToGeometry(mesh: Mesh): THREE.BufferGeometry {
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(mesh.positions), 3));
  geom.setIndex(mesh.indices.slice());
  geom.computeVertexNormals();
  geom.computeBoundingBox();
  geom.computeBoundingSphere();
  return geom;
}
