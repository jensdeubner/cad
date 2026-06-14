import { describe, it, expect } from 'vitest';
import { createContext, runCadCode } from '../src/cad-script/runtime';

describe('cad-script runtime (run_cad_code, §2)', () => {
  it('runs a script and reports an observable solid summary', () => {
    const ctx = createContext();
    const r = runCadCode('emit(box(10), "cube");', ctx);
    expect(r.ok).toBe(true);
    expect(r.created).toHaveLength(1);
    expect(r.created[0].name).toBe('cube');
    expect(r.created[0].kind).toBe('solid');
    expect(r.created[0].triangleCount).toBe(12);
    expect(r.created[0].volume).toBeCloseTo(1000, 0);
    expect(r.created[0].watertight).toBe(true);
  });

  it('captures log output for the observe step', () => {
    const ctx = createContext();
    const r = runCadCode('log("hello", 42);', ctx);
    expect(r.log).toContain('hello 42');
  });

  it('keeps persistent state across calls (store + this binding)', () => {
    const ctx = createContext();
    runCadCode('store.n = (store.n || 0) + 1;', ctx);
    runCadCode('this.n = (this.n || 0) + 1;', ctx); // `this` === store
    expect(ctx.store.n).toBe(2);
  });

  it('accumulates emitted bodies across calls', () => {
    const ctx = createContext();
    runCadCode('emit(box(10), "a");', ctx);
    const r2 = runCadCode('emit(sphere(5), "b");', ctx);
    expect(ctx.emitted.map((e) => e.name)).toEqual(['a', 'b']);
    expect(r2.created).toHaveLength(1); // only this call's output
  });

  it('returns an ACTIONABLE error, not a raw stack, for an unknown name', () => {
    const ctx = createContext();
    const r = runCadCode('emit(boxx(5));', ctx);
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('UNKNOWN_NAME');
    expect(r.error?.message).toContain('boxx');
    expect(r.error?.message).not.toBe('boxx is not defined');
  });

  it('flags an empty body with an actionable EMPTY_RESULT', () => {
    const ctx = createContext();
    const r = runCadCode('emit(Solid.fromMesh({ positions: [], indices: [] }));', ctx);
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('EMPTY_RESULT');
  });

  it('requires bounds when emitting an SDF', () => {
    const ctx = createContext();
    const r = runCadCode('emit(sdf.sphere(10), "blob");', ctx);
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('NO_OUTPUT');
  });
});
