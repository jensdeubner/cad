/**
 * Fusion-style extrude direction arrow — persistent, scene-scaled, no per-frame recreate.
 */
import * as THREE from 'three';

export type ExtrudeGizmo = {
  show: (anchor: THREE.Vector3, normal: THREE.Vector3, distanceMm: number) => void;
  clear: () => void;
};

export function createExtrudeGizmo(
  group: THREE.Group,
  getSceneSize: () => number,
): ExtrudeGizmo {
  let arrow: THREE.ArrowHelper | null = null;
  let lastDisplayLen = -1;

  function minLength(): number {
    return Math.max(getSceneSize() * 0.22, 22);
  }

  function disposeArrow() {
    if (!arrow) return;
    arrow.line.geometry.dispose();
    (arrow.line.material as THREE.Material).dispose();
    arrow.cone.geometry.dispose();
    (arrow.cone.material as THREE.Material).dispose();
    group.remove(arrow);
    arrow = null;
    lastDisplayLen = -1;
  }

  function ensureArrow() {
    if (arrow) return arrow;
    const dir = new THREE.Vector3(0, 0, 1);
    const len = minLength();
    const head = len * 0.28;
    arrow = new THREE.ArrowHelper(dir, new THREE.Vector3(), len, 0xff6d00, head, head * 0.62);
    const lineMat = arrow.line.material as THREE.LineBasicMaterial;
    lineMat.depthTest = false;
    lineMat.transparent = true;
    lineMat.opacity = 1;
    const coneMat = arrow.cone.material as THREE.MeshBasicMaterial;
    coneMat.depthTest = false;
    coneMat.transparent = true;
    coneMat.opacity = 1;
    arrow.renderOrder = 1500;
    arrow.line.renderOrder = 1500;
    arrow.cone.renderOrder = 1501;
    group.add(arrow);
    return arrow;
  }

  return {
    clear: disposeArrow,
    show(anchor, normal, distanceMm) {
      const displayLen = Math.max(Math.abs(distanceMm), minLength());
      if (arrow && Math.abs(displayLen - lastDisplayLen) < 0.4 && arrow.position.distanceToSquared(anchor) < 1e-6) {
        return;
      }
      lastDisplayLen = displayLen;
      const sign = distanceMm < 0 ? -1 : 1;
      const dir = normal.clone().normalize().multiplyScalar(sign);
      const head = Math.max(displayLen * 0.26, minLength() * 0.26);
      const a = ensureArrow();
      a.position.copy(anchor);
      a.setDirection(dir);
      a.setLength(displayLen, head, head * 0.62);
    },
  };
}