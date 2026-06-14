<!--
  GENERIERT: Multi-Agent Parity-Sweep (12 Recherche-/Audit-Agents + Synthese + adversariale Verifikation), 2026-06-14.
  Quelle-Audit gegen echten Code-Stand (src/, wasm-stl/, index.html, i18n/). Adversarialer Verifikations-Anhang am Ende.
  Begleitdokument für die parallele Umsetzung: docs/PARALLEL-AGENTS-FUSION-PARITY.md
-->

# Feature-Paritätsanalyse: scan-tracer vs. Autodesk Fusion 360

> Stand: 2026-06-14 · Basis: Repo-Audit (`src/`, `wasm-stl/`, `index.html`, `i18n/de.ts`) gegen recherchierten Fusion-360-Funktionsumfang (Design-Workspace: Sketch, Solid Create/Modify, Construct/Pattern, Mesh/Surface, Inspect/Assemble/Navigation/IO).

## Executive Summary

**Geschätzte Gesamt-Parität: ~16–20 %** (gewichtet nach Wichtigkeit), bzw. **~12 %** bei reiner Zählung aller recherchierten Fusion-Features.

Dieses Werkzeug ist **kein Fusion-Klon**, sondern ein fokussierter **Scan-/Mesh-Tracer mit leichtem Hybrid-CAD-Aufsatz**. Das prägt die Bewertung: Es glänzt genau dort, wo Fusion historisch schwach ist (Direkt-Mesh-Bearbeitung von Scandaten), und es fehlt fast alles, was Fusions parametrische Stärke ausmacht.

**Was das Werkzeug wirklich gut kann:**
- **Mesh-/Scan-Workflow** end-to-end: STL-Import (binär + ASCII, mit Stride/LOD), 6-DOF-Ausrichtung, automatische Best-Fit-Ebenen-Ausrichtung via PCA + Coordinate-Descent (`src/scan-plane-align.ts`), Hit-Feedback, 5 Darstellungsthemen.
- **Direkte Mesh-Bearbeitung**: Press-Pull (Normalen-Displacement mit Smoothstep-Falloff), Taubin-Glättung (global + Sektionsband), Mirror, Plane-Cut, alles mit Undo (`src/body-edit.ts`).
- **Echte Boolean-Operationen** über WASM-Kernel: Union/Subtract (`wasm-stl/src/boolean.rs`, `mesh_boolean_*_json`).
- **Parametrische Erzeugung aus Skizzen**: Extrude, Revolve, Loft über WASM (`loft_contours_json`, `revolve_contour_json`).
- **Solide Navigation/IO**: ViewCube mit Flug-Animation (`src/view-cube.ts`), Fusion-artige Maus-Bindings, Projekt-Save/Load (`.stpr` v6 mit Migration), Undo-History + Display-Feature-Log.

**Die größten Lücken (nach Hebelwirkung):**
1. **Kein Constraint-Solver.** Skizzen haben keinerlei geometrische Constraints (coincident/parallel/tangent/…). Bemaßungen sind nur „driven" und skalieren lokal die Kontur — keine parametrischen Referenzen. Das ist die fundamentalste Abweichung von Fusions Kern.
2. **Kein BRep-Kernel.** Alles ist Mesh. Daher kein echtes Fillet/Chamfer/Shell/Draft auf Kanten — diese i18n-Keys existieren, sind aber bewusst nicht im Ribbon (Stubs).
3. **Keine Konstruktionsgeometrie** (Offset-Plane/Axis/Point) über die 3 fixen Ursprungsebenen hinaus.
4. **Kein 3D-Messwerkzeug** (Punkt-zu-Punkt, Winkel, Fläche, Volumen, Schwerpunkt).
5. **Sehr eingeschränkte Sweep/Surface/Mesh-Reparatur** (kein Sweep, Patch, Stitch, Remesh, Reduce, Hole-Fill).
6. **Keine Assemble-Ebene** (Joints/Components als Baugruppe) — und das ist für ein Scan-Tool weitgehend bewusst out-of-scope.

---

## Status-Legende

| Symbol | Bedeutung |
|--------|-----------|
| ✅ | **implementiert** — funktionierender End-to-End-Workflow (UI → Handler → Geometrie → Undo) |
| 🟡 | **Stub** — nur i18n-Key und/oder Button vorhanden, kein funktionaler Handler/Kernel |
| 🔴 | **fehlt** — keinerlei UI, Handler, i18n oder Kernel |
| ➖ | **bewusst out-of-scope** — passt nicht zur Scan-Tracer-Ausrichtung; niedrige Priorität |

---

## Bereich: Skizze

| Fusion-Feature | Wichtigkeit | Status | Datei/Hinweis |
|---|---|---|---|
| Line | core | ✅ | `src/main.ts:2046`, `src/sketch-geometry.ts:230`; Shortcut L, Vorschau + Commit als offene Contour |
| Center Diameter Circle | core | ✅ | `src/main.ts:2051`, `src/sketch-geometry.ts:149`; Shortcut C, 32-Punkt-Arc, closed=true |
| Two Point Rectangle | core | ✅ | `src/main.ts:2056`, `src/sketch-geometry.ts:209`; Shortcut R, 4-Eck closed |
| Three Point Arc | core | ✅ | `src/main.ts:2062`, `src/sketch-geometry.ts:170`; Shortcut A, Umkreis-Interpolation |
| Point | core | 🔴 | Keine UI, kein Typ-Marking für freistehende Skizzenpunkte |
| Project | core | 🔴 | Keine Projektion von Modellkanten/-flächen auf Skizzenebene |
| Sketch Dimension (linear) | core | ✅ | `src/sketch-dimension.ts:296`, `src/sketch-mode/dimensions.ts:200`; Shortcut D, modifiziert Konturpunkte |
| Coincident | core | 🔴 | Kein Constraint-Solver, keine i18n, kein Handler |
| Parallel | core | 🔴 | Kein Solver |
| Perpendicular | core | 🔴 | Kein Solver |
| Horizontal/Vertical | core | 🔴 | Kein Solver |
| Tangent (Constraint) | core | 🔴 | Kein Solver |
| Fillet (Sketch) | core | 🔴 | Keine Skizzen-Verrundung |
| Trim | core | 🔴 | Kein Trim-Werkzeug; nur Punkt-Edit (`src/contour-spline.ts`) |
| Extend | core | 🔴 | Nicht vorhanden |
| Offset (Sketch) | core | 🔴 | Kein Parallelversatz von Kurven |
| Sketch Dimension (radius/diameter) | core | ✅ | `src/sketch-dimension.ts:330,437`; R/Ø-Prefix, skaliert um Zentrum |
| Triangle (repo-spezifisch) | — | ✅ | `src/main.ts:2062`, `src/sketch-geometry.ts:234`; nicht in Fusion, aber vorhanden |
| Freehand (repo-spezifisch) | — | ✅ | `src/main.ts:5000`; Stroke-Vereinfachung, Commit als Contour |
| Kontur-Edit (move/insert/delete/smooth/corner/curve) | — | ✅ | `src/contour-spline.ts:157`, `src/main.ts:2384` |
| Grid & Snap (Origin + Plane) | common | ✅ | `src/sketch.ts:129`, `src/sketch-geometry.ts:47`; snapSketch2D |
| Sketch-Ebenen-Auswahl (XY/XZ/YZ) | core | ✅ | `src/sketch.ts:85`, `src/main.ts:1769`; klickbare 3D-Tiles |
| Tangent Arc | common | 🔴 | Nur 3-Punkt-Arc vorhanden |
| Center Point Arc | common | 🔴 | Nicht vorhanden |
| Two/Three Point Circle | common | 🔴 | Nur Center-Diameter |
| Three Point / Center Rectangle | common | 🔴 | Nur 2-Punkt-Rechteck |
| Polygon (Circumscribed/Inscribed/Edge) | common | 🔴 | Kein Polygon-Werkzeug |
| Ellipse | common | 🔴 | Nicht vorhanden |
| Slot (alle 5 Varianten) | common | 🔴 | Nicht vorhanden |
| Fit Point Spline | common | 🔴 | Splines nur intern als Kontur-Glättung, kein Spline-Tool |
| Text | common | 🔴 | Kein Skizzentext |
| Mirror (Sketch) | common | 🔴 | Nur Body-Mirror, nicht in Skizze |
| Circular/Rectangular Pattern (Sketch) | common | 🔴 | Nur Body-Pattern |
| Collinear / Concentric / Midpoint / Equal / Symmetry / Fix | common | 🔴 | Kein Constraint-Solver |
| Break | common | 🔴 | Nicht vorhanden |
| Sketch Scale / Move-Copy (Sketch) | common | 🔴 | Nur Body-Transform; Skizze hat nur Punkt-Edit |
| Control Point Spline | advanced | 🔴 | Nicht vorhanden |
| Conic Curve | advanced | 🔴 | Nicht vorhanden |
| Two/Three Tangent Circle | advanced | 🔴 | Nicht vorhanden |
| Intersect / Include 3D / Project to Surface / Intersection Curve | advanced | 🔴 | Keine 3D-Referenzierung |
| Curvature Constraint (G2) | advanced | 🔴 | Kein Solver |
| Change Constraints (Driven/Driving) | advanced | 🟡 | Bemaßungen sind faktisch immer „driven" (modifizieren Kontur lokal), kein Toggle |
| Konstruktionsgeometrie / Construction-Mode-Layer | common | 🔴 | Keine separate Construction-Ebene, kein Centerline-Typ |
| Profil-Validierung (closed/open/self-intersect) | common | 🔴 | Keine Validatoren; manuelle Annotation |

---

## Bereich: Solid Erzeugen

| Fusion-Feature | Wichtigkeit | Status | Datei/Hinweis |
|---|---|---|---|
| Create Sketch | core | ✅ | `src/sketch.ts:85`, `src/main.ts:1769`; siehe Skizze-Bereich |
| Extrude | core | ✅ | `src/solid-extrude.ts:1`, `src/main.ts:3289`; WASM `loft_contours_json`, Drag-Distanz + Preview |
| Revolve | core | ✅ | `src/solid-revolve.ts:1`, `src/main.ts:3330`; WASM `revolve_contour_json`, 1°–360° |
| Sweep | common | 🟡 | i18n `solid.sweep` vorhanden, kein Button/Handler/WASM (bewusst ausgeschlossen) |
| Loft | common | ✅ | `src/solid-loft.ts:1`, `src/main.ts:3369`; WASM `loft_contours_json`, 2+ Profile o. 1+Spacing |
| New Component | common | 🟡 | CadScene hat Component-Hierarchie (`src/cad-scene.ts`), aber kein dediziertes „New Component"-Erzeugungs-Feature im Ribbon |
| Pattern (Rect/Circ/Path) | common | ✅ (teilw.) | Rect+Circ ✅ (`src/main.ts:3504,3539`); **Path-Pattern 🔴** |
| Mirror | common | ✅ | `src/main.ts:3566`, `src/body-edit.ts:296`; Achs-basiert (X/Y/Z) |
| Hole | common | 🟡 | i18n `solid.hole` vorhanden, kein Handler |
| Thread | common | 🟡 | i18n `solid.thread` vorhanden, kein Handler |
| Box / Cylinder / Sphere | common | 🔴 | Keine Primitive-Erzeugung (kein i18n, kein Button) |
| Rib | advanced | 🟡 | i18n `solid.rib` vorhanden, kein Handler |
| Web | advanced | 🟡 | i18n `solid.web` vorhanden, kein Handler |
| Emboss | advanced | 🟡 | i18n `solid.emboss` vorhanden, kein Handler |
| Coil | advanced | 🟡 | i18n `solid.coil` vorhanden, kein Handler |
| Pipe | advanced | 🟡 | i18n `solid.pipe` vorhanden, kein Handler |
| Torus | advanced | 🔴 | Nicht vorhanden |
| Thicken | advanced | 🔴 | Nicht vorhanden (kein Surface→Solid) |
| Create Form (T-Spline) | advanced | ➖ | Sculpt-Umgebung out-of-scope; Mesh-Tools decken Teilbedarf |
| Create Base Feature | advanced | ➖ | Direkt-Modellierung ist faktisch der Default (kein History-Replay) |
| Derive | advanced | ➖ | Kein Multi-Dokument-Linking |
| Create PCB | advanced | ➖ | Elektronik out-of-scope |

---

## Bereich: Solid Ändern

| Fusion-Feature | Wichtigkeit | Status | Datei/Hinweis |
|---|---|---|---|
| Press Pull | core | ✅ | `src/main.ts:4795,4916`, `src/body-edit.ts:69` (`displaceRegion`); Normalen-Displacement + Smoothstep |
| Combine — Join (Union) | core | ✅ | `src/main.ts:3464`, `src/body-edit.ts:434`, `wasm-stl/src/boolean.rs:87`; CSG-Union + Fallback-Concat |
| Combine — Cut (Subtract) | core | ✅ | `src/main.ts:1099`, `src/body-edit.ts:467`, `wasm-stl/src/boolean.rs:70`; 2-Phasen-Pick |
| Combine — Intersect | core | 🟡 | i18n `solid.intersect` (de.ts:60) vorhanden, kein Button/Handler |
| Move/Copy | core | ✅ (teilw.) | `src/main.ts:4572,2824`; Gizmo translate (`move-body`). **Create-Copy/Rotate-Modi teilw. fehlend** |
| Fillet | core | 🟡 | i18n `solid.fillet` (de.ts:49), kein Button/Handler/Kernel (Mesh-basiert schwierig) |
| Chamfer | core | 🟡 | i18n `solid.chamfer` (de.ts:50), kein Handler |
| Shell | core | 🟡 | i18n `solid.shell` (de.ts:51), kein Handler |
| Split Body | common | ✅ | `src/main.ts:1132`, `src/body-edit.ts:321` (`clipGeometryByPlane`); Plane-Cut |
| Scale | common | ✅ | `src/main.ts:4572,2824`; Gizmo scale (`scale-body`), uniform/non-uniform via Transform |
| Smooth (repo-spezifisch, Taubin) | — | ✅ | `src/main.ts:736`, `src/body-edit.ts:260`; global + Sektionsband (`smooth-body`/`smooth-section`) |
| Draft | common | 🟡 | i18n `solid.draft` (de.ts:52), kein Handler |
| Offset Faces | common | 🔴 | Nicht vorhanden |
| Split Face | common | 🟡 | i18n `solid.split-face` vorhanden, kein Handler |
| Align | common | 🔴 | Kein geometrie-zu-geometrie Align (nur manuelle Scan-Ausrichtung in Align-Panel) |
| Physical Material | common | 🔴 | Keine Material-/Dichte-Zuweisung |
| Appearance | common | 🔴 | Nur globale Scan-Themes, keine Per-Face/Body-Appearance |
| Change Parameters | common | 🔴 | Keine benannten Parameter/Gleichungen |
| Rule Fillet / Full Round Fillet | advanced | 🔴 | Kein Fillet-Kernel |
| Replace Face | advanced | 🔴 | Nicht vorhanden |
| Silhouette Split | advanced | 🔴 | Nicht vorhanden |
| Delete Face | advanced | 🔴 | Nicht vorhanden (Mesh-„Erase and Fill" ebenfalls fehlt) |
| Manage Materials | advanced | ➖ | Materialbibliothek out-of-scope |
| Compute All | advanced | ➖ | Kein Timeline-Recompute (Direkt-Modellierung) |

---

## Bereich: Konstruktion & Muster

| Fusion-Feature | Wichtigkeit | Status | Datei/Hinweis |
|---|---|---|---|
| Rectangular Pattern | core | ✅ | `src/main.ts:3504`; Prompt cols/rows/spacing, `duplicateBodyFrom`, kein WASM |
| Circular Pattern | core | ✅ (eingeschr.) | `src/main.ts:3539`; **nur um Y-Achse**, Prompt count≥2, step=360/count |
| Mirror | core | ✅ (eingeschr.) | `src/main.ts:864`, `src/body-edit.ts:296`; **nur Achse X/Y/Z, keine Ebenen-Auswahl** |
| Offset Plane | core | 🔴 | Nur 3 fixe Ursprungsebenen; keine Konstruktionsebene |
| Plane Through Three Points | common | 🔴 | Nicht vorhanden |
| Midplane | common | 🔴 | Nicht vorhanden |
| Plane at Angle | common | 🔴 | Nicht vorhanden |
| Tangent Plane | common | 🔴 | Nicht vorhanden |
| Axis Through Cylinder/Cone/Torus | common | 🔴 | Keine Konstruktionsachsen |
| Axis Through Two Points | common | 🔴 | Nicht vorhanden |
| Axis Through Edge | common | 🔴 | Nicht vorhanden |
| Point at Vertex | common | 🔴 | Keine Konstruktionspunkte |
| Point at Center of Circle/Sphere/Torus | common | 🔴 | Nicht vorhanden |
| Pattern on Path | common | 🔴 | Nicht vorhanden |
| Plane Through Two Edges / Perpendicular Plane / Plane Along Path / Tangent-at-Point | advanced | 🔴 | Nicht vorhanden |
| Axis Perpendicular at Point / Through Two Planes | advanced | 🔴 | Nicht vorhanden |
| Point Through Two Edges / Three Planes / Edge+Plane / Along Path | advanced | 🔴 | Nicht vorhanden |

---

## Bereich: Mesh/Scan & Surface

| Fusion-Feature | Wichtigkeit | Status | Datei/Hinweis |
|---|---|---|---|
| Insert Mesh (STL Import) | core | ✅ | `wasm-stl/src/lib.rs:87` (`parse_stl`/`_with_stride`), `src/main.ts:3880`; binär+ASCII, LOD-Stride |
| Stitch (Surface→Solid) | core | 🔴 | Nicht vorhanden |
| Patch | core | 🔴 | Kein Boundary-Surface-Fill |
| Extrude/Revolve (Surface) | core | 🟡 | Solid-Extrude/Revolve erzeugen geschlossene Meshes; **kein offener Surface-Body-Modus** |
| Tessellate (BRep→Mesh) | core | ➖ | Alles ist bereits Mesh; keine BRep→Mesh-Konvertierung nötig |
| Convert Mesh (Mesh→BRep) | core | 🔴 | Keine Mesh→Solid/Surface-BRep-Konvertierung |
| Plane Cut (Mesh) | common | ✅ | `src/main.ts:1132`, `src/body-edit.ts:321`; `clipGeometryByPlane`, „Schnitt"-Feature |
| Merge Bodies / Combine (Mesh) | common | ✅ | `src/main.ts:3464`, `src/body-edit.ts:352`/`434`; CSG-Union + Concat-Fallback |
| Reverse Normal (Mesh/Surface) | common | 🔴 | Nicht vorhanden (Normalen nur via `computeVertexNormals`) |
| Remesh | common | 🔴 | Nicht vorhanden |
| Reduce (Decimation) | common | 🔴 | `simplifyStroke` nur für Skizzen-Strokes, nicht für Mesh |
| Smooth (Mesh) | common | ✅ | `src/main.ts:736`, `src/body-edit.ts:260`; Taubin, region- + sektionsbasiert |
| Erase and Fill | common | 🔴 | Kein Hole-Fill / Face-Erase |
| Separate | common | 🔴 | Keine Trennung disjunkter Shells |
| Offset (Surface) / Thicken | common | 🔴 | Kein Surface-Offset/Skin-Thickening |
| Trim/Extend (Surface) | common | 🔴 | Nicht vorhanden |
| Repo: Auto-Ebenen-Ausrichtung (PCA + Coordinate-Descent) | — | ✅ | `src/scan-plane-align.ts:338`, `src/main.ts:1462`; Best-Fit zu Workplane, Hit-Ratio |
| Repo: 6-DOF Manuelle Ausrichtung | — | ✅ | `src/scan-align.ts`, `src/main.ts:1300`; Per-Achse-Stepper |
| Repo: Hit-Feedback-Visualisierung | — | ✅ | `src/scan-hit.ts:53`, `src/main.ts:1417` |
| Repo: 5 Darstellungs-Themes | — | ✅ | `src/scan-visual.ts:53`; cad/kontrast/punkte/flaeche/dunkel |
| Repo: Surface-Picking (Raycast) | — | ✅ | `src/main.ts:785`, `src/body-edit.ts:13`; für Brush/Press-Pull |
| Make Closed Mesh (Watertight) | advanced | 🔴 | Kein Manifold-Repair (genannt in mesh-scan missing) |
| Create Mesh Section Sketch | advanced | 🔴 | Keine Section-Sketch aus Mesh |
| Direct Edit (Mesh) | advanced | ✅ (de facto) | Mesh-Edit ist ohnehin Direkt-Modellierung (Press-Pull/Smooth) |
| Generate/Create Face Group | advanced | 🔴 | Keine Face-Gruppen |
| Ruled / Boundary Fill (Surface) | advanced | 🔴 | Nicht vorhanden |
| Untrim / Merge / Scale / Split (Surface) | advanced | 🔴 | Kein Surface-Workspace |
| Fillet (Surface) | advanced | 🔴 | Nicht vorhanden |
| Repo: Height-/Normal-Color-Coding | — | ✅ | `src/scan-visual.ts:152,172`; Debug-Visualisierung |

---

## Bereich: Inspect / Navigation / IO

| Fusion-Feature | Wichtigkeit | Status | Datei/Hinweis |
|---|---|---|---|
| ViewCube | core | ✅ | `src/view-cube.ts:1`; 6 Faces, Raycast-Preset, Flug-Animation, separater Canvas |
| Orbit / Pan / Zoom | core | ✅ | `src/input/viewport-navigation.ts:1`; Fusion-artige Maus-Bindings, Modus-abhängig |
| Fit | core | ✅ | `src/main.ts:2159` (`fitCameraToBox`); F-Key, Auto-Fit on Load |
| Home View | core | ✅ | `src/main.ts:1508`; isometrische Standard-Orientierung |
| Browser (Komponentenbaum) | core | ✅ (teilw.) | CadScene-Hierarchie + Browser-Panel; **kein voller Origin/Joints-Knoten-Drill-Down** |
| Units / Document Settings | core | ✅ (teilw.) | `src/sketch-dimension.ts:42`; mm/cm/m/inch für Bemaßung; **kein dokumentweiter Units-Knoten** |
| Parametric Timeline | core | 🟡 | Feature-Log existiert (`src/feature-timeline.ts`), aber **display-only, kein parametrisches Replay/Rollback** |
| New Component (Assemble) | core | 🟡 | Hierarchie vorhanden, kein vollwertiger Assemble-Erzeugungs-Flow |
| Joint (+ alle Typen: Rigid/Revolute/Slider/…) | core/common | ➖ | Keine Baugruppen-Joints; out-of-scope für Scan-Tracer |
| Measure | core | 🟡 | Nur 2D-Skizzenbemaßung; **kein 3D-Punkt/Winkel/Fläche/Volumen-Messwerkzeug** |
| Look At | common | 🔴 | Kein „senkrecht auf Fläche/Ebene blicken" |
| Camera Type (Persp/Ortho) | common | 🔴 | Kein Projektions-Umschalter |
| Named Views | common | 🟡 | Nur fixe Presets (top/front/side/persp); keine benutzerdefinierten gespeicherten Views |
| Visual Styles | common | ✅ (teilw.) | Über Scan-Themes (shaded/edges/points); kein echter Wireframe/Hidden-Edge-Modus |
| Display Settings (Shadows/AO/Env) | common | 🟡 | Theme-abhängiges Studio-Setup; keine granularen Effekt-Toggles |
| Object Visibility Settings | common | ✅ (teilw.) | Grid-Toggle (`src/main.ts:494`); **keine getrennten Origin/Sketch/Construction-Toggles** |
| Grid and Snaps | common | ✅ (teilw.) | Grid-Anzeige + Skizzen-Snap; **kein 3D-Snap-to-Vertex/Edge, kein Koordinaten-HUD** |
| Interference | common | 🔴 | Keine Kollisions-/Überlappungsprüfung |
| Section Analysis | common | 🔴 | Keine Live-Schnittebene durch alle Objekte |
| Center of Mass | common | 🔴 | Kein Schwerpunkt |
| Change Parameters | common | 🔴 | Keine benannten Parameter |
| Browser Folders / Grouping | common | 🔴 | Keine Ordner |
| Marking Menu (Radial Right-Click) | common | 🔴 | Nur lineares Kontextmenü |
| Timeline Roll-Back / Edit / Delete / Suppress | common | 🔴 | Feature-Log ist nicht editierbar/rollbar |
| Repo: Projekt Save/Load (.stpr) | — | ✅ | `src/project-file.ts:1`, `src/main.ts:3610`; `pack_project_multi`/`unpack_project`, v6 + Migration |
| Repo: Undo/Redo-History-Timeline | — | ✅ | `src/undo.ts:1`, `src/history-timeline.ts:1`; max 80 Snapshots, Jump-to-Position |
| Repo: Work-Plane-Visualisierung | — | ✅ | `makeWorkPlaneMesh` (drawing.ts); für Scan-Ausrichtung |
| Component Color Cycling | common | 🔴 | Nicht vorhanden |
| Curvature Comb / Zebra / Draft / Curvature-Map / Accessibility / Min-Radius / Isocurve / Environment-Map Analysis | advanced | 🔴 | Keine Surface-Analyse-Werkzeuge |
| As-Built Joint / Joint Origin / Rigid Group / Motion Link / Motion Study / Contact Sets / Drive Joints | common/advanced | ➖ | Baugruppen-/Mechanik-Features out-of-scope |
| New Configuration | advanced | ➖ | Keine Varianten-Tabellen |
| Navigation-Preset-Schemes (SW/Inventor/…) | advanced | ➖ | Fixe Fusion-artige Bindings |

---

## Priorisierter Feature-Backlog für Parität

Jeder Eintrag ist **eigenständig baubar** (für parallele Multi-Agent-Umsetzung). Aufwand: **S** = ≤1 Tag, **M** = 2–4 Tage, **L** = 1+ Woche / neuer Kernel.

### P0 — Quick Wins (hoher Wert, kleiner Aufwand, kein neuer Kernel)

1. **3D-Messwerkzeug (Punkt-zu-Punkt, Kante, Winkel)** — Schließt die offensichtlichste Inspect-Lücke; rein JS via Raycast auf bestehende `pickBodySurfaceAt`-Infrastruktur. **Aufwand: M.** Neues Modul `src/inspect/measure.ts`; kein WASM.
2. **Modell-Analyse (Volumen, Oberfläche, Bounding-Box, Schwerpunkt)** — Hoher Nutzen für Scan-Validierung; Volumen/COM via Divergenz-Theorem über Dreiecke. **Aufwand: S.** Neues Modul `src/inspect/model-stats.ts`; optional WASM-Helper in `wasm-stl/src/measure.rs` für große Meshes.
3. **Boolean Intersect** — i18n existiert bereits (`solid.intersect`); Kernel-Pfad (`boolean.rs`) ist da, nur OpType ergänzen + UI-Button + 2-Phasen-Pick analog Subtract. **Aufwand: S.** `wasm-stl/src/boolean.rs` (`mesh_boolean_intersect_json`) + `src/main.ts` runBooleanIntersect.
4. **Kamera-Typ Perspektive/Ortho-Umschalter** — Standard-Erwartung; reiner Three.js-Kameratausch. **Aufwand: S.** Erweiterung `src/input/viewport-navigation.ts` + Toolbar-Toggle.
5. **„Look At" (senkrecht auf Fläche/Ebene blicken)** — Picke Fläche → Normale → Kameraflug (ViewCube-`flyTo` wiederverwenden). **Aufwand: S.** Erweiterung `src/view-cube.ts` / `src/main.ts:setView`.
6. **Reverse Normal (Mesh)** — Häufig nötig bei Scans mit invertierten Normalen; Flip von Index-Winding + `computeVertexNormals`. **Aufwand: S.** Neues Modul `src/mesh/reverse-normal.ts`.
7. **Benutzerdefinierte Named Views (Save/Restore)** — Erweiterung der fixen Presets um speicherbare Kamera-Zustände; in Projekt-Save serialisieren. **Aufwand: S.** Neues Modul `src/nav/named-views.ts` + `src/project-file.ts`-Feld.
8. **Getrennte Sichtbarkeits-Toggles (Origin-Ebenen / Sketches / Construction / Bodies)** — Erweitert vorhandenes Grid-Toggle. **Aufwand: S.** Erweiterung Browser-Panel + `src/main.ts` browserState.
9. **Mirror über Ebenen-Auswahl statt nur Achse** — Heute nur X/Y/Z (`parseMirrorAxis`); Pick einer Ebene/Fläche als Spiegelbene. **Aufwand: S.** Erweiterung `src/body-edit.ts:mirrorGeometry` + Pick-Flow.
10. **Circular Pattern um beliebige Achse** — Heute hart auf Y-Achse; Achs-Pick + Rotation um beliebigen Vektor. **Aufwand: S.** Erweiterung `src/main.ts:3539 circularPatternBodies`.

### P1 — Kern-Parität (substanzieller Wert; mittlerer Aufwand)

11. **Sketch-Constraint-Solver (Phase 1: coincident, horizontal/vertical, parallel, perpendicular)** — **Der wichtigste Hebel überhaupt** für „echtes" CAD-Gefühl; 2D-Solver (z. B. iterativ/Least-Squares). **Aufwand: L.** Neues Modul `src/sketch/constraints.ts` + Solver `src/sketch/solver.ts`; optional WASM `wasm-stl/src/sketch_solver.rs`.
12. **Sketch Trim/Extend** — Kern-Editierwerkzeuge; Schnittpunkt-Berechnung zwischen Konturkurven. **Aufwand: M.** Neues Modul `src/sketch/trim-extend.ts`.
13. **Sketch Offset (Parallelversatz)** — Sehr häufig; Polygon-Offset auf Konturpunkten. **Aufwand: M.** Neues Modul `src/sketch/offset.ts`.
14. **Sketch Project (Modellkanten→Skizzenebene)** — core in Fusion; Projektion von Body-Kanten via Raycast/Ebenen-Projektion. **Aufwand: M.** Neues Modul `src/sketch/project.ts`.
15. **Sketch Fillet (Eckverrundung)** — Tangentenbogen zwischen zwei Kurven. **Aufwand: S.** Neues Modul `src/sketch/fillet.ts`.
16. **Konstruktionsebene: Offset Plane** — Voraussetzung für viele Solid-Features; Ebene parallel zu Fläche/Plane + Distanz, in CadScene + Skizzen-Auswahl integrieren. **Aufwand: M.** Neues Modul `src/construct/plane.ts`.
17. **Konstruktionsachse + Konstruktionspunkt** — Ergänzt Konstruktionsgeometrie (Through-Edge, Two-Points, Vertex, Circle-Center). **Aufwand: M.** Neues Modul `src/construct/axis-point.ts`.
18. **Sweep (Profil entlang Pfad)** — Wichtige fehlende Create-Operation; Profil-Frames entlang diskretisiertem Pfad → Loft-Ringe. **Aufwand: L.** Neues Modul `src/solid-sweep.ts` + WASM `wasm-stl/src/sweep.rs` (`sweep_profile_json`).
19. **Primitive: Box / Cylinder / Sphere** — Schnelle Modellierung ohne Skizze; parametrische Mesh-Generierung. **Aufwand: M.** Neues Modul `src/solid-primitives.ts` (+ optional WASM-Tessellator).
20. **Mesh Reduce (Decimation)** — Kern für Scan-Workflow (Quadric-Edge-Collapse). **Aufwand: L.** WASM `wasm-stl/src/decimate.rs` (`mesh_reduce_json`) + `src/mesh/reduce.ts`.
21. **Mesh Erase & Fill (Hole-Fill)** — Essentiell für lückenhafte Scans; Boundary-Loop-Erkennung + Triangulation. **Aufwand: L.** WASM `wasm-stl/src/holefill.rs` + `src/mesh/erase-fill.ts`.
22. **Make Closed Mesh (Watertight/Manifold-Repair)** — Voraussetzung für robuste Booleans & 3D-Druck. **Aufwand: L.** WASM `wasm-stl/src/repair.rs` + `src/mesh/make-closed.ts`.
23. **Sektion-/Schnittanalyse (Live Section Plane)** — Inspect-Standard; Three.js Clipping-Plane über alle sichtbaren Bodies. **Aufwand: M.** Neues Modul `src/inspect/section.ts`.
24. **Interference / Kollisionsprüfung** — Überlappungsvolumen zweier Bodies via Boolean-Intersect-Reuse. **Aufwand: M.** Neues Modul `src/inspect/interference.ts` (nutzt P0-#3-Kernel).
25. **OBJ-Export + OBJ-Import** — Erweitert IO über STL hinaus (mit Normalen). **Aufwand: M.** WASM `wasm-stl/src/obj.rs` + `src/io/obj.ts`.
26. **Sketch-Kreis-Varianten (2-Punkt / 3-Punkt) + Center-Point-Arc** — Vervollständigt häufige Skizzen-Primitive. **Aufwand: S.** Erweiterung `src/sketch-geometry.ts` + Buttons.
27. **Slot-Werkzeug (Center-to-Center + Overall)** — Häufige Skizzengeometrie. **Aufwand: M.** Neues Modul `src/sketch/slot.ts`.
28. **Pattern on Path (Body)** — Ergänzt Rect/Circ; Duplikate entlang Pfadkurve. **Aufwand: M.** Erweiterung `src/main.ts` Pattern-Logik / neues `src/solid/pattern-path.ts`.
29. **Ellipse + Polygon (Inscribed/Circumscribed)** — Lückenschluss Skizzen-Primitive. **Aufwand: S.** Erweiterung `src/sketch-geometry.ts`.

### P2 — Fortgeschritten (hoher Aufwand oder Nischennutzen)

30. **Echtes parametrisches Timeline-Replay mit Roll-Back** — Wandelt das Display-Log in editierbare Feature-History; erfordert Feature-Re-Execution-Modell. **Aufwand: L.** Refactor `src/feature-timeline.ts` → `src/timeline/parametric.ts` + Feature-Recompute-Engine.
31. **Vollständiger Constraint-Solver Phase 2 (tangent, concentric, equal, symmetric, midpoint, fix)** — Aufbauend auf #11. **Aufwand: L.** Erweiterung `src/sketch/solver.ts`.
32. **Surface-Workspace-Grundlage: Patch (Boundary Fill) + Stitch** — Ermöglicht Flächen-zu-Solid-Workflows. **Aufwand: L.** Neues Modul `src/surface/patch.ts` + `src/surface/stitch.ts` (+ WASM).
33. **Mesh Remesh (uniforme Re-Triangulation)** — Saubere Topologie für Scans; isotropes Remeshing. **Aufwand: L.** WASM `wasm-stl/src/remesh.rs` + `src/mesh/remesh.ts`.
34. **Surface Offset / Thicken (Skin→Solid)** — Wand aus Scan-Oberfläche. **Aufwand: L.** WASM `wasm-stl/src/thicken.rs` + `src/surface/thicken.ts`.
35. **Mesh-zu-BRep / Convert Mesh (faceted/prismatic)** — Brücke zu parametrischer Welt. **Aufwand: L.** WASM `wasm-stl/src/mesh_to_brep.rs` (mind. faceted) + `src/mesh/convert.ts`.
36. **Fillet/Chamfer auf Mesh-Kanten** — i18n existiert; Mesh-Kanten-Rundung via lokale Subdivision/Bevel. **Aufwand: L.** WASM `wasm-stl/src/bevel.rs` + `src/mesh/fillet.ts`.
37. **Shell / Hollow (Mesh)** — i18n existiert; Inneroffset + Cap. **Aufwand: L.** WASM `wasm-stl/src/shell.rs` + `src/mesh/shell.ts`.
38. **Draft-Analyse + Zebra/Curvature-Visualisierung** — Surface-Quality-Inspect; Shader-basierte Färbung. **Aufwand: M.** Neues Modul `src/inspect/surface-analysis.ts` (Custom-Shader).
39. **Point Cloud → Mesh (Poisson/Ball-Pivoting)** — Erweitert Scan-Pipeline auf Rohpunktwolken. **Aufwand: L.** WASM `wasm-stl/src/reconstruct.rs` + `src/mesh/reconstruct.ts`.
40. **Benannte Parameter / Gleichungen (Change Parameters)** — Voraussetzung für echte Parametrik; Ausdruck-Parser + Binding an Bemaßungen/Features. **Aufwand: L.** Neues Modul `src/params/parameters.ts` + Integration in Dimension-/Feature-Eingaben.

> **Hinweis zur Roadmap-Kohärenz:** P0 liefert sofort sichtbaren Inspect-/Navigations-Mehrwert ohne neuen Kernel. Die mit Abstand größte Paritäts-Hebelwirkung liegt bei **#11 (Constraint-Solver)** und **#30 (parametrisches Timeline)** — sie verschieben das Werkzeug von „Direkt-Mesh-Tracer" Richtung „parametrisches CAD". Die WASM-lastigen Mesh-Reparatur-Items (#20–#22) haben für die *Scan-Tracer-Kern-Identität* den höchsten praktischen Nutzen und sollten parallel zu #11 priorisiert werden.

---

## Verifikations-Anhang (adversarial)

Based on my systematic code review against the claims in `docs/DESIGN-hybrid-cad.md` (lines 32-40), here are my findings:

| Behauptung | Urteil | Beleg |
|---|---|---|
| **Solid ribbon — 9 working features** | OVERSTATED | `src/solid-features.ts:105-116` lists 10 WORKING_SOLID_FEATURES: extrude, revolve, loft, press-pull, split-body, rect-pattern, circ-pattern, mirror, join, **subtract**. Document claims 9; actual count is **10**. |
| **Join = vertex concatenation (mergeBodyGeometries)** | CONFIRMED | `src/body-edit.ts:353-402` implements concatenation exactly as stated — vertex + index offset stacking with no boolean. |
| **Negativform → promoteLoftToNewBody labels body "Negativform"** | CONFIRMED | `src/main.ts:3248` calls `promoteMeshToNewBody(mesh, 'Negativform', {...bodyKind: 'loft'...})` as claimed. |
| **Body model — CadBodyRecord has no bodyKind (claimed gap)** | OVERSTATED | `src/cad-scene.ts:30` shows `bodyKind: BodyKind` **is** implemented on CadBodyRecord. Design doc claims this as a gap; it was already added. |
| **Project I/O — pack_project / unpack_project in wasm-stl/src/project.rs** | CONFIRMED | WASM exports exist; document refers to single STL but actual implementation uses `pack_project_multi` (`src/main.ts:3663-3664`) for multi-body archive. |
| **Workspaces = sketch \| body \| contour** | CONFIRMED | `src/workspace-mode.ts:2, 43-50` implements exactly three workspace modes. |
| **Timeline — src/history-timeline.ts + src/undo.ts** | CONFIRMED | Both files exist. `undo.ts:1-30` defines `AppSnapshot`, `TimelineView`. `history-timeline.ts` renders undo steps. |
| **Subtrahieren button missing; i18n exists but no kernel** | OVERSTATED | `index.html:311-313` has button `data-solid-feature="subtract"`. `src/wasm.ts:6, 28` exports `mesh_boolean_subtract_json`. `wasm-stl/src/boolean.rs:70-84` implements full Manifold-based boolean subtract. **All three components exist.** |
| **saveProject() requires meshBuffer guard** | CONFIRMED BUT RELAXED | `src/main.ts:3616` does guard on `!meshBuf && !projectHasSketchData()`. However, if *either* meshBuffer *or* sketch data exists, save proceeds. Design doc's "known gap" is **partially fixed** — sketch-only save now works if `projectHasSketchData()` is true (3605-3611). |
| **PROJECT_VERSION = 4** | OVERSTATED | `src/project-file.ts:9` shows `PROJECT_VERSION = 6`, not 4. Document is outdated by two versions. |
| **Origin planes — XY/XZ/YZ clickable for sketch start** | CONFIRMED | `src/sketch.ts:24-39, 137-156` implements all three origin planes with click detection via `originPlaneAxisFromObject()`. |
| **bodyKind type: scan \| solid \| loft (claimed PR1 goal)** | CONFIRMED | `src/body-kind.ts:6` defines `BodyKind = 'scan' \| 'solid' \| 'loft'` already implemented. |

### Summary of Overstatements

**3 major discrepancies:**

1. **Subtract feature fully shipped**, not missing — button, i18n, WASM kernel all present. Design doc treats this as phase PR4 deliverable still pending; actual code shows it **already merged and working**.
2. **bodyKind implemented on CadBodyRecord** — design doc lists this as a required PR1 goal; code shows it shipped (30+ commits ago implied by version 6).
3. **PROJECT_VERSION 6 (not 4)** — document references v4 baseline but actual schema is v6, meaning design roadmap is 2 versions behind reality.

### Flagged Improvements Over Stated Status

**Sketch-only save**: Design doc (line 208) claims blocker `saveProject()` requires mesh. Actual code (3616-3618) **does allow** sketch-only save if contours/sketches/dimensions exist — guard is conditional, not absolute. **Status: MORE COMPLETE than stated.**
