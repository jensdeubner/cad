/**
 * Application-wide constants: colors, tool hints, alignment steps, theme defaults.
 * Keep UI copy (German) and numeric tuning values here — not in main.ts.
 */
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

export const SOLID_BODY_COLOR = 0xe8ecf4;

/** Nudge step for alignment spinners (mm / degrees). */
export const ALIGN_POS_STEP = 1;
export const ALIGN_ROT_STEP = 1;

/** Status-bar hints shown when switching tools. */
export const TOOL_HINTS: Record<Tool, string> = {
  navigate: 'Navigieren: Links drehen · Mausrad zoomen · Mitte schieben · Rechtsklick = Menü',
  align: 'Ausrichten: Gizmo an Komponente — Achsen greifen · G = Verschieben · R = Drehen',
  'move-body':
    'Bewegen: Körper anklicken · Gizmo ziehen · G = Verschieben · R = Drehen · W = Welt/Lokal',
  'scale-body':
    'Skalieren: Körper anklicken · Gizmo-Griffe ziehen · S = Skalieren · Enter = in Mesh einbacken',
  'press-pull': 'Press Pull: Fläche anklicken & ziehen — rausziehen oder reindrücken',
  'smooth-body': 'Glätten: gedrückt halten & über Zacken/Kanten fahren — Übergänge weicher machen',
  'smooth-section':
    'Sektion: 1× auf Übergang klicken (Band setzen), dann gedrückt halten & pinseln — z. B. 5 mm zwischen Kurven',
  'sketch-pick': 'Skizze: XY / XZ / YZ Ursprungsebene im 3D-Fenster anklicken — dann zeichnen',
  'sketch-line': 'Linie: Startpunkt setzen & ziehen — am Raster / Skizzenmittelpunkt einrasten',
  'sketch-circle': 'Kreis: Mittelpunkt setzen & Radius ziehen — Mittelpunkt als Anker nutzbar',
  'sketch-arc': 'Bogen: 3 Punkte — Start, Verlauf, Ende',
  'sketch-rect': 'Rechteck: Ecke setzen & diagonal ziehen',
  'sketch-triangle': 'Dreieck: 3 Ecken anklicken',
  'sketch-dim':
    'Bemaßung (D): Kante klicken → Maßlinie ziehen → Wert erscheint an der Linie · eingeben · Enter · Doppelklick auf Maßzahl = bearbeiten',
  polyline: 'Linie: Im 3D-Fenster klicken = Punkt setzen · „Profil speichern“',
  freehand: 'Freihand: Maus gedrückt halten und ziehen · loslassen = fertig',
  lasso: 'Lasso: Maus gedrückt halten, Umriss ziehen, loslassen',
  edit: 'Bearbeiten: Kontur wählen · Punkt ziehen (in ihrer Ebene) · Rechtsklick → Kurve · blaue Griffe auch aus der Ebene = 3D-Bogen',
};

export const SCAN_MODE_LABELS: Record<ScanDisplayMode, string> = {
  cad: 'CAD hell (Kanten)',
  flaeche: 'Fläche + Kanten',
  kontrast: 'Farbkontrast',
  punkte: 'Geschlossene Flächen',
  dunkel: 'Dunkel',
};