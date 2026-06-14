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

## Bekannte Grenzen (bewusst)

- Bemaßungs-Overlays (`SketchDimension`) verfolgen Punktbewegungen durch den Solver erst beim nächsten
  Rebuild — wie bisher schon beim Punkt-Drag.
- Constraints sind nicht „driven" rückgekoppelt in die Bemaßungswerte; beide Systeme koexistieren.
- Nächster Schritt optional #30: parametrisches Timeline-Replay.
