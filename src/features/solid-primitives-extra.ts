/**
 * Registry feature: weitere Grundkörper (Torus / Kegel / Pyramide).
 *
 * Extends PR0's primitives. Thin registration delegating to the pure domain
 * module `../solid/primitives-extra`, using only the `FeatureHost`.
 */
import { registerFeature } from './registry';
import type { FeatureHost } from './host';
import { makeTorus, makeCone, makePyramid } from '../solid/primitives-extra';

type ExtraKind = 'torus' | 'cone' | 'pyramid';

const BUILDERS: Record<ExtraKind, () => import('three').BufferGeometry> = {
  torus: makeTorus,
  cone: makeCone,
  pyramid: makePyramid,
};

async function createPrimitiveExtra(
  host: FeatureHost,
  kind: ExtraKind,
  labelKey: string,
): Promise<void> {
  host.selectTab('solid');
  const geom = BUILDERS[kind]();
  const label = host.t(labelKey);
  await host.addBodyFromGeometry(geom, label, 'solid');
  host.markFeatureDone(`primitive-${kind}`, label);
  host.setStatus(host.t('status.primitiveCreated', { label }));
}

registerFeature({
  id: 'primitive-torus',
  tab: 'solid',
  group: 'solid.primitives',
  labelKey: 'solid.torus',
  icon: '◯',
  run: (host) => createPrimitiveExtra(host, 'torus', 'solid.torus'),
});

registerFeature({
  id: 'primitive-cone',
  tab: 'solid',
  group: 'solid.primitives',
  labelKey: 'solid.cone',
  icon: '▲',
  run: (host) => createPrimitiveExtra(host, 'cone', 'solid.cone'),
});

registerFeature({
  id: 'primitive-pyramid',
  tab: 'solid',
  group: 'solid.primitives',
  labelKey: 'solid.pyramid',
  icon: '◢',
  run: (host) => createPrimitiveExtra(host, 'pyramid', 'solid.pyramid'),
});
