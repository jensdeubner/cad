import * as THREE from 'three';

export interface ScanAlignment {
  rotX: number;
  rotY: number;
  rotZ: number;
  posX: number;
  posY: number;
  posZ: number;
}

export const DEFAULT_ALIGNMENT: ScanAlignment = {
  rotX: 0,
  rotY: 0,
  rotZ: 0,
  posX: 0,
  posY: 0,
  posZ: 0,
};

export function centerGeometry(geom: THREE.BufferGeometry): void {
  geom.computeBoundingBox();
  if (!geom.boundingBox) return;
  const center = new THREE.Vector3();
  geom.boundingBox.getCenter(center);
  geom.translate(-center.x, -center.y, -center.z);
  geom.computeBoundingBox();
}

export function readAlignmentFromObject(obj: THREE.Object3D): ScanAlignment {
  return {
    rotX: THREE.MathUtils.radToDeg(obj.rotation.x),
    rotY: THREE.MathUtils.radToDeg(obj.rotation.y),
    rotZ: THREE.MathUtils.radToDeg(obj.rotation.z),
    posX: obj.position.x,
    posY: obj.position.y,
    posZ: obj.position.z,
  };
}

export interface BlendAlignmentOptions {
  rotFraction?: number;
  posFraction?: number;
  maxRotDeg?: number;
  maxPos?: number;
}

const AUTO_ALIGN_ROT_FRACTION = 0.4;
const AUTO_ALIGN_POS_FRACTION = 0.45;
const AUTO_ALIGN_MAX_ROT_DEG = 15;

function alignmentQuaternion(alignment: ScanAlignment): THREE.Quaternion {
  return new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      THREE.MathUtils.degToRad(alignment.rotX),
      THREE.MathUtils.degToRad(alignment.rotY),
      THREE.MathUtils.degToRad(alignment.rotZ),
      'XYZ',
    ),
  );
}

/** Ein Schritt Richtung Ziel — nie der volle Sprung (mehrfach klicken zum Annähern). */
export function blendAlignmentToward(
  current: ScanAlignment,
  target: ScanAlignment,
  options: BlendAlignmentOptions = {},
): ScanAlignment {
  const rotFraction = options.rotFraction ?? AUTO_ALIGN_ROT_FRACTION;
  const posFraction = options.posFraction ?? AUTO_ALIGN_POS_FRACTION;
  const maxRotDeg = options.maxRotDeg ?? AUTO_ALIGN_MAX_ROT_DEG;
  const maxPos = options.maxPos ?? 25;

  const qFrom = alignmentQuaternion(current);
  const qTo = alignmentQuaternion(target);
  if (qFrom.dot(qTo) < 0) {
    qTo.x = -qTo.x;
    qTo.y = -qTo.y;
    qTo.z = -qTo.z;
    qTo.w = -qTo.w;
  }

  const fullAngleDeg = THREE.MathUtils.radToDeg(qFrom.angleTo(qTo));
  const rotStepDeg = Math.min(maxRotDeg, fullAngleDeg * rotFraction);
  const rotT = fullAngleDeg > 1e-4 ? rotStepDeg / fullAngleDeg : 0;

  const qBlend = qFrom.clone().slerp(qTo, rotT);
  const euler = new THREE.Euler().setFromQuaternion(qBlend, 'XYZ');

  const posDelta = new THREE.Vector3(
    target.posX - current.posX,
    target.posY - current.posY,
    target.posZ - current.posZ,
  );
  const posDist = posDelta.length();
  const posStep = Math.min(posDist * posFraction, maxPos);
  if (posDist > 1e-6) posDelta.multiplyScalar(posStep / posDist);
  else posDelta.set(0, 0, 0);

  return {
    rotX: THREE.MathUtils.radToDeg(euler.x),
    rotY: THREE.MathUtils.radToDeg(euler.y),
    rotZ: THREE.MathUtils.radToDeg(euler.z),
    posX: current.posX + posDelta.x,
    posY: current.posY + posDelta.y,
    posZ: current.posZ + posDelta.z,
  };
}

export function alignmentRemainder(
  current: ScanAlignment,
  target: ScanAlignment,
): { rotDeg: number; pos: number } {
  const qFrom = alignmentQuaternion(current);
  const qTo = alignmentQuaternion(target);
  if (qFrom.dot(qTo) < 0) {
    qTo.x = -qTo.x;
    qTo.y = -qTo.y;
    qTo.z = -qTo.z;
    qTo.w = -qTo.w;
  }
  const rotDeg = THREE.MathUtils.radToDeg(qFrom.angleTo(qTo));
  const pos = new THREE.Vector3(
    target.posX - current.posX,
    target.posY - current.posY,
    target.posZ - current.posZ,
  ).length();
  return { rotDeg, pos };
}

export function applyAlignment(scan: THREE.Object3D, alignment: ScanAlignment): void {
  scan.rotation.set(
    THREE.MathUtils.degToRad(alignment.rotX),
    THREE.MathUtils.degToRad(alignment.rotY),
    THREE.MathUtils.degToRad(alignment.rotZ),
    'XYZ',
  );
  scan.position.set(alignment.posX, alignment.posY, alignment.posZ);
  scan.updateMatrixWorld(true);
}

export function getWorldScanBox(scan: THREE.Object3D): THREE.Box3 {
  return new THREE.Box3().setFromObject(scan);
}