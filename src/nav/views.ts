/**
 * Camera/controls view helpers — pure manipulation of an existing
 * PerspectiveCamera + OrbitControls (never swaps the camera type).
 *
 * Used by the `view` ribbon features (Look At + named views). No DOM, no
 * scene mutation beyond camera position / controls target.
 */
import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/** Serialisable snapshot of a camera + controls state (mm world units). */
export interface ViewState {
  pos: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
}

const _center = new THREE.Vector3();
const _size = new THREE.Vector3();
const _dir = new THREE.Vector3();

/**
 * Move the camera so the given world-space box is framed along a sensible
 * iso direction, and point the controls at the box centre. Mutates camera +
 * controls in place and calls `controls.update()`.
 */
export function lookAtBox(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  box: THREE.Box3,
): void {
  if (box.isEmpty()) return;

  const center = box.getCenter(_center);
  const size = box.getSize(_size);
  const radius = 0.5 * Math.max(size.x, size.y, size.z, 1e-3);

  // Fit the bounding sphere into the vertical FOV (and horizontal via aspect).
  const fov = (camera.fov * Math.PI) / 180;
  const fitHeightDist = radius / Math.tan(fov / 2);
  const fitWidthDist = fitHeightDist / Math.max(camera.aspect, 1e-3);
  const dist = 1.35 * Math.max(fitHeightDist, fitWidthDist);

  // Iso-ish direction (front-right-top) so the body reads as 3D.
  const dir = _dir.set(1, 0.7, 1).normalize();
  camera.position.copy(center).addScaledVector(dir, dist);
  controls.target.copy(center);

  // Keep near/far sane for the new framing distance.
  camera.near = Math.max(dist * 0.001, 0.01);
  camera.far = Math.max(dist * 100, camera.far);
  camera.updateProjectionMatrix();

  camera.lookAt(center);
  controls.update();
}

/** Capture the current camera + controls state into a plain serialisable object. */
export function captureView(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
): ViewState {
  return {
    pos: [camera.position.x, camera.position.y, camera.position.z],
    target: [controls.target.x, controls.target.y, controls.target.z],
    up: [camera.up.x, camera.up.y, camera.up.z],
  };
}

/** Restore a previously captured view onto the live camera + controls. */
export function applyView(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  state: ViewState,
): void {
  camera.position.set(state.pos[0], state.pos[1], state.pos[2]);
  camera.up.set(state.up[0], state.up[1], state.up[2]);
  controls.target.set(state.target[0], state.target[1], state.target[2]);
  camera.lookAt(controls.target);
  controls.update();
}
