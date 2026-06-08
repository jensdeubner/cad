import { inferBodyKindFromLabel, type BodyKind } from './body-kind';
import type { BodyTransform } from './cad-scene';
import { DEFAULT_BODY_ID, DEFAULT_COMPONENT_ID, type CadBodyId, type CadComponentId } from './cad-scene';
import { migrateContourAttachment } from './contour-body';
import type { SketchDimensionKind, SketchUnit } from './sketch-dimension';
import type { ContourPointType, PlaneAxis } from './types';

export const PROJECT_EXTENSION = '.stpr';
export const PROJECT_VERSION = 6;

export type { BodyKind };

export interface ProjectHandle {
  in: [number, number, number];
  out: [number, number, number];
}

export interface ProjectSketch {
  id: string;
  componentId?: CadComponentId;
  label: string;
  axis: PlaneAxis;
  position: number;
  visible: boolean;
}

export interface ProjectSketchDimension {
  id: string;
  sketchId: string;
  kind: SketchDimensionKind;
  axis: PlaneAxis;
  position: number;
  a: [number, number, number];
  b: [number, number, number];
  offset: number;
  visible: boolean;
  contourId?: string;
  pointIndex0?: number;
  pointIndex1?: number;
}

export interface ProjectContour {
  id: string;
  componentId?: CadComponentId;
  sketchId?: string | null;
  axis: PlaneAxis;
  position: number;
  points: [number, number, number][];
  closed: boolean;
  color: string;
  visible: boolean;
  attachedToBodyId?: string | null;
  attachedToScan?: boolean;
  pointTypes?: ContourPointType[];
  handles?: (ProjectHandle | null)[];
}

export interface ProjectBody {
  id: CadBodyId;
  label: string;
  displayStride: number;
  bodyKind?: BodyKind;
  /** Freie Körperlage innerhalb der Komponente */
  transform?: BodyTransform;
  /** Festkörper-Füllfarbe (Nachzeichnen), z. B. "#c4ccd8" */
  solidColor?: string;
  /** Nachzeichnen-Modus beim Speichern aktiv */
  traceAssist?: boolean;
}

export interface ProjectComponent {
  id: CadComponentId;
  label: string;
  alignment: BodyTransform;
  bodies: ProjectBody[];
}

export interface ProjectMeta {
  version: number;
  activeComponentId: CadComponentId;
  activeBodyId: CadBodyId;
  components: ProjectComponent[];
  planeAxis: PlaneAxis;
  planePosition: number;
  hitTolerance: number;
  contours: ProjectContour[];
  sketches?: ProjectSketch[];
  sketchDimensions?: ProjectSketchDimension[];
  sketchUnit?: SketchUnit;
  activeSketchId?: string | null;
  /** @deprecated v1/v2 */
  scanLabel?: string;
  displayStride?: number;
  alignment?: BodyTransform;
  bodies?: Array<ProjectBody & { alignment?: BodyTransform }>;
}

export function buildProjectMeta(input: {
  activeComponentId: CadComponentId;
  activeBodyId: CadBodyId;
  components: ProjectComponent[];
  planeAxis: PlaneAxis;
  planePosition: number;
  hitTolerance: number;
  contours: ProjectContour[];
  sketches?: ProjectSketch[];
  sketchDimensions?: ProjectSketchDimension[];
  sketchUnit?: SketchUnit;
  activeSketchId?: string | null;
}): ProjectMeta {
  return {
    version: PROJECT_VERSION,
    activeComponentId: input.activeComponentId,
    activeBodyId: input.activeBodyId,
    components: input.components.map((c) => ({
      ...c,
      alignment: { ...c.alignment },
      bodies: c.bodies.map((b) => ({ ...b })),
    })),
    planeAxis: input.planeAxis,
    planePosition: input.planePosition,
    hitTolerance: input.hitTolerance,
    contours: input.contours.map((c) => ({
      ...c,
      points: c.points.map((p) => [p[0], p[1], p[2]] as [number, number, number]),
    })),
    sketches: input.sketches?.map((s) => ({ ...s })),
    sketchDimensions: input.sketchDimensions?.map((d) => ({ ...d })),
    sketchUnit: input.sketchUnit ?? 'mm',
    activeSketchId: input.activeSketchId ?? null,
  };
}

function normalizeContour(c: ProjectContour): ProjectContour {
  return {
    ...c,
    componentId: c.componentId ?? DEFAULT_COMPONENT_ID,
    attachedToBodyId: migrateContourAttachment(c.attachedToScan, c.attachedToBodyId),
  };
}

function migrateV1(data: ProjectMeta): ProjectMeta {
  const label = data.scanLabel ?? 'Körper 1';
  const stride = data.displayStride ?? 80;
  const alignment = data.alignment ?? {
    rotX: 0,
    rotY: 0,
    rotZ: 0,
    posX: 0,
    posY: 0,
    posZ: 0,
  };
  return migrateV2({
    ...data,
    version: 2,
    activeBodyId: DEFAULT_BODY_ID,
    bodies: [{ id: DEFAULT_BODY_ID, label, displayStride: stride, alignment }],
    contours: data.contours ?? [],
  });
}

function ensureBodyKinds(data: ProjectMeta): ProjectMeta {
  return {
    ...data,
    version: PROJECT_VERSION,
    components: data.components.map((c) => ({
      ...c,
      bodies: c.bodies.map((b) => ({
        ...b,
        bodyKind: b.bodyKind ?? inferBodyKindFromLabel(b.label),
      })),
    })),
  };
}

function migrateV4(data: ProjectMeta): ProjectMeta {
  return migrateV6(ensureBodyKinds({ ...data, version: 5 }));
}

function migrateV5(data: ProjectMeta): ProjectMeta {
  return migrateV6(ensureBodyKinds({ ...data, version: 5 }));
}

function migrateV6(data: ProjectMeta): ProjectMeta {
  return { ...ensureBodyKinds(data), version: PROJECT_VERSION };
}

function migrateV2(data: ProjectMeta): ProjectMeta {
  const bodies = (data.bodies ?? []).map((b) => ({
    id: b.id,
    label: b.label,
    displayStride: b.displayStride,
  }));
  const alignment =
    data.components?.[0]?.alignment ??
    (data.bodies?.[0] as { alignment?: BodyTransform })?.alignment ??
    data.alignment ?? { rotX: 0, rotY: 0, rotZ: 0, posX: 0, posY: 0, posZ: 0 };
  const compLabel = data.components?.[0]?.label ?? 'Komponente 1';
  return migrateV4({
    version: 4,
    activeComponentId: data.activeComponentId ?? DEFAULT_COMPONENT_ID,
    activeBodyId: data.activeBodyId ?? bodies[0]?.id ?? DEFAULT_BODY_ID,
    components: [
      {
        id: DEFAULT_COMPONENT_ID,
        label: compLabel,
        alignment,
        bodies: bodies.length ? bodies : [{ id: DEFAULT_BODY_ID, label: 'Körper 1', displayStride: 80 }],
      },
    ],
    planeAxis: data.planeAxis,
    planePosition: data.planePosition,
    hitTolerance: data.hitTolerance,
    contours: (data.contours ?? []).map(normalizeContour),
  });
}

export function parseProjectMeta(json: string): ProjectMeta {
  const data = JSON.parse(json) as ProjectMeta;
  if (!data) throw new Error('Projektdatei ungültig');
  let meta: ProjectMeta;
  if (data.version === 1) meta = migrateV1(data);
  else if (data.version === 2) meta = migrateV2(data);
  else if (data.version === 4) meta = migrateV4(data);
  else if (data.version === 5) meta = migrateV5(data);
  else if (data.version === PROJECT_VERSION) meta = migrateV6(data);
  else throw new Error('Unbekannte Projektversion');
  if (!Array.isArray(meta.contours)) {
    throw new Error('Projektdatei unvollständig (Konturen fehlen)');
  }
  if (!Array.isArray(meta.components) || !meta.components.length) {
    throw new Error('Projektdatei unvollständig (Komponenten fehlen)');
  }
  return {
    ...meta,
    contours: meta.contours.map(normalizeContour),
  };
}