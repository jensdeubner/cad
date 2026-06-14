# Parallel-Agent-Entwicklung: Fusion-360-Parität in Worktrees

| Feld | Wert |
|------|------|
| **Status** | Aktiv |
| **Datum** | 2026-06-14 |
| **Repo** | `/Users/jens/Documents/test5/scan-tracer` (package `cad`) |
| **Ziel** | 5–10 Agents entwickeln **gleichzeitig** Fusion-360-Features, ohne sich in die Quere zu kommen, und **garantieren** per Chrome-MCP/Playwright, dass jedes Feature wirklich funktioniert |
| **Verwandt** | `docs/FUSION-360-PARITY.md` (Lücken-Matrix + Backlog), `AGENTS.md`, `src/ARCHITECTURE.md`, `docs/DESIGN-hybrid-cad.md` |

> **Kurzfassung:** Jeder Agent bekommt **einen eigenen git-Worktree**, **eine eigene Branch**, **einen eigenen Dev-Port** und **ein eigenes neues Modul-File**. Die wenigen, unvermeidbaren gemeinsamen Dateien werden über einen einmaligen **Registry-Seam** (PR0) und **append-only-Konventionen** entkoppelt. Ein Feature gilt erst als „fertig“, wenn ein **committeter Playwright-E2E-Test grün** läuft, `typecheck` + `build` + `vitest` bestehen und **null Konsolenfehler** auftreten.

---

## 1. Warum naive Parallelität scheitert

`src/main.ts` ist mit **~5.857 Zeilen** der zentrale Integrations-Hub: Boot, Pointer-Routing, Tool-Switching, Projekt-I/O, alle Feature-Trigger. Wenn 8 Agents alle in `main.ts` + `index.html` + `i18n/de.ts` schreiben, gibt es beim Merge unweigerlich harte Konflikte — auch in getrennten Worktrees, denn der Konflikt entsteht erst beim Zusammenführen.

### Die „Hot Files" (gemeinsame Kollisionsflächen)

| Datei | Warum jeder sie anfassen will | Entkopplung |
|-------|-------------------------------|-------------|
| `src/main.ts` (~5857 Z.) | Feature-Trigger, Pointer-Branches, Wiring | **Registry-Seam** (PR0) → Agent fasst sie **nicht** mehr an |
| `index.html` (~49 KB) | Ribbon-Button pro Feature | **Buttons aus Registry generieren** (PR0) oder 1 Button am Marker |
| `src/solid-features.ts` | `SolidFeatureId`-Union + `switch` + `WORKING_SOLID_FEATURES` | Durch Registry ersetzt; sonst append-only |
| `src/i18n/de.ts` + `en.ts` | Label/Status-Strings | **Pro-Feature-Namespace**, append am Marker, je 1 Block |
| `src/types.ts` | `Tool`-Union für neue Tools | Append am Marker; Tools sparsam |
| `src/style.css` | Feature-CSS | **Pro-Feature-CSS-File** unter `src/styles/<feature>.css` |
| `wasm-stl/src/lib.rs` | neue WASM-Exporte | **Pro-Feature `wasm-stl/src/<feature>.rs`** + 1 `mod`-Zeile |
| `src/project-file.ts` | neue Persistenz-Felder | Serialisiert über Registry; sonst append-only |

**Grundprinzip:** Konflikte verschwinden, wenn (a) der Großteil der Arbeit in **neuen, exklusiv gehörenden Dateien** liegt und (b) die restlichen Berührungen auf **append-only-Einfügepunkte an definierten Markern** reduziert werden, die git fast immer automatisch mergt.

---

## 2. Lösungsarchitektur

### 2.1 PR0 — Der Feature-Registry-Seam (Voraussetzung, EIN Agent zuerst)

**Bevor** die Feature-Agents starten, baut **ein** Agent (solo, auf `main`) eine Registry, damit Feature-Module sich selbst registrieren, statt `main.ts`/`solid-features.ts`/`index.html` zu editieren.

**Neue Dateien:**

```
src/features/registry.ts      # registerFeature(), getFeatures(), FeatureDef
src/features/index.ts         # Barrel: import './solid-extrude'; import './solid-fillet'; ...  (append-only)
src/features/host.ts          # FeatureHost-Interface (Zugriff auf scene, undo, wasm, status)
```

```ts
// src/features/registry.ts
export interface FeatureDef {
  id: string;                       // 'fillet'
  tab: 'solid' | 'sketch' | 'body' | 'construct' | 'inspect';
  group: string;                    // i18n-Key der Ribbon-Gruppe
  labelKey: string;                 // i18n-Key des Buttons, z.B. 'solid.fillet'
  icon?: string;
  run: (host: FeatureHost) => void; // startet das Kommando
}
const REGISTRY: FeatureDef[] = [];
export function registerFeature(def: FeatureDef) { REGISTRY.push(def); }
export function getFeatures() { return REGISTRY.slice(); }
```

`main.ts` ändert sich **einmalig**: statt des großen Host-Literals (heute ~Zeile 5830 `bindSolidFeatureButtons({...})`) ruft es `mountFeatures(getFeatures(), host)` auf, das die Ribbon-Buttons **aus der Registry rendert** und bindet. Danach editiert **kein** Feature-Agent mehr `main.ts` oder `index.html`.

**Ergebnis:** Ein neues Feature = **1 neue Datei** `src/features/solid-<feature>.ts` (ruft `registerFeature(...)`) + **1 append-Zeile** im Barrel `src/features/index.ts` + ein i18n-Block. Mehr nicht.

> Wenn PR0 zu groß erscheint: Minimal-Variante — Buttons bleiben in `index.html`, aber jeder Agent fügt seinen Button an einem **HTML-Kommentar-Marker** ein (`<!-- @feature-buttons:solid -->`) und registriert den Handler über die Registry statt über das `main.ts`-Host-Literal. Das eliminiert den `main.ts`-Konflikt (der teuerste) auch ohne Button-Generierung.

### 2.2 „One feature = one new module" (File-Ownership)

Jeder Agent **besitzt exklusiv**:

```
src/<domäne>/<feature>.ts               # Domänen-Logik (src/inspect/, src/mesh/, src/sketch/, src/nav/, src/construct/, …)
src/features/<feature>.ts               # dünner Registrierungs-Eintrag: ruft registerFeature() + delegiert an die Domänen-Logik
src/styles/<feature>.css                # optionales CSS (statt style.css)
wasm-stl/src/<feature>.rs               # optional, falls Kernel nötig
test/e2e/<feature>.spec.ts              # Pflicht: Playwright-E2E-Test
test/unit/<feature>.test.ts             # optional: reine Mathe/Geometrie
```

Niemand sonst schreibt in diese Dateien. Damit ist der **Großteil** des Codes konfliktfrei.

> **Wo die Logik liegt:** Domänen-Code gehört in den passenden Domänen-Ordner (`src/inspect/measure.ts`), **nicht** in einen Sammeltopf. Im Barrel `src/features/index.ts` wird genau **die** Datei importiert, die `registerFeature()` aufruft — egal ob das der dünne `src/features/<feature>.ts`-Eintrag ist oder (bei kleinen Features) direkt das Domänen-Modul. Wichtig ist nur: **eine** Registrierungs-Datei pro Feature, exklusiv dem Agent gehörend.

### 2.3 Append-only-Konventionen für die Rest-Berührungen

Drei Dateien lassen sich nicht ganz vermeiden. Regeln:

- **`src/i18n/de.ts` / `en.ts`** — jeder Agent fügt **genau einen** zusammenhängenden Block direkt **unter** dem Marker `// @i18n:append` (ans Datei-Ende, vor `};`) ein, mit Feature-Präfix:
  ```ts
  // @i18n:append
  'solid.fillet.dialog': 'Verrundung',
  'solid.fillet.radiusPrompt': 'Radius (mm):',
  'status.fillet.done': 'Verrundung erstellt',
  ```
  Reihenfolge egal, ein Block pro Agent → git mergt parallele Anhänge meist automatisch; bei Konflikt ist es ein trivialer „beide behalten".
- **`wasm-stl/src/lib.rs`** — nur **eine** Zeile `mod fillet; pub use fillet::*;` am `// @wasm:modules`-Marker. Die Implementierung lebt in `wasm-stl/src/fillet.rs`.
- **`src/features/index.ts` (Barrel)** — eine `import './solid-fillet';`-Zeile am `// @features:append`-Marker.

> **Goldene Regel:** Niemals bestehende Zeilen in Hot Files **umschreiben** — nur am Marker **anhängen**. Umschreiben = Konflikt; Anhängen = auto-merge.

### 2.4 Worktree-Isolation

```bash
# Vom Repo-Root, EINMALIG pro Agent (Branch von PR0-main!):
git worktree add ../wt-measure    -b feat/measure    main   # A1
git worktree add ../wt-intersect  -b feat/intersect  main   # A2
# ... ein Worktree + eine Branch pro Agent (A1…A9)

# node_modules + WASM-pkg NICHT neu installieren (gitignored, fehlen im Worktree).
# Stattdessen aus dem Haupt-Checkout symlinken (spart Minuten + GBs):
ln -s ../scan-tracer/node_modules      ../wt-measure/node_modules
ln -s ../scan-tracer/wasm-stl/pkg      ../wt-measure/wasm-stl/pkg   # nur für TS-only-Agents; WASM-Agents bauen pkg selbst
```

- Jeder Worktree = eigener Branch, eigener Arbeitsbaum → **null** gegenseitige Schreibkonflikte während der Entwicklung.
- WASM-Agents bauen `wasm-stl/pkg` in **ihrem** Worktree (`npm run build:wasm`) statt zu symlinken.
- Tipp: `git worktree add --detach` vermeidet versehentliches Mehrfach-Auschecken derselben Branch.

### 2.5 Dev-Server-Ports (parallele Vorschau)

Jeder Agent startet seinen eigenen Vite-Server auf einem **eindeutigen Port** (5173/5174 sind belegt):

| Agent | Port | Befehl |
|-------|------|--------|
| A1 | 5181 | `npm run dev -- --port 5181 --strictPort` |
| A2 | 5182 | `npm run dev -- --port 5182 --strictPort` |
| … | … | … |

`--strictPort` verhindert das stille Hochzählen, damit der Playwright-`baseURL` deterministisch bleibt.

---

## 3. Pflicht: Chrome-MCP / Playwright-Verifikation (100 %-Garantie)

**Ein Feature ist nur dann „fertig", wenn ein Agent es im echten Browser durchgespielt und automatisiert grün getestet hat.** Zwei Ebenen:

### 3.1 Interaktive Verifikation während der Entwicklung (Chrome-DevTools-MCP / Playwright-MCP)

Der Agent treibt den Browser live, um sein Feature manuell zu validieren:

1. `navigate_page` → `http://localhost:<port>/`
2. `wait_for` Boot fertig (z. B. Text „Skizze" sichtbar)
3. `list_console_messages` → **muss frei von Errors/Exceptions sein** (Baseline!)
4. `take_snapshot` → DOM-Refs der Ribbon-Buttons holen
5. `click` auf den Feature-Button, Workflow durchspielen (z. B. Skizze → Profil → `fillet` → Kante wählen → Radius)
6. `evaluate_script` → Zustand prüfen (z. B. `window.__cadDebug.bodyCount()` stieg, Geometrie verändert)
7. `take_screenshot` → visueller Beleg, ablegen unter `.shots/<feature>-after.jpeg`
8. erneut `list_console_messages` → **immer noch null Errors**

> Es existieren bereits Baselines in `.shots/` (`baseline-empty.jpeg`, `baseline-sketch.jpeg`) und MCP-Logs unter `.playwright-mcp/`, vom Test-Harness-Setup. Daran anknüpfen.

### 3.2 Committeter, automatisierter E2E-Test (die eigentliche Garantie)

Interaktive MCP-Sessions sind flüchtig. Die **belastbare Garantie** ist ein **committeter Playwright-Test**, der headless grün läuft und in CI/lokal reproduzierbar ist.

Empfohlenes Setup (PR0 oder ein dedizierter Harness-Agent legt es an):

```bash
npm i -D @playwright/test
npx playwright install chromium
```

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './test/e2e',
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5181', headless: true },
  webServer: {
    command: `npm run dev -- --port ${process.env.E2E_PORT ?? 5181} --strictPort`,
    url: process.env.E2E_BASE_URL ?? 'http://localhost:5181',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
```

Jeder Feature-Agent committet `test/e2e/<feature>.spec.ts` nach diesem Muster:

```ts
import { test, expect } from '@playwright/test';

test('Fillet: erzeugt verrundete Kante ohne Konsolenfehler', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/');
  await page.getByText('Skizze').waitFor();

  // 1. Profil anlegen (Workflow des Features durchspielen)
  // ... Skizze auf XY, Rechteck, Extrude ...

  // 2. Feature ausführen
  await page.locator('[data-feature="fillet"]').click();
  // ... Kante picken, Radius eingeben ...

  // 3. Harte Behauptung über echten Zustand (nicht nur „Button da")
  const bodyCount = await page.evaluate(() => (window as any).__cadDebug.bodyCount());
  expect(bodyCount).toBeGreaterThan(0);

  // 4. Null Konsolenfehler = nicht verhandelbar
  expect(errors, errors.join('\n')).toHaveLength(0);

  // 5. Visueller Regressions-Beleg
  await expect(page).toHaveScreenshot('fillet-result.png', { maxDiffPixelRatio: 0.02 });
});
```

> **Debug-Hook benötigt:** Damit Tests echten Zustand prüfen können (statt nur DOM), exponiert PR0 ein schmales `window.__cadDebug` (read-only Getter: `bodyCount()`, `sketchCount()`, `activeTool()`, `lastFeature()`). Das ist die Brücke zwischen „Button geklickt" und „hat wirklich etwas gebaut".

### 3.3 Definition of Done (pro Feature, nicht verhandelbar)

Ein Agent darf erst dann „fertig" melden, wenn **alle** Punkte grün sind:

- [ ] `npm run typecheck` — keine TS-Fehler
- [ ] `npm run build` — WASM + Vite-Build erfolgreich
- [ ] `npm run test` — vitest grün (inkl. neuer Unit-Tests, falls Geometrie-Mathe)
- [ ] `npx playwright test test/e2e/<feature>.spec.ts` — **grün**
- [ ] E2E-Test enthält **mindestens eine harte Zustands-Assertion** (`__cadDebug`), nicht nur „Element sichtbar"
- [ ] **Null** Konsolen-Errors/`pageerror` während des E2E-Laufs
- [ ] Screenshot-Beleg in `.shots/<feature>-*.jpeg`
- [ ] Feature funktioniert in **DE und EN** (Locale-Switch im Test oder zweiter Lauf)
- [ ] Nur eigene Dateien + erlaubte Marker-Anhänge verändert (`git diff --stat` prüfen)

---

## 4. Merge- & Integrations-Reihenfolge

Parallel entwickeln, **seriell integrieren** — so bleiben die wenigen Hot-File-Anhänge konfliktfrei:

```
1. PR0 (Registry-Seam + Playwright-Harness + __cadDebug)   ← MUSS zuerst auf main
   └─ alle Feature-Worktrees danach von diesem main neu basieren/rebasen
2. WASM-Features zuerst mergen (bauen pkg), TS-only danach
3. Pro Merge: Branch auf aktuelles main rebasen → `npm run build` + Feature-E2E → squash-merge
4. Bei i18n-/Barrel-Konflikt: beide Blöcke behalten (Anhänge, nie Umschreibungen)
5. Nach jedem Merge: vollständige E2E-Suite (`npx playwright test`) als Regressionsschranke
```

Ein **Integrator** (Mensch oder ein koordinierender Agent) führt diese Sequenz aus; die Feature-Agents pushen nur ihre Branch + grüne Tests.

---

## 5. Agent-Zuteilung (Welle 1: PR0 + 9 Feature-Agents)

> Quelle: `docs/FUSION-360-PARITY.md` (priorisierter Backlog P0/P1/P2). **Einziges hartes Kriterium: disjunkte Dateimengen.** Jeder Agent legt seine Logik in **neue, exklusiv besessene** Dateien und klinkt sich per `registerFeature()` ein. Berührungen an Hot Files nur als **Marker-Anhang** (i18n-Block, `mod`-Zeile, Barrel-Import).

**Zuerst, solo, auf `main`:**

| Agent | Aufgabe | Eigene Dateien | Port |
|-------|---------|----------------|------|
| **PR0** | Feature-Registry-Seam + Playwright-Harness + `window.__cadDebug` + alle `@…:append`-Marker setzen | `src/features/{registry,index,host}.ts`, `src/features/mount.ts`, `playwright.config.ts`, `test/e2e/_helpers.ts`; **einmalig** `main.ts`/`index.html` (Mount + Debug-Hook) | – |

**Danach parallel (alle basieren auf PR0-`main`):** jeder Agent bekommt eigenen Worktree (`../wt-<id>`), Branch (`feat/<id>`), Port.

| Agent | Feature(s) (Backlog#) | Eigene Dateien | WASM? | Port |
|-------|-----------------------|----------------|-------|------|
| **A1** | 3D-Messen + Modell-Statistik (Vol/Fläche/COM) (#1, #2) | `src/inspect/measure.ts`, `src/inspect/model-stats.ts`, `wasm-stl/src/measure.rs`, `test/e2e/measure.spec.ts` | ✅ `measure.rs` | 5181 |
| **A2** | Boolean **Intersect** + Interferenz-Prüfung (#3, #24) | `src/inspect/interference.ts`, `src/features/solid-intersect.ts`, `test/e2e/intersect.spec.ts`; **append** in `wasm-stl/src/boolean.rs` (`mesh_boolean_intersect_json`) | ✅ `boolean.rs` (allein) | 5182 |
| **A3** | Kamera Persp/Ortho + „Look At" + Named Views (#4, #5, #7) | `src/nav/camera-modes.ts`, `src/nav/named-views.ts`, `test/e2e/camera.spec.ts` | – | 5183 |
| **A4** | Reverse Normal + Make Closed (Watertight) (#6, #22) | `src/mesh/reverse-normal.ts`, `src/mesh/make-closed.ts`, `wasm-stl/src/repair.rs`, `test/e2e/mesh-repair.spec.ts` | ✅ `repair.rs` | 5184 |
| **A5** | Mesh Reduce (Decimation) + Erase & Fill (Hole-Fill) (#20, #21) | `src/mesh/reduce.ts`, `src/mesh/erase-fill.ts`, `wasm-stl/src/decimate.rs`, `wasm-stl/src/holefill.rs`, `test/e2e/mesh-reduce.spec.ts` | ✅ `decimate.rs`,`holefill.rs` | 5185 |
| **A6** | Sketch **Trim/Extend/Offset/Fillet** (#12, #13, #15) | `src/sketch/trim-extend.ts`, `src/sketch/offset.ts`, `src/sketch/fillet.ts`, `test/e2e/sketch-modify.spec.ts` | – | 5186 |
| **A7** | Sketch-Primitive: Kreis-Varianten, Center-Arc, Ellipse, Polygon, Slot (#26, #27, #29) | `src/sketch/primitives-extra.ts`, `src/sketch/slot.ts`, `test/e2e/sketch-primitives.spec.ts` | – | 5187 |
| **A8** | Konstruktionsgeometrie: Offset-Plane + Achse + Punkt (#16, #17) | `src/construct/plane.ts`, `src/construct/axis-point.ts`, `test/e2e/construct.spec.ts` | – | 5188 |
| **A9** | **Sweep** + Primitive Box/Cylinder/Sphere (#18, #19) | `src/features/solid-sweep.ts`, `src/solid-primitives.ts`, `wasm-stl/src/sweep.rs`, `test/e2e/sweep.spec.ts` | ✅ `sweep.rs` | 5189 |

**Disjunktheit geprüft:** Kein TS-Modul und keine `.rs`-Datei wird von zwei Agents besessen. Die einzigen geteilten Berührungen sind reine **Anhänge** an `i18n/de.ts`+`en.ts` (je 1 Block pro Agent), `wasm-stl/src/lib.rs` (`mod`-Zeile pro WASM-Agent am `@wasm:modules`-Marker) und `src/features/index.ts` (Barrel-Import pro Agent). `boolean.rs` wird nur von A2 angefasst.

**Integrations-Reihenfolge:** PR0 → WASM-Agents (A1, A2, A4, A5, A9 — `pkg` einmal neu bauen) → TS-only-Agents (A3, A6, A7, A8). Siehe §4.

### Welle 2 (nach Welle 1, teils solo)

Diese Features sind **die größten Paritäts-Hebel**, aber zu tief verzahnt für naive Parallelität — sie laufen als eigene, koordinierte Welle:

| Agent | Feature (Backlog#) | Warum nicht in Welle 1 |
|-------|--------------------|------------------------|
| **B1 (solo)** | Sketch-**Constraint-Solver** Phase 1 (#11) | Berührt Skizzen-Kernzustand; A6/A7 sollten danach Constraint-aware werden |
| **B2 (solo)** | Parametrisches **Timeline-Replay** mit Roll-Back (#30) | Erfordert Feature-Recompute-Engine; betrifft alle Feature-Module |
| **B3** | Sketch **Project** (Modellkanten→Ebene) (#14) | Hängt von B1-Referenzmodell ab |
| **B4** | Surface-Grundlage: Patch + Stitch (#32) | Neuer Workspace; nach Mesh-Repair (A4/A5) sinnvoll |

---

## 6. Anti-Konflikt-Checkliste (für jeden Feature-Agent)

**DO**
- In eigenem Worktree + eigener Branch arbeiten, von aktuellem `main` (nach PR0) ausgehen.
- Den Großteil der Logik in das **eigene Modul** legen; per `registerFeature()` einklinken.
- i18n/Barrel/WASM nur **am Marker anhängen**, je ein Block.
- Vor „fertig": `git diff --stat` — Berührungen außerhalb eigener Dateien rechtfertigen.
- Deutsche UI-Strings; `npm run build` muss grün sein.

**DON'T**
- `main.ts`, `index.html`, `solid-features.ts` **inhaltlich umbauen** (nur Registry nutzen).
- Bestehende i18n-/Barrel-Zeilen umsortieren oder umschreiben.
- `style.css` editieren (eigenes `src/styles/<feature>.css` + Import im Modul).
- node_modules/pkg pro Worktree neu installieren, wenn Symlink reicht.
- „Fertig" melden ohne grünen Playwright-E2E-Test + null Konsolenfehler.

---

*Lebendiges Dokument — Abschnitt 5 wird aus dem Parity-Backlog finalisiert.*
