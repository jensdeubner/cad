/**
 * Registry feature: Grundkörper (Box / Cylinder / Sphere).
 *
 * Reference implementation of the PR0 feature-registry seam — every feature
 * agent copies this shape: thin registration delegating to a domain module,
 * using only the `FeatureHost`.
 */
import { registerFeature } from './registry';
import type { FeatureHost } from './host';
import { makePrimitiveGeometry, type PrimitiveKind } from '../solid/primitives';

async function createPrimitive(
  host: FeatureHost,
  kind: PrimitiveKind,
  labelKey: string,
): Promise<void> {
  host.selectTab('solid');
  const geom = makePrimitiveGeometry(kind);
  const label = host.t(labelKey);
  await host.addBodyFromGeometry(geom, label, 'solid');
  host.markFeatureDone(`primitive-${kind}`, label);
  host.setStatus(host.t('status.primitiveCreated', { label }));
}

registerFeature({
  id: 'primitive-box',
  tab: 'solid',
  group: 'solid.primitives',
  labelKey: 'solid.box',
  icon: '⬛',
  run: (host) => createPrimitive(host, 'box', 'solid.box'),
});

registerFeature({
  id: 'primitive-cylinder',
  tab: 'solid',
  group: 'solid.primitives',
  labelKey: 'solid.cylinder',
  icon: '⬢',
  run: (host) => createPrimitive(host, 'cylinder', 'solid.cylinder'),
});

registerFeature({
  id: 'primitive-sphere',
  tab: 'solid',
  group: 'solid.primitives',
  labelKey: 'solid.sphere',
  icon: '⬤',
  run: (host) => createPrimitive(host, 'sphere', 'solid.sphere'),
});
