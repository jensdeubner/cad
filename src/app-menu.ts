import {
  FloatingPanel,
  type FloatingPanelCallbacks,
  type FloatingPanelDefault,
} from './floating-panel';

export type FusionTab =
  | 'start'
  | 'sketch'
  | 'solid'
  | 'body'
  | 'align'
  | 'draw'
  | 'view'
  | 'contours';

const TAB_PANEL: Record<FusionTab, string> = {
  start: 'panel-start',
  sketch: 'panel-sketch',
  solid: 'panel-solid',
  body: 'panel-body',
  align: 'panel-align',
  draw: 'panel-draw',
  view: 'panel-view',
  contours: 'panel-contours',
};

const DEFAULT_LAYOUT: Record<FusionTab, FloatingPanelDefault> = {
  start: { x: 12, y: 12, w: 300, h: 280 },
  sketch: { x: 24, y: 72, w: 320, h: 300 },
  solid: { x: 48, y: 48, w: 340, h: 320 },
  body: { x: 48, y: 48, w: 320, h: 420 },
  align: { x: 84, y: 24, w: 400, h: 560 },
  draw: { x: 24, y: 72, w: 300, h: 260 },
  view: { x: 360, y: 12, w: 300, h: 300 },
  contours: { x: 360, y: 280, w: 320, h: 380 },
};

export class AppMenu {
  private activeTab: FusionTab = 'start';
  private readonly panels = new Map<FusionTab, FloatingPanel>();

  constructor(
    private readonly host: HTMLElement,
    private readonly panelCallbacks: Partial<Record<FusionTab, FloatingPanelCallbacks>> = {},
    private readonly onTabSelect?: (tab: FusionTab) => void,
  ) {
    (Object.keys(TAB_PANEL) as FusionTab[]).forEach((tab) => {
      const el = document.getElementById(TAB_PANEL[tab])!;
      this.panels.set(
        tab,
        new FloatingPanel(host, el, `cad.panel.${tab}`, DEFAULT_LAYOUT[tab], panelCallbacks[tab]),
      );
      el.querySelector('.fp-close')?.addEventListener('click', () => this.closeTab(tab));
    });

    document.querySelectorAll('[data-fusion-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = (btn as HTMLElement).dataset.fusionTab as FusionTab;
        // Nur Ribbon wechseln — Panel erst bei expliziter Funktion (data-open-panel).
        this.selectTab(tab, false);
      });
    });

    document.querySelectorAll('[data-open-panel]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = (btn as HTMLElement).dataset.openPanel as FusionTab;
        if (!tab || !TAB_PANEL[tab]) return;
        this.openTab(tab);
      });
    });
  }

  get active() {
    return this.activeTab;
  }

  selectTab(tab: FusionTab, togglePanel = false) {
    this.activeTab = tab;
    this.onTabSelect?.(tab);
    document.querySelectorAll('[data-fusion-tab]').forEach((btn) => {
      btn.classList.toggle('active', (btn as HTMLElement).dataset.fusionTab === tab);
    });
    document.querySelectorAll('[data-ribbon]').forEach((ribbon) => {
      ribbon.classList.toggle('hidden', (ribbon as HTMLElement).dataset.ribbon !== tab);
    });

    if (togglePanel) {
      const panel = this.panels.get(tab)!;
      panel.toggle();
      if (panel.isOpen) panel.bringToFront();
    }
  }

  openTab(tab: FusionTab) {
    this.selectTab(tab, false);
    const panel = this.panels.get(tab)!;
    panel.open();
    panel.bringToFront();
  }

  closeTab(tab: FusionTab) {
    this.panels.get(tab)?.close();
  }

  isOpen(tab: FusionTab) {
    return this.panels.get(tab)?.isOpen ?? false;
  }

  closeAll() {
    this.panels.forEach((p) => p.close());
  }

  openAlignPanel() {
    this.openTab('align');
  }
}