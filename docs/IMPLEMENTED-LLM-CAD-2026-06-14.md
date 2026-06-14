# Implemented: LLM-driven CAD layer (cad-script)

| Field | Value |
|-------|-------|
| **Date** | 2026-06-14 |
| **Branch** | `feat/llm-cad-script` |
| **Source doc** | `test22/CAD-LLM-Architektur.md` (the architecture recommendation) |
| **Status** | MVP landed — kernel + 3-tool interface + dual track + in-app console, all tested |

---

## What this is

`CAD-LLM-Architektur.md` recommends building an LLM-driven CAD around a few
points: code-as-representation, a small set of powerful tools (`run_cad_code` /
`query_geometry` / `render_view`), a dual track (parametric **and** SDF/organic),
typed selectors instead of fragile ids, and actionable errors closing a
write→execute→observe→repair loop.

The doc assumes a Python `build123d` / `libfive` stack. **This app is a browser
TS + Three.js + Rust-WASM engine**, so the recommendation is implemented *adapted
to this engine* — the agent writes **TypeScript/JS cad-script** against an API
that composes the existing kernel, not Python. The architecture is preserved; the
host language is the one this project already runs.

Everything lives in **`src/cad-script/`** (pure, dependency-light, unit-tested) +
one registry-seam feature **`src/features/cad-script.ts`** (the in-app console),
with a system prompt in `docs/LLM-CAD-SYSTEM-PROMPT.md`.

## Architecture-doc coverage

| Doc § | Recommendation | Status | Where |
|-------|----------------|--------|-------|
| §0 | Code-as-representation; return semantic, queryable geometry | ✅ | whole layer; `runtime.ts` returns structured summaries |
| §2 | ~3 powerful tools, not many atomic ones; persistent sandbox state | ✅ | `tools.ts` (`createCadTools`), `runtime.ts` (persistent `context`) |
| §2 | `run_cad_code` with write→execute→observe→repair | ✅ | `runtime.runCadCode` + console feature |
| §2 | `query_geometry` returns only the relevant geometry | ✅ | `query.ts` + `tools.query_geometry` |
| §2 | `render_view` multi-view feedback | ✅ (framing + in-browser PNG) | `render.ts` + feature `renderViews` |
| §1 Track A | Parametric/mechanical via executable code, B-rep-like | ✅ (mesh CSG, not B-rep) | `primitives.ts`, `sketch.ts`, `csg.ts`, `solid.ts` |
| §1 Track B | Freeform via SDF + **smooth-min** blending | ✅ | `sdf.ts`, `surface-nets.ts` |
| §3 | Actionable errors, not raw stack traces | ✅ | `errors.ts`; runtime returns `{code,message}` |
| §3 | Vision secondary for A, necessary for B | ✅ (documented + render_view) | system prompt + `render.ts` |
| §4 | build123d-style explicit builder/selector semantics + few-shots | ✅ | `solid.ts`/`sketch.ts` API + `LLM-CAD-SYSTEM-PROMPT.md` |
| §5 | Typed selectors (faces/edges/…); `Select.LAST`/`NEW`; sort/filter by position | ✅ | `selectors.ts` |
| §6 | Keep tracks separate; couple at defined hand-offs | ✅ (separate Solid vs Sdf; boolean/shell hand-offs) | `solid.ts` / `sdf.ts` |
| §8 | MVP Track A (run_cad_code + selectors + actionable errors), no vision first | ✅ | this PR |
| §8 | MVP Track B starting point | ✅ (SDF + mesher, not bpy) | `sdf.ts` / `surface-nets.ts` |
| §8 | System prompt seeded with few-shots | ✅ | `docs/LLM-CAD-SYSTEM-PROMPT.md` |

## Deliberately deferred / out of scope (with rationale)

These are called out in the doc itself as hard, unsolved, or environment-specific.
Implementing them faithfully is a research effort, not an MVP, so they are
**documented, not faked** (honouring the project's "no placeholder without
backing" rule):

- **True B-rep kernel + OCCT `BRepTools_History` mapped-name layer (§5).** The doc's
  most robust topological-naming scheme is OCCT-specific. This app has no B-rep
  kernel (geometry is triangle meshes). We deliver the *property-based selector*
  half of §5 (which the doc presents as the primary remedy and the part an agent
  actually uses); the mapped-name history layer would require swapping in OCCT.
- **Manifold/robust booleans on large scan meshes.** Track-A booleans here use a
  self-contained BSP CSG — perfect for the small, clean parametric solids the
  script API generates, and it runs in Node so it's fully unit-tested. The
  existing WASM kernel (`mesh_boolean_subtract_json`) remains the path for big,
  messy scan meshes; wiring the script API onto it for scan-scale inputs is a
  follow-up.
- **Track B via Blender `bpy` / production `libfive`.** The doc's §8 suggests `bpy`
  as the fastest organic path and libfive as the long-term kernel. Neither is
  available in a browser; we implement the SDF *idea* directly (analytic SDFs +
  smooth-min + Surface-Nets mesher), which is the property the doc actually
  argues for.
- **Lossless B-rep ↔ SDF conversion (§6).** The doc states this is unsolved
  (NH-Rep claim refuted). We keep the tracks separate, exactly as recommended.
- **Training-side gains (DPO/RL/GRPO) for vision feedback (§3).** Out of scope for
  an inference-time tool layer.

## Files

```
src/cad-script/
├── mesh.ts            # neutral triangle-mesh value type + weld/volume/bounds/orient/transforms
├── primitives.ts      # box, cylinder, sphere, cone, torus, wedge (manifold, oriented)
├── triangulate.ts     # 2D ear-clipping (extrude/revolve caps)
├── sketch.ts          # work-planes, 2D profiles, extrude, revolve
├── csg.ts             # BSP CSG union/subtract/intersect (provenance-preserving)
├── solid.ts           # Solid class — factories, transforms, booleans, selectors
├── selectors.ts       # typed faces/edges/vertices + ShapeList + Select.LAST/NEW (§5)
├── sdf.ts             # SDF primitives/ops + smooth-min + modifiers (Track B)
├── surface-nets.ts    # SDF → watertight mesh polygonizer
├── errors.ts          # actionable error translation (§3)
├── query.ts           # declarative query DSL over selectors
├── render.ts          # camera framing math for render_view (§3)
├── runtime.ts         # run_cad_code + persistent context + script API
├── tools.ts           # the 3-tool façade (run_cad_code / query_geometry / render_view)
├── geometry.ts        # the one three.js bridge (mesh → BufferGeometry)
└── index.ts           # barrel
src/features/cad-script.ts   # registry-seam feature: the in-app console + window.__cadScript bridge
docs/LLM-CAD-SYSTEM-PROMPT.md
test/cad-script-*.test.ts    # 46 unit tests
test/e2e/cad-script.spec.ts  # browser e2e (loop, tracks, errors, 3-tool API)
```

## Testing

- `npx vitest run` — 1166 unit tests pass (46 new), `tsc --noEmit` clean.
- `npx vite build` — production bundle builds.
- `E2E_PORT=5191 npx playwright test test/e2e/cad-script.spec.ts` — green
  (Track A body, Track B SDF body, actionable error creates none, render_view
  framings, programmatic 3-tool query).

## Integration notes

- Added through the **feature-registry seam** only: one new feature module, one
  append line in `src/features/index.ts`, one i18n block per locale. No edits to
  `main.ts`, `index.html`, `solid-features.ts`, `style.css`, or configs.
- The console panel injects its own scoped `<style>` (id `cad-script-style`) — it
  does not touch `style.css`.
- `window.__cadScript` exposes `{ tools, run, query, lastResult, lastRender }` for
  an MCP server / agent / e2e to drive the three tools headlessly.

## Security note

`run_cad_code` executes arbitrary JS via `new Function` — the same trust level as
the existing `window.__cadDebug.runFeature` dev bridge. It is a local, single-user,
browser-only tool and is handed no network capability. A server-hosted MCP
deployment must sandbox execution (worker/iframe/VM) before exposing it to
untrusted input.
