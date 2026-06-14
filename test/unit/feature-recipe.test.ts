import { describe, it, expect } from 'vitest';
import {
  recipeIdForBody,
  cloneFeatureRecipe,
  recipeForBody,
  withRecipe,
  withoutBodyRecipe,
  recipesForContour,
  type ExtrudeRecipe,
  type RevolveRecipe,
  type LoftRecipe,
  type FeatureRecipe,
} from '../../src/feature-recipe';

const extrude: ExtrudeRecipe = {
  id: recipeIdForBody('body-1'),
  bodyId: 'body-1',
  kind: 'extrude',
  sourceContourIds: ['c1'],
  distanceMm: 12,
};
const revolve: RevolveRecipe = {
  id: recipeIdForBody('body-2'),
  bodyId: 'body-2',
  kind: 'revolve',
  sourceContourIds: ['c2'],
  axis: 'xz',
  angleDeg: 270,
  segments: 48,
};
const loft: LoftRecipe = {
  id: recipeIdForBody('body-3'),
  bodyId: 'body-3',
  kind: 'loft',
  sourceContourIds: ['c3', 'c4'],
  closedEnds: true,
};

describe('recipeIdForBody', () => {
  it('derives a stable id from the body id', () => {
    expect(recipeIdForBody('body-7')).toBe('recipe:body-7');
  });
});

describe('cloneFeatureRecipe', () => {
  it('deep-copies sourceContourIds (no aliasing)', () => {
    const c = cloneFeatureRecipe(loft);
    expect(c).toEqual(loft);
    expect(c.sourceContourIds).not.toBe(loft.sourceContourIds);
    c.sourceContourIds.push('c5');
    expect(loft.sourceContourIds).toEqual(['c3', 'c4']);
  });
  it('preserves the discriminant + params for each kind', () => {
    expect(cloneFeatureRecipe(extrude)).toEqual(extrude);
    expect(cloneFeatureRecipe(revolve)).toEqual(revolve);
  });
});

describe('recipeForBody', () => {
  it('finds by bodyId, undefined when absent', () => {
    const recipes: FeatureRecipe[] = [extrude, revolve];
    expect(recipeForBody(recipes, 'body-2')).toBe(revolve);
    expect(recipeForBody(recipes, 'nope')).toBeUndefined();
  });
});

describe('withRecipe', () => {
  it('appends a new recipe and returns a new array', () => {
    const a: FeatureRecipe[] = [extrude];
    const b = withRecipe(a, revolve);
    expect(b).not.toBe(a);
    expect(b.map((r) => r.bodyId)).toEqual(['body-1', 'body-2']);
  });
  it('replaces an existing recipe for the same body', () => {
    const updated: ExtrudeRecipe = { ...extrude, distanceMm: 99 };
    const out = withRecipe([extrude, revolve], updated);
    expect(out).toHaveLength(2);
    const found = recipeForBody(out, 'body-1') as ExtrudeRecipe;
    expect(found.distanceMm).toBe(99);
  });
});

describe('withoutBodyRecipe', () => {
  it('removes only the matching body recipe', () => {
    const out = withoutBodyRecipe([extrude, revolve, loft], 'body-2');
    expect(out.map((r) => r.bodyId)).toEqual(['body-1', 'body-3']);
  });
});

describe('recipesForContour', () => {
  it('returns every recipe referencing the contour', () => {
    const recipes: FeatureRecipe[] = [extrude, revolve, loft];
    expect(recipesForContour(recipes, 'c4')).toEqual([loft]);
    expect(recipesForContour(recipes, 'c1').map((r) => r.bodyId)).toEqual(['body-1']);
    expect(recipesForContour(recipes, 'absent')).toEqual([]);
  });
});
