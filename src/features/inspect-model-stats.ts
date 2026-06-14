/**
 * Registry feature: 3D-Modell-Statistik (Volumen, Oberfläche, Bounding-Box,
 * Schwerpunkt) für den aktiven Körper.
 *
 * Thin registration over the pure `computeMeshStats` analyser — reads the
 * active body's geometry through the `FeatureHost`, computes the numbers and
 * reports them in the status line. Nothing is mutated.
 */
import { registerFeature } from './registry';
import type { FeatureHost } from './host';
import { computeMeshStats, type MeshStats } from '../inspect/model-stats';

/** Round to a fixed precision for compact status display. */
function fmt(n: number, digits = 1): string {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
    useGrouping: false,
  });
}

function runStats(host: FeatureHost): void {
  const geometry = host.getActiveBody()?.geometry ?? null;
  if (!geometry) {
    host.setStatus(host.t('inspect.stats.noBody'));
    return;
  }

  const posAttr = geometry.getAttribute('position');
  if (!posAttr || posAttr.count === 0) {
    host.setStatus(host.t('inspect.stats.noBody'));
    return;
  }

  // Normalise to a flat Float32Array of XYZ positions.
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

  const stats: MeshStats = computeMeshStats(positions, indices);

  host.setStatus(
    host.t('status.statsDone', {
      vol: fmt(stats.volume),
      area: fmt(stats.area),
    }),
  );
  host.markFeatureDone('inspect-stats', host.t('inspect.stats'));

  // Expose hard numbers for the E2E test (own namespace, never __cadDebug).
  (window as unknown as { __cadFeature?: Record<string, unknown> }).__cadFeature ??= {};
  (window as unknown as { __cadFeature: Record<string, unknown> }).__cadFeature.stats = stats;
}

registerFeature({
  id: 'inspect-stats',
  tab: 'body',
  group: 'inspect.analyze',
  labelKey: 'inspect.stats',
  icon: 'Σ',
  run: (host) => runStats(host),
});
