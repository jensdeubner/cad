/**
 * Application-wide constants: colors, tool hints, alignment steps, theme defaults.
 */
import { t } from '../i18n';
import type { ScanDisplayMode } from '../scan-visual';
import type { Tool } from '../types';

/** Contour stroke palette — cycles by contour index. */
export const CONTOUR_COLORS = [
  '#ffb347',
  '#4da3ff',
  '#7dffb3',
  '#ff6b9d',
  '#c9a0ff',
  '#fff07d',
] as const;

export const HIT_POINT_COLOR = '#ffff00';
export const MISS_POINT_COLOR = '#4a5568';
export const HIT_LINE_COLOR = '#ff00cc';
export const HIT_MARKER_COLOR = 0xffee00;
export const START_POINT_COLOR = '#ff44ff';
export const START_SNAP_COLOR = '#00ff88';
export const CLOSED_LINE_COLOR = '#00e676';

export const SOLID_BODY_COLOR = 0xc8ccd4;

/** Nudge step for alignment spinners (mm / degrees). */
export const ALIGN_POS_STEP = 1;
export const ALIGN_ROT_STEP = 1;

/** Status-bar hints shown when switching tools. */
export function getToolHint(tool: Tool): string {
  return t(`toolHint.${tool}`);
}

export function getScanModeLabel(mode: ScanDisplayMode): string {
  return t(`scanMode.${mode}`);
}