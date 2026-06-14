/**
 * Registry feature: OBJ-Export des aktiven Körpers.
 *
 * Extends the IO surface beyond STL: serializes the active body's geometry to
 * a Wavefront OBJ (with vertex normals) and triggers a browser download.
 * Thin registration delegating to the pure `src/io/obj-export` module.
 */
import { registerFeature } from './registry';
import type { FeatureHost } from './host';
import { geometryToObj, objStats } from '../io/obj-export';

function triggerDownload(filename: string, text: string): void {
  // Guard for non-DOM environments (defensive — features run in the browser).
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Release the object URL on the next tick so the download has started.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Slugify a body label into a safe-ish file base. */
function fileBase(label: string): string {
  const base = label.trim().replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '');
  return base.length > 0 ? base : 'body';
}

async function exportObj(host: FeatureHost): Promise<void> {
  host.selectTab('body');
  const body = host.getActiveBody();
  const geometry = body?.geometry ?? null;
  if (!body || !geometry) {
    host.setStatus(host.t('status.objExportNoBody'));
    return;
  }

  const name = fileBase(body.label);
  const obj = geometryToObj(geometry, name);
  const { vertexCount, faceCount } = objStats(obj);

  triggerDownload(`${name}.obj`, obj);

  host.markFeatureDone('io-obj-export', body.label);
  host.setStatus(host.t('status.objExportDone', { faces: faceCount }));

  // Expose hard measurements for E2E assertions (own namespace, not __cadDebug).
  const w = window as unknown as { __cadFeature?: Record<string, unknown> };
  w.__cadFeature ??= {};
  w.__cadFeature.objExport = { vertexCount, faceCount, sample: obj.slice(0, 64) };
}

registerFeature({
  id: 'io-obj-export',
  tab: 'body',
  group: 'io.export',
  labelKey: 'io.objExport',
  icon: '⭳',
  run: (host) => exportObj(host),
});
