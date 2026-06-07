export interface FloatingPanelCallbacks {
  onOpen?: () => void;
  onClose?: () => void;
}

export interface FloatingPanelDefault {
  x: number;
  y: number;
  w?: number;
  h?: number;
}

type ResizeMode = 'se' | 's' | 'e';

const MIN_W = 240;
const MIN_H = 160;

export class FloatingPanel {
  private dragging = false;
  private resizing = false;
  private resizeMode: ResizeMode = 'se';
  private dragX = 0;
  private dragY = 0;
  private panelX: number;
  private panelY: number;
  private panelW: number;
  private panelH: number;
  private resizeStartW = 0;
  private resizeStartH = 0;

  constructor(
    private readonly host: HTMLElement,
    readonly panel: HTMLElement,
    private readonly storageKey: string,
    defaults: FloatingPanelDefault,
    private callbacks: FloatingPanelCallbacks = {},
  ) {
    this.panelX = defaults.x;
    this.panelY = defaults.y;
    this.panelW = defaults.w ?? 320;
    this.panelH = defaults.h ?? 380;

    this.ensureResizeHandles();
    this.restoreLayout(defaults);

    const handle = panel.querySelector('[data-drag-handle]') as HTMLElement | null;
    if (handle) this.bindDrag(handle);
    this.bindResize();

    window.addEventListener('resize', () => this.clampAndApply());
  }

  get isOpen() {
    return !this.panel.classList.contains('hidden');
  }

  open() {
    if (this.isOpen) return;
    this.panel.classList.remove('hidden');
    this.clampAndApply();
    this.callbacks.onOpen?.();
  }

  close() {
    if (!this.isOpen) return;
    this.panel.classList.add('hidden');
    this.callbacks.onClose?.();
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  bringToFront() {
    this.panel.style.zIndex = '20';
  }

  private ensureResizeHandles() {
    if (this.panel.querySelector('[data-resize]')) return;
    const south = document.createElement('div');
    south.className = 'fp-resize fp-resize-s';
    south.dataset.resize = 's';
    south.title = 'Höhe ziehen';
    const east = document.createElement('div');
    east.className = 'fp-resize fp-resize-e';
    east.dataset.resize = 'e';
    east.title = 'Breite ziehen';
    const corner = document.createElement('div');
    corner.className = 'fp-resize fp-resize-se';
    corner.dataset.resize = 'se';
    corner.title = 'Größe ziehen';
    this.panel.append(south, east, corner);
  }

  private bindDrag(handle: HTMLElement) {
    handle.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      this.dragging = true;
      this.dragX = e.clientX;
      this.dragY = e.clientY;
      const rect = this.panel.getBoundingClientRect();
      const hostRect = this.host.getBoundingClientRect();
      this.panelX = rect.left - hostRect.left;
      this.panelY = rect.top - hostRect.top;
      handle.setPointerCapture(e.pointerId);
      this.panel.style.zIndex = '20';
      e.preventDefault();
    });

    handle.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      this.panelX += e.clientX - this.dragX;
      this.panelY += e.clientY - this.dragY;
      this.dragX = e.clientX;
      this.dragY = e.clientY;
      this.clampAndApply();
    });

    const endDrag = (e: PointerEvent) => {
      if (!this.dragging) return;
      this.dragging = false;
      handle.releasePointerCapture(e.pointerId);
      this.panel.style.zIndex = '';
      this.saveLayout();
    };
    handle.addEventListener('pointerup', endDrag);
    handle.addEventListener('pointercancel', endDrag);
  }

  private bindResize() {
    this.panel.querySelectorAll<HTMLElement>('[data-resize]').forEach((el) => {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.resizing = true;
        this.resizeMode = (el.dataset.resize as ResizeMode) || 'se';
        this.dragX = e.clientX;
        this.dragY = e.clientY;
        this.resizeStartW = this.panelW;
        this.resizeStartH = this.panelH;
        el.setPointerCapture(e.pointerId);
        this.panel.style.zIndex = '20';
      });

      el.addEventListener('pointermove', (e) => {
        if (!this.resizing) return;
        const dx = e.clientX - this.dragX;
        const dy = e.clientY - this.dragY;
        if (this.resizeMode === 'se' || this.resizeMode === 'e') {
          this.panelW = this.resizeStartW + dx;
        }
        if (this.resizeMode === 'se' || this.resizeMode === 's') {
          this.panelH = this.resizeStartH + dy;
        }
        this.clampAndApply();
      });

      const endResize = (e: PointerEvent) => {
        if (!this.resizing) return;
        this.resizing = false;
        el.releasePointerCapture(e.pointerId);
        this.panel.style.zIndex = '';
        this.saveLayout();
      };
      el.addEventListener('pointerup', endResize);
      el.addEventListener('pointercancel', endResize);
    });
  }

  private restoreLayout(fallback: FloatingPanelDefault) {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) {
        const data = JSON.parse(raw) as { x: number; y: number; w?: number; h?: number };
        this.panelX = data.x;
        this.panelY = data.y;
        if (data.w) this.panelW = data.w;
        if (data.h) this.panelH = data.h;
        this.applyLayout();
        return;
      }
    } catch {
      /* defaults */
    }
    this.panelX = fallback.x;
    this.panelY = fallback.y;
    this.panelW = fallback.w ?? this.panelW;
    this.panelH = fallback.h ?? this.panelH;
    this.applyLayout();
  }

  private saveLayout() {
    localStorage.setItem(
      this.storageKey,
      JSON.stringify({ x: this.panelX, y: this.panelY, w: this.panelW, h: this.panelH }),
    );
  }

  private maxSize() {
    const hostRect = this.host.getBoundingClientRect();
    const pad = 8;
    return {
      w: hostRect.width - pad * 2,
      h: hostRect.height - pad * 2,
    };
  }

  private clampAndApply() {
    const max = this.maxSize();
    this.panelW = Math.min(Math.max(MIN_W, this.panelW), max.w);
    this.panelH = Math.min(Math.max(MIN_H, this.panelH), max.h);

    const hostRect = this.host.getBoundingClientRect();
    const pad = 8;
    this.panelX = Math.min(Math.max(pad, this.panelX), hostRect.width - this.panelW - pad);
    this.panelY = Math.min(Math.max(pad, this.panelY), hostRect.height - this.panelH - pad);
    this.applyLayout();
  }

  private applyLayout() {
    this.panel.style.left = `${this.panelX}px`;
    this.panel.style.top = `${this.panelY}px`;
    this.panel.style.width = `${this.panelW}px`;
    this.panel.style.height = `${this.panelH}px`;
    this.panel.classList.add('fp-sized');
  }
}