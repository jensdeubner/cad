import { describe, it, expect } from 'vitest';
import { toActionableError, CadError, emptyBooleanError } from '../src/cad-script/errors';

describe('cad-script actionable errors (§3)', () => {
  it('maps ReferenceError → UNKNOWN_NAME with the offending name', () => {
    const e = toActionableError(new ReferenceError('foo is not defined'));
    expect(e.code).toBe('UNKNOWN_NAME');
    expect(e.message).toContain('foo');
  });

  it('maps SyntaxError → SYNTAX_ERROR', () => {
    const e = toActionableError(new SyntaxError('Unexpected token )'));
    expect(e.code).toBe('SYNTAX_ERROR');
  });

  it('maps TypeError → TYPE_ERROR', () => {
    const e = toActionableError(new TypeError('x.cut is not a function'));
    expect(e.code).toBe('TYPE_ERROR');
  });

  it('passes a CadError through untouched', () => {
    const e = toActionableError(new CadError('NON_MANIFOLD', 'kaputt', 'detail'));
    expect(e.code).toBe('NON_MANIFOLD');
    expect(e.message).toBe('kaputt');
    expect(e.detail).toBe('detail');
  });

  it('builds the canonical empty-boolean error', () => {
    const e = emptyBooleanError('cut');
    expect(e).toBeInstanceOf(CadError);
    expect(e.code).toBe('EMPTY_RESULT');
    expect(e.message.toLowerCase()).toContain('subtrak');
  });

  it('never returns a bare stack for an arbitrary throw', () => {
    const e = toActionableError('boom');
    expect(e.code).toBe('RUNTIME_ERROR');
    expect(e.message).toContain('boom');
  });
});
