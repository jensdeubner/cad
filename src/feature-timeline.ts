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
/**
 * Rollback marker (#30 Phase 1). Features at index `[marker, end)` are
 * *suppressed* (rolled back); `[0, marker)` are active. Default = all active.
 */
let marker = 0;

export function clearFeatureTimeline(): void {
  records = [];
  nextId = 0;
  marker = 0;
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
  marker = records.length; // a freshly added feature is active
}

export function featureTimelineCount(): number {
  return records.length;
}

export function getTimelineMarker(): number {
  return marker;
}

/** Move the rollback marker; clamped to [0, records.length]. Returns the value. */
export function setTimelineMarker(n: number): number {
  marker = Math.max(0, Math.min(records.length, Math.floor(n)));
  return marker;
}

/** Number of active (non-suppressed) features. */
export function timelineActiveCount(): number {
  return marker;
}

/** Body ids created by suppressed (rolled-back) features. */
export function suppressedBodyIds(): CadBodyId[] {
  const ids: CadBodyId[] = [];
  for (let i = marker; i < records.length; i++) {
    const b = records[i].bodyId;
    if (b) ids.push(b);
  }
  return ids;
}

/** Readonly snapshot of the records (inspection/testing). */
export function featureRecords(): ReadonlyArray<FeatureRecord> {
  return records;
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

export function bindFeatureTimeline(root: HTMLElement, onMarkerChange?: () => void) {
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
      .map((feat, i) => {
        const icon = FEATURE_ICONS[feat.kind];
        const kindLabel = t(`feature.kind.${feat.kind}`);
        const suppressed = i >= marker;
        const cls = `timeline-feature-chip${suppressed ? ' timeline-feature-suppressed' : ''}`;
        const title = `${escapeHtml(kindLabel)} · ${escapeHtml(feat.label)} — ${escapeHtml(t('timeline.rollbackTo'))}`;
        return `<span class="${cls}" role="listitem" data-feature-index="${i}" title="${title}">
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

  panel?.addEventListener('click', (e) => {
    const chip = (e.target as HTMLElement).closest('[data-feature-index]') as HTMLElement | null;
    const raw = chip?.dataset.featureIndex;
    if (raw === undefined) return;
    const idx = parseInt(raw, 10);
    // Clicking an active feature rolls back to just before it (suppress it and
    // everything after); clicking a suppressed feature rolls forward to include it.
    const next = idx < marker ? idx : idx + 1;
    setTimelineMarker(next);
    onMarkerChange?.();
    render();
  });

  syncChrome();
  return { refresh: render, clear: clearFeatureTimeline };
}