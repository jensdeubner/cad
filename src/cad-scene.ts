/**
 * Fusion-style scene hierarchy: root → components → bodies (mesh groups).
 * Active component/body selection and per-body transforms live here.
 */
import * as THREE from 'three';
import {
  DEFAULT_ALIGNMENT,
  applyAlignment,
  readAlignmentFromObject,
  type ScanAlignment,
} from './scan-align';

import type { BodyKind } from './body-kind';

export type CadComponentId = string;
export type CadBodyId = string;

export const DEFAULT_COMPONENT_ID: CadComponentId = 'comp-0';
export const DEFAULT_BODY_ID: CadBodyId = 'body-0';

/** Lage einer Komponente — Position & Drehung (Fusion: Komponente bewegen). */
export type BodyTransform = ScanAlignment;
export const DEFAULT_BODY_TRANSFORM = DEFAULT_ALIGNMENT;

export interface CadBodyRecord {
  id: CadBodyId;
  componentId: CadComponentId;
  label: string;
  /** Scan, konstruierter Festkörper oder Loft/Negativform */
  bodyKind: BodyKind;
  /** Mesh-Inhalt (solid / wire / points) — Kind der Komponente */
  meshGroup: THREE.Group;
  /** Freie Lage innerhalb der Komponente (Fusion: Körper bewegen). */
  transform: BodyTransform;
  visible: boolean;
  meshBuffer: ArrayBuffer | null;
  displayStride: number;
  geometry: THREE.BufferGeometry | null;
}

export interface CadComponentRecord {
  id: CadComponentId;
  label: string;
  group: THREE.Group;
  alignment: BodyTransform;
  visible: boolean;
}

/**
 * Szene-Hierarchie (Fusion-Style):
 *   Szene → Komponente(n) → Körper (Meshes)
 */
export class CadScene {
  readonly root = new THREE.Group();
  readonly worldMatrix = new THREE.Matrix4();
  bounds = new THREE.Box3();
  size = 100;

  private readonly components = new Map<CadComponentId, CadComponentRecord>();
  private readonly bodies = new Map<CadBodyId, CadBodyRecord>();
  private activeComponentId: CadComponentId = DEFAULT_COMPONENT_ID;
  private activeBodyId: CadBodyId = DEFAULT_BODY_ID;
  private readonly _wm = new THREE.Matrix4();

  constructor(parent: THREE.Scene) {
    this.root.name = 'cad-scene';
    parent.add(this.root);
    const comp = this.createComponent(DEFAULT_COMPONENT_ID, 'Komponente 1');
    this.createBody(comp.id, DEFAULT_BODY_ID, 'Körper 1');
  }

  createComponent(id: CadComponentId, label: string): CadComponentRecord {
    const group = new THREE.Group();
    group.name = id;
    this.root.add(group);
    const record: CadComponentRecord = {
      id,
      label,
      group,
      alignment: { ...DEFAULT_BODY_TRANSFORM },
      visible: true,
    };
    this.components.set(id, record);
    return record;
  }

  nextBodyId(componentId: CadComponentId): CadBodyId {
    const used = new Set(this.listBodies(componentId).map((b) => b.id));
    let n = used.size;
    let id: CadBodyId = `body-${n}`;
    while (used.has(id) || this.bodies.has(id)) {
      n += 1;
      id = `body-${n}`;
    }
    return id;
  }

  createBody(componentId: CadComponentId, bodyId: CadBodyId, label: string): CadBodyRecord {
    const comp = this.components.get(componentId);
    if (!comp) throw new Error(`Komponente ${componentId} fehlt`);
    const meshGroup = new THREE.Group();
    meshGroup.name = bodyId;
    comp.group.add(meshGroup);
    const record: CadBodyRecord = {
      id: bodyId,
      componentId,
      label,
      bodyKind: 'scan',
      meshGroup,
      transform: { ...DEFAULT_BODY_TRANSFORM },
      visible: true,
      meshBuffer: null,
      displayStride: 80,
      geometry: null,
    };
    this.bodies.set(bodyId, record);
    return record;
  }

  getComponent(id: CadComponentId): CadComponentRecord | undefined {
    return this.components.get(id);
  }

  getBody(id: CadBodyId): CadBodyRecord | undefined {
    return this.bodies.get(id);
  }

  getActiveComponent(): CadComponentRecord {
    return this.components.get(this.activeComponentId)!;
  }

  getActiveBody(): CadBodyRecord {
    return this.bodies.get(this.activeBodyId)!;
  }

  setActiveComponent(id: CadComponentId): void {
    if (!this.components.has(id)) return;
    this.activeComponentId = id;
    const bodies = this.listBodies(id);
    if (bodies.length && !bodies.some((b) => b.id === this.activeBodyId)) {
      this.activeBodyId = bodies[0].id;
    }
  }

  setActiveBody(id: CadBodyId): void {
    const body = this.bodies.get(id);
    if (!body) return;
    this.activeBodyId = id;
    this.activeComponentId = body.componentId;
  }

  listComponents(): CadComponentRecord[] {
    return [...this.components.values()];
  }

  listBodies(componentId?: CadComponentId): CadBodyRecord[] {
    const list = [...this.bodies.values()];
    return componentId ? list.filter((b) => b.componentId === componentId) : list;
  }

  componentForBody(bodyId: CadBodyId): CadComponentRecord | undefined {
    const body = this.bodies.get(bodyId);
    return body ? this.components.get(body.componentId) : undefined;
  }

  getComponentWorldMatrix(componentId: CadComponentId): THREE.Matrix4 {
    const comp = this.components.get(componentId);
    if (!comp) return this._wm.identity();
    comp.group.updateMatrixWorld(true);
    return this._wm.copy(comp.group.matrixWorld);
  }

  getBodyWorldMatrix(bodyId: CadBodyId): THREE.Matrix4 {
    const body = this.bodies.get(bodyId);
    if (!body) return this._wm.identity();
    const comp = this.components.get(body.componentId);
    if (!comp) return this._wm.identity();
    comp.group.updateMatrixWorld(true);
    body.meshGroup.updateMatrixWorld(true);
    return this._wm.copy(body.meshGroup.matrixWorld);
  }

  /** Weltmatrix zum Heften/Loslösen — volle Körperlage (Komponente × Körper). */
  getAttachWorldMatrix(bodyId: CadBodyId): THREE.Matrix4 {
    return this.getBodyWorldMatrix(bodyId);
  }

  applyBodyTransform(bodyId: CadBodyId): void {
    const body = this.bodies.get(bodyId);
    if (!body) return;
    applyAlignment(body.meshGroup, body.transform);
  }

  readBodyTransform(bodyId: CadBodyId): void {
    const body = this.bodies.get(bodyId);
    if (!body) return;
    body.transform = readAlignmentFromObject(body.meshGroup);
  }

  applyAllBodyTransforms(): void {
    for (const body of this.listBodies()) {
      this.applyBodyTransform(body.id);
    }
  }

  updateWorldMatrix(forBodyId: CadBodyId = this.activeBodyId): void {
    this.worldMatrix.copy(this.getBodyWorldMatrix(forBodyId));
  }

  hasMesh(): boolean {
    return this.getActiveBody().meshGroup.children.length > 0;
  }

  applyActiveComponentAlignment(): void {
    const comp = this.getActiveComponent();
    applyAlignment(comp.group, comp.alignment);
    this.updateWorldMatrix();
  }

  readActiveComponentAlignment(): void {
    const comp = this.getActiveComponent();
    comp.alignment = readAlignmentFromObject(comp.group);
    this.updateWorldMatrix();
  }

  removeBody(bodyId: CadBodyId): boolean {
    if (bodyId === DEFAULT_BODY_ID) return false;
    const body = this.bodies.get(bodyId);
    if (!body) return false;
    body.meshGroup.removeFromParent();
    this.bodies.delete(bodyId);
    if (this.activeBodyId === bodyId) {
      const siblings = this.listBodies(body.componentId);
      this.activeBodyId = siblings[0]?.id ?? DEFAULT_BODY_ID;
    }
    return true;
  }
}