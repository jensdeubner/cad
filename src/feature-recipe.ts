/**
 * Parametric feature recipes (#30 Phase 2).
 *
 * A `FeatureRecipe` captures everything needed to RE-EXECUTE a body-creating
 * solid feature from the CURRENT sketch state: the operation kind, the source
 * contour id(s) (a live reference, NOT a frozen point snapshot), and the scalar
 * parameters. Unlike the display-only feature timeline (`feature-timeline.ts`),
 * recipes are re-runnable (see `feature-recompute.ts`) and are persisted
 * (.stpr v8) + carried through undo/redo.
 *
 * Recomputable kinds are the sketch-sourced solid creators: extrude, revolve,
 * loft. Mutating/duplicating ops (subtract/join/mirror/patterns) and ops with
 * no WASM kernel (intersect/sweep) are intentionally NOT modelled here.
 *
 * Pure data + array helpers — no DOM, no scene, no THREE.
 */
import type { PlaneAxis } from './types';

export type RecipeKind = 'extrude' | 'revolve' | 'loft';

export interface ExtrudeRecipe {
  id: string;
  bodyId: string;
  kind: 'extrude';
  /** Exactly one source contour. */
  sourceContourIds: string[];
  /** Signed extrude distance in mm (sign encodes direction). */
  distanceMm: number;
}

export interface RevolveRecipe {
  id: string;
  bodyId: string;
  kind: 'revolve';
  /** Exactly one source contour. */
  sourceContourIds: string[];
  /** Source contour plane; the revolution axis is derived from it. */
  axis: PlaneAxis;
  /** Sweep angle in degrees, 1..360. */
  angleDeg: number;
  /** Revolution segment count (48 today). */
  segments: number;
}

export interface LoftRecipe {
  id: string;
  bodyId: string;
  kind: 'loft';
  /** Ordered profiles, >= 2. */
  sourceContourIds: string[];
  closedEnds: boolean;
}

export type FeatureRecipe = ExtrudeRecipe | RevolveRecipe | LoftRecipe;

/** Stable recipe id derived from the produced body (one creation recipe per body). */
export function recipeIdForBody(bodyId: string): string {
  return `recipe:${bodyId}`;
}

/**
 * Deep clone. Recipes are plain JSON, but the `sourceContourIds` array must be
 * copied so undo snapshots / project metadata never alias a live array.
 */
export function cloneFeatureRecipe(r: FeatureRecipe): FeatureRecipe {
  return { ...r, sourceContourIds: [...r.sourceContourIds] };
}

/** The creation recipe for a body, if any. */
export function recipeForBody(
  recipes: readonly FeatureRecipe[],
  bodyId: string,
): FeatureRecipe | undefined {
  return recipes.find((r) => r.bodyId === bodyId);
}

/**
 * Upsert a recipe (replacing any existing recipe for the same body), returning a
 * NEW array. One creation recipe per body, keyed by `bodyId`.
 */
export function withRecipe(
  recipes: readonly FeatureRecipe[],
  recipe: FeatureRecipe,
): FeatureRecipe[] {
  const out = recipes.filter((r) => r.bodyId !== recipe.bodyId);
  out.push(recipe);
  return out;
}

/** Remove the recipe for a body, returning a NEW array. */
export function withoutBodyRecipe(
  recipes: readonly FeatureRecipe[],
  bodyId: string,
): FeatureRecipe[] {
  return recipes.filter((r) => r.bodyId !== bodyId);
}

/** Every recipe that references `contourId` as a source (dependency lookup). */
export function recipesForContour(
  recipes: readonly FeatureRecipe[],
  contourId: string,
): FeatureRecipe[] {
  return recipes.filter((r) => r.sourceContourIds.includes(contourId));
}
