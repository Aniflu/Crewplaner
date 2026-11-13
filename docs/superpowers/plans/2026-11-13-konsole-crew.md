# v1.3.0 Crew & Positionen in der Konsole – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Spec: docs/superpowers/specs/2026-11-13-konsole-crew-design.md (Teil 2 ist bindend).

**Goal:** Alles zur Crew einer Tour (anlegen, aus dem Pool hinzufügen, umbenennen, entfernen, Positionen, Einladen, Updates senden) wird in der Konsole verwaltet, über **einen** gemeinsamen Code-Weg. Die Touransicht verliert diese Funktionen und bekommt einen Hinweis-Knopf.

**Architecture:** In der Konsole wird der geladene Plan zum aktiven Plan der gemeinsamen Module (state.js, plans.js, dataService.js). Danach rendern und schreiben `js/crew.js`, `js/positions.js`, `js/crewNotify.js` und `js/userView.js` dort genauso wie in der Touransicht, mit Speicherschutz (planSync). Die doppelte Einlade-Logik in admin.html entfällt.

## Global Constraints
- Version **v1.3.0**. Arbeit auf `main`, Push erst nach grünem pre-push-Hook, **nie** nach `live` ohne Freigabe.
- **Nie** `confirm()`, `alert()` oder `prompt()` des Browsers. Nur `showConfirm`, `showAlert` und `showPrompt` aus js/dialog.js (Sperre: tests/nodialogs.test.mjs).
- Keine zweite Logik: Crew, Positionen, Einladen und Updates gibt es nur in den Modulen. admin.html ruft sie auf.
- Plan-Schreibzugriffe nur über `_savePlanToLS` mit planSync-Schutz. Nie einen anderen als den in der Konsole geladenen Plan beschreiben.
- Die Mail-Nutzlast an den Hook (`notify({type,…})`) bleibt im Format gleich, **kein Hook-Update**. Die Formate dürfen sich zwischen alter Konsolen-Logik und Modul nicht unbemerkt ändern: Unterschiede per Test festhalten und im Bericht nennen.
- `esc()` für alle Nutzerstrings. UI farbig mit Symbolen, hell und dunkel, 390 px.
- Keine echten Adressen oder Server-Kennungen in eingecheckten Dateien. Gestartete Prozesse beenden.

## Review Focus
1. Die Konsole lädt Plan Y, während in der Touransicht (anderer Tab) Plan X aktiv ist. Danach muss gelten: Jede Crew- oder Positionsänderung schreibt nur Y, und Einladungen tragen Y.
2. Ein Plan wird gewechselt, während eine Änderung noch speichert. Kein Schreiben in den falschen Plan (Epoche/Ladesperre aus planSync).
3. Ein Crew-Mitglied wird umbenannt oder entfernt: plan_data (crew, defaultCrew, assignments), crew_members und Status-Einträge passen weiter zusammen, wie bisher in der Touransicht.
4. Die Update-Liste ist in der Konsole dieselbe wie in der Touransicht (Schlüssel `crewplan_updates_<pbId>`).
5. Die Touransicht wirft keine Fehler, wenn Crew-Modale fehlen (alte Folgeaktion `openCrewModal` aus einem Lesezeichen).

---

### Task 1: Konsole kennt Rolle und aktiven Plan
**Files:** admin.html (Bootstrap ~47-95, `loadSelectedPlan` ~1542-1615), js/admin-app.js, js/crew.js / js/positions.js / js/userView.js (nur Render-Schutz), Tests.
- Beim Konsolen-Start `setAuthState(id, email, role)` aus dem angemeldeten Konto (wie js/authService.js), damit `IS_MANAGER` und `hasPermission` in den Modulen stimmen.
- `loadSelectedPlan(pbId)`:
  - lokale ID `pbplan_<pbId>` (wie die Plan-Übergabe in authService) setzen: `setActivePlanId`, `tourplan_pb_<lokal>`, `tourplan_active_pb_id`, Plan-Index-Eintrag.
  - dann `await loadPlanForManager(pbId)`, das den Basisstand setzt und state.js füllt, plus `loadCrewMeta()` und `loadAssignmentStatuses()`.
  - die `_wrk*`-Variablen und die Konsolen-Globals aus state.js befüllen (eine Hilfsfunktion `_syncWrkFromState()`), damit PDF, ICS, Export und Tourvergleich unverändert laufen.
- Ruft die Konsole mit `#crew` auf und ist `tourplan_active_pb_id` gesetzt, wird dieser Plan automatisch gewählt und geladen, und die Seite scrollt zur Crew-Karte.
- Render-Schutz: `renderCrew` kehrt ohne `#crewList` still zurück. Jeder `renderTable()`-Aufruf in crew.js, positions.js und userView.js läuft nur mit `hasTableView()`, oder renderTable selbst prüft das zentral (bevorzugt: einmal zentral).
- **Tests:**
  - (a) Nach `loadSelectedPlan('PBY')` sind `getActivePlanId()` = `pbplan_PBY`, `tourplan_active_pb_id` = PBY und der Basisstand gesetzt.
  - (b) Ein `_savePlanToLS` danach patcht `plans/records/PBY`, nie PBX (zuvor aktiv).
  - (c) `renderCrew` und `renderTable` ohne DOM werfen nicht.
  - Rot-Nachweis für (b).

### Task 2: Karte „👥 Crew & Positionen“ in der Konsole
**Files:** admin.html (Karte statt „Crew benachrichtigen“, Markup für `#crewList`, `#posList`, `#crewHeading`, `#crewImportModal`, `#sharedModal`, `#crewUpdateModal` von index.html übernehmen), js/admin-app.js (Funktionen auf `window`), CSS.
- In der Karte rendert `renderCrew()` aus js/crew.js:
  - Crew-Liste mit ✎ und ✕
  - „＋ Aus Crew-Pool hinzufügen“ (`openImportCrewModal`) und „＋ Neue Person anlegen“
  - Positionen-Liste mit Hinzufügen, Umbenennen und Löschen (`openAddPos`, `openPosMenu`/`openRenamePos`)
- Darunter je Person der Einladestatus mit Knöpfen aus js/crewNotify.js (`_renderCrewNotifyList`, das in einen Container der Karte rendert statt in `#sharedModal`, minimal parametrisiert) und „↻ Updates senden (n)“ (`_openUpdateQueueModal`). Der Zähler kommt aus `_updateCrewUpdateBar` bzw. der Update-Liste.
- Die Knöpfe „Tourblock einfügen“, „Bereich → Block“ und „Datum hinzufügen“ bleiben (v1.2.3-Übergabe). Der Knopf „👥 Crew & Positionen“ springt jetzt zur Karte statt in die Touransicht.
- **Tests:** Struktursperren, dass admin.html diese Container hat und die Modul-Funktionen aufruft, plus ein E2E-Durchlauf (Task 5).

### Task 3: Ein Einlade-Weg
**Files:** admin.html (inline `renderAdminNotify`, `sendAdminInvite`, `sendAdminEmail`, `sendAdminUpdate`, `openAdminCancellation` ~1618-1800), js/crewNotify.js, js/dataService.js, js/userView.js, Tests.
- Die Konsolen-Funktionen mit der Modul-Logik vergleichen:
  - Typen: Einladung, Erinnerung, Update, Absage
  - Terminberechnung: `getVal` statt eigener assignments/defaultCrew-Logik
  - notify-Nutzlast
- Fehlt einem Modul eine Fähigkeit, die nur die Konsole hat (z. B. „Erinnerung“), wandert sie **in das Modul**. Danach werden die Konsolen-Duplikate gelöscht.
- Die Nutzlast an den Hook bleibt kompatibel. Pro Typ legt ein Test die Nutzlast fest. Echte Abweichungen zwischen alt und neu stehen im Bericht.
- Veraltete Texte „Mail folgt über Einladen“ (js/dropdown.js:192, :258) werden auf „über die Konsole“ angepasst.
- Bestehende Tests (notify, invite, flows, queue, updatemodal, crewadd) werden umgezogen bzw. angepasst und behalten ihre Absicht.

### Task 4: Touransicht entschlacken
**Files:** index.html (Seitenleiste ~110-121, Modale ~386-510), js/app.js / js/init.js / js/sidebar.js / js/render.js / js/positions.js (Tabellenkopf), Tests.
- Entfernt werden:
  - die Knöpfe „👥 Crew & Positionen“ und „↻ Updates“
  - die Modale `#crewModal`, `#crewImportModal` und `#crewUpdateModal`, falls nur dafür genutzt
  - im Tabellenkopf „+ Position“ und das Positionsmenü (Umbenennen, Löschen)
- **Bleibt:** das Stammbesetzungs-Dropdown `openDefaultDD`, denn es gehört zum Planen.
- Neu ist ein Hinweis-Knopf **„👥 Crew in der Konsole verwalten“**. Liegen Updates in der Liste, zeigt er „↻ n Updates offen – in der Konsole senden“, in Statusfarbe. Er führt zu `admin.html#crew`.
- Die Folgeaktion `openCrewModal` (`tourplan_pending_action`) leitet in die Konsole `#crew` um, statt zu werfen.
- Das „▶ Crew“-Fach bleibt.

### Task 5: Version, Doku, Abnahme
- v1.3.0:
  - Versionsstellen in index.html, login.html und admin.html
  - Cachebuster `app.js?v=64` und `admin-app.js?v=24`
  - README-Eintrag
  - docs/guide-admin.html: neuer Abschnitt „Crew & Positionen“ in der Konsole, die Stellen zur Touransicht anpassen
- **E2E im Headless-Chrome gegen eine nachgebildete PocketBase:**
  - admin.html mit gestubbtem Login
  - Plan Y laden, während `tourplan_active_pb_id` = X ist
  - Person aus dem Pool hinzufügen, neu anlegen, umbenennen, entfernen
  - Position anlegen
  - Einladung senden (genau ein notify-Aufruf mit Plan Y)
  - Update-Liste anzeigen
  - Fremdänderung an Y, dann muss der Speicherschutz greifen

  Prüfung: Alle Schreibaufrufe gehen nur an Y. Danach `index.html` öffnen: kein Crew-Knopf, aber der Hinweis-Knopf ist da.
- Bildschirmfotos hell, dunkel und 390 px. Server und Chrome beenden.
- Review über den ganzen Umbau, dann Push auf `main`. **Live nur nach Freigabe.**
