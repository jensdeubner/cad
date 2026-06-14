import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  emptyStlBuffer,
  stlHasTriangles,
  buildMeshArchive,
  parseMeshArchive,
  syncSceneFromProjectMeta,
  type MeshArchiveEntry,
} from '../src/project-io';
import { CadScene } from '../src/cad-scene';
import type { ProjectMeta, ProjectComponent } from '../src/project-file';

// Default ids baked into CadScene's constructor.
const DEFAULT_COMPONENT_ID = 'comp-0';
const DEFAULT_BODY_ID = 'body-0';

const IDENTITY_TRANSFORM = {
  rotX: 0,
  rotY: 0,
  rotZ: 0,
  posX: 0,
  posY: 0,
  posZ: 0,
};

// ---------------------------------------------------------------------------
// emptyStlBuffer / stlHasTriangles
// ---------------------------------------------------------------------------
describe('emptyStlBuffer', () => {
  it('returns an 84-byte buffer (80-byte header + 4-byte count)', () => {
    const buf = emptyStlBuffer();
    expect(buf).toBeInstanceOf(ArrayBuffer);
    expect(buf.byteLength).toBe(84);
  });

  it('writes a zero triangle count at byte offset 80 (little-endian)', () => {
    const buf = emptyStlBuffer();
    expect(new DataView(buf).getUint32(80, true)).toBe(0);
  });

  it('produces a buffer that stlHasTriangles reports as empty', () => {
    expect(stlHasTriangles(emptyStlBuffer())).toBe(false);
  });
});

describe('stlHasTriangles', () => {
  it('is false for a buffer shorter than 84 bytes even with junk bytes', () => {
    const buf = new ArrayBuffer(83);
    new Uint8Array(buf).fill(0xff);
    expect(stlHasTriangles(buf)).toBe(false);
  });

  it('is false for an empty/zero-length buffer', () => {
    expect(stlHasTriangles(new ArrayBuffer(0))).toBe(false);
  });

  it('is false when the triangle count field at offset 80 is zero', () => {
    const buf = new ArrayBuffer(84);
    new DataView(buf).setUint32(80, 0, true);
    expect(stlHasTriangles(buf)).toBe(false);
  });

  it('is true when length >= 84 and the count field is > 0', () => {
    const buf = new ArrayBuffer(84);
    new DataView(buf).setUint32(80, 1, true);
    expect(stlHasTriangles(buf)).toBe(true);
  });

  it('reads the count as little-endian (big-endian one is detected, not value 1)', () => {
    const buf = new ArrayBuffer(84);
    // Big-endian 1 == little-endian 0x01000000, which is still > 0.
    new DataView(buf).setUint32(80, 1, false);
    expect(stlHasTriangles(buf)).toBe(true);
    expect(new DataView(buf).getUint32(80, true)).toBe(0x01000000);
  });

  it('exactly 84 bytes is the minimum that can report triangles', () => {
    const buf = new ArrayBuffer(84);
    new DataView(buf).setUint32(80, 42, true);
    expect(buf.byteLength).toBe(84);
    expect(stlHasTriangles(buf)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildMeshArchive / parseMeshArchive
// ---------------------------------------------------------------------------
function entry(id: string, stl: number[]): MeshArchiveEntry {
  return { id, stl: new Uint8Array(stl) };
}

describe('buildMeshArchive', () => {
  it('writes the entry count at offset 0 (little-endian)', () => {
    const out = buildMeshArchive([entry('a', [1, 2]), entry('bb', [3])]);
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    expect(view.getUint32(0, true)).toBe(2);
  });

  it('computes total size = 4 + sum(2 + idBytes + 4 + stlBytes)', () => {
    // ids 'a' (1 byte) and 'bb' (2 bytes); stl lengths 2 and 1.
    // 4 + (2 + 1 + 4 + 2) + (2 + 2 + 4 + 1) = 4 + 9 + 9 = 22
    const out = buildMeshArchive([entry('a', [1, 2]), entry('bb', [3])]);
    expect(out.byteLength).toBe(22);
  });

  it('produces just the 4-byte count header for an empty entry list', () => {
    const out = buildMeshArchive([]);
    expect(out.byteLength).toBe(4);
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    expect(view.getUint32(0, true)).toBe(0);
  });

  it('encodes multi-byte (UTF-8) ids by byte length, not code-point length', () => {
    // 'ü' encodes to 2 UTF-8 bytes.
    const out = buildMeshArchive([entry('ü', [9])]);
    // 4 + (2 + 2 + 4 + 1) = 13
    expect(out.byteLength).toBe(13);
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    expect(view.getUint16(4, true)).toBe(2); // idBytes.length
  });
});

describe('buildMeshArchive <-> parseMeshArchive round-trip', () => {
  it('round-trips a single entry exactly', () => {
    const entries = [entry('body-0', [10, 20, 30])];
    const parsed = parseMeshArchive(buildMeshArchive(entries));
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe('body-0');
    expect(Array.from(parsed[0].stl)).toEqual([10, 20, 30]);
  });

  it('round-trips multiple entries preserving order and bytes', () => {
    const entries = [
      entry('comp-0:body-0', [1, 2, 3, 4]),
      entry('b', []),
      entry('cccc', [255, 0, 128]),
    ];
    const parsed = parseMeshArchive(buildMeshArchive(entries));
    expect(parsed.map((e) => e.id)).toEqual(['comp-0:body-0', 'b', 'cccc']);
    expect(Array.from(parsed[0].stl)).toEqual([1, 2, 3, 4]);
    expect(Array.from(parsed[1].stl)).toEqual([]);
    expect(Array.from(parsed[2].stl)).toEqual([255, 0, 128]);
  });

  it('round-trips a non-ASCII id', () => {
    const parsed = parseMeshArchive(buildMeshArchive([entry('Körper-ü', [7])]));
    expect(parsed[0].id).toBe('Körper-ü');
    expect(Array.from(parsed[0].stl)).toEqual([7]);
  });

  it('round-trips an empty archive to an empty array', () => {
    expect(parseMeshArchive(buildMeshArchive([]))).toEqual([]);
  });

  it('parsed stl is a copy (slice), not a view sharing the source buffer', () => {
    const archive = buildMeshArchive([entry('a', [5, 6])]);
    const parsed = parseMeshArchive(archive);
    // slice() copies; mutating the source archive after parsing must not change it.
    archive.fill(0);
    expect(Array.from(parsed[0].stl)).toEqual([5, 6]);
  });
});

describe('parseMeshArchive guards (truncated / malformed input)', () => {
  it('returns [] when the buffer is shorter than the 4-byte count header', () => {
    expect(parseMeshArchive(new Uint8Array([1, 2, 3]))).toEqual([]);
    expect(parseMeshArchive(new Uint8Array(0))).toEqual([]);
  });

  it('returns [] when count is 0 even if trailing bytes exist', () => {
    const buf = new Uint8Array(8); // count=0, plus 4 junk bytes
    expect(parseMeshArchive(buf)).toEqual([]);
  });

  it('stops early (partial result) when the id-length field is truncated', () => {
    // Header claims 2 entries. First entry is valid; second is cut off
    // right after the first, leaving no room for the 2-byte idLen field.
    const valid = buildMeshArchive([entry('a', [1])]);
    // valid layout: [count=1][idLen=1]['a'][stlLen=1][1] -> 12 bytes
    // Re-stamp count to 2 and append a single dangling byte (offset+2 > len).
    const grown = new Uint8Array(valid.byteLength + 1);
    grown.set(valid, 0);
    new DataView(grown.buffer).setUint32(0, 2, true);
    const parsed = parseMeshArchive(grown);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe('a');
  });

  it('stops early when the declared id + stl-length header overruns the buffer', () => {
    // count=1, idLen=10 but no room for 10 id bytes + 4-byte stlLen.
    const buf = new Uint8Array(6);
    const view = new DataView(buf.buffer);
    view.setUint32(0, 1, true); // count = 1
    view.setUint16(4, 10, true); // idLen = 10 (overruns)
    expect(parseMeshArchive(buf)).toEqual([]);
  });

  it('stops early when the declared stl length overruns the buffer', () => {
    // count=1, idLen=1, id='a', stlLen=99 but no stl bytes present.
    const buf = new Uint8Array(4 + 2 + 1 + 4);
    const view = new DataView(buf.buffer);
    view.setUint32(0, 1, true); // count
    view.setUint16(4, 1, true); // idLen
    buf[6] = 'a'.charCodeAt(0); // id
    view.setUint32(7, 99, true); // stlLen overruns
    expect(parseMeshArchive(buf)).toEqual([]);
  });

  it('keeps fully-decoded leading entries and drops the truncated tail', () => {
    // Two valid entries concatenated, then chop the last stl byte and
    // leave count at 2 -> first entry survives, second is dropped.
    const full = buildMeshArchive([entry('x', [1, 2]), entry('y', [3, 4])]);
    const truncated = full.slice(0, full.byteLength - 1);
    const parsed = parseMeshArchive(truncated);
    expect(parsed.map((e) => e.id)).toEqual(['x']);
    expect(Array.from(parsed[0].stl)).toEqual([1, 2]);
  });

  it('round-trips correctly through a Uint8Array view with a non-zero byteOffset', () => {
    const archive = buildMeshArchive([entry('z', [8, 9])]);
    const padded = new Uint8Array(archive.byteLength + 5);
    padded.set(archive, 5);
    const view = padded.subarray(5); // byteOffset = 5
    const parsed = parseMeshArchive(view);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe('z');
    expect(Array.from(parsed[0].stl)).toEqual([8, 9]);
  });
});

// ---------------------------------------------------------------------------
// syncSceneFromProjectMeta (pure scene-graph reconciliation; no WASM/GL)
// ---------------------------------------------------------------------------
function makeScene(): CadScene {
  // CadScene only adds THREE.Group objects — safe in jsdom (no canvas/WebGL).
  return new CadScene(new THREE.Scene());
}

function meta(partial: Partial<ProjectMeta> & { components: ProjectComponent[] }): ProjectMeta {
  return {
    version: 6,
    activeComponentId: DEFAULT_COMPONENT_ID,
    activeBodyId: DEFAULT_BODY_ID,
    planeAxis: 'y' as ProjectMeta['planeAxis'],
    planePosition: 0,
    hitTolerance: 1,
    contours: [],
    ...partial,
  };
}

function comp(
  id: string,
  label: string,
  bodies: { id: string; label: string }[],
): ProjectComponent {
  return {
    id,
    label,
    alignment: { ...IDENTITY_TRANSFORM },
    bodies: bodies.map((b) => ({ id: b.id, label: b.label, displayStride: 80 })),
  };
}

describe('syncSceneFromProjectMeta', () => {
  it('creates a new component and its bodies that the scene did not have', () => {
    const scene = makeScene();
    syncSceneFromProjectMeta(
      scene,
      meta({
        activeComponentId: 'comp-1',
        activeBodyId: 'body-9',
        components: [comp('comp-1', 'Neu', [{ id: 'body-9', label: 'Körper X' }])],
      }),
    );
    const created = scene.getComponent('comp-1');
    expect(created).toBeDefined();
    expect(created!.label).toBe('Neu');
    expect(scene.getBody('body-9')).toBeDefined();
    expect(scene.getBody('body-9')!.label).toBe('Körper X');
  });

  it('updates the label of an existing component instead of recreating it', () => {
    const scene = makeScene();
    const before = scene.getComponent(DEFAULT_COMPONENT_ID);
    syncSceneFromProjectMeta(
      scene,
      meta({
        components: [comp(DEFAULT_COMPONENT_ID, 'Umbenannt', [{ id: DEFAULT_BODY_ID, label: 'B' }])],
      }),
    );
    const after = scene.getComponent(DEFAULT_COMPONENT_ID);
    expect(after).toBe(before); // same record object, not recreated
    expect(after!.label).toBe('Umbenannt');
  });

  it('updates the label of an existing body instead of recreating it', () => {
    const scene = makeScene();
    const beforeBody = scene.getBody(DEFAULT_BODY_ID);
    syncSceneFromProjectMeta(
      scene,
      meta({
        components: [comp(DEFAULT_COMPONENT_ID, 'Komponente 1', [{ id: DEFAULT_BODY_ID, label: 'Neuer Name' }])],
      }),
    );
    const afterBody = scene.getBody(DEFAULT_BODY_ID);
    expect(afterBody).toBe(beforeBody);
    expect(afterBody!.label).toBe('Neuer Name');
  });

  it('removes scene bodies that are not present in the project meta', () => {
    const scene = makeScene();
    scene.createBody(DEFAULT_COMPONENT_ID, 'body-extra', 'Extra');
    expect(scene.getBody('body-extra')).toBeDefined();
    syncSceneFromProjectMeta(
      scene,
      meta({
        components: [comp(DEFAULT_COMPONENT_ID, 'Komponente 1', [{ id: DEFAULT_BODY_ID, label: 'B' }])],
      }),
    );
    expect(scene.getBody('body-extra')).toBeUndefined();
    expect(scene.getBody(DEFAULT_BODY_ID)).toBeDefined();
  });

  it('does NOT remove the default body-0 even when meta omits it (removeBody guard)', () => {
    // CadScene.removeBody returns false for DEFAULT_BODY_ID, so body-0 survives
    // a meta that only lists a different body. Pinning current behavior.
    const scene = makeScene();
    syncSceneFromProjectMeta(
      scene,
      meta({
        components: [comp(DEFAULT_COMPONENT_ID, 'Komponente 1', [{ id: 'body-7', label: 'Sieben' }])],
      }),
    );
    expect(scene.getBody(DEFAULT_BODY_ID)).toBeDefined(); // not removed
    expect(scene.getBody('body-7')).toBeDefined(); // newly created
  });

  it('sets the active component and active body from meta', () => {
    const scene = makeScene();
    syncSceneFromProjectMeta(
      scene,
      meta({
        activeComponentId: 'comp-2',
        activeBodyId: 'body-2',
        components: [comp('comp-2', 'Zwei', [{ id: 'body-2', label: 'B2' }])],
      }),
    );
    expect(scene.getActiveComponent().id).toBe('comp-2');
    expect(scene.getActiveBody().id).toBe('body-2');
  });

  it('reconciles add + remove together: keeps wanted bodies, drops the rest', () => {
    const scene = makeScene();
    scene.createBody(DEFAULT_COMPONENT_ID, 'body-keep', 'Keep');
    scene.createBody(DEFAULT_COMPONENT_ID, 'body-drop', 'Drop');
    syncSceneFromProjectMeta(
      scene,
      meta({
        components: [
          comp(DEFAULT_COMPONENT_ID, 'Komponente 1', [
            { id: 'body-keep', label: 'Keep' },
            { id: 'body-new', label: 'New' },
          ]),
        ],
      }),
    );
    expect(scene.getBody('body-keep')).toBeDefined();
    expect(scene.getBody('body-new')).toBeDefined();
    expect(scene.getBody('body-drop')).toBeUndefined();
  });
});
