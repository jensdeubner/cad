# Menü-Redesign — „Command Deck"

**Datum:** 2026-06-19
**Ziel:** Modernes Redesign und Umbau der Menüs — sauberer, durchdachter, einfacher bedienbar. Konkreter Auslöser: Im **Solid**-Menü lässt sich nicht bis ganz rechts scrollen (rechte Gruppen unerreichbar).

## Problemanalyse

Die App nutzt eine Fusion-360-artige Chrome: oben `brand · tabs · locale · quick`, darunter eine **Ribbon** (`.fusion-ribbon`), die pro aktivem Tab eine `.ribbon-workspace` zeigt. Jede Workspace = horizontale Reihe von `.ribbon-group`-Karten mit gestapelten Icon-Buttons. Dazu schwebende Panels pro Tab, ein Browser-Baum, Timeline, Statusleiste.

### Root-Cause des Solid-Scroll-Bugs
`.fusion-ribbon` ist der Scroll-Container (`overflow-x: auto`). Sein Kind `.ribbon-workspace` ist auf `width: 100%` fixiert. Dadurch ist die Scrollbreite **auf die Viewport-Breite gedeckelt** — die `flex-shrink: 0`-Gruppen, die über 100 % hinausragen (Solid hat 5 Gruppen), werden abgeschnitten und sind **nicht scrollbar**. Genau das beschriebene Verhalten.

### Weitere Schwächen
- Ribbon ist visuell schwer (boxige Gruppen-Karten, hoher vertikaler Footprint ~80 px).
- Keine Overflow-Affordanz: Nutzer sehen nicht, dass rechts mehr ist.
- 8 Tabs ohne Icons → schlechter scanbar.

## Lösung (low-regret, alle JS-Hooks bleiben erhalten)

Wir behalten das vertraute Workspace-Tab-Modell (gesamte `main.ts`-Verdrahtung via `appMenu.selectTab` bleibt unangetastet) und modernisieren Chrome + Ribbon zu einem „Command Deck".

Erhalten bleiben **alle** Hooks: `data-fusion-tab`, `data-ribbon`, `data-tool`, `data-solid-feature`, `data-sketch-axis`, `data-open-panel`, sämtliche `id`s. **Kein Verhaltens-Regress.**

### 1. Overflow strukturell fixen
- `.ribbon-workspace`: `width: max-content; min-width: 100%` → Container wächst mit Inhalt, `.fusion-ribbon` kann voll scrollen.
- **Affordanzen** (neues Modul `src/input/ribbon-overflow.ts`, Host/Factory-Pattern):
  - Links/rechts **Edge-Fades**, sichtbar nur wenn scrollbar.
  - **Chevron-Scroll-Buttons** (‹ ›), erscheinen nur bei Overflow, scrollen seitenweise.
  - **Wheel → horizontal** Scroll-Mapping (ohne Shift).
  - ResizeObserver + Scroll-Listener aktualisieren die Zustände; bei Tab-Wechsel reset.

### 2. Top-Bar modernisieren
- Workspace-Tabs erhalten kompakte Icons + Label, sauberer Aktiv-Zustand, scrollbar ohne Clipping.
- Brand + Quick-Actions feinpoliert, konsistente Abstände.

### 3. Ribbon-Visuals modernisieren
- Leichtere Gruppen (subtiler Divider statt schwerer Karten), geringerer vertikaler Footprint, konsistente Button-Größen, klarere Hover/Active über bestehende Plasma-Tokens.

### 4. Panels
- Leichte Konsistenz-Politur (sekundär).

## Architektur

| Einheit | Zweck | Abhängigkeiten |
|---------|-------|----------------|
| `src/input/ribbon-overflow.ts` | Scroll-Affordanzen für `.fusion-ribbon` (fades, chevrons, wheel, observer) | DOM-Refs der Ribbon; kein App-State |
| `index.html` (Chrome) | Chevron-/Fade-Elemente, Tab-Icons | — |
| `src/style.css` | Top-Bar-, Ribbon-, Gruppen-, Button-Styling | Design-Tokens (`:root`) |

`ribbon-overflow.ts` ist isoliert testbar: Eingabe = Scroll-Container-Element + Workspace-Selektor; Ausgabe = aktualisierte Klassen/Buttons. Kein Bezug zu Szene/Tools.

## Verifikation
- Dev-Server (alt. Port), Screenshots aller 8 Tabs (v. a. **Solid**) in Dark + Light.
- Schmales Viewport: bestätigen, dass rechteste Gruppe erreichbar (Chevron + Scroll).
- `npm run build` (WASM + Vite) erfolgreich.

## Out of scope
- Tabs entfernen/zusammenlegen (würde `setTool`-Routing/Panels berühren — Risiko ohne Mehrwert für das gemeldete Problem).
- Neue Tools/Features. Reines Menü-/Chrome-Redesign.
