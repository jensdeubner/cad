# Umgesetzt: Additive Parität-Welle — Inspect · Mesh-Reparatur · Kamera-Projektion (2026-06-14)

Fortsetzung von `docs/IMPLEMENTED-2026-06-14.md` / `-11-CONSTRAINTS-` / `-30-TIMELINE-`.
**6 additive Features** parallel in isolierten git-Worktrees (je Branch + Vite-Port, PR0-Registry-Seam)
gebaut + pipeline-adversarial reviewt, plus **1 koordinierter Kern-Eingriff** (Perspektive/Ortho)
selbst umgesetzt. Ergebnis auf **`main`**, durchgängig grün.

## Gelieferte Features → Backlog-Bezug (FUSION-360-PARITY.md)

| Feature | Modul / Feature-ID | Backlog | Art |
|---|---|---|---|
| **Winkel messen** (3-Punkt, Scheitel-Winkel + Schnellwinkel an BBox-Ecke) | `inspect/measure-angle.ts` · `inspect-measure-angle` | #1 Measure | additiv |
| **Fläche messen** (Gesamtoberfläche + koplanare Flächenregion per Pick) | `inspect/measure-area.ts` · `inspect-measure-area` | #1 Measure | additiv |
| **Eigene Named Views** (Mehr-Slot speichern/auflisten/laden/löschen, Panel) | `nav/named-views.ts` · `view-named-save`/`view-named-restore` | #7 Named Views | additiv |
| **Löcher füllen** (Randschleifen-Erkennung + Zentroid-Fächer-Triangulation) | `mesh/hole-fill.ts` · `mesh-hole-fill` | #21 Erase & Fill | additiv |
| **Körper trennen** (disjunkte Schalen → eigene Körper, Union-Find) | `mesh/separate.ts` · `mesh-separate` | „Separate" | additiv |
| **Neu vernetzen** (Verfeinern auf Ziel-Kantenlänge, watertight Midpoint-Subdivision) | `mesh/remesh.ts` · `mesh-remesh` | #33 Remesh | additiv |
| **Perspektive/Ortho-Umschalter** | `nav/projection.ts` + Kern · `view-projection-toggle` | #4 Camera Type | **Kern** |

Alle rein TypeScript (kein neuer Rust-Code). Inspect/Mesh-Module sind pur + unit-getestet; die
interaktiven Controller spiegeln das vorhandene `inspect/measure.ts`-Muster (Schnell-Pfad für
deterministische E2E + Pointer-Picking für ad-hoc).

## Kern-Eingriff: Perspektive/Ortho (warum nicht parallel-additiv)

`main.ts` band die Kamera als `const camera` und das Render-/Pick-Loop daran — ein echter
Projektionswechsel verlangt eine zweite Kamera + Re-Pointing der Captures, also `main.ts`/`host.ts`.
Lösung (Plan „eine aktive Kamera"):
- `main.ts` hält `perspectiveCamera` **und** `orthographicCamera`; `let camera` ist die **aktive**
  (Render + Pick lesen die Live-Variable, daher automatisch korrekt).
- `setCameraProjection(mode)` überträgt die Transform auf die Zielkamera, rahmt das Ortho-Frustum
  passend (`orthoHalfExtents`, pur + unit-getestet: `halfH = dist·tan(fov/2)`, `halfW = halfH·aspect`)
  und re-pointet **alle** Object-Captures: `controls.object`, `transformControls.camera`,
  `viewCube.setMainCamera(camera)`.
- Picking bleibt projektions-agnostisch (`raycaster.setFromCamera` unterstützt beide Kameratypen).
- `FeatureHost.camera` zur Union `Perspective|Orthographic` geweitet + `get/setCameraProjection`;
  `nav/views.ts` (lookAtBox/captureView/applyView) projektions-bewusst (Ortho-Rahmung + `zoom` in
  `ViewState`). `sketch-dimension.ts` degradiert in Ortho sauber (vorhandener `instanceof`-Guard).
- **Perspektiv-Verhalten beweisbar neutral**: aktive Kamera = Perspektivkamera; `zoom`-Plumbing ist
  bei `zoom=1` ein No-op und abwärtskompatibel zu alten gespeicherten Views.

## Prozess

PR0-Registry-Seam → **6 parallele Worktree-Agenten** (`wt-<feature>`, Branch `feat/<feature>`,
Ports 5181–5186), je Pflicht-DoD (typecheck + vitest + eigener E2E grün, 0 Konsolenfehler, DE+EN,
nur erlaubte Dateien). Serielle Integration via `merge=union` (i18n/Barrel konfliktfrei). Der
Kern-Eingriff separat in `wt-camera-projection` (Port 5187), eigene adversariale Review.

**Adversariale Review (pipeline + Kern):** je Feature eine unabhängige Refutations-Review.
Bestätigte Funde gefixt:
- **`mesh-separate` (MAJOR):** nutzte `pushUndo` statt `pushMeshUndo` vor Mesh-Buffer-Mutation →
  Undo konnte den Ursprungs-Körper nicht wiederherstellen. **Gefixt.**
- 2 kosmetische Minor (deutsche Anführungszeichen in Named-Views-Status; konsistent gemacht).
- Kamera-Projektion: Review **clean** (alle 3 Object-Captures re-pointet, Perspektiv-Pfad neutral).

## Verifikation (final, alle grün)

`npm run typecheck` 0 · `npm run test` **1170** vitest (62 Dateien) · `npm run build` ok ·
`E2E_PORT=5180 npx playwright test` **87/87** (DE+EN, 0 Konsolenfehler).
Baseline vorher: 1120 vitest / 73 E2E → **+50 Unit / +14 E2E**.

Neue Tests: `test/unit/{measure-angle,measure-area,named-views,hole-fill,separate,remesh,projection}.test.ts`,
`test/e2e/{measure-angle,measure-area,named-views,hole-fill,separate,remesh,projection}.spec.ts`.

## Bekannte Grenzen (bewusst, dokumentiert)

- **Fläche messen:** der interaktive Flächenregion-Pick seedet über `faceIndex` der ungeschweißten
  Geometrie; auf Meshes mit degenerierten Dreiecken *vor* der getroffenen Fläche kann der Seed
  verrutschen (irrelevant für Primitive; Gesamtfläche + Unit-Pfad korrekt). Robusterer Seed über
  Welt-Zentroid/Normale wäre Folgearbeit.
- **Löcher füllen:** Randketten über eine `tail→head`-Map; zwei Löcher, die sich **einen** Vertex
  teilen (non-manifold Pinch), werden nicht beide gefüllt. Getrennte Löcher korrekt.
- **Neu vernetzen:** Verfeinerung (Midpoint-Subdivision auf Ziel-Kantenlänge), kein Vergröbern;
  geometrie-erhaltend auf planaren Flächen.
- **Ortho:** Frustum folgt beim Resize dem Aspect (vertikale Ausdehnung + Zoom bleiben erhalten);
  Marker `view-projection-toggle` ist View-State, nicht persistiert.
