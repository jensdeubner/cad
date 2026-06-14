/**
 * Live sketch constraints (#11, Phase 2) — binds the pure 2D constraint solver
 * (`./solver`) to the app's contour geometry.
 *
 * A {@link SketchConstraint} references sketch points by `(contourId, pointIndex)`
 * exactly like {@link import('../sketch-dimension').SketchDimension} references
 * edges. `solveSketchConstraints` projects every referenced contour point into
 * the sketch plane's 2D frame, runs the Levenberg–Marquardt solver, and writes
 * the solved positions back to the contour points (mutating them in place via
 * `Vector3.copy`, so existing references stay valid).
 *
 * This module is pure (no DOM / scene); the interactive tool + persistence wire
 * it into `main.ts`.
 */
import type { Constraint, ConstraintKind } from './constraints';
import { solveConstraints } from './solver';
import { projectToSketch2D, sketch2DToWorld, sketchPlaneFrame } from '../sketch-geometry';
import type { Contour, PlaneAxis } from '../types';

export type SketchConstraintKind = ConstraintKind;

/** Reference to a single sketch point: a contour and an index into its points. */
export interface SketchPointRef {
  contourId: string;
  pointIndex: number;
}

export interface SketchConstraint {
  id: string;
  sketchId: string;
  kind: SketchConstraintKind;
  /**
   * Referenced points. Count depends on `kind`:
   *  coincident/horizontal/vertical/distance → 2, parallel/perpendicular → 4,
   *  fix → 1. (See {@link CONSTRAINT_POINT_COUNT}.)
   */
  refs: SketchPointRef[];
  /** Target distance in mm for `distance`. */
  value?: number;
  /** Pinned location in sketch UV for `fix` (captured at creation). */
  target?: [number, number];
}

/** Number of points each constraint kind references. */
export const CONSTRAINT_POINT_COUNT: Record<SketchConstraintKind, number> = {
  coincident: 2,
  horizontal: 2,
  vertical: 2,
  parallel: 4,
  perpendicular: 4,
  distance: 2,
  fix: 1,
};

export function requiredPointCount(kind: SketchConstraintKind): number {
  return CONSTRAINT_POINT_COUNT[kind];
}

/** Does the constraint kind need a user-supplied numeric value? */
export function constraintNeedsValue(kind: SketchConstraintKind): boolean {
  return kind === 'distance';
}

export function cloneSketchConstraint(c: SketchConstraint): SketchConstraint {
  return {
    id: c.id,
    sketchId: c.sketchId,
    kind: c.kind,
    refs: c.refs.map((r) => ({ contourId: r.contourId, pointIndex: r.pointIndex })),
    value: c.value,
    target: c.target ? [c.target[0], c.target[1]] : undefined,
  };
}

/** True when every referenced point resolves to an existing contour point. */
export function constraintRefsValid(contours: Contour[], c: SketchConstraint): boolean {
  const byId = new Map(contours.map((ct) => [ct.id, ct]));
  if (c.refs.length < requiredPointCount(c.kind)) return false;
  for (let i = 0; i < requiredPointCount(c.kind); i++) {
    const r = c.refs[i];
    const ct = byId.get(r.contourId);
    if (!ct || r.pointIndex < 0 || r.pointIndex >= ct.points.length) return false;
  }
  return true;
}

/** Drop every constraint that references a (now deleted) contour. */
export function dropConstraintsForContour(
  constraints: SketchConstraint[],
  contourId: string,
): SketchConstraint[] {
  return constraints.filter((c) => c.refs.every((r) => r.contourId !== contourId));
}

/**
 * Keep constraint point references valid after a contour point is DELETED:
 * constraints touching the removed index are dropped; higher indices shift down.
 */
export function remapConstraintsAfterPointDelete(
  constraints: SketchConstraint[],
  contourId: string,
  deletedIndex: number,
): SketchConstraint[] {
  const out: SketchConstraint[] = [];
  for (const c of constraints) {
    let drop = false;
    const refs = c.refs.map((r) => {
      if (r.contourId !== contourId) return { ...r };
      if (r.pointIndex === deletedIndex) {
        drop = true;
        return { ...r };
      }
      if (r.pointIndex > deletedIndex) return { contourId: r.contourId, pointIndex: r.pointIndex - 1 };
      return { ...r };
    });
    if (!drop) out.push({ ...c, refs, target: c.target ? [c.target[0], c.target[1]] : undefined });
  }
  return out;
}

/**
 * Keep constraint point references valid after a contour point is INSERTED at
 * `insertedIndex`: existing indices >= insertedIndex shift up by one.
 */
export function remapConstraintsAfterPointInsert(
  constraints: SketchConstraint[],
  contourId: string,
  insertedIndex: number,
): SketchConstraint[] {
  return constraints.map((c) => ({
    ...c,
    target: c.target ? ([c.target[0], c.target[1]] as [number, number]) : undefined,
    refs: c.refs.map((r) =>
      r.contourId === contourId && r.pointIndex >= insertedIndex
        ? { contourId: r.contourId, pointIndex: r.pointIndex + 1 }
        : { ...r },
    ),
  }));
}

export interface SketchSolveResult {
  /** A solver actually ran (>=1 valid constraint). */
  ran: boolean;
  /** Any contour point moved. */
  changed: boolean;
  converged: boolean;
  maxResidual: number;
  /** Distinct sketch points that participated in the solve. */
  solvedPoints: number;
}

interface ResolvedPoint {
  contour: Contour;
  pointIndex: number;
}

/**
 * Solve all constraints for a sketch against its contour geometry, writing the
 * result back into the contour points (in place). Constraints whose refs point
 * at missing contours/points are skipped. Returns solve metrics.
 */
export function solveSketchConstraints(
  contours: Contour[],
  constraints: SketchConstraint[],
): SketchSolveResult {
  const empty: SketchSolveResult = {
    ran: false,
    changed: false,
    converged: true,
    maxResidual: 0,
    solvedPoints: 0,
  };
  if (constraints.length === 0) return empty;

  const byId = new Map(contours.map((c) => [c.id, c]));
  const globalIndex = new Map<string, number>();
  const resolved: ResolvedPoint[] = [];
  const pts: { x: number; y: number }[] = [];

  // All points in one sketch share a plane. Project + write back through ONE
  // reference frame (the first referenced contour's). A reference into a contour
  // on a different plane is rejected, so a corrupt/programmatic cross-plane
  // constraint can't silently mix incompatible 2D coordinate systems.
  let refFrame: ReturnType<typeof sketchPlaneFrame> | null = null;
  let refAxis: PlaneAxis | null = null;
  let refPos = 0;

  const ensurePoint = (r: SketchPointRef): number | null => {
    const c = byId.get(r.contourId);
    if (!c || r.pointIndex < 0 || r.pointIndex >= c.points.length) return null;
    if (refAxis === null) {
      refAxis = c.axis;
      refPos = c.position;
      refFrame = sketchPlaneFrame(c.axis, c.position);
    } else if (c.axis !== refAxis || c.position !== refPos) {
      return null; // cross-plane reference — skip this constraint
    }
    const key = `${r.contourId}#${r.pointIndex}`;
    const existing = globalIndex.get(key);
    if (existing !== undefined) return existing;
    const [u, v] = projectToSketch2D(c.points[r.pointIndex], refFrame!);
    if (!Number.isFinite(u) || !Number.isFinite(v)) return null; // NaN/Inf guard
    const gi = pts.length;
    pts.push({ x: u, y: v });
    resolved.push({ contour: c, pointIndex: r.pointIndex });
    globalIndex.set(key, gi);
    return gi;
  };

  const solverConstraints: Constraint[] = [];
  for (const sc of constraints) {
    const need = requiredPointCount(sc.kind);
    if (sc.refs.length < need) continue;
    // A distance with no finite value would collapse the points to coincident — skip.
    if (sc.kind === 'distance' && !(typeof sc.value === 'number' && Number.isFinite(sc.value))) continue;
    const idx: number[] = [];
    let ok = true;
    for (let i = 0; i < need; i++) {
      const gi = ensurePoint(sc.refs[i]);
      if (gi === null) {
        ok = false;
        break;
      }
      idx.push(gi);
    }
    if (!ok) continue;
    switch (sc.kind) {
      case 'coincident':
      case 'horizontal':
      case 'vertical':
        solverConstraints.push({ kind: sc.kind, points: [idx[0], idx[1]] });
        break;
      case 'parallel':
      case 'perpendicular':
        solverConstraints.push({ kind: sc.kind, points: [idx[0], idx[1], idx[2], idx[3]] });
        break;
      case 'distance':
        solverConstraints.push({ kind: 'distance', points: [idx[0], idx[1]], value: sc.value });
        break;
      case 'fix': {
        const target = sc.target ?? [pts[idx[0]].x, pts[idx[0]].y];
        if (!Number.isFinite(target[0]) || !Number.isFinite(target[1])) break; // NaN guard
        solverConstraints.push({
          kind: 'fix',
          points: [idx[0]],
          target: { x: target[0], y: target[1] },
        });
        break;
      }
    }
  }

  if (solverConstraints.length === 0 || pts.length === 0 || !refFrame) return empty;

  const result = solveConstraints(pts, solverConstraints);

  let changed = false;
  for (let i = 0; i < resolved.length; i++) {
    const { contour, pointIndex } = resolved[i];
    const world = sketch2DToWorld(result.points[i].x, result.points[i].y, refFrame);
    if (!contour.points[pointIndex].equals(world)) changed = true;
    contour.points[pointIndex].copy(world);
  }

  return {
    ran: true,
    changed,
    converged: result.converged,
    maxResidual: result.maxResidual,
    solvedPoints: resolved.length,
  };
}
