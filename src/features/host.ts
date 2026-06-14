/**
 * FeatureHost — the contract every registry feature codes against.
 *
 * PR0 (Feature-Registry-Seam): feature modules call `registerFeature()` and
 * receive a `FeatureHost` at run-time. This is the ONLY surface a feature needs;
 * features never import or edit `main.ts`. All members below are wired once in
 * `main.ts`'s `boot()` from in-scope state/functions.
 *
 * See `docs/PARALLEL-AGENTS-FUSION-PARITY.md` §2 for the rationale.
 */
import type * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { CadScene, CadBodyRecord, CadBodyId } from '../cad-scene';
import type { SurfacePick } from '../body-edit';
import type { BodyKind } from '../body-kind';
import type { FusionTab } from '../app-menu';
import type { Contour, PlaneAxis } from '../types';
import type { Sketch } from '../sketch';

export interface FeatureHost {
  /** The shared three.js namespace (so features don't pin a second copy). */
  THREE: typeof THREE;

  // ── i18n + status ───────────────────────────────────────────────
  t(key: string, params?: Record<string, string | number>): string;
  setStatus(msg: string): void;

  // ── ribbon ──────────────────────────────────────────────────────
  /** Switch the active ribbon tab / workspace. */
  selectTab(tab: FusionTab): void;

  // ── three.js handles ────────────────────────────────────────────
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  /** A dedicated group (added to the scene by PR0) for feature overlays. */
  overlay: THREE.Group;
  /** The viewport DOM element — attach pointer listeners here. */
  viewport: HTMLElement;
  /** Convert client (x,y) to a normalized device ray hit on a body surface. */
  pickBodySurfaceAt(clientX: number, clientY: number): SurfacePick | null;

  // ── scene / body access ─────────────────────────────────────────
  cadScene: CadScene;
  getBodies(): CadBodyRecord[];
  getBody(id: string): CadBodyRecord | undefined;
  getActiveBody(): CadBodyRecord | null;
  getActiveComponentId(): CadBodyId;

  // ── sketch / contour state ──────────────────────────────────────
  getContours(): Contour[];
  getSketches(): Sketch[];
  getActiveSketchId(): string | null;
  /**
   * Start a new sketch on an origin plane, optionally offset along the plane
   * normal (a construction plane). Returns the new sketch id. Switches to the
   * sketch workspace.
   */
  startSketch(axis: PlaneAxis, position?: number): string;

  // ── create / mutate geometry ────────────────────────────────────
  /**
   * Promote a three.js geometry to a brand-new body. Resolves to the new
   * body id. Handles STL bake, scene insertion, browser refresh.
   */
  addBodyFromGeometry(
    geometry: THREE.BufferGeometry,
    labelPrefix: string,
    bodyKind?: BodyKind,
  ): Promise<CadBodyId>;
  /**
   * Replace an existing body's mesh in place (mesh-edit features:
   * reverse-normal, reduce, hole-fill, weld). Rebuilds visuals + buffer.
   * Call `pushMeshUndo()` first.
   */
  replaceBodyGeometry(bodyId: string, geometry: THREE.BufferGeometry): Promise<void>;
  refreshBrowser(): void;
  /**
   * Recompute world matrices + world scan bounds. Call after mutating a body's
   * transform directly (e.g. drop-to-floor) so camera framing / marker sizing
   * stay correct.
   */
  refreshBounds(): void;

  // ── undo + feature log ──────────────────────────────────────────
  /** Snapshot for undo (no mesh buffers — cheap; geometry-only edits). */
  pushUndo(label: string): void;
  /** Snapshot for undo INCLUDING mesh buffers (use before mesh mutations). */
  pushMeshUndo(label: string): void;
  /** Mark a feature as just-run (drives `window.__cadDebug.lastFeature`). */
  markFeatureDone(featureId: string, label?: string): void;

  // ── wasm ────────────────────────────────────────────────────────
  /** Idempotently initialise the wasm module before calling any export. */
  ensureWasm(): Promise<void>;
}
