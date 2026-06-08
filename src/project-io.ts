/**
 * .stpr mesh archive helpers (binary v2) and STL utilities.
 */
import type { CadScene } from './cad-scene';
import type { CadBodyId } from './cad-scene';
import type { ProjectMeta } from './project-file';

export function emptyStlBuffer(): ArrayBuffer {
  const buf = new ArrayBuffer(84);
  new DataView(buf).setUint32(80, 0, true);
  return buf;
}

export function stlHasTriangles(buf: ArrayBuffer): boolean {
  return buf.byteLength >= 84 && new DataView(buf).getUint32(80, true) > 0;
}

export interface MeshArchiveEntry {
  id: CadBodyId;
  stl: Uint8Array;
}

/** Build multi-body mesh archive for pack_project_multi. */
export function buildMeshArchive(entries: MeshArchiveEntry[]): Uint8Array {
  let size = 4;
  const idBytesList: Uint8Array[] = [];
  for (const e of entries) {
    const idBytes = new TextEncoder().encode(e.id);
    idBytesList.push(idBytes);
    size += 2 + idBytes.length + 4 + e.stl.byteLength;
  }

  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  view.setUint32(0, entries.length, true);
  let offset = 4;

  for (let i = 0; i < entries.length; i++) {
    const idBytes = idBytesList[i]!;
    const stl = entries[i]!.stl;
    view.setUint16(offset, idBytes.length, true);
    offset += 2;
    out.set(idBytes, offset);
    offset += idBytes.length;
    view.setUint32(offset, stl.byteLength, true);
    offset += 4;
    out.set(stl, offset);
    offset += stl.byteLength;
  }

  return out;
}

export function parseMeshArchive(data: Uint8Array): MeshArchiveEntry[] {
  if (data.byteLength < 4) return [];
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const count = view.getUint32(0, true);
  const decoder = new TextDecoder();
  const entries: MeshArchiveEntry[] = [];
  let offset = 4;

  for (let i = 0; i < count; i++) {
    if (offset + 2 > data.byteLength) break;
    const idLen = view.getUint16(offset, true);
    offset += 2;
    if (offset + idLen + 4 > data.byteLength) break;
    const id = decoder.decode(data.subarray(offset, offset + idLen));
    offset += idLen;
    const stlLen = view.getUint32(offset, true);
    offset += 4;
    if (offset + stlLen > data.byteLength) break;
    entries.push({
      id,
      stl: data.slice(offset, offset + stlLen),
    });
    offset += stlLen;
  }

  return entries;
}

/** Align runtime scene hierarchy with project meta before restoring meshes. */
export function syncSceneFromProjectMeta(cadScene: CadScene, meta: ProjectMeta): void {
  for (const comp of meta.components) {
    const existing = cadScene.getComponent(comp.id);
    if (!existing) cadScene.createComponent(comp.id, comp.label);
    else existing.label = comp.label;

    const wanted = new Set(comp.bodies.map((b) => b.id));
    for (const body of [...cadScene.listBodies(comp.id)]) {
      if (!wanted.has(body.id)) cadScene.removeBody(body.id);
    }
    for (const pb of comp.bodies) {
      const body = cadScene.getBody(pb.id);
      if (!body) cadScene.createBody(comp.id, pb.id, pb.label);
      else body.label = pb.label;
    }
  }

  cadScene.setActiveComponent(meta.activeComponentId);
  cadScene.setActiveBody(meta.activeBodyId);
}