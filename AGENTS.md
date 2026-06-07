# AGENTS.md — CAD Tracer Onboarding

This document gives new coding agents enough context to work on **CAD Tracer** (`scan-tracer/`) without re-discovering the codebase from scratch.

## What this project is

**CAD Tracer** is a browser-based, Fusion 360–inspired CAD tool for **manual negative-form modeling** from scan meshes and sketches. Users load STL scans, draw contours on work planes, loft closed contours into solid meshes (“Negativform”), edit body meshes, and save everything in a custom `.stpr` project format.

It is **not** a full parametric CAD kernel. There is no constraint solver, no feature tree, and no sketch-to-extrude solid modeling like Fusion. The main “solid” path is **lofting closed contours** via Rust WASM.

**UI language:** German labels throughout (`index.html`, status messages, browser tree). Keep new user-facing strings in German unless explicitly asked otherwise.

---

## Repository & environment

| Item | Value |
|------|-------|
| **Git root** | `scan-tracer/` (not the parent `test5/` folder) |
| **Remote** | `https://github.com/jensdeubner/cad.git` |
| **Default branch** | `main` |
| **Package name** | `scan-tracer` |

The parent folder `test5/` may contain large local STL files (e.g. scan data). `public/scan.stl` is often a symlink for dev — **gitignored** via `*.stl`.

### Commands

```bash
cd scan-tracer
npm install
npm run dev          # Vite dev server, port 5173
npm run build        # build:wasm + vite build
npm run build:wasm   # wasm-pack in wasm-stl/
npm run preview      # preview production build
```

**Requirements:** Node.js, Rust toolchain + `wasm-pack` for WASM builds.

**Vite:** `vite.config.ts` sets COOP/COEP headers (required for WASM threading/shared memory patterns) and excludes `wasm-stl` from `optimizeDeps`.

---

## Tech stack

- **Frontend:** Vite 6, TypeScript, Three.js (Line2, OrbitControls, TransformControls, ViewCube)
- **WASM:** Rust crate `wasm-stl` (wasm-pack, target `web`)
- **Styling:** Single large `src/style.css` — Fusion-style chrome, ribbons, floating panels, browser tree
- **Entry:** `index.html` → `src/main.ts`

---

## Directory layout

```
scan-tracer/
├── index.html              # Fusion-style UI shell (tabs, ribbons, panels, browser)
├── vite.config.ts
├── package.json
├── src/
│   ├── ARCHITECTURE.md     # Module map, extraction plan, patterns
│   ├── main.ts             # Entry: scene boot, pointer routing, DOM wiring (~4800 lines, shrinking)
│   ├── app/                # Constants, DOM refs, utilities, shared types
│   ├── sketch-mode/        # Sketch dimension controller (Fusion-style)
│   ├── tools/              # Tool-mode predicates (orbit, gizmo, sketch primitives)
│   ├── input/              # Global Fusion keyboard shortcuts
│   ├── types.ts            # Tool, Contour, PlaneAxis
│   ├── cad-scene.ts        # Component → Body hierarchy
│   ├── project-file.ts     # .stpr meta schema (PROJECT_VERSION = 4)
│   ├── sketch.ts           # Origin planes, sketch grid, empty-project view
│   ├── sketch-geometry.ts  # Primitives, plane frame, grid snap
│   ├── sketch-dimension.ts # Linear/radius/diameter dimensions + units
│   ├── fusion-shortcuts.ts # Keyboard shortcut resolution
│   ├── app-menu.ts         # Fusion tabs + floating panel wiring
│   ├── browser-panel.ts    # Browser tree rendering (components, bodies, sketches)
│   ├── drawing.ts          # Work plane, ray/plane pick, Line2 contours
│   ├── contour-body.ts     # Contour attachment to bodies
│   ├── contour-spline.ts   # Edit mode, handles, loft point prep
│   ├── body-edit.ts        # Press-pull, smooth, mirror, clip
│   ├── undo.ts             # AppSnapshot + UndoHistory
│   ├── wasm.ts             # WASM init wrapper
│   └── …                   # scan-align, scan-hit, view-cube, etc.
└── wasm-stl/
    ├── src/lib.rs          # STL parse, loft, export
    └── src/project.rs      # pack/unpack .stpr binary
```

---

## Architecture (read this first)

### Scene hierarchy (Fusion-style)

```
THREE.Scene
└── CadScene.root
    └── Component.group (alignment transform)
        └── Body.meshGroup (per-body transform + mesh children)
```

Defined in `cad-scene.ts`. Helpers `ac()` = active component, `ab()` = active body (conventions in `main.ts`).

### Central state (mostly in `main.ts`)

| State | Purpose |
|-------|---------|
| `contours` | Saved contour polylines (also sketch geometry) |
| `sketches` | Sketch records (axis, position, label) on origin planes |
| `sketchDimensions` | Dimension annotations tied to sketches |
| `activeSketchId` | Currently editing sketch, or `null` |
| `activeDraft` | In-progress contour before save |
| `tool` | Active tool (`types.ts` `Tool` union) |
| `cadScene` | Component/body registry |
| `undoHistory` | `UndoHistory` with `AppSnapshot` |

**Undo snapshots** include contours, drafts, alignment, body transforms, optional mesh buffers, sketches, sketch dimensions, and `activeSketchId`. Always pass `sketchDimensions` to `captureSnapshot()` — see `snapshotNow()` in `main.ts`.

### Rendering layers (conceptual)

- **Scan/body meshes** — inside `CadScene` body groups
- **Work plane** — semi-transparent pick surface (`drawing.ts`)
- **Origin planes** — XY/XZ/YZ clickable planes for sketch start (`sketch.ts`)
- **Sketch grid + origin marker** — shown during active sketch
- **Contours** — `Line2` in `drawGroup`
- **Form preview** — loft result before body promotion
- **Sketch dimensions** — sprite labels + extension lines

---

## Core data models

### `Tool` (`types.ts`)

Includes: `navigate`, `align`, `move-body`, `scale-body`, `press-pull`, `smooth-body`, sketch tools (`sketch-pick`, `sketch-line`, `sketch-circle`, `sketch-arc`, `sketch-rect`, `sketch-triangle`, `sketch-dim`), drawing tools (`polyline`, `freehand`, `lasso`, `edit`).

### `Contour`

2D-on-plane geometry stored as 3D points. Can attach to a body (`attachedToBodyId`), belong to a sketch (`sketchId`), and carry spline metadata (`pointTypes`, `handles`).

### `Sketch` (`sketch.ts`)

```ts
{ id, componentId, label, axis: 'xy'|'xz'|'yz', position, visible }
```

Sketch geometry is stored as **contours** with matching `sketchId`, not as a separate geometry buffer.

### `SketchDimension` (`sketch-dimension.ts`)

Kinds: `linear`, `radius`, `diameter`. Units: `mm`, `cm`, `m`, `in`. Stored in project meta and undo snapshots.

### Project meta (`project-file.ts`)

- **Extension:** `.stpr`
- **Meta version:** `PROJECT_VERSION = 4` (JSON inside binary pack)
- **Binary wrapper:** Rust `STPR` magic, gzip — see `wasm-stl/src/project.rs`
- Fields: components, bodies, contours, sketches, sketchDimensions, sketchUnit, planeAxis/position, hitTolerance, active IDs

Version 1/2 projects are migrated on load via `parseProjectMeta()`.

---

## Key user workflows

### 1. Empty project → sketch (Fusion-like)

1. App boots with no mesh → `setupEmptyProjectView()` — isometric camera at origin, labeled XY/XZ/YZ planes visible, work plane hidden.
2. User opens **Skizze** tab → tool `sketch-pick`.
3. Click an origin plane or ribbon XY/XZ/YZ button → `beginSketchOnPlane(axis)`.
4. Sketch grid appears; default tool `sketch-line`. Primitives commit via `commitSketchPrimitive` / drag via `finishSketchDrag`.
5. **Finish sketch** → `finishSketch()` → back to `sketch-pick`, empty view restored if no body mesh.

### 2. Scan-based contour → negative form

1. Load STL → parsed via WASM `parse_stl_with_stride`, displayed in active body.
2. Align scan (`align` tab, plane alignment helpers in `scan-plane-align.ts`).
3. Draw contours on work plane (`polyline`, `freehand`, etc.) — snap/hit against scan optional.
4. Close contours (click start point), save draft.
5. Need **≥2 closed contours** on the **same plane axis** → **Negativform erstellen** → `buildLoft()` → WASM `loft_contours_json` → new body “Negativform N”.

### 3. Sketch dimensions

1. In active sketch, tool `sketch-dim` (shortcut `D`).
2. Pick two points (or center + rim for radius/diameter).
3. `commitSketchDimension` adds to `sketchDimensions`; list panel supports delete.
4. Persisted in `.stpr` and undo stack.

### 4. Save / load project

- **Save:** `saveProject()` — builds meta via `buildProjectMeta()`, packs with `pack_project(metaJson, stlBytes)`.
- **Load:** `loadProjectBuffer()` — `unpack_project()` → `parseProjectMeta()` → restore scene.

**Important limitation:** `saveProject()` currently **requires** `ab().meshBuffer` (a body with mesh data). Empty sketch-only projects cannot be saved yet — this is a known gap if you extend sketch-first workflows.

---

## WASM API (`src/wasm.ts` → `wasm-stl/pkg`)

| Export | Purpose |
|--------|---------|
| `parse_stl` / `parse_stl_with_stride` | STL → `ParsedMesh` (positions, indices, triangle_count) |
| `loft_contours_json` | JSON loft request → `ParsedMesh` |
| `export_binary_stl` | Mesh → binary STL bytes |
| `pack_project` / `unpack_project` | `.stpr` container (gzip JSON meta + STL blob) |

Always call `await initWasm()` before WASM functions.

Loft payload shape (from `buildLoft()`):

```json
{
  "contours": [{ "axis", "position", "points", "closed", "full_3d" }],
  "closed_ends": true
}
```

---

## UI structure

### Fusion tabs (`app-menu.ts`)

`start` | `body` | `align` | `sketch` | `draw` | `view` | `contours`

Each tab maps to a ribbon (`data-ribbon`) and a floating panel (`panel-*` in `index.html`). Panel positions persist in `localStorage` via `FloatingPanel`.

### Browser panel (`browser-panel.ts`)

Fusion-style tree: Components → Bodies / Sketches / Konturen. Visibility toggles for grid, origin planes, work plane, form preview, draft. Refreshed via `refreshBrowserPanel()` from `main.ts`.

### Keyboard shortcuts (`fusion-shortcuts.ts`)

Context-aware via `resolveFusionShortcut(e, { tool, activeSketchId })`.

| Keys | Action |
|------|--------|
| `S` | Enter sketch pick / sketch mode |
| `L/C/R/A` | Line / circle / rectangle / arc (active sketch) |
| `D` | Dimension tool |
| `E` | Edit |
| `Esc` | Cancel / close panels |
| `F` | Fit view |
| `1/2/3` | Top (XY) / Front (XZ) / Side (YZ) |
| `N` | Navigate |
| `M` | Move body |
| `G/R/S` | Gizmo translate / rotate / scale (context-dependent) |
| `W` | World / local toggle |
| `P` | Press-pull |
| `Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y` | Undo / redo |
| `Ctrl+S` | Save project |

Full list with German descriptions: `FUSION_SHORTCUTS` constant. Hints also appear in ribbon `<kbd>` tags and view panel.

---

## Module responsibilities (quick reference)

| File | Responsibility |
|------|----------------|
| `main.ts` | Everything: init, pointer handlers, tool switching, project I/O, loft, browser sync |
| `cad-scene.ts` | Component/body CRUD, transforms, bounds |
| `drawing.ts` | Work plane mesh, plane rays, Line2 helpers |
| `sketch.ts` | Origin plane meshes/sprites, sketch grid, `EMPTY_PROJECT_VIEW_SIZE` |
| `sketch-geometry.ts` | Circle/arc/rect/triangle math, `sketchPlaneFrame`, grid snap |
| `sketch-dimension.ts` | Dimension groups, formatting, unit conversion |
| `contour-spline.ts` | Point editing, handles, insert/delete, loft point extraction |
| `contour-body.ts` | Attach contours to body local space |
| `body-edit.ts` | Press-pull, smooth brush, mirror, clipping |
| `browser-panel.ts` | Pure UI model + DOM render for tree |
| `undo.ts` | Deep-clone snapshots |
| `project-file.ts` | Serializable meta types + migration |
| `fusion-shortcuts.ts` | Shortcut resolution (no DOM) |
| `scan-align.ts` / `scan-plane-align.ts` | Scan orientation |
| `scan-hit.ts` | Ray hit testing against scan mesh |
| `view-cube.ts` | Orientation gizmo |

---

## Pitfalls & bugs already fixed (do not reintroduce)

1. **`originPlanesGroup` timing** — must be added to the scene **after** `scene` exists (was a past boot error).
2. **`captureSnapshot` arity** — all call sites must pass `sketches`, `activeSketchId`, `sketchDimensions` where applicable; `snapshotNow()` is the canonical helper.
3. **Git location** — repo lives in `scan-tracer/`, not `test5/`.
4. **Large files** — `*.stl`, `*.stpr` are gitignored; never commit scan data.
5. **`main.ts` size** — still large (~4800 lines) but refactoring started: `app/`, `sketch-mode/`, `tools/`, `input/`. **Read `src/ARCHITECTURE.md`** before adding features. New logic goes into domain modules with host/factory pattern (see `sketch-mode/dimensions.ts`), not into `main.ts`.
6. **Save without mesh** — `saveProject()` bails if no `meshBuffer`; document or fix if implementing sketch-only save.

---

## Extension guidelines

### Adding a sketch tool

1. Add tool to `Tool` union in `types.ts`.
2. Ribbon button in `index.html` (sketch ribbon) with `data-tool="…"`.
3. Handle in `setTool()` and pointer handlers in `main.ts` (or extract handler module).
4. Commit geometry as a `Contour` with `sketchId` set.
5. Add shortcut in `fusion-shortcuts.ts` if needed.
6. Extend undo via `pushUndo()` before mutating state.
7. Call `refreshBrowserPanel()` after structural changes.

### Adding a project field

1. Extend types in `project-file.ts`.
2. Bump `PROJECT_VERSION` if layout changes; add migration in `parseProjectMeta()`.
3. Update `buildProjectMeta()` usage in `saveProject()` and restore path in `loadProjectBuffer()`.
4. Include in `AppSnapshot` / `captureSnapshot()` if undo should cover it.

### Adding WASM functionality

1. Implement in `wasm-stl/src/`.
2. `wasm-pack build --target web --release`.
3. Re-export from `src/wasm.ts`.
4. Call from `main.ts` after `initWasm()`.

### Testing changes

There is no automated test suite. Manual check:

1. `npm run dev` — empty project sketch flow (planes, grid, line/circle, finish).
2. Load an STL — contours, loft, body move.
3. Save/load `.stpr` round-trip.
4. Undo/redo after sketch + dimension edits.
5. `npm run build` — WASM + Vite production build succeeds.

---

## What is intentionally out of scope (for now)

- Parametric constraints between sketch entities
- True feature tree / timeline
- Sketch profiles → extrude/revolve/sweep as CAD features
- STEP/IGES import/export
- Multi-user / server backend
- English UI (unless requested)

---

## Recent feature history (context)

Built incrementally toward Fusion-like UX:

- Origin plane sketching (XY/XZ/YZ) with grid and origin marker
- Sketch primitives: line, circle, arc, rectangle, triangle, freehand
- Empty-project isometric view with clickable labeled planes
- Sketch dimensions (linear, radius, diameter) with unit settings
- Fusion-style keyboard shortcuts and help text
- Browser tree entries for sketches
- Project format v4 with sketches + dimensions
- GitHub repo published at `jensdeubner/cad`

---

## One-paragraph mental model

**CAD Tracer** = Three.js viewer + Fusion-like shell + contour/sketch drawing on planes + Rust WASM for STL I/O, lofting, and project pack/unpack. State lives mainly in `main.ts` arrays (`contours`, `sketches`, `sketchDimensions`) and `CadScene`. Sketches are metadata + contours on origin planes; solids come from lofting closed contours. Prefer small new modules over expanding `main.ts`; keep UI strings German; run `npm run build` before claiming done.