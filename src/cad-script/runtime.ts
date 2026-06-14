/**
 * cad-script · runtime (`run_cad_code`, §2 the powerful code-execution tool)
 *
 * The architecture doc's central recommendation: don't expose dozens of atomic
 * CAD tools — expose ONE code-execution surface the agent writes against, with a
 * persistent sandbox state across calls, and close the loop with
 * write→execute→observe→repair. This module is that surface.
 *
 * - `createContext()` holds the persistent state: a `store` object scripts can
 *   stash variables on between calls, the accumulated `emitted` bodies, and a log.
 * - `runCadCode(code, ctx)` runs the script with the API injected, captures the
 *   bodies it emitted *this call*, and returns a structured, observable result —
 *   real volumes/triangle-counts for solids, or an ACTIONABLE error (§3), never a
 *   raw stack trace.
 *
 * Execution uses `new Function`, i.e. it runs arbitrary JS in the page — the same
 * trust level as the existing `window.__cadDebug.runFeature` dev bridge. It is a
 * local, single-user browser tool; no network capability is handed to scripts.
 */
import { Solid } from './solid';
import { Select } from './selectors';
import { Mesh, Vec3, bounds as meshBounds } from './mesh';
import { rect, circle, polygon, regularPolygon, slot } from './sketch';
import { sdf as sdfApi } from './sdf';
import type { Sdf } from './sdf';
import { meshSdf } from './surface-nets';
import { runQuery, QuerySpec } from './query';
import { ActionableError, CadError, toActionableError } from './errors';

export interface EmittedSolid {
  kind: 'solid';
  name: string;
  solid: Solid;
}
export interface EmittedSdf {
  kind: 'sdf';
  name: string;
  sdf: Sdf;
  min: Vec3;
  max: Vec3;
  res: number;
}
export type EmittedItem = EmittedSolid | EmittedSdf;

export interface CadScriptContext {
  /** Persistent variable bag bound as `this`/`store` across `runCadCode` calls. */
  store: Record<string, unknown>;
  /** All bodies emitted so far (across calls). */
  emitted: EmittedItem[];
  /** Rolling log of `log(...)` lines. */
  log: string[];
}

export function createContext(): CadScriptContext {
  return { store: {}, emitted: [], log: [] };
}

export interface CreatedSummary {
  name: string;
  kind: 'solid' | 'sdf';
  triangleCount?: number;
  volume?: number;
  bounds?: { min: Vec3; max: Vec3; size: Vec3 };
  watertight?: boolean;
  resolution?: number;
}

export interface RunResult {
  ok: boolean;
  created: CreatedSummary[];
  log: string[];
  error?: ActionableError;
  durationMs: number;
}

interface EmitOptions {
  min?: Vec3;
  max?: Vec3;
  res?: number;
}

/** Build the API object injected into a script run. */
function buildApi(ctx: CadScriptContext) {
  const emit = (value: unknown, name?: string, opts: EmitOptions = {}): void => {
    const idx = ctx.emitted.length + 1;
    if (value instanceof Solid) {
      if (value.triangleCount() === 0) {
        throw new CadError('EMPTY_RESULT', 'Körper ist leer (0 Dreiecke) — vorherige Boolesche Operation prüfen.');
      }
      const b = value.bounds();
      if (b && b.min.some((v) => Number.isNaN(v))) {
        throw new CadError('NAN_GEOMETRY', 'Körper enthält NaN-Koordinaten — Eingabewerte prüfen.');
      }
      ctx.emitted.push({ kind: 'solid', name: name ?? `Solid ${idx}`, solid: value });
      return;
    }
    if (typeof value === 'function') {
      if (!opts.min || !opts.max) {
        throw new CadError(
          'NO_OUTPUT',
          'SDF emit braucht Grenzen: emit(sdf, name, { min:[x,y,z], max:[x,y,z], res }).',
        );
      }
      ctx.emitted.push({
        kind: 'sdf',
        name: name ?? `SDF ${idx}`,
        sdf: value as Sdf,
        min: opts.min,
        max: opts.max,
        res: opts.res ?? 48,
      });
      return;
    }
    throw new CadError('NO_OUTPUT', 'emit() erwartet einen Solid oder eine SDF-Funktion.');
  };

  return {
    // Track A — primitive factories
    box: (sx?: number, sy?: number, sz?: number) => Solid.box(sx, sy, sz),
    cylinder: (r?: number, h?: number, seg?: number) => Solid.cylinder(r, h, seg),
    sphere: (r?: number, u?: number, v?: number) => Solid.sphere(r, u, v),
    cone: (r?: number, h?: number, seg?: number) => Solid.cone(r, h, seg),
    torus: (R?: number, r?: number, seg?: number, sides?: number) => Solid.torus(R, r, seg, sides),
    wedge: (sx?: number, sy?: number, h?: number) => Solid.wedge(sx, sy, h),
    extrude: Solid.extrude.bind(Solid),
    revolve: Solid.revolve.bind(Solid),
    Solid,
    Select,
    // Track A — 2D profiles
    rect,
    circle,
    polygon,
    regularPolygon,
    slot,
    // Track B — SDF
    sdf: sdfApi,
    meshSdf,
    // tools
    emit,
    query: (solid: Solid, spec?: QuerySpec) => runQuery(solid, spec),
    log: (...args: unknown[]) => {
      ctx.log.push(args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '));
    },
    store: ctx.store,
  };
}

/** Time source — `Date.now` in browser/tests; safe here (not a Workflow script). */
function now(): number {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

/**
 * Execute a cad-script against `ctx`. Returns a structured, observable result;
 * never throws for script-level errors (they come back as `result.error`).
 */
export function runCadCode(code: string, ctx: CadScriptContext): RunResult {
  const api = buildApi(ctx);
  const argNames = Object.keys(api);
  const argValues = Object.values(api);
  const startEmit = ctx.emitted.length;
  const startLog = ctx.log.length;
  const t0 = now();

  let error: ActionableError | undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const fn = new Function(...argNames, `'use strict';\n${code}\n`);
    fn.apply(ctx.store, argValues);
  } catch (err) {
    error = toActionableError(err);
  }

  const durationMs = Math.round((now() - t0) * 100) / 100;
  const created = ctx.emitted.slice(startEmit).map(summarize);
  const log = ctx.log.slice(startLog);
  return { ok: !error, created, log, error, durationMs };
}

function summarize(item: EmittedItem): CreatedSummary {
  if (item.kind === 'solid') {
    const b = item.solid.bounds();
    return {
      name: item.name,
      kind: 'solid',
      triangleCount: item.solid.triangleCount(),
      volume: Math.round(item.solid.volume() * 100) / 100,
      bounds: b ? { min: b.min, max: b.max, size: b.size } : undefined,
      watertight: item.solid.isWatertight(),
    };
  }
  return {
    name: item.name,
    kind: 'sdf',
    resolution: item.res,
    bounds: {
      min: item.min,
      max: item.max,
      size: [item.max[0] - item.min[0], item.max[1] - item.min[1], item.max[2] - item.min[2]],
    },
  };
}

/** Mesh an emitted item to a neutral `Mesh` (SDFs are polygonized on demand). */
export function emittedToMesh(item: EmittedItem): Mesh {
  if (item.kind === 'solid') return item.solid.mesh;
  return meshSdf(item.sdf, { min: item.min, max: item.max, res: item.res });
}

/** Combined bounds over all emitted bodies (for camera framing). */
export function emittedBounds(ctx: CadScriptContext) {
  const merged: number[] = [];
  for (const item of ctx.emitted) {
    if (item.kind === 'solid') {
      merged.push(...item.solid.mesh.positions);
    } else {
      merged.push(item.min[0], item.min[1], item.min[2], item.max[0], item.max[1], item.max[2]);
    }
  }
  return meshBounds({ positions: merged, indices: [] });
}
