# Umgesetzt: #30 Parametrische Timeline — Phase 1 (Rollback) (2026-06-14)

Backlog #30 stand auf 🟡 „Feature-Log existiert (`src/feature-timeline.ts`), aber display-only, kein
parametrisches Replay/Rollback". Diese Phase liefert den **Rollback** (den sichtbaren Kern eines
parametrischen Timelines), ohne die Architektur (bewusst Direkt-Modellierung) umzubauen.

## Was Phase 1 kann

Ein **Rollback-Marker** auf dem Feature-Log: Features rechts vom Marker sind *unterdrückt* (zurückgerollt),
die von ihnen erzeugten Körper werden ausgeblendet; nach links/rechts schieben blendet sie aus/ein.

- **Marker-Modell** (`src/feature-timeline.ts`, rein + unit-getestet): `setTimelineMarker`/`getTimelineMarker`/
  `timelineActiveCount`/`suppressedBodyIds`. Klick auf einen Feature-Chip rollt zurück bzw. vor
  (`idx < marker ? idx : idx+1`), unterdrückte Chips sind gestrichelt/gedimmt (CSS).
- **Suppression über Sichtbarkeit, sauber komponiert:** `body.visible` = reine **Nutzerabsicht**;
  effektive Szenen-Sichtbarkeit = `body.visible && !timelineSuppressed`. Ein neues
  `FeatureHost.isTimelineSuppressed` sorgt dafür, dass **alle** Sichtbarkeits-Schreiber konsistent
  komponieren — `applyBodyVisibility` (main.ts), der Browser-Toggle, **Sichtbarkeit-Umschalten**
  (`view/visibility.ts`) und **Isolieren** (`view/isolate.ts`). Picking überspringt unterdrückte Körper.
- **Konsistenz-Lebenszyklus:** `applyTimelineMarker()` wird neu angewandt nach Solve eines neuen Features
  (`recordSolidFeature`), nach `restoreSnapshot` (Undo/Redo), nach Projekt-/STL-Load und beim Marker-Setzen.
  Ein neues Feature nach einem Rollback springt zurück ans Ende (Suppression gelöscht).
- Test-Bridge: `timelineMarker`/`setTimelineMarker`/`timelineActiveCount`/`timelineFeatureCount`/
  `visibleBodyCount`/`recordFeatureTest`.

## Zwei adversariale Review-Runden

Runde 1 (14 Funde) deckte auf, dass die Suppression von anderen Sichtbarkeits-Pfaden (Toggle-All, Isolieren,
Load, Undo-Restore) umgangen wurde → behoben durch die saubere `isTimelineSuppressed`-Komposition + Re-Apply
an allen Lebenszyklus-Punkten + Pick-Fix + Chip-Math-Korrektur + CSS + Status-Meldung. Runde 2 (5 Funde,
allesamt **Test-Lücken**, Code als korrekt bestätigt) → drei E2E-Kompositions-Tests ergänzt
(visibility×Suppression, isolate×Suppression, Chip-Math mit 3 Features).

## Verifikation

typecheck 0 · vitest **1120** (inkl. `test/unit/feature-timeline.test.ts`) · build ok · Playwright
**volle Suite ×2 grün** (inkl. `test/e2e/timeline-rollback.spec.ts`, 6 Tests; visibility/isolate weiter grün),
DE+EN, 0 Konsolenfehler.

## Bewusst NICHT in Phase 1 (= „Phase 2", echtes parametrisches Replay)

- **Recompute:** Features speichern kein Rezept (Parameter/Referenzen) zum Re-Ausführen; Rollback ist
  Suppression (Ausblenden), kein Neuberechnen. Ein echter parametrischer Kernel (Skizze-Parameter ändern →
  Downstream-Features neu ausführen) erfordert Feature-Rezepte + Abhängigkeitsgraph + Re-Exec der WASM-Ops —
  ein eigener, größerer architektonischer Schritt.
- **Mutierende Features** (subtract/join) erzeugen keinen neuen Körper; sie werden vom Marker nicht
  „rückgängig" gemacht (nur körper-erzeugende Features: extrude/revolve/loft).
- Der Marker ist **View-State** (wie die Kamera) — nicht im Undo-Snapshot/Projekt persistiert.
- Registry-Features (pattern/mirror) erzeugen Körper über `host.addBodyFromGeometry` ohne Feature-Record,
  erscheinen also (noch) nicht im Timeline-Log.
