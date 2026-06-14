import { describe, it, expect } from 'vitest';
import { createCadTools } from '../src/cad-script/tools';

describe('cad-script three-tool façade (§2)', () => {
  it('run_cad_code → query_geometry isolates "the topmost face"', () => {
    const cad = createCadTools();
    const run = cad.run_cad_code('emit(box(20), "b");');
    expect(run.ok).toBe(true);

    const q = cad.query_geometry({ kind: 'faces', pick: 'max', metricAxis: 'z' });
    expect(q.target).toBe('b');
    expect(q.count).toBe(1);
    const face = q.items[0] as { kind: string; normal: number[] };
    expect(face.kind).toBe('face');
    expect(face.normal[2]).toBeGreaterThan(0.9);
  });

  it('query_geometry defaults to the most recent solid', () => {
    const cad = createCadTools();
    cad.run_cad_code('emit(box(10), "a"); emit(cylinder(5, 30), "b");');
    const q = cad.query_geometry({ kind: 'faces' });
    expect(q.target).toBe('b');
  });

  it('render_view frames the model from each requested view', () => {
    const cad = createCadTools();
    cad.run_cad_code('emit(box(20), "b");');
    const r = cad.render_view(['front', 'iso']);
    expect(r.views.map((v) => v.view)).toEqual(['front', 'iso']);
    for (const v of r.views) expect(v.distance).toBeGreaterThan(0);
    expect(r.bounds!.size[0]).toBeCloseTo(20, 1);
  });

  it('list reports the emitted bodies; reset clears them', () => {
    const cad = createCadTools();
    cad.run_cad_code('emit(box(10), "a"); store.x = 1;');
    expect(cad.list()).toEqual([{ name: 'a', kind: 'solid' }]);
    cad.reset();
    expect(cad.list()).toEqual([]);
    expect(cad.context.store).toEqual({});
  });

  it('query_geometry on an empty context returns no target', () => {
    const cad = createCadTools();
    const q = cad.query_geometry({ kind: 'faces' });
    expect(q.target).toBeNull();
    expect(q.count).toBe(0);
  });
});
