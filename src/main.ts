/**
 * CAD entry point — wires Three.js scene, DOM events, and domain modules.
 *
 * Orchestration lives here; prefer adding logic under `app/`, `sketch-mode/`,
 * `tools/`, `input/`, or future `contours/`, `scene/`, `project/` packages.
 * See `src/ARCHITECTURE.md` for the full module map.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import {
  initWasm,
  parse_stl_with_stride,
  loft_contours_json,
  revolve_contour_json,
  export_binary_stl,
  pack_project_multi,
  unpack_project,
} from './wasm';
import { assignBodyKind, type BodyKind } from './body-kind';
import {
  buildProjectMeta,
  parseProjectMeta,
  PROJECT_EXTENSION,
  type ProjectContour,
} from './project-file';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import {
  disposeLine2,
  makeContourLine,
  makePointMarkers,
  intersectRayPlane,
  intersectViewPlane,
  makeWorkPlaneMesh,
  pickOnPlane,
  planeNormal,
  planePoint,
  screenToRay,
  simplifyStroke,
  type PlaneHitVisual,
} from './drawing';
import {
  computeAlignToPlane,
  countAlignmentHits,
  refineAlignmentPosition,
} from './scan-plane-align';
import { AppMenu, type FusionTab } from './app-menu';
import type { FusionShortcutAction } from './fusion-shortcuts';
import {
  ALIGN_POS_STEP,
  ALIGN_ROT_STEP,
  CONTOUR_COLORS,
  getScanModeLabel,
  getToolHint,
  SOLID_BODY_COLOR,
  CLOSED_LINE_COLOR,
  HIT_LINE_COLOR,
  HIT_POINT_COLOR,
  MISS_POINT_COLOR,
  START_POINT_COLOR,
  START_SNAP_COLOR,
} from './app/constants';
import { queryDomRefs } from './app/dom';
import { initStatusElement, isTypingTarget, setStatus, uid } from './app/util';
import { initI18n, onLocaleChange, setLocale, getLocale, getLocales, localeLabel, t, refreshDynamicI18n } from './i18n';
import type { Locale } from './i18n/types';
import { setWorkspaceModeLabel } from './i18n/dom';
import type { MeshEditDrag, SmoothPaintSession, SketchInteraction } from './app/types';
import {
  bodyGizmoTool,
  isSketchDrawTool,
  isSketchPrimitiveTool,
  meshSculptTool,

  smoothToolActive,
  toolRequiresActiveSketch,
} from './tools/helpers';
import {
  applyViewportNavigation,
  getSketchViewportNavHint,
  syncOrbitControlsFromCamera,
} from './input/viewport-navigation';
import { syncToolButtonHighlight, updateSketchRibbonState } from './sketch-mode/ribbon-state';
import { createSketchDimensionApi, type SketchDimensionApi } from './sketch-mode/dimensions';
import { bindFusionKeyboard, renderFusionShortcutsPanel } from './input/fusion-keyboard';
import { collectScanPointsOnPlane, planeIntersectsScan, pointHitsScan } from './scan-hit';
import {
  DEFAULT_ALIGNMENT,
  applyAlignment,
  alignmentRemainder,
  blendAlignmentToward,
  centerGeometry,
  getWorldScanBox,
  readAlignmentFromObject,
} from './scan-align';

type AlignField = keyof BodyTransform;

import {
  CadScene,
  DEFAULT_BODY_ID,
  DEFAULT_COMPONENT_ID,
  type BodyTransform,
  type CadBodyRecord,
} from './cad-scene';
import {
  contourInWorldSpace,
  isContourAttached,
  toggleContourBodyAttach,
  worldToContourStorage,
} from './contour-body';
import {
  constrainToContourPlane,
  contourHas3dDeviation,
  deletePoint,
  displayPoints,
  ensurePointMeta,
  findInsertOnContour,
  insertPoint,
  loftPoints,
  moveAnchor,
  moveHandle,
  pickEditTarget,
  setPointType,
  type EditPick,
} from './contour-spline';
import type { Contour, ContourPointType, PlaneAxis, Tool } from './types';
import {
  arc3Points,
  circlePoints,
  linePoints,
  rectanglePoints,
  snapSketchPoint,
  snapSketchPointWithMeta,
  sketchPlaneOrigin,
  trianglePoints,
} from './sketch-geometry';
import {
  EMPTY_PROJECT_VIEW_SIZE,
  ORIGIN_PLANE_COLORS,
  makeOriginPlaneGroup,
  makeSketchGrid,
  setSketchOriginMarkerHighlighted,
  makeSketchOriginMarker,
  originPlaneAxisFromObject,
  originPlaneSize,
  sketchGridExtent,
  parseOriginPlaneName,
  sketchLabelForAxis,
  viewPresetForSketchAxis,
  type Sketch,
} from './sketch';
import type { SketchDimension, SketchDimensionKind, SketchUnit } from './sketch-dimension';
import { appendFeature, bindFeatureTimeline } from './feature-timeline';
import {
  buildMeshArchive,
  emptyStlBuffer,
  stlHasTriangles,
  syncSceneFromProjectMeta,
} from './project-io';
import type { FeatureKind } from './feature-timeline';
import { bindHistoryTimeline } from './history-timeline';
import { UndoHistory, captureSnapshot } from './undo';
import { bindSolidFeatureButtons } from './solid-features';
import {
  beginSubtract,
  cancelSubtract,
  handleSubtractBodyPick,
  isSubtractPicking,
} from './solid-subtract';
import {
  cancelAllSolidCommands,
  handleSolidCommandPointerCancel,
  handleSolidCommandPointerDown,
  handleSolidCommandPointerMove,
  handleSolidCommandPointerUp,
  isSolidCommandActive,
  type SolidCommandHosts,
} from './solid-command';
import { createExtrudeGizmo } from './solid-extrude-gizmo';
import { beginExtrude, buildExtrudeLoftPayload, type ExtrudeHost } from './solid-extrude';
import {
  beginLoft,
  buildLoftContoursPayload,
  isLoftActive,
  tryCommitLoft,
  type LoftHost,
} from './solid-loft';
import { beginRevolve, buildRevolvePayload, type RevolveHost } from './solid-revolve';
import {
  contourLoftPayload,
  parseMirrorAxis,
  parsePromptFloat,
  parsePromptInt,
} from './solid-ops';
import {
  toolAllowedInWorkspace,
  workspaceForTab,
  workspaceHintForTool,
  type WorkspaceMode,
} from './workspace-mode';
import {
  bakeMeshGroupTransform,
  clipGeometryByPlane,
  commitBodyGeometry,
  displaceRegion,
  geometryMeshData,
  booleanSubtractBodies,
  booleanUnionBodies,
  mergeBodyGeometries,
  mirrorGeometry,
  replaceBodyGeometry,
  invalidateMeshAdjacency,
  taubinSmoothRegion,
  type SmoothOptions,
  type SurfacePick,
} from './body-edit';
import {
  BrowserPanel,
  parseBodyIdFromBrowserItem,
  parseComponentIdFromBrowserItem,
  type BrowserContextTarget,
  type BrowserItemId,
} from './browser-panel';
import { ViewCube, type ViewCubePreset } from './view-cube';
import {
  SCAN_THEMES,
  SOLID_BODY_STRIDE_MAX,
  makeScanSolidMaterial,
  applyHeightColors,
  applyNormalColors,
  brightenColor,
  type ScanDisplayMode,
} from './scan-visual';

const HIT_MARKER_COLOR = 0xffee00;

let closeSnapPreview = false;

const dom = queryDomRefs();
initStatusElement(dom.status);

const viewport = dom.viewport;
let handleTabWorkspaceSwitch: ((tab: FusionTab) => void) | null = null;

const appMenu = new AppMenu(
  viewport,
  {
    align: {
      onOpen: () => {
        hitPlaneFeedback = true;
        (document.getElementById('hit-plane') as HTMLInputElement).checked = true;
        if (tool === 'align') transformControls.detach();
        refreshWorkPlaneMesh(getPlaneHitVisual());
        updateHitFeedback();
        setStatus(t('status.alignPanelOpen'));
      },
      onClose: () => {
        setPlaneDragMode(false);
        updateTransformGizmo();
      },
    },
  },
  (tab) => handleTabWorkspaceSwitch?.(tab),
);
const toolHint = dom.toolHint;
const viewportMenu = dom.viewportMenu;
const pointMenu = dom.pointMenu;
const bodyColorMenu = dom.bodyColorMenu;
const bodyColorInput = dom.bodyColorInput;
const browserPanelEl = dom.browserPanel;
const browserContextMenu = dom.browserContextMenu;
const browserCtxTitle = dom.browserCtxTitle;
const browserCtxActions = dom.browserCtxActions;
const contourList = dom.contourList;
const contourCount = dom.contourCount;
const browserState = {
  componentsFolderExpanded: true,
  originPlanesVisible: true,
  planeVisible: true,
  gridVisible: true,
  formVisible: true,
  draftVisible: true,
};
const componentBrowserUI = new Map<
  string,
  { expanded: boolean; bodiesExpanded: boolean; sketchesExpanded: boolean; contoursExpanded: boolean }
>();
const sketchBrowserUI = new Map<string, { expanded: boolean }>();
const bodyBrowserUI = new Map<string, { expanded: boolean }>();
const bodyTraceAssist = new Map<string, boolean>();
const bodySolidColors = new Map<string, number>();
const solidBodyGeom = new Map<string, THREE.BufferGeometry>();
const pickRaycaster = new THREE.Raycaster();
const pickPointer = new THREE.Vector2();

let bodyColorMenuTarget: string | null = null;

function bodyUI(id: string) {
  if (!bodyBrowserUI.has(id)) {
    bodyBrowserUI.set(id, { expanded: true });
  }
  return bodyBrowserUI.get(id)!;
}

function compUI(id: string) {
  if (!componentBrowserUI.has(id)) {
    componentBrowserUI.set(id, {
      expanded: true,
      bodiesExpanded: true,
      sketchesExpanded: true,
      contoursExpanded: true,
    });
  }
  return componentBrowserUI.get(id)!;
}

const browserPanel = new BrowserPanel(document.getElementById('browser-tree')!, {
  onToggleVisibility: (id) => toggleBrowserItem(id),
  onToggleAttach: (id) => toggleContourAttachById(id),
  onDelete: (id) => deleteBrowserItem(id),
  onToggleFolder: (folder) => toggleBrowserFolder(folder),
  onSelectBody: (bodyId) => selectBody(bodyId),
  onSelectSketch: (sketchId) => activateSketch(sketchId),
  onContextMenu: (target, event) => showBrowserContextMenu(target, event),
  onClearContours: () => clearAllContours(),
  onClearForm: () => clearForm(),
  onBuildForm: () => startSolidCommand('loft', { negativform: true }),
});
const planeAxisSel = dom.planeAxisSel;
const planePos = dom.planePos;
const planePosVal = dom.planePosVal;
const scanFile = dom.scanFile;
const projectFile = dom.projectFile;

let workspaceMode: WorkspaceMode = 'sketch';
let tool: Tool = 'sketch-pick';
let planeAxis: PlaneAxis = 'xy';
let planePosition = 0;
let contours: Contour[] = [];
let sketches: Sketch[] = [];
let activeSketchId: string | null = null;
let activeDraft: Contour | null = null;
let sketchGridSpacing = 10;
let sketchGridSnap = true;
let sketchOriginSnapActive = false;
let shiftKeyHeld = false;
let sketchDimCapturePointerId: number | null = null;
let sketchPreviewLine: Line2 | null = null;
let sketchInteraction: SketchInteraction | null = null;
let hoveredOriginPlane: PlaneAxis | null = null;
let sketchDimensions: SketchDimension[] = [];
let sketchUnit: SketchUnit = 'mm';
let sketchDimKind: SketchDimensionKind = 'linear';
/** Sketch dimension controller — initialized after scene + pickSketchHit exist. */
let sketchDims!: SketchDimensionApi;

function sketchUI(id: string) {
  if (!sketchBrowserUI.has(id)) sketchBrowserUI.set(id, { expanded: true });
  return sketchBrowserUI.get(id)!;
}
let draftLine: Line2 | null = null;
let draftMarkers: THREE.Group | null = null;
const lineResolution = new THREE.Vector2(1, 1);
let lassoScreen: { x: number; y: number }[] = [];
let isDrawing = false;
let bodyDisplayMode: ScanDisplayMode = 'cad';
let bodyBrightness = 1;
let hitPointFeedback = true;
let hitPlaneFeedback = true;
let planeHitMarkers: THREE.Points | null = null;
let planeDragMode = false;
let draggingPlane = false;
let planeDragStartPos = 0;
const planeDragStartHit = new THREE.Vector3();
const undoHistory = new UndoHistory();
const fusionTimelineEl = document.getElementById('fusion-timeline')!;
const historyTimeline = bindHistoryTimeline(fusionTimelineEl, {
  onUndo: () => performUndo(),
  onRedo: () => performRedo(),
  onJumpTo: (position) => jumpToHistory(position),
  getView: () => undoHistory.getTimeline(),
});
const featureTimeline = bindFeatureTimeline(fusionTimelineEl);

function refreshHistoryTimeline() {
  historyTimeline.refresh();
}

function refreshFeatureTimeline() {
  featureTimeline.refresh();
}

function recordSolidFeature(kind: FeatureKind, label: string, bodyId?: string) {
  appendFeature({ kind, label, bodyId });
  refreshFeatureTimeline();
}
let transformUndoPushed = false;
let strokeUndoPushed = false;
let bodyBrushPct = 8;
let smoothStrengthPct = 45;
let smoothSectionDepthMm = 5;
let smoothEdgeOnly = true;

let meshEditDrag: MeshEditDrag | null = null;
let smoothPaint: SmoothPaintSession | null = null;
let sectionBandHelper: THREE.Object3D | null = null;
let lastSmoothPickMs = 0;
let selectedContourId: string | null = null;
let selectedPointIndex: number | null = null;
let editDrag: {
  kind: 'anchor' | 'handle-in' | 'handle-out';
  contourId: string;
  pointIndex: number;
} | null = null;
let pointMenuTarget: { contourId: string; pointIndex: number } | null = null;

const scene = new THREE.Scene();
scene.background = new THREE.Color(SCAN_THEMES.cad.background);

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100000);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.localClippingEnabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = SCAN_THEMES.cad.toneExposure;
renderer.domElement.style.touchAction = 'none';
viewport.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;

const clock = new THREE.Clock();
const viewCubeHost = dom.viewCubeHost;
const viewCube = new ViewCube(
  camera,
  renderer,
  viewCubeHost,
  (preset) => {
    applyPlaneForPreset(preset);
    controls.target.copy(cadScene.bounds.getCenter(new THREE.Vector3()));
    updateHitFeedback();
    setStatus(t('status.viewPreset', { preset: viewPresetStatusLabel(preset) }));
  },
  {
    getPivot: () => controls.target,
    onOrbitStart: () => syncOrbitControls(),
    onOrbitChange: () => {
      syncOrbitControlsFromCamera(controls, camera);
      updateHitFeedback();
      sketchDims?.updateScreenScales();
    },
    onOrbitEnd: () => {
      syncOrbitControlsFromCamera(controls, camera);
      syncOrbitControls();
      updateHitFeedback();
    },
    onFlightEnd: () => {
      syncOrbitControlsFromCamera(controls, camera);
      syncOrbitControls();
    },
  },
);

const ambient = new THREE.AmbientLight(0xffffff, SCAN_THEMES.cad.ambient);
const hemi = new THREE.HemisphereLight(
  SCAN_THEMES.cad.hemiSky,
  SCAN_THEMES.cad.hemiGround,
  SCAN_THEMES.cad.hemiIntensity,
);
const dir = new THREE.DirectionalLight(0xffffff, SCAN_THEMES.cad.dirIntensity);
dir.position.set(3, 5, 4);
const fill = new THREE.DirectionalLight(0xe8ecf0, SCAN_THEMES.cad.fillIntensity);
fill.position.set(-4, 2, -3);
scene.add(ambient, hemi, dir, fill);

const grid = new THREE.GridHelper(
  200,
  20,
  SCAN_THEMES.cad.grid[0],
  SCAN_THEMES.cad.grid[1],
);
scene.add(grid);

const axes = new THREE.AxesHelper(30);
scene.add(axes);

const cadScene = new CadScene(scene);
function ac() {
  return cadScene.getActiveComponent();
}
function ab() {
  return cadScene.getActiveBody();
}

function getBodyBrushRadius(): number {
  return cadScene.size * (bodyBrushPct / 100);
}

function captureBodyMeshBuffers(): Record<string, ArrayBuffer> {
  const map: Record<string, ArrayBuffer> = {};
  for (const body of cadScene.listBodies()) {
    if (body.meshBuffer) map[body.id] = body.meshBuffer;
  }
  return map;
}

function captureBodyKinds(): Record<string, BodyKind> {
  const map: Record<string, BodyKind> = {};
  for (const body of cadScene.listBodies()) {
    map[body.id] = body.bodyKind;
  }
  return map;
}

function pushMeshUndo(label = 'Körper bearbeiten') {
  undoHistory.push(
    captureSnapshot(
      contours,
      activeDraft,
      ac().alignment,
      captureBodyTransforms(),
      captureBodyMeshBuffers(),
      captureBodyKinds(),
      sketches,
      activeSketchId,
      sketchDimensions,
    ),
    label,
  );
  refreshHistoryTimeline();
}

function captureBodyTransforms(): Record<string, BodyTransform> {
  const map: Record<string, BodyTransform> = {};
  for (const body of cadScene.listBodies()) {
    cadScene.readBodyTransform(body.id);
    map[body.id] = { ...body.transform };
  }
  return map;
}

function isDefaultTransform(t: BodyTransform): boolean {
  return (
    t.posX === 0 &&
    t.posY === 0 &&
    t.posZ === 0 &&
    t.rotX === 0 &&
    t.rotY === 0 &&
    t.rotZ === 0
  );
}

function selectBody(bodyId: string) {
  const body = cadScene.getBody(bodyId);
  if (!body || !bodyHasContent(body)) return;
  if (
    handleSubtractBodyPick(bodyId, {
      setStatus,
      getBody: (id) => cadScene.getBody(id),
      runSubtract: runBooleanSubtract,
    })
  ) {
    refreshBrowserPanel();
    return;
  }
  cadScene.setActiveBody(bodyId);
  appMenu.selectTab('body', false);
  setWorkspaceMode('body', { tool: bodyGizmoTool(tool) ? tool : 'navigate' });
  updateTransformGizmo();
  applyScanTheme(bodyDisplayMode, bodyBrightness);
  refreshBrowserPanel();
  if (bodyGizmoTool(tool)) {
    setStatus(t('status.bodyGizmo', { label: body.label, mode: tool === 'scale-body' ? t('status.bodyGizmoScale') : t('status.bodyGizmoMove') }));
  }
}

function refreshBodyMeshVisuals(body: ReturnType<CadScene['getBody']>) {
  if (!body?.geometry) return;
  const theme = SCAN_THEMES[bodyDisplayMode];
  updateWireEdgesOn(body.meshGroup, body.geometry, theme.edgeThreshold);
  disposeSolidBodyGeom(body.id);
  if (isTraceAssistOn(body.id)) applyTraceAssistForBody(body.id);
  if (body.id === ab().id) applyScanTheme(bodyDisplayMode, bodyBrightness);
}

async function rebuildBodyFromMeshBuffer(body: ReturnType<CadScene['getBody']>) {
  if (!body?.meshBuffer) return;
  const mesh = parse_stl_with_stride(new Uint8Array(body.meshBuffer), body.displayStride);
  body.meshGroup.clear();
  const built = buildScanMesh(body, mesh.positions, mesh.indices);
  body.meshGroup.add(built);
  disposeSolidBodyGeom(body.id);
  if (isTraceAssistOn(body.id)) applyTraceAssistForBody(body.id);
}

function clearBodyMeshState(body: CadBodyRecord) {
  disposeSolidBodyGeom(body.id);
  disposeFestkoerperMesh(body);
  body.meshGroup.traverse((node) => {
    if (node instanceof THREE.Mesh || node instanceof THREE.LineSegments || node instanceof THREE.Points) {
      node.geometry.dispose();
      const mat = node.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat.dispose();
    }
  });
  body.meshGroup.clear();
  body.geometry?.dispose();
  body.geometry = null;
  body.meshBuffer = null;
}

async function restoreBodyMesh(
  body: CadBodyRecord,
  stlBuf: ArrayBuffer,
  label: string,
  stride: number,
  bodyKind: BodyKind,
) {
  clearBodyMeshState(body);
  body.label = label;
  body.displayStride = stride;
  assignBodyKind(body, bodyKind);
  if (!stlHasTriangles(stlBuf)) return;

  body.meshBuffer = stlBuf.slice(0);
  const mesh = parse_stl_with_stride(new Uint8Array(stlBuf), stride);
  const built = buildScanMesh(body, mesh.positions, mesh.indices);
  body.meshGroup.add(built);
  disposeSolidBodyGeom(body.id);
  if (isTraceAssistOn(body.id)) applyTraceAssistForBody(body.id);
}

function clearSectionBandHelper() {
  if (!sectionBandHelper) return;
  sectionBandHelper.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      node.geometry.dispose();
      (node.material as THREE.Material).dispose();
    }
  });
  sectionBandHelper.removeFromParent();
  sectionBandHelper = null;
}

function updateSectionBandHelper(
  body: NonNullable<ReturnType<CadScene['getBody']>>,
  origin: THREE.Vector3,
  normal: THREE.Vector3,
) {
  clearSectionBandHelper();
  const depth = smoothSectionDepthMm;
  const radius = getBodyBrushRadius();
  const geom = new THREE.CylinderGeometry(radius, radius, Math.max(depth, 0.5), 24, 1, true);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x4da3ff,
    transparent: true,
    opacity: 0.24,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geom, mat);
  const axis = new THREE.Vector3(0, 1, 0);
  const n = normal.clone().normalize();
  mesh.quaternion.setFromUnitVectors(axis, n);
  mesh.position.copy(origin).add(n.multiplyScalar(depth * 0.5));
  mesh.name = 'section-band';
  body.meshGroup.add(mesh);
  sectionBandHelper = mesh;
}

function smoothPaintOptions(session: SmoothPaintSession): SmoothOptions {
  const opts: SmoothOptions = {
    edgeOnly: smoothEdgeOnly,
    edgeBoost: 1.6,
    iterations: 2,
  };
  if (session.sectionOrigin && session.sectionNormal) {
    opts.sectionOrigin = session.sectionOrigin;
    opts.sectionNormal = session.sectionNormal;
    opts.sectionDepth = smoothSectionDepthMm;
  }
  return opts;
}

function applySmoothAtPick(pick: SurfacePick, session: SmoothPaintSession) {
  const body = cadScene.getBody(session.bodyId);
  if (!body?.geometry) return;
  body.meshGroup.updateMatrixWorld(true);
  const inv = body.meshGroup.matrixWorld.clone().invert();
  const localCenter = pick.point.clone().applyMatrix4(inv);
  taubinSmoothRegion(
    body.geometry,
    localCenter,
    getBodyBrushRadius(),
    smoothStrengthPct / 100,
    smoothPaintOptions(session),
  );
  body.geometry.computeVertexNormals();
  refreshBodyMeshVisuals(body);
}

function beginSmoothPaint(pick: SurfacePick, resetSection = false) {
  const body = cadScene.getBody(pick.bodyId);
  if (!body?.geometry) return;
  body.meshGroup.updateMatrixWorld(true);
  const inv = body.meshGroup.matrixWorld.clone().invert();
  const localCenter = pick.point.clone().applyMatrix4(inv);
  const localNormal = pick.normal.clone().transformDirection(inv).normalize();

  if (!smoothPaint || smoothPaint.bodyId !== pick.bodyId) {
    pushMeshUndo();
    smoothPaint = { bodyId: pick.bodyId, undoPushed: true };
  }

  if (tool === 'smooth-section' && resetSection) {
    smoothPaint.sectionOrigin = undefined;
    smoothPaint.sectionNormal = undefined;
    clearSectionBandHelper();
  }

  if (tool === 'smooth-section') {
    if (!smoothPaint.sectionOrigin) {
      smoothPaint.sectionOrigin = localCenter.clone();
      smoothPaint.sectionNormal = localNormal.clone();
      updateSectionBandHelper(body, localCenter, localNormal);
      setStatus(t('status.smoothSection', { depth: smoothSectionDepthMm }));
    }
  } else {
    clearSectionBandHelper();
  }

  applySmoothAtPick(pick, smoothPaint);
}

function endSmoothPaint() {
  const session = smoothPaint;
  smoothPaint = null;
  if (!session) return;
  const body = cadScene.getBody(session.bodyId);
  if (!body?.geometry) return;
  void commitBodyGeometry(body).then(() => {
    updateWorldScanBounds();
    setStatus(
      tool === 'smooth-section'
        ? t('status.sectionDone', { label: body.label })
        : t('status.smoothDone', { label: body.label }),
    );
  });
}

function pickBodySurfaceAt(clientX: number, clientY: number): SurfacePick | null {
  const bodyId = pickBodyMeshAt(clientX, clientY);
  if (!bodyId) return null;
  const body = cadScene.getBody(bodyId);
  if (!body?.geometry) return null;

  const rect = renderer.domElement.getBoundingClientRect();
  pickPointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pickPointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  pickRaycaster.setFromCamera(pickPointer, camera);

  const targets: THREE.Object3D[] = [];
  for (const name of ['solid', 'festkoerper', 'wire'] as const) {
    const obj = body.meshGroup.getObjectByName(name);
    if (obj?.visible) targets.push(obj);
  }
  if (!targets.length) return null;

  const hits = pickRaycaster.intersectObjects(targets, false);
  if (!hits.length || !hits[0].face) return null;

  const point = hits[0].point.clone();
  const normal = hits[0].face.normal.clone();
  if (hits[0].object.parent) {
    hits[0].object.parent.updateMatrixWorld(true);
    normal.transformDirection(hits[0].object.parent.matrixWorld).normalize();
  }
  return { bodyId, point, normal };
}

async function bakeActiveBodyTransform(recordUndo = true) {
  const body = ab();
  if (!body.geometry || !body.meshGroup.children.length) return;
  if (recordUndo) pushMeshUndo();
  body.transform = bakeMeshGroupTransform(body.meshGroup, body.geometry);
  await commitBodyGeometry(body);
  refreshBodyMeshVisuals(body);
  cadScene.updateWorldMatrix();
  updateWorldScanBounds();
  updateHitFeedback();
  setStatus(t('status.bodyBaked', { label: body.label }));
}

async function duplicateBodyFrom(
  src: CadBodyRecord,
  label: string,
  transform: BodyTransform,
  recordUndo: boolean,
): Promise<CadBodyRecord | null> {
  if (!src.meshBuffer || !src.geometry) return null;
  if (recordUndo) pushMeshUndo();
  const bodyId = cadScene.nextBodyId(ac().id);
  const body = cadScene.createBody(ac().id, bodyId, label);
  assignBodyKind(body, src.bodyKind);
  body.meshBuffer = src.meshBuffer.slice(0);
  body.displayStride = src.displayStride;
  body.transform = { ...transform };
  applyAlignment(body.meshGroup, body.transform);
  const mesh = parse_stl_with_stride(new Uint8Array(body.meshBuffer), body.displayStride);
  const built = buildScanMesh(body, mesh.positions, mesh.indices);
  body.meshGroup.add(built);
  return body;
}

async function duplicateActiveBody() {
  const src = ab();
  if (!src.meshBuffer || !src.geometry) {
    setStatus(t('status.noMeshDuplicate'));
    return;
  }
  const label = `${src.label} Kopie`;
  const body = await duplicateBodyFrom(src, label, { ...src.transform }, true);
  if (!body) return;
  cadScene.setActiveBody(body.id);
  updateTransformGizmo();
  refreshBrowserPanel();
  setStatus(t('status.bodyDuplicated', { label }));
}

async function mirrorActiveBody(axis: 'x' | 'y' | 'z' = 'x') {
  const body = ab();
  if (!body.geometry) {
    setStatus(t('status.noMeshMirror'));
    return;
  }
  pushMeshUndo();
  const mirrored = mirrorGeometry(body.geometry, axis);
  replaceBodyGeometry(body, mirrored);
  await commitBodyGeometry(body);
  refreshBodyMeshVisuals(body);
  updateWorldScanBounds();
  refreshBrowserPanel();
  recordSolidFeature('mirror', `${body.label} (${axis.toUpperCase()})`, body.id);
  setStatus(t('status.bodyMirrored', { label: body.label, axis: axis.toUpperCase() }));
}

function deleteBodyById(bodyId: string) {
  const body = cadScene.getBody(bodyId);
  if (!body) return;
  const compId = body.componentId;
  if (cadScene.listBodies(compId).length <= 1) {
    setStatus(t('status.cannotDeleteLastBody'));
    return;
  }
  pushMeshUndo();
  const label = body.label;
  disposeSolidBodyGeom(bodyId);
  body.geometry?.dispose();
  body.meshGroup.traverse((node) => {
    if (node instanceof THREE.Mesh || node instanceof THREE.LineSegments || node instanceof THREE.Points) {
      node.geometry.dispose();
      const mat = node.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat.dispose();
    }
  });
  bodySolidColors.delete(bodyId);
  bodyTraceAssist.delete(bodyId);
  cadScene.removeBody(bodyId);
  updateTransformGizmo();
  refreshBrowserPanel();
  setStatus(t('status.bodyDeleted', { label }));
}

function deleteActiveBody() {
  deleteBodyById(ab().id);
}

function renameBody(bodyId: string) {
  const body = cadScene.getBody(bodyId);
  if (!body) return;
  const next = window.prompt(t('browser.prompt.bodyName'), body.label);
  if (!next?.trim()) return;
  body.label = next.trim();
  refreshBrowserPanel();
  setStatus(t('status.bodyRenamed', { label: body.label }));
}

function renameComponent(compId: string) {
  const comp = cadScene.getComponent(compId);
  if (!comp) return;
  const next = window.prompt(t('browser.prompt.componentName'), comp.label);
  if (!next?.trim()) return;
  comp.label = next.trim();
  refreshBrowserPanel();
  setStatus(t('status.componentRenamed', { label: comp.label }));
}

function resetComponentAlignment(compId: string) {
  const comp = cadScene.getComponent(compId);
  if (!comp) return;
  pushUndo('Komponente zurücksetzen');
  comp.alignment = { ...DEFAULT_ALIGNMENT };
  applyAlignment(comp.group, comp.alignment);
  if (compId === ac().id) onBodyTransformChanged();
  refreshBrowserPanel();
  setStatus(t('status.alignmentReset', { label: comp.label }));
}

let browserCtxTarget: BrowserContextTarget | null = null;

function hideBrowserContextMenu() {
  browserContextMenu.classList.add('hidden');
  browserCtxTarget = null;
}

function buildBrowserContextMenu(target: BrowserContextTarget) {
  if (target.kind === 'body') {
    const body = cadScene.getBody(target.id);
    if (!body) return;
    const compBodies = cadScene.listBodies(body.componentId);
    browserCtxTitle.textContent = body.label;
    const traceOn = isTraceAssistOn(target.id);
    browserCtxActions.innerHTML = [
      `<button type="button" data-browser-ctx="rename">${t('browser.ctx.rename')}</button>`,
      `<button type="button" data-browser-ctx="color">${t('browser.ctx.color')}</button>`,
      `<div class="vm-section">${t('browser.ctx.actions')}</div>`,
      `<button type="button" data-browser-ctx="select">${t('browser.ctx.select')}</button>`,
      `<button type="button" data-browser-ctx="toggle-vis">${body.visible ? t('browser.ctx.hide') : t('browser.ctx.show')}</button>`,
      `<button type="button" data-browser-ctx="toggle-trace">${traceOn ? t('browser.ctx.traceOff') : t('browser.ctx.traceOn')}</button>`,
      `<button type="button" data-browser-ctx="move">${t('browser.ctx.move')}</button>`,
      `<button type="button" data-browser-ctx="smooth">${t('browser.ctx.smooth')}</button>`,
      `<button type="button" data-browser-ctx="duplicate">${t('browser.ctx.duplicate')}</button>`,
      `<button type="button" data-browser-ctx="reset-transform">${t('browser.ctx.resetTransform')}</button>`,
      `<button type="button" data-browser-ctx="delete" class="ctx-danger" ${compBodies.length <= 1 ? 'disabled' : ''}>${t('browser.ctx.delete')}</button>`,
    ].join('');
    return;
  }

  const comp = cadScene.getComponent(target.id);
  if (!comp) return;
  browserCtxTitle.textContent = comp.label;
  browserCtxActions.innerHTML = [
    `<button type="button" data-browser-ctx="rename">${t('browser.ctx.rename')}</button>`,
    `<div class="vm-section">${t('browser.ctx.actions')}</div>`,
    `<button type="button" data-browser-ctx="activate">${t('browser.ctx.activate')}</button>`,
    `<button type="button" data-browser-ctx="toggle-vis">${comp.visible ? t('browser.ctx.hide') : t('browser.ctx.show')}</button>`,
    `<button type="button" data-browser-ctx="align-reset">${t('browser.ctx.alignReset')}</button>`,
  ].join('');
}

function showBrowserContextMenu(target: BrowserContextTarget, event: MouseEvent) {
  hideViewportMenu();
  hidePointMenu();
  hideBodyColorMenu();
  browserCtxTarget = target;
  buildBrowserContextMenu(target);
  browserContextMenu.classList.remove('hidden');

  const rect = browserPanelEl.getBoundingClientRect();
  const menuW = browserContextMenu.offsetWidth || 196;
  const menuH = browserContextMenu.offsetHeight || 220;
  let left = event.clientX - rect.left;
  let top = event.clientY - rect.top;
  left = Math.min(Math.max(4, left), rect.width - menuW - 4);
  top = Math.min(Math.max(4, top), rect.height - menuH - 4);
  browserContextMenu.style.left = `${left}px`;
  browserContextMenu.style.top = `${top}px`;
}

function applyBrowserContextAction(action: string) {
  const target = browserCtxTarget;
  if (!target) return;

  if (target.kind === 'body' && action === 'color') {
    const anchor = browserContextMenu.getBoundingClientRect();
    const bodyId = target.id;
    hideBrowserContextMenu();
    cadScene.setActiveBody(bodyId);
    showBodyColorMenuInBrowser(bodyId, anchor);
    return;
  }

  hideBrowserContextMenu();

  if (target.kind === 'body') {
    const bodyId = target.id;
    switch (action) {
      case 'rename':
        renameBody(bodyId);
        return;
      case 'select':
        selectBody(bodyId);
        return;
      case 'toggle-vis':
        toggleBrowserItem(`body:${bodyId}`);
        return;
      case 'toggle-trace':
        cadScene.setActiveBody(bodyId);
        toggleBrowserItem(`body-trace:${bodyId}`);
        return;
      case 'move':
        selectBody(bodyId);
        setTool('move-body');
        return;
      case 'smooth':
        selectBody(bodyId);
        setTool('smooth-section');
        return;
      case 'duplicate':
        cadScene.setActiveBody(bodyId);
        void duplicateActiveBody();
        return;
      case 'reset-transform':
        cadScene.setActiveBody(bodyId);
        resetBodyTransform();
        return;
      case 'delete':
        deleteBodyById(bodyId);
        return;
    }
  }

  const compId = target.id;
  switch (action) {
    case 'rename':
      renameComponent(compId);
      return;
    case 'activate':
      cadScene.setActiveComponent(compId);
      refreshBrowserPanel();
      setStatus(t('status.componentActive', { label: cadScene.getComponent(compId)?.label ?? compId }));
      return;
    case 'toggle-vis':
      toggleBrowserItem(`component:${compId}`);
      return;
    case 'align-reset':
      resetComponentAlignment(compId);
      return;
  }
}

function showBodyColorMenuInBrowser(bodyId: string, anchor?: DOMRect) {
  bodyColorMenuTarget = bodyId;
  syncBodyColorMenuUi(numberToHexColor(getBodySolidColor(bodyId)));
  bodyColorMenu.classList.remove('hidden');
  browserPanelEl.appendChild(bodyColorMenu);
  bodyColorMenu.style.position = 'absolute';

  const ctxRect = anchor ?? browserContextMenu.getBoundingClientRect();
  const panelRect = browserPanelEl.getBoundingClientRect();
  const menuW = bodyColorMenu.offsetWidth || 200;
  const menuH = bodyColorMenu.offsetHeight || 160;
  let left = ctxRect.right - panelRect.left + 6;
  let top = ctxRect.top - panelRect.top;
  if (left + menuW > panelRect.width - 4) {
    left = ctxRect.left - panelRect.left - menuW - 6;
  }
  top = Math.min(Math.max(4, top), panelRect.height - menuH - 4);
  bodyColorMenu.style.position = 'absolute';
  bodyColorMenu.style.left = `${left}px`;
  bodyColorMenu.style.top = `${top}px`;
}

async function runBooleanSubtract(toolId: string, targetId: string) {
  const tool = cadScene.getBody(toolId);
  const target = cadScene.getBody(targetId);
  if (!tool?.geometry || !target?.geometry) {
    setStatus(t('status.subtractFailed'));
    return;
  }

  pushMeshUndo(t('undo.subtract'));
  const result = await booleanSubtractBodies(target, tool);
  if (!result) {
    setStatus(t('status.subtractFailed'));
    return;
  }

  replaceBodyGeometry(target, result);
  await commitBodyGeometry(target);
  target.meshGroup.clear();
  const mesh = parse_stl_with_stride(new Uint8Array(target.meshBuffer!), target.displayStride);
  const built = buildScanMesh(target, mesh.positions, mesh.indices);
  target.meshGroup.add(built);
  disposeSolidBodyGeom(target.id);
  if (isTraceAssistOn(target.id)) applyTraceAssistForBody(target.id);
  refreshBodyMeshVisuals(target);
  cadScene.setActiveBody(targetId);
  cadScene.updateWorldMatrix();
  updateWorldScanBounds();
  updateHitFeedback();
  refreshBrowserPanel();
  recordSolidFeature('subtract', target.label, targetId);
  setStatus(t('status.subtractDone', { label: target.label }));
}

async function cutBodyByWorkPlane() {
  const body = ab();
  if (!body.geometry) {
    setStatus(t('status.noMeshCut'));
    return;
  }
  pushMeshUndo();
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
    planeNormal(planeAxis),
    planePoint(planeAxis, planePosition),
  );
  body.meshGroup.updateMatrixWorld(true);
  const localPlane = plane.clone().applyMatrix4(body.meshGroup.matrixWorld.clone().invert());
  const clipped = clipGeometryByPlane(body.geometry, localPlane);
  if (!clipped) {
    setStatus(t('status.cutEmpty'));
    return;
  }
  replaceBodyGeometry(body, clipped);
  await commitBodyGeometry(body);
  refreshBodyMeshVisuals(body);
  updateWorldScanBounds();
  recordSolidFeature('split-body', body.label, body.id);
  setStatus(t('status.bodyCut', { label: body.label }));
}

function contourWorldMatrix(c: Contour): THREE.Matrix4 {
  if (isContourAttached(c) && c.attachedToBodyId) {
    return cadScene.getAttachWorldMatrix(c.attachedToBodyId);
  }
  cadScene.updateWorldMatrix();
  return cadScene.worldMatrix;
}

const lastBodyAttachMatrices = new Map<string, THREE.Matrix4>();

function syncAttachedContourDisplay() {
  const attachedIds = new Set(
    contours
      .filter((c) => isContourAttached(c) && c.attachedToBodyId)
      .map((c) => c.attachedToBodyId!),
  );
  if (!attachedIds.size) return;

  let changed = false;
  for (const bodyId of attachedIds) {
    const wm = cadScene.getBodyWorldMatrix(bodyId);
    let prev = lastBodyAttachMatrices.get(bodyId);
    if (!prev) {
      prev = wm.clone();
      lastBodyAttachMatrices.set(bodyId, prev);
      changed = true;
      continue;
    }
    if (!prev.equals(wm)) {
      prev.copy(wm);
      changed = true;
    }
  }
  if (changed) rebuildContourLines();
}

let transformSpace: 'world' | 'local' = 'world';

const transformControls = new TransformControls(camera, renderer.domElement);
transformControls.setMode('translate');
transformControls.setSpace(transformSpace);
scene.add(transformControls.getHelper());

transformControls.addEventListener('dragging-changed', (event) => {
  if (event.value && !transformUndoPushed) {
    if (tool === 'scale-body') pushMeshUndo();
    else pushUndo('Gizmo verschieben');
    transformUndoPushed = true;
  }
  if (!event.value) {
    transformUndoPushed = false;
    if (tool === 'scale-body') void bakeActiveBodyTransform(false);
  }
  if (!event.value) syncOrbitControls();
  else controls.enabled = false;
});

transformControls.addEventListener('objectChange', () => {
  onBodyTransformChanged();
});

function syncOrbitControls() {
  applyViewportNavigation(controls, {
    tool,
    activeSketchId,
    shiftKeyHeld,
    viewCubeAnimating: viewCube.animating,
    viewCubeDragging: viewCube.dragging,
    transformDragging: transformControls.dragging,
    draggingPlane,
  });
}

syncOrbitControls();

const drawGroup = new THREE.Group();
drawGroup.name = 'draw';
scene.add(drawGroup);

const formGroup = new THREE.Group();
formGroup.name = 'form';
scene.add(formGroup);

const extrudeGizmoGroup = new THREE.Group();
extrudeGizmoGroup.name = 'extrude-gizmo';
scene.add(extrudeGizmoGroup);
const extrudeGizmo = createExtrudeGizmo(extrudeGizmoGroup, () => cadScene.size);

const hitGroup = new THREE.Group();
hitGroup.name = 'hit-feedback';
scene.add(hitGroup);

const editGroup = new THREE.Group();
editGroup.name = 'edit';
scene.add(editGroup);

const originPlanesGroup = new THREE.Group();
originPlanesGroup.name = 'origin-planes';
scene.add(originPlanesGroup);

const sketchGridGroup = new THREE.Group();
sketchGridGroup.name = 'sketch-grid';
sketchGridGroup.visible = false;
scene.add(sketchGridGroup);

const sketchDimGroup = new THREE.Group();
sketchDimGroup.name = 'sketch-dimensions';
sketchDimGroup.visible = false;
scene.add(sketchDimGroup);

const sketchDimHoverGroup = new THREE.Group();
sketchDimHoverGroup.name = 'sketch-dim-hover';
sketchDimHoverGroup.visible = false;
scene.add(sketchDimHoverGroup);

let workPlaneMesh = makeWorkPlaneMesh('xy', 0, 200);
scene.add(workPlaneMesh);

const clipPlanes: THREE.Plane[] = [
  new THREE.Plane(new THREE.Vector3(-1, 0, 0), Infinity),
  new THREE.Plane(new THREE.Vector3(0, -1, 0), Infinity),
  new THREE.Plane(new THREE.Vector3(0, 0, -1), Infinity),
];

const overlay = document.createElement('canvas');
overlay.id = 'draw-overlay';
viewport.appendChild(overlay);
const octx = overlay.getContext('2d')!;

function updateLineResolutions() {
  for (const root of [drawGroup, sketchDimGroup, sketchGridGroup]) {
    root.traverse((obj) => {
      if (obj instanceof Line2) {
        (obj.material as LineMaterial).resolution.copy(lineResolution);
      }
    });
  }
}

function resize() {
  const w = viewport.clientWidth;
  const h = viewport.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  overlay.width = w;
  overlay.height = h;
  lineResolution.set(w, h);
  updateLineResolutions();
  viewCube.resize();
}

function updatePlaneSliderRange() {
  const slicePos = document.getElementById('slice-pos') as HTMLInputElement;
  const axisIdx = planeAxis === 'xy' ? 'z' : planeAxis === 'xz' ? 'y' : 'x';
  const min = cadScene.bounds.min[axisIdx];
  const max = cadScene.bounds.max[axisIdx];
  planePos.min = String(min);
  planePos.max = String(max);
  slicePos.min = String(cadScene.bounds.min.z);
  slicePos.max = String(cadScene.bounds.max.z);
  if (planePosition < min || planePosition > max) {
    planePosition = (min + max) * 0.5;
    planePos.value = String(planePosition);
    planePosVal.textContent = planePosition.toFixed(1);
  }
}

function refreshWorkPlaneMesh(hitVisual: PlaneHitVisual = 'neutral') {
  workPlaneMesh.removeFromParent();
  const drawing =
    tool !== 'navigate' &&
    tool !== 'align' &&
    tool !== 'sketch-pick' &&
    !bodyGizmoTool(tool) &&
    !meshSculptTool(tool) &&
    (isSketchDrawTool(tool, activeSketchId) || tool === 'polyline' || tool === 'lasso');
  const visual = hitPlaneFeedback || planeDragMode ? hitVisual : 'neutral';
  workPlaneMesh = makeWorkPlaneMesh(planeAxis, planePosition, cadScene.size * 2.2, drawing || planeDragMode, visual);
  if (planeDragMode) {
    const mat = workPlaneMesh.material as THREE.MeshBasicMaterial;
    mat.opacity = Math.max(mat.opacity, 0.38);
  }
  const hideWorkPlane = isEmptyProject() && tool === 'sketch-pick' && !activeSketchId;
  workPlaneMesh.visible = hideWorkPlane ? false : browserState.planeVisible;
  scene.add(workPlaneMesh);
}

function planeAxisComponent(v: THREE.Vector3): number {
  if (planeAxis === 'xy') return v.z;
  if (planeAxis === 'xz') return v.y;
  return v.x;
}

function intersectWorkPlane(clientX: number, clientY: number): THREE.Vector3 | null {
  const ray = screenToRay(clientX, clientY, renderer.domElement, camera);
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
    planeNormal(planeAxis),
    planePoint(planeAxis, planePosition),
  );
  const hit = new THREE.Vector3();
  return ray.intersectPlane(plane, hit) ? hit : null;
}

function setPlanePositionValue(next: number, margin = cadScene.size * 0.6) {
  const axisIdx = planeAxis === 'xy' ? 'z' : planeAxis === 'xz' ? 'y' : 'x';
  let min: number;
  let max: number;
  if (cadScene.bounds.isEmpty()) {
    const half = Math.max(cadScene.size * 0.6, 50);
    min = -half;
    max = half;
  } else {
    min = cadScene.bounds.min[axisIdx] - margin;
    max = cadScene.bounds.max[axisIdx] + margin;
  }
  planePosition = THREE.MathUtils.clamp(next, min, max);
  planePos.min = String(min);
  planePos.max = String(max);
  planePos.value = String(planePosition);
  if (activeDraft) activeDraft.position = planePosition;
  updateHitFeedback();
}

function setPlaneDragMode(on: boolean) {
  planeDragMode = on;
  draggingPlane = false;
  document.getElementById('plane-drag-toggle')?.classList.toggle('active', on);
  viewport.classList.toggle('tool-plane-drag', on);
  if (on) {
    hitPlaneFeedback = true;
    (document.getElementById('hit-plane') as HTMLInputElement).checked = true;
    transformControls.detach();
    if (!appMenu.isOpen('align')) appMenu.openAlignPanel();
    toolHint.textContent = t('toolHint.planeDrag');
    setStatus(t('status.planeDragActive'));
  } else {
    refreshToolHint();
    updateTransformGizmo();
  }
  refreshWorkPlaneMesh(getPlaneHitVisual());
  updateHitFeedback();
}

let alignBusy = false;

function applyAutoAlignResult(result: NonNullable<ReturnType<typeof computeAlignToPlane>>) {
  const tol = getEffectiveHitTolerance();
  ac().alignment = blendAlignmentToward(ac().alignment, result.alignment, {
    maxPos: Math.max(cadScene.size * 0.08, 3),
    maxRotDeg: 15,
    rotFraction: 0.4,
  });
  const geom = ab().geometry;
  if (geom) {
    ac().alignment = refineAlignmentPosition(
      geom,
      ac().alignment,
      planeAxis,
      planePosition,
      tol,
    );
  }
  applyAlignment(ac().group, ac().alignment);
  onBodyTransformChanged();

  const hits = geom
    ? countAlignmentHits(geom, ac().alignment, planeAxis, planePosition, tol)
    : { hitCount: 0, hitRatio: 0, sampleCount: 0 };
  const remainder = alignmentRemainder(ac().alignment, result.alignment);
  const converged = remainder.rotDeg < 1.5 && remainder.pos < tol;
  if (converged) {
    setStatus(
      t('status.autoAlignDone', {
        count: hits.hitCount.toLocaleString(),
        percent: (hits.hitRatio * 100).toFixed(0),
      }),
    );
  } else {
    const { rotX, rotY, rotZ } = ac().alignment;
    setStatus(
      t('status.autoAlignStep', {
        count: hits.hitCount.toLocaleString(),
        percent: (hits.hitRatio * 100).toFixed(0),
        rotX: rotX.toFixed(1),
        rotY: rotY.toFixed(1),
        rotZ: rotZ.toFixed(1),
        remainder: remainder.rotDeg.toFixed(0),
      }),
    );
  }
}

function autoAlignScanToPlane() {
  if (alignBusy) return;
  if (!ab().geometry) {
    setStatus(t('status.noBodyLoaded'));
    return;
  }
  pushUndo('Auto-Ausrichten');
  const tol = getEffectiveHitTolerance();
  const alignBtn = document.getElementById('align-to-plane') as HTMLButtonElement | null;
  alignBusy = true;
  if (alignBtn) alignBtn.disabled = true;
  setStatus(t('status.autoAlignComputing'));

  requestAnimationFrame(() => {
    try {
      const result = computeAlignToPlane(
        ab().geometry!,
        planeAxis,
        planePosition,
        tol,
        ac().alignment,
      );
      if (!result) {
        setStatus(t('status.autoAlignFailed'));
        return;
      }
      applyAutoAlignResult(result);
    } finally {
      alignBusy = false;
      if (alignBtn) alignBtn.disabled = false;
    }
  });
}

function isEmptyProject(): boolean {
  return cadScene.listBodies().every((b) => b.meshGroup.children.length === 0);
}

function bodyHasContent(body: ReturnType<CadScene['getBody']>): boolean {
  return !!body && (body.meshGroup.children.length > 0 || !!body.meshBuffer);
}

function closeActiveSketch() {
  discardIncompleteDraft(true);
  clearSketchInteraction();
  sketchDims.clearSession();
  setSketchOriginSnapFeedback(false);
  activeSketchId = null;
  hoveredOriginPlane = null;
  updateOriginPlaneHighlight(null);
  updateSketchGrid();
  sketchDims.rebuild();
  sketchDims.refreshList();
  updateSketchRibbonState(null, 'sketch-pick');
}


function viewPresetStatusLabel(preset: string): string {
  const keyMap: Record<string, string> = {
    top: 'view.top',
    bottom: 'view.bottom',
    front: 'view.front',
    back: 'view.back',
    side: 'view.side',
    right: 'view.side',
    left: 'view.left',
    perspective: 'view.perspective',
  };
  const key = keyMap[preset];
  return key ? t(key) : preset;
}

function refreshToolHint() {
  const navHint =
    activeSketchId || tool === 'sketch-pick' || tool.startsWith('sketch-')
      ? ` · ${getSketchViewportNavHint()}`
      : '';
  toolHint.textContent = getToolHint(tool) + navHint;
}

function syncWorkspaceChrome() {
  const app = document.getElementById('app');
  app?.classList.toggle('workspace-sketch', workspaceMode === 'sketch');
  app?.classList.toggle('workspace-body', workspaceMode === 'body');
  app?.classList.toggle('workspace-contour', workspaceMode === 'contour');
  const labelKey: 'workspace.sketch' | 'workspace.body' | 'workspace.contour' =
    workspaceMode === 'sketch'
      ? 'workspace.sketch'
      : workspaceMode === 'body'
        ? 'workspace.body'
        : 'workspace.contour';
  setWorkspaceModeLabel(labelKey);
}

function syncWorkspaceScene() {
  if (workspaceMode === 'sketch') {
    if (!activeSketchId) {
      originPlanesGroup.visible = browserState.originPlanesVisible;
      if (isEmptyProject()) setupEmptyProjectView();
    } else {
      originPlanesGroup.visible = false;
    }
    return;
  }

  originPlanesGroup.visible = false;
  hoveredOriginPlane = null;
  updateOriginPlaneHighlight(null);
  if (!isEmptyProject()) {
    browserState.planeVisible = true;
    refreshWorkPlaneMesh(getPlaneHitVisual());
  }
}

function setWorkspaceMode(mode: WorkspaceMode, opts?: { tool?: Tool; keepSketch?: boolean }) {
  if (mode === workspaceMode && !opts?.tool && (mode === 'sketch' || !activeSketchId)) {
    syncWorkspaceChrome();
    return;
  }

  if (mode !== 'sketch' && activeSketchId && !opts?.keepSketch) {
    closeActiveSketch();
  }

  workspaceMode = mode;
  syncWorkspaceChrome();
  syncWorkspaceScene();

  if (mode === 'sketch') {
    transformControls.detach();
    const next = opts?.tool ?? (activeSketchId ? 'navigate' : 'sketch-pick');
    setTool(next, { skipWorkspaceCheck: true });
    return;
  }

  transformControls.detach();
  const fallback = toolAllowedInWorkspace(tool, mode, null) ? tool : 'navigate';
  setTool(opts?.tool ?? fallback, { skipWorkspaceCheck: true });
}

handleTabWorkspaceSwitch = (tab) => {
  const ws = workspaceForTab(tab);
  if (ws) setWorkspaceMode(ws);
};

function setupEmptyProjectView() {
  const origin = new THREE.Vector3(0, 0, 0);
  cadScene.size = EMPTY_PROJECT_VIEW_SIZE;
  cadScene.bounds.setFromCenterAndSize(
    origin,
    new THREE.Vector3(EMPTY_PROJECT_VIEW_SIZE, EMPTY_PROJECT_VIEW_SIZE, EMPTY_PROJECT_VIEW_SIZE),
  );

  controls.target.copy(origin);
  const dist = EMPTY_PROJECT_VIEW_SIZE * 1.45;
  camera.position.set(dist * 0.72, dist * 0.58, dist * 0.72);
  camera.up.set(0, 1, 0);
  camera.lookAt(origin);
  controls.update();

  viewCube.setFocus(origin, dist);

  const theme = SCAN_THEMES.cad;
  (grid.geometry as THREE.BufferGeometry).dispose();
  grid.geometry = new THREE.GridHelper(
    EMPTY_PROJECT_VIEW_SIZE * 2,
    40,
    theme.grid[0],
    theme.grid[1],
  ).geometry;
  grid.position.set(0, 0, 0);
  grid.visible = browserState.gridVisible;
  axes.scale.setScalar(EMPTY_PROJECT_VIEW_SIZE / 30);
  axes.position.set(0, 0, 0);

  browserState.planeVisible = false;
  browserState.originPlanesVisible = true;
  originPlanesGroup.visible = true;

  initOriginPlanes();
  refreshWorkPlaneMesh();
  updateOriginPlaneHighlight(null);
}

function updateWorldScanBounds(fitCamera = false) {
  if (!ab().meshGroup.children.length) {
    if (!activeSketchId && workspaceMode === 'sketch' && tool === 'sketch-pick') setupEmptyProjectView();
    else initOriginPlanes();
    return;
  }
  ac().group.updateMatrixWorld(true);
  const box = getWorldScanBox(ac().group);
  if (box.isEmpty()) {
    initOriginPlanes();
    return;
  }

  cadScene.bounds = box;
  const size = box.getSize(new THREE.Vector3());
  cadScene.size = Math.max(size.x, size.y, size.z, 1);

  updatePlaneSliderRange();
  refreshWorkPlaneMesh(getPlaneHitVisual());
  viewCube.setFocus(cadScene.bounds.getCenter(new THREE.Vector3()), cadScene.size * 1.3);
  initOriginPlanes();

  if (fitCamera) fitCameraToBox(cadScene.bounds);
}

function disposeOriginPlaneNode(node: THREE.Object3D) {
  node.traverse((child) => {
    if (child instanceof THREE.Sprite) {
      const mat = child.material as THREE.SpriteMaterial;
      mat.map?.dispose();
      mat.dispose();
      return;
    }
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
    }
  });
}

function initOriginPlanes() {
  while (originPlanesGroup.children.length) {
    const child = originPlanesGroup.children[0];
    disposeOriginPlaneNode(child);
    child.removeFromParent();
  }
  const size = originPlaneSize(cadScene.size);
  for (const axis of ['xy', 'xz', 'yz'] as PlaneAxis[]) {
    originPlanesGroup.add(makeOriginPlaneGroup(axis, size));
  }
  originPlanesGroup.visible = browserState.originPlanesVisible;
  const activeAxis = activeSketchId
    ? (sketches.find((s) => s.id === activeSketchId)?.axis ?? null)
    : null;
  updateOriginPlaneHighlight(activeAxis);
}

function updateOriginPlaneHighlight(
  activeAxis: PlaneAxis | null,
  hoverAxis: PlaneAxis | null = hoveredOriginPlane,
) {
  const pickMode = tool === 'sketch-pick' && !activeSketchId;
  const emphasize = pickMode || isEmptyProject();

  originPlanesGroup.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.name.startsWith('origin-plane-')) return;
    const axis = parseOriginPlaneName(child.name);
    if (!axis) return;
    const mat = child.material as THREE.MeshBasicMaterial;
    const isActive = axis === activeAxis;
    const isHover = axis === hoverAxis;

    if (isActive) {
      mat.opacity = 0.52;
      mat.color.setHex(0xffffff);
    } else if (isHover) {
      mat.opacity = 0.46;
      mat.color.setHex(brightenColor(ORIGIN_PLANE_COLORS[axis], 1.12));
    } else if (activeAxis) {
      mat.opacity = 0.1;
      mat.color.setHex(ORIGIN_PLANE_COLORS[axis]);
    } else {
      mat.opacity = emphasize ? 0.34 : 0.24;
      mat.color.setHex(ORIGIN_PLANE_COLORS[axis]);
    }
  });
}

function pickOriginPlane(clientX: number, clientY: number): PlaneAxis | null {
  const rect = renderer.domElement.getBoundingClientRect();
  pickPointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pickPointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  pickRaycaster.setFromCamera(pickPointer, camera);
  const hits = pickRaycaster.intersectObjects(originPlanesGroup.children, true);
  if (!hits.length) return null;
  return originPlaneAxisFromObject(hits[0].object);
}

function updateOriginPlaneHover(clientX: number, clientY: number) {
  if (tool !== 'sketch-pick' || activeSketchId) {
    if (hoveredOriginPlane) {
      hoveredOriginPlane = null;
      updateOriginPlaneHighlight(
        activeSketchId ? (sketches.find((s) => s.id === activeSketchId)?.axis ?? null) : null,
      );
    }
    return;
  }
  const axis = pickOriginPlane(clientX, clientY);
  if (axis === hoveredOriginPlane) return;
  hoveredOriginPlane = axis;
  updateOriginPlaneHighlight(null, axis);
  viewport.style.cursor = axis ? 'pointer' : '';
}

function ensureSketchesFromContours() {
  for (const c of contours) {
    if (c.sketchId && sketches.some((s) => s.id === c.sketchId)) continue;
    const compId = c.componentId ?? DEFAULT_COMPONENT_ID;
    let sk = sketches.find(
      (s) =>
        s.componentId === compId &&
        s.axis === c.axis &&
        Math.abs(s.position - c.position) < 0.01,
    );
    if (!sk) {
      const count = sketches.filter((s) => s.componentId === compId && s.axis === c.axis).length;
      sk = {
        id: uid(),
        componentId: compId,
        label: sketchLabelForAxis(c.axis, count),
        axis: c.axis,
        position: c.position,
        visible: true,
      };
      sketches.push(sk);
    }
    c.sketchId = sk.id;
  }
}

function beginSketchOnPlane(axis: PlaneAxis, position = 0) {
  discardIncompleteDraft(true);
  const compId = ac().id;
  const existingCount = sketches.filter((s) => s.componentId === compId && s.axis === axis).length;
  const sketch: Sketch = {
    id: uid(),
    componentId: compId,
    label: sketchLabelForAxis(axis, existingCount),
    axis,
    position,
    visible: true,
  };
  sketches.push(sketch);
  activeSketchId = sketch.id;
  planeAxis = axis;
  planeAxisSel.value = axis;
  setPlanePositionValue(position, 0);
  updateOriginPlaneHighlight(axis);
  setView(viewPresetForSketchAxis(axis));
  updateSketchGrid();
  appMenu.selectTab('sketch', false);
  setWorkspaceMode('sketch', { tool: 'navigate', keepSketch: true });
  refreshWorkPlaneMesh(getPlaneHitVisual());
  updateHitFeedback();
  sketchDims.refreshList();
  refreshBrowserPanel();
  updateSketchRibbonState(activeSketchId, tool);
  setStatus(t('status.sketchOnAxis', { axis: axis.toUpperCase() }));
}

function activateSketch(sketchId: string) {
  const sk = sketches.find((s) => s.id === sketchId);
  if (!sk) return;
  discardIncompleteDraft(true);
  activeSketchId = sk.id;
  planeAxis = sk.axis;
  planeAxisSel.value = sk.axis;
  setPlanePositionValue(sk.position, 0);
  updateOriginPlaneHighlight(sk.axis);
  setView(viewPresetForSketchAxis(sk.axis));
  updateSketchGrid();
  appMenu.selectTab('sketch', false);
  setWorkspaceMode('sketch', { tool: 'navigate', keepSketch: true });
  refreshWorkPlaneMesh(getPlaneHitVisual());
  updateHitFeedback();
  sketchDims.refreshList();
  refreshBrowserPanel();
  updateSketchRibbonState(activeSketchId, tool);
  setStatus(t('status.sketchActive', { label: sk.label }));
}

function finishSketch() {
  closeActiveSketch();
  appMenu.selectTab('start', false);
  setWorkspaceMode('body', { tool: 'navigate' });
  refreshBrowserPanel();
  setStatus(t('status.sketchFinished'));
}

function enterSketchPickMode() {
  if (activeSketchId) return;
  appMenu.selectTab('sketch', false);
  setWorkspaceMode('sketch', { tool: 'sketch-pick' });
  setStatus(t('status.newSketch'));
}

function disposeSketchGridContents() {
  sketchPreviewLine = null;
  sketchGridGroup.traverse((child) => {
    if (child === sketchGridGroup) return;
    if (child instanceof Line2) {
      disposeLine2(child);
      return;
    }
    if (child instanceof THREE.Line || child instanceof THREE.LineSegments) {
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
      return;
    }
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
    }
  });
  sketchGridGroup.clear();
}

function updateSketchGrid() {
  setSketchOriginSnapFeedback(false);
  disposeSketchGridContents();
  if (!activeSketchId) {
    sketchGridGroup.visible = false;
    sketchDims.rebuild();
    return;
  }
  const sk = sketches.find((s) => s.id === activeSketchId);
  if (!sk) {
    sketchGridGroup.visible = false;
    sketchDims.rebuild();
    return;
  }
  const extent = sketchGridExtent(cadScene.size);
  sketchGridGroup.add(makeSketchGrid(sk.axis, sk.position, extent, sketchGridSpacing));
  sketchGridGroup.add(makeSketchOriginMarker(sk.axis, sk.position, sketchGridSpacing));
  sketchGridGroup.visible = true;
  sketchDims.rebuild();
}

function clearSketchPreview() {
  if (sketchPreviewLine) {
    disposeLine2(sketchPreviewLine);
    sketchPreviewLine.removeFromParent();
    sketchPreviewLine = null;
  }
}

function clearSketchInteraction() {
  sketchInteraction = null;
  clearSketchPreview();
}

function showSketchPreview(points: THREE.Vector3[], closed: boolean, color = '#4da3ff') {
  clearSketchPreview();
  if (points.length < 2) return;
  sketchPreviewLine = makeContourLine(points, closed, color, lineResolution, 4);
  sketchPreviewLine.renderOrder = 6;
  sketchGridGroup.add(sketchPreviewLine);
}

function getSketchOriginMarker(): THREE.Object3D | null {
  return sketchGridGroup.getObjectByName('sketch-origin') ?? null;
}

function setSketchOriginSnapFeedback(active: boolean) {
  if (sketchOriginSnapActive === active) return;
  sketchOriginSnapActive = active;
  setSketchOriginMarkerHighlighted(getSketchOriginMarker(), active);
}

function pickSketchOriginMarker(clientX: number, clientY: number): THREE.Vector3 | null {
  if (!activeSketchId || !sketchGridGroup.visible) return null;
  const originGroup = getSketchOriginMarker();
  if (!originGroup) return null;
  const rect = renderer.domElement.getBoundingClientRect();
  pickPointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pickPointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  pickRaycaster.setFromCamera(pickPointer, camera);
  const hits = pickRaycaster.intersectObjects(originGroup.children, true);
  for (const h of hits) {
    let o: THREE.Object3D | null = h.object;
    while (o) {
      if (o.userData.sketchOriginPick) {
        setSketchOriginSnapFeedback(true);
        return sketchPlaneOrigin(planeAxis, planePosition);
      }
      o = o.parent;
    }
  }
  return null;
}

function applySketchSnap(
  hit: THREE.Vector3,
  axis: PlaneAxis = planeAxis,
  position: number = planePosition,
): THREE.Vector3 {
  if (!sketchGridSnap || !activeSketchId) {
    setSketchOriginSnapFeedback(false);
    return hit;
  }
  const snapped = snapSketchPointWithMeta(hit, axis, position, sketchGridSpacing);
  setSketchOriginSnapFeedback(snapped.snappedOrigin);
  return snapped.point;
}

function pickSketchHit(clientX: number, clientY: number): THREE.Vector3 | null {
  const originPick = pickSketchOriginMarker(clientX, clientY);
  if (originPick) return originPick;

  const hit = pickOnPlane(
    clientX,
    clientY,
    renderer.domElement,
    camera,
    workPlaneMesh,
    ac().group,
    planeAxis,
    planePosition,
  );
  if (!hit) {
    setSketchOriginSnapFeedback(false);
    return null;
  }
  return applySketchSnap(hit);
}

sketchDims = createSketchDimensionApi({
  getActiveSketchId: () => activeSketchId,
  getContours: () => contours,
  getSketchDimensions: () => sketchDimensions,
  setSketchDimensions: (dims) => {
    sketchDimensions = dims;
  },
  getSketchUnit: () => sketchUnit,
  getSketchDimKind: () => sketchDimKind,
  getSketchGridSpacing: () => sketchGridSpacing,
  getPlaneAxis: () => planeAxis,
  getPlanePosition: () => planePosition,
  getSceneSize: () => cadScene.size,
  getSketchDimGroup: () => sketchDimGroup,
  getSketchDimHoverGroup: () => sketchDimHoverGroup,
  getLineResolution: () => lineResolution,
  getRendererDom: () => renderer.domElement,
  getCamera: () => camera,
  pickSketchHit,
  pushUndo: (label?: string) => pushUndo(label),
  rebuildContourLines,
  setDimPickCursor: (canPick) => {
    viewport.classList.toggle('sketch-dim-can-pick', canPick && tool === 'sketch-dim');
  },
  openSketchPanel: () => appMenu.openTab('sketch'),
  onWorkflowEnd: () => {
    if (tool === 'sketch-dim') setTool('navigate');
    syncOrbitControls();
  },
  releasePointerCapture: () => {
    if (sketchDimCapturePointerId !== null) {
      try {
        if (renderer.domElement.hasPointerCapture(sketchDimCapturePointerId)) {
          renderer.domElement.releasePointerCapture(sketchDimCapturePointerId);
        }
      } catch {
        /* ignore */
      }
      sketchDimCapturePointerId = null;
    }
    syncOrbitControls();
  },
  sketchDimInputRow: dom.sketchDimInputRow,
  sketchDimValueInput: dom.sketchDimValueInput,
  sketchDimUnitLabel: dom.sketchDimUnitLabel,
  sketchDimApplyBtn: dom.sketchDimApplyBtn,
  sketchDimHud: dom.sketchDimHud,
  sketchDimHudValue: dom.sketchDimHudValue,
  sketchDimHudUnit: dom.sketchDimHudUnit,
  sketchDimHudApply: dom.sketchDimHudApply,
});

function commitSketchPrimitive(points: THREE.Vector3[], closed: boolean, label: string) {
  if (points.length < 2) return;
  pushUndo(`Skizze: ${label}`);
  const contour: Contour = {
    id: uid(),
    componentId: ac().id,
    sketchId: activeSketchId,
    axis: planeAxis,
    position: planePosition,
    points: points.map((p) => p.clone()),
    closed,
    color: CONTOUR_COLORS[contours.length % CONTOUR_COLORS.length],
    visible: true,
  };
  contours.push(contour);
  const line = makeContourLine(
    contour.points,
    contour.closed,
    contourLineColor(contour),
    lineResolution,
    contour.closed ? 6 : 5,
  );
  line.name = contour.id;
  line.visible = true;
  drawGroup.add(line);
  refreshContourList();
  setStatus(t('status.primitiveSaved', { label, count: points.length }));
}

function previewSketchPrimitive(tool: Tool, anchor: THREE.Vector3, cursor: THREE.Vector3) {
  if (tool === 'sketch-line') {
    showSketchPreview(linePoints(anchor, cursor), false);
    return;
  }
  if (tool === 'sketch-circle') {
    const pts = circlePoints(anchor, cursor, planeAxis, planePosition);
    showSketchPreview(pts.length ? [...pts, pts[0]] : [], true);
    return;
  }
  if (tool === 'sketch-rect') {
    const rect = rectanglePoints(anchor, cursor, planeAxis, planePosition);
    showSketchPreview([...rect, rect[0]], true);
  }
}

function previewSketchClicks(tool: 'sketch-arc' | 'sketch-triangle', points: THREE.Vector3[], cursor?: THREE.Vector3) {
  if (tool === 'sketch-triangle') {
    if (points.length === 1 && cursor) {
      showSketchPreview(linePoints(points[0], cursor), false);
    } else if (points.length === 2 && cursor) {
      showSketchPreview([...trianglePoints(points[0], points[1], cursor), points[0]], true);
    }
    return;
  }
  if (tool === 'sketch-arc') {
    if (points.length === 1 && cursor) {
      showSketchPreview(linePoints(points[0], cursor), false);
    } else if (points.length === 2 && cursor) {
      showSketchPreview(arc3Points(points[0], points[1], cursor, planeAxis, planePosition), false);
    }
  }
}

function finishSketchDrag(tool: 'sketch-line' | 'sketch-circle' | 'sketch-rect', start: THREE.Vector3, end: THREE.Vector3) {
  if (start.distanceTo(end) < 0.5) {
    setStatus(t('status.tooSmall'));
    return;
  }
  if (tool === 'sketch-line') {
    commitSketchPrimitive(linePoints(start, end), false, 'Linie');
  } else if (tool === 'sketch-circle') {
    const pts = circlePoints(start, end, planeAxis, planePosition);
    if (pts.length) commitSketchPrimitive(pts, true, 'Kreis');
  } else {
    const pts = rectanglePoints(start, end, planeAxis, planePosition);
    commitSketchPrimitive(pts, true, 'Rechteck');
  }
}

function handleSketchClickTool(tool: 'sketch-arc' | 'sketch-triangle', hit: THREE.Vector3) {
  if (!sketchInteraction || sketchInteraction.mode !== 'clicks' || sketchInteraction.tool !== tool) {
    sketchInteraction = { mode: 'clicks', tool, points: [hit.clone()] };
    setStatus(tool === 'sketch-arc' ? t('status.arcPoint2') : t('status.trianglePoint2'));
    return;
  }
  sketchInteraction.points.push(hit.clone());
  const pts = sketchInteraction.points;
  if (pts.length < 3) {
    setStatus(tool === 'sketch-arc' ? t('status.arcPoint3') : t('status.trianglePoint3'));
    return;
  }
  if (tool === 'sketch-triangle') {
    commitSketchPrimitive(trianglePoints(pts[0], pts[1], pts[2]), true, 'Dreieck');
  } else {
    const arc = arc3Points(pts[0], pts[1], pts[2], planeAxis, planePosition);
    commitSketchPrimitive(arc, false, 'Bogen');
  }
  clearSketchInteraction();
}

function handleSketchPointerDown(e: PointerEvent) {
  const hit = pickSketchHit(e.clientX, e.clientY);
  if (!hit) {
    setStatus(t('status.sketchMiss'));
    return;
  }
  if (tool === 'sketch-arc' || tool === 'sketch-triangle') {
    handleSketchClickTool(tool, hit);
    return;
  }
  if (tool === 'sketch-line' || tool === 'sketch-circle' || tool === 'sketch-rect') {
    sketchInteraction = { mode: 'drag', tool, start: hit.clone() };
    renderer.domElement.setPointerCapture(e.pointerId);
    previewSketchPrimitive(tool, hit, hit);
  }
}

function handleSketchPointerMove(e: PointerEvent) {
  if (!sketchInteraction) return;
  const hit = pickSketchHit(e.clientX, e.clientY);
  if (!hit) return;
  if (sketchInteraction.mode === 'drag') {
    previewSketchPrimitive(sketchInteraction.tool, sketchInteraction.start, hit);
    return;
  }
  previewSketchClicks(sketchInteraction.tool, sketchInteraction.points, hit);
}

function handleSketchPointerUp(e: PointerEvent) {
  if (!sketchInteraction || sketchInteraction.mode !== 'drag') return;
  const hit = pickSketchHit(e.clientX, e.clientY);
  const end = hit ?? sketchInteraction.start;
  finishSketchDrag(sketchInteraction.tool, sketchInteraction.start, end);
  clearSketchInteraction();
  syncOrbitControls();
  try {
    renderer.domElement.releasePointerCapture(e.pointerId);
  } catch {
    /* ignore */
  }
}

function fitCameraToBox(box: THREE.Box3) {
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  grid.scale.setScalar(Math.ceil(cadScene.size / 10));
  (grid.geometry as THREE.BufferGeometry).dispose();
  const theme = SCAN_THEMES[bodyDisplayMode];
  grid.geometry = new THREE.GridHelper(cadScene.size * 2, 40, theme.grid[0], theme.grid[1]).geometry;

  const dist = cadScene.size * 1.4;
  camera.position.set(center.x + dist, center.y + dist * 0.6, center.z + dist);
  controls.target.copy(center);
  controls.update();
}

function syncAlignControls() {
  const fields: [AlignField, string][] = [
    ['posX', 'align-posX'],
    ['posY', 'align-posY'],
    ['posZ', 'align-posZ'],
    ['rotX', 'align-rotX'],
    ['rotY', 'align-rotY'],
    ['rotZ', 'align-rotZ'],
  ];
  for (const [field, id] of fields) {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (!el || document.activeElement === el) continue;
    el.value = ac().alignment[field].toFixed(1);
  }
}

function updateAlignmentReadout() {
  syncAlignControls();
}

function applyScanAlignment(recordUndo = false) {
  if (recordUndo) pushUndo('Ausrichtung ändern');
  applyAlignment(ac().group, ac().alignment);
  onBodyTransformChanged();
}

function setAlignField(field: AlignField, value: number, recordUndo = true) {
  ac().alignment = { ...ac().alignment, [field]: value };
  applyScanAlignment(recordUndo);
}

function initAlignControls() {
  document.querySelectorAll('.align-stepper-row').forEach((row) => {
    const field = (row as HTMLElement).dataset.alignField as AlignField;
    const input = row.querySelector('input') as HTMLInputElement;
    const step = field.startsWith('rot') ? ALIGN_ROT_STEP : ALIGN_POS_STEP;

    row.querySelectorAll('.align-nudge').forEach((btn) => {
      btn.addEventListener('click', () => {
        const delta = parseFloat((btn as HTMLElement).dataset.delta || '0');
        const next = (parseFloat(input.value) || 0) + delta * step;
        input.value = next.toFixed(1);
        setAlignField(field, next);
      });
    });

    input.addEventListener('change', () => {
      setAlignField(field, parseFloat(input.value) || 0);
    });
  });
}

function onBodyTransformChanged() {
  if (tool === 'align') {
    ac().alignment = readAlignmentFromObject(ac().group);
    updateAlignmentReadout();
  } else if (bodyGizmoTool(tool)) {
    cadScene.readBodyTransform(ab().id);
  }
  cadScene.updateWorldMatrix();
  updateWorldScanBounds();
  updateHitFeedback();
  if (contours.some((c) => isContourAttached(c))) {
    syncAttachedContourDisplay();
    rebuildContourLines();
  }
}

function contoursForPicking(): Contour[] {
  return contours.map((c) => contourInWorldSpace(c, contourWorldMatrix(c)));
}

function contourPlaneInWorld(c: Contour): { normal: THREE.Vector3; point: THREE.Vector3 } {
  const normal = planeNormal(c.axis).clone();
  const point = planePoint(c.axis, c.position).clone();
  if (isContourAttached(c)) {
    const wm = contourWorldMatrix(c);
    normal.transformDirection(wm).normalize();
    point.applyMatrix4(wm);
  }
  return { normal, point };
}

function intersectContourPlaneWorld(clientX: number, clientY: number, c: Contour): THREE.Vector3 | null {
  const { normal, point } = contourPlaneInWorld(c);
  return intersectRayPlane(screenToRay(clientX, clientY, renderer.domElement, camera), normal, point);
}

function storagePointFromWorldHit(world: THREE.Vector3, c: Contour, free3d = false): THREE.Vector3 {
  const local = worldToContourStorage(world, c, contourWorldMatrix(c));
  if (free3d) return local;
  return constrainToContourPlane(local, c.axis, c.position);
}

function handleWorldPosition(
  c: Contour,
  index: number,
  which: 'in' | 'out',
): THREE.Vector3 {
  const world = contourInWorldSpace(c, contourWorldMatrix(c));
  ensurePointMeta(world);
  return world.handles![index]![which].clone();
}

function toggleContourAttachById(id: BrowserItemId) {
  if (!id.startsWith('contour:')) return;
  const cid = id.slice('contour:'.length);
  const c = contours.find((x) => x.id === cid);
  if (!c) return;
  pushUndo('Kontur an Körper anheften');
  const bodyId = c.attachedToBodyId ?? ab().id;
  ac().group.updateMatrixWorld(true);
  const attachMatrix = cadScene.getAttachWorldMatrix(bodyId);
  const pinned = toggleContourBodyAttach(c, bodyId, attachMatrix);
  lastBodyAttachMatrices.delete(bodyId);
  syncAttachedContourDisplay();
  rebuildContourLines();
  refreshBrowserPanel();
  setStatus(
    pinned
      ? t('status.contourPinned', { label: bodyLabelForId(bodyId) ?? t('browser.solidBody') })
      : t('status.contourUnpinned'),
  );
}

function toggleBrowserFolder(folder: string) {
  if (folder === 'components') {
    browserState.componentsFolderExpanded = !browserState.componentsFolderExpanded;
  } else if (folder.startsWith('component-bodies:')) {
    const id = folder.slice('component-bodies:'.length);
    compUI(id).bodiesExpanded = !compUI(id).bodiesExpanded;
  } else if (folder.startsWith('component-contours:')) {
    const id = folder.slice('component-contours:'.length);
    compUI(id).contoursExpanded = !compUI(id).contoursExpanded;
  } else if (folder.startsWith('component-sketches:')) {
    const id = folder.slice('component-sketches:'.length);
    compUI(id).sketchesExpanded = !compUI(id).sketchesExpanded;
  } else if (folder.startsWith('sketch-group:')) {
    const id = folder.slice('sketch-group:'.length);
    sketchUI(id).expanded = !sketchUI(id).expanded;
  } else if (folder.startsWith('component:')) {
    const id = folder.slice('component:'.length);
    compUI(id).expanded = !compUI(id).expanded;
  } else if (folder.startsWith('body-group:')) {
    const id = folder.slice('body-group:'.length);
    bodyUI(id).expanded = !bodyUI(id).expanded;
  }
  refreshBrowserPanel();
}

function bodyLabelForId(id: string | null | undefined): string | null {
  if (!id) return null;
  return cadScene.getBody(id)?.label ?? id;
}

function snapshotNow() {
  return captureSnapshot(
    contours,
    activeDraft,
    ac().alignment,
    captureBodyTransforms(),
    undefined,
    captureBodyKinds(),
    sketches,
    activeSketchId,
    sketchDimensions,
  );
}

function pushUndo(label = 'Änderung') {
  undoHistory.push(snapshotNow(), label);
  refreshHistoryTimeline();
}

function getSelectedContour(): Contour | null {
  return contours.find((c) => c.id === selectedContourId) ?? null;
}

function syncWorkPlaneToContour(c: Contour) {
  planeAxis = c.axis;
  planeAxisSel.value = c.axis;
  setPlanePositionValue(c.position);
  if (activeDraft) activeDraft.axis = c.axis;
  refreshWorkPlaneMesh(getPlaneHitVisual());
  updateHitFeedback();
}

function selectContour(id: string | null, pointIndex: number | null = null) {
  selectedContourId = id;
  selectedPointIndex = pointIndex;
  rebuildContourLines();
  refreshContourList();
}

function clearEditVisuals() {
  editGroup.children.slice().forEach((child) => {
    if (child instanceof THREE.Line || child instanceof THREE.LineSegments) {
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
    } else {
      child.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          node.geometry.dispose();
          (node.material as THREE.Material).dispose();
        }
      });
    }
    child.removeFromParent();
  });
}

function renderEditVisuals() {
  clearEditVisuals();
  if (tool !== 'edit' || !selectedContourId) return;
  const raw = getSelectedContour();
  if (!raw || raw.visible === false) return;
  cadScene.updateWorldMatrix();
  const c = contourInWorldSpace(raw, contourWorldMatrix(raw));
  ensurePointMeta(c);

  const markerBase = Math.max(cadScene.size * 0.005, 0.55);
  const handleVerts: number[] = [];

  c.points.forEach((p, i) => {
    const selected = i === selectedPointIndex;
    const anchorGeom = new THREE.SphereGeometry(selected ? markerBase * 1.5 : markerBase, 12, 12);
    const anchorMat = new THREE.MeshBasicMaterial({
      color: selected ? 0xffffff : new THREE.Color(c.color).getHex(),
      depthTest: false,
      depthWrite: false,
    });
    const anchor = new THREE.Mesh(anchorGeom, anchorMat);
    anchor.position.copy(p);
    anchor.renderOrder = 1002;
    editGroup.add(anchor);

    if (c.pointTypes![i] === 'curve' && c.handles![i]) {
      const h = c.handles![i]!;
      handleVerts.push(p.x, p.y, p.z, h.out.x, h.out.y, h.out.z);
      handleVerts.push(p.x, p.y, p.z, h.in.x, h.in.y, h.in.z);

      for (const hp of [h.in, h.out]) {
        const hg = new THREE.SphereGeometry(markerBase * 0.65, 10, 10);
        const hm = new THREE.MeshBasicMaterial({
          color: 0x88ccff,
          depthTest: false,
          depthWrite: false,
        });
        const hmMesh = new THREE.Mesh(hg, hm);
        hmMesh.position.copy(hp);
        hmMesh.renderOrder = 1002;
        editGroup.add(hmMesh);
      }
    } else if (c.pointTypes![i] === 'smooth') {
      const anchorRing = new THREE.Mesh(
        new THREE.SphereGeometry(markerBase * 1.15, 10, 10),
        new THREE.MeshBasicMaterial({
          color: 0x66ffaa,
          transparent: true,
          opacity: 0.35,
          depthTest: false,
          depthWrite: false,
        }),
      );
      anchorRing.position.copy(p);
      anchorRing.renderOrder = 1001;
      editGroup.add(anchorRing);
    }
  });

  if (handleVerts.length) {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(handleVerts, 3));
    const lines = new THREE.LineSegments(
      geom,
      new THREE.LineBasicMaterial({ color: 0x88ccff, depthTest: false, transparent: true, opacity: 0.85 }),
    );
    lines.renderOrder = 1001;
    editGroup.add(lines);
  }
}

function rebuildContourLines() {
  drawGroup.children.slice().forEach((child) => {
    if (child instanceof Line2 && child.name) {
      disposeLine2(child);
      child.removeFromParent();
    }
  });
  contours.forEach((c) => {
    const world = contourInWorldSpace(c, contourWorldMatrix(c));
    const pts = displayPoints(world);
    const selected = c.id === selectedContourId;
    const line = makeContourLine(
      pts,
      c.closed,
      contourLineColor(c),
      lineResolution,
      selected && tool === 'edit' ? 8 : 5,
    );
    line.name = c.id;
    line.visible = c.visible !== false;
    drawGroup.add(line);
  });
  renderEditVisuals();
}

function applyDraftVisibility() {
  if (draftLine) draftLine.visible = browserState.draftVisible;
  if (draftMarkers) draftMarkers.visible = browserState.draftVisible;
}

function formTriangleCount(): number {
  const mesh = formGroup.getObjectByName('form-solid') as THREE.Mesh | undefined;
  if (!mesh?.geometry.index) return 0;
  return Math.floor(mesh.geometry.index.count / 3);
}

function clearForm() {
  if (!formGroup.children.length) return;
  pushUndo('Negativform löschen');
  formGroup.clear();
  refreshBrowserPanel();
  setStatus(t('status.formDeleted'));
}

function toggleBrowserItem(id: BrowserItemId) {
  const compId = parseComponentIdFromBrowserItem(id);
  if (compId && id.startsWith('component:')) {
    const comp = cadScene.getComponent(compId);
    if (comp) {
      comp.visible = !comp.visible;
      comp.group.visible = comp.visible;
      refreshBrowserPanel();
      return;
    }
  }

  const bodyId = parseBodyIdFromBrowserItem(id);
  if (bodyId) {
    const body = cadScene.getBody(bodyId);
    if (body) {
      if (id.startsWith('body-wire:')) {
        const wire = body.meshGroup.getObjectByName('wire') as THREE.LineSegments | undefined;
        const cb = document.getElementById('scan-wire') as HTMLInputElement | null;
        if (wire && cb) {
          const next = !wire.visible;
          cb.checked = next;
          wire.visible = next && wireEdgesVisible() && !isTraceAssistOn(bodyId);
        }
      } else if (id.startsWith('body-points:')) {
        const points = body.meshGroup.getObjectByName('points') as THREE.Points | undefined;
        const cb = document.getElementById('scan-points') as HTMLInputElement | null;
        if (points && cb) {
          const next = !points.visible;
          cb.checked = next;
          points.visible = next && pointsSpritesVisible() && !isTraceAssistOn(bodyId);
        }
      } else if (id.startsWith('body-trace:')) {
        cadScene.setActiveBody(bodyId);
        const next = !isTraceAssistOn(bodyId);
        bodyTraceAssist.set(bodyId, next);
        if (next) {
          applyAllTraceAssist();
        } else {
          applyAllTraceAssist();
          applyScanTheme(bodyDisplayMode);
        }
        setStatus(next ? t('status.traceOn') : t('status.traceOff'));
      } else {
        body.visible = !body.visible;
        body.meshGroup.visible = body.visible;
      }
      refreshBrowserPanel();
      return;
    }
  }

  if (id.startsWith('sketch:')) {
    const sid = id.slice('sketch:'.length);
    const sk = sketches.find((s) => s.id === sid);
    if (sk) {
      sk.visible = !sk.visible;
      for (const c of contours.filter((x) => x.sketchId === sid)) {
        c.visible = sk.visible;
        const obj = drawGroup.getObjectByName(c.id);
        if (obj) obj.visible = sk.visible;
      }
      refreshBrowserPanel();
    }
    return;
  }

  switch (id) {
    case 'origin-planes':
      browserState.originPlanesVisible = !browserState.originPlanesVisible;
      originPlanesGroup.visible = browserState.originPlanesVisible;
      break;
    case 'plane':
      browserState.planeVisible = !browserState.planeVisible;
      workPlaneMesh.visible = browserState.planeVisible;
      break;
    case 'grid':
      browserState.gridVisible = !browserState.gridVisible;
      grid.visible = browserState.gridVisible;
      break;
    case 'form':
      browserState.formVisible = !browserState.formVisible;
      formGroup.visible = browserState.formVisible;
      break;
    case 'draft':
      browserState.draftVisible = !browserState.draftVisible;
      applyDraftVisibility();
      break;
    default:
      if (id.startsWith('contour:')) {
        const cid = id.slice('contour:'.length);
        const c = contours.find((x) => x.id === cid);
        if (!c) break;
        c.visible = !c.visible;
        const obj = drawGroup.getObjectByName(cid);
        if (obj) obj.visible = c.visible;
      }
      break;
  }
  refreshBrowserPanel();
}

function deleteBrowserItem(id: BrowserItemId) {
  if (id.startsWith('contour:')) {
    const cid = id.slice('contour:'.length);
    if (!contours.some((x) => x.id === cid)) return;
    pushUndo('Kontur löschen');
    if (selectedContourId === cid) selectContour(null);
    contours = contours.filter((x) => x.id !== cid);
    const obj = drawGroup.getObjectByName(cid);
    if (obj) {
      obj.removeFromParent();
      disposeLine2(obj as Line2);
    }
    refreshContourList();
    setStatus(t('status.contourDeleted'));
    return;
  }
  if (id === 'form') clearForm();
}

function refreshBrowserPanel() {
  const activeBody = ab();
  browserPanel.render({
    componentsFolderExpanded: browserState.componentsFolderExpanded,
    activeBodyId: bodyHasContent(activeBody) ? activeBody.id : '',
    activeSketchId,
    originPlanesVisible: browserState.originPlanesVisible,
    components: cadScene.listComponents().map((comp) => {
      const ui = compUI(comp.id);
      const compContours = contours.filter((c) => (c.componentId ?? DEFAULT_COMPONENT_ID) === comp.id);
      const compSketches = sketches.filter((s) => s.componentId === comp.id);
      return {
        id: comp.id,
        label: comp.label,
        visible: comp.visible,
        expanded: ui.expanded,
        bodiesExpanded: ui.bodiesExpanded,
        sketchesExpanded: ui.sketchesExpanded,
        contoursExpanded: ui.contoursExpanded,
        sketches: compSketches.map((sk) => {
          const skContours = compContours.filter((c) => c.sketchId === sk.id);
          return {
            id: sk.id,
            label: sk.label,
            axis: sk.axis,
            position: sk.position,
            visible: sk.visible,
            expanded: sketchUI(sk.id).expanded,
            active: sk.id === activeSketchId,
            profileCount: skContours.length,
            contours: skContours.map((c, i) => ({
              id: c.id,
              name: `Profil ${i + 1}`,
              meta: `${c.points.length}P · ${c.closed ? 'geschlossen' : 'offen'}`,
              closed: c.closed,
              visible: c.visible !== false,
              attachedToBodyId: c.attachedToBodyId ?? null,
              attachedBodyLabel: bodyLabelForId(c.attachedToBodyId),
            })),
          };
        }),
        bodies: cadScene
          .listBodies(comp.id)
          .filter((b) => bodyHasContent(b))
          .map((b, bodyIndex) => {
          const wire = b.meshGroup.getObjectByName('wire') as THREE.LineSegments | undefined;
          const points = b.meshGroup.getObjectByName('points') as THREE.Points | undefined;
          const hasMesh = b.meshGroup.children.length > 0;
          return {
            id: b.id,
            label: `Körper ${bodyIndex + 1}`,
            meshName: b.label,
            bodyKind: b.bodyKind,
            hasMesh,
            visible: comp.visible && b.visible && hasMesh,
            wireVisible: comp.visible && b.visible && (wire?.visible ?? false),
            pointsVisible: comp.visible && b.visible && (points?.visible ?? false),
            traceAssistVisible: isTraceAssistOn(b.id),
            expanded: bodyUI(b.id).expanded,
          };
        }),
        contours: compContours.map((c, i) => ({
          id: c.id,
          name: `Kontur ${i + 1}`,
          meta: `${c.axis.toUpperCase()} @ ${c.position.toFixed(1)} · ${c.points.length}P`,
          closed: c.closed,
          visible: c.visible !== false,
          attachedToBodyId: c.attachedToBodyId ?? null,
          attachedBodyLabel: bodyLabelForId(c.attachedToBodyId),
        })),
      };
    }),
    planeVisible: browserState.planeVisible && workPlaneMesh.visible,
    gridVisible: browserState.gridVisible && grid.visible,
    formVisible: browserState.formVisible && formGroup.visible,
    hasForm: formGroup.children.length > 0,
    formInfo: formGroup.children.length ? `${formTriangleCount().toLocaleString()} Dreiecke` : '',
    draftVisible: browserState.draftVisible,
    hasDraft: !!activeDraft && activeDraft.points.length > 0,
    draftInfo: activeDraft
      ? `${activeDraft.points.length}P · ${activeDraft.closed ? 'geschlossen' : 'offen'}`
      : '',
    canBuildForm: closedContourCount() >= 2,
  });
}

function restoreSnapshot(snap: ReturnType<typeof snapshotNow>) {
  contours = snap.contours.map((c) => ({
    ...c,
    points: c.points.map((p) => p.clone()),
  }));
  activeDraft = snap.activeDraft
    ? { ...snap.activeDraft, points: snap.activeDraft.points.map((p) => p.clone()) }
    : null;
  ac().alignment = { ...snap.alignment };
  applyAlignment(ac().group, ac().alignment);
  const transforms = snap.bodyTransforms ?? {};
  for (const body of cadScene.listBodies()) {
    body.transform = transforms[body.id] ? { ...transforms[body.id] } : { ...DEFAULT_ALIGNMENT };
    cadScene.applyBodyTransform(body.id);
  }
  if (snap.bodyMeshBuffers) {
    for (const [id, buf] of Object.entries(snap.bodyMeshBuffers)) {
      const body = cadScene.getBody(id);
      if (!body) continue;
      body.meshBuffer = buf.slice(0);
      void rebuildBodyFromMeshBuffer(body);
    }
  }
  if (snap.bodyKinds) {
    for (const [id, kind] of Object.entries(snap.bodyKinds)) {
      const body = cadScene.getBody(id);
      if (body) body.bodyKind = kind;
    }
  }
  sketches = snap.sketches.map((s) => ({ ...s }));
  sketchDimensions = (snap.sketchDimensions ?? []).map((d) => ({
    ...d,
    a: d.a.clone(),
    b: d.b.clone(),
  }));
  activeSketchId = snap.activeSketchId;
  updateOriginPlaneHighlight(
    activeSketchId ? (sketches.find((s) => s.id === activeSketchId)?.axis ?? null) : null,
  );
  lastBodyAttachMatrices.clear();
  rebuildContourLines();
  clearDraftVisuals();
  renderDraftLine();
  refreshContourList();
  updateSketchGrid();
  sketchDims.rebuild();
  sketchDims.refreshList();
  updateSketchRibbonState(activeSketchId, tool);
  syncToolButtons(tool);
  onBodyTransformChanged();
  updateTransformGizmo();
}

function performUndo() {
  const prev = undoHistory.takeUndo(snapshotNow());
  if (!prev) {
    setStatus(t('status.nothingUndo'));
    return;
  }
  restoreSnapshot(prev);
  refreshHistoryTimeline();
  const view = undoHistory.getTimeline();
  const label = view.position > 0 ? view.steps[view.position - 1]?.label : 'Start';
  setStatus(t('status.undoTo', { label: label ?? 'Start' }));
}

function performRedo() {
  const next = undoHistory.takeRedo(snapshotNow());
  if (!next) {
    setStatus(t('status.nothingRedo'));
    return;
  }
  restoreSnapshot(next);
  refreshHistoryTimeline();
  const view = undoHistory.getTimeline();
  const label = view.steps[view.position - 1]?.label ?? 'Schritt';
  setStatus(t('status.redoTo', { label }));
}

function jumpToHistory(target: number) {
  const view = undoHistory.getTimeline();
  if (target < 0 || target > view.steps.length) return;
  if (target === view.position) return;

  while (undoHistory.getTimeline().position > target) {
    const snap = undoHistory.takeUndo(snapshotNow());
    if (!snap) break;
    restoreSnapshot(snap);
  }
  while (undoHistory.getTimeline().position < target) {
    const snap = undoHistory.takeRedo(snapshotNow());
    if (!snap) break;
    restoreSnapshot(snap);
  }
  refreshHistoryTimeline();
  if (target === 0) {
    setStatus(t('status.historyInitial'));
  } else {
    const step = undoHistory.getTimeline().steps[target - 1];
    setStatus(t('status.historyStep', { label: step?.label ?? `Schritt ${target}` }));
  }
}

function resetScanAlignment() {
  pushUndo('Scan-Ausrichtung zurücksetzen');
  ac().alignment = { ...DEFAULT_ALIGNMENT };
  applyAlignment(ac().group, ac().alignment);
  onBodyTransformChanged();
}

function updateTransformGizmo() {
  const toolbar = document.getElementById('transform-toolbar');
  const gizmoTarget =
    tool === 'align' && ab().meshGroup.children.length > 0
      ? ac().group
      : bodyGizmoTool(tool) && ab().meshGroup.children.length > 0
        ? ab().meshGroup
        : null;
  if (gizmoTarget) {
    transformControls.attach(gizmoTarget);
    transformControls.setMode(tool === 'scale-body' ? 'scale' : 'translate');
    transformControls.setSize(Math.min(1.2, Math.max(0.45, cadScene.size * 0.008)));
    toolbar?.classList.remove('hidden');
    if (transformControls.dragging) controls.enabled = false;
    else syncOrbitControls();
  } else {
    transformControls.detach();
    toolbar?.classList.add('hidden');
    syncOrbitControls();
  }
}

function resetBodyTransform() {
  pushUndo('Körper zurücksetzen');
  ab().transform = { ...DEFAULT_ALIGNMENT };
  applyAlignment(ab().meshGroup, ab().transform);
  onBodyTransformChanged();
  updateTransformGizmo();
  setStatus(t('status.bodyTransformReset', { label: ab().label }));
}

function setTransformMode(mode: 'translate' | 'rotate') {
  transformControls.setMode(mode);
  document.querySelectorAll('[data-tmode]').forEach((btn) => {
    btn.classList.toggle('active', (btn as HTMLElement).dataset.tmode === mode);
  });
  setStatus(mode === 'translate' ? t('status.transformTranslate') : t('status.transformRotate'));
}

function wireEdgesVisible(mode: ScanDisplayMode = bodyDisplayMode): boolean {
  const wireOn = (document.getElementById('scan-wire') as HTMLInputElement | null)?.checked ?? true;
  return mode === 'flaeche' || wireOn;
}

function pointsSpritesVisible(mode: ScanDisplayMode = bodyDisplayMode): boolean {
  if (mode === 'punkte') return false;
  const pointsOn = (document.getElementById('scan-points') as HTMLInputElement | null)?.checked ?? false;
  return pointsOn;
}

function isTraceAssistOn(bodyId: string = ab().id): boolean {
  return bodyTraceAssist.get(bodyId) ?? false;
}

function updateWireEdgesOn(meshGroup: THREE.Group, geom: THREE.BufferGeometry, threshold: number) {
  const wire = meshGroup.getObjectByName('wire') as THREE.LineSegments | undefined;
  if (!wire) return;
  wire.geometry.dispose();
  wire.geometry = new THREE.EdgesGeometry(geom, threshold);
}

function updateWireEdges(geom: THREE.BufferGeometry, threshold: number) {
  updateWireEdgesOn(ab().meshGroup, geom, threshold);
}

type BodyMeshParts = {
  solid: THREE.Mesh | undefined;
  wire: THREE.LineSegments | undefined;
  points: THREE.Points | undefined;
  festkoerper: THREE.Mesh | undefined;
};

function getBodyMeshParts(body: NonNullable<ReturnType<CadScene['getBody']>>): BodyMeshParts {
  return {
    solid: body.meshGroup.getObjectByName('solid') as THREE.Mesh | undefined,
    wire: body.meshGroup.getObjectByName('wire') as THREE.LineSegments | undefined,
    points: body.meshGroup.getObjectByName('points') as THREE.Points | undefined,
    festkoerper: body.meshGroup.getObjectByName('festkoerper') as THREE.Mesh | undefined,
  };
}

function disposeSolidBodyGeom(bodyId: string) {
  const geom = solidBodyGeom.get(bodyId);
  if (geom) {
    geom.dispose();
    solidBodyGeom.delete(bodyId);
  }
}

function disposeFestkoerperMesh(body: NonNullable<ReturnType<CadScene['getBody']>>) {
  const fk = body.meshGroup.getObjectByName('festkoerper') as THREE.Mesh | undefined;
  if (!fk) return;
  fk.geometry.dispose();
  (fk.material as THREE.Material).dispose();
  body.meshGroup.remove(fk);
}

function buildSolidBodyGeometry(body: NonNullable<ReturnType<CadScene['getBody']>>): THREE.BufferGeometry | null {
  if (!body.geometry) return null;

  const cacheKey = `${body.geometry.uuid}:${body.displayStride}:${body.meshBuffer?.byteLength ?? 0}`;
  let geom = solidBodyGeom.get(body.id);
  if (geom && geom.userData.solidBodyCacheKey === cacheKey) return geom;

  disposeSolidBodyGeom(body.id);
  disposeFestkoerperMesh(body);

  if (body.meshBuffer) {
    const stride = Math.max(1, Math.min(body.displayStride, SOLID_BODY_STRIDE_MAX));
    const mesh = parse_stl_with_stride(new Uint8Array(body.meshBuffer), stride);
    geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
    geom.setIndex(Array.from(mesh.indices));
    centerGeometry(geom);
  } else {
    geom = body.geometry.clone();
  }

  geom.computeVertexNormals();
  geom.userData.solidBodyCacheKey = cacheKey;
  solidBodyGeom.set(body.id, geom);
  return geom;
}

function hexColorToNumber(hex: string): number {
  return new THREE.Color(hex).getHex();
}

function numberToHexColor(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

function getBodySolidColor(bodyId: string): number {
  return bodySolidColors.get(bodyId) ?? SOLID_BODY_COLOR;
}

function setBodySolidColor(bodyId: string, hex: string, quiet = false) {
  bodySolidColors.set(bodyId, hexColorToNumber(hex));
  refreshFestkoerperMaterial(bodyId);
  syncBodyColorMenuUi(hex);
  if (!quiet) setStatus(t('status.solidColor', { hex }));
}

function refreshFestkoerperMaterial(bodyId: string) {
  if (!isTraceAssistOn(bodyId)) return;
  const body = cadScene.getBody(bodyId);
  const fk = body?.meshGroup.getObjectByName('festkoerper') as THREE.Mesh | undefined;
  if (!fk) return;
  (fk.material as THREE.Material).dispose();
  fk.material = makeSolidBodyMaterial(bodyId);
}

function makeSolidBodyMaterial(bodyId: string): THREE.MeshPhongMaterial {
  const base = new THREE.Color(getBodySolidColor(bodyId));
  return new THREE.MeshPhongMaterial({
    color: base,
    emissive: base.clone().multiplyScalar(0.12),
    shininess: 28,
    specular: 0x333333,
    side: THREE.DoubleSide,
    transparent: false,
    opacity: 1,
    clippingPlanes: clipPlanes,
    depthWrite: true,
  });
}

function ensureFestkoerperMesh(
  body: NonNullable<ReturnType<CadScene['getBody']>>,
  geom: THREE.BufferGeometry,
): THREE.Mesh {
  let mesh = body.meshGroup.getObjectByName('festkoerper') as THREE.Mesh | undefined;
  if (!mesh) {
    mesh = new THREE.Mesh(geom, makeSolidBodyMaterial(body.id));
    mesh.name = 'festkoerper';
    mesh.renderOrder = 1;
    body.meshGroup.add(mesh);
    return mesh;
  }

  if (mesh.geometry !== geom) {
    mesh.geometry = geom;
  }
  (mesh.material as THREE.Material).dispose();
  mesh.material = makeSolidBodyMaterial(body.id);
  mesh.visible = true;
  return mesh;
}

function restoreBodyScanDisplay(bodyId: string) {
  const body = cadScene.getBody(bodyId);
  if (!body?.geometry) return;

  const { solid, wire, points, festkoerper } = getBodyMeshParts(body);
  if (festkoerper) festkoerper.visible = false;
  if (solid) solid.visible = true;
  if (wire) wire.visible = wireEdgesVisible();
  if (points) points.visible = pointsSpritesVisible();
}

function applyTraceAssistForBody(bodyId: string) {
  const body = cadScene.getBody(bodyId);
  if (!body?.geometry || !body.visible) return;

  const parts = getBodyMeshParts(body);
  if (!parts.solid) return;

  if (!isTraceAssistOn(bodyId)) {
    restoreBodyScanDisplay(bodyId);
    return;
  }

  const solidGeom = buildSolidBodyGeometry(body);
  if (!solidGeom) return;

  ensureFestkoerperMesh(body, solidGeom);
  parts.solid.visible = false;
  if (parts.wire) parts.wire.visible = false;
  if (parts.points) parts.points.visible = false;
}

function applyAllTraceAssist() {
  for (const body of cadScene.listBodies()) {
    applyTraceAssistForBody(body.id);
  }

  const solidActive = cadScene.listBodies().some((b) => isTraceAssistOn(b.id) && b.visible && b.geometry);
  const theme = SCAN_THEMES[bodyDisplayMode];
  if (solidActive) {
    dir.intensity = 1.65 * bodyBrightness;
    fill.intensity = 0.42 * bodyBrightness;
    ambient.intensity = 0.55 * bodyBrightness;
  } else {
    dir.intensity = theme.dirIntensity * bodyBrightness;
    fill.intensity = theme.fillIntensity * bodyBrightness;
    ambient.intensity = theme.ambient * bodyBrightness;
  }
}

function applyScanTheme(mode: ScanDisplayMode, brightness = bodyBrightness) {
  bodyDisplayMode = mode;
  bodyBrightness = brightness;
  const theme = SCAN_THEMES[mode];

  (scene.background as THREE.Color).setHex(theme.background);
  ambient.intensity = theme.ambient * brightness;
  hemi.color.setHex(theme.hemiSky);
  hemi.groundColor.setHex(theme.hemiGround);
  hemi.intensity = theme.hemiIntensity * brightness;
  dir.intensity = theme.dirIntensity * brightness;
  fill.intensity = theme.fillIntensity * brightness;
  renderer.toneMappingExposure = theme.toneExposure * (0.92 + brightness * 0.12);

  const gridSize =
    cadScene.size > 1 ? cadScene.size * 2 : EMPTY_PROJECT_VIEW_SIZE * 2;
  (grid.geometry as THREE.BufferGeometry).dispose();
  grid.geometry = new THREE.GridHelper(gridSize, 40, theme.grid[0], theme.grid[1]).geometry;

  const activeTraceOn = isTraceAssistOn(ab().id);
  const { solid, wire, points } = getBodyMeshParts(ab());

  const geom = ab().geometry;
  if (geom && !activeTraceOn) {
    if (mode === 'kontrast') applyNormalColors(geom);
    else if (mode === 'punkte') {
      geom.computeBoundingBox();
      if (geom.boundingBox) applyHeightColors(geom, geom.boundingBox);
    } else geom.deleteAttribute('color');
    updateWireEdges(geom, theme.edgeThreshold);
  }

  const useVertexColors = mode === 'kontrast' || mode === 'punkte';
  const solidColor = brightenColor(theme.solidColor, brightness);
  const opacitySlider = document.getElementById('scan-opacity') as HTMLInputElement | null;
  const solidOpacity = opacitySlider
    ? parseInt(opacitySlider.value) / 100
    : theme.solidOpacity;

  if (solid && !activeTraceOn) {
    const mat = makeScanSolidMaterial(
      theme,
      solidColor,
      Math.max(solidOpacity, theme.solidOpacity * 0.25),
      useVertexColors,
      clipPlanes,
    );
    (solid.material as THREE.Material).dispose();
    solid.material = mat;
    solid.visible = true;
  }

  if (wire && !activeTraceOn) {
    const edgeColor = brightenColor(theme.edgeColor, mode === 'dunkel' ? brightness : 1);
    const wmat = wire.material as THREE.LineBasicMaterial;
    wmat.color.setHex(edgeColor);
    wmat.opacity = theme.edgeOpacity;
    wmat.transparent = theme.edgeOpacity < 1;
    wmat.depthTest = true;
    wire.visible = wireEdgesVisible(mode);
    wire.renderOrder = mode === 'flaeche' ? 2 : 0;
  }

  if (points && !activeTraceOn) {
    const pmat = points.material as THREE.PointsMaterial;
    pmat.vertexColors = useVertexColors;
    if (!useVertexColors) pmat.color.setHex(brightenColor(0x1e3a5f, brightness));
    pmat.opacity = theme.pointOpacity;
    pmat.size = Math.max(cadScene.size * 0.003, 0.35) * (0.8 + brightness * 0.4);
    points.visible = pointsSpritesVisible(mode);
    points.renderOrder = mode === 'flaeche' ? 3 : 0;
  }

  applyAllTraceAssist();
}

function buildScanMesh(
  body: ReturnType<CadScene['getActiveBody']>,
  positions: Float32Array,
  indices: Uint32Array,
): THREE.Group {
  const group = new THREE.Group();
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setIndex(Array.from(indices));
  geom.computeVertexNormals();
  centerGeometry(geom);
  body.geometry = geom;

  const theme = SCAN_THEMES[bodyDisplayMode];
  const solidColor = brightenColor(theme.solidColor, bodyBrightness);

  const solidMat = makeScanSolidMaterial(
    theme,
    solidColor,
    theme.solidOpacity,
    false,
    clipPlanes,
  );

  const solid = new THREE.Mesh(geom, solidMat);
  solid.name = 'solid';

  const wire = new THREE.LineSegments(
    new THREE.EdgesGeometry(geom, theme.edgeThreshold),
    new THREE.LineBasicMaterial({
      color: theme.edgeColor,
      transparent: theme.edgeOpacity < 1,
      opacity: theme.edgeOpacity,
    }),
  );
  wire.name = 'wire';
  wire.visible = true;

  const points = new THREE.Points(
    geom,
    new THREE.PointsMaterial({
      color: 0x1e3a5f,
      size: Math.max(cadScene.size * 0.003, 0.35),
      sizeAttenuation: true,
      transparent: true,
      opacity: theme.pointOpacity,
    }),
  );
  points.name = 'points';
  points.visible = pointsSpritesVisible(bodyDisplayMode);

  group.add(solid, wire, points);
  if (body.id === ab().id) applyScanTheme(bodyDisplayMode, bodyBrightness);
  return group;
}

async function promoteMeshToNewBody(
  mesh: {
    positions: Float32Array;
    indices: Uint32Array;
    triangle_count: number;
  },
  labelPrefix: string,
  opts?: {
    tab?: 'solid' | 'body' | 'contours';
    workspace?: WorkspaceMode;
    bodyKind?: BodyKind;
    featureKind?: FeatureKind;
    afterTool?: Tool;
    keepSketch?: boolean;
  },
) {
  await initWasm();
  const stlBytes = export_binary_stl(mesh.positions, mesh.indices);
  const buf = stlBytes.buffer.slice(
    stlBytes.byteOffset,
    stlBytes.byteOffset + stlBytes.byteLength,
  ) as ArrayBuffer;

  const compId = ac().id;
  const existing = cadScene.listBodies(compId).filter((b) => b.label.startsWith(labelPrefix)).length;
  const label = existing > 0 ? `${labelPrefix} ${existing + 1}` : labelPrefix;
  const bodyId = cadScene.nextBodyId(compId);
  const body = cadScene.createBody(compId, bodyId, label);
  assignBodyKind(body, opts?.bodyKind ?? 'solid');

  body.meshBuffer = buf;
  body.displayStride = 1;
  disposeSolidBodyGeom(body.id);

  const built = buildScanMesh(body, mesh.positions, mesh.indices);
  body.meshGroup.add(built);

  cadScene.setActiveBody(bodyId);
  transformControls.detach();
  cadScene.updateWorldMatrix();
  updateWorldScanBounds(true);
  appMenu.selectTab(opts?.tab ?? 'body', false);
  setWorkspaceMode(opts?.workspace ?? 'body', {
    tool: opts?.afterTool ?? 'move-body',
    keepSketch: opts?.keepSketch,
  });
  refreshWorkPlaneMesh();
  updateHitFeedback();
  applyScanTheme(bodyDisplayMode, bodyBrightness);
  refreshBrowserPanel();
  if (opts?.featureKind) recordSolidFeature(opts.featureKind, label, bodyId);
  updateTransformGizmo();
  syncOrbitControls();
}

async function promoteLoftToNewBody(mesh: {
  positions: Float32Array;
  indices: Uint32Array;
  triangle_count: number;
}) {
  await promoteMeshToNewBody(mesh, 'Negativform', {
    tab: 'contours',
    workspace: 'body',
    bodyKind: 'loft',
    featureKind: 'loft',
  });
}

function showSolidPreview(mesh: { positions: Float32Array; indices: Uint32Array }) {
  formGroup.clear();
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(mesh.positions), 3));
  geom.setIndex(Array.from(mesh.indices));
  geom.computeVertexNormals();
  const solid = new THREE.Mesh(
    geom,
    new THREE.MeshStandardMaterial({
      color: 0x5eb3ff,
      transparent: true,
      opacity: 0.52,
      metalness: 0.08,
      roughness: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  solid.name = 'form-solid';
  formGroup.add(solid);
  browserState.formVisible = true;
  formGroup.visible = true;
  refreshBrowserPanel();
}

const extrudeHost: ExtrudeHost = {
  setStatus,
  getContoursForPicking: contoursForPicking,
  findContour: (id) => contours.find((c) => c.id === id),
  getContourWorldMatrix: contourWorldMatrix,
  getScanSize: () => cadScene.size,
  getDragScale: () => Math.max(cadScene.size * 0.01, 0.35),
  getCamera: () => camera,
  getDom: () => renderer.domElement,
  loftExtrude: (base, distanceMm) => {
    try {
      return loft_contours_json(buildExtrudeLoftPayload(base, distanceMm));
    } catch {
      return null;
    }
  },
  showExtrudePreview: showSolidPreview,
  clearExtrudePreview: () => {
    formGroup.clear();
    refreshBrowserPanel();
  },
  showExtrudeGizmo: (anchor, normal, distanceMm) => extrudeGizmo.show(anchor, normal, distanceMm),
  clearExtrudeGizmo: () => extrudeGizmo.clear(),
  commitExtrude: async (mesh, distanceMm) => {
    const sketchId = activeSketchId;
    formGroup.clear();
    extrudeGizmo.clear();
    pushUndo(t('undo.extrude'));
    await promoteMeshToNewBody(mesh, t('solid.bodyExtrude'), {
      tab: sketchId ? 'sketch' : 'solid',
      workspace: sketchId ? 'sketch' : 'body',
      bodyKind: 'solid',
      featureKind: 'extrude',
      afterTool: 'navigate',
      keepSketch: !!sketchId,
    });
    selectContour(null);
    rebuildContourLines();
    transformControls.detach();
    syncOrbitControls();
    setStatus(t('status.extrudeDone', { distance: Math.abs(distanceMm).toFixed(1) }));
  },
  highlightContour: (id) => {
    selectContour(id);
    rebuildContourLines();
  },
  syncOrbitControls,
  getActiveSketchId: () => activeSketchId,
};

const revolveHost: RevolveHost = {
  setStatus,
  getContoursForPicking: contoursForPicking,
  findContour: (id) => contours.find((c) => c.id === id),
  getContourWorldMatrix: contourWorldMatrix,
  getScanSize: () => cadScene.size,
  getCamera: () => camera,
  getDom: () => renderer.domElement,
  revolveProfile: (base, axis, angleDeg) => {
    try {
      return revolve_contour_json(buildRevolvePayload(base, axis, angleDeg));
    } catch {
      return null;
    }
  },
  showRevolvePreview: showSolidPreview,
  clearRevolvePreview: () => {
    formGroup.clear();
    refreshBrowserPanel();
  },
  commitRevolve: async (mesh, angleDeg) => {
    formGroup.clear();
    pushUndo(t('undo.revolve'));
    await promoteMeshToNewBody(mesh, t('solid.bodyRevolve'), {
      tab: 'solid',
      workspace: 'body',
      bodyKind: 'solid',
      featureKind: 'revolve',
    });
    setStatus(t('status.revolveDone', { angle: angleDeg.toFixed(0) }));
  },
  highlightContour: (id) => {
    selectContour(id);
    rebuildContourLines();
  },
  syncOrbitControls,
  getActiveSketchId: () => activeSketchId,
};

const loftHost: LoftHost = {
  setStatus,
  getContoursForPicking: contoursForPicking,
  findContour: (id) => contours.find((c) => c.id === id),
  getContourWorldMatrix: contourWorldMatrix,
  getScanSize: () => cadScene.size,
  getCamera: () => camera,
  getDom: () => renderer.domElement,
  loftContours: (payloads) => {
    try {
      return loft_contours_json(buildLoftContoursPayload(payloads));
    } catch {
      return null;
    }
  },
  showLoftPreview: showSolidPreview,
  clearLoftPreview: () => {
    formGroup.clear();
    refreshBrowserPanel();
  },
  commitLoft: async (mesh, profileCount) => {
    formGroup.clear();
    if (loftCommitMode === 'negativform') {
      pushUndo('Negativform erstellen');
      await promoteLoftToNewBody(mesh);
      setStatus(
        t('status.loftDone', {
          label: ab().label,
          triangles: mesh.triangle_count.toLocaleString(),
        }),
      );
    } else {
      pushUndo(t('undo.loft'));
      await promoteMeshToNewBody(mesh, t('solid.bodyLoft'), {
        tab: 'solid',
        workspace: 'body',
        bodyKind: 'loft',
        featureKind: 'loft',
      });
      setStatus(t('status.loftDoneSolid', { count: profileCount }));
    }
    loftCommitMode = 'solid';
  },
  highlightContour: (id) => {
    selectContour(id);
    rebuildContourLines();
  },
  syncOrbitControls,
  getActiveSketchId: () => activeSketchId,
};

const solidCommandHosts: SolidCommandHosts = {
  extrude: extrudeHost,
  revolve: revolveHost,
  loft: loftHost,
};

let loftCommitMode: 'solid' | 'negativform' = 'solid';

function prepareLoftDraft(): boolean {
  discardIncompleteDraft(true);
  if (activeDraft && activeDraft.points.length >= 3) {
    if (!activeDraft.closed) {
      setStatus(t('status.openContourLoft'));
      return false;
    }
    saveActiveDraft({ recordUndo: false });
  }
  return true;
}

function startSolidCommand(kind: 'extrude' | 'revolve' | 'loft', opts?: { negativform?: boolean }) {
  cancelAllSolidCommands(solidCommandHosts);
  if (kind === 'loft' && opts?.negativform) {
    if (!prepareLoftDraft()) return;
    loftCommitMode = 'negativform';
    appMenu.selectTab('contours', false);
    setWorkspaceMode('contour', { tool: 'navigate' });
    beginLoft(loftHost);
    return;
  }
  loftCommitMode = 'solid';
  const fromSketch = !!activeSketchId;
  if (fromSketch) {
    appMenu.selectTab('sketch', false);
    setWorkspaceMode('sketch', { tool: 'navigate', keepSketch: true });
  } else {
    appMenu.selectTab('solid', false);
    setWorkspaceMode('body', { tool: 'navigate' });
  }
  if (kind === 'extrude') beginExtrude(extrudeHost);
  else if (kind === 'revolve') beginRevolve(revolveHost);
  else beginLoft(loftHost);
}

async function joinBodiesInComponent() {
  const bodies = cadScene.listBodies(ac().id).filter((b) => b.geometry && b.meshBuffer);
  if (bodies.length < 2) {
    setStatus(t('status.joinNeedTwo'));
    return;
  }

  let unionGeom = await booleanUnionBodies(bodies);
  let usedConcat = false;

  if (!unionGeom) {
    unionGeom = mergeBodyGeometries(bodies);
    usedConcat = !!unionGeom;
  }
  if (!unionGeom) {
    setStatus(t('status.joinFailed'));
    return;
  }

  const { positions, indices } = geometryMeshData(unionGeom);
  unionGeom.dispose();
  const mesh = {
    positions,
    indices,
    triangle_count: (indices.length / 3) as number,
  };
  pushUndo(t('undo.join'));
  await promoteMeshToNewBody(mesh, t('solid.bodyJoin'), {
    tab: 'solid',
    workspace: 'body',
    bodyKind: 'solid',
    featureKind: 'join',
  });
  setStatus(
    usedConcat
      ? t('status.joinConcatFallback', { count: bodies.length })
      : t('status.joinBooleanDone', { count: bodies.length }),
  );
}

async function rectangularPatternBodies() {
  const src = ab();
  if (!src.meshBuffer || !src.geometry) {
    setStatus(t('status.patternNeedBody'));
    return;
  }
  const cols = parsePromptInt(t('solid.patternColsPrompt'), 2);
  if (cols === null) return;
  const rows = parsePromptInt(t('solid.patternRowsPrompt'), 2);
  if (rows === null) return;
  const spacingX = parsePromptFloat(t('solid.patternSpacingXPrompt'), 40);
  if (spacingX === null) return;
  const spacingY = parsePromptFloat(t('solid.patternSpacingYPrompt'), 40);
  if (spacingY === null) return;

  pushUndo(t('undo.rectPattern'));
  let created = 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (r === 0 && c === 0) continue;
      const label = `${src.label} ${r + 1}×${c + 1}`;
      const transform: BodyTransform = {
        ...src.transform,
        posX: src.transform.posX + c * spacingX,
        posY: src.transform.posY + r * spacingY,
      };
      await duplicateBodyFrom(src, label, transform, false);
      created++;
    }
  }
  refreshBrowserPanel();
  recordSolidFeature('rect-pattern', `${src.label} ${cols}×${rows}`, src.id);
  setStatus(t('status.rectPatternDone', { count: created }));
}

async function circularPatternBodies() {
  const src = ab();
  if (!src.meshBuffer || !src.geometry) {
    setStatus(t('status.patternNeedBody'));
    return;
  }
  const count = parsePromptInt(t('solid.patternCountPrompt'), 6);
  if (count === null || count < 2) {
    setStatus(t('status.patternNeedCount'));
    return;
  }

  pushUndo(t('undo.circPattern'));
  const step = 360 / count;
  for (let i = 1; i < count; i++) {
    const label = `${src.label} ∠${Math.round(i * step)}°`;
    const transform: BodyTransform = {
      ...src.transform,
      rotY: src.transform.rotY + i * step,
    };
    await duplicateBodyFrom(src, label, transform, false);
  }
  refreshBrowserPanel();
  recordSolidFeature('circ-pattern', `${src.label} ×${count}`, src.id);
  setStatus(t('status.circPatternDone', { count }));
}

async function mirrorActiveBodyPrompt() {
  const axis = parseMirrorAxis(t('solid.mirrorAxisPrompt'), 'x');
  if (!axis) return;
  await mirrorActiveBody(axis);
}

function contoursToProject(): ProjectContour[] {
  return contours.map((c) => {
    ensurePointMeta(c);
    return {
      id: c.id,
      componentId: c.componentId ?? DEFAULT_COMPONENT_ID,
      sketchId: c.sketchId ?? null,
      axis: c.axis,
      position: c.position,
      points: c.points.map((p) => [p.x, p.y, p.z] as [number, number, number]),
      closed: c.closed,
      color: c.color,
      visible: c.visible !== false,
      attachedToBodyId: c.attachedToBodyId ?? null,
      pointTypes: c.pointTypes ? [...c.pointTypes] : undefined,
      handles: c.handles
        ? c.handles.map((h) =>
            h
              ? {
                  in: [h.in.x, h.in.y, h.in.z] as [number, number, number],
                  out: [h.out.x, h.out.y, h.out.z] as [number, number, number],
                }
              : null,
          )
        : undefined,
    };
  });
}

function projectHasSketchData(): boolean {
  return (
    sketches.length > 0 ||
    contours.length > 0 ||
    sketchDimensions.length > 0 ||
    !!activeSketchId
  );
}

async function saveProject() {
  const meshBuf = ab().meshBuffer;
  if (!meshBuf && !projectHasSketchData()) {
    setStatus(t('status.noBodySave'));
    return;
  }
  await initWasm();
  const meta = buildProjectMeta({
    activeComponentId: ac().id,
    activeBodyId: ab().id,
    components: cadScene.listComponents().map((comp) => ({
      id: comp.id,
      label: comp.label,
      alignment: comp.alignment,
      bodies: cadScene.listBodies(comp.id).map((b) => {
        const solidColor = getBodySolidColor(b.id);
        const sceneBody = cadScene.getBody(b.id);
        const transform = sceneBody && !isDefaultTransform(sceneBody.transform)
          ? { ...sceneBody.transform }
          : undefined;
        const entry = {
          id: b.id,
          label: b.label,
          displayStride: b.displayStride,
          bodyKind: sceneBody?.bodyKind,
          transform,
          solidColor:
            solidColor !== SOLID_BODY_COLOR ? numberToHexColor(solidColor) : undefined,
          traceAssist: isTraceAssistOn(b.id) ? true : undefined,
        };
        return entry;
      }),
    })),
    planeAxis,
    planePosition,
    hitTolerance: getHitTolerance(),
    contours: contoursToProject(),
    sketches: sketches.map((s) => ({ ...s })),
    sketchDimensions: sketchDims.dimensionsToProject(),
    sketchUnit,
    activeSketchId: activeSketchId ?? undefined,
  });
  const meshEntries = cadScene
    .listBodies()
    .filter((b) => b.meshBuffer && stlHasTriangles(b.meshBuffer))
    .map((b) => ({ id: b.id, stl: new Uint8Array(b.meshBuffer!) }));

  const packed =
    meshEntries.length > 0
      ? pack_project_multi(JSON.stringify(meta), buildMeshArchive(meshEntries))
      : pack_project_multi(JSON.stringify(meta), buildMeshArchive([]));
  const blob = new Blob([new Uint8Array(packed)], { type: 'application/octet-stream' });
  const base = ab().label.replace(/\.stl$/i, '') || 'cad-projekt';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${base}${PROJECT_EXTENSION}`;
  a.click();
  URL.revokeObjectURL(a.href);
  setStatus(
    t('status.projectSaved', {
      base: `${base}${PROJECT_EXTENSION}`,
      count: contours.length,
      bodies: meshEntries.length,
    }),
  );
}

type UnpackedProject =
  | { meta: string; format: 'v1'; stl: Uint8Array }
  | { meta: string; format: 'v2'; bodies: { id: string; stl: Uint8Array }[] };

async function loadProjectBuffer(buf: ArrayBuffer, fileName: string) {
  await initWasm();
  let unpacked: UnpackedProject;
  try {
    unpacked = unpack_project(new Uint8Array(buf)) as UnpackedProject;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Projekt laden fehlgeschlagen:', err);
    setStatus(t('status.projectLoadFailed', { msg }));
    return;
  }

  let meta;
  try {
    meta = parseProjectMeta(unpacked.meta);
  } catch (err) {
    setStatus(err instanceof Error ? err.message : t('status.projectMetaInvalid'));
    return;
  }

  discardIncompleteDraft(true);
  selectContour(null);
  contours = [];
  sketches = [];
  sketchDimensions = [];
  activeSketchId = null;
  sketchDims.clearSession();
  updateOriginPlaneHighlight(null);
  drawGroup.children.slice().forEach((child) => {
    if (child instanceof Line2 && child.name) disposeLine2(child);
    child.removeFromParent();
  });
  formGroup.clear();
  activeDraft = null;
  clearDraftVisuals();
  undoHistory.clear();
  featureTimeline.clear();
  refreshHistoryTimeline();
  refreshFeatureTimeline();

  planeAxis = meta.planeAxis;
  planeAxisSel.value = meta.planeAxis;

  const hitTol = document.getElementById('hit-tolerance') as HTMLInputElement;
  const hitTolVal = document.getElementById('hit-tolerance-val');
  hitTol.value = String(meta.hitTolerance);
  if (hitTolVal) hitTolVal.textContent = String(meta.hitTolerance);

  syncSceneFromProjectMeta(cadScene, meta);
  for (const body of cadScene.listBodies()) clearBodyMeshState(body);

  const comp = meta.components.find((c) => c.id === meta.activeComponentId) ?? meta.components[0];
  const primary = comp.bodies.find((b) => b.id === meta.activeBodyId) ?? comp.bodies[0];
  const projectBodyById = new Map(
    meta.components.flatMap((c) => c.bodies.map((b) => [b.id, b] as const)),
  );

  bodySolidColors.clear();
  bodyTraceAssist.clear();
  for (const c of meta.components) {
    for (const b of c.bodies) {
      if (b.solidColor) bodySolidColors.set(b.id, hexColorToNumber(b.solidColor));
      if (b.traceAssist) bodyTraceAssist.set(b.id, true);
      const sceneBody = cadScene.getBody(b.id);
      if (sceneBody && b.bodyKind) assignBodyKind(sceneBody, b.bodyKind);
    }
  }

  if (unpacked.format === 'v2') {
    for (const entry of unpacked.bodies) {
      const pb = projectBodyById.get(entry.id);
      const body = cadScene.getBody(entry.id);
      if (!body || !pb) continue;
      const stlBuf = entry.stl.slice().buffer;
      await restoreBodyMesh(
        body,
        stlBuf,
        pb.label,
        pb.displayStride,
        pb.bodyKind ?? 'scan',
      );
    }
  } else {
    const stlBytes = unpacked.stl instanceof Uint8Array ? unpacked.stl : new Uint8Array(unpacked.stl);
    const stlBuf = stlBytes.slice().buffer;
    const activeBody = cadScene.getBody(primary.id);
    if (activeBody) {
      await restoreBodyMesh(
        activeBody,
        stlBuf,
        primary.label,
        primary.displayStride,
        primary.bodyKind ?? 'scan',
      );
    }
  }

  cadScene.setActiveBody(primary.id);
  const hasAnyMesh = cadScene.listBodies().some((b) => b.meshBuffer && stlHasTriangles(b.meshBuffer));
  if (!hasAnyMesh) setupEmptyProjectView();
  applyAllTraceAssist();

  setPlanePositionValue(meta.planePosition);
  ac().alignment = { ...comp.alignment };
  applyAlignment(ac().group, ac().alignment);
  for (const c of meta.components) {
    for (const b of c.bodies) {
      const sceneBody = cadScene.getBody(b.id);
      if (!sceneBody) continue;
      sceneBody.transform = b.transform ? { ...b.transform } : { ...DEFAULT_ALIGNMENT };
      cadScene.applyBodyTransform(sceneBody.id);
    }
  }
  lastBodyAttachMatrices.clear();
  updateAlignmentReadout();
  cadScene.updateWorldMatrix();
  updateWorldScanBounds(false);
  updateTransformGizmo();

  sketches = (meta.sketches ?? []).map((s) => ({
    id: s.id,
    componentId: s.componentId ?? DEFAULT_COMPONENT_ID,
    label: s.label,
    axis: s.axis,
    position: s.position,
    visible: s.visible !== false,
  }));
  activeSketchId = meta.activeSketchId ?? null;
  sketchUnit = meta.sketchUnit ?? 'mm';
  const sketchUnitEl = document.getElementById('sketch-unit') as HTMLSelectElement | null;
  if (sketchUnitEl) sketchUnitEl.value = sketchUnit;

  sketchDimensions = (meta.sketchDimensions ?? []).map((d) => ({
    id: d.id,
    sketchId: d.sketchId,
    kind: d.kind,
    axis: d.axis,
    position: d.position,
    a: new THREE.Vector3(d.a[0], d.a[1], d.a[2]),
    b: new THREE.Vector3(d.b[0], d.b[1], d.b[2]),
    offset: d.offset,
    visible: d.visible !== false,
    contourId: d.contourId,
    pointIndex0: d.pointIndex0,
    pointIndex1: d.pointIndex1,
  }));

  contours = meta.contours.map((c) => ({
    id: c.id,
    componentId: c.componentId ?? DEFAULT_COMPONENT_ID,
    sketchId: c.sketchId ?? null,
    axis: c.axis,
    position: c.position,
    points: c.points.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
    closed: c.closed,
    color: c.color,
    visible: c.visible !== false,
    attachedToBodyId: c.attachedToBodyId ?? null,
    pointTypes: c.pointTypes ? [...c.pointTypes] : undefined,
    handles: c.handles
      ? c.handles.map((h) =>
          h
            ? {
                in: new THREE.Vector3(h.in[0], h.in[1], h.in[2]),
                out: new THREE.Vector3(h.out[0], h.out[1], h.out[2]),
              }
            : null,
        )
      : undefined,
  }));
  ensureSketchesFromContours();
  rebuildContourLines();
  refreshContourList();
  initOriginPlanes();
  refreshWorkPlaneMesh(getPlaneHitVisual());
  updateHitFeedback();
  updateSketchGrid();
  sketchDims.rebuild();
  sketchDims.refreshList();
  refreshBrowserPanel();
  updateSketchRibbonState(activeSketchId, tool);
  syncToolButtons(tool);

  if (activeSketchId) {
    appMenu.selectTab('sketch', false);
    setWorkspaceMode('sketch', { tool: 'navigate', keepSketch: true });
  } else {
    setWorkspaceMode('body', { tool: 'navigate' });
  }

  setStatus(
    t('status.projectLoaded', {
      contours: contours.length,
      sketches: sketches.length,
      dims: sketchDimensions.length,
    }),
  );
}

async function loadStlBuffer(
  buf: ArrayBuffer,
  label: string,
  stride = ab().displayStride,
  bodyKind: BodyKind = 'scan',
) {
  disposeSolidBodyGeom(ab().id);
  disposeFestkoerperMesh(ab());
  ab().meshBuffer = buf;
  ab().label = label;
  ab().displayStride = stride;
  assignBodyKind(ab(), bodyKind);
  setStatus(t('status.loadingStl', { label, stride }));
  await new Promise((r) => setTimeout(r, 0));
  const mesh = parse_stl_with_stride(new Uint8Array(buf), stride);
  transformControls.detach();
  undoHistory.clear();
  featureTimeline.clear();
  refreshHistoryTimeline();
  refreshFeatureTimeline();
  ab().meshGroup.clear();
  ac().alignment = { ...DEFAULT_ALIGNMENT };
  ab().transform = { ...DEFAULT_ALIGNMENT };
  const built = buildScanMesh(ab(), mesh.positions, mesh.indices);
  ab().meshGroup.add(built);
  applyAlignment(ac().group, ac().alignment);
  applyAlignment(ab().meshGroup, ab().transform);
  cadScene.updateWorldMatrix();
  browserState.planeVisible = true;
  axes.scale.setScalar(1);
  updateWorldScanBounds(true);
  updateAlignmentReadout();
  updateTransformGizmo();
  planePosition = cadScene.bounds.getCenter(new THREE.Vector3()).z;
  planePos.value = String(planePosition);
  planePosVal.textContent = planePosition.toFixed(1);
  refreshWorkPlaneMesh();
  updateHitFeedback();
  ac().group.visible = ac().visible;
  refreshBrowserPanel();
  appMenu.selectTab('align', false);
  setWorkspaceMode('body', { tool: 'navigate' });
  setStatus(
    t('status.stlLoaded', { label, triangles: mesh.triangle_count.toLocaleString() }),
  );
}

function getHitTolerance(): number {
  const el = document.getElementById('hit-tolerance') as HTMLInputElement;
  return parseFloat(el?.value || '3') || 3;
}

function getEffectiveHitTolerance(): number {
  return Math.max(getHitTolerance(), cadScene.size * 0.004);
}

function getPlaneHitVisual(): PlaneHitVisual {
  const geom = ab().geometry;
  if (!hitPlaneFeedback || !geom) return 'neutral';
  const tol = getEffectiveHitTolerance();
  cadScene.updateWorldMatrix();
  const hits = planeIntersectsScan(
    geom,
    cadScene.worldMatrix,
    planeAxis,
    planePosition,
    tol,
    cadScene.bounds,
  );
  return hits ? 'hit' : 'miss';
}

function getPointHitFlags(points: THREE.Vector3[]): boolean[] {
  if (!ab().geometry) return points.map(() => false);
  const tol = getEffectiveHitTolerance();
  cadScene.updateWorldMatrix();
  return points.map((p) =>
    pointHitsScan(p, ab().geometry!, cadScene.worldMatrix, planeAxis, tol),
  );
}

function getCloseSnapDistance(): number {
  return Math.max(cadScene.size * 0.012, 1.2);
}

function isNearStartPoint(p: THREE.Vector3): boolean {
  if (!activeDraft || activeDraft.points.length < 3) return false;
  return p.distanceTo(activeDraft.points[0]) <= getCloseSnapDistance();
}

function contourLineColor(c: Contour): string {
  return c.closed ? CLOSED_LINE_COLOR : c.color;
}

function getPointMarkerColors(points: THREE.Vector3[]): string[] {
  const hits = hitPointFeedback ? getPointHitFlags(points) : [];
  return points.map((_, i) => {
    if (i === 0) {
      if (activeDraft?.closed || closeSnapPreview) return START_SNAP_COLOR;
      return START_POINT_COLOR;
    }
    if (!hitPointFeedback) return activeDraft?.color ?? CONTOUR_COLORS[0];
    return hits[i] ? HIT_POINT_COLOR : MISS_POINT_COLOR;
  });
}

function getPointMarkerSizes(points: THREE.Vector3[], base: number): number[] {
  const hits = hitPointFeedback ? getPointHitFlags(points) : [];
  return points.map((_, i) => {
    if (i === 0) {
      if (activeDraft?.closed) return base * 3.5;
      if (closeSnapPreview) return base * 4.2;
      return base * 2.4;
    }
    if (!hitPointFeedback) return base;
    return hits[i] ? base * 3.2 : base * 0.65;
  });
}

function getDraftLineColor(points: THREE.Vector3[]): string {
  if (activeDraft?.closed) return CLOSED_LINE_COLOR;
  if (!hitPointFeedback || !points.length) return activeDraft?.color ?? CONTOUR_COLORS[0];
  const hits = getPointHitFlags(points);
  const hitCount = hits.filter(Boolean).length;
  if (hitCount === points.length) return HIT_LINE_COLOR;
  if (hitCount > 0) return '#ffaa00';
  return MISS_POINT_COLOR;
}

function updateCloseSnapPreview(clientX: number, clientY: number) {
  const prev = closeSnapPreview;
  closeSnapPreview = false;
  if (
    tool !== 'polyline' ||
    !activeDraft ||
    activeDraft.closed ||
    activeDraft.points.length < 3
  ) {
    if (prev) renderDraftLine();
    return;
  }
  const hit = pickOnPlane(
    clientX,
    clientY,
    renderer.domElement,
    camera,
    workPlaneMesh,
    ac().group,
    planeAxis,
    planePosition,
  );
  if (hit && isNearStartPoint(hit)) closeSnapPreview = true;
  if (prev !== closeSnapPreview) renderDraftLine();
}

function clearPlaneHitMarkers() {
  if (!planeHitMarkers) return;
  planeHitMarkers.geometry.dispose();
  (planeHitMarkers.material as THREE.Material).dispose();
  planeHitMarkers.removeFromParent();
  planeHitMarkers = null;
}

function getPlaneHitPoints(): THREE.Vector3[] {
  const geom = ab().geometry;
  if (!hitPlaneFeedback || !geom) return [];
  const tol = getEffectiveHitTolerance();
  cadScene.updateWorldMatrix();
  return collectScanPointsOnPlane(
    geom,
    cadScene.worldMatrix,
    planeAxis,
    planePosition,
    tol,
    2,
  );
}

function updatePlaneHitMarkers(pts: THREE.Vector3[]) {
  clearPlaneHitMarkers();
  if (!pts.length) return;

  const geom = new THREE.BufferGeometry().setFromPoints(pts);
  const markerSize = Math.max(cadScene.size * 0.009, 1.2);
  planeHitMarkers = new THREE.Points(
    geom,
    new THREE.PointsMaterial({
      color: HIT_MARKER_COLOR,
      size: markerSize,
      sizeAttenuation: true,
      transparent: true,
      opacity: 1,
      depthTest: false,
      depthWrite: false,
    }),
  );
  planeHitMarkers.renderOrder = 999;
  hitGroup.add(planeHitMarkers);
}

function updateHitFeedback() {
  const tolVal = document.getElementById('hit-tolerance-val');
  if (tolVal) tolVal.textContent = getHitTolerance().toFixed(1);

  if (!hitPlaneFeedback) clearPlaneHitMarkers();

  const visual = getPlaneHitVisual();
  refreshWorkPlaneMesh(visual);
  const planeHitPts = getPlaneHitPoints();
  if (hitPlaneFeedback) updatePlaneHitMarkers(planeHitPts);
  const planeHitCount = planeHitPts.length;

  const hitCountEl = document.getElementById('plane-hit-count');
  if (hitCountEl) {
    if (!hitPlaneFeedback || !ab().geometry) {
      hitCountEl.textContent = '';
      hitCountEl.className = 'plane-hit-count';
    } else if (planeHitCount > 0) {
      hitCountEl.textContent = ` · ${planeHitCount.toLocaleString()} Körper-Punkte treffen`;
      hitCountEl.className = 'plane-hit-count hit';
    } else {
      hitCountEl.textContent = ' · Ebene verfehlt Körper';
      hitCountEl.className = 'plane-hit-count miss';
    }
  }

  if (activeDraft) renderDraftLine();
  planePosVal.textContent = planePosition.toFixed(1);
}

function startDraft() {
  if (!activeDraft) {
    activeDraft = {
      id: uid(),
      componentId: ac().id,
      sketchId: activeSketchId,
      axis: planeAxis,
      position: planePosition,
      points: [],
      closed: false,
      color: CONTOUR_COLORS[contours.length % CONTOUR_COLORS.length],
      visible: true,
    };
  }
}

function clearDraftVisuals() {
  if (draftLine) {
    disposeLine2(draftLine);
    draftLine.removeFromParent();
    draftLine = null;
  }
  if (draftMarkers) {
    draftMarkers.traverse((c) => {
      if (c instanceof THREE.Mesh) {
        c.geometry.dispose();
        (c.material as THREE.Material).dispose();
      }
    });
    draftMarkers.removeFromParent();
    draftMarkers = null;
  }
}

function renderDraftLine() {
  clearDraftVisuals();
  if (!activeDraft || activeDraft.points.length < 1) {
    refreshBrowserPanel();
    return;
  }
  const markerBase = Math.max(cadScene.size * 0.004, 0.4);
  draftLine = makeContourLine(
    activeDraft.points,
    activeDraft.closed,
    getDraftLineColor(activeDraft.points),
    lineResolution,
    hitPointFeedback ? 7 : 6,
  );
  drawGroup.add(draftLine);
  draftMarkers = makePointMarkers(
    activeDraft.points,
    getPointMarkerColors(activeDraft.points),
    markerBase,
    getPointMarkerSizes(activeDraft.points, markerBase),
  );
  drawGroup.add(draftMarkers);
  applyDraftVisibility();
  refreshBrowserPanel();
}

function closedContourCount(): number {
  return contours.filter((c) => c.closed && c.points.length >= 3).length;
}

/** Verwirft unsichtbare 1–2-Punkt-Entwürfe (z. B. versehentlicher Klick im Viewer). */
function discardIncompleteDraft(silent = false): boolean {
  if (!activeDraft || activeDraft.points.length >= 3) return false;
  const n = activeDraft.points.length;
  activeDraft = null;
  clearDraftVisuals();
  refreshBrowserPanel();
  if (!silent) {
    setStatus(
      n > 0
        ? t('status.draftDiscardedIncomplete', { n })
        : t('status.draftDiscardedEmpty'),
    );
  }
  return true;
}

function statusWhenNoOpenDraft() {
  const closedCount = closedContourCount();
  if (closedCount >= 2) {
    setStatus(t('status.contoursReady', { count: closedCount }));
  } else if (closedCount === 1) {
    setStatus(t('status.oneContourSaved'));
  } else if (contours.length > 0) {
    setStatus(t('status.noOpenContour', { count: contours.length }));
  } else {
    setStatus(t('status.noContour'));
  }
}

function saveActiveDraft(options: { forceClosed?: boolean; recordUndo?: boolean } = {}) {
  const { forceClosed = false, recordUndo = true } = options;

  if (!activeDraft) {
    statusWhenNoOpenDraft();
    return false;
  }

  const pointCount = activeDraft.points.length;
  if (pointCount < 3) {
    discardIncompleteDraft(true);
    statusWhenNoOpenDraft();
    return false;
  }

  if (forceClosed) activeDraft.closed = true;
  if (recordUndo) pushUndo('Kontur speichern');

  const saved = activeDraft;
  if (activeSketchId && !saved.sketchId) saved.sketchId = activeSketchId;
  contours.push(saved);
  const line = makeContourLine(
    saved.points,
    saved.closed,
    contourLineColor(saved),
    lineResolution,
    saved.closed ? 6 : 5,
  );
  line.name = saved.id;
  line.visible = saved.visible !== false;
  drawGroup.add(line);
  activeDraft = null;
  clearDraftVisuals();
  refreshContourList();

  const closedSaved = closedContourCount();
  if (saved.closed) {
    if (closedSaved < 2) {
      setStatus(
        t('status.contourSavedGreen', { pointCount, closedSaved }),
      );
    } else {
      setStatus(
        t('status.contourSavedClosed', { pointCount, closedSaved }),
      );
    }
  } else {
    setStatus(t('status.contourSavedOpen', { pointCount }));
  }
  return true;
}

function refreshContourList() {
  contourCount.textContent = String(contours.length);
  contourList.innerHTML = '';
  contours.forEach((c, i) => {
    const li = document.createElement('li');
    if (c.id === selectedContourId) li.classList.add('active');
    const badge = c.closed ? '<span class="contour-badge closed">geschlossen</span>' : '<span class="contour-badge open">offen</span>';
    li.innerHTML = `<span>#${i + 1} ${c.axis.toUpperCase()} @ ${c.position.toFixed(1)} · ${c.points.length}P ${badge}</span>`;
    li.addEventListener('click', (ev) => {
      if ((ev.target as HTMLElement).tagName === 'BUTTON') return;
      setTool('edit');
      selectContour(c.id);
      setStatus(
        t('status.contourEdit', { n: i + 1, axis: planeAxis.toUpperCase(), pos: planePosition.toFixed(1) }),
      );
    });
    const del = document.createElement('button');
    del.textContent = '×';
    del.onclick = () => {
      pushUndo('Kontur löschen');
      contours = contours.filter((x) => x.id !== c.id);
      if (selectedContourId === c.id) selectContour(null);
      const obj = drawGroup.getObjectByName(c.id);
      if (obj) {
        obj.removeFromParent();
        disposeLine2(obj as Line2);
      }
      refreshContourList();
    };
    li.appendChild(del);
    contourList.appendChild(li);
  });
  refreshBrowserPanel();
}

function addPointFromEvent(e: PointerEvent, recordUndo = true) {
  if (!activeDraft) startDraft();
  const hit = activeSketchId
    ? pickSketchHit(e.clientX, e.clientY)
    : pickOnPlane(
        e.clientX,
        e.clientY,
        renderer.domElement,
        camera,
        workPlaneMesh,
        ac().group,
        planeAxis,
        planePosition,
      );
  if (!hit) {
    setStatus(t('status.noHit'));
    return;
  }
  if (activeDraft!.closed) {
    saveActiveDraft({ recordUndo: false });
    return;
  }
  if (isNearStartPoint(hit)) {
    if (recordUndo) pushUndo('Kontur schließen');
    activeDraft!.closed = true;
    closeSnapPreview = false;
    renderDraftLine();
    saveActiveDraft({ recordUndo: false });
    return;
  }

  if (recordUndo) pushUndo('Punkt setzen');
  activeDraft!.points.push(hit);
  renderDraftLine();
  const geom = ab().geometry;
  if (hitPointFeedback && geom) {
    cadScene.updateWorldMatrix();
    const onScan = pointHitsScan(
      hit,
      geom,
      cadScene.worldMatrix,
      planeAxis,
      getEffectiveHitTolerance(),
    );
    setStatus(
      onScan
        ? t('status.pointHit', { n: activeDraft!.points.length })
        : t('status.pointMiss', { n: activeDraft!.points.length }),
    );
  } else {
    setStatus(t('status.pointSet', { n: activeDraft!.points.length }));
  }
}

function clearOverlay() {
  octx.clearRect(0, 0, overlay.width, overlay.height);
  overlay.classList.remove('drawing');
}

function drawLassoOverlay() {
  octx.clearRect(0, 0, overlay.width, overlay.height);
  if (lassoScreen.length < 2) return;
  octx.strokeStyle = '#ffb347';
  octx.lineWidth = 2;
  octx.beginPath();
  octx.moveTo(lassoScreen[0].x, lassoScreen[0].y);
  for (let i = 1; i < lassoScreen.length; i++) {
    octx.lineTo(lassoScreen[i].x, lassoScreen[i].y);
  }
  octx.closePath();
  octx.stroke();
}

function finishLasso() {
  if (lassoScreen.length < 4) {
    setStatus(t('status.lassoTooSmall'));
    lassoScreen = [];
    clearOverlay();
    return;
  }
  if (!strokeUndoPushed) pushUndo('Freihand zeichnen');
  startDraft();
  const rect = renderer.domElement.getBoundingClientRect();
  for (const p of lassoScreen) {
    const hit = pickOnPlane(
      rect.left + p.x,
      rect.top + p.y,
      renderer.domElement,
      camera,
      workPlaneMesh,
      ac().group,
      planeAxis,
      planePosition,
    );
    if (hit) activeDraft!.points.push(hit);
  }
  activeDraft!.points = simplifyStroke(activeDraft!.points, cadScene.size * 0.004);
  activeDraft!.closed = true;
  renderDraftLine();
  lassoScreen = [];
  clearOverlay();
  if (activeDraft!.points.length >= 3) {
    saveActiveDraft({ recordUndo: false });
  } else {
    setStatus(t('status.lassoTooFew', { count: activeDraft!.points.length }));
  }
}

function syncToolButtons(active: Tool) {
  syncToolButtonHighlight(active, activeSketchId);
}

function hidePointMenu() {
  pointMenu.classList.add('hidden');
  pointMenuTarget = null;
}

function showPointMenu(clientX: number, clientY: number, contourId: string, pointIndex: number) {
  hideViewportMenu();
  hideBodyColorMenu();
  pointMenuTarget = { contourId, pointIndex };
  pointMenu.classList.remove('hidden');
  const rect = viewport.getBoundingClientRect();
  const menuW = pointMenu.offsetWidth || 220;
  const menuH = pointMenu.offsetHeight || 260;
  let left = clientX - rect.left;
  let top = clientY - rect.top;
  left = Math.min(Math.max(4, left), rect.width - menuW - 4);
  top = Math.min(Math.max(4, top), rect.height - menuH - 4);
  pointMenu.style.left = `${left}px`;
  pointMenu.style.top = `${top}px`;
}

function beginEditDrag(target: Extract<EditPick, { kind: 'anchor' | 'handle-in' | 'handle-out' }>) {
  editDrag = {
    kind: target.kind,
    contourId: target.contourId,
    pointIndex: target.pointIndex,
  };
  pushUndo('Kontur bearbeiten');
}

function handleEditPointerDown(e: PointerEvent) {
  const target = pickEditTarget(
    contoursForPicking(),
    selectedContourId,
    e.clientX,
    e.clientY,
    renderer.domElement,
    camera,
    cadScene.size,
  );

  if (target?.kind === 'anchor') {
    selectContour(target.contourId, target.pointIndex);
    beginEditDrag(target);
    renderer.domElement.setPointerCapture(e.pointerId);
    return;
  }

  if (target?.kind === 'handle-in' || target?.kind === 'handle-out') {
    selectContour(target.contourId, target.pointIndex);
    beginEditDrag(target);
    renderer.domElement.setPointerCapture(e.pointerId);
    return;
  }

  if (target?.kind === 'segment') {
    const c = contours.find((x) => x.id === target.contourId);
    if (!c) return;
    pushUndo('Punkt einfügen');
    const p = storagePointFromWorldHit(target.point, c, true);
    const idx = insertPoint(c, target.segmentIndex, p);
    selectContour(c.id, idx);
    rebuildContourLines();
    setStatus(t('status.pointInserted', { count: c.points.length }));
    return;
  }

  if (target?.kind === 'contour') {
    selectContour(target.contourId);
    setStatus(
      t('status.contourSelected', { axis: planeAxis.toUpperCase(), pos: planePosition.toFixed(1) }),
    );
    return;
  }

  const hit = pickOnPlane(
    e.clientX,
    e.clientY,
    renderer.domElement,
    camera,
    workPlaneMesh,
    ac().group,
    planeAxis,
    planePosition,
  );
  if (!hit) return;

  const c = getSelectedContour();
  if (!c) {
    setStatus(t('status.selectContourFirst'));
    return;
  }
  const ins = findInsertOnContour(contourInWorldSpace(c, contourWorldMatrix(c)), hit);
  if (!ins) return;
  pushUndo('Punkt einfügen');
  const p = worldToContourStorage(hit, c, contourWorldMatrix(c));
  const idx = insertPoint(c, ins.afterIndex, p);
  selectContour(c.id, idx);
  rebuildContourLines();
  setStatus(t('status.pointInsertedMenu'));
}

function applyPointMenuAction(action: string) {
  if (!pointMenuTarget) return;
  const c = contours.find((x) => x.id === pointMenuTarget!.contourId);
  if (!c) return;
  const i = pointMenuTarget.pointIndex;
  pushUndo('Punkttyp ändern');

  if (action === 'corner' || action === 'smooth' || action === 'curve') {
    setPointType(c, i, action as ContourPointType);
    selectContour(c.id, i);
    setStatus(
      action === 'curve'
        ? t('status.pointCurve', { n: i + 1 })
        : t('status.pointType', { n: i + 1, type: t(`pointType.${action}`) }),
    );
  } else if (action === 'delete') {
    if (!deletePoint(c, i)) {
      setStatus(t('status.minPointsDelete'));
      hidePointMenu();
      return;
    }
    selectContour(c.id, Math.min(i, c.points.length - 1));
    rebuildContourLines();
    setStatus(t('status.pointDeleted', { count: c.points.length }));
  } else if (action === 'toggle-closed') {
    if (!c.closed && c.points.length < 3) {
      setStatus(t('status.minPointsClose'));
    } else {
      c.closed = !c.closed;
      rebuildContourLines();
      setStatus(c.closed ? t('status.contourClosed') : t('status.contourOpened'));
    }
  } else if (action === 'insert') {
    const p = c.points[i].clone();
    const idx = insertPoint(c, i, p);
    selectContour(c.id, idx);
    rebuildContourLines();
    setStatus(t('status.pointDuplicated'));
  }
  hidePointMenu();
}

function setTool(next: Tool, opts?: { skipWorkspaceCheck?: boolean }) {
  if (next === tool) {
    next = activeSketchId ? 'navigate' : workspaceMode === 'sketch' ? 'sketch-pick' : 'navigate';
  }
  if (!opts?.skipWorkspaceCheck && !toolAllowedInWorkspace(next, workspaceMode, activeSketchId)) {
    setStatus(workspaceHintForTool(next, workspaceMode));
    return;
  }
  if (!activeSketchId && toolRequiresActiveSketch(next)) {
    setStatus(t('status.needSketchFirst'));
    tool = 'sketch-pick';
    syncToolButtons('sketch-pick');
    updateSketchRibbonState(null, 'sketch-pick');
    return;
  }
  if (planeDragMode && next !== 'navigate' && next !== 'align') setPlaneDragMode(false);
  if (next === 'navigate' || next === 'align') {
    discardIncompleteDraft(true);
    if (tool === 'edit') {
      selectedContourId = null;
      selectedPointIndex = null;
      clearEditVisuals();
    }
  }
  if (
    (next === 'move-body' ||
      next === 'scale-body' ||
      next === 'press-pull' ||
      next === 'smooth-body') &&
    tool === 'edit'
  ) {
    selectedContourId = null;
    selectedPointIndex = null;
    clearEditVisuals();
  }
  if (next === 'press-pull' || next === 'smooth-body' || next === 'smooth-section') {
    transformControls.detach();
  }
  if (next !== 'smooth-section') {
    clearSectionBandHelper();
    smoothPaint = null;
  }
  tool = next;
  syncToolButtons(next);
  viewport.className = `tool-${next}`;
  if (planeDragMode) viewport.classList.add('tool-plane-drag');
  if (next === 'sketch-pick') {
    if (!activeSketchId && isEmptyProject()) setupEmptyProjectView();
    updateOriginPlaneHighlight(
      activeSketchId ? (sketches.find((s) => s.id === activeSketchId)?.axis ?? null) : null,
    );
    refreshWorkPlaneMesh(getPlaneHitVisual());
  }
  const navHint =
    activeSketchId || next === 'sketch-pick' || next.startsWith('sketch-')
      ? ` · ${getSketchViewportNavHint()}`
      : '';
  toolHint.textContent = getToolHint(next) + navHint;
  syncOrbitControls();
  if (next === 'edit') {
    refreshWorkPlaneMesh(getPlaneHitVisual());
    renderEditVisuals();
  } else {
    hidePointMenu();
  }
  if (!isSketchPrimitiveTool(next)) {
    clearSketchInteraction();
  }
  if (next !== 'sketch-dim') {
    sketchDims.clearSession();
    viewport.classList.remove('sketch-dim-can-pick');
  } else if (next === 'sketch-dim') {
    setStatus(t('status.dimPick'));
  }
  if (next !== 'lasso') {
    lassoScreen = [];
    clearOverlay();
  }
  closeSnapPreview = false;
  updateHitFeedback();
  updateTransformGizmo();
  updateSketchRibbonState(activeSketchId, next);
  setStatus(t('status.tool', { tool: next }));
}

function applyPlaneForPreset(preset: ViewCubePreset) {
  const flight = ViewCube.flightFor(preset, new THREE.Vector3(), 1);
  if (!flight.planeAxis) return;
  planeAxis = flight.planeAxis;
  planeAxisSel.value = flight.planeAxis;
  if (activeDraft) activeDraft.axis = planeAxis;
}

function setView(mode: string) {
  const c = cadScene.bounds.getCenter(new THREE.Vector3());
  const d = cadScene.size * 1.3;
  viewCube.setFocus(c, d);
  controls.target.copy(c);

  const presetMap: Record<string, ViewCubePreset> = {
    top: 'top',
    front: 'front',
    side: 'right',
  };

  if (presetMap[mode]) {
    applyPlaneForPreset(presetMap[mode]);
    viewCube.flyTo(presetMap[mode]);
  } else {
    camera.position.set(c.x + d, c.y + d * 0.6, c.z + d);
    camera.up.set(0, 1, 0);
    camera.lookAt(c);
  }

  updateHitFeedback();
  controls.update();
}

function updateSlice() {
  const axis = (document.getElementById('slice-axis') as HTMLSelectElement).value;
  const pos = parseFloat((document.getElementById('slice-pos') as HTMLInputElement).value);
  const big = cadScene.size * 10;
  if (axis === 'none') {
    clipPlanes[0].constant = Infinity;
    clipPlanes[1].constant = Infinity;
    clipPlanes[2].constant = Infinity;
  } else if (axis === 'x') {
    clipPlanes[0].constant = pos;
    clipPlanes[1].constant = Infinity;
    clipPlanes[2].constant = Infinity;
  } else if (axis === 'y') {
    clipPlanes[0].constant = Infinity;
    clipPlanes[1].constant = pos;
    clipPlanes[2].constant = Infinity;
  } else {
    clipPlanes[0].constant = Infinity;
    clipPlanes[1].constant = Infinity;
    clipPlanes[2].constant = pos;
  }
  clipPlanes.forEach((p) => p.normal.normalize());
}

async function exportForm() {
  const body = ab();
  if (!body.meshBuffer && !body.geometry) {
    setStatus(t('status.noBodyMesh'));
    return;
  }
  if (
    body.geometry &&
    (body.transform.posX !== 0 ||
      body.transform.posY !== 0 ||
      body.transform.posZ !== 0 ||
      body.transform.rotX !== 0 ||
      body.transform.rotY !== 0 ||
      body.transform.rotZ !== 0 ||
      body.meshGroup.scale.x !== 1 ||
      body.meshGroup.scale.y !== 1 ||
      body.meshGroup.scale.z !== 1)
  ) {
    await bakeActiveBodyTransform(false);
  } else if (body.geometry) {
    await commitBodyGeometry(body);
  }
  if (!body.meshBuffer) return;
  await initWasm();
  const blob = new Blob([new Uint8Array(body.meshBuffer)], { type: 'application/octet-stream' });
  const base = body.label.replace(/\.stl$/i, '') || 'koerper';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${base}.stl`;
  a.click();
  URL.revokeObjectURL(a.href);
  setStatus(t('status.stlExported', { base }));
}

function isSketchDimValueUiTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Node)) return false;
  return (
    dom.sketchDimHud.contains(target) ||
    dom.sketchDimInputRow.contains(target) ||
    dom.sketchDimValueInput === target ||
    dom.sketchDimApplyBtn === target ||
    dom.sketchDimHudValue === target ||
    dom.sketchDimHudApply === target
  );
}

/** Switch to navigate before OrbitControls sees the click (capture phase). */
renderer.domElement.addEventListener(
  'pointerdown',
  (e) => {
    if (e.button !== 0 || !activeSketchId || tool !== 'sketch-dim') return;
    if (sketchDims.awaitingValue || sketchDims.dimDragActive) return;

    if (sketchDims.selectDimensionAt(e.clientX, e.clientY)) {
      setTool('navigate');
      syncOrbitControls();
      sketchDims.selectDimensionAt(e.clientX, e.clientY);
      return;
    }
    if (!sketchDims.hasPickableEdgeAt(e.clientX, e.clientY) && !sketchDims.hasSession) {
      setTool('navigate');
      syncOrbitControls();
    }
  },
  { capture: true },
);

// Pointer handlers
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (isSolidCommandActive() && handleSolidCommandPointerDown(e, solidCommandHosts)) {
    e.preventDefault();
    return;
  }
  if (
    activeSketchId &&
    sketchDims.awaitingValue &&
    e.button === 0 &&
    tool !== 'sketch-dim' &&
    !isSketchDimValueUiTarget(e.target)
  ) {
    sketchDims.clearSession();
    syncOrbitControls();
    return;
  }
  if (planeDragMode && e.button === 0) {
    const hit = intersectWorkPlane(e.clientX, e.clientY);
    if (hit) {
      draggingPlane = true;
      planeDragStartPos = planePosition;
      planeDragStartHit.copy(hit);
      syncOrbitControls();
      renderer.domElement.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
  }
  if (tool === 'edit') {
    e.preventDefault();
    handleEditPointerDown(e);
    return;
  }
  if (bodyGizmoTool(tool) && e.button === 0) {
    const bodyId = pickBodyMeshAt(e.clientX, e.clientY);
    if (bodyId) selectBody(bodyId);
    return;
  }
  if (tool === 'press-pull' && e.button === 0) {
    const pick = pickBodySurfaceAt(e.clientX, e.clientY);
    const body = pick ? cadScene.getBody(pick.bodyId) : null;
    if (pick && body?.geometry) {
      selectBody(pick.bodyId);
      body.meshGroup.updateMatrixWorld(true);
      const inv = body.meshGroup.matrixWorld.clone().invert();
      const localCenter = pick.point.clone().applyMatrix4(inv);
      const localNormal = pick.normal.clone().transformDirection(inv).normalize();
      const posAttr = body.geometry.getAttribute('position') as THREE.BufferAttribute;
      pushMeshUndo();
      meshEditDrag = {
        tool: 'press-pull',
        bodyId: pick.bodyId,
        center: localCenter,
        normal: localNormal,
        startClientY: e.clientY,
        basePositions: (posAttr.array as Float32Array).slice(),
      };
      syncOrbitControls();
      renderer.domElement.setPointerCapture(e.pointerId);
      e.preventDefault();
    }
    return;
  }
  if (smoothToolActive(tool) && e.button === 0) {
    const pick = pickBodySurfaceAt(e.clientX, e.clientY);
    if (pick) {
      selectBody(pick.bodyId);
      beginSmoothPaint(pick, e.shiftKey);
      syncOrbitControls();
      renderer.domElement.setPointerCapture(e.pointerId);
      e.preventDefault();
    }
    return;
  }
  if (tool === 'sketch-pick' && e.button === 0) {
    const axis = pickOriginPlane(e.clientX, e.clientY);
    if (axis) {
      e.preventDefault();
      beginSketchOnPlane(axis, 0);
      return;
    }
    if (activeSketchId && sketchDims.tryPreselectEdge(e.clientX, e.clientY)) {
      e.preventDefault();
      return;
    }
    return;
  }
  if (
    activeSketchId &&
    e.button === 0 &&
    tool === 'navigate' &&
    sketchDims.tryPreselectEdge(e.clientX, e.clientY)
  ) {
    return;
  }
  if (tool === 'sketch-dim' && activeSketchId && e.button === 0) {
    if (
      sketchDims.handlePointerDown(e, (id) => {
        renderer.domElement.setPointerCapture(id);
        sketchDimCapturePointerId = id;
      })
    ) {
      e.preventDefault();
    }
    return;
  }
  if (activeSketchId && e.button === 0 && tool === 'navigate') {
    sketchDims.selectDimensionAt(e.clientX, e.clientY);
  }
  if (isSketchPrimitiveTool(tool) && activeSketchId && e.button === 0) {
    e.preventDefault();
    handleSketchPointerDown(e);
    return;
  }
  if (tool === 'navigate' || tool === 'align' || bodyGizmoTool(tool) || tool === 'sketch-pick') return;
  e.preventDefault();
  if (tool === 'polyline') {
    addPointFromEvent(e);
  } else if (tool === 'freehand') {
    isDrawing = true;
    strokeUndoPushed = false;
    startDraft();
    renderer.domElement.setPointerCapture(e.pointerId);
    pushUndo('Freihand starten');
    strokeUndoPushed = true;
    addPointFromEvent(e, false);
  } else if (tool === 'lasso') {
    isDrawing = true;
    strokeUndoPushed = false;
    pushUndo('Lasso starten');
    strokeUndoPushed = true;
    lassoScreen = [];
    const rect = renderer.domElement.getBoundingClientRect();
    lassoScreen.push({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    renderer.domElement.setPointerCapture(e.pointerId);
    drawLassoOverlay();
  }
});

renderer.domElement.addEventListener('dblclick', (e) => {
  if (!activeSketchId || (tool !== 'sketch-dim' && tool !== 'navigate')) return;
  if (sketchDims.handleDoubleClick(e.clientX, e.clientY)) {
    e.preventDefault();
  }
});

renderer.domElement.addEventListener('pointermove', (e) => {
  if (handleSolidCommandPointerMove(e, solidCommandHosts)) return;
  if (smoothPaint) {
    const now = performance.now();
    if (now - lastSmoothPickMs >= 36) {
      lastSmoothPickMs = now;
      const pick = pickBodySurfaceAt(e.clientX, e.clientY);
      if (pick && pick.bodyId === smoothPaint.bodyId) {
        applySmoothAtPick(pick, smoothPaint);
      }
    }
    return;
  }
  if (meshEditDrag) {
    const body = cadScene.getBody(meshEditDrag.bodyId);
    if (!body?.geometry) return;
    const posAttr = body.geometry.getAttribute('position') as THREE.BufferAttribute;
    const pos = posAttr.array as Float32Array;
    pos.set(meshEditDrag.basePositions);
    const deltaPx = meshEditDrag.startClientY - e.clientY;
    const radius = getBodyBrushRadius();
    const amount = deltaPx * cadScene.size * 0.002;
    displaceRegion(body.geometry, meshEditDrag.center, meshEditDrag.normal, amount, radius);
    posAttr.needsUpdate = true;
    body.geometry.computeVertexNormals();
    refreshBodyMeshVisuals(body);
    return;
  }
  if (editDrag) {
    const c = contours.find((x) => x.id === editDrag!.contourId);
    if (!c) return;
    const isHandle = editDrag.kind === 'handle-in' || editDrag.kind === 'handle-out';
    const hit = isHandle
      ? intersectViewPlane(
          e.clientX,
          e.clientY,
          renderer.domElement,
          camera,
          handleWorldPosition(
            c,
            editDrag.pointIndex,
            editDrag.kind === 'handle-in' ? 'in' : 'out',
          ),
        )
      : intersectWorkPlane(e.clientX, e.clientY);
    if (!hit) return;
    const snapped =
      c.sketchId && sketchGridSnap
        ? applySketchSnap(hit, c.axis, c.position)
        : hit;
    const p = storagePointFromWorldHit(snapped, c, true);
    if (editDrag.kind === 'anchor') {
      moveAnchor(c, editDrag.pointIndex, p);
    } else {
      moveHandle(c, editDrag.pointIndex, editDrag.kind === 'handle-in' ? 'in' : 'out', p);
    }
    rebuildContourLines();
    return;
  }
  if (draggingPlane) {
    const hit = intersectWorkPlane(e.clientX, e.clientY);
    if (hit) {
      const delta = planeAxisComponent(hit) - planeAxisComponent(planeDragStartHit);
      setPlanePositionValue(planeDragStartPos + delta);
    }
    return;
  }
  if (sketchInteraction) {
    handleSketchPointerMove(e);
    return;
  }
  if (tool === 'sketch-pick') {
    updateOriginPlaneHover(e.clientX, e.clientY);
    return;
  }
  if (activeSketchId && (isSketchPrimitiveTool(tool) || tool === 'edit' || tool === 'polyline' || tool === 'freehand')) {
    const hover = pickOnPlane(
      e.clientX,
      e.clientY,
      renderer.domElement,
      camera,
      workPlaneMesh,
      ac().group,
      planeAxis,
      planePosition,
    );
    if (hover) applySketchSnap(hover);
    else setSketchOriginSnapFeedback(false);
  }
  if (tool === 'sketch-dim') {
    sketchDims.handlePointerMove(e.clientX, e.clientY);
    return;
  }
  if (tool === 'polyline') {
    updateCloseSnapPreview(e.clientX, e.clientY);
  }
  if (!isDrawing) return;
  if (tool === 'freehand') {
    addPointFromEvent(e, false);
  } else if (tool === 'lasso') {
    const rect = renderer.domElement.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const last = lassoScreen[lassoScreen.length - 1];
    if (!last || Math.hypot(x - last.x, y - last.y) > 3) {
      lassoScreen.push({ x, y });
      drawLassoOverlay();
    }
  }
});

window.addEventListener('pointercancel', (e) => {
  if (handleSolidCommandPointerCancel(e, solidCommandHosts)) return;
});

window.addEventListener('pointerup', (e) => {
  if (handleSolidCommandPointerUp(e, solidCommandHosts)) return;
  if (sketchInteraction?.mode === 'drag') {
    handleSketchPointerUp(e);
    return;
  }
  if (smoothPaint) {
    endSmoothPaint();
    syncOrbitControls();
    if (renderer.domElement.hasPointerCapture(e.pointerId)) {
      renderer.domElement.releasePointerCapture(e.pointerId);
    }
    return;
  }
  if (meshEditDrag) {
    const body = cadScene.getBody(meshEditDrag.bodyId);
    meshEditDrag = null;
    syncOrbitControls();
    if (renderer.domElement.hasPointerCapture(e.pointerId)) {
      renderer.domElement.releasePointerCapture(e.pointerId);
    }
    if (body?.geometry) {
      void commitBodyGeometry(body).then(() => {
        updateWorldScanBounds();
        setStatus(t('status.pressPullApplied', { label: body.label }));
      });
    }
    return;
  }
  if (editDrag) {
    editDrag = null;
    syncOrbitControls();
    if (renderer.domElement.hasPointerCapture(e.pointerId)) {
      renderer.domElement.releasePointerCapture(e.pointerId);
    }
    setStatus(t('status.contourAdjusted'));
    return;
  }
  if (sketchDims.shouldFinishPlacement()) {
    syncOrbitControls();
    if (renderer.domElement.hasPointerCapture(e.pointerId)) {
      renderer.domElement.releasePointerCapture(e.pointerId);
    }
    sketchDimCapturePointerId = null;
    sketchDims.finishDrag();
    return;
  }
  if (draggingPlane) {
    draggingPlane = false;
    syncOrbitControls();
    if (renderer.domElement.hasPointerCapture(e.pointerId)) {
      renderer.domElement.releasePointerCapture(e.pointerId);
    }
  }
  if (renderer.domElement.hasPointerCapture(e.pointerId)) {
    renderer.domElement.releasePointerCapture(e.pointerId);
  }
  if (tool === 'freehand' && isDrawing && activeDraft) {
    activeDraft.points = simplifyStroke(activeDraft.points, cadScene.size * 0.003);
    renderDraftLine();
    if (activeSketchId && activeDraft.points.length >= 3) {
      saveActiveDraft({ recordUndo: true });
    } else if (activeSketchId) {
      discardIncompleteDraft(true);
      setStatus(t('status.freehandTooShort'));
    } else {
      setStatus(t('status.freehandDraft', { count: activeDraft.points.length }));
    }
  }
  if (tool === 'lasso' && isDrawing) {
    finishLasso();
  }
  isDrawing = false;
});

// UI bindings
document.querySelectorAll('[data-tool]').forEach((btn) => {
  btn.addEventListener('click', () => setTool((btn as HTMLElement).dataset.tool as Tool));
});

document.querySelectorAll('[data-sketch-axis]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const axis = (btn as HTMLElement).dataset.sketchAxis as PlaneAxis;
    beginSketchOnPlane(axis, 0);
  });
});

renderer.domElement.addEventListener('pointerleave', () => {
  if (!hoveredOriginPlane) return;
  hoveredOriginPlane = null;
  updateOriginPlaneHighlight(
    activeSketchId ? (sketches.find((s) => s.id === activeSketchId)?.axis ?? null) : null,
  );
  viewport.style.cursor = '';
});

document.getElementById('finish-sketch')!.addEventListener('click', () => finishSketch());
document.getElementById('finish-contour-sketch')!.addEventListener('click', () =>
  saveActiveDraft({ forceClosed: true }),
);

const sketchGridSpacingEl = document.getElementById('sketch-grid-spacing') as HTMLInputElement | null;
const sketchGridSpacingValEl = document.getElementById('sketch-grid-spacing-val');
const sketchGridSnapEl = document.getElementById('sketch-grid-snap') as HTMLInputElement | null;

function refreshSketchGridUi() {
  if (sketchGridSpacingValEl) {
    sketchGridSpacingValEl.textContent = `${sketchGridSpacing} mm · ${sketchGridSnap ? 'Einrasten aktiv' : 'Frei'}`;
  }
}

sketchGridSpacingEl?.addEventListener('input', () => {
  sketchGridSpacing = parseInt(sketchGridSpacingEl.value, 10) || 10;
  refreshSketchGridUi();
  updateSketchGrid();
});

sketchGridSnapEl?.addEventListener('change', () => {
  sketchGridSnap = sketchGridSnapEl.checked;
  refreshSketchGridUi();
});

document.getElementById('sketch-unit')?.addEventListener('change', (e) => {
  sketchUnit = (e.target as HTMLSelectElement).value as SketchUnit;
  sketchDims.onUnitChanged();
});

sketchDims.bindUi(() => {
  sketchDimKind = (document.getElementById('sketch-dim-kind') as HTMLSelectElement).value as SketchDimensionKind;
  sketchDims.clearSession();
  if (tool === 'sketch-dim') {
    setStatus(
      sketchDimKind === 'linear'
        ? t('status.dimLinear')
        : sketchDimKind === 'radius'
          ? t('status.dimRadius')
          : t('status.dimDiameter'),
    );
  }
});

document.querySelectorAll('[data-view]').forEach((btn) => {
  btn.addEventListener('click', () => setView((btn as HTMLElement).dataset.view!));
});

planeAxisSel.addEventListener('change', () => {
  planeAxis = planeAxisSel.value as PlaneAxis;
  if (activeDraft) activeDraft.axis = planeAxis;
  updateHitFeedback();
});

planePos.addEventListener('input', () => {
  planePosition = parseFloat(planePos.value);
  if (activeDraft) activeDraft.position = planePosition;
  updateHitFeedback();
});

document.getElementById('hit-points')!.addEventListener('change', (e: Event) => {
  hitPointFeedback = (e.target as HTMLInputElement).checked;
  updateHitFeedback();
  setStatus(hitPointFeedback ? t('status.hitPointsOn') : t('status.hitPointsOff'));
});

document.getElementById('hit-plane')!.addEventListener('change', (e: Event) => {
  hitPlaneFeedback = (e.target as HTMLInputElement).checked;
  updateHitFeedback();
  setStatus(hitPlaneFeedback ? t('status.hitPlaneOn') : t('status.hitPlaneOff'));
});

document.getElementById('hit-tolerance')!.addEventListener('input', () => {
  updateHitFeedback();
});

document.querySelectorAll('[data-tmode]').forEach((btn) => {
  btn.addEventListener('click', () => {
    setTransformMode((btn as HTMLElement).dataset.tmode as 'translate' | 'rotate');
  });
});

document.getElementById('tmode-world')!.addEventListener('click', () => {
  transformSpace = transformSpace === 'world' ? 'local' : 'world';
  transformControls.setSpace(transformSpace);
  const btn = document.getElementById('tmode-world')!;
  btn.textContent = transformSpace === 'world' ? t('transform.world') : t('transform.local');
  setStatus(transformSpace === 'world' ? t('status.worldSpace') : t('status.localSpace'));
});

document.getElementById('plane-drag-toggle')!.addEventListener('click', () => {
  appMenu.openAlignPanel();
  setPlaneDragMode(!planeDragMode);
});

document.getElementById('plane-align-open')!.addEventListener('click', () => {
  appMenu.openAlignPanel();
});

document.getElementById('align-to-plane')!.addEventListener('click', () => {
  autoAlignScanToPlane();
});

document.getElementById('align-reset')!.addEventListener('click', () => {
  resetScanAlignment();
  setStatus(t('status.scanAlignReset'));
});

document.getElementById('align-fit-view')!.addEventListener('click', () => {
  updateWorldScanBounds();
  fitCameraToBox(cadScene.bounds);
  setStatus(t('status.cameraFit'));
});

document.getElementById('close-contour')!.addEventListener('click', () => {
  if (!activeDraft) {
    statusWhenNoOpenDraft();
    return;
  }
  if (activeDraft.points.length < 3) {
    discardIncompleteDraft(true);
    statusWhenNoOpenDraft();
    return;
  }
  if (activeDraft.closed) {
    saveActiveDraft({ recordUndo: false });
    return;
  }
  pushUndo('Kontur schließen');
  activeDraft.closed = true;
  closeSnapPreview = false;
  renderDraftLine();
  saveActiveDraft({ recordUndo: false });
});

document.getElementById('finish-contour')!.addEventListener('click', () => saveActiveDraft({ forceClosed: true }));
document.getElementById('discard-draft')!.addEventListener('click', () => {
  if (!activeDraft) {
    statusWhenNoOpenDraft();
    return;
  }
  const n = activeDraft.points.length;
  pushUndo('Entwurf verwerfen');
  activeDraft = null;
  clearDraftVisuals();
  const ready = closedContourCount();
  if (ready >= 2) {
    setStatus(t('status.draftDiscarded', { n, ready }));
  } else {
    statusWhenNoOpenDraft();
  }
});
document.getElementById('undo-point')!.addEventListener('click', () => performUndo());
document.getElementById('redo-point')!.addEventListener('click', () => performRedo());

document.getElementById('loft-form')!.addEventListener('click', () =>
  startSolidCommand('loft', { negativform: true }),
);
document.getElementById('export-stl')!.addEventListener('click', exportForm);
document.getElementById('body-transform-reset')!.addEventListener('click', resetBodyTransform);
document.getElementById('body-duplicate')!.addEventListener('click', () => void duplicateActiveBody());
document.getElementById('body-mirror-x')!.addEventListener('click', () => void mirrorActiveBody('x'));
document.getElementById('body-delete')!.addEventListener('click', deleteActiveBody);
document.getElementById('body-cut-plane')!.addEventListener('click', () => void cutBodyByWorkPlane());
document.getElementById('body-brush')!.addEventListener('input', (e) => {
  bodyBrushPct = parseInt((e.target as HTMLInputElement).value, 10) || 8;
  const el = document.getElementById('body-brush-val');
  if (el) el.textContent = `${bodyBrushPct}%`;
  if (smoothPaint?.sectionOrigin) {
    const body = cadScene.getBody(smoothPaint.bodyId);
    if (body && smoothPaint.sectionNormal) {
      updateSectionBandHelper(body, smoothPaint.sectionOrigin, smoothPaint.sectionNormal);
    }
  }
});

document.getElementById('smooth-strength')!.addEventListener('input', (e) => {
  smoothStrengthPct = parseInt((e.target as HTMLInputElement).value, 10) || 45;
  const el = document.getElementById('smooth-strength-val');
  if (el) el.textContent = `${smoothStrengthPct}%`;
});

document.getElementById('smooth-section-depth')!.addEventListener('input', (e) => {
  smoothSectionDepthMm = parseInt((e.target as HTMLInputElement).value, 10) || 5;
  const el = document.getElementById('smooth-section-depth-val');
  if (el) el.textContent = String(smoothSectionDepthMm);
  if (smoothPaint?.sectionOrigin) {
    const body = cadScene.getBody(smoothPaint.bodyId);
    if (body && smoothPaint.sectionNormal) {
      updateSectionBandHelper(body, smoothPaint.sectionOrigin, smoothPaint.sectionNormal);
    }
  }
});

document.getElementById('smooth-edge-only')!.addEventListener('change', (e) => {
  smoothEdgeOnly = (e.target as HTMLInputElement).checked;
});
document.getElementById('save-project')!.addEventListener('click', () => void saveProject());
document.getElementById('load-project-start')!.addEventListener('click', () => projectFile.click());
projectFile.addEventListener('change', async () => {
  const file = projectFile.files?.[0];
  if (!file) return;
  await loadProjectBuffer(await file.arrayBuffer(), file.name);
  projectFile.value = '';
});
function clearAllContours() {
  if (contours.length || activeDraft || sketches.length || sketchDimensions.length) pushUndo('Alles löschen');
  contours = [];
  sketches = [];
  sketchDimensions = [];
  activeSketchId = null;
  sketchDims.clearSession();
  updateOriginPlaneHighlight(null);
  drawGroup.clear();
  activeDraft = null;
  clearDraftVisuals();
  sketchDims.rebuild();
  sketchDims.refreshList();
  refreshContourList();
  updateSketchRibbonState(null, 'sketch-pick');
  if (workspaceMode === 'sketch') setTool('sketch-pick', { skipWorkspaceCheck: true });
}

document.getElementById('clear-contours')!.addEventListener('click', clearAllContours);
document.getElementById('clear-contours-panel')!.addEventListener('click', clearAllContours);

scanFile.addEventListener('change', async () => {
  const file = scanFile.files?.[0];
  if (!file) return;
  await loadStlBuffer(await file.arrayBuffer(), file.name, ab().displayStride);
});

async function reloadScanFromBuffer() {
  if (!ab().meshBuffer) {
    setStatus(t('status.noGeometry'));
    return;
  }
  const stride = parseInt((document.getElementById('scan-stride') as HTMLInputElement).value) || 1;
  await loadStlBuffer(ab().meshBuffer!, 'Scan', Math.max(1, stride));
}

document.getElementById('reload-scan')!.addEventListener('click', () => void reloadScanFromBuffer());
document.getElementById('reload-scan-panel')!.addEventListener('click', () => void reloadScanFromBuffer());

document.getElementById('scan-mode')!.addEventListener('change', (e: Event) => {
  const mode = (e.target as HTMLSelectElement).value as ScanDisplayMode;
  const brightness =
    parseInt((document.getElementById('scan-brightness') as HTMLInputElement).value) / 100;
  applyScanTheme(mode, brightness);
  setStatus(t('status.displayMode', { mode: getScanModeLabel(mode) }));
});

document.getElementById('scan-brightness')!.addEventListener('input', (e: Event) => {
  const brightness = parseInt((e.target as HTMLInputElement).value) / 100;
  applyScanTheme(bodyDisplayMode, brightness);
});

document.getElementById('scan-opacity')!.addEventListener('input', (e: Event) => {
  const v = parseInt((e.target as HTMLInputElement).value) / 100;
  const solid = ab().meshGroup.getObjectByName('solid') as THREE.Mesh | undefined;
  if (solid) {
    const mat = solid.material as THREE.MeshBasicMaterial | THREE.MeshLambertMaterial;
    mat.opacity = v;
  }
});

document.getElementById('scan-wire')!.addEventListener('change', (e) => {
  const wire = ab().meshGroup.getObjectByName('wire');
  if (wire) wire.visible = wireEdgesVisible();
});

document.getElementById('scan-points')!.addEventListener('change', (e) => {
  const points = ab().meshGroup.getObjectByName('points');
  if (points) {
    points.visible = (e.target as HTMLInputElement).checked && pointsSpritesVisible();
  }
});

document.getElementById('slice-axis')!.addEventListener('change', updateSlice);
document.getElementById('slice-pos')!.addEventListener('input', updateSlice);

document.getElementById('grid-size')!.addEventListener('input', (e: Event) => {
  const step = parseInt((e.target as HTMLInputElement).value);
  grid.scale.setScalar(step);
});

function findBodyIdForObject(obj: THREE.Object3D): string | null {
  let node: THREE.Object3D | null = obj;
  while (node) {
    if (cadScene.getBody(node.name)) return node.name;
    node = node.parent;
  }
  return null;
}

function pickBodyMeshAt(clientX: number, clientY: number): string | null {
  const rect = renderer.domElement.getBoundingClientRect();
  pickPointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pickPointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  pickRaycaster.setFromCamera(pickPointer, camera);

  const targets: THREE.Object3D[] = [];
  for (const body of cadScene.listBodies()) {
    const comp = cadScene.getComponent(body.componentId);
    if (!comp?.visible || !body.visible || !body.meshGroup.children.length) continue;
    for (const name of ['solid', 'festkoerper', 'wire'] as const) {
      const obj = body.meshGroup.getObjectByName(name);
      if (obj?.visible) targets.push(obj);
    }
  }
  if (!targets.length) return null;

  const hits = pickRaycaster.intersectObjects(targets, false);
  if (!hits.length) return null;
  return findBodyIdForObject(hits[0].object);
}

function pickFestkoerperAt(clientX: number, clientY: number): string | null {
  const bodyId = pickBodyMeshAt(clientX, clientY);
  if (!bodyId || !isTraceAssistOn(bodyId)) return null;
  return bodyId;
}

function syncBodyColorMenuUi(hex: string) {
  const norm = hex.toLowerCase();
  bodyColorInput.value = norm;
  bodyColorMenu.querySelectorAll('[data-body-color]').forEach((btn) => {
    const el = btn as HTMLElement;
    el.classList.toggle('is-active', el.dataset.bodyColor?.toLowerCase() === norm);
  });
}

function hideBodyColorMenu() {
  bodyColorMenu.classList.add('hidden');
  bodyColorMenuTarget = null;
  const host = viewport.querySelector('.viewport-wrap') as HTMLElement ?? viewport;
  if (bodyColorMenu.parentElement !== host) {
    host.appendChild(bodyColorMenu);
  }
}

function showBodyColorMenu(clientX: number, clientY: number, bodyId: string) {
  hideBrowserContextMenu();
  hideViewportMenu();
  hidePointMenu();
  bodyColorMenuTarget = bodyId;
  cadScene.setActiveBody(bodyId);
  syncBodyColorMenuUi(numberToHexColor(getBodySolidColor(bodyId)));
  bodyColorMenu.classList.remove('hidden');
  const host = viewport.querySelector('.viewport-wrap') as HTMLElement ?? viewport;
  if (!bodyColorMenu.parentElement || bodyColorMenu.parentElement !== host) {
    host.appendChild(bodyColorMenu);
  }
  bodyColorMenu.style.position = 'absolute';
  const rect = host.getBoundingClientRect();
  const menuW = bodyColorMenu.offsetWidth || 200;
  const menuH = bodyColorMenu.offsetHeight || 160;
  let left = clientX - rect.left;
  let top = clientY - rect.top;
  left = Math.min(Math.max(4, left), rect.width - menuW - 4);
  top = Math.min(Math.max(4, top), rect.height - menuH - 4);
  bodyColorMenu.style.left = `${left}px`;
  bodyColorMenu.style.top = `${top}px`;
}

function hideViewportMenu() {
  viewportMenu.classList.add('hidden');
}

function showViewportMenu(clientX: number, clientY: number) {
  syncToolButtons(tool);
  viewportMenu.querySelectorAll('[data-menu-tmode]').forEach((btn) => {
    const mode = transformControls.getMode();
    btn.classList.toggle('active', (btn as HTMLElement).dataset.menuTmode === mode);
  });
  viewportMenu.classList.remove('hidden');
  const rect = viewport.getBoundingClientRect();
  const menuW = viewportMenu.offsetWidth || 220;
  const menuH = viewportMenu.offsetHeight || 320;
  let left = clientX - rect.left;
  let top = clientY - rect.top;
  left = Math.min(Math.max(4, left), rect.width - menuW - 4);
  top = Math.min(Math.max(4, top), rect.height - menuH - 4);
  viewportMenu.style.left = `${left}px`;
  viewportMenu.style.top = `${top}px`;
}

viewport.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (tool === 'edit') {
    const target = pickEditTarget(
      contoursForPicking(),
      selectedContourId,
      e.clientX,
      e.clientY,
      renderer.domElement,
      camera,
      cadScene.size,
    );
    if (target?.kind === 'anchor') {
      selectContour(target.contourId, target.pointIndex);
      showPointMenu(e.clientX, e.clientY, target.contourId, target.pointIndex);
      return;
    }
  }

  const festBodyId = pickFestkoerperAt(e.clientX, e.clientY);
  if (festBodyId) {
    showBodyColorMenu(e.clientX, e.clientY, festBodyId);
    return;
  }

  hidePointMenu();
  hideBodyColorMenu();
  showViewportMenu(e.clientX, e.clientY);
});

viewportMenu.querySelectorAll('[data-menu-tool]').forEach((btn) => {
  btn.addEventListener('click', () => {
    setTool((btn as HTMLElement).dataset.menuTool as Tool);
    hideViewportMenu();
  });
});

viewportMenu.querySelectorAll('[data-menu-view]').forEach((btn) => {
  btn.addEventListener('click', () => {
    setView((btn as HTMLElement).dataset.menuView!);
    hideViewportMenu();
  });
});

viewportMenu.querySelectorAll('[data-menu-tmode]').forEach((btn) => {
  btn.addEventListener('click', () => {
    setTool('align');
    setTransformMode((btn as HTMLElement).dataset.menuTmode as 'translate' | 'rotate');
    hideViewportMenu();
  });
});

viewportMenu.querySelectorAll('[data-menu-action]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const action = (btn as HTMLElement).dataset.menuAction;
    if (action === 'world') {
      setTool('align');
      document.getElementById('tmode-world')!.click();
    } else if (action === 'align-reset') {
      resetScanAlignment();
      setStatus(t('status.alignmentResetBody'));
    } else if (action === 'panel-align') {
      appMenu.openAlignPanel();
    }
    hideViewportMenu();
  });
});

pointMenu.querySelectorAll('[data-point-action]').forEach((btn) => {
  btn.addEventListener('click', () => {
    applyPointMenuAction((btn as HTMLElement).dataset.pointAction!);
  });
});

bodyColorMenu.querySelectorAll('[data-body-color]').forEach((btn) => {
  btn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!bodyColorMenuTarget) return;
    const hex = (btn as HTMLElement).dataset.bodyColor;
    if (!hex) return;
    setBodySolidColor(bodyColorMenuTarget, hex);
  });
});

bodyColorInput.addEventListener('input', () => {
  if (!bodyColorMenuTarget) return;
  setBodySolidColor(bodyColorMenuTarget, bodyColorInput.value, true);
});
bodyColorInput.addEventListener('change', () => {
  if (!bodyColorMenuTarget) return;
  setBodySolidColor(bodyColorMenuTarget, bodyColorInput.value);
});

browserContextMenu.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest('[data-browser-ctx]') as HTMLElement | null;
  if (!btn || btn.hasAttribute('disabled')) return;
  e.stopPropagation();
  applyBrowserContextAction(btn.dataset.browserCtx!);
});

document.addEventListener('pointerdown', (e) => {
  if (!viewportMenu.classList.contains('hidden') && !viewportMenu.contains(e.target as Node)) {
    hideViewportMenu();
  }
  if (!pointMenu.classList.contains('hidden') && !pointMenu.contains(e.target as Node)) {
    hidePointMenu();
  }
  if (!bodyColorMenu.classList.contains('hidden') && !bodyColorMenu.contains(e.target as Node)) {
    hideBodyColorMenu();
  }
  if (
    !browserContextMenu.classList.contains('hidden') &&
    !browserContextMenu.contains(e.target as Node) &&
    !browserPanelEl.contains(e.target as Node)
  ) {
    hideBrowserContextMenu();
  } else if (
    !browserContextMenu.classList.contains('hidden') &&
    !browserContextMenu.contains(e.target as Node) &&
    browserPanelEl.contains(e.target as Node) &&
    !(e.target as HTMLElement).closest('[data-select-body], [data-context-component]')
  ) {
    hideBrowserContextMenu();
  }
});

function handleFusionCancel(): boolean {
  let consumed = false;
  if (isSolidCommandActive()) {
    cancelAllSolidCommands(solidCommandHosts);
    consumed = true;
  }
  if (sketchDims.hasSession || sketchDims.preselectedEdge) {
    sketchDims.clearSession();
    if (tool === 'sketch-dim') setTool('navigate');
    syncOrbitControls();
    consumed = true;
  }
  if (sketchInteraction) {
    clearSketchInteraction();
    consumed = true;
  }
  if (isDrawing) {
    isDrawing = false;
    clearOverlay();
    consumed = true;
  }
  if (activeDraft && activeDraft.points.length > 0 && activeDraft.points.length < 3) {
    discardIncompleteDraft(true);
    consumed = true;
  }
  return consumed;
}

function applyFusionShortcutAction(action: FusionShortcutAction) {
  switch (action.type) {
    case 'tool': {
      if (action.tool === 'move-body' || action.tool === 'press-pull' || action.tool === 'scale-body') {
        appMenu.selectTab('body', false);
        setWorkspaceMode('body');
      } else if (
        action.tool.startsWith('sketch-') ||
        action.tool === 'edit' ||
        action.tool === 'freehand'
      ) {
        appMenu.selectTab('sketch', false);
        setWorkspaceMode('sketch');
      } else if (action.tool === 'polyline' || action.tool === 'lasso') {
        appMenu.selectTab('draw', false);
        setWorkspaceMode('contour');
      }
      setTool(action.tool);
      break;
    }
    case 'tab': {
      appMenu.selectTab(action.tab, false);
      const ws = workspaceForTab(action.tab);
      if (ws) setWorkspaceMode(ws);
      break;
    }
    case 'transform':
      if (action.mode === 'scale') {
        transformControls.setMode('scale');
        setStatus(t('status.scaleGizmo'));
      } else {
        setTransformMode(action.mode);
      }
      break;
    case 'view':
      if (action.preset === 'fit') {
        if (isEmptyProject()) setupEmptyProjectView();
        else {
          updateWorldScanBounds();
          fitCameraToBox(cadScene.bounds);
        }
        setStatus(t('status.fitView'));
      } else if (action.preset === 'perspective') {
        setView('perspective');
      } else {
        setView(action.preset);
      }
      break;
    case 'undo':
      performUndo();
      break;
    case 'redo':
      performRedo();
      break;
    case 'save':
      void saveProject();
      break;
    case 'finish-sketch':
      if (activeSketchId) finishSketch();
      break;
    case 'enter-sketch':
      enterSketchPickMode();
      break;
    case 'toggle-world-local':
      document.getElementById('tmode-world')!.click();
      break;
    case 'cancel':
      if (isSolidCommandActive()) {
        cancelAllSolidCommands(solidCommandHosts);
        setStatus(t('status.solidCommandCancelled'));
      } else if (isSubtractPicking()) cancelSubtract({ setStatus });
      break;
  }
}

window.addEventListener('keydown', (e) => {
  if (!isTypingTarget(e.target) && e.key === 'Enter' && isLoftActive()) {
    e.preventDefault();
    void tryCommitLoft(loftHost);
    return;
  }
  if (e.key === 'Shift' && !shiftKeyHeld) {
    shiftKeyHeld = true;
    syncOrbitControls();
  }
});
window.addEventListener('keyup', (e) => {
  if (e.key === 'Shift' && shiftKeyHeld) {
    shiftKeyHeld = false;
    syncOrbitControls();
  }
});
window.addEventListener('blur', () => {
  if (!shiftKeyHeld) return;
  shiftKeyHeld = false;
  syncOrbitControls();
});

bindFusionKeyboard({
  getTool: () => tool,
  getActiveSketchId: () => activeSketchId,
  onCancel: handleFusionCancel,
  onAction: applyFusionShortcutAction,
  closeMenus: () => {
    hideViewportMenu();
    hidePointMenu();
    hideBodyColorMenu();
    hideBrowserContextMenu();
    appMenu.closeAll();
  },
});

window.addEventListener('resize', resize);
const resizeObserver = new ResizeObserver(() => resize());
resizeObserver.observe(viewport);
resizeObserver.observe(viewCubeHost);

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  viewCube.update(delta);
  if (viewCube.dragging || viewCube.animating) {
    syncOrbitControlsFromCamera(controls, camera);
  }
  syncOrbitControls();
  controls.update();
  if (activeSketchId && sketchDimGroup.visible) sketchDims.updateScreenScales();
  syncAttachedContourDisplay();
  renderer.render(scene, camera);
  viewCube.render();
}

initAlignControls();

async function boot() {
  initI18n();
  resize();
  syncAlignControls();
  renderFusionShortcutsPanel();
  refreshSketchGridUi();
  setupEmptyProjectView();
  applyScanTheme(bodyDisplayMode, bodyBrightness);
  refreshBrowserPanel();
  updateSketchRibbonState(null, 'sketch-pick');
  refreshHistoryTimeline();
  animate();

  const localeSelect = document.getElementById('locale-select') as HTMLSelectElement | null;
  if (localeSelect) {
    if (!localeSelect.options.length) {
      for (const loc of getLocales()) {
        const opt = document.createElement('option');
        opt.value = loc;
        opt.textContent = localeLabel(loc);
        localeSelect.appendChild(opt);
      }
    }
    localeSelect.value = getLocale();
    localeSelect.addEventListener('change', () => setLocale(localeSelect.value as Locale));
  }
  onLocaleChange(() => {
    viewCube.refreshFaceLabels();
    refreshBrowserPanel();
    renderFusionShortcutsPanel();
    syncToolButtons(tool);
    refreshToolHint();
    refreshDynamicI18n({ transformLocal: transformSpace === 'local' });
    sketchDims?.refreshList();
    syncWorkspaceChrome();
  });

  await initWasm();

  bindSolidFeatureButtons({
    setStatus,
    selectTab: (tab) => {
      appMenu.selectTab(tab, false);
      const ws = workspaceForTab(tab);
      if (ws) setWorkspaceMode(ws);
    },
    setTool: (next) => setTool(next, { skipWorkspaceCheck: true }),
    triggerExtrude: () => startSolidCommand('extrude'),
    triggerRevolve: () => startSolidCommand('revolve'),
    triggerLoft: () => startSolidCommand('loft'),
    triggerSplitBody: () => void cutBodyByWorkPlane(),
    triggerRectPattern: () => void rectangularPatternBodies(),
    triggerCircPattern: () => void circularPatternBodies(),
    triggerMirror: () => void mirrorActiveBodyPrompt(),
    triggerJoin: () => void joinBodiesInComponent(),
    triggerSubtract: () => beginSubtract({
      setStatus,
      getBody: (id) => cadScene.getBody(id),
      runSubtract: runBooleanSubtract,
    }),
  });

  appMenu.selectTab('sketch', false);
  setWorkspaceMode('sketch', { tool: 'sketch-pick' });
  setStatus(t('status.sketchPick'));
}

boot();