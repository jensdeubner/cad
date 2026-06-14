/**
 * Registry features: View → Camera.
 *
 * Pure camera/controls manipulation via the FeatureHost (never swaps the
 * camera type):
 *   • view-look-at — frame the active body (fallback: whole scene)
 *   • view-save    — store the current camera state in a named-view slot
 *   • view-restore — restore the saved camera state
 *
 * Test bridge: hard numbers are exposed under `window.__cadFeature.views`.
 */
import * as THREE from 'three';
import { registerFeature } from './registry';
import type { FeatureHost } from './host';
import { lookAtBox, captureView, applyView, type ViewState } from '../nav/views';

/** Module-level saved-view slot (one named view, à la a single Fusion view). */
let savedView: ViewState | null = null;

interface ViewsBridge {
  lookAt?: { before: number[]; after: number[] };
  saved?: ViewState;
  restoredTo?: number[];
}

function viewsBridge(): ViewsBridge {
  const w = window as unknown as { __cadFeature?: { views?: ViewsBridge } };
  w.__cadFeature ??= {};
  w.__cadFeature.views ??= {};
  return w.__cadFeature.views;
}

/**
 * Tiny read/mutate camera bridge for E2E (own namespace, NOT __cadDebug).
 * `camPos()` reads the live camera; `moveCamera(d)` nudges it away from the
 * target so a save/restore round-trip is observable.
 */
function installCameraBridge(host: FeatureHost): void {
  const w = window as unknown as {
    __cadView?: { camPos: () => number[]; moveCamera: (d: number) => void };
  };
  if (w.__cadView) return;
  w.__cadView = {
    camPos: () => host.camera.position.toArray(),
    moveCamera: (d: number) => {
      const dir = host.camera.position
        .clone()
        .sub(host.controls.target)
        .normalize();
      host.camera.position.addScaledVector(dir, d);
      host.controls.update();
    },
  };
}

/**
 * World-space bounding box of the active body, computed from its geometry and
 * the meshGroup's world matrix. Returns an empty box if the active body has no
 * geometry.
 */
function activeBodyWorldBox(host: FeatureHost): THREE.Box3 {
  const box = new THREE.Box3();
  const body = host.getActiveBody();
  const geom = body?.geometry ?? null;
  if (!body || !geom) return box; // empty

  if (!geom.boundingBox) geom.computeBoundingBox();
  const local = geom.boundingBox;
  if (!local) return box;

  body.meshGroup.updateMatrixWorld(true);
  box.copy(local).applyMatrix4(body.meshGroup.matrixWorld);
  return box;
}

/** Whole-scene fallback box: union of every body's world bbox, else scene bounds. */
function sceneWorldBox(host: FeatureHost): THREE.Box3 {
  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  for (const body of host.getBodies()) {
    const geom = body.geometry;
    if (!geom) continue;
    if (!geom.boundingBox) geom.computeBoundingBox();
    if (!geom.boundingBox) continue;
    body.meshGroup.updateMatrixWorld(true);
    tmp.copy(geom.boundingBox).applyMatrix4(body.meshGroup.matrixWorld);
    box.union(tmp);
  }
  if (box.isEmpty() && !host.cadScene.bounds.isEmpty()) {
    box.copy(host.cadScene.bounds);
  }
  return box;
}

registerFeature({
  id: 'view-look-at',
  tab: 'view',
  group: 'view.camera',
  labelKey: 'view.lookAt',
  icon: '◎',
  run: (host) => {
    installCameraBridge(host);
    host.selectTab('view');
    let box = activeBodyWorldBox(host);
    if (box.isEmpty()) box = sceneWorldBox(host);

    const before = host.camera.position.toArray();
    if (!box.isEmpty()) lookAtBox(host.camera, host.controls, box);
    const after = host.camera.position.toArray();

    viewsBridge().lookAt = { before, after };
    host.markFeatureDone('view-look-at', host.t('view.lookAt'));
    host.setStatus(host.t('status.lookAtDone'));
  },
});

registerFeature({
  id: 'view-save',
  tab: 'view',
  group: 'view.camera',
  labelKey: 'view.save',
  icon: '★',
  run: (host) => {
    installCameraBridge(host);
    savedView = captureView(host.camera, host.controls);
    viewsBridge().saved = savedView;
    host.markFeatureDone('view-save', host.t('view.save'));
    host.setStatus(host.t('status.viewSaved'));
  },
});

registerFeature({
  id: 'view-restore',
  tab: 'view',
  group: 'view.camera',
  labelKey: 'view.restore',
  icon: '↺',
  run: (host) => {
    installCameraBridge(host);
    if (!savedView) {
      host.setStatus(host.t('status.noSavedView'));
      return;
    }
    applyView(host.camera, host.controls, savedView);
    viewsBridge().restoredTo = host.camera.position.toArray();
    host.markFeatureDone('view-restore', host.t('view.restore'));
    host.setStatus(host.t('status.viewRestored'));
  },
});
