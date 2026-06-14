# Umgesetzt: #30 Parametrische Timeline — Phase 2 (echtes Recompute) (2026-06-14)

Fortsetzung von `docs/IMPLEMENTED-30-TIMELINE-2026-06-14.md` (Phase 1 = Rollback/Suppression).
Phase 2 liefert den **parametrischen Kern**: körper-erzeugende Features speichern ein
**re-ausführbares Rezept**, das gegen den **aktuellen** Skizzenzustand neu berechnet werden kann.
Vorgehen: kleine, je vollständig getestete Inkremente (selbst, koordiniert — nicht parallelisiert),
nach jedem die Gates grün. Abschluss: adversariale Review des Diffs.

## Inkremente

| Inkrement | Inhalt | Dateien |
|---|---|---|
| **INC1a** | Pures Rezept-Modell (diskriminierte Union extrude/revolve/loft) + Array-Helpers | `src/feature-recipe.ts` |
| **INC1b** | Rezept-**Erfassung** beim Commit | command-Module + `main.ts` |
| **INC1c** | **Persistenz** (.stpr v7→v8) + Undo-Threading | `project-file.ts`, `undo.ts`, `main.ts` |
| **INC2a** | Pure **Recompute-Engine** (Rezept + Live-Sketch → Geometrie) | `src/feature-recompute.ts` |
| **INC2b** | On-Demand-Recompute-Pfad + realer WASM-E2E-Beweis | `main.ts` + E2E |
| **INC3a** | **Auto-Recompute** bei Sketch-Edit (Abhängigkeits-Trigger) + Undo-Re-Derive + Politur (Prune/`segments`) | `main.ts`, `dimensions.ts`, `solid-revolve.ts`, `feature-recompute.ts` |
| **INC3b** | **Timeline-Chip-Parameter-Edit** (✎ → Prompt → Recompute) | `feature-timeline.ts`, `main.ts`, i18n |

## Architektur

**Rezept-Modell** (`feature-recipe.ts`, rein): `FeatureRecipe` =
`ExtrudeRecipe {sourceContourIds, distanceMm} | RevolveRecipe {…, axis, angleDeg, segments} |
LoftRecipe {sourceContourIds[], closedEnds}`, je mit `id` (`recipe:<bodyId>`) + `bodyId`. Die
Quell-Kontur wird als **Live-Referenz (id)** gespeichert, nicht als eingefrorener Punkt-Snapshot —
genau das ermöglicht das Nachverfolgen von Sketch-Edits. Helpers: `cloneFeatureRecipe`,
`recipeForBody`, `withRecipe` (Upsert je Body), `withoutBodyRecipe`, `recipesForContour`
(Abhängigkeits-Lookup für INC3).

**Erfassung** (Seam): Die command-Module (`solid-extrude/revolve/loft.ts`) reichen die gepickte(n)
Kontur-id(s) durch die `commitX`-Callbacks (Capture **vor** `resetState()`). `promoteMeshToNewBody`
nimmt ein optionales `makeRecipe(bodyId)` und legt das Rezept direkt neben `recordSolidFeature` ab
(dort ist die neue `bodyId` bekannt). Bewusst **nicht** erfasst: Spacing-Drag-Loft (1 Profil,
`sourceContourIds.length < 2`) und Negativform-Loft.

**Recompute-Engine** (`feature-recompute.ts`, rein, DI): `recomputeFeature(recipe, deps)` löst die
Kontur-ids gegen den Live-Zustand auf, baut über `contourLoftPayload` (entscheidet `full_3d`) +
die vorhandenen `build{Extrude,Revolve,LoftContours}Payload`-Encoder die WASM-Anfrage, ruft die
**injizierte** Op (`loft_contours_json`/`revolve_contour_json`) in try/catch, und gibt Status
`ok | missing-contour | op-failed | empty` + `BufferGeometry` zurück. WASM-Ops **werfen** im Fehlerfall
(und loft/revolve können leer ohne Wurf zurückkehren) → beides wird abgefangen.

**On-Demand-Pfad** (`main.ts`): `recomputeBodyFromRecipe(bodyId, {pushUndo?})` verdrahtet die Engine
mit Live-Konturen + echten WASM-Ops und ersetzt die Body-Geometrie via `replaceBodyGeometryFull`.
Test-Bridge: `__cadDebug.recomputeBody` (+ test-only `testExtrudeContour`/`setExtrudeRecipeDistance`).

**Auto-Recompute (INC3a):** Ein Sketch-Edit berechnet abhängige Recipe-Bodies automatisch neu.
`solveActiveSketchConstraints` (deckt Punkt-Drag/Löschen/Constraint ab) ruft unbedingt
`recomputeDependentsForContours(aktive-Sketch-Konturen)`; Bemaßungswert-Edits feuern über einen neuen
`onContourGeometryEdited`-Host-Hook in `applyPendingValue`. Beide nutzen `recipesForContour` →
`recomputeBodyFromRecipe(…, {pushUndo:false})`. **Undo/Redo-Konsistenz:** `restoreSnapshot` re-derived
Recipe-Bodies, deren Mesh *nicht* explizit wiederhergestellt wurde (parametrischer Sketch-Undo) —
Bodies mit wiederhergestelltem Mesh (direkte Mesh-Edits) bleiben unangetastet. So matcht jeder Body
nach Undo/Redo seine wiederhergestellte Kontur, ohne direkte Mesh-Edits zu überschreiben.
Auto-Recompute ist fire-and-forget; ein `recomputeEpoch` (hochgezählt bei restore/load/clear)
verwirft in-flight Recomputes, die nach einem State-Restore auflösen — sie überschreiben damit
keine neuere Geometrie (schließt das Race „Drag-Ende → sofort Undo").

**Timeline-Edit (INC3b):** Jeder extrude/revolve-Chip trägt einen ✎-Button (separat vom
Chip-Klick=Rollback, `stopPropagation`). Klick → `parsePromptFloat` für Distanz/Winkel →
`applyRecipeParamEdit` (Recipe-Update via `withRecipe` + Recompute als **ein** Mesh-Undo-Schritt).
loft hat keinen Einzel-Skalar → kein ✎ (loft folgt dem Sketch-Auto-Trigger).

**Persistenz + Undo:** `featureRecipes` durchgefädelt analog `sketchConstraints` — `.stpr`
`PROJECT_VERSION` 7→**8** (`migrateV8` + `ensureFeatureRecipes`-Defaulter; alle Altversionen
migrieren über die Kette und bekommen `featureRecipes: []`), `buildProjectMeta`/`parseProjectMeta`,
sowie `AppSnapshot`/`captureSnapshot`/`snapshotNow`/`pushMeshUndo`/`restoreSnapshot` + alle Reset-Pfade.

## Recomputebar / nicht

- **Recomputebar:** extrude, revolve, loft (skizzen-quellen-basiert, ein klares Rezept).
- **(Noch) nicht:** subtract/join/mirror/pattern (mutierend/duplizierend — kein Ein-Quellen-Rezept,
  „ein Feature == ein Body" gilt nicht), intersect/sweep (kein WASM-Kernel vorhanden).

## Verifikation

`npm run typecheck` 0 · `npm run test` **1236** vitest (inkl. `feature-recipe`, `feature-recompute`,
`feature-recipe-persist`) · `npm run build` ok · Voll-E2E **91/91 grün** (sauberer Lauf, 0 Fehlschläge).
Drei reale-WASM-E2E beweisen den parametrischen Kern: `recompute.spec` (extrude 10 mm → Distanz 30 mm →
recompute → Z-Ausdehnung 10→30), `recompute-auto.spec` (Quell-Konturpunkt verschoben → abhängiger Body
wird automatisch breiter), `timeline-edit.spec` (✎-Button → Prompt → Recompute, Bridge- + UI-Pfad).
(Hinweis: unter starker paralleler CPU-Last flaken vereinzelt von Phase 2 **unberührte** Specs —
edge-display/timeline/views —, die isoliert grün sind; im lastfreien Lauf ist die Suite vollständig grün.)

## Bekannte Grenzen

- **Recomputebar bleibt extrude/revolve/loft.** subtract/join/mirror/pattern (mutierend/
  duplizierend) und intersect/sweep (kein WASM-Kernel) sind nicht parametrisch — bewusst out-of-scope.
- Rezept-Quell-id-Stabilität bei strukturellen Kontur-Edits: das Rezept referenziert die Kontur-id
  (stabil); bei gelöschter Quell-Kontur liefert Recompute sauber `missing-contour`. Body-Löschen
  entfernt das Rezept (`withoutBodyRecipe`).
- Recompute überschreibt direkte Mesh-Edits eines Recipe-Bodies (parametrisch gewinnt); bei einem
  Mesh-Edit-**Undo** bleibt das wiederhergestellte Mesh aber erhalten (kein Re-Derive).
- Loft-Profil-Reihenfolge/-Anzahl ist über die Quell-Konturen fixiert; ein UI zum Umordnen/Ergänzen
  von Loft-Profilen ist Folgearbeit. `RevolveRecipe.segments` wird beim Recompute honoriert (heute
  konstant 48, da keine UI es ändert).

> Hinweis (in der Review bestätigt): Recompute durchläuft denselben Finalisierungs-Pfad wie die
> Erzeugung — `replaceBodyGeometryFull` → STL-Roundtrip → `buildScanMesh`/`centerGeometry`. Die
> Geometrie ist also identisch zentriert; es gibt **keine** Create-vs-Recompute-Abweichung.
