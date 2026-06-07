import type { TimelineView } from './undo';

export interface HistoryTimelineHost {
  onUndo(): void;
  onRedo(): void;
  onJumpTo(position: number): void;
  getView(): TimelineView;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncateLabel(label: string, max = 28): string {
  if (label.length <= max) return label;
  return `${label.slice(0, max - 1)}…`;
}

export function bindHistoryTimeline(root: HTMLElement, host: HistoryTimelineHost) {
  const track = root.querySelector('#timeline-track') as HTMLElement;
  const btnUndo = root.querySelector('#timeline-undo') as HTMLButtonElement;
  const btnRedo = root.querySelector('#timeline-redo') as HTMLButtonElement;
  const positionLabel = root.querySelector('#timeline-position') as HTMLElement;

  function render() {
    const view = host.getView();
    btnUndo.disabled = !view.canUndo;
    btnRedo.disabled = !view.canRedo;

    const total = view.steps.length;
    positionLabel.textContent =
      total === 0
        ? 'Keine Schritte'
        : view.position >= total
          ? `Schritt ${view.position} von ${total} · aktuell`
          : `Schritt ${view.position} von ${total} · ${total - view.position} wiederholbar`;

    track.innerHTML = '';

    const start = document.createElement('button');
    start.type = 'button';
    start.className = 'timeline-step';
    if (view.position === 0) start.classList.add('timeline-step-active');
    else if (view.position > 0) start.classList.add('timeline-step-done');
    start.dataset.position = '0';
    start.title = 'Ausgangszustand';
    start.innerHTML =
      '<span class="timeline-step-icon" aria-hidden="true">⌂</span><span class="timeline-step-label">Start</span>';
    track.appendChild(start);

    view.steps.forEach((step, i) => {
      const pos = i + 1;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'timeline-step';
      if (pos === view.position) btn.classList.add('timeline-step-active');
      else if (pos < view.position) btn.classList.add('timeline-step-done');
      else btn.classList.add('timeline-step-future');
      btn.dataset.position = String(pos);
      btn.title = step.label;
      btn.innerHTML = `<span class="timeline-step-num">${pos}</span><span class="timeline-step-label">${escapeHtml(truncateLabel(step.label))}</span>`;
      track.appendChild(btn);
    });

    const active = track.querySelector('.timeline-step-active');
    active?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }

  track.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.timeline-step') as HTMLElement | null;
    if (!btn?.dataset.position) return;
    host.onJumpTo(parseInt(btn.dataset.position, 10));
  });

  btnUndo.addEventListener('click', () => host.onUndo());
  btnRedo.addEventListener('click', () => host.onRedo());

  return { refresh: render };
}