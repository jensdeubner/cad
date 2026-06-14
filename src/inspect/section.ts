/**
 * Section Analysis — a live clipping plane across all bodies (Inspect standard).
 *
 * Pure-ish controller built on the `FeatureHost`: it toggles a global
 * `THREE.Plane` on `host.renderer.clippingPlanes`, enabling `localClippingEnabled`
 * so the cut applies to every material, and adds a translucent quad + a
 * `THREE.PlaneHelper` to `host.overlay` so the cut location is visible.
 *
 * The controller is stateful, idempotent and fully reversible: enabling twice
 * is a no-op, disabling restores `clippingPlanes`, `localClippingEnabled` and
 * removes every overlay object it added. Works with zero bodies present.
 */
import type { FeatureHost } from '../features/host';
import type * as THREE from 'three';

const OVERLAY_NAME = 'inspect-section-overlay';

export interface SectionController {
  /** Turn the clipping plane on (idempotent). */
  enable(): void;
  /** Turn the clipping plane off and remove overlays (idempotent). */
  disable(): void;
  /** Flip state; returns the new active flag. */
  toggle(): boolean;
  /** Whether the section plane is currently active. */
  isActive(): boolean;
  /** The live clipping plane, or null when disabled. */
  getPlane(): THREE.Plane | null;
}

/** Create a stateful Section Analysis controller bound to a feature host. */
export function createSectionController(host: FeatureHost): SectionController {
  const THREE = host.THREE;

  let active = false;
  let plane: THREE.Plane | null = null;
  /** Overlay objects we added — tracked so `disable()` removes exactly these. */
  const overlayObjects: THREE.Object3D[] = [];
  /** Captured so we restore the renderer to its pre-section state. */
  let prevLocalClipping = false;
  let prevPlanes: THREE.Plane[] = [];

  /** Cut origin + size: active body's bbox centre/extent, else world origin. */
  function planeOrigin(): { center: THREE.Vector3; size: number } {
    const center = new THREE.Vector3(0, 0, 0);
    let size = 40;
    const body = host.getActiveBody();
    const geom = body?.geometry;
    if (geom) {
      geom.computeBoundingBox();
      const bb = geom.boundingBox;
      if (bb && isFinite(bb.min.x) && isFinite(bb.max.x)) {
        bb.getCenter(center);
        const dim = new THREE.Vector3();
        bb.getSize(dim);
        size = Math.max(dim.x, dim.y, dim.z, 1) * 1.4;
      }
    }
    return { center, size };
  }

  function buildOverlay(): void {
    if (!plane) return;
    const { center, size } = planeOrigin();
    const normal = plane.normal;

    // Translucent quad lying in the cutting plane, centred on the cut origin.
    const quadGeom = new THREE.PlaneGeometry(size, size);
    const quadMat = new THREE.MeshBasicMaterial({
      color: 0x4ea1ff,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      depthWrite: false,
      // The overlay itself must NOT be clipped by the section plane.
      clippingPlanes: [],
    });
    const quad = new THREE.Mesh(quadGeom, quadMat);
    quad.name = OVERLAY_NAME;
    // Orient the quad's +Z (its geometric normal) onto the plane normal.
    const zAxis = new THREE.Vector3(0, 0, 1);
    quad.quaternion.setFromUnitVectors(zAxis, normal.clone().normalize());
    quad.position.copy(center);
    quad.renderOrder = 999;

    // Outline of the cut so it reads even at grazing angles.
    const helper = new THREE.PlaneHelper(plane, size, 0x4ea1ff);
    helper.name = OVERLAY_NAME;

    host.overlay.add(quad);
    host.overlay.add(helper);
    overlayObjects.push(quad, helper);
  }

  function clearOverlay(): void {
    for (const obj of overlayObjects) {
      host.overlay.remove(obj);
      // Traverse so PlaneHelper's internal child geometry/material is freed too.
      obj.traverse((node) => {
        const mesh = node as THREE.Mesh;
        mesh.geometry?.dispose?.();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose?.();
      });
    }
    overlayObjects.length = 0;
  }

  function enable(): void {
    if (active) return;
    const { center } = planeOrigin();

    // Default cut: normal +X through the active body's bbox centre (or origin).
    // Plane constant = -normal·point so the plane passes through `center`.
    const normal = new THREE.Vector3(1, 0, 0);
    plane = new THREE.Plane(normal, -normal.dot(center));

    prevLocalClipping = host.renderer.localClippingEnabled;
    prevPlanes = host.renderer.clippingPlanes.slice();

    host.renderer.localClippingEnabled = true;
    host.renderer.clippingPlanes = [plane];

    buildOverlay();
    active = true;
  }

  function disable(): void {
    if (!active) return;
    clearOverlay();
    // Restore the renderer to exactly its pre-section state.
    host.renderer.clippingPlanes = prevPlanes;
    host.renderer.localClippingEnabled = prevLocalClipping;
    prevPlanes = [];
    plane = null;
    active = false;
  }

  function toggle(): boolean {
    if (active) disable();
    else enable();
    return active;
  }

  return {
    enable,
    disable,
    toggle,
    isActive: () => active,
    getPlane: () => plane,
  };
}
