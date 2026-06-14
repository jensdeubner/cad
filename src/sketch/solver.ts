/**
 * 2D geometric constraint solver (#11, Phase 1) — pure math, no DOM/scene.
 *
 * Levenberg–Marquardt over the constraint residual vector with a numerical
 * Jacobian. Handles coincident / horizontal / vertical / parallel /
 * perpendicular / distance / fix uniformly. `fix` points are pinned (their DOFs
 * are removed from the solve). Under-constrained systems are regularised by the
 * LM damping, so the solver returns a nearby valid configuration rather than
 * failing. Fully unit-tested; not yet wired into the live sketch UI.
 */
import { constraintResiduals, type Constraint, type Point2 } from './constraints';

export interface SolveOptions {
  iterations?: number;
  tolerance?: number;
}

export interface SolveResult {
  points: Point2[];
  iterations: number;
  /** Largest absolute residual after solving (0 = perfectly satisfied). */
  maxResidual: number;
  converged: boolean;
}

/** Solve a dense linear system A·x = b (Gaussian elimination, partial pivot). */
function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-12) return null; // singular
    [M[col], M[pivot]] = [M[pivot], M[col]];
    const pv = M[col][col];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / pv;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = 0; i < n; i++) x[i] = M[i][n] / M[i][i];
  return x;
}

function norm2(v: number[]): number {
  let s = 0;
  for (const x of v) s += x * x;
  return Math.sqrt(s);
}

/**
 * Adjust `points` to satisfy `constraints` as closely as possible. Returns a new
 * points array (the input is not mutated).
 */
export function solveConstraints(
  points: Point2[],
  constraints: Constraint[],
  opts: SolveOptions = {},
): SolveResult {
  const iterations = opts.iterations ?? 100;
  const tol = opts.tolerance ?? 1e-8;
  const pts: Point2[] = points.map((p) => ({ x: p.x, y: p.y }));

  // Pin fixed points and remove their DOFs from the solve.
  const pinned = new Set<number>();
  for (const c of constraints) {
    if (c.kind === 'fix' && c.target) {
      pts[c.points[0]] = { x: c.target.x, y: c.target.y };
      pinned.add(c.points[0]);
    }
  }
  const dof: Array<[number, 'x' | 'y']> = [];
  for (let i = 0; i < pts.length; i++) {
    if (!pinned.has(i)) {
      dof.push([i, 'x']);
      dof.push([i, 'y']);
    }
  }
  const n = dof.length;
  const getDof = (k: number): number => pts[dof[k][0]][dof[k][1]];
  const setDof = (k: number, v: number): void => {
    pts[dof[k][0]][dof[k][1]] = v;
  };

  let lambda = 1e-3;
  let iter = 0;
  for (; iter < iterations && n > 0; iter++) {
    const r = constraintResiduals(pts, constraints);
    const m = r.length;
    const rNorm = norm2(r);
    if (rNorm < tol || m === 0) break;

    // Numerical Jacobian J (m × n) via forward differences.
    const eps = 1e-7;
    const J: number[][] = Array.from({ length: m }, () => new Array(n).fill(0));
    for (let k = 0; k < n; k++) {
      const orig = getDof(k);
      setDof(k, orig + eps);
      const rp = constraintResiduals(pts, constraints);
      setDof(k, orig);
      for (let row = 0; row < m; row++) J[row][k] = (rp[row] - r[row]) / eps;
    }

    // Normal equations (JᵀJ + λ·diag(JᵀJ))·Δ = -Jᵀr.
    const A: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
    const b = new Array(n).fill(0);
    for (let a = 0; a < n; a++) {
      for (let c = 0; c < n; c++) {
        let s = 0;
        for (let row = 0; row < m; row++) s += J[row][a] * J[row][c];
        A[a][c] = s;
      }
      let s = 0;
      for (let row = 0; row < m; row++) s += J[row][a] * r[row];
      b[a] = -s;
    }
    for (let a = 0; a < n; a++) A[a][a] += lambda * (A[a][a] || 1);

    const delta = solveLinear(A, b);
    if (!delta) {
      lambda *= 10;
      if (lambda > 1e12) break;
      continue;
    }

    const backup = dof.map((_, k) => getDof(k));
    for (let k = 0; k < n; k++) setDof(k, backup[k] + delta[k]);
    const newNorm = norm2(constraintResiduals(pts, constraints));
    if (newNorm < rNorm) {
      lambda = Math.max(lambda * 0.5, 1e-12);
    } else {
      for (let k = 0; k < n; k++) setDof(k, backup[k]); // reject step
      lambda *= 4;
      if (lambda > 1e12) break;
    }
  }

  const finalR = constraintResiduals(pts, constraints);
  const maxResidual = finalR.reduce((mx, v) => Math.max(mx, Math.abs(v)), 0);
  return { points: pts, iterations: iter, maxResidual, converged: maxResidual < 1e-5 };
}
