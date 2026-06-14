/**
 * Registry feature: PLY-Export des aktiven Körpers.
 *
 * Extends the IO surface with ASCII PLY (widely supported by scan/mesh tools):
 * serializes the active body's geometry to a `.ply` string and triggers a
 * browser download. Thin registration delegating to the pure
 * `src/io/ply-export` module.
 */
import { registerFeature } from './registry';
import type { FeatureHost } from './host';
import { geometryToPly, plyStats } from '../io/ply-export';

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

async function exportPly(host: FeatureHost): Promise<void> {
  host.selectTab('body');
  const body = host.getActiveBody();
  const geometry = body?.geometry ?? null;
  if (!body || !geometry) {
    host.setStatus(host.t('status.plyExportNoBody'));
    return;
  }

  const name = fileBase(body.label);
  const ply = geometryToPly(geometry);
  const { vertexCount, faceCount } = plyStats(ply);

  triggerDownload(`${name}.ply`, ply);

  host.markFeatureDone('io-ply-export', body.label);
  host.setStatus(host.t('status.plyExportDone', { faces: faceCount }));

  // Expose hard measurements for E2E assertions (own namespace, not __cadDebug).
  const w = window as unknown as { __cadFeature?: Record<string, unknown> };
  w.__cadFeature ??= {};
  w.__cadFeature.plyExport = { vertexCount, faceCount, sample: ply.slice(0, 40) };
}

registerFeature({
  id: 'io-ply-export',
  tab: 'body',
  group: 'io.export',
  labelKey: 'io.plyExport',
  icon: '⭳',
  run: (host) => exportPly(host),
});
