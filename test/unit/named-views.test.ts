import { describe, it, expect } from 'vitest';
import { NamedViewStore, defaultSlotName, type NamedView } from '../../src/nav/named-views';
import { type ViewState } from '../../src/nav/views';

function mkState(x: number): ViewState {
  return { pos: [x, x + 1, x + 2], target: [0, 0, 0], up: [0, 1, 0] };
}

describe('NamedViewStore', () => {
  it('add() returns a record and grows size()', () => {
    const s = new NamedViewStore();
    expect(s.size()).toBe(0);
    const a = s.add('A', mkState(10));
    expect(a.name).toBe('A');
    expect(a.state.pos).toEqual([10, 11, 12]);
    expect(s.size()).toBe(1);
    s.add('B', mkState(20));
    expect(s.size()).toBe(2);
  });

  it('assigns stable, unique, monotonic ids (nv1, nv2, …)', () => {
    const s = new NamedViewStore();
    const a = s.add('A', mkState(1));
    const b = s.add('B', mkState(2));
    const c = s.add('C', mkState(3));
    expect(a.id).toBe('nv1');
    expect(b.id).toBe('nv2');
    expect(c.id).toBe('nv3');
    const ids = new Set([a.id, b.id, c.id]);
    expect(ids.size).toBe(3);
  });

  it('does not reuse ids after a removal', () => {
    const s = new NamedViewStore();
    const a = s.add('A', mkState(1)); // nv1
    s.add('B', mkState(2)); // nv2
    expect(s.remove(a.id)).toBe(true);
    const c = s.add('C', mkState(3)); // nv3, NOT nv1 again
    expect(c.id).toBe('nv3');
    expect(s.get('nv1')).toBeUndefined();
  });

  it('list() returns insertion order', () => {
    const s = new NamedViewStore();
    s.add('first', mkState(1));
    s.add('second', mkState(2));
    s.add('third', mkState(3));
    expect(s.list().map((v) => v.name)).toEqual(['first', 'second', 'third']);
  });

  it('list() returns a copy (mutating it does not affect the store)', () => {
    const s = new NamedViewStore();
    s.add('A', mkState(1));
    const copy = s.list();
    copy.push({ id: 'fake', name: 'X', state: mkState(9) } as NamedView);
    expect(s.size()).toBe(1);
    expect(s.list()).toHaveLength(1);
  });

  it('get() finds by id and returns undefined for unknown ids', () => {
    const s = new NamedViewStore();
    const a = s.add('A', mkState(7));
    expect(s.get(a.id)?.name).toBe('A');
    expect(s.get(a.id)?.state.pos).toEqual([7, 8, 9]);
    expect(s.get('nope')).toBeUndefined();
  });

  it('remove() returns true on success, false for unknown id', () => {
    const s = new NamedViewStore();
    const a = s.add('A', mkState(1));
    s.add('B', mkState(2));
    expect(s.remove(a.id)).toBe(true);
    expect(s.size()).toBe(1);
    expect(s.list().map((v) => v.name)).toEqual(['B']);
    expect(s.remove(a.id)).toBe(false); // already gone
    expect(s.remove('does-not-exist')).toBe(false);
    expect(s.size()).toBe(1);
  });

  it('clear() empties the store', () => {
    const s = new NamedViewStore();
    s.add('A', mkState(1));
    s.add('B', mkState(2));
    expect(s.size()).toBe(2);
    s.clear();
    expect(s.size()).toBe(0);
    expect(s.list()).toEqual([]);
  });

  it('clear() keeps ids monotonic for subsequently added views', () => {
    const s = new NamedViewStore();
    s.add('A', mkState(1)); // nv1
    s.add('B', mkState(2)); // nv2
    s.clear();
    const c = s.add('C', mkState(3));
    expect(c.id).toBe('nv3');
  });
});

describe('defaultSlotName', () => {
  it('returns the number as a string', () => {
    expect(defaultSlotName(1)).toBe('1');
    expect(defaultSlotName(42)).toBe('42');
  });
});
