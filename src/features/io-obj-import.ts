/**
 * Registry feature: OBJ-Import.
 *
 * Parses a Wavefront OBJ into a fresh body. To stay deterministic without a
 * file picker, the ribbon action imports a built-in sample OBJ (a ~20mm cube).
 * Thin registration delegating to the pure `src/io/obj-import` module.
 */
import { registerFeature } from './registry';
import type { FeatureHost } from './host';
import { parseObj, SAMPLE_CUBE_OBJ } from '../io/obj-import';

async function importObj(host: FeatureHost): Promise<void> {
  host.selectTab('body');

  const geom = parseObj(SAMPLE_CUBE_OBJ);
  const index = geom.getIndex();
  const triangleCount = index ? index.count / 3 : 0;

  if (triangleCount === 0) {
    host.setStatus(host.t('status.objImportEmpty'));
    return;
  }

  const label = host.t('io.objImport');
  await host.addBodyFromGeometry(geom, label, 'solid');

  host.markFeatureDone('io-obj-import', label);
  host.setStatus(host.t('status.objImportDone', { tris: triangleCount }));

  // Expose hard measurements for E2E assertions (own namespace, not __cadDebug).
  const w = window as unknown as { __cadFeature?: Record<string, unknown> };
  w.__cadFeature ??= {};
  w.__cadFeature.objImport = { tris: triangleCount };
}

registerFeature({
  id: 'io-obj-import',
  tab: 'body',
  group: 'io.import',
  labelKey: 'io.objImport',
  icon: '⭱',
  run: (host) => importObj(host),
});
