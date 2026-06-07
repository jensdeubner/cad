/**
 * Fusion-style viewport navigation: sketch tools use LMB for geometry,
 * mouse wheel zoom and middle-mouse pan stay available; Shift+MMB orbits.
 */
import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Tool } from '../types';
import { bodyGizmoTool, meshSculptTool } from '../tools/helpers';

export type ViewportNavState = {
  tool: Tool;
  activeSketchId: string | null;
  shiftKeyHeld: boolean;
  viewCubeAnimating: boolean;
  viewCubeDragging: boolean;
  transformDragging: boolean;
  draggingPlane: boolean;
};

export const SKETCH_VIEWPORT_NAV_HINT =
  'Mausrad=Zoom · Mitte=Schwenken · Umschalt+Mitte=Drehen · Links=Werkzeug';

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

  if (sketch || meshSculptTool(state.tool)) {
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