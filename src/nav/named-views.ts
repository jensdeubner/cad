/**
 * Multi-slot named-view store — a PURE data structure (no DOM, no scene
 * mutation, no three.js handles). The feature layer wraps this with camera
 * capture/apply + a floating panel; this module only owns identity + ordering
 * so it can be unit-tested with hard numeric assertions.
 *
 * Unlike the single unnamed slot in `nav-views`, this keeps an ordered list of
 * user-saved camera views, each with a stable unique id and a display name.
 */
import { type ViewState } from './views';

/** A single saved camera view: stable id, display name, captured state. */
export interface NamedView {
  id: string;
  name: string;
  state: ViewState;
}

/**
 * Ordered collection of named views. Ids are assigned from a monotonic counter
 * (`nv1`, `nv2`, …) so they are stable and unique within a store instance and
 * never reused after removal — deterministic, no Math.random / Date.
 */
export class NamedViewStore {
  private views: NamedView[] = [];
  private counter = 0;

  /** Append a new view; returns the created record (with its fresh id). */
  add(name: string, state: ViewState): NamedView {
    this.counter += 1;
    const view: NamedView = { id: `nv${this.counter}`, name, state };
    this.views.push(view);
    return view;
  }

  /** All views in insertion order (a shallow copy — safe to iterate/mutate). */
  list(): NamedView[] {
    return this.views.slice();
  }

  /** Look up a view by id, or `undefined` if no such id exists. */
  get(id: string): NamedView | undefined {
    return this.views.find((v) => v.id === id);
  }

  /** Remove by id. Returns `true` if a view was removed, `false` otherwise. */
  remove(id: string): boolean {
    const idx = this.views.findIndex((v) => v.id === id);
    if (idx === -1) return false;
    this.views.splice(idx, 1);
    return true;
  }

  /** Drop every saved view (counter is left intact so ids stay monotonic). */
  clear(): void {
    this.views.length = 0;
  }

  /** Number of saved views. */
  size(): number {
    return this.views.length;
  }
}

/** Default slot label seed: the slot number as a string (feature wraps via i18n). */
export function defaultSlotName(n: number): string {
  return String(n);
}
