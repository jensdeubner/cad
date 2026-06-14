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

**On-Demand-Pfad** (`main.ts`): `recomputeBodyFromRecipe(bodyId)` verdrahtet die Engine mit Live-
Konturen + echten WASM-Ops und ersetzt die Body-Geometrie via `replaceBodyGeometryFull`. Test-Bridge:
`__cadDebug.recomputeBody` (+ test-only `testExtrudeContour`/`setExtrudeRecipeDistance`).

**Persistenz + Undo:** `featureRecipes` durchgefädelt analog `sketchConstraints` — `.stpr`
`PROJECT_VERSION` 7→**8** (`migrateV8` + `ensureFeatureRecipes`-Defaulter; alle Altversionen
migrieren über die Kette und bekommen `featureRecipes: []`), `buildProjectMeta`/`parseProjectMeta`,
sowie `AppSnapshot`/`captureSnapshot`/`snapshotNow`/`pushMeshUndo`/`restoreSnapshot` + alle Reset-Pfade.

## Recomputebar / nicht

- **Recomputebar:** extrude, revolve, loft (skizzen-quellen-basiert, ein klares Rezept).
- **(Noch) nicht:** subtract/join/mirror/pattern (mutierend/duplizierend — kein Ein-Quellen-Rezept,
  „ein Feature == ein Body" gilt nicht), intersect/sweep (kein WASM-Kernel vorhanden).

## Verifikation

`npm run typecheck` 0 · `npm run test` **1230** vitest (inkl. `feature-recipe`, `feature-recompute`,
`feature-recipe-persist`) · `npm run build` ok · `recompute.spec.ts` grün am echten Kernel
(extrude 10 mm → Rezept erfasst → Distanz 30 mm → recompute → Z-Ausdehnung 10→30). Voll-E2E:
88/89 pro Lauf; der je **wechselnde** eine Fehlschlag (edge-display / timeline / views — von Phase 2
unberührte Features) ist last-induzierte Flakiness und besteht **isoliert 10/10 grün**.

## Bekannte Grenzen / Nächster Schritt

- **Recompute ist On-Demand**, noch kein Auto-Trigger. **INC3** (Folge-Inkrement):
  `solveActiveSketchConstraints` + Bemaßungs-Edit (`applyPendingValue`) hängen sich über
  `recipesForContour` an `recomputeBodyFromRecipe` der abhängigen Bodies → *live*-parametrisch;
  plus Timeline-Chip-Edit-UI (Parameter editieren → Downstream-Recompute).
- Rezept-Quell-id-Stabilität bei strukturellen Kontur-Edits (Punkt-Insert/Delete, Kontur-Löschung):
  das Rezept referenziert die Kontur-id (stabil); bei gelöschter Quell-Kontur liefert Recompute
  sauber `missing-contour`.
- `RevolveRecipe.segments` ist heute konstant 48 (Vorhalt für künftige Konfigurierbarkeit;
  `buildRevolvePayload` setzt 48 fest, der Wert wird beim Recompute noch nicht gelesen).
- Body-Löschen entfernt das zugehörige Rezept (noch) nicht — verwaiste Rezepte sind harmlos
  (`recipeForBody` matcht per `bodyId`); sauberes Prunen ist Folgearbeit.

> Hinweis (in der Review bestätigt): Recompute durchläuft denselben Finalisierungs-Pfad wie die
> Erzeugung — `replaceBodyGeometryFull` → STL-Roundtrip → `buildScanMesh`/`centerGeometry`. Die
> Geometrie ist also identisch zentriert; es gibt **keine** Create-vs-Recompute-Abweichung.
