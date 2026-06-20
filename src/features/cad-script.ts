/**
 * Registry feature: CAD-Skript-Konsole (the LLM-driven CAD layer).
 *
 * This is the in-app embodiment of `CAD-LLM-Architektur.md`: a single
 * code-execution surface (§2 `run_cad_code`) backed by the pure `src/cad-script`
 * kernel, with the write→execute→observe→repair loop made tangible — type a
 * cad-script, run it, see the bodies appear in the scene and a structured,
 * actionable result (or error, §3) below. Track A (parametric/CSG) and Track B
 * (SDF + smooth-min) are both reachable from the same console (§1).
 *
 * The same surface is exposed programmatically on `window.__cadScript` so an MCP
 * server / agent (or the e2e harness) can drive the three tools without the UI.
 *
 * Thin DOM glue only — all geometry/CSG/SDF/selector logic lives in the tested
 * kernel. Scoped styles are injected here (editing `style.css` is forbidden by
 * the feature-seam contract).
 */
import { registerFeature } from './registry';
import type { FeatureHost } from './host';
import {
  createCadTools,
  emittedToMesh,
  meshToGeometry,
  type CadTools,
  type RunResult,
  type ViewName,
} from '../cad-script';

const EXAMPLES: { label: string; code: string }[] = [
  {
    label: 'A · Platte mit Bohrung',
    code: `// Track A — parametrisch: Platte mit Durchgangsbohrung
const plate = box(40, 40, 8);
const hole = cylinder(5, 20);          // Achse Z, ragt durch
emit(plate.cut(hole), "Platte");`,
  },
  {
    label: 'A · Winkel (extrude + cut)',
    code: `// Track A — Skizze extrudieren, dann erleichtern
const base = extrude(rect(40, 30), { plane: "XY", distance: 6 });
const wall = extrude(rect(40, 6),  { plane: "XY", distance: 30 }).translate(0, 12, 0);
const bracket = base.fuse(wall);
emit(bracket.cut(cylinder(4, 40).translate(12, 0, 0)), "Winkel");`,
  },
  {
    label: 'A · Drehteil (revolve)',
    code: `// Track A — Rotationskörper (Lathe), 360°
const profile = polygon([[6, -10], [10, -10], [10, 8], [6, 12]]);
emit(revolve(profile, { axis: "Y", angle: 360 }), "Drehteil");`,
  },
  {
    label: 'B · Organischer Blend (SDF)',
    code: `// Track B — SDF mit smooth-min: nahtlose organische Verschmelzung
const a = sdf.sphere(12);
const b = sdf.translate(sdf.sphere(10), 16, 0, 0);
const c = sdf.translate(sdf.cylinder(5, 24), 8, 0, 0);
const blob = sdf.smoothUnion(sdf.smoothUnion(a, b, 6), c, 6);
emit(blob, "Blob", { min: [-16, -16, -16], max: [30, 16, 16], res: 64 });`,
  },
  {
    label: 'Abfrage · oberste Fläche',
    code: `// query_geometry: die oberste Fläche eines Quaders
const part = box(30, 20, 10);
emit(part, "Quader");
log("oberste Fläche:", query(part, { kind: "faces", pick: "max", metricAxis: "z" }));`,
  },
];

const STARTER = EXAMPLES[0].code;

/** One persistent tool context + one panel for the whole app session. */
let tools: CadTools | null = null;
let panel: HTMLElement | null = null;
let codeEl: HTMLTextAreaElement | null = null;
let outEl: HTMLElement | null = null;

function ensureStyles(): void {
  if (document.getElementById('cad-script-style')) return;
  const style = document.createElement('style');
  style.id = 'cad-script-style';
  style.textContent = `
  .cadscript-panel{position:fixed;right:18px;top:96px;width:440px;max-width:46vw;z-index:60;
    background:var(--glass-strong);backdrop-filter:blur(16px) saturate(1.3);-webkit-backdrop-filter:blur(16px) saturate(1.3);
    color:var(--text);border:1px solid var(--border-soft);border-radius:var(--radius-lg);
    box-shadow:var(--shadow-3);font:13px/1.45 var(--font-mono);display:flex;flex-direction:column;overflow:hidden}
  .cadscript-head{display:flex;align-items:center;gap:8px;padding:9px 11px;background:color-mix(in srgb, var(--surface-2) 60%, transparent);border-bottom:1px solid var(--border);cursor:move}
  .cadscript-head b{font:600 13px var(--font-display);letter-spacing:.02em;flex:1}
  .cadscript-x{cursor:pointer;border:0;background:transparent;color:var(--text-muted);font-size:16px;line-height:1;padding:2px 6px;border-radius:6px}
  .cadscript-x:hover{background:var(--danger-soft);color:var(--danger)}
  .cadscript-body{padding:10px;display:flex;flex-direction:column;gap:8px}
  .cadscript-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  .cadscript-panel textarea{width:100%;min-height:150px;resize:vertical;background:var(--surface-2);color:var(--text);
    border:1px solid var(--border);border-radius:var(--radius-sm);padding:8px;font:12px/1.5 var(--font-mono);tab-size:2}
  .cadscript-panel select,.cadscript-panel button{font:12px var(--font-ui);border-radius:7px;border:1px solid var(--border);
    background:var(--surface-2);color:var(--text);padding:6px 10px;cursor:pointer}
  .cadscript-panel button.primary{background:var(--plasma);border-color:transparent;color:var(--text-on-accent);font-weight:600}
  .cadscript-panel button:hover{filter:brightness(1.12)}
  .cadscript-out{white-space:pre-wrap;background:var(--surface-1);border:1px solid var(--border);border-radius:var(--radius-sm);
    padding:8px;min-height:54px;max-height:230px;overflow:auto;font-size:12px}
  .cadscript-ok{color:var(--success)}.cadscript-err{color:var(--danger-strong)}.cadscript-dim{color:var(--text-muted)}
  `;
  document.head.appendChild(style);
}

function makeDraggable(handle: HTMLElement, node: HTMLElement): void {
  let sx = 0, sy = 0, ox = 0, oy = 0, dragging = false;
  handle.addEventListener('pointerdown', (e) => {
    dragging = true;
    sx = e.clientX; sy = e.clientY;
    const r = node.getBoundingClientRect();
    ox = r.left; oy = r.top;
    handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    node.style.left = `${ox + (e.clientX - sx)}px`;
    node.style.top = `${oy + (e.clientY - sy)}px`;
    node.style.right = 'auto';
  });
  handle.addEventListener('pointerup', (e) => {
    dragging = false;
    handle.releasePointerCapture(e.pointerId);
  });
}

function renderResult(host: FeatureHost, result: RunResult): void {
  if (!outEl) return;
  const lines: string[] = [];
  if (result.error) {
    lines.push(`✗ ${result.error.message}`);
    if (result.error.detail) lines.push(`  (${result.error.detail})`);
  } else {
    lines.push(`✓ ${result.created.length} Körper · ${result.durationMs} ms`);
    for (const c of result.created) {
      if (c.kind === 'solid') {
        lines.push(
          `  • ${c.name}: ${c.triangleCount} Δ · V≈${c.volume} mm³ · ${c.watertight ? 'dicht' : 'offen'}`,
        );
      } else {
        lines.push(`  • ${c.name}: SDF (res ${c.resolution})`);
      }
    }
  }
  for (const l of result.log) lines.push(`  ⌁ ${l}`);
  outEl.className = `cadscript-out ${result.error ? 'cadscript-err' : 'cadscript-ok'}`;
  outEl.textContent = lines.join('\n');
}

async function runScript(host: FeatureHost): Promise<void> {
  if (!tools || !codeEl) return;
  const code = codeEl.value;
  const before = tools.context.emitted.length;
  const result = tools.run_cad_code(code);

  // Observe: bring newly emitted bodies into the scene (the "execute" payoff).
  if (!result.error && tools.context.emitted.length > before) {
    host.pushMeshUndo(host.t('cadscript.undo'));
    for (let i = before; i < tools.context.emitted.length; i++) {
      const item = tools.context.emitted[i];
      try {
        const geom = meshToGeometry(emittedToMesh(item));
        await host.addBodyFromGeometry(geom, item.name, item.kind === 'sdf' ? 'loft' : 'solid');
      } catch (err) {
        result.created = result.created.filter((c) => c.name !== item.name);
        if (outEl) outEl.textContent = `✗ ${host.t('cadscript.meshFailed', { name: item.name })}`;
      }
    }
    host.refreshBrowser();
    host.refreshBounds();
  }

  renderResult(host, result);
  host.markFeatureDone('cad-script', result.error ? result.error.code : `${result.created.length}`);
  host.setStatus(
    result.error
      ? host.t('cadscript.statusError', { msg: result.error.message })
      : host.t('cadscript.statusOk', { n: result.created.length }),
  );
  publishDebug(result);
}

/** Multi-view framing (render_view, §3). Frames the live viewport to ISO and
 *  records per-view camera framings + dataURL snapshots for inspection. */
function renderViews(host: FeatureHost): void {
  if (!tools) return;
  const rv = tools.render_view(['front', 'top', 'iso']);
  if (!rv.bounds) {
    host.setStatus(host.t('cadscript.noBodies'));
    return;
  }
  // Frame the live camera to the iso view so the user sees the result framed.
  const iso = rv.views.find((v) => v.view === 'iso') ?? rv.views[0];
  host.camera.position.set(iso.eye[0], iso.eye[1], iso.eye[2]);
  host.camera.up.set(iso.up[0], iso.up[1], iso.up[2]);
  host.controls.target.set(iso.target[0], iso.target[1], iso.target[2]);
  host.controls.update();

  // Capture snapshots for each requested view (stored for agent/e2e inspection).
  const images: { view: ViewName; dataUrl: string }[] = [];
  const cam = host.camera;
  const savedPos = cam.position.clone();
  const savedUp = cam.up.clone();
  const savedTarget = host.controls.target.clone();
  try {
    for (const f of rv.views) {
      cam.position.set(f.eye[0], f.eye[1], f.eye[2]);
      cam.up.set(f.up[0], f.up[1], f.up[2]);
      host.controls.target.set(f.target[0], f.target[1], f.target[2]);
      cam.lookAt(host.controls.target);
      cam.updateProjectionMatrix();
      host.renderer.render(host.scene, cam);
      try {
        images.push({ view: f.view, dataUrl: host.renderer.domElement.toDataURL('image/png') });
      } catch {
        /* tainted/headless canvas — skip pixels, keep framings */
      }
    }
  } finally {
    cam.position.copy(savedPos);
    cam.up.copy(savedUp);
    host.controls.target.copy(savedTarget);
    cam.lookAt(savedTarget);
    cam.updateProjectionMatrix();
    host.controls.update();
  }

  const w = window as unknown as { __cadScript?: Record<string, unknown> };
  w.__cadScript ??= {};
  w.__cadScript.lastRender = { bounds: rv.bounds, views: rv.views, images };
  host.setStatus(host.t('cadscript.rendered', { n: rv.views.length }));
}

function publishDebug(result: RunResult): void {
  const w = window as unknown as { __cadScript?: Record<string, unknown>; __cadFeature?: Record<string, unknown> };
  w.__cadScript ??= {};
  w.__cadScript.tools = tools;
  w.__cadScript.run = (code: string) => tools!.run_cad_code(code);
  w.__cadScript.query = (req: unknown) => tools!.query_geometry(req as never);
  w.__cadScript.lastResult = result;
  w.__cadFeature ??= {};
  w.__cadFeature.cadScript = {
    ok: result.ok,
    created: result.created.map((c) => c.name),
    error: result.error?.code ?? null,
    bodies: tools!.list(),
  };
}

function buildPanel(host: FeatureHost): HTMLElement {
  ensureStyles();
  const root = document.createElement('div');
  root.className = 'cadscript-panel';
  root.setAttribute('data-feature-panel', 'cad-script');

  const head = document.createElement('div');
  head.className = 'cadscript-head';
  const title = document.createElement('b');
  title.textContent = host.t('cadscript.title');
  const close = document.createElement('button');
  close.className = 'cadscript-x';
  close.textContent = '×';
  close.title = host.t('cadscript.close');
  close.addEventListener('click', () => {
    root.style.display = 'none';
  });
  head.appendChild(title);
  head.appendChild(close);

  const body = document.createElement('div');
  body.className = 'cadscript-body';

  const exampleRow = document.createElement('div');
  exampleRow.className = 'cadscript-row';
  const select = document.createElement('select');
  for (const ex of EXAMPLES) {
    const opt = document.createElement('option');
    opt.value = ex.code;
    opt.textContent = ex.label;
    select.appendChild(opt);
  }
  select.addEventListener('change', () => {
    if (codeEl) codeEl.value = select.value;
  });
  const exLabel = document.createElement('span');
  exLabel.className = 'cadscript-dim';
  exLabel.textContent = host.t('cadscript.examples');
  exampleRow.appendChild(exLabel);
  exampleRow.appendChild(select);

  codeEl = document.createElement('textarea');
  codeEl.spellcheck = false;
  codeEl.value = STARTER;
  codeEl.setAttribute('data-cadscript', 'code');
  // Ctrl/Cmd+Enter runs.
  codeEl.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      void runScript(host);
    }
  });

  const btnRow = document.createElement('div');
  btnRow.className = 'cadscript-row';
  const runBtn = document.createElement('button');
  runBtn.className = 'primary';
  runBtn.textContent = host.t('cadscript.run');
  runBtn.setAttribute('data-cadscript', 'run');
  runBtn.addEventListener('click', () => void runScript(host));
  const renderBtn = document.createElement('button');
  renderBtn.textContent = host.t('cadscript.renderViews');
  renderBtn.setAttribute('data-cadscript', 'render');
  renderBtn.addEventListener('click', () => renderViews(host));
  const clearBtn = document.createElement('button');
  clearBtn.textContent = host.t('cadscript.reset');
  clearBtn.setAttribute('data-cadscript', 'reset');
  clearBtn.addEventListener('click', () => {
    tools?.reset();
    if (outEl) {
      outEl.className = 'cadscript-out cadscript-dim';
      outEl.textContent = host.t('cadscript.cleared');
    }
  });
  btnRow.appendChild(runBtn);
  btnRow.appendChild(renderBtn);
  btnRow.appendChild(clearBtn);

  outEl = document.createElement('div');
  outEl.className = 'cadscript-out cadscript-dim';
  outEl.setAttribute('data-cadscript', 'out');
  outEl.textContent = host.t('cadscript.hint');

  body.appendChild(exampleRow);
  body.appendChild(codeEl);
  body.appendChild(btnRow);
  body.appendChild(outEl);
  root.appendChild(head);
  root.appendChild(body);
  makeDraggable(head, root);
  return root;
}

function openConsole(host: FeatureHost): void {
  host.selectTab('solid');
  if (!tools) {
    tools = createCadTools();
    publishDebug({ ok: true, created: [], log: [], durationMs: 0 });
  }
  if (!panel || !panel.isConnected) {
    panel = buildPanel(host);
    document.body.appendChild(panel);
  }
  panel.style.display = 'flex';
  codeEl?.focus();
  host.setStatus(host.t('cadscript.opened'));
}

registerFeature({
  id: 'cad-script',
  tab: 'solid',
  group: 'cadscript.group',
  labelKey: 'cadscript.open',
  icon: '⌨',
  primary: true,
  run: (host) => openConsole(host),
});
