/**
 * 2D sketch constraints (#11, Phase 1) — pure data model.
 *
 * This is the foundation for a Fusion-style geometric constraint solver. The
 * solver (`./solver`) is fully unit-tested but intentionally NOT yet wired into
 * the live sketch UI — interactive application + persistence is a separate,
 * deeper step on the sketch core. See `docs/FUSION-360-PARITY.md` #11.
 */

export interface Point2 {
  x: number;
  y: number;
}

export type ConstraintKind =
  | 'coincident' // points[i] == points[j]
  | 'horizontal' // segment points[i]→points[j] is horizontal (equal y)
  | 'vertical' // segment points[i]→points[j] is vertical (equal x)
  | 'parallel' // seg(points[0],points[1]) ∥ seg(points[2],points[3])
  | 'perpendicular' // seg(points[0],points[1]) ⟂ seg(points[2],points[3])
  | 'distance' // |points[i] - points[j]| == value
  | 'fix'; // points[i] pinned to target

export interface Constraint {
  kind: ConstraintKind;
  /** Indices into the points array; their count/meaning depends on `kind`. */
  points: number[];
  /** Target distance for `distance`. */
  value?: number;
  /** Pinned location for `fix`. */
  target?: Point2;
}

/** Convenience constructors. */
export const coincident = (i: number, j: number): Constraint => ({ kind: 'coincident', points: [i, j] });
export const horizontal = (i: number, j: number): Constraint => ({ kind: 'horizontal', points: [i, j] });
export const vertical = (i: number, j: number): Constraint => ({ kind: 'vertical', points: [i, j] });
export const parallel = (i: number, j: number, k: number, l: number): Constraint => ({ kind: 'parallel', points: [i, j, k, l] });
export const perpendicular = (i: number, j: number, k: number, l: number): Constraint => ({ kind: 'perpendicular', points: [i, j, k, l] });
export const distance = (i: number, j: number, value: number): Constraint => ({ kind: 'distance', points: [i, j], value });
export const fix = (i: number, target: Point2): Constraint => ({ kind: 'fix', points: [i], target });

/**
 * Residual vector for a set of points + constraints. A solution is reached when
 * every residual is ~0. `fix` constraints are satisfied by pinning (handled in
 * the solver), so they contribute no residual here.
 */
export function constraintResiduals(points: Point2[], constraints: Constraint[]): number[] {
  const r: number[] = [];
  for (const c of constraints) {
    const p = c.points.map((i) => points[i]);
    switch (c.kind) {
      case 'fix':
        break;
      case 'coincident':
        r.push(p[1].x - p[0].x, p[1].y - p[0].y);
        break;
      case 'horizontal':
        r.push(p[1].y - p[0].y);
        break;
      case 'vertical':
        r.push(p[1].x - p[0].x);
        break;
      case 'distance': {
        const dx = p[1].x - p[0].x;
        const dy = p[1].y - p[0].y;
        r.push(Math.sqrt(dx * dx + dy * dy) - (c.value ?? 0));
        break;
      }
      case 'parallel': {
        const ux = p[1].x - p[0].x, uy = p[1].y - p[0].y;
        const vx = p[3].x - p[2].x, vy = p[3].y - p[2].y;
        r.push(ux * vy - uy * vx); // cross product == 0 when parallel
        break;
      }
      case 'perpendicular': {
        const ux = p[1].x - p[0].x, uy = p[1].y - p[0].y;
        const vx = p[3].x - p[2].x, vy = p[3].y - p[2].y;
        r.push(ux * vx + uy * vy); // dot product == 0 when perpendicular
        break;
      }
    }
  }
  return r;
}
