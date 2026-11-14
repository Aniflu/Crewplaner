# v1.5.0 Einladung mit Status · Crew speichert gesammelt – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Einladung immer mit Terminen und deren Status; „eingeladen“ aus `email_log`; Crew-Änderungen als Entwurf, ein Speichern → ein Server-Aufruf → eine Planer-Mail; Regel „mehr als 5“ in allen Mails.

**Architecture:** Hook v4.30 bekommt eine Mail-Hilfe (Liste oder Zählung), eine neue Route `POST /crewsave` (Transaktion, Typ `crew_changes`) und einen Guard, der Crew-Statusänderungen über die normale API abweist. Die App bekommt ein reines Modul `js/crewDraft.js` für den Entwurf; alle Crew-Schreibwege in `userView.js`/`render.js`/`authService.js` schreiben nur noch dorthin. Die Konsole (`crewNotify.js`) liest `email_log`.

**Tech Stack:** Vanilla-JS-Module (Browser), PocketBase-JS-Hooks (Goja), Tests mit `node tests/run.mjs` (eigenes Mini-Framework `tests/_assert.mjs`, Modulgraph `tests/_graph.mjs`, Hook-Stücke per `new Function` wie in `tests/hookpencil.test.mjs`).

**Spec:** `docs/superpowers/specs/2026-11-14-einladung-und-crew-speichern-design.md`

## Global Constraints
- Version App **v1.5.0** (README-Kopf, index.html, login.html, admin.html; `tests/version.test.mjs`), Hook **v4.30** (Kopfkommentar + Changelog in main.pb.js).
- Grenze der Mail-Regel: **mehr als 5** Einträge → Zählung + Satz „Es gibt mehr als 5 Einträge. Bitte logg dich ein und schau nach.“ (Konstante `MAIL_LISTE_MAX = 5`, eine Stelle im Hook).
- Hook: **alle** Hilfsfunktionen handler-lokal (jeder Handler läuft isoliert als `/pb.js`; Top-Level-Deklarationen sind dort unsichtbar — v4.25-Lehre, main.pb.js:380-388).
- Keine Browser-Dialoge: nur `showConfirm`, `showAlert`, `showPrompt` aus `js/dialog.js` (async, mit `await`). `tests/nodialogs.test.mjs` muss grün bleiben.
- Keine echten Mailadressen/Server-Kennungen in eingecheckten Dateien (`tests/privacy.test.mjs`); Testdaten nutzen `@x.de`.
- Statuswerte (freies Textfeld): `pencilled`, `pencil_declined`, `proposed`, `confirmed`, `declined`, `cancelled`, `cancel_acked`.
- UI farbig auf dunkel, Symbole statt Textkürzel (✎ vorgemerkt · ⏳ angefragt · ✅ bestätigt · ✗ abgesagt · 📧 eingeladen · 💾 speichern · ↩ verwerfen).
- Subagenten starten weder App noch Server; lange Läufe beenden; Tests gezielt (`node tests/run.mjs <datei>` falls unterstützt, sonst Volllauf mit `grep -E '✗|failed'`).

## Review Focus
1. Crew hat einen Entwurf, der Planer ändert denselben Termin vor dem Speichern → `409 stale`, nur diese Einträge fallen raus, Rest bleibt (Test in Task 3 + Task 6).
2. Einladung an jemanden, der nur `cancelled`-Datensätze und sonst nichts hat → N = 0, Knopf gesperrt; Hook 400 (Task 2 + Task 4).
3. Zwei Tabs/Geräte derselben Person: Entwurf liegt nur im Browser; nach Speichern auf Gerät A ist der Entwurf auf Gerät B veraltet → beim Öffnen per `from`-Vergleich verworfen und genannt (Task 5).
4. Exakt 5 vs. 6 Einträge in jeder Mailart (Task 1).
5. Alte, zwischengespeicherte App (v1.4.0) schreibt per PATCH → Guard lehnt ab, kein stiller Planwechsel ohne Mail (Task 3).

---

### Task 1: Hook – Mail-Hilfe „Liste oder Zählung“, Einladung mit Status, keine Schreib-Knöpfe, `email_log` auch auf Test

**Files:**
- Modify: `.pb_hooks/main.pb.js` (Mail-Hook `onRecordAfterCreateSuccess … 'crew_invites'`, Zeilen ~20-290; ANFRAGE-Mail ~545-575; update-Mail ~192-252)
- Test: `tests/hookmail.test.mjs` (neu)

**Interfaces:**
- Produces (handler-lokal im Mail-Hook): `var MAIL_LISTE_MAX = 5;` `var mailListe = function(rows, spalten, gruppeVon, gruppenText)` → HTML-String: bei `rows.length <= MAIL_LISTE_MAX` eine Tabelle mit `spalten` (Array `{kopf, wert: function(row)}`), sonst Zählblock (`gruppenText[gruppeVon(row)]` + Anzahl je Gruppe, in fester Reihenfolge der Schlüssel von `gruppenText`) + Satz der Regel.
- Produces: `invite`-Mail liest `app_url` als JSON `[{date, posLabel, status}]`; `status` ∈ `pencilled|pencil_declined|proposed|confirmed|declined`. Statustexte: `pencilled` → „Vorgemerkt – nur Info, halte dir den Tag frei“, `proposed` → „Angefragt – bitte bestätigen“, `confirmed` → „Bestätigt“, `declined`/`pencil_declined` → „Abgesagt“. Satz „Bitte in der App bestätigen oder absagen.“ nur bei ≥ 1 `proposed`. Einziger Knopf „APP ÖFFNEN →“ + Anleitung.
- Produces: `sendMail` schreibt ohne `RESEND_KEY` eine `email_log`-Zeile mit `success = 'skipped'`.

- [ ] **Step 1: Failing tests** in `tests/hookmail.test.mjs`, Hook-Stück wie in `hookpencil.test.mjs` herausschneiden (Mail-Hook-Rumpf mit Attrappen `$os.getenv`, `$http.send`, `$app.findCollectionByNameOrId/save`, `Record`), Mail-HTML abfangen:
  - `invite mit 5 Terminen zeigt Tabelle mit Statustexten` → HTML enthält alle 5 Daten (`13.05.2027` …) und „Vorgemerkt – nur Info“.
  - `invite mit 6 Terminen zeigt nur Zählung` → enthält „mehr als 5 Einträge“, enthält **kein** `13.05.2027`, enthält „6“ nicht als Datum sondern Zählung je Status (z. B. `✎ 4` und `⏳ 2` bzw. Textform des Builders, aber beide Zahlen).
  - `invite ohne angefragte Termine hat keinen Bestätigen-Satz`.
  - je ein 5/6-Fall für `update`, `cancellation`, `pencil_info`, `availability`.
  - `ANFRAGE-Mail enthält kein action=confirm/decline`, `update-Mail enthält kein action=ackcancel` (Quelltext-Prüfung genügt: `!/action=(confirm|decline|ackcancel)/.test(hook)`).
  - `ohne RESEND_KEY entsteht email_log mit success skipped`.
- [ ] **Step 2:** `node tests/run.mjs 2>&1 | grep -E '✗|passed'` → neue Tests rot.
- [ ] **Step 3:** Implementieren (Hilfe einmal definieren, in allen sechs Zweigen nutzen; update: neu/entfernt/Statuswechsel als Gruppen; bei > 5 entfällt der GESEHEN-Knopf ohnehin, da er ganz wegfällt).
- [ ] **Step 4:** Tests grün; bestehende Tests, die alte Mail-Knöpfe/Texte festschreiben (`tests/updatemail.test.mjs`, `tests/invite.test.mjs`, `tests/pencilinfo.test.mjs`), an das neue Verhalten anpassen – nur die betroffenen Erwartungen, mit Kommentar „v4.30“.
- [ ] **Step 5:** Commit `feat(hook): Mail-Regel >5, Einladung mit Status, keine Schreib-Knöpfe (v4.30)`.

### Task 2: Hook – `/notify` Typ `invite` ändert keinen Status

**Files:**
- Modify: `.pb_hooks/main.pb.js` Route `/notify` (~1035-1265)
- Test: `tests/hooknotifyinvite.test.mjs` (neu); anpassen `tests/hookpencil.test.mjs` (Filter-Erwartungen für `invite`)

**Interfaces:**
- Consumes: Client-Nutzlast `invite`: `{ type:'invite', planId, crewName, crewEmail, planName, appUrl, slots:[{date,posId,posLabel}], mailSlots:[{date,posId,posLabel,status}] , customMessage? }`. `slots` = nur Termine ohne aktiven Datensatz.
- Produces: Verhalten für `invite`:
  - Ein Slot mit vorhandenem Datensatz im Status `pencilled|pencil_declined|proposed|confirmed|declined` wird **nicht** geschrieben; `cancelled|cancel_acked` oder kein Datensatz → `proposed` (`proposed_by:'bulk'`).
  - `mailSlots` werden nicht gefiltert; `status` je Eintrag wird serverseitig aus dem Datensatz überschrieben (kein/entfallener Datensatz → `proposed`).
  - `mailSlots` leer **und** `slots` leer → `400 'keine Termine'`.
  - `reminder`/`update` unverändert (v4.29-Filter bleibt für sie).

- [ ] **Step 1: Failing tests** (Route-Stück mit Attrappe `$app.findFirstRecordByFilter`, `runInTransaction`, `e.string`):
  - je Status ein Fall `invite fasst <status> nicht an` (kein `save` auf diesem Datensatz).
  - `invite setzt cancelled auf proposed`, `invite legt fehlenden Slot als proposed an`.
  - `invite-Mailliste behält vorgemerkte Termine und trägt den DB-Status` (Client schickt `status:'proposed'` für einen `pencilled`-Datensatz → Nutzlast enthält `pencilled`).
  - `invite ohne Termine → 400` (der Oliver-Fall: `slots:[]`, `mailSlots:[]`).
- [ ] **Step 2:** rot.
- [ ] **Step 3:** implementieren.
- [ ] **Step 4:** grün, inkl. angepasster `hookpencil`-Fälle.
- [ ] **Step 5:** Commit `feat(hook): Einladung teilt Status mit, ändert ihn nicht (v4.30)`.

### Task 3: Hook – `POST /crewsave`, Typ `crew_changes`, Guard, Wegfall der Einzelmails

**Files:**
- Modify: `.pb_hooks/main.pb.js` (neue Route nach `/notify`; Mail-Hook neuer Zweig `crew_changes`; Update-Guard ~389-440; Create-Guard direkt danach; Planer-Mail im assignments-Update-Hook ~580-640 entfernen); Kopf v4.30 + Changelog
- Test: `tests/hookcrewsave.test.mjs` (neu); anpassen `tests/hookpencil.test.mjs`, `tests/statusguard.test.mjs`

**Interfaces:**
- Produces Route `POST /crewsave` (auth Pflicht, sonst 401):
  - Body `{ planId, changes:[{date,posId,from,to}], availability:[{date,posId}] }`; `from` ∈ Statuswerte oder `'none'`; `to` ∈ `confirmed|declined|pencil_declined|pencilled|cancel_acked`.
  - Prüfungen in dieser Reihenfolge: Konto steht in `crew_members` (plan_id, email klein) → sonst 404. Leere `changes` und leere `availability` → 400 `'keine Änderungen'`. Je Änderung: aktueller Status (oder `none`) ≠ `from` → in `stale`. Sonst Datensatz fremd (`crew_email` ≠ eigene) oder Übergang nicht in `CREW_STATUS_TRANSITIONS` (handler-lokale Kopie, identisch zur Tabelle in `js/pure.js`; `none` → nur `confirmed|declined` und nur, wenn `plan_data` den Slot dieser Person zuweist) → in `denied`.
  - `stale` nicht leer → `409 {stale:[{date,posId,now}]}`; sonst `denied` nicht leer → `400 {denied:[{date,posId,reason}]}`; in beiden Fällen nichts geschrieben.
  - Sonst eine `runInTransaction`: Datensätze setzen (`status`, `responded_at`, `changed_by`), je Änderung eine `activity_log`-Zeile (`action` = `to`, außer `pencilled` → `pencil_restored`; Felder wie `logActivity` in dataService.js), Bereitschaften für Slots ohne aktiven Datensatz sammeln, und **ein** `crew_invites` `{type:'crew_changes', plan_id, crew_name, crew_email: eigene Mail, plan_name, app_url: JSON [{date,posLabel,from,to}] (Bereitschaft: to='availability')}`. Antwort `200 {ok:true, saved:n}`.
- Produces Mail-Zweig `crew_changes`: Empfänger `$os.getenv('ADMIN_EMAIL')` (fehlt → Log-Zeile, keine Mail), Betreff `CREW-ÄNDERUNGEN · <Name> · <Tour>`, Inhalt per `mailListe` gruppiert nach `to` (Texte: ✅ bestätigt, ✗ abgesagt, ✎✗ Vormerkung abgesagt, ✎ wieder vorgemerkt, 👁 Entfall gesehen, 📋 Bereitschaft).
- Produces Guard: Für Nicht-Planer gilt `alt !== neu` → immer `BadRequestError('status_transition_denied: …nur über Speichern in der App')`. Create-Guard: Nicht-Planer → immer ablehnen (`assignment_create_denied`). Die Transitionstabelle bleibt im Update-Guard **nicht** nötig, steht aber in `/crewsave`; `tests/statusguard.test.mjs` vergleicht künftig die Kopie in `/crewsave` mit `js/pure.js`.
- Wegfall: Mails ABGELEHNT / VORMERKUNG ABGESAGT / VORMERKUNG WIEDER FREI an `ADMIN_EMAIL` aus dem assignments-Update-Hook.

- [ ] **Step 1: Failing tests** (Route-Stück mit Attrappen, Muster `hookpencil`):
  - `crewsave: drei erlaubte Änderungen → ein save je Datensatz, genau ein crew_invites, drei activity_log`.
  - `crewsave: eine verbotene Änderung (pencilled→confirmed) → 400, kein save` (Rot-Nachweis: alles-oder-nichts).
  - `crewsave: from passt nicht → 409 mit stale, kein save`.
  - `crewsave: fremder Datensatz → 400 denied`.
  - `crewsave: nicht in crew_members → 404`, `ohne auth → 401`, `leer → 400`.
  - `crewsave: Bereitschaft auf belegtem Slot wird ignoriert, auf freiem in app_url mit to availability`.
  - `Guard: Crew-PATCH confirmed→declined wird abgelehnt; Planer-PATCH erlaubt` (bestehende `guard()`-Hilfe aus hookpencil, Erwartungen dort auf „abgelehnt“ drehen).
  - `Hook enthält keine Planer-Einzelmail mehr` (`!/VORMERKUNG WIEDER FREI|'ABGELEHNT'/.test(hook)` – genaue Muster am Quelltext festlegen).
  - `crew_changes-Mail: 6 Änderungen → Zählung`.
- [ ] **Step 2:** rot.
- [ ] **Step 3:** implementieren; Kopfkommentar v4.30 mit Changelog-Zeilen (Tasks 1-3).
- [ ] **Step 4:** Volllauf grün (`node tests/run.mjs 2>&1 | grep -E '✗|passed'`).
- [ ] **Step 5:** Commit `feat(hook): /crewsave – Crew speichert gesammelt, eine Planer-Mail (v4.30)`.

### Task 4: App – Konsole: „eingeladen“ aus `email_log`, Status-Zählung, Einladung mit allen Terminen

**Files:**
- Modify: `js/crewNotify.js` (Vermerk-Funktionen 79-95, 141-159, Liste 181-267, Vorschau 314-328, Senden ~535-585, `_einladbar` 511), `js/dataService.js:917-940` (`sendCrewInvite`), `js/emailLog.js` (Anzeige `skipped`)
- Test: `tests/consoleinvite.test.mjs` (neu); anpassen `tests/invite.test.mjs`, `tests/invitepath.test.mjs`, `tests/consolecrew.test.mjs` wo sie den localStorage-Vermerk erwarten

**Interfaces:**
- Produces (exportiert aus `crewNotify.js`, rein, testbar):
  - `inviteStateFromLog(rows, name, email) → { at: string, skipped: boolean } | null` — jüngster `email_type==='invite'` mit `success` `'true'|'skipped'`; Treffer per `crew_email` (klein), sonst per `crew_name`, aber nur wenn kein Adress-Treffer existiert.
  - `statusCounts(name) → { pencilled, proposed, confirmed, declined }` über alle Termine der Person in der Tabelle (`pencil_declined` zählt zu `declined`; Termin ohne Status zählt nicht).
  - `buildInvitePayload(name, email) → { slots, mailSlots }`: alle Tabellentermine der Person; `mailSlots[i] = {date,posId,posLabel,status}` mit Status aus `assignmentStatuses` (fehlend → `'proposed'`); `slots` = die ohne aktiven Status.
- Produces: `sendCrewInvite(crewName, crewEmail, type, slots, customMessage, mailSlots)` — neuer letzter Parameter, wird als `mailSlots` mitgeschickt, wenn gesetzt.
- Konsole lädt `email_log` einmal je Render (`pbListAll('email_log', 'plan_id = "<pb-id>"', '-sent_at')`), Cache je Plan wie `_refreshPencilSeen`; Fehler → Badge „❔ Status unbekannt“.
- Entfernt: `CREW_INVITES_KEY`, `_loadInvites`, `_saveInvite`, `_fmtInviteDate`, `_getCrewInviteStatus`, `_einladbar` (soweit nur von der Einladung genutzt).

- [ ] **Step 1: Failing tests** (Muster `pencilinfo.test.mjs` mit `loadGraph`):
  - `inviteStateFromLog: Adresse, Name-Ersatz, skipped zählt, success false zählt nicht, update zählt nicht`.
  - `Oliver-Fall: 46 vorgemerkte Termine → Vorschau zeigt 46, Senden schickt mailSlots mit 46 × pencilled und slots leer`.
  - `Thomas-Fall: 14 Termine ohne Status → slots 14, mailSlots 14 × proposed`.
  - `0 Termine → Einladen-Knopf disabled, kein notify-Aufruf`.
  - `Badge aus Log: „📧 Eingeladen am 01.07.2026“; skipped → enthält „Test – nicht versendet“; Ladefehler → „❔ Status unbekannt“`.
  - `Zählzeile „✎ 46 vorgemerkt“` bzw. nur Arten > 0.
- [ ] **Step 2:** rot. **Step 3:** implementieren. **Step 4:** grün + angepasste Alt-Tests. 
- [ ] **Step 5:** Commit `feat: Konsole – Einladung mit allen Terminen, Status aus Mail-Log (v1.5.0)`.

### Task 5: App – Entwurfsmodul `js/crewDraft.js` + `saveCrewChanges`

**Files:**
- Create: `js/crewDraft.js` (rein, ohne DOM)
- Modify: `js/dataService.js` (neue Funktion neben `notify`)
- Test: `tests/crewdraft.test.mjs` (neu)

**Interfaces:**
- Produces `js/crewDraft.js`:
  - Entwurfsform `{ changes: [{date,posId,from,to}], availability: [{date,posId}] }`.
  - `draftKey(pbPlanId) → 'tourplan_crew_draft_' + pbPlanId`
  - `loadDraft(pbPlanId) → Draft` (kaputt/fehlend → leer; `localStorage` in try/catch)
  - `saveDraft(pbPlanId, draft)`, `clearDraft(pbPlanId)`
  - `setChange(draft, {date,posId,from,to}) → Draft` — ersetzt Eintrag gleicher `date|posId` (behält das ursprüngliche `from`); `to === from` entfernt ihn.
  - `toggleAvailability(draft, {date,posId}) → Draft`
  - `dropStale(draft, currentStatus: (date,posId)=>string) → { draft, dropped: [{date,posId,to}] }` (`currentStatus` liefert `'none'` ohne Datensatz)
  - `removeEntries(draft, keys: [{date,posId}]) → Draft`
  - `draftCount(draft) → number`
  - `effectiveStatus(draft, date, posId, base) → string` (für die Anzeige)
- Produces `dataService.js`: `saveCrewChanges(planId, draft) → Promise<{ok, saved}>` über `_pbRoute('/crewsave','POST', {planId, ...draft})`; bei 409/400 wird ein Error mit `.status` und `.body` (geparstes JSON) geworfen — Form so, wie `_pbRoute` Fehler heute liefert, ggf. dort erweitern.

- [ ] **Step 1: Failing tests:** ersetzen behält `from`; zurück auf Ausgang entfernt; Bereitschaft toggelt; `dropStale` nennt genau die veralteten; Persistenz-Rundweg; kaputtes JSON → leer; `saveCrewChanges` schickt genau einen Aufruf mit Body-Form (fetch-Attrappe) und wirft bei 409 mit `body.stale`.
- [ ] **Step 2:** rot. **Step 3:** implementieren. **Step 4:** grün.
- [ ] **Step 5:** Commit `feat: Crew-Entwurf als Modul + saveCrewChanges (v1.5.0)`.

### Task 6: App – Crew-Wege auf den Entwurf umstellen, Leiste, Öffnen-Dialog, alte Mail-Links

**Files:**
- Modify: `js/userView.js` (21-54, 254-269, 277-430, 427-560, 570-605), `js/render.js` (~170-200 Zellen-Knöpfe), `js/authService.js:150-190`, `js/app.js` (window-Bindungen), `index.html` (Leiste, `btnSendCancellations` und Meldungsleiste ersetzen), `styles.css`/`theme.css` (Markierung, Leiste)
- Test: `tests/crewsavebar.test.mjs` (neu); anpassen `tests/pencilcrew.test.mjs`, `tests/flows.test.mjs`, `tests/crewsaveorder.test.mjs` u. a., wo sie sofortiges Schreiben erwarten

**Interfaces:**
- Consumes: Task 5 (`crewDraft.js`, `saveCrewChanges`), `getCrewLoadedPlanId()` (dataService) als PB-Plan-ID.
- Produces (window-gebunden): `saveMyChanges()`, `discardMyChanges()`; bestehende Namen `confirmMySlot`, `declineMySlot`, `restoreMyPencil`, `declineAllMyPencilled`, `_bulkConfirmMySlots`, `toggleCancellation`, `_ackMeineEntfallenen`, `meinesMelden` bleiben, schreiben aber nur `setChange`/`toggleAvailability` + `saveDraft` + neu rendern.
- Nur bei `IS_CREW && !IS_MANAGER`; Manager-Pfad unverändert (`confirmAssignment`/`declineAssignment` bleiben für ihn).
- Leiste `#crewSaveBar` (fest unten, sichtbar bei `draftCount > 0`): „● n ungespeicherte Änderungen · 💾 Änderungen speichern · ↩ Verwerfen“. Verwerfen → `await showConfirm(...)`.
- Speichern: `saveCrewChanges` → Erfolg: `clearDraft`, `loadAssignmentStatuses`, `renderTable`, Toast „Gespeichert – der Planer bekommt eine Mail ✓“. 409: `removeEntries(stale)`, `await showAlert('Der Planer hat inzwischen geändert: …')`, Entwurf bleibt. 400/sonst: Entwurf unverändert, Toast mit Grund.
- Beim Laden des Crew-Plans: `dropStale` gegen `assignmentStatuses`; bleibt etwas übrig → `showConfirm('Du hast ungespeicherte Änderungen …', Speichern/Verwerfen)`; Verworfenes im Text nennen.
- Anzeige: Zellen und „Meine Einsätze“ nutzen `effectiveStatus`; geänderte Einträge mit Klasse `draft-changed` (gestrichelter Rahmen) und „● ungespeichert“.
- `authService._handleEmailAction`: `confirm|decline` → `setChange` mit aktuellem Status als `from`; `ackcancel` → je aid `setChange(..., to:'cancel_acked')`; danach Leiste zeigen; **kein** `pbPatch`.
- Entfernt aus dem Crew-Pfad: alle `pbPatch`/`pbPost` auf `assignments`, `logActivity`-Aufrufe, `sendAvailabilityNotice`-Aufruf.

- [ ] **Step 1: Failing tests:**
  - `Struktursperre: userView.js, render.js, authService.js rufen pbPatch/pbPost auf assignments nicht mehr auf` (Aufruf-Muster `pb(Patch|Post)\(\s*['"\`]/api/collections/assignments` im Quelltext dieser Dateien; dataService-Planerfunktionen ausgenommen) — Rot-Nachweis: vor dem Umbau schlägt sie an.
  - `Crew klickt Absagen → kein Netzaufruf, Entwurf 1, Leiste sichtbar`.
  - `Speichern → genau ein /crewsave-Aufruf mit allen Einträgen`.
  - `409 → nur stale entfernt, showAlert aufgerufen, Rest bleibt`.
  - `Verwerfen → showConfirm, danach Entwurf leer`.
  - `Öffnen mit Entwurf → showConfirm; veralteter Eintrag verworfen und genannt`.
  - `Mail-Link action=confirm → Entwurf statt PATCH`.
  - `Manager bestätigt weiter direkt` (confirmAssignment wird aufgerufen).
- [ ] **Step 2:** rot. **Step 3:** implementieren. **Step 4:** Volllauf grün.
- [ ] **Step 5:** Commit `feat: Crew sammelt Änderungen, speichert gesammelt (v1.5.0)`.

### Task 7: Version, Doku, Admin-Auftrag, Klick-Durchlauf

**Files:**
- Modify: `README.md` (Kopf-Eintrag v1.5.0 mit Changelog), `index.html`, `login.html`, `admin.html` (Versionsnummer), `docs/database-schema.md` (Kopf: Hook v4.30 im Repo, nicht deployt; `/crewsave`, `crew_changes`, Guard, `success='skipped'`), `docs/security.md` (Guard-Abschnitt), `docs/guide-crew.html` (Speichern/Verwerfen kurz)
- Create: `docs/admin-auftrag-hook-v4.30.md` — **nur** die Deploy-Zeile(n), wie vom Nutzer verlangt; Tests macht das Team selbst.
- Test: `tests/version.test.mjs` (bestehend)

- [ ] **Step 1:** Version auf v1.5.0, Doku nachziehen.
- [ ] **Step 2:** Admin-Auftrag schreiben (Inhalt: Datei `.pb_hooks/main.pb.js` aus Commit `<sha>` auf Test und Live einspielen, PocketBase neu starten; Kontrolle: Log-Zeile `v4.30` beim Start).
- [ ] **Step 3:** Volllauf in beiden Zeitzonen (`TZ=UTC node tests/run.mjs | tail -2`, `TZ=Europe/Berlin …`) grün.
- [ ] **Step 4:** Klick-Durchlauf im Headless-Chrome gegen nachgebildete DB (Muster `tools/dialog-harness.mjs`/`tools/serve-csp.mjs`): Crew ändert 3 Termine, verwirft; ändert 7, lädt neu, Dialog, speichert → genau ein `/crewsave`; Konsole zeigt „📧 Eingeladen am …“ aus Log-Attrappe. Server danach beenden.
- [ ] **Step 5:** Commit `v1.5.0 — Einladung mit Status, Crew speichert gesammelt` und `git push origin main`.

### Task 8: Live (nach Rückmeldung des Admins)
- [ ] `git fetch`; Rückmeldung lesen; `node tools/check-pb-rules.mjs` (nur lesend) grün.
- [ ] Gemeinsame Prüfung auf Test (Crew-Testkonto speichert → eine `crew_changes`-Zeile `skipped` in `email_log`).
- [ ] `git push origin main:live`; Doku-Kopf auf „deployt“ ziehen, Erledigt-Stempel im Auftrag, Commit `docs:`.
