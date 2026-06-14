import { describe, it, expect } from 'vitest';
import {
  PROJECT_VERSION,
  PROJECT_EXTENSION,
  parseProjectMeta,
  buildProjectMeta,
  type ProjectComponent,
  type ProjectContour,
  type ProjectSketch,
  type ProjectSketchDimension,
} from '../src/project-file';

// Default ids used by the migration code.
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

function makeComponent(overrides: Partial<ProjectComponent> = {}): ProjectComponent {
  return {
    id: DEFAULT_COMPONENT_ID,
    label: 'Komponente 1',
    alignment: { ...IDENTITY_TRANSFORM },
    bodies: [{ id: DEFAULT_BODY_ID, label: 'Körper 1', displayStride: 80 }],
    ...overrides,
  };
}

function makeContour(overrides: Partial<ProjectContour> = {}): ProjectContour {
  return {
    id: 'c1',
    axis: 'xy',
    position: 0,
    points: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
    ],
    closed: true,
    color: '#ff0000',
    visible: true,
    ...overrides,
  };
}

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

describe('constants', () => {
  it('PROJECT_VERSION is 6', () => {
    expect(PROJECT_VERSION).toBe(6);
  });

  it('PROJECT_EXTENSION is .stpr', () => {
    expect(PROJECT_EXTENSION).toBe('.stpr');
  });
});

// ----------------------------------------------------------------------------
// Version migrations
// ----------------------------------------------------------------------------

describe('parseProjectMeta version migrations', () => {
  it('migrates v1 (legacy scanLabel/alignment) to current shape', () => {
    const v1 = {
      version: 1,
      scanLabel: 'Scan Körper',
      displayStride: 40,
      alignment: { ...IDENTITY_TRANSFORM, posX: 5 },
      planeAxis: 'z',
      planePosition: 2,
      hitTolerance: 0.3,
      contours: [makeContour()],
    };
    const meta = parseProjectMeta(JSON.stringify(v1));

    // Ends up at current version.
    expect(meta.version).toBe(PROJECT_VERSION);
    // A single default component wrapping the legacy body.
    expect(meta.components).toHaveLength(1);
    expect(meta.components[0].id).toBe(DEFAULT_COMPONENT_ID);
    expect(meta.components[0].label).toBe('Komponente 1');
    expect(meta.components[0].bodies).toHaveLength(1);
    const body = meta.components[0].bodies[0];
    expect(body.id).toBe(DEFAULT_BODY_ID);
    expect(body.label).toBe('Scan Körper');
    expect(body.displayStride).toBe(40);
    // 'Scan Körper' contains none of the solid/loft keywords -> 'scan'.
    expect(body.bodyKind).toBe('scan');
    // Component alignment is carried over from the legacy alignment.
    expect(meta.components[0].alignment.posX).toBe(5);
    // Active ids default.
    expect(meta.activeComponentId).toBe(DEFAULT_COMPONENT_ID);
    expect(meta.activeBodyId).toBe(DEFAULT_BODY_ID);
    // Plane fields carried through.
    expect(meta.planeAxis).toBe('z');
    expect(meta.planePosition).toBe(2);
    expect(meta.hitTolerance).toBeCloseTo(0.3, 6);
  });

  it('v1 defaults scanLabel to "Körper 1", stride to 80, alignment to identity when absent', () => {
    const v1 = {
      version: 1,
      planeAxis: 'y',
      planePosition: 0,
      hitTolerance: 0.5,
      contours: [],
    };
    const meta = parseProjectMeta(JSON.stringify(v1));
    const body = meta.components[0].bodies[0];
    expect(body.label).toBe('Körper 1');
    expect(body.displayStride).toBe(80);
    expect(meta.components[0].alignment).toEqual(IDENTITY_TRANSFORM);
  });

  it('migrates v2 (bodies + flat fields) to current shape, dropping per-body alignment', () => {
    const v2 = {
      version: 2,
      activeBodyId: 'body-7',
      bodies: [
        // includes an alignment that migrateV2 should NOT keep on the body
        { id: 'body-7', label: 'Extrusion 1', displayStride: 25, alignment: { ...IDENTITY_TRANSFORM, posY: 9 } },
      ],
      planeAxis: 'x',
      planePosition: 1,
      hitTolerance: 0.2,
      contours: [makeContour()],
    };
    const meta = parseProjectMeta(JSON.stringify(v2));

    expect(meta.version).toBe(PROJECT_VERSION);
    expect(meta.components).toHaveLength(1);
    expect(meta.components[0].id).toBe(DEFAULT_COMPONENT_ID);
    const body = meta.components[0].bodies[0];
    expect(body.id).toBe('body-7');
    expect(body.label).toBe('Extrusion 1');
    expect(body.displayStride).toBe(25);
    // migrateV2 only keeps {id, label, displayStride} -> per-body alignment is dropped.
    expect(body).not.toHaveProperty('alignment');
    // 'Extrusion 1' contains 'extrusion' -> inferred kind 'solid'.
    expect(body.bodyKind).toBe('solid');
    // The first body's alignment becomes the component alignment.
    expect(meta.components[0].alignment.posY).toBe(9);
    // activeBodyId carried over from the v2 field.
    expect(meta.activeBodyId).toBe('body-7');
    expect(meta.activeComponentId).toBe(DEFAULT_COMPONENT_ID);
  });

  it('v2 with empty bodies falls back to a default body', () => {
    const v2 = {
      version: 2,
      bodies: [],
      planeAxis: 'z',
      planePosition: 0,
      hitTolerance: 0.1,
      contours: [],
    };
    const meta = parseProjectMeta(JSON.stringify(v2));
    expect(meta.components[0].bodies).toHaveLength(1);
    expect(meta.components[0].bodies[0].id).toBe(DEFAULT_BODY_ID);
    expect(meta.components[0].bodies[0].label).toBe('Körper 1');
    expect(meta.components[0].bodies[0].displayStride).toBe(80);
    // activeBodyId falls back to DEFAULT_BODY_ID when no bodies/activeBodyId given.
    expect(meta.activeBodyId).toBe(DEFAULT_BODY_ID);
  });

  it('v3 is NOT handled -> throws (known gap)', () => {
    const v3 = {
      version: 3,
      activeComponentId: DEFAULT_COMPONENT_ID,
      activeBodyId: DEFAULT_BODY_ID,
      components: [makeComponent()],
      planeAxis: 'z',
      planePosition: 0,
      hitTolerance: 0.1,
      contours: [],
    };
    expect(() => parseProjectMeta(JSON.stringify(v3))).toThrow('Unbekannte Projektversion');
  });

  it('migrates v4 (component-shaped) to current shape, inferring missing bodyKind', () => {
    const v4 = {
      version: 4,
      activeComponentId: 'comp-3',
      activeBodyId: 'body-3',
      components: [
        makeComponent({
          id: 'comp-3',
          bodies: [{ id: 'body-3', label: 'Rotation 1', displayStride: 60 }],
        }),
      ],
      planeAxis: 'x',
      planePosition: 4,
      hitTolerance: 0.4,
      contours: [makeContour()],
    };
    const meta = parseProjectMeta(JSON.stringify(v4));
    expect(meta.version).toBe(PROJECT_VERSION);
    expect(meta.activeComponentId).toBe('comp-3');
    expect(meta.activeBodyId).toBe('body-3');
    expect(meta.components[0].id).toBe('comp-3');
    // 'Rotation 1' contains 'rotation' -> 'solid'.
    expect(meta.components[0].bodies[0].bodyKind).toBe('solid');
    expect(meta.planePosition).toBe(4);
    expect(meta.hitTolerance).toBeCloseTo(0.4, 6);
  });

  it('migrates v5 to current shape, preserving an explicit bodyKind', () => {
    const v5 = {
      version: 5,
      activeComponentId: DEFAULT_COMPONENT_ID,
      activeBodyId: DEFAULT_BODY_ID,
      components: [
        makeComponent({
          bodies: [
            // Label would infer 'scan', but explicit bodyKind must be preserved.
            { id: DEFAULT_BODY_ID, label: 'Mein Teil', displayStride: 80, bodyKind: 'loft' },
          ],
        }),
      ],
      planeAxis: 'y',
      planePosition: 3,
      hitTolerance: 0.25,
      contours: [],
    };
    const meta = parseProjectMeta(JSON.stringify(v5));
    expect(meta.version).toBe(PROJECT_VERSION);
    expect(meta.components[0].bodies[0].bodyKind).toBe('loft');
  });

  it('migrates v6 (current) and infers bodyKind from label "Negativform" -> loft', () => {
    const v6 = {
      version: 6,
      activeComponentId: DEFAULT_COMPONENT_ID,
      activeBodyId: DEFAULT_BODY_ID,
      components: [
        makeComponent({
          bodies: [{ id: DEFAULT_BODY_ID, label: 'Negativform A', displayStride: 80 }],
        }),
      ],
      planeAxis: 'z',
      planePosition: 0,
      hitTolerance: 0.15,
      contours: [],
    };
    const meta = parseProjectMeta(JSON.stringify(v6));
    expect(meta.version).toBe(PROJECT_VERSION);
    expect(meta.components[0].bodies[0].bodyKind).toBe('loft');
  });

  it('throws for an unknown / future version', () => {
    const future = {
      version: 99,
      components: [makeComponent()],
      contours: [],
    };
    expect(() => parseProjectMeta(JSON.stringify(future))).toThrow('Unbekannte Projektversion');
  });

  it('throws when parsed payload is null', () => {
    expect(() => parseProjectMeta('null')).toThrow('Projektdatei ungültig');
  });

  it('throws when components are missing/empty (v6)', () => {
    const v6 = {
      version: 6,
      activeComponentId: DEFAULT_COMPONENT_ID,
      activeBodyId: DEFAULT_BODY_ID,
      components: [],
      planeAxis: 'z',
      planePosition: 0,
      hitTolerance: 0.1,
      contours: [],
    };
    expect(() => parseProjectMeta(JSON.stringify(v6))).toThrow('Komponenten fehlen');
  });
});

// ----------------------------------------------------------------------------
// Contour normalization (applied at the end of parseProjectMeta)
// ----------------------------------------------------------------------------

describe('parseProjectMeta contour normalization', () => {
  it('defaults a contour componentId to comp-0', () => {
    const v6 = {
      version: 6,
      activeComponentId: DEFAULT_COMPONENT_ID,
      activeBodyId: DEFAULT_BODY_ID,
      components: [makeComponent()],
      planeAxis: 'z',
      planePosition: 0,
      hitTolerance: 0.1,
      contours: [makeContour({ id: 'cX' })],
    };
    const meta = parseProjectMeta(JSON.stringify(v6));
    expect(meta.contours[0].componentId).toBe(DEFAULT_COMPONENT_ID);
  });

  it('migrates legacy attachedToScan=true into attachedToBodyId=body-0', () => {
    const v6 = {
      version: 6,
      activeComponentId: DEFAULT_COMPONENT_ID,
      activeBodyId: DEFAULT_BODY_ID,
      components: [makeComponent()],
      planeAxis: 'z',
      planePosition: 0,
      hitTolerance: 0.1,
      contours: [makeContour({ attachedToScan: true })],
    };
    const meta = parseProjectMeta(JSON.stringify(v6));
    expect(meta.contours[0].attachedToBodyId).toBe(DEFAULT_BODY_ID);
  });

  it('attachedToScan=false (no explicit body) becomes attachedToBodyId=null', () => {
    const v6 = {
      version: 6,
      activeComponentId: DEFAULT_COMPONENT_ID,
      activeBodyId: DEFAULT_BODY_ID,
      components: [makeComponent()],
      planeAxis: 'z',
      planePosition: 0,
      hitTolerance: 0.1,
      contours: [makeContour({ attachedToScan: false })],
    };
    const meta = parseProjectMeta(JSON.stringify(v6));
    expect(meta.contours[0].attachedToBodyId).toBeNull();
  });

  it('keeps an explicit attachedToBodyId over the legacy scan flag', () => {
    const v6 = {
      version: 6,
      activeComponentId: DEFAULT_COMPONENT_ID,
      activeBodyId: DEFAULT_BODY_ID,
      components: [makeComponent()],
      planeAxis: 'z',
      planePosition: 0,
      hitTolerance: 0.1,
      contours: [makeContour({ attachedToScan: true, attachedToBodyId: 'body-5' })],
    };
    const meta = parseProjectMeta(JSON.stringify(v6));
    expect(meta.contours[0].attachedToBodyId).toBe('body-5');
  });
});

// ----------------------------------------------------------------------------
// buildProjectMeta round-trips
// ----------------------------------------------------------------------------

describe('buildProjectMeta', () => {
  const baseInput = () => ({
    activeComponentId: 'comp-9',
    activeBodyId: 'body-9',
    components: [
      makeComponent({
        id: 'comp-9',
        label: 'Comp Nine',
        alignment: { ...IDENTITY_TRANSFORM, posX: 1, rotZ: 2 },
        bodies: [{ id: 'body-9', label: 'Festkörper', displayStride: 33, bodyKind: 'solid' as const }],
      }),
    ],
    planeAxis: 'yz' as const,
    planePosition: 7,
    hitTolerance: 0.42,
    contours: [makeContour({ id: 'cc', componentId: 'comp-9' })],
  });

  it('stamps the current PROJECT_VERSION', () => {
    const meta = buildProjectMeta(baseInput());
    expect(meta.version).toBe(PROJECT_VERSION);
  });

  it('round-trips active ids, plane axis/position and hitTolerance', () => {
    const meta = buildProjectMeta(baseInput());
    expect(meta.activeComponentId).toBe('comp-9');
    expect(meta.activeBodyId).toBe('body-9');
    expect(meta.planeAxis).toBe('yz');
    expect(meta.planePosition).toBe(7);
    expect(meta.hitTolerance).toBeCloseTo(0.42, 6);
  });

  it('round-trips components, bodies and alignment (deep-equal, but cloned)', () => {
    const input = baseInput();
    const meta = buildProjectMeta(input);
    expect(meta.components).toHaveLength(1);
    expect(meta.components[0].id).toBe('comp-9');
    expect(meta.components[0].label).toBe('Comp Nine');
    expect(meta.components[0].alignment).toEqual({ ...IDENTITY_TRANSFORM, posX: 1, rotZ: 2 });
    expect(meta.components[0].bodies[0]).toEqual({
      id: 'body-9',
      label: 'Festkörper',
      displayStride: 33,
      bodyKind: 'solid',
    });
    // alignment is cloned, not the same reference.
    expect(meta.components[0].alignment).not.toBe(input.components[0].alignment);
    // bodies array entries are cloned too.
    expect(meta.components[0].bodies[0]).not.toBe(input.components[0].bodies[0]);
  });

  it('round-trips contours with cloned point tuples', () => {
    const input = baseInput();
    const meta = buildProjectMeta(input);
    expect(meta.contours).toHaveLength(1);
    expect(meta.contours[0].id).toBe('cc');
    expect(meta.contours[0].componentId).toBe('comp-9');
    expect(meta.contours[0].points).toEqual([
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
    ]);
    // Each point is a fresh tuple, not aliased to input.
    expect(meta.contours[0].points[0]).not.toBe(input.contours[0].points[0]);
  });

  it('round-trips sketches when provided', () => {
    const sketches: ProjectSketch[] = [
      { id: 'sk1', label: 'Skizze 1', axis: 'xy', position: 0, visible: true, componentId: 'comp-9' },
    ];
    const meta = buildProjectMeta({ ...baseInput(), sketches });
    expect(meta.sketches).toEqual(sketches);
    // cloned, not aliased.
    expect(meta.sketches![0]).not.toBe(sketches[0]);
  });

  it('round-trips sketchDimensions when provided', () => {
    const dims: ProjectSketchDimension[] = [
      {
        id: 'd1',
        sketchId: 'sk1',
        kind: 'linear',
        axis: 'xy',
        position: 0,
        a: [0, 0, 0],
        b: [1, 0, 0],
        offset: 0.5,
        visible: true,
      },
    ];
    const meta = buildProjectMeta({ ...baseInput(), sketchDimensions: dims });
    expect(meta.sketchDimensions).toEqual(dims);
    expect(meta.sketchDimensions![0]).not.toBe(dims[0]);
  });

  it('defaults sketchUnit to "mm" and activeSketchId to null when omitted', () => {
    const meta = buildProjectMeta(baseInput());
    expect(meta.sketchUnit).toBe('mm');
    expect(meta.activeSketchId).toBeNull();
    // sketches/sketchDimensions omitted -> stay undefined.
    expect(meta.sketches).toBeUndefined();
    expect(meta.sketchDimensions).toBeUndefined();
  });

  it('keeps an explicit sketchUnit and activeSketchId', () => {
    const meta = buildProjectMeta({
      ...baseInput(),
      sketchUnit: 'cm',
      activeSketchId: 'sk1',
    });
    expect(meta.sketchUnit).toBe('cm');
    expect(meta.activeSketchId).toBe('sk1');
  });

  it('survives a JSON build -> parse round trip and stays at current version', () => {
    const built = buildProjectMeta(baseInput());
    const reparsed = parseProjectMeta(JSON.stringify(built));
    expect(reparsed.version).toBe(PROJECT_VERSION);
    expect(reparsed.activeComponentId).toBe('comp-9');
    expect(reparsed.activeBodyId).toBe('body-9');
    expect(reparsed.components[0].bodies[0].bodyKind).toBe('solid');
    expect(reparsed.contours[0].componentId).toBe('comp-9');
  });
});
