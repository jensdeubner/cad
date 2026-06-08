import * as THREE from 'three';
import { t } from './i18n';

export type ViewCubePreset =
  | 'top'
  | 'bottom'
  | 'front'
  | 'back'
  | 'right'
  | 'left';

export interface ViewCubeFlight {
  position: THREE.Vector3;
  up: THREE.Vector3;
  planeAxis?: 'xy' | 'xz' | 'yz';
}

export interface ViewCubeOptions {
  getPivot: () => THREE.Vector3;
  onOrbitStart?: () => void;
  onOrbitChange?: () => void;
  onOrbitEnd?: () => void;
  onFlightEnd?: () => void;
}

const DRAG_THRESHOLD_PX = 4;
const ORBIT_SPEED = 0.008;

const FACE_COLORS: Record<ViewCubePreset, string> = {
  right: '#dbeafe',
  left: '#e2e8f0',
  front: '#ffedd5',
  back: '#e2e8f0',
  top: '#dcfce7',
  bottom: '#f1f5f9',
};

/** Three.js BoxGeometry: +X, -X, +Y, -Y, +Z, -Z → App: R, L, V, H, O, U */
const BOX_FACE_PRESETS: ViewCubePreset[] = [
  'right',
  'left',
  'front',
  'back',
  'top',
  'bottom',
];

function faceLabelsFromI18n(): Record<ViewCubePreset, string> {
  return {
    right: t('viewCube.face.right'),
    left: t('viewCube.face.left'),
    front: t('viewCube.face.front'),
    back: t('viewCube.face.back'),
    top: t('viewCube.face.top'),
    bottom: t('viewCube.face.bottom'),
  };
}

function labelTexture(label: string, color: string): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.55, color);
  grad.addColorStop(1, color);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, size - 4, size - 4);
  ctx.fillStyle = '#334155';
  ctx.font = '600 52px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, size / 2, size / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class ViewCube {
  animating = false;
  dragging = false;

  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.2, 12);
  private readonly cube: THREE.Mesh;
  private readonly cubeRenderer: THREE.WebGLRenderer;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly focus = new THREE.Vector3();
  private readonly startPos = new THREE.Vector3();
  private readonly endPos = new THREE.Vector3();
  private readonly startUp = new THREE.Vector3();
  private readonly endUp = new THREE.Vector3();
  private radius = 10;
  private flightT = 0;
  private flightDuration = 0.35;
  private pointerId: number | null = null;
  private pointerDownX = 0;
  private pointerDownY = 0;
  private isDrag = false;
  private pendingFacePreset: ViewCubePreset | null = null;
  private readonly orbitPivot = new THREE.Vector3();
  private readonly orbitOffset = new THREE.Vector3();
  private readonly orbitUp = new THREE.Vector3();
  private readonly orbitRight = new THREE.Vector3();
  private readonly orbitStep = new THREE.Quaternion();

  constructor(
    private mainCamera: THREE.Camera,
    _renderer: THREE.WebGLRenderer,
    private host: HTMLElement,
    private onSelect: (preset: ViewCubePreset) => void,
    private options: ViewCubeOptions,
  ) {
    this.host.classList.add('view-cube-gl');
    this.host.replaceChildren();

    const labels = faceLabelsFromI18n();
    const materials = BOX_FACE_PRESETS.map((preset) =>
      new THREE.MeshStandardMaterial({
        map: labelTexture(labels[preset], FACE_COLORS[preset]),
        roughness: 0.55,
        metalness: 0.05,
      }),
    );

    this.cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), materials);
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(this.cube.geometry),
      new THREE.LineBasicMaterial({ color: 0x64748b }),
    );
    this.cube.add(edges);
    this.scene.add(this.cube);

    const key = new THREE.DirectionalLight(0xffffff, 1.15);
    key.position.set(1.4, 1.8, 2.2);
    this.scene.add(key, new THREE.AmbientLight(0xffffff, 0.55));

    this.camera.position.set(0, 0, 2.65);
    this.camera.lookAt(0, 0, 0);

    this.cubeRenderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.cubeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.cubeRenderer.outputColorSpace = THREE.SRGBColorSpace;
    const canvas = this.cubeRenderer.domElement;
    canvas.className = 'view-cube-canvas';
    this.host.appendChild(canvas);

    this.resize();
    canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    canvas.addEventListener('pointerup', (e) => this.onPointerUp(e));
    canvas.addEventListener('pointercancel', (e) => this.onPointerUp(e));
  }

  setFocus(center: THREE.Vector3, dist: number) {
    this.focus.copy(center);
    this.radius = dist;
  }

  resize() {
    const w = Math.max(2, Math.round(this.host.clientWidth));
    const h = Math.max(2, Math.round(this.host.clientHeight));
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.cubeRenderer.setSize(w, h, false);
  }

  render() {
    this.cube.quaternion.copy(this.mainCamera.quaternion).invert();
    this.cubeRenderer.render(this.scene, this.camera);
  }

  /** Rebuild face label textures after locale change. */
  refreshFaceLabels() {
    const labels = faceLabelsFromI18n();
    const materials = this.cube.material as THREE.MeshStandardMaterial[];
    for (let i = 0; i < BOX_FACE_PRESETS.length; i++) {
      const preset = BOX_FACE_PRESETS[i]!;
      const mat = materials[i]!;
      mat.map?.dispose();
      mat.map = labelTexture(labels[preset], FACE_COLORS[preset]);
      mat.needsUpdate = true;
    }
  }

  flyTo(preset: ViewCubePreset) {
    const flight = ViewCube.flightFor(preset, this.focus, this.radius);
    this.startPos.copy(this.mainCamera.position);
    this.endPos.copy(flight.position);
    this.startUp.copy(this.mainCamera.up);
    this.endUp.copy(flight.up);
    this.flightT = 0;
    this.animating = true;
  }

  update(delta: number) {
    if (!this.animating) return;
    this.flightT = Math.min(1, this.flightT + delta / this.flightDuration);
    const t = 1 - Math.pow(1 - this.flightT, 3);
    this.mainCamera.position.lerpVectors(this.startPos, this.endPos, t);
    this.mainCamera.up.lerpVectors(this.startUp, this.endUp, t).normalize();
    if ('lookAt' in this.mainCamera) {
      (this.mainCamera as THREE.PerspectiveCamera).lookAt(this.focus);
    }
    if (this.flightT >= 1) {
      if (this.animating) {
        this.animating = false;
        this.options.onFlightEnd?.();
      }
    }
  }

  private onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();

    if (this.animating) this.animating = false;

    const canvas = this.cubeRenderer.domElement;
    canvas.setPointerCapture(e.pointerId);
    this.pointerId = e.pointerId;
    this.pointerDownX = e.clientX;
    this.pointerDownY = e.clientY;
    this.isDrag = false;
    this.dragging = false;
    this.pendingFacePreset = this.presetAtPointer(e);
    this.orbitPivot.copy(this.options.getPivot());
    this.host.classList.add('view-cube-grabbing');
  }

  private onPointerMove(e: PointerEvent) {
    if (this.pointerId !== e.pointerId) return;
    e.stopPropagation();
    const dx = e.clientX - this.pointerDownX;
    const dy = e.clientY - this.pointerDownY;
    if (!this.isDrag) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      this.isDrag = true;
      this.dragging = true;
      this.pendingFacePreset = null;
      this.options.onOrbitStart?.();
    }
    const cam = this.mainCamera as THREE.PerspectiveCamera;

    this.orbitUp.copy(cam.up).normalize();
    this.orbitStep.setFromAxisAngle(this.orbitUp, -dx * ORBIT_SPEED);
    this.orbitOffset.copy(cam.position).sub(this.orbitPivot);
    this.orbitOffset.applyQuaternion(this.orbitStep);
    cam.position.copy(this.orbitPivot).add(this.orbitOffset);
    cam.up.applyQuaternion(this.orbitStep);

    cam.updateMatrixWorld();
    this.orbitRight.setFromMatrixColumn(cam.matrixWorld, 0).normalize();
    this.orbitStep.setFromAxisAngle(this.orbitRight, -dy * ORBIT_SPEED);
    this.orbitOffset.copy(cam.position).sub(this.orbitPivot);
    this.orbitOffset.applyQuaternion(this.orbitStep);
    cam.position.copy(this.orbitPivot).add(this.orbitOffset);
    cam.up.applyQuaternion(this.orbitStep);

    cam.lookAt(this.orbitPivot);
    this.pointerDownX = e.clientX;
    this.pointerDownY = e.clientY;
    this.options.onOrbitChange?.();
  }

  private onPointerUp(e: PointerEvent) {
    if (this.pointerId !== e.pointerId) return;
    e.stopPropagation();
    const canvas = this.cubeRenderer.domElement;
    if (canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }
    this.host.classList.remove('view-cube-grabbing');
    if (this.isDrag) {
      this.isDrag = false;
      this.dragging = false;
      this.pointerId = null;
      this.pendingFacePreset = null;
      this.options.onOrbitEnd?.();
      return;
    }
    const preset = this.pendingFacePreset ?? this.presetAtPointer(e);
    this.pendingFacePreset = null;
    this.pointerId = null;
    if (preset) {
      this.flyTo(preset);
      this.onSelect(preset);
    }
  }

  private presetAtPointer(e: PointerEvent): ViewCubePreset | null {
    const rect = this.cubeRenderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObject(this.cube);
    if (!hits.length) return null;
    const mat = hits[0].face?.materialIndex;
    if (mat === undefined) return null;
    return BOX_FACE_PRESETS[mat] ?? null;
  }

  static flightFor(preset: ViewCubePreset, center: THREE.Vector3, dist: number): ViewCubeFlight {
    const d = dist;
    switch (preset) {
      case 'top':
        return {
          position: new THREE.Vector3(center.x, center.y, center.z + d),
          up: new THREE.Vector3(0, 1, 0),
          planeAxis: 'xy',
        };
      case 'bottom':
        return {
          position: new THREE.Vector3(center.x, center.y, center.z - d),
          up: new THREE.Vector3(0, 1, 0),
        };
      case 'front':
        return {
          position: new THREE.Vector3(center.x, center.y + d, center.z),
          up: new THREE.Vector3(0, 0, 1),
          planeAxis: 'xz',
        };
      case 'back':
        return {
          position: new THREE.Vector3(center.x, center.y - d, center.z),
          up: new THREE.Vector3(0, 0, 1),
        };
      case 'right':
        return {
          position: new THREE.Vector3(center.x + d, center.y, center.z),
          up: new THREE.Vector3(0, 0, 1),
          planeAxis: 'yz',
        };
      case 'left':
        return {
          position: new THREE.Vector3(center.x - d, center.y, center.z),
          up: new THREE.Vector3(0, 0, 1),
        };
      default:
        return {
          position: new THREE.Vector3(center.x + d, center.y + d * 0.6, center.z + d),
          up: new THREE.Vector3(0, 1, 0),
        };
    }
  }
}