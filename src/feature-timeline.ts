/**
 * Display-only log of solid modeling operations (no parametric replay).
 */
import type { CadBodyId } from './cad-scene';
import { t } from './i18n';

export type FeatureKind =
  | 'extrude'
  | 'revolve'
  | 'loft'
  | 'subtract'
  | 'join'
  | 'rect-pattern'
  | 'circ-pattern'
  | 'mirror'
  | 'split-body';

export interface FeatureRecord {
  id: string;
  kind: FeatureKind;
  label: string;
  bodyId?: CadBodyId;
  timestamp: number;
}

const FEATURE_ICONS: Record<FeatureKind, string> = {
  extrude: '↑',
  revolve: '↻',
  loft: '◇',
  subtract: '⊖',
  join: '⊕',
  'rect-pattern': '⊞',
  'circ-pattern': '◎',
  mirror: '⇋',
  'split-body': '✂',
};

let records: FeatureRecord[] = [];
let nextId = 0;

export function clearFeatureTimeline(): void {
  records = [];
  nextId = 0;
}

export function appendFeature(input: {
  kind: FeatureKind;
  label: string;
  bodyId?: CadBodyId;
}): void {
  records.push({
    id: `feat-${nextId++}`,
    kind: input.kind,
    label: input.label,
    bodyId: input.bodyId,
    timestamp: Date.now(),
  });
}

export function featureTimelineCount(): number {
  return records.length;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncateLabel(label: string, max = 24): string {
  if (label.length <= max) return label;
  return `${label.slice(0, max - 1)}…`;
}

const FEATURES_EXPANDED_KEY = 'cad-features-expanded';

export function bindFeatureTimeline(root: HTMLElement) {
  const panel = root.querySelector('#timeline-features') as HTMLElement | null;
  const toggle = root.querySelector('#timeline-features-toggle') as HTMLButtonElement | null;
  let expanded = localStorage.getItem(FEATURES_EXPANDED_KEY) !== '0';

  function syncChrome() {
    const hasFeatures = records.length > 0;
    root.classList.toggle('has-features', hasFeatures && expanded);
    if (toggle) {
      toggle.classList.toggle('hidden', !hasFeatures);
      toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      toggle.title = expanded ? t('timeline.featuresHide') : t('timeline.featuresShow');
      const badge = toggle.querySelector('.timeline-features-count');
      if (badge) badge.textContent = String(records.length);
    }
    if (panel) panel.classList.toggle('hidden', !hasFeatures || !expanded);
  }

  function render() {
    if (!panel) return;
    panel.innerHTML = records
      .map((feat) => {
        const icon = FEATURE_ICONS[feat.kind];
        const kindLabel = t(`feature.kind.${feat.kind}`);
        return `<span class="timeline-feature-chip" role="listitem" title="${escapeHtml(kindLabel)} · ${escapeHtml(feat.label)}">
          <span class="timeline-feature-icon" aria-hidden="true">${icon}</span>
          <span class="timeline-feature-kind">${escapeHtml(kindLabel)}</span>
          <span class="timeline-feature-label">${escapeHtml(truncateLabel(feat.label))}</span>
        </span>`;
      })
      .join('');
    syncChrome();
    const last = panel.lastElementChild;
    last?.scrollIntoView({ inline: 'end', block: 'nearest', behavior: 'smooth' });
  }

  toggle?.addEventListener('click', () => {
    expanded = !expanded;
    localStorage.setItem(FEATURES_EXPANDED_KEY, expanded ? '1' : '0');
    syncChrome();
  });

  syncChrome();
  return { refresh: render, clear: clearFeatureTimeline };
}