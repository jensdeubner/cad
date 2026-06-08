/**
 * Semantic origin of a body mesh — drives browser badges and subtract eligibility.
 */
import type { CadBodyRecord } from './cad-scene';

export type BodyKind = 'scan' | 'solid' | 'loft';

export function inferBodyKindFromLabel(label: string): BodyKind {
  const lower = label.toLowerCase();
  if (lower.includes('negativform') || lower === 'loft') return 'loft';
  if (
    lower.includes('extrusion') ||
    lower.includes('rotation') ||
    lower.includes('revolve') ||
    lower.includes('vereinigt') ||
    lower.includes('join') ||
    lower.includes('festkörper')
  ) {
    return 'solid';
  }
  return 'scan';
}

export function assignBodyKind(body: CadBodyRecord, kind: BodyKind): void {
  body.bodyKind = kind;
}

export function bodyKindBadgeKey(kind: BodyKind, label: string): string {
  if (kind === 'loft' && label.toLowerCase().includes('negativform')) {
    return 'browser.bodyKind.loftNegativform';
  }
  return `browser.bodyKind.${kind}`;
}