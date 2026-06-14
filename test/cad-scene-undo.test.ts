import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  CadScene,
  DEFAULT_COMPONENT_ID,
  DEFAULT_BODY_ID,
  DEFAULT_BODY_TRANSFORM,
} from '../src/cad-scene';
import {
  captureSnapshot,
  cloneContour,
  UndoHistory,
  type AppSnapshot,
} from '../src/undo';
import type { Contour } from '../src/types';
import type { BodyTransform } from '../src/cad-scene';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A bare THREE.Scene is enough as a CadScene parent (no WebGL needed). */
function makeScene(): CadScene {
  return new CadScene(new THREE.Scene());
}

function makeContour(overrides: Partial<Contour> = {}): Contour {
  return {
    id: 'c1',
    componentId: DEFAULT_COMPONENT_ID,
    axis: 'xy',
    position: 0,
    points: [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 2, 3)],
    closed: false,
    color: '#ff0000',
    visible: true,
    ...overrides,
  };
}

function t(over: Partial<BodyTransform> = {}): BodyTransform {
  return { rotX: 0, rotY: 0, rotZ: 0, posX: 0, posY: 0, posZ: 0, ...over };
}

/** Minimal snapshot for UndoHistory tests where contents don't matter. */
function emptySnapshot(tag = 0): AppSnapshot {
  return {
    contours: [],
    activeDraft: null,
    alignment: t(),
    bodyTransforms: { _tag: t({ posX: tag }) },
    sketches: [],
    sketchDimensions: [],
    sketchConstraints: [],
    activeSketchId: null,
  };
}

// ===========================================================================
// CadScene
// ===========================================================================

describe('CadScene constructor / defaults', () => {
  it('creates the default component and body', () => {
    const scene = makeScene();
    expect(scene.getComponent(DEFAULT_COMPONENT_ID)).toBeDefined();
    expect(scene.getBody(DEFAULT_BODY_ID)).toBeDefined();
  });

  it('marks the default component and body as active', () => {
    const scene = makeScene();
    expect(scene.getActiveComponent().id).toBe(DEFAULT_COMPONENT_ID);
    expect(scene.getActiveBody().id).toBe(DEFAULT_BODY_ID);
  });

  it('adds its root group to the parent scene', () => {
    const parent = new THREE.Scene();
    const scene = new CadScene(parent);
    expect(parent.children).toContain(scene.root);
    expect(scene.root.name).toBe('cad-scene');
  });

  it('starts with exactly one component and one body', () => {
    const scene = makeScene();
    expect(scene.listComponents()).toHaveLength(1);
    expect(scene.listBodies()).toHaveLength(1);
  });

  it('default body has scan kind, displayStride 80, null buffer/geometry', () => {
    const scene = makeScene();
    const body = scene.getBody(DEFAULT_BODY_ID)!;
    expect(body.bodyKind).toBe('scan');
    expect(body.displayStride).toBe(80);
    expect(body.meshBuffer).toBeNull();
    expect(body.geometry).toBeNull();
    expect(body.visible).toBe(true);
  });

  it('default body transform equals DEFAULT_BODY_TRANSFORM (by value, fresh copy)', () => {
    const scene = makeScene();
    const body = scene.getBody(DEFAULT_BODY_ID)!;
    expect(body.transform).toEqual(DEFAULT_BODY_TRANSFORM);
    // It is a copy, not the shared constant.
    expect(body.transform).not.toBe(DEFAULT_BODY_TRANSFORM);
  });
});

describe('CadScene createComponent / createBody', () => {
  it('createComponent registers and parents the component group under root', () => {
    const scene = makeScene();
    const comp = scene.createComponent('comp-9', 'Extra');
    expect(scene.getComponent('comp-9')).toBe(comp);
    expect(comp.group.name).toBe('comp-9');
    expect(scene.root.children).toContain(comp.group);
  });

  it('createBody parents the mesh group under its component group', () => {
    const scene = makeScene();
    const comp = scene.createComponent('comp-9', 'Extra');
    const body = scene.createBody('comp-9', 'body-x', 'B');
    expect(body.componentId).toBe('comp-9');
    expect(comp.group.children).toContain(body.meshGroup);
    expect(body.meshGroup.name).toBe('body-x');
  });

  it('createBody throws when the component does not exist', () => {
    const scene = makeScene();
    expect(() => scene.createBody('no-such', 'b', 'B')).toThrow();
  });

  it('createComponent gives each component a fresh alignment copy', () => {
    const scene = makeScene();
    const a = scene.createComponent('comp-a', 'A');
    const b = scene.createComponent('comp-b', 'B');
    expect(a.alignment).toEqual(DEFAULT_BODY_TRANSFORM);
    expect(a.alignment).not.toBe(b.alignment);
  });
});

describe('CadScene nextBodyId uniqueness', () => {
  it('returns body-1 for the default (one-body) component', () => {
    const scene = makeScene();
    expect(scene.nextBodyId(DEFAULT_COMPONENT_ID)).toBe('body-1');
  });

  it('does not collide with an already-created body id', () => {
    const scene = makeScene();
    const id = scene.nextBodyId(DEFAULT_COMPONENT_ID);
    scene.createBody(DEFAULT_COMPONENT_ID, id, 'B');
    const next = scene.nextBodyId(DEFAULT_COMPONENT_ID);
    expect(next).not.toBe(id);
    expect(scene.getBody(next)).toBeUndefined();
  });

  it('produces a sequence of distinct ids as bodies are added', () => {
    const scene = makeScene();
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      const id = scene.nextBodyId(DEFAULT_COMPONENT_ID);
      ids.push(id);
      scene.createBody(DEFAULT_COMPONENT_ID, id, `B${i}`);
    }
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(['body-1', 'body-2', 'body-3', 'body-4']);
  });

  it('avoids ids taken in OTHER components too (bodies map is global)', () => {
    const scene = makeScene();
    scene.createComponent('comp-1', 'C1');
    // Park a body named "body-1" in comp-1.
    scene.createBody('comp-1', 'body-1', 'parked');
    // For comp-0 (size 1 -> starts at body-1), body-1 is globally taken, so it skips.
    const id = scene.nextBodyId(DEFAULT_COMPONENT_ID);
    expect(id).not.toBe('body-1');
    expect(scene.getBody(id)).toBeUndefined();
  });

  it('starts numbering from the per-component count, not always at 1', () => {
    const scene = makeScene();
    scene.createComponent('comp-1', 'C1');
    // Empty component -> used.size === 0 -> first candidate body-0, which is
    // globally taken (default body), so it advances to a free id.
    const id = scene.nextBodyId('comp-1');
    expect(scene.getBody(id)).toBeUndefined();
    expect(id).not.toBe(DEFAULT_BODY_ID);
  });
});

describe('CadScene setActiveComponent / setActiveBody', () => {
  it('setActiveComponent switches the active component', () => {
    const scene = makeScene();
    scene.createComponent('comp-1', 'C1');
    scene.createBody('comp-1', 'body-1', 'B1');
    scene.setActiveComponent('comp-1');
    expect(scene.getActiveComponent().id).toBe('comp-1');
  });

  it('setActiveComponent ignores an unknown id (no change)', () => {
    const scene = makeScene();
    scene.setActiveComponent('ghost');
    expect(scene.getActiveComponent().id).toBe(DEFAULT_COMPONENT_ID);
  });

  it('setActiveComponent moves active body to first body of the new component', () => {
    const scene = makeScene();
    scene.createComponent('comp-1', 'C1');
    scene.createBody('comp-1', 'body-7', 'B7');
    scene.setActiveComponent('comp-1');
    // active body (body-0) is not in comp-1, so it picks comp-1's first body.
    expect(scene.getActiveBody().id).toBe('body-7');
  });

  it('setActiveComponent keeps current active body if it belongs to the new component', () => {
    const scene = makeScene();
    scene.createBody(DEFAULT_COMPONENT_ID, 'body-9', 'B9');
    scene.setActiveBody('body-9');
    scene.setActiveComponent(DEFAULT_COMPONENT_ID);
    expect(scene.getActiveBody().id).toBe('body-9');
  });

  it('setActiveComponent on a component with no bodies leaves active body unchanged', () => {
    const scene = makeScene();
    scene.createComponent('comp-empty', 'Empty');
    scene.setActiveComponent('comp-empty');
    // No bodies in comp-empty -> activeBodyId stays at the default body.
    expect(scene.getActiveComponent().id).toBe('comp-empty');
    expect(scene.getActiveBody().id).toBe(DEFAULT_BODY_ID);
  });

  it('setActiveBody switches active body AND its owning component', () => {
    const scene = makeScene();
    scene.createComponent('comp-1', 'C1');
    scene.createBody('comp-1', 'body-1', 'B1');
    scene.setActiveBody('body-1');
    expect(scene.getActiveBody().id).toBe('body-1');
    expect(scene.getActiveComponent().id).toBe('comp-1');
  });

  it('setActiveBody ignores an unknown id (no change)', () => {
    const scene = makeScene();
    scene.setActiveBody('ghost');
    expect(scene.getActiveBody().id).toBe(DEFAULT_BODY_ID);
    expect(scene.getActiveComponent().id).toBe(DEFAULT_COMPONENT_ID);
  });
});

describe('CadScene listBodies filter', () => {
  it('lists all bodies when no component id is given', () => {
    const scene = makeScene();
    scene.createComponent('comp-1', 'C1');
    scene.createBody('comp-1', 'body-1', 'B1');
    scene.createBody('comp-1', 'body-2', 'B2');
    const all = scene.listBodies();
    expect(all.map((b) => b.id).sort()).toEqual(['body-0', 'body-1', 'body-2']);
  });

  it('filters bodies by component id', () => {
    const scene = makeScene();
    scene.createComponent('comp-1', 'C1');
    scene.createBody('comp-1', 'body-1', 'B1');
    const inComp1 = scene.listBodies('comp-1');
    expect(inComp1).toHaveLength(1);
    expect(inComp1[0].id).toBe('body-1');
    expect(scene.listBodies(DEFAULT_COMPONENT_ID).map((b) => b.id)).toEqual([
      'body-0',
    ]);
  });

  it('returns an empty array for a component with no bodies', () => {
    const scene = makeScene();
    scene.createComponent('comp-empty', 'E');
    expect(scene.listBodies('comp-empty')).toEqual([]);
  });

  it('componentForBody resolves a body to its component', () => {
    const scene = makeScene();
    scene.createComponent('comp-1', 'C1');
    scene.createBody('comp-1', 'body-1', 'B1');
    expect(scene.componentForBody('body-1')!.id).toBe('comp-1');
    expect(scene.componentForBody('nope')).toBeUndefined();
  });
});

describe('CadScene removeBody', () => {
  it('refuses to remove the DEFAULT_BODY_ID and returns false', () => {
    const scene = makeScene();
    expect(scene.removeBody(DEFAULT_BODY_ID)).toBe(false);
    expect(scene.getBody(DEFAULT_BODY_ID)).toBeDefined();
  });

  it('returns false for an unknown body id', () => {
    const scene = makeScene();
    expect(scene.removeBody('ghost')).toBe(false);
  });

  it('removes a known non-default body and unparents its mesh group', () => {
    const scene = makeScene();
    const comp = scene.getComponent(DEFAULT_COMPONENT_ID)!;
    const body = scene.createBody(DEFAULT_COMPONENT_ID, 'body-1', 'B1');
    expect(comp.group.children).toContain(body.meshGroup);
    expect(scene.removeBody('body-1')).toBe(true);
    expect(scene.getBody('body-1')).toBeUndefined();
    expect(comp.group.children).not.toContain(body.meshGroup);
  });

  it('reassigns the active body to a sibling when the active body is removed', () => {
    const scene = makeScene();
    scene.createBody(DEFAULT_COMPONENT_ID, 'body-1', 'B1');
    scene.setActiveBody('body-1');
    expect(scene.getActiveBody().id).toBe('body-1');
    scene.removeBody('body-1');
    // The remaining sibling in comp-0 is body-0.
    expect(scene.getActiveBody().id).toBe('body-0');
  });

  it('falls back to DEFAULT_BODY_ID when removing the active body leaves no siblings', () => {
    const scene = makeScene();
    scene.createComponent('comp-1', 'C1');
    scene.createBody('comp-1', 'body-1', 'B1');
    scene.setActiveBody('body-1');
    scene.removeBody('body-1');
    // comp-1 now has no bodies -> activeBodyId falls back to DEFAULT_BODY_ID.
    expect(scene.getActiveBody().id).toBe(DEFAULT_BODY_ID);
  });

  it('does not change the active body when removing a non-active body', () => {
    const scene = makeScene();
    scene.createBody(DEFAULT_COMPONENT_ID, 'body-1', 'B1');
    // active is still body-0
    scene.removeBody('body-1');
    expect(scene.getActiveBody().id).toBe(DEFAULT_BODY_ID);
  });
});

describe('CadScene applyBodyTransform / readBodyTransform round-trip', () => {
  it('applyBodyTransform writes the transform onto the mesh group (deg -> rad, pos)', () => {
    const scene = makeScene();
    const body = scene.getBody(DEFAULT_BODY_ID)!;
    body.transform = t({ rotX: 90, posX: 5, posY: -3, posZ: 2 });
    scene.applyBodyTransform(DEFAULT_BODY_ID);
    expect(body.meshGroup.rotation.x).toBeCloseTo(Math.PI / 2, 6);
    expect(body.meshGroup.position.x).toBeCloseTo(5, 6);
    expect(body.meshGroup.position.y).toBeCloseTo(-3, 6);
    expect(body.meshGroup.position.z).toBeCloseTo(2, 6);
  });

  it('readBodyTransform reads the mesh group back into the record (rad -> deg)', () => {
    const scene = makeScene();
    const body = scene.getBody(DEFAULT_BODY_ID)!;
    body.meshGroup.rotation.set(0, Math.PI, 0, 'XYZ');
    body.meshGroup.position.set(10, 0, -4);
    scene.readBodyTransform(DEFAULT_BODY_ID);
    expect(body.transform.rotY).toBeCloseTo(180, 6);
    expect(body.transform.posX).toBeCloseTo(10, 6);
    expect(body.transform.posZ).toBeCloseTo(-4, 6);
  });

  it('apply -> read round-trips a transform value', () => {
    const scene = makeScene();
    const body = scene.getBody(DEFAULT_BODY_ID)!;
    const original = t({ rotX: 30, rotY: 15, rotZ: -45, posX: 1.5, posY: 2.5, posZ: -3.5 });
    body.transform = { ...original };
    scene.applyBodyTransform(DEFAULT_BODY_ID);
    scene.readBodyTransform(DEFAULT_BODY_ID);
    expect(body.transform.rotX).toBeCloseTo(original.rotX, 4);
    expect(body.transform.rotY).toBeCloseTo(original.rotY, 4);
    expect(body.transform.rotZ).toBeCloseTo(original.rotZ, 4);
    expect(body.transform.posX).toBeCloseTo(original.posX, 6);
    expect(body.transform.posY).toBeCloseTo(original.posY, 6);
    expect(body.transform.posZ).toBeCloseTo(original.posZ, 6);
  });

  it('applyBodyTransform / readBodyTransform are no-ops for an unknown body', () => {
    const scene = makeScene();
    expect(() => scene.applyBodyTransform('ghost')).not.toThrow();
    expect(() => scene.readBodyTransform('ghost')).not.toThrow();
  });
});

// ===========================================================================
// undo.ts — captureSnapshot
// ===========================================================================

describe('captureSnapshot deep-cloning', () => {
  it('clones contours so mutating the original points does not change the snapshot', () => {
    const c = makeContour();
    const snap = captureSnapshot([c], null, t(), {});
    // Mutate the original contour's geometry after capture.
    c.points[0].set(99, 99, 99);
    c.points.push(new THREE.Vector3(7, 7, 7));
    c.closed = true;
    expect(snap.contours[0].points[0].x).toBe(0);
    expect(snap.contours[0].points).toHaveLength(2);
    expect(snap.contours[0].closed).toBe(false);
  });

  it('snapshot contour points are distinct Vector3 instances (cloned)', () => {
    const c = makeContour();
    const snap = captureSnapshot([c], null, t(), {});
    expect(snap.contours[0].points[0]).not.toBe(c.points[0]);
    expect(snap.contours[0].points[0].equals(c.points[0])).toBe(true);
  });

  it('pushing to the original contours array does not grow the snapshot array', () => {
    const contours = [makeContour()];
    const snap = captureSnapshot(contours, null, t(), {});
    contours.push(makeContour({ id: 'c2' }));
    expect(snap.contours).toHaveLength(1);
  });

  it('clones activeDraft when present and leaves it null when absent', () => {
    const draft = makeContour({ id: 'draft' });
    const snap = captureSnapshot([], draft, t(), {});
    draft.points[0].set(50, 50, 50);
    expect(snap.activeDraft).not.toBeNull();
    expect(snap.activeDraft!.points[0].x).toBe(0);

    const snapNoDraft = captureSnapshot([], null, t(), {});
    expect(snapNoDraft.activeDraft).toBeNull();
  });

  it('copies alignment by value (mutating original does not change snapshot)', () => {
    const alignment = t({ posX: 1 });
    const snap = captureSnapshot([], null, alignment, {});
    alignment.posX = 999;
    expect(snap.alignment.posX).toBe(1);
    expect(snap.alignment).not.toBe(alignment);
  });

  it('copies each bodyTransform entry by value', () => {
    const transforms = { 'body-0': t({ posX: 3 }) };
    const snap = captureSnapshot([], null, t(), transforms);
    transforms['body-0'].posX = 777;
    expect(snap.bodyTransforms['body-0'].posX).toBe(3);
    expect(snap.bodyTransforms['body-0']).not.toBe(transforms['body-0']);
  });

  it('deep-copies mesh buffers via slice(0) (independent ArrayBuffer)', () => {
    const buf = new ArrayBuffer(4);
    new Uint8Array(buf).set([1, 2, 3, 4]);
    const snap = captureSnapshot([], null, t(), {}, { 'body-0': buf });
    // Mutate the original buffer's bytes after capture.
    new Uint8Array(buf).set([9, 9, 9, 9]);
    const snapBuf = snap.bodyMeshBuffers!['body-0'];
    expect(snapBuf).not.toBe(buf);
    expect(Array.from(new Uint8Array(snapBuf))).toEqual([1, 2, 3, 4]);
  });

  it('leaves bodyMeshBuffers and bodyKinds undefined when not provided', () => {
    const snap = captureSnapshot([], null, t(), {});
    expect(snap.bodyMeshBuffers).toBeUndefined();
    expect(snap.bodyKinds).toBeUndefined();
  });

  it('copies bodyKinds into a fresh record when provided', () => {
    const kinds = { 'body-0': 'solid' as const };
    const snap = captureSnapshot([], null, t(), {}, undefined, kinds);
    expect(snap.bodyKinds).toEqual({ 'body-0': 'solid' });
    expect(snap.bodyKinds).not.toBe(kinds);
  });

  it('defaults sketches, sketchDimensions, sketchConstraints to empty and activeSketchId to null', () => {
    const snap = captureSnapshot([], null, t(), {});
    expect(snap.sketches).toEqual([]);
    expect(snap.sketchDimensions).toEqual([]);
    expect(snap.sketchConstraints).toEqual([]);
    expect(snap.activeSketchId).toBeNull();
  });

  it('deep-clones sketch constraints (refs are fresh objects)', () => {
    const constraint = {
      id: 'k1',
      sketchId: 's1',
      kind: 'distance' as const,
      refs: [{ contourId: 'c1', pointIndex: 0 }, { contourId: 'c1', pointIndex: 1 }],
      value: 10,
    };
    const snap = captureSnapshot([], null, t(), {}, undefined, undefined, [], 's1', [], [constraint]);
    constraint.refs[0].pointIndex = 99;
    constraint.value = 999;
    expect(snap.sketchConstraints[0]).not.toBe(constraint);
    expect(snap.sketchConstraints[0].refs[0].pointIndex).toBe(0);
    expect(snap.sketchConstraints[0].value).toBe(10);
  });

  it('clones sketch dimensions (a/b are fresh Vector3 instances)', () => {
    const dim = {
      id: 'd1',
      sketchId: 's1',
      kind: 'linear' as const,
      axis: 'xy' as const,
      position: 0,
      a: new THREE.Vector3(0, 0, 0),
      b: new THREE.Vector3(10, 0, 0),
      offset: 5,
      visible: true,
    };
    const snap = captureSnapshot([], null, t(), {}, undefined, undefined, [], 's1', [dim]);
    dim.a.set(123, 0, 0);
    expect(snap.sketchDimensions[0].a).not.toBe(dim.a);
    expect(snap.sketchDimensions[0].a.x).toBe(0);
    expect(snap.activeSketchId).toBe('s1');
  });
});

describe('cloneContour', () => {
  it('normalizes visible !== false to true and defaults optional fields to null', () => {
    const c = makeContour({ visible: undefined as unknown as boolean });
    const clone = cloneContour(c);
    expect(clone.visible).toBe(true);
    expect(clone.sketchId).toBeNull();
    expect(clone.attachedToBodyId).toBeNull();
  });

  it('treats explicit visible:false as false', () => {
    const clone = cloneContour(makeContour({ visible: false }));
    expect(clone.visible).toBe(false);
  });
});

// ===========================================================================
// undo.ts — UndoHistory
// ===========================================================================

describe('UndoHistory push / canUndo / canRedo', () => {
  it('starts empty: cannot undo or redo', () => {
    const h = new UndoHistory();
    expect(h.canUndo()).toBe(false);
    expect(h.canRedo()).toBe(false);
  });

  it('after one push, can undo but not redo', () => {
    const h = new UndoHistory();
    h.push(emptySnapshot(1), 'first');
    expect(h.canUndo()).toBe(true);
    expect(h.canRedo()).toBe(false);
  });

  it('push records a label in the timeline and advances position', () => {
    const h = new UndoHistory();
    h.push(emptySnapshot(1), 'A');
    h.push(emptySnapshot(2), 'B');
    const tl = h.getTimeline();
    expect(tl.steps.map((s) => s.label)).toEqual(['A', 'B']);
    expect(tl.position).toBe(2);
    expect(tl.canUndo).toBe(true);
    expect(tl.canRedo).toBe(false);
  });
});

describe('UndoHistory undo / redo pointer behavior', () => {
  it('takeUndo returns the pushed snapshot and stores current for redo', () => {
    const h = new UndoHistory();
    const s1 = emptySnapshot(1);
    h.push(s1, 'A');
    const current = emptySnapshot(2);
    const restored = h.takeUndo(current);
    expect(restored).toBe(s1);
    expect(h.canRedo()).toBe(true);
    expect(h.canUndo()).toBe(false);
  });

  it('takeRedo returns the snapshot saved by the preceding takeUndo', () => {
    const h = new UndoHistory();
    const s1 = emptySnapshot(1);
    h.push(s1, 'A');
    const current = emptySnapshot(2);
    h.takeUndo(current);
    const redone = h.takeRedo(emptySnapshot(3));
    // takeUndo pushed `current` onto the redo stack.
    expect(redone).toBe(current);
    expect(h.canUndo()).toBe(true);
    expect(h.canRedo()).toBe(false);
  });

  it('takeUndo on empty history returns null and does not create a redo', () => {
    const h = new UndoHistory();
    expect(h.takeUndo(emptySnapshot())).toBeNull();
    expect(h.canRedo()).toBe(false);
  });

  it('takeRedo with nothing to redo returns null', () => {
    const h = new UndoHistory();
    h.push(emptySnapshot(1), 'A');
    expect(h.takeRedo(emptySnapshot())).toBeNull();
  });

  it('undo decrements timeline position; redo increments it', () => {
    const h = new UndoHistory();
    h.push(emptySnapshot(1), 'A');
    h.push(emptySnapshot(2), 'B');
    expect(h.getTimeline().position).toBe(2);
    h.takeUndo(emptySnapshot(99));
    expect(h.getTimeline().position).toBe(1);
    h.takeRedo(emptySnapshot(99));
    expect(h.getTimeline().position).toBe(2);
  });

  it('round-trips through multiple undo then redo steps', () => {
    const h = new UndoHistory();
    const s1 = emptySnapshot(1);
    const s2 = emptySnapshot(2);
    h.push(s1, 'A');
    h.push(s2, 'B');
    const cur = emptySnapshot(3);
    expect(h.takeUndo(cur)).toBe(s2);
    expect(h.takeUndo(cur)).toBe(s1);
    expect(h.canUndo()).toBe(false);
    // Two redos available now.
    expect(h.takeRedo(cur)).toBeTruthy();
    expect(h.takeRedo(cur)).toBeTruthy();
    expect(h.canRedo()).toBe(false);
  });
});

describe('UndoHistory redo cleared after a new push', () => {
  it('a push after an undo discards the redo stack', () => {
    const h = new UndoHistory();
    h.push(emptySnapshot(1), 'A');
    h.takeUndo(emptySnapshot(2));
    expect(h.canRedo()).toBe(true);
    h.push(emptySnapshot(3), 'C');
    expect(h.canRedo()).toBe(false);
  });

  it('a push after an undo rewrites the timeline labels from the current position', () => {
    const h = new UndoHistory();
    h.push(emptySnapshot(1), 'A');
    h.push(emptySnapshot(2), 'B');
    h.takeUndo(emptySnapshot(9)); // position -> 1
    h.push(emptySnapshot(3), 'C');
    const tl = h.getTimeline();
    // labels truncated to position (1) then 'C' appended -> ['A', 'C'].
    expect(tl.steps.map((s) => s.label)).toEqual(['A', 'C']);
    expect(tl.position).toBe(2);
    expect(tl.canRedo).toBe(false);
  });
});

describe('UndoHistory capacity (max)', () => {
  it('drops the oldest entries once the undo stack exceeds max', () => {
    const h = new UndoHistory(3);
    for (let i = 1; i <= 5; i++) h.push(emptySnapshot(i), `L${i}`);
    // Only the last 3 entries should remain undoable.
    const restored: number[] = [];
    while (h.canUndo()) {
      const s = h.takeUndo(emptySnapshot(0))!;
      restored.push(s.bodyTransforms._tag.posX);
    }
    // takeUndo pops from the end, so newest first: 5,4,3.
    expect(restored).toEqual([5, 4, 3]);
  });

  it('caps the timeline label list at max', () => {
    const h = new UndoHistory(2);
    h.push(emptySnapshot(1), 'A');
    h.push(emptySnapshot(2), 'B');
    h.push(emptySnapshot(3), 'C');
    const tl = h.getTimeline();
    expect(tl.steps).toHaveLength(2);
    expect(tl.steps.map((s) => s.label)).toEqual(['B', 'C']);
    expect(tl.position).toBe(2);
  });

  it('defaults max to 80 when not specified', () => {
    const h = new UndoHistory();
    for (let i = 0; i < 85; i++) h.push(emptySnapshot(i), `L${i}`);
    expect(h.getTimeline().steps).toHaveLength(80);
  });
});

describe('UndoHistory clear', () => {
  it('resets undo, redo, labels and position', () => {
    const h = new UndoHistory();
    h.push(emptySnapshot(1), 'A');
    h.takeUndo(emptySnapshot(2));
    h.clear();
    expect(h.canUndo()).toBe(false);
    expect(h.canRedo()).toBe(false);
    const tl = h.getTimeline();
    expect(tl.steps).toEqual([]);
    expect(tl.position).toBe(0);
  });
});
