import * as THREE from 'three';
import { planeNormal } from './drawing';
import { DEFAULT_ALIGNMENT, type ScanAlignment } from './scan-align';
import type { PlaneAxis } from './types';

const AXIS_INDEX: Record<PlaneAxis, 0 | 1 | 2> = { xy: 2, xz: 1, yz: 0 };
const ROT_FIELDS = ['rotX', 'rotY', 'rotZ'] as const;
const OPT_SAMPLES = 2200;
const REPORT_SAMPLES = 8000;
const SWEEP_RANGES = [28, 14, 7];
const DESCENT_STEPS = [10, 5, 2];
const MAX_DESCENT_ROUNDS = 8;

function sampleLocalPoints(geom: THREE.BufferGeometry, maxSamples = OPT_SAMPLES): THREE.Vector3[] {
  const pos = geom.attributes.position;
  if (!pos?.count) return [];
  const stride = Math.max(1, Math.floor(pos.count / maxSamples));
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < pos.count; i += stride) {
    out.push(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)));
  }
  return out;
}

function alongComponent(v: THREE.Vector3, axis: PlaneAxis): number {
  const idx = AXIS_INDEX[axis];
  return [v.x, v.y, v.z][idx];
}

function eulerToQuaternion(rotX: number, rotY: number, rotZ: number): THREE.Quaternion {
  return new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      THREE.MathUtils.degToRad(rotX),
      THREE.MathUtils.degToRad(rotY),
      THREE.MathUtils.degToRad(rotZ),
      'XYZ',
    ),
  );
}

function powerIteration(vectors: THREE.Vector3[], iterations = 16): THREE.Vector3 {
  let v = new THREE.Vector3(0, 0, 1);
  if (vectors.length < 2) return v;

  for (let iter = 0; iter < iterations; iter++) {
    const w = new THREE.Vector3();
    for (const p of vectors) {
      const d = p.dot(v);
      w.x += d * p.x;
      w.y += d * p.y;
      w.z += d * p.z;
    }
    const len = w.length();
    if (len < 1e-9) break;
    v.copy(w).divideScalar(len);
  }
  return v.normalize();
}

export function computePCANormal(points: THREE.Vector3[]): THREE.Vector3 {
  if (points.length < 3) return new THREE.Vector3(0, 0, 1);

  const mean = new THREE.Vector3();
  for (const p of points) mean.add(p);
  mean.divideScalar(points.length);

  const centered = points.map((p) => p.clone().sub(mean));
  const v0 = powerIteration(centered);

  const deflated = centered.map((p) => {
    const along = v0.dot(p);
    return p.clone().sub(v0.clone().multiplyScalar(along));
  });
  const v1 = powerIteration(deflated);

  const normal = new THREE.Vector3().crossVectors(v0, v1);
  if (normal.lengthSq() < 1e-8) return new THREE.Vector3(0, 0, 1);
  return normal.normalize();
}

function countHits(
  localPoints: THREE.Vector3[],
  quat: THREE.Quaternion,
  pos: THREE.Vector3,
  planeAxis: PlaneAxis,
  planePosition: number,
  tolerance: number,
): number {
  const idx = AXIS_INDEX[planeAxis];
  const tol2 = tolerance * tolerance;
  let hits = 0;
  const p = new THREE.Vector3();
  for (const lp of localPoints) {
    p.copy(lp).applyQuaternion(quat).add(pos);
    const c = [p.x, p.y, p.z][idx];
    const d = c - planePosition;
    if (d * d <= tol2) hits++;
  }
  return hits;
}

function densestSlabCenter(values: number[], tolerance: number): number {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const width = 2 * tolerance;
  let bestCenter = sorted[0];
  let bestCount = 0;
  let j = 0;
  for (let i = 0; i < sorted.length; i++) {
    while (j < sorted.length && sorted[j] - sorted[i] <= width + 1e-9) j++;
    const count = j - i;
    if (count > bestCount) {
      bestCount = count;
      bestCenter = (sorted[i] + sorted[j - 1]) * 0.5;
    }
  }
  return bestCenter;
}

export function alignmentForQuaternion(
  localPoints: THREE.Vector3[],
  quat: THREE.Quaternion,
  planeAxis: PlaneAxis,
  planePosition: number,
  tolerance: number,
): ScanAlignment {
  const rotated: THREE.Vector3[] = [];
  const tmp = new THREE.Vector3();
  for (const lp of localPoints) {
    tmp.copy(lp).applyQuaternion(quat);
    rotated.push(tmp.clone());
  }

  const alongVals = rotated.map((p) => alongComponent(p, planeAxis));
  const slabCenter = densestSlabCenter(alongVals, tolerance);

  const mean = new THREE.Vector3();
  for (const p of rotated) mean.add(p);
  mean.divideScalar(rotated.length);

  const pos = new THREE.Vector3();
  if (planeAxis === 'xy') {
    pos.set(-mean.x, -mean.y, planePosition - slabCenter);
  } else if (planeAxis === 'xz') {
    pos.set(-mean.x, planePosition - slabCenter, -mean.z);
  } else {
    pos.set(planePosition - slabCenter, -mean.y, -mean.z);
  }

  const euler = new THREE.Euler().setFromQuaternion(quat, 'XYZ');
  return {
    rotX: THREE.MathUtils.radToDeg(euler.x),
    rotY: THREE.MathUtils.radToDeg(euler.y),
    rotZ: THREE.MathUtils.radToDeg(euler.z),
    posX: pos.x,
    posY: pos.y,
    posZ: pos.z,
  };
}

export function refineAlignmentPosition(
  geom: THREE.BufferGeometry,
  alignment: ScanAlignment,
  planeAxis: PlaneAxis,
  planePosition: number,
  tolerance: number,
): ScanAlignment {
  const localPoints = sampleLocalPoints(geom, OPT_SAMPLES);
  if (!localPoints.length) return alignment;
  const quat = eulerToQuaternion(alignment.rotX, alignment.rotY, alignment.rotZ);
  return alignmentForQuaternion(localPoints, quat, planeAxis, planePosition, tolerance);
}

function evaluateAlignment(
  localPoints: THREE.Vector3[],
  rotX: number,
  rotY: number,
  rotZ: number,
  planeAxis: PlaneAxis,
  planePosition: number,
  tolerance: number,
): AlignToPlaneResult {
  const quat = eulerToQuaternion(rotX, rotY, rotZ);
  const alignment = alignmentForQuaternion(
    localPoints,
    quat,
    planeAxis,
    planePosition,
    tolerance,
  );
  const evalQuat = eulerToQuaternion(alignment.rotX, alignment.rotY, alignment.rotZ);
  const pos = new THREE.Vector3(alignment.posX, alignment.posY, alignment.posZ);
  const hitCount = countHits(localPoints, evalQuat, pos, planeAxis, planePosition, tolerance);
  return {
    alignment,
    hitCount,
    hitRatio: hitCount / localPoints.length,
  };
}

function bestPcaSeed(
  localPoints: THREE.Vector3[],
  planeAxis: PlaneAxis,
  planePosition: number,
  tolerance: number,
): AlignToPlaneResult | null {
  const target = planeNormal(planeAxis);
  const n = computePCANormal(localPoints);
  let best: AlignToPlaneResult | null = null;

  for (const source of [n, n.clone().negate()]) {
    const q = new THREE.Quaternion().setFromUnitVectors(source.clone().normalize(), target);
    const euler = new THREE.Euler().setFromQuaternion(q, 'XYZ');
    const trial = evaluateAlignment(
      localPoints,
      THREE.MathUtils.radToDeg(euler.x),
      THREE.MathUtils.radToDeg(euler.y),
      THREE.MathUtils.radToDeg(euler.z),
      planeAxis,
      planePosition,
      tolerance,
    );
    if (!best || trial.hitCount > best.hitCount) best = trial;
  }
  return best;
}

/** Pro Achse einzeln suchen — schnell statt 3D-Gitter (verhindert UI-Freeze). */
function axisSweepSearch(
  localPoints: THREE.Vector3[],
  center: ScanAlignment,
  planeAxis: PlaneAxis,
  planePosition: number,
  tolerance: number,
  rangeDeg: number,
  stepDeg: number,
  best: AlignToPlaneResult,
): AlignToPlaneResult {
  for (const field of ROT_FIELDS) {
    for (let delta = -rangeDeg; delta <= rangeDeg + 1e-6; delta += stepDeg) {
      const trial = evaluateAlignment(
        localPoints,
        field === 'rotX' ? center.rotX + delta : center.rotX,
        field === 'rotY' ? center.rotY + delta : center.rotY,
        field === 'rotZ' ? center.rotZ + delta : center.rotZ,
        planeAxis,
        planePosition,
        tolerance,
      );
      if (trial.hitCount > best.hitCount) best = trial;
    }
  }
  return best;
}

function coordinateDescent(
  localPoints: THREE.Vector3[],
  start: AlignToPlaneResult,
  planeAxis: PlaneAxis,
  planePosition: number,
  tolerance: number,
): AlignToPlaneResult {
  let best = start;
  for (const step of DESCENT_STEPS) {
    for (let round = 0; round < MAX_DESCENT_ROUNDS; round++) {
      let improved = false;
      for (const field of ROT_FIELDS) {
        for (const delta of [-step, step]) {
          const trial = evaluateAlignment(
            localPoints,
            field === 'rotX' ? best.alignment.rotX + delta : best.alignment.rotX,
            field === 'rotY' ? best.alignment.rotY + delta : best.alignment.rotY,
            field === 'rotZ' ? best.alignment.rotZ + delta : best.alignment.rotZ,
            planeAxis,
            planePosition,
            tolerance,
          );
          if (trial.hitCount > best.hitCount) {
            best = trial;
            improved = true;
          }
        }
      }
      if (!improved) break;
    }
  }
  return best;
}

function optimizeHitAlignment(
  localPoints: THREE.Vector3[],
  planeAxis: PlaneAxis,
  planePosition: number,
  tolerance: number,
  start: ScanAlignment,
): AlignToPlaneResult {
  let best = evaluateAlignment(
    localPoints,
    start.rotX,
    start.rotY,
    start.rotZ,
    planeAxis,
    planePosition,
    tolerance,
  );

  const pca = bestPcaSeed(localPoints, planeAxis, planePosition, tolerance);
  if (pca && pca.hitCount > best.hitCount) best = pca;

  const centers = [best.alignment, start];
  for (const range of SWEEP_RANGES) {
    const step = Math.max(4, Math.round(range / 4));
    for (const center of centers) {
      best = axisSweepSearch(
        localPoints,
        center,
        planeAxis,
        planePosition,
        tolerance,
        range,
        step,
        best,
      );
    }
    centers.length = 0;
    centers.push(best.alignment);
  }

  return coordinateDescent(localPoints, best, planeAxis, planePosition, tolerance);
}

export interface AlignToPlaneResult {
  alignment: ScanAlignment;
  hitCount: number;
  hitRatio: number;
}

export function computeAlignToPlane(
  geom: THREE.BufferGeometry,
  planeAxis: PlaneAxis,
  planePosition: number,
  tolerance: number,
  current: ScanAlignment = DEFAULT_ALIGNMENT,
): AlignToPlaneResult | null {
  const localPoints = sampleLocalPoints(geom, OPT_SAMPLES);
  if (localPoints.length < 8) return null;
  const result = optimizeHitAlignment(localPoints, planeAxis, planePosition, tolerance, current);

  const reportPoints = sampleLocalPoints(geom, REPORT_SAMPLES);
  const quat = eulerToQuaternion(
    result.alignment.rotX,
    result.alignment.rotY,
    result.alignment.rotZ,
  );
  const pos = new THREE.Vector3(
    result.alignment.posX,
    result.alignment.posY,
    result.alignment.posZ,
  );
  const hitCount = countHits(reportPoints, quat, pos, planeAxis, planePosition, tolerance);
  return {
    alignment: result.alignment,
    hitCount,
    hitRatio: hitCount / reportPoints.length,
  };
}

export function countAlignmentHits(
  geom: THREE.BufferGeometry,
  alignment: ScanAlignment,
  planeAxis: PlaneAxis,
  planePosition: number,
  tolerance: number,
): { hitCount: number; hitRatio: number; sampleCount: number } {
  const localPoints = sampleLocalPoints(geom, REPORT_SAMPLES);
  if (!localPoints.length) return { hitCount: 0, hitRatio: 0, sampleCount: 0 };

  const quat = eulerToQuaternion(alignment.rotX, alignment.rotY, alignment.rotZ);
  const pos = new THREE.Vector3(alignment.posX, alignment.posY, alignment.posZ);
  const hitCount = countHits(localPoints, quat, pos, planeAxis, planePosition, tolerance);
  return {
    hitCount,
    hitRatio: hitCount / localPoints.length,
    sampleCount: localPoints.length,
  };
}