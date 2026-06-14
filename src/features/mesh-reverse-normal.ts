/**
 * Registry feature: Reverse Normal (Mesh).
 *
 * Flips the triangle winding of the active body and recomputes normals — the
 * common fix for scans imported with inverted normals. Thin registration over
 * the pure `src/mesh/reverse-normal` module, using only the `FeatureHost`.
 */
import { registerFeature } from './registry';
import type { FeatureHost } from './host';
import { reverseWinding, signedVolume } from '../mesh/reverse-normal';

async function runReverseNormal(host: FeatureHost): Promise<void> {
  const body = host.getActiveBody();
  const geom = body?.geometry;
  if (!body || !geom) {
    host.setStatus(host.t('status.reverseNormalNoBody'));
    return;
  }

  host.pushMeshUndo(host.t('mesh.reverseNormal'));

  const beforePos = geom.getAttribute('position').array as ArrayLike<number>;
  const beforeIdx = geom.getIndex()?.array ?? null;
  const signBefore = signedVolume(beforePos, beforeIdx);

  const reversed = reverseWinding(geom);
  await host.replaceBodyGeometry(body.id, reversed);

  const afterPos = reversed.getAttribute('position').array as ArrayLike<number>;
  const afterIdx = reversed.getIndex()?.array ?? null;
  const signAfter = signedVolume(afterPos, afterIdx);

  host.markFeatureDone('mesh-reverse-normal');
  host.setStatus(host.t('status.reverseNormalDone'));

  (window as unknown as { __cadFeature?: Record<string, unknown> }).__cadFeature ??= {};
  (window as unknown as { __cadFeature: Record<string, unknown> }).__cadFeature.reverseNormal = {
    signBefore,
    signAfter,
  };
}

registerFeature({
  id: 'mesh-reverse-normal',
  tab: 'body',
  group: 'mesh.normals',
  labelKey: 'mesh.reverseNormal',
  icon: '⇄',
  run: (host) => runReverseNormal(host),
});
