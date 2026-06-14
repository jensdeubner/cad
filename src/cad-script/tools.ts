/**
 * cad-script · the three powerful tools (§2 of the architecture doc)
 *
 * The doc is explicit: present the CAD as a *code API the agent writes against*,
 * surfaced through a tiny set of powerful tools rather than dozens of atomic
 * ones — concretely the "Zero-to-CAD" triple:
 *
 *   run_cad_code(code)        execute against persistent sandbox state
 *   query_geometry(selector)  typed selector query → only the relevant geometry
 *   render_view(views)        framed multi-view request for visual feedback
 *
 * `createCadTools()` bundles them around one persistent `CadScriptContext`, so an
 * MCP server (or the in-app console / `window.__cadScript` bridge) can expose
 * exactly this surface. Everything returns plain JSON-serialisable data.
 */
import {
  CadScriptContext,
  createContext,
  runCadCode,
  RunResult,
  emittedBounds,
  EmittedItem,
} from './runtime';
import { Solid } from './solid';
import { runQuery, QuerySpec } from './query';
import { frameViews, CameraFraming, ViewName } from './render';

export interface QueryGeometryRequest extends QuerySpec {
  /** Name of the emitted body to query; defaults to the most recent solid. */
  target?: string;
}

export interface QueryGeometryResult {
  target: string | null;
  count: number;
  items: unknown[];
}

export interface RenderViewResult {
  bounds: { min: number[]; max: number[]; size: number[] } | null;
  views: CameraFraming[];
  /** Filled in by the browser feature when it captures pixels; null headless. */
  images?: { view: ViewName; dataUrl: string }[] | null;
}

export interface CadTools {
  readonly context: CadScriptContext;
  run_cad_code(code: string): RunResult;
  query_geometry(req?: QueryGeometryRequest): QueryGeometryResult;
  render_view(views?: ViewName[]): RenderViewResult;
  /** List the emitted bodies (name + kind). */
  list(): { name: string; kind: 'solid' | 'sdf' }[];
  reset(): void;
}

function lastSolid(ctx: CadScriptContext): EmittedItem | undefined {
  for (let i = ctx.emitted.length - 1; i >= 0; i--) if (ctx.emitted[i].kind === 'solid') return ctx.emitted[i];
  return undefined;
}

function findSolid(ctx: CadScriptContext, name?: string): { name: string; solid: Solid } | null {
  const item = name ? ctx.emitted.find((e) => e.name === name) : lastSolid(ctx);
  if (!item || item.kind !== 'solid') return null;
  return { name: item.name, solid: item.solid };
}

/** Create a fresh tool bundle around a new persistent context. */
export function createCadTools(context: CadScriptContext = createContext()): CadTools {
  return {
    context,

    run_cad_code(code: string): RunResult {
      return runCadCode(code, context);
    },

    query_geometry(req: QueryGeometryRequest = {}): QueryGeometryResult {
      const found = findSolid(context, req.target);
      if (!found) return { target: null, count: 0, items: [] };
      const { count, items } = runQuery(found.solid, req);
      return { target: found.name, count, items };
    },

    render_view(views: ViewName[] = ['front', 'top', 'iso']): RenderViewResult {
      const b = emittedBounds(context);
      if (!b) return { bounds: null, views: [], images: null };
      return {
        bounds: { min: b.min, max: b.max, size: b.size },
        views: frameViews(b, views),
        images: null,
      };
    },

    list() {
      return context.emitted.map((e) => ({ name: e.name, kind: e.kind }));
    },

    reset() {
      context.emitted.length = 0;
      context.log.length = 0;
      for (const k of Object.keys(context.store)) delete context.store[k];
    },
  };
}
