/**
 * cad-script · query DSL for `query_geometry`
 *
 * A tiny declarative spec over the typed selectors (§5) so an agent (or an MCP
 * `query_geometry` tool) can ask "the topmost face" or "edges past x = 5"
 * without writing imperative selector chains — and get back only the relevant
 * slice of geometry, keeping the context lean (§2). Shared by the in-script
 * `query()` helper and the `tools.ts` façade.
 */
import { Solid } from './solid';
import { Select, Axis, Shape, FaceInfo, EdgeInfo, shapesToJSON } from './selectors';

export interface QuerySpec {
  /** What to select. Default `faces`. */
  kind?: 'faces' | 'edges' | 'vertices';
  /** Provenance filter (faces only). Default `all`. */
  select?: 'all' | 'last' | 'new';
  /** Keep shapes whose representative point on `axis` lies in [min,max]. */
  filter?: { axis: Axis; min?: number; max?: number };
  /** Faces only: keep faces whose normal points along `dir`. */
  normal?: { dir: [number, number, number]; tolDeg?: number };
  /** Sort ascending by an axis or an intrinsic metric. */
  sort?: Axis | 'area' | 'length';
  /** Reduce to the single extreme shape by `metricAxis` (default z). */
  pick?: 'max' | 'min';
  metricAxis?: Axis;
}

const AXIS_I: Record<Axis, number> = { x: 0, y: 1, z: 2 };

function dot(a: [number, number, number], b: [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Run a query spec against a solid and return a compact JSON description. */
export function runQuery(solid: Solid, spec: QuerySpec = {}): { count: number; items: unknown[] } {
  const kind = spec.kind ?? 'faces';
  let shapes: Shape[];
  if (kind === 'edges') {
    shapes = solid.edges().items;
  } else if (kind === 'vertices') {
    shapes = solid.vertices().items;
  } else {
    const sel = spec.select === 'last' || spec.select === 'new' ? Select.LAST : Select.ALL;
    shapes = solid.faces(sel).items;
  }

  if (spec.filter) {
    const i = AXIS_I[spec.filter.axis];
    const lo = spec.filter.min ?? -Infinity;
    const hi = spec.filter.max ?? Infinity;
    shapes = shapes.filter((s) => s.position[i] >= lo - 1e-6 && s.position[i] <= hi + 1e-6);
  }

  if (spec.normal) {
    const d = spec.normal.dir;
    const dl = Math.hypot(d[0], d[1], d[2]) || 1;
    const dn: [number, number, number] = [d[0] / dl, d[1] / dl, d[2] / dl];
    const cosTol = Math.cos(((spec.normal.tolDeg ?? 1) * Math.PI) / 180);
    shapes = shapes.filter((s) => s.kind === 'face' && dot((s as FaceInfo).normal, dn) >= cosTol);
  }

  const metric = (s: Shape): number => {
    if (spec.sort === 'area') return s.kind === 'face' ? (s as FaceInfo).area : 0;
    if (spec.sort === 'length') return s.kind === 'edge' ? (s as EdgeInfo).length : 0;
    return s.position[AXIS_I[(spec.sort as Axis) ?? 'z']];
  };
  if (spec.sort) shapes = shapes.slice().sort((a, b) => metric(a) - metric(b));

  if (spec.pick && shapes.length) {
    const i = AXIS_I[spec.metricAxis ?? 'z'];
    let best = shapes[0];
    for (const s of shapes) {
      if (spec.pick === 'max' ? s.position[i] > best.position[i] : s.position[i] < best.position[i]) best = s;
    }
    shapes = [best];
  }

  return shapesToJSON(shapes);
}
