/**
 * Registry feature: Schwerpunkt-Marker (Center of Mass) + Bounding-Box des
 * aktiven Körpers — Inspect/Analyse.
 *
 * Thin registration over the pure `centerOfMass` analyser and the overlay
 * builders in `../inspect/com-marker`. Each run computes the world-space center
 * of mass and bounding box of the active body, clears the previous run's
 * overlays from `host.overlay`, and adds a fresh COM marker + bbox helper.
 * Hard numbers land in `window.__cadFeature.com` for the E2E test. Nothing in
 * the model is mutated.
 */
import { registerFeature } from './registry';
import type { FeatureHost } from './host';
import {
  centerOfMass,
  buildComMarker,
  buildBboxBox,
  clearComOverlays,
} from '../inspect/com-marker';

/** Round for compact status display. */
function fmt(n: number, digits = 1): string {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
    useGrouping: false,
  });
}

function runCom(host: FeatureHost): void {
  const THREE = host.THREE;
  const body = host.getActiveBody();
  const geometry = body?.geometry ?? null;
  const posAttr = geometry?.getAttribute('position') ?? null;

  if (!body || !geometry || !posAttr || posAttr.count === 0) {
    host.setStatus(host.t('status.comNoBody'));
    return;
  }

  // Local-space center of mass from the raw buffers.
  const positions =
    posAttr.array instanceof Float32Array
      ? (posAttr.array as Float32Array)
      : Float32Array.from(posAttr.array as ArrayLike<number>);
  const idxAttr = geometry.getIndex();
  const indices =
    idxAttr === null
      ? null
      : idxAttr.array instanceof Uint32Array
        ? (idxAttr.array as Uint32Array)
        : Uint32Array.from(idxAttr.array as ArrayLike<number>);

  const localCom = centerOfMass(positions, indices);

  // Promote to world space via the body's mesh-group world matrix.
  body.meshGroup.updateMatrixWorld(true);
  const worldMatrix = body.meshGroup.matrixWorld;
  const center = new THREE.Vector3(localCom[0], localCom[1], localCom[2]).applyMatrix4(
    worldMatrix,
  );

  // World-space bounding box.
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const worldBox = new THREE.Box3();
  if (geometry.boundingBox) {
    worldBox.copy(geometry.boundingBox).applyMatrix4(worldMatrix);
  }

  // Clear previous overlays, then add a fresh marker + bbox helper.
  clearComOverlays(host.overlay);
  host.overlay.add(buildComMarker(center));
  host.overlay.add(buildBboxBox(worldBox));

  host.markFeatureDone('inspect-com', host.t('inspect.com'));
  host.setStatus(
    host.t('status.comDone', {
      x: fmt(center.x),
      y: fmt(center.y),
      z: fmt(center.z),
    }),
  );

  // Expose hard numbers for the E2E test (own namespace, never __cadDebug).
  const w = window as unknown as { __cadFeature?: Record<string, unknown> };
  w.__cadFeature ??= {};
  w.__cadFeature.com = {
    center: [center.x, center.y, center.z] as [number, number, number],
    bbox: worldBox.isEmpty()
      ? null
      : {
          min: [worldBox.min.x, worldBox.min.y, worldBox.min.z] as [number, number, number],
          max: [worldBox.max.x, worldBox.max.y, worldBox.max.z] as [number, number, number],
        },
  };
}

registerFeature({
  id: 'inspect-com',
  tab: 'body',
  group: 'inspect.analyze',
  labelKey: 'inspect.com',
  icon: '⊕',
  run: (host) => runCom(host),
});
