# Umgesetzt: Fusion-Parität via Parallel-Agenten (2026-06-14)

Ausführung des Plans aus `docs/PARALLEL-AGENTS-FUSION-PARITY.md` mit dem Backlog aus
`docs/FUSION-360-PARITY.md`. Ergebnis auf Branch **`feat/pr0-registry-seam`** (PR0 + 16 Features),
durchgängig grün: `typecheck`, `vitest` (977), `npm run build`, und **32/32 Playwright-E2E** über
alle Features (DE+EN, null Konsolenfehler).

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

Alle Solid-Operationen sind **rein TypeScript** umgesetzt (Intersect komponiert den vorhandenen
`mesh_boolean_subtract_json`-Kernel als `A∩B = A−(A−B)`), daher kein neuer Rust-Code und keine
`lib.rs`-Konflikte.

## Prozess

PR0 solo → 2 Wellen à 8 Agenten in **isolierten git-Worktrees** (eigener Branch + Vite-Port),
jeder mit Pflicht-DoD (typecheck + vitest + eigener E2E grün, 0 Konsolenfehler, DE+EN). Serielle
Integration via `merge=union` (alle Append-Marker konfliktfrei). Abschluss: adversarialer
Multi-Agent-Review (25 Agenten) → 11 verifizierte Funde, davon die echten Leaks/Crash-Pfade gefixt
(`fix(review)`-Commit).

## Bekannte Grenzen (dokumentiert, bewusst)

- **Undo entfernt neu erzeugte Körper nicht.** `restoreSnapshot` aktualisiert nur vorhandene
  Bodies; das betrifft auch das bestehende Extrude/Revolve. Mesh-*mutierende* Features
  (reverse/weld/reduce) nutzen `pushMeshUndo` und werden korrekt zurückgesetzt.
- **Intersect auf einem Boolean-Ergebnis** kann den WASM-Kernel in einen Trap (`unreachable`)
  führen; der `try/catch` fängt den Fehler ab (Status statt Absturz), aber das Modul kann danach
  einen Re-Init brauchen. Für saubere Operanden (Normalfall) robust.
- Konstruktions-Ebene (#16), Sketch-Constraint-Solver (#11), parametrisches Timeline-Replay (#30)
  bleiben offen (Welle-2-Plan B / tief verzahnt).

## Neues Feature hinzufügen

Siehe `docs/FEATURE-AGENT-BRIEFING.md`: neues Modul + `registerFeature(...)` in `src/features/`,
je ein i18n-Block unter `// @i18n:append` (de+en), eine Barrel-Zeile, ein E2E-Spec. Kein Anfassen
von `main.ts`/`index.html`.
