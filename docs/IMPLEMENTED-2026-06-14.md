# Umgesetzt: Fusion-Parität via Parallel-Agenten (2026-06-14)

Ausführung des Plans aus `docs/PARALLEL-AGENTS-FUSION-PARITY.md` mit dem Backlog aus
`docs/FUSION-360-PARITY.md`. Ergebnis auf **`main`** (PR0 + **33 Features** in 4 Wellen + #16),
durchgängig grün: `typecheck`, `vitest` (**1053**), `npm run build`, und **60/60 Playwright-E2E**
über alle Features (DE+EN, null Konsolenfehler).

## PR0 — Feature-Registry-Seam (Fundament)

Neuer Entkopplungs-Seam, damit Features sich selbst registrieren statt `main.ts`/`index.html`/
`solid-features.ts` zu editieren:

- `src/features/{registry,host,mount,index}.ts` — `registerFeature()` / `getFeatures()`,
  `FeatureHost`-Vertrag, **Ribbon-Buttons werden zur Laufzeit aus der Registry gerendert**
  (mount erzeugt die `ribbon-group`-Slots im passenden Tab → `index.html` bleibt unangetastet).
- `window.__cadDebug` — read-only Test-Bridge (bodyCount/triangleCount/bbox/overlayCount/
  activeTool/lastFeature/features/status/runFeature) für harte E2E-Assertions.
- Playwright-Harness: `playwright.config.ts` (per `E2E_PORT` parametrisiert), `test/e2e/_helpers.ts`,
  Referenz-Spec. `npm run test:e2e`.
- Append-Marker: `// @i18n:append` (de/en), `// @features:append` (Barrel), `// @wasm:modules` /
  `// @wasm:exports` (lib.rs). `.gitattributes` `merge=union` für konfliktfreie Parallel-Integration.

## Gelieferte Features (16) → Backlog-Bezug

| Feature | Modul | Backlog (FUSION-360-PARITY.md) |
|---|---|---|
| Grundkörper Box/Zylinder/Kugel | `solid/primitives.ts` | #19 |
| Grundkörper Torus/Kegel/Pyramide | `solid/primitives-extra.ts` | #19 |
| 3D-Messen (Distanz + Schnellmaß) | `inspect/measure.ts` | #1 |
| Modell-Statistik (Vol/Fläche/BBox/Schwerpunkt) | `inspect/model-stats.ts` | #2 |
| Schwerpunkt-Marker + BBox | `inspect/com-marker.ts` | #2 (Center of Mass) |
| Boolean **Intersect** + Interferenz | `solid/intersect.ts` | #3, #24 |
| Reverse Normal (Mesh) | `mesh/reverse-normal.ts` | #6 |
| Mesh Reduce (Decimation) | `mesh/reduce.ts` | #20 |
| Weld / Make Closed | `mesh/weld.ts` | #22 |
| Sweep (Profil entlang Pfad) | `solid/sweep.ts` | #18 |
| Kreismuster um beliebige Achse | `solid/pattern-circular.ts` | #10 |
| Spiegeln über Ebene | `solid/mirror-plane.ts` | #9 |
| Konstruktionsachsen + Punkt | `construct/axis-point.ts` | #17 |
| Section Analysis (Schnittebene) | `inspect/section.ts` | #23 |
| Look At + Named Views | `nav/views.ts` | #5, #7 |
| Darstellungsstil (Wireframe-Toggle) | `render/visual-style.ts` | Visual Styles |
| OBJ-Export | `io/obj-export.ts` | #25 (Teil) |
| OBJ-Import (Sample) | `io/obj-import.ts` | #25 (Teil) |
| Körper duplizieren | `solid/duplicate.ts` | Move/Copy |
| Begrenzungsrahmen-Körper | `solid/bbox-body.ts` | Stock/BBox |
| Konvexe Hülle | `solid/convex-hull.ts` | Convex Hull |
| Maßstab (Faktor) | `solid/scale-factor.ts` | Scale |
| Sichtbarkeit umschalten | `view/visibility.ts` | #8 (Object Visibility) |
| Isolieren | `view/isolate.ts` | #8 (Isolate) |
| Kanten-Anzeige | `render/edge-display.ts` | Visual Styles (Edges) |
| Rechteckmuster (N×M) | `solid/pattern-rect.ts` | Rectangular Pattern |
| Mesh unterteilen (×4) | `mesh/subdivide.ts` | Mesh density |
| Laplace-Glättung | `mesh/smooth.ts` | Smooth (Mesh) |
| Auf Boden setzen | `solid/drop-floor.ts` | Align-to-floor |
| Auf Größe skalieren | `solid/scale-to-size.ts` | Scale |
| Ebenenschnitt | `solid/plane-cut.ts` | Plane Cut |
| Hüllkugel-Körper | `solid/sphere-body.ts` | Stock/Sphere |
| PLY-Export | `io/ply-export.ts` | #25 (Teil) |
| **Offset-Konstruktionsebene** | `construct/plane.ts` (+ `host.startSketch`) | **#16** |

Alle Solid-Operationen sind **rein TypeScript** umgesetzt (Intersect komponiert den vorhandenen
`mesh_boolean_subtract_json`-Kernel als `A∩B = A−(A−B)`), daher kein neuer Rust-Code und keine
`lib.rs`-Konflikte.

## Prozess

PR0 solo → **4 Wellen à 8 Agenten** in **isolierten git-Worktrees** (eigener Branch + Vite-Port),
jeder mit Pflicht-DoD (typecheck + vitest + eigener E2E grün, 0 Konsolenfehler, DE+EN). Serielle
Integration via `merge=union` (alle Append-Marker konfliktfrei). #16 als koordinierter Kern-Eingriff
(schmale `host.startSketch`-Erweiterung). Abschluss: drei adversariale Multi-Agent-Reviews →
~19 verifizierte Funde gefixt (GPU-Dispose-Leaks, uncatchbare WASM-Throws, ConvexGeometry-/Null-
Crash-Pfade, plane-cut NaN-Normalen, Overlay-Idempotenz, drop-floor Bounds/Undo), je mit
Regressions-Test belegt.

## Bekannte Grenzen (dokumentiert, bewusst)

- **Undo entfernt neu erzeugte Körper nicht.** `restoreSnapshot` aktualisiert nur vorhandene
  Bodies; das betrifft auch das bestehende Extrude/Revolve. Mesh-*mutierende* Features
  (reverse/weld/reduce) nutzen `pushMeshUndo` und werden korrekt zurückgesetzt.
- **Intersect auf einem Boolean-Ergebnis** kann den WASM-Kernel in einen Trap (`unreachable`)
  führen; der `try/catch` fängt den Fehler ab (Status statt Absturz), aber das Modul kann danach
  einen Re-Init brauchen. Für saubere Operanden (Normalfall) robust.
- Sketch-Constraint-Solver (#11) ist inzwischen **live verdrahtet** — siehe
  `docs/IMPLEMENTED-11-CONSTRAINTS-2026-06-14.md`. Parametrisches Timeline-Replay (#30) bleibt offen —
  tief im Sketch-/Feature-Kern verzahnt, eigenes koordiniertes Vorhaben (nicht naiv-parallelisierbar).

## Neues Feature hinzufügen

Siehe `docs/FEATURE-AGENT-BRIEFING.md`: neues Modul + `registerFeature(...)` in `src/features/`,
je ein i18n-Block unter `// @i18n:append` (de+en), eine Barrel-Zeile, ein E2E-Spec. Kein Anfassen
von `main.ts`/`index.html`.
