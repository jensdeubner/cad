/**
 * mountFeatures — renders registry features into the ribbon (PR0).
 *
 * Buttons are generated from the registry and injected into the matching
 * `.ribbon-workspace[data-ribbon=<tab>]`, grouped by their i18n group key.
 * This means feature modules touch neither `index.html` nor `main.ts`.
 */
import { refreshDynamicI18n, onLocaleChange } from '../i18n';
import type { FeatureDef } from './registry';
import type { FeatureHost } from './host';

function workspaceFor(tab: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`.ribbon-workspace[data-ribbon="${tab}"]`);
}

/** Find or lazily create the ribbon-group container for a feature group. */
function ensureGroup(ws: HTMLElement, groupKey: string): HTMLElement {
  const existing = ws.querySelector<HTMLElement>(`[data-feature-group="${groupKey}"]`);
  if (existing) return existing;

  const group = document.createElement('div');
  group.className = 'ribbon-group';
  group.setAttribute('data-feature-group', groupKey);

  const label = document.createElement('span');
  label.className = 'ribbon-label';
  label.setAttribute('data-i18n-key', groupKey);
  label.textContent = groupKey;
  group.appendChild(label);

  // Keep the "Hinweis" hint group last if the tab has one.
  const hint = ws.querySelector(':scope > .ribbon-group-hint');
  if (hint) ws.insertBefore(group, hint);
  else ws.appendChild(group);
  return group;
}

async function runFeature(def: FeatureDef, host: FeatureHost): Promise<void> {
  try {
    await def.run(host);
  } catch (err) {
    console.error(`[feature:${def.id}]`, err);
    host.setStatus(host.t('feature.error', { id: def.id }));
  }
}

function makeButton(def: FeatureDef, host: FeatureHost): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'ribbon-btn ribbon-btn-stack' + (def.primary ? ' ribbon-primary' : '');
  btn.setAttribute('data-feature', def.id);

  const icon = document.createElement('span');
  icon.className = 'ribbon-btn-icon';
  icon.textContent = def.icon ?? '◦';

  const label = document.createElement('span');
  label.className = 'ribbon-btn-label';
  label.setAttribute('data-i18n-key', def.labelKey);
  label.textContent = def.labelKey;

  btn.appendChild(icon);
  btn.appendChild(label);
  btn.addEventListener('click', () => void runFeature(def, host));
  return btn;
}

/** Render all registered features into the ribbon and wire their handlers. */
export function mountFeatures(defs: FeatureDef[], host: FeatureHost): void {
  let mounted = 0;
  for (const def of defs) {
    const ws = workspaceFor(def.tab);
    if (!ws) {
      console.warn(`[features] no ribbon workspace for tab "${def.tab}" (feature ${def.id})`);
      continue;
    }
    if (ws.querySelector(`[data-feature="${def.id}"]`)) continue; // idempotent
    ensureGroup(ws, def.group).appendChild(makeButton(def, host));
    mounted++;
  }

  refreshDynamicI18n();
  onLocaleChange(() => refreshDynamicI18n());

  if (mounted) console.info(`[features] mounted ${mounted} feature button(s)`);
}
