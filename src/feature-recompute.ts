/**
 * Parametric recompute executor (#30 Phase 2).
 *
 * Given a `FeatureRecipe` and the CURRENT sketch state, re-execute the solid
 * operation and return fresh geometry. This is the heart of parametric replay:
 * the recipe stores live contour ids (not a frozen snapshot), so editing the
 * source sketch and recomputing yields updated geometry.
 *
 * The function is pure of DOM/scene: WASM ops + contour lookup + world matrices
 * are injected via `RecomputeDeps`, so it is fully unit-testable. The real
 * wiring (live contours + `loft_contours_json`/`revolve_contour_json`) lives in
 * main.ts.
 *
 * Recomputable kinds: extrude, revolve, loft. The WASM ops THROW on failure
 * (and loft/revolve can return an empty mesh without throwing), so the injected
 * op wrappers must map a throw to `null`, and we additionally guard
 * `triangle_count === 0`.
 */
import * as THREE from 'three';
import type { Contour } from './types';
import type { ParsedLoftMesh } from './solid-pick';
import type { FeatureRecipe } from './feature-recipe';
import { contourLoftPayload } from './solid-ops';
import { buildExtrudeLoftPayload } from './solid-extrude';
import { buildRevolvePayload } from './solid-revolve';
import { buildLoftContoursPayload } from './solid-loft';

export interface RecomputeDeps {
  /** Current contour by id (live sketch state); undefined if missing/deleted. */
  getContour: (id: string) => Contour | undefined;
  /** World matrix for a contour (same as host.getContourWorldMatrix). */
  worldMatrix: (contour: Contour) => THREE.Matrix4;
  /** `loft_contours_json` wrapped: returns the mesh, or null if it threw. */
  loftJson: (json: string) => ParsedLoftMesh | null;
  /** `revolve_contour_json` wrapped: returns the mesh, or null if it threw. */
  revolveJson: (json: string) => ParsedLoftMesh | null;
}

export type RecomputeStatus = 'ok' | 'missing-contour' | 'op-failed' | 'empty';

export interface RecomputeResult {
  status: RecomputeStatus;
  geometry: THREE.BufferGeometry | null;
  triangleCount: number;
}

/** Convert a WASM mesh result to a THREE geometry (positions copied once). */
function meshToGeometry(mesh: ParsedLoftMesh): THREE.BufferGeometry {
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(mesh.positions), 3));
  geom.setIndex(Array.from(mesh.indices));
  geom.computeVertexNormals();
  geom.computeBoundingBox();
  geom.computeBoundingSphere();
  return geom;
}

/**
 * Re-execute `recipe` against the current sketch state. Returns the fresh
 * geometry plus a status discriminating the failure modes (missing source
 * contour, WASM op threw, or empty result).
 */
export function recomputeFeature(recipe: FeatureRecipe, deps: RecomputeDeps): RecomputeResult {
  const fail = (status: RecomputeStatus): RecomputeResult => ({
    status,
    geometry: null,
    triangleCount: 0,
  });

  // Resolve every source contour against the live sketch.
  const resolved: Contour[] = [];
  for (const id of recipe.sourceContourIds) {
    const c = deps.getContour(id);
    if (!c) return fail('missing-contour');
    resolved.push(c);
  }
  if (resolved.length === 0) return fail('missing-contour');

  let mesh: ParsedLoftMesh | null;
  switch (recipe.kind) {
    case 'extrude': {
      const base = contourLoftPayload(resolved[0], deps.worldMatrix(resolved[0]));
      mesh = deps.loftJson(buildExtrudeLoftPayload(base, recipe.distanceMm));
      break;
    }
    case 'revolve': {
      const base = contourLoftPayload(resolved[0], deps.worldMatrix(resolved[0]));
      mesh = deps.revolveJson(buildRevolvePayload(base, recipe.axis, recipe.angleDeg));
      break;
    }
    case 'loft': {
      const payloads = resolved.map((c) => contourLoftPayload(c, deps.worldMatrix(c)));
      mesh = deps.loftJson(buildLoftContoursPayload(payloads));
      break;
    }
  }

  if (!mesh) return fail('op-failed');
  if (mesh.triangle_count === 0) return fail('empty');
  return { status: 'ok', geometry: meshToGeometry(mesh), triangleCount: mesh.triangle_count };
}
