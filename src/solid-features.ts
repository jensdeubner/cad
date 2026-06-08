/**
 * Fusion Solid ribbon — only routes to implemented operations.
 */
import { t } from './i18n';

export type SolidFeatureId =
  | 'extrude'
  | 'revolve'
  | 'loft'
  | 'press-pull'
  | 'split-body'
  | 'rect-pattern'
  | 'circ-pattern'
  | 'mirror'
  | 'join'
  | 'subtract';

export type SolidFeatureHost = {
  setStatus: (msg: string) => void;
  selectTab: (tab: 'solid' | 'body' | 'contours') => void;
  setTool: (tool: 'press-pull' | 'move-body' | 'navigate') => void;
  triggerExtrude: () => void;
  triggerRevolve: () => void;
  triggerLoft: () => void;
  triggerSplitBody: () => void;
  triggerRectPattern: () => void;
  triggerCircPattern: () => void;
  triggerMirror: () => void;
  triggerJoin: () => void;
  triggerSubtract: () => void;
};

export function solidFeatureLabel(id: SolidFeatureId): string {
  return t(`solid.${id}`);
}

export type LoftContourPayload = {
  axis: string;
  position: number;
  points: [number, number, number][];
  closed: boolean;
  full_3d: boolean;
};

export function buildExtrudePayload(
  base: LoftContourPayload,
  distanceMm: number,
): { contours: LoftContourPayload[]; closed_ends: boolean } {
  return {
    contours: [base, { ...base, position: base.position + distanceMm }],
    closed_ends: true,
  };
}

export function runSolidFeature(id: SolidFeatureId, host: SolidFeatureHost) {
  host.selectTab('solid');

  switch (id) {
    case 'extrude':
      host.triggerExtrude();
      break;
    case 'revolve':
      host.triggerRevolve();
      break;
    case 'loft':
      host.triggerLoft();
      break;
    case 'press-pull':
      host.selectTab('body');
      host.setTool('press-pull');
      host.setStatus(t('status.solidPressPull'));
      break;
    case 'split-body':
      host.triggerSplitBody();
      break;
    case 'rect-pattern':
      host.triggerRectPattern();
      break;
    case 'circ-pattern':
      host.triggerCircPattern();
      break;
    case 'mirror':
      host.triggerMirror();
      break;
    case 'join':
      host.triggerJoin();
      break;
    case 'subtract':
      host.triggerSubtract();
      break;
    default:
      break;
  }
}

export function bindSolidFeatureButtons(host: SolidFeatureHost) {
  document.querySelectorAll<HTMLElement>('[data-solid-feature]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.solidFeature as SolidFeatureId;
      if (id) runSolidFeature(id, host);
    });
  });
}

export const WORKING_SOLID_FEATURES: SolidFeatureId[] = [
  'extrude',
  'revolve',
  'loft',
  'press-pull',
  'split-body',
  'rect-pattern',
  'circ-pattern',
  'mirror',
  'join',
  'subtract',
];