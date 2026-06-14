import { describe, it, expect } from 'vitest';
import { buildProjectMeta, parseProjectMeta, PROJECT_VERSION } from '../../src/project-file';
import { DEFAULT_BODY_ID, DEFAULT_COMPONENT_ID } from '../../src/cad-scene';
import type { FeatureRecipe } from '../../src/feature-recipe';

const recipes: FeatureRecipe[] = [
  { id: 'recipe:body-1', bodyId: 'body-1', kind: 'extrude', sourceContourIds: ['c1'], distanceMm: 8 },
  {
    id: 'recipe:body-2',
    bodyId: 'body-2',
    kind: 'loft',
    sourceContourIds: ['c2', 'c3'],
    closedEnds: true,
  },
];

const zeroTransform = { rotX: 0, rotY: 0, rotZ: 0, posX: 0, posY: 0, posZ: 0 };

function baseInput(extra: Record<string, unknown> = {}) {
  return {
    activeComponentId: DEFAULT_COMPONENT_ID,
    activeBodyId: DEFAULT_BODY_ID,
    components: [
      {
        id: DEFAULT_COMPONENT_ID,
        label: 'Comp',
        alignment: { ...zeroTransform },
        bodies: [{ id: DEFAULT_BODY_ID, label: 'Körper', displayStride: 1 }],
      },
    ],
    planeAxis: 'xy' as const,
    planePosition: 0,
    hitTolerance: 1,
    contours: [],
    ...extra,
  };
}

describe('feature recipe persistence (.stpr v8)', () => {
  it('PROJECT_VERSION is 8', () => {
    expect(PROJECT_VERSION).toBe(8);
  });

  it('buildProjectMeta serializes recipes (deep copy) at version 8', () => {
    const meta = buildProjectMeta(baseInput({ featureRecipes: recipes }));
    expect(meta.version).toBe(8);
    expect(meta.featureRecipes).toHaveLength(2);
    expect(meta.featureRecipes![0]).toEqual(recipes[0]);
    // deep-cloned: the serialized array does not alias the live recipe arrays
    expect(meta.featureRecipes![0].sourceContourIds).not.toBe(recipes[0].sourceContourIds);
  });

  it('round-trips recipes through JSON + parseProjectMeta', () => {
    const meta = buildProjectMeta(baseInput({ featureRecipes: recipes }));
    const parsed = parseProjectMeta(JSON.stringify(meta));
    expect(parsed.featureRecipes).toEqual(recipes);
  });

  it('migrates a v7 project (no recipes) to v8, defaulting featureRecipes to []', () => {
    const v7 = { ...buildProjectMeta(baseInput()), version: 7 } as Record<string, unknown>;
    delete v7.featureRecipes;
    const parsed = parseProjectMeta(JSON.stringify(v7));
    expect(parsed.version).toBe(8);
    expect(parsed.featureRecipes).toEqual([]);
  });
});
