/**
 * Camera/controls view helpers — pure manipulation of the active scene camera
 * (PerspectiveCamera or OrthographicCamera) + OrbitControls.
 *
 * Used by the `view` ribbon features (Look At + named views). No DOM, no
 * scene mutation beyond camera position / controls target / framing.
 */
import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/** The active viewport camera type (perspective or orthographic). */
export type SceneCamera = THREE.PerspectiveCamera | THREE.OrthographicCamera;

/** Serialisable snapshot of a camera + controls state (mm world units). */
export interface ViewState {
  pos: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
  /** Orthographic zoom factor (defaults to 1; harmless for perspective). */
  zoom?: number;
}

const _center = new THREE.Vector3();
const _size = new THREE.Vector3();
const _dir = new THREE.Vector3();

/**
 * Move the camera so the given world-space box is framed along a sensible
 * iso direction, and point the controls at the box centre. Mutates camera +
 * controls in place and calls `controls.update()`. Handles both perspective
 * (fit via FOV) and orthographic (fit via frustum extents) cameras.
 */
export function lookAtBox(
  camera: SceneCamera,
  controls: OrbitControls,
  box: THREE.Box3,
): void {
  if (box.isEmpty()) return;

  const center = box.getCenter(_center);
  const size = box.getSize(_size);
  const radius = 0.5 * Math.max(size.x, size.y, size.z, 1e-3);

  // Iso-ish direction (front-right-top) so the body reads as 3D.
  const dir = _dir.set(1, 0.7, 1).normalize();

  if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
    const cam = camera as THREE.PerspectiveCamera;
    // Fit the bounding sphere into the vertical FOV (and horizontal via aspect).
    const fov = (cam.fov * Math.PI) / 180;
    const fitHeightDist = radius / Math.tan(fov / 2);
    const fitWidthDist = fitHeightDist / Math.max(cam.aspect, 1e-3);
    const dist = 1.35 * Math.max(fitHeightDist, fitWidthDist);
    cam.position.copy(center).addScaledVector(dir, dist);
    controls.target.copy(center);
    cam.near = Math.max(dist * 0.001, 0.01);
    cam.far = Math.max(dist * 100, cam.far);
    cam.updateProjectionMatrix();
    cam.lookAt(center);
  } else {
    const cam = camera as THREE.OrthographicCamera;
    const dist = Math.max(radius * 4, 1);
    cam.position.copy(center).addScaledVector(dir, dist);
    controls.target.copy(center);
    // Frame the box: vertical extent = radius (+margin); width tracks the
    // current frustum aspect so the model is not distorted.
    const margin = 1.3;
    const halfH = radius * margin;
    const curAspect = (cam.right - cam.left) / Math.max(1e-3, cam.top - cam.bottom);
    const halfW = halfH * (Number.isFinite(curAspect) && curAspect > 0 ? curAspect : 1);
    cam.left = -halfW;
    cam.right = halfW;
    cam.top = halfH;
    cam.bottom = -halfH;
    cam.zoom = 1;
    cam.near = Math.max(dist * 0.001, 0.01);
    cam.far = Math.max(dist * 100, cam.far);
    cam.updateProjectionMatrix();
    cam.lookAt(center);
  }
  controls.update();
}

/** Capture the current camera + controls state into a plain serialisable object. */
export function captureView(camera: SceneCamera, controls: OrbitControls): ViewState {
  return {
    pos: [camera.position.x, camera.position.y, camera.position.z],
    target: [controls.target.x, controls.target.y, controls.target.z],
    up: [camera.up.x, camera.up.y, camera.up.z],
    zoom: camera.zoom,
  };
}

/** Restore a previously captured view onto the live camera + controls. */
export function applyView(
  camera: SceneCamera,
  controls: OrbitControls,
  state: ViewState,
): void {
  camera.position.set(state.pos[0], state.pos[1], state.pos[2]);
  camera.up.set(state.up[0], state.up[1], state.up[2]);
  controls.target.set(state.target[0], state.target[1], state.target[2]);
  if (typeof state.zoom === 'number' && Number.isFinite(state.zoom) && state.zoom > 0) {
    camera.zoom = state.zoom;
    camera.updateProjectionMatrix();
  }
  camera.lookAt(controls.target);
  controls.update();
}
