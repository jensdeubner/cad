# Feature-Agent-Briefing (Wave-Worktrees)

Du entwickelst **ein** Fusion-360-Paritäts-Feature in deinem **eigenen git-Worktree** auf
deiner **eigenen Branch**. Du baust gegen den **PR0-Registry-Seam** (`src/features/`).
Befolge dieses Briefing exakt — es garantiert konfliktfreie Parallelarbeit + grüne Integration.

## Goldene Regeln (Datei-Eigentum)

**Du DARFST schreiben:**
- deine **eigenen neuen** Module (`src/<domäne>/<feature>.ts`, `src/features/<feature>.ts`)
- deinen **eigenen** E2E-Test `test/e2e/<feature>.spec.ts` (Endung `.spec.ts`!)
- optional `test/unit/<feature>.test.ts` (Endung `.test.ts`, wird von vitest erfasst)

**Du DARFST nur am Marker ANHÄNGEN (nie bestehende Zeilen umschreiben/umsortieren):**
- `src/i18n/de.ts` **und** `src/i18n/en.ts` — genau **ein** zusammenhängender Block direkt
  **unter** der Zeile `// @i18n:append`, mit Feature-Präfix. **Beide** Sprachen, gleiche Keys.
- `src/features/index.ts` — genau **eine** `import './<feature>';`-Zeile direkt **über** `// @features:append`.

**Du DARFST NIEMALS anfassen:** `src/main.ts`, `index.html`, `src/solid-features.ts`,
`src/style.css`, `vite.config.ts`, `playwright.config.ts`, `src/features/{registry,host,mount}.ts`,
`tsconfig.json`, `package.json`. Brauchst du etwas davon → über den `FeatureHost` lösen,
nicht die Datei editieren. (Eigenes CSS: in dein Modul per JS injizieren oder inline-Styles.)

## So registrierst du dein Feature (Vorlage: `src/features/solid-primitives.ts`)

```ts
// src/features/<feature>.ts
import { registerFeature } from './registry';
import type { FeatureHost } from './host';
import { doTheThing } from '../<domäne>/<feature>';

registerFeature({
  id: '<feature-id>',          // eindeutig, kebab-case → data-feature + __cadDebug
  tab: 'body',                 // FusionTab: start|sketch|solid|body|align|draw|contours|view
  group: '<i18n-key der Gruppe>',
  labelKey: '<i18n-key des Buttons>',
  icon: '◆',
  run: (host) => doTheThing(host),  // darf async sein; Fehler fängt der Mounter
});
```
Dann **eine** Zeile in `src/features/index.ts` über `// @features:append`:
`import './<feature>';`

`mount.ts` rendert daraus automatisch einen Ribbon-Button in den passenden Tab — du fasst
`index.html` **nicht** an. Mehrere Features mit gleichem `group`-Key teilen sich eine Ribbon-Gruppe.

## FeatureHost-API (vollständig in `src/features/host.ts`)

```ts
host.THREE                         // geteilte three.js-Instanz
host.t(key, params?)               // i18n
host.setStatus(msg)
host.selectTab(tab)
host.scene / camera / renderer / controls
host.overlay                       // THREE.Group für Overlays (Messlinien, Schnittebene, Achsen…)
host.viewport                      // DOM-Element für Pointer-Listener
host.pickBodySurfaceAt(x, y)       // -> { bodyId, point: Vector3, normal: Vector3 } | null
host.cadScene
host.getBodies() / getBody(id) / getActiveBody() / getActiveComponentId()
host.getContours() / getSketches() / getActiveSketchId()
host.addBodyFromGeometry(geom, labelPrefix, bodyKind?) // -> Promise<bodyId>  (neuer Körper)
host.replaceBodyGeometry(bodyId, geom)                 // -> Promise<void>     (Mesh in-place ersetzen)
host.refreshBrowser()
host.pushUndo(label) / host.pushMeshUndo(label)        // pushMeshUndo VOR Mesh-Mutation!
host.markFeatureDone(featureId, label?)                // setzt __cadDebug.lastFeature()
host.ensureWasm()                  // -> Promise<void>, vor jedem WASM-Aufruf
```
Das aktive Body-Geometry liegt in `host.getActiveBody()?.geometry` (THREE.BufferGeometry).
WASM-Funktionen importierst du bei Bedarf direkt:
`import { mesh_boolean_subtract_json } from '../../wasm-stl/pkg/wasm_stl';` und rufst nach
`await host.ensureWasm();`. **Keinen** neuen Rust-Code — komponiere vorhandene Kernel in TS.

## Testgeometrie ohne STL-Fixture

PR0 liefert Grundkörper. In deinem E2E-Test erzeugst du Testgeometrie deterministisch:
```ts
await page.evaluate(() => (window as any).__cadDebug.runFeature('primitive-box'));    // 20mm Würfel, 12 Tris
// 'primitive-cylinder' | 'primitive-sphere' ebenso verfügbar
```

## window.__cadDebug (read-only Test-Bridge, von PR0)

`bodyCount()`, `sketchCount()`, `contourCount()`, `activeTool()`, `activeWorkspace()`,
`activeBodyId()`, `bodyLabels()`, `lastFeature()`, `features()` (Liste aller registrierten ids),
`status()` (Status-Text), `overlayCount()` (Kinder in host.overlay),
`triangleCount(id?)`, `bbox(id?)` -> {min:[x,y,z], max:[x,y,z]} | null,
`runFeature(id)` -> Promise.

**Eigene Messwerte** exponierst du für den Test über einen **eigenen** Namespace
(NICHT `__cadDebug` erweitern): `(window as any).__cadFeature ??= {}; (window as any).__cadFeature.<id> = {...};`
So kann dein Test harte Zahlen prüfen (Volumen, Flächeninhalt, Vertex-Count …).

## E2E-Muster (Pflicht — Vorlage: `test/e2e/primitives.spec.ts`)

```ts
import { test, expect } from '@playwright/test';
import { bootApp, cadDebug, runFeature, clickFeatureButton, selectTab, expectNoConsoleErrors } from './_helpers';

test('<feature>: <was es tut> ohne Konsolenfehler', async ({ page }) => {
  const guard = await bootApp(page);
  await runFeature(page, 'primitive-box');          // Testgeometrie
  const before = await cadDebug<number>(page, 'bodyCount');

  await runFeature(page, '<feature-id>');           // dein Feature ausführen
  // ... harte Assertion über echten Zustand (__cadDebug oder window.__cadFeature) ...

  expectNoConsoleErrors(guard);                     // NICHT verhandelbar: 0 Konsolenfehler
});
```
Helper in `test/e2e/_helpers.ts`: `bootApp`, `cadDebug`, `runFeature`, `selectTab`,
`clickFeatureButton`, `expectNoConsoleErrors`, `waitForBodyCountAbove`.
Teste **mindestens einmal** auch den echten Ribbon-Button (`selectTab` + `clickFeatureButton`),
nicht nur die Bridge.

## Definition of Done (alle Punkte grün, sonst NICHT „fertig")

Im **Worktree-Root** (dein Pfad), mit deinem Port:
- [ ] `npm run typecheck` — keine TS-Fehler
- [ ] `npm run test` — vitest grün (inkl. evtl. neuer Unit-Tests)
- [ ] `E2E_PORT=<deinPort> npx playwright test test/e2e/<feature>.spec.ts` — **grün**
- [ ] E2E enthält **≥1 harte Zustands-Assertion** + **0 Konsolenfehler**
- [ ] Feature funktioniert in **DE und EN** (i18n-Keys in beiden Katalogen)
- [ ] `git diff --stat feat/pr0-registry-seam` zeigt **nur** erlaubte Dateien
      (eigene Module/Tests + Marker-Anhänge in de.ts/en.ts/features/index.ts)
- [ ] Alles committed auf deiner Branch `feat/<feature>`

Deutsche UI-Strings. Halte dich strikt an Datei-Eigentum — sonst bricht die Integration.
