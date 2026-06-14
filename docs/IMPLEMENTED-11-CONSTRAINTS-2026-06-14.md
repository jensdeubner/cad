# Umgesetzt: #11 Sketch-Constraint-Solver LIVE in der Skizze (2026-06-14)

Fortsetzung von `docs/IMPLEMENTED-2026-06-14.md`. Der in Phase 1 gebaute und unit-getestete
2D-Constraint-Solver (`src/sketch/constraints.ts` + `src/sketch/solver.ts`) ist jetzt **live in die
Skizzen-UI verdrahtet**: Constraints zwischen Skizzenpunkten setzen → Auto-Solve → Persistenz → Undo.

Vorgehen: drei kleine, je vollständig getestete Inkremente am Sketch-Kern (kein naives Parallelisieren),
nach jedem die vier Gates grün. Abschluss: eine adversariale Multi-Agent-Review des Diffs (4 Dimensionen ×
unabhängige Refutation) → die echten Funde gefixt.

## Inkremente

**INC1 — reines Modell + Binding** (`src/sketch/sketch-constraints.ts`)
`SketchConstraint` referenziert Punkte über `(contourId, pointIndex)` — analog zu `SketchDimension`.
`solveSketchConstraints(contours, constraints)` projiziert die referenzierten Konturpunkte über **ein
gemeinsames Skizzen-Frame** ins 2D, ruft den vorhandenen Levenberg-Marquardt-Solver auf und schreibt die
Lösung per `Vector3.copy` in die Konturpunkte zurück. Rein, ohne DOM/Scene; unit-getestet.

**INC2 — Persistenz + Undo**
`.stpr` `PROJECT_VERSION` 6 → **7** mit Migration (`migrateV6 → migrateV7`, alte Projekte erhalten
`sketchConstraints: []`). `ProjectSketchConstraint` in `project-file.ts`, `buildProjectMeta`/`parseProjectMeta`.
`sketchConstraints` durch `AppSnapshot`/`captureSnapshot` (undo.ts) und durch `main.ts`
(`snapshotNow`, `pushMeshUndo`, `restoreSnapshot`, Save/Load, alle Reset-Pfade) gefädelt.

**INC3 — interaktives Tool**
`src/sketch-mode/constraints.ts` (`createSketchConstraintApi(host)`, Muster wie der Bemaßungs-Tool).
Neues Werkzeug `sketch-constraint` (Tool-Union, Ribbon-Button, Workspace-Gating, `data-sketch-active-only`).
Zwangsart-Selector + optionaler Abstandswert im Skizzen-Panel; Punkt-Picking (`pickSketchPoint`,
Screen-Space, ≤ 18 px) sammelt 1/2/4 Punkte je nach Art, dann **Auto-Solve + Neuzeichnen**. Zusätzlich
löst die aktive Skizze nach jedem Punkt-Edit (Drag-Ende) neu. DE+EN-i18n (Paritäts-Test grün). Test-Bridge
(`window.__cadDebug`: `addSketchConstraint`, `contourPointAt`, `beginSketchOnAxis`, `addSketchContourUV`,
`pointScreenAt`, `sketchConstraintCount`, `deleteLastSketchConstraint`, `solveActiveSketch`).

## Constraint-Arten

coincident · horizontal · vertical · parallel · perpendicular · distance (mm) · fix — alle über die
vorhandenen Residuen des Solvers, einheitlich. `fix` pinnt auf die 2D-Position bei Erstellung.

## Adversariale Review — verifizierte Funde gefixt

- **Punktindex-Korruption (Blocker):** Löschen/Einfügen von Konturpunkten ließ Constraint-Indizes veralten.
  Neu: `remapConstraintsAfterPointDelete` / `…Insert` an allen `deletePoint`/`insertPoint`-Aufrufstellen.
- **Verwaiste Constraints + Pick-Marker (Major):** Konturlöschung räumt jetzt referenzierende Constraints
  per `dropConstraintsForContour` ab und leert die laufende Punkt-Auswahl.
- **Cross-Plane (Major):** der Solver projiziert nun über ein einziges Referenz-Frame und überspringt
  Referenzen aus Konturen anderer Ebene (robust gegen korrupte/programmatische Eingaben).
- **`distance` ohne Wert (Minor):** wird übersprungen statt auf 0 (= coincident) zu kollabieren.
- **NaN-Guard (Minor):** nicht-finite Punkte/`fix`-Ziele werden übersprungen.
- **`closeActiveSketch`-Cleanup (Minor):** leert Pending-Picks + Constraint-Liste beim Schließen der Skizze.

Bewusst **nicht** geändert (korrekt als Nicht-Themen eingestuft): `ensureBodyKinds`-Versionssetzung
(vorbestehend, durch bestehende Migrations-Tests abgedeckt); GPU-Dispose in `clearPickVisual` (bereits
korrekt — flache Mesh-Kinder, Geometrie+Material disposed); statische Dropdown-Option-Labels (konsistent
mit dem vorhandenen `sketch-dim-kind`-Muster).

## Verifikation (alle grün)

`npm run typecheck` · `npm run test` (**1093** vitest) · `npm run build` · `E2E_PORT=5180 npx playwright test`
(**63** Playwright, DE+EN, 0 Konsolenfehler). Neue Tests: `test/unit/sketch-constraints.test.ts`,
`test/unit/sketch-constraint-tool.test.ts`, erweiterte `project-file.test.ts` / `cad-scene-undo.test.ts` /
`workspace-tools.test.ts` / `app-util.test.ts`, E2E `test/e2e/sketch-constraints.spec.ts`.

## Visuelle Vollendung (Glyphen · Bestimmtheits-Indikator · Auswahl/Löschen)

Aufbauend auf der Live-Verdrahtung wurde #11 visuell „rund" gemacht (`src/sketch-mode/constraint-glyphs.ts`):

- **Constraint-Glyphen:** pixelgroße Badge-Sprites an der Geometrie (H · V · ∥ · ⊥ · ⊙ koinzident ·
  ⚓ fix · Abstandswert), kamerabezogen skaliert im Render-Loop, kolokierte Badges werden auseinander­
  gerückt. `computeGlyphAnchors()` ist rein (positionslogik unit-getestet); der Sprite-Bau läuft im E2E.
- **Bestimmtheits-Indikator:** `sketchDegreesOfFreedom()` schätzt Freiheitsgrade (2·Punkte − Residuen­
  gleichungen gültiger Zwänge) → „unterbestimmt (n FG) / vollständig bestimmt / überbestimmt", farbig im
  Skizzen-Panel. Heuristik (kein Rang/Redundanz-Check), bewusst als Schätzung dokumentiert.
- **Auswahl + Löschen im Viewport:** Glyph anklicken (im Zwang-Werkzeug) wählt den Zwang aus (Highlight),
  Entf/Backspace löscht ihn. `pickConstraintGlyphAt()` (Screen-Space) unit-getestet.

Der Glyph-Overlay wird konsistent neu aufgebaut bei: Solve, Add/Delete, Punkt-Insert/Delete, Kontur-
Löschung, Skizze öffnen/wechseln/schließen, Restore/Load/Alles-Löschen. Eine zweite adversariale Review
(15 bestätigt / 3 widerlegt) deckte fehlende Rebuilds auf den Insert-, Kontur-Lösch- und Sketch-Wechsel-
Pfaden auf — alle gefixt und mit E2E (Kontur-Löschung, Sketch-Wechsel, Glyph-Select+Delete) abgesichert.

## Abschließender Politur-Schub

- **Zwangsart-Dropdown lokalisiert** (DE/EN) über `applySketchConstraintKindOptions` (`src/i18n/dom.ts`),
  spiegelt das `sketch-dim-kind`-Muster — EN-Nutzer sehen keine statisch-deutschen Labels mehr.
- **Bemaßungen folgen dem Solver:** `syncDimensionsToContours` (rein, unit-getestet) führt lineare Maße
  ihren Endpunkt-Indizes und Radius/Durchmesser dem neu berechneten Kreis nach; im Solve-Pfad vor dem
  Neuzeichnen aufgerufen. Damit ist die zuvor dokumentierte Grenze (stale Maße) geschlossen.
- **E2E gehärtet:** flaky `pattern-circular` pollt jetzt `triangleCount` statt sofort zu asserten;
  neue Specs für Dim-Folgt-Solver, Sketch-Wechsel, Kontur-Löschung und Glyph-Select/Delete.

Verifikation (final): typecheck 0 · vitest **1113** · build ok · Playwright **67/67 zweimal in Folge**
(DE+EN, 0 Konsolenfehler). Zwei adversariale Review-Runden; alle echten Funde gefixt, letzte Runde 0 Funde.

## Bekannte Grenzen (bewusst)

- Bemaßungs-Overlays folgen jetzt dem Solver (siehe Politur-Schub); der DOF-Indikator bleibt eine
  Zählheuristik ohne Rang-/Redundanz-Analyse.
- Constraints sind nicht „driven" rückgekoppelt in die Bemaßungswerte; beide Systeme koexistieren.
- Nächster Schritt optional #30: parametrisches Timeline-Replay.
