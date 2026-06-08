/**
 * Fusion-style viewport navigation: sketch tools use LMB for geometry,
 * mouse wheel zoom and middle-mouse pan stay available; Shift+MMB orbits.
 */
import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { t } from '../i18n';
import type { Tool } from '../types';
import { isSolidCommandActive } from '../solid-command';
import { bodyGizmoTool, meshSculptTool } from '../tools/helpers';

const _yUp = new THREE.Vector3(0, 1, 0);
const _offset = new THREE.Vector3();

type OrbitControlsInternals = OrbitControls & {
  _quat: THREE.Quaternion;
  _quatInverse: THREE.Quaternion;
  _spherical: THREE.Spherical;
  _sphericalDelta: THREE.Spherical;
};

/** Resync OrbitControls after the camera was moved externally (ViewCube orbit/flight). */
export function syncOrbitControlsFromCamera(
  controls: OrbitControls,
  camera: THREE.PerspectiveCamera,
): void {
  const c = controls as OrbitControlsInternals;
  _offset.copy(camera.position).sub(controls.target);
  c._quat.setFromUnitVectors(camera.up, _yUp);
  c._quatInverse.copy(c._quat).invert();
  _offset.applyQuaternion(c._quat);
  c._spherical.setFromVector3(_offset);
  c._sphericalDelta.set(0, 0, 0);
}

export type ViewportNavState = {
  tool: Tool;
  activeSketchId: string | null;
  shiftKeyHeld: boolean;
  viewCubeAnimating: boolean;
  viewCubeDragging: boolean;
  transformDragging: boolean;
  draggingPlane: boolean;
};

export function getSketchViewportNavHint(): string {
  return t('viewport.navHint');
}

function isSketchViewportContext(tool: Tool, activeSketchId: string | null): boolean {
  return (
    !!activeSketchId ||
    tool === 'sketch-pick' ||
    tool.startsWith('sketch-') ||
    tool === 'edit' ||
    tool === 'freehand' ||
    tool === 'polyline' ||
    tool === 'lasso'
  );
}

/** Apply Fusion-like mouse bindings; keeps zoom/pan available in sketch mode. */
export function applyViewportNavigation(controls: OrbitControls, state: ViewportNavState): void {
  const blocked =
    state.viewCubeAnimating || state.viewCubeDragging || state.transformDragging || state.draggingPlane;

  controls.enabled = !blocked;
  controls.enableZoom = true;
  controls.enablePan = true;
  controls.enableRotate = true;

  const nullMouse = null as unknown as THREE.MOUSE;
  const sketch = isSketchViewportContext(state.tool, state.activeSketchId);
  const middle = state.shiftKeyHeld ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN;

  if (state.tool === 'navigate' || state.tool === 'align') {
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: nullMouse,
    };
    return;
  }

  if (sketch || meshSculptTool(state.tool) || isSolidCommandActive()) {
    controls.mouseButtons = {
      LEFT: nullMouse,
      MIDDLE: middle,
      RIGHT: nullMouse,
    };
    return;
  }

  if (bodyGizmoTool(state.tool)) {
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: nullMouse,
    };
    return;
  }

  controls.mouseButtons = {
    LEFT: nullMouse,
    MIDDLE: THREE.MOUSE.PAN,
    RIGHT: THREE.MOUSE.ROTATE,
  };
}