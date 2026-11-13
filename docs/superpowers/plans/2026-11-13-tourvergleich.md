# Tourvergleich Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Neuer Admin-Tab „🔀 Tourvergleich“: zwei Touren wählen, Personal-Raster über Überschneidungstage, Tagestafel A | B zum Umsetzen von Personen.

**Architecture:** Reine Logik in `js/tourvergleich.js` (ohne DOM, getestet). UI in `js/tourvergleich-ui.js` lädt zwei Pläne in eigene Bündel (fasst die Admin-Globals nicht an) und schreibt pro Klick: Plan frisch lesen → einen Platz ändern → `plan_data` patchen. Verdrängte Status-Records laufen über die bestehende `removeAssignmentSlot` mit explizitem `planId`.

**Tech Stack:** Vanilla ES-Module, PocketBase-REST (`js/pb.js`), Test-Runner `node tests/run.mjs` (eigenes Mini-Framework `tests/_assert.mjs`).

**Spec:** `docs/superpowers/specs/2026-11-13-tourvergleich-design.md`

## Global Constraints
- Version **v1.2.0** (README oberster Eintrag, index.html, login.html, admin.html; `tests/version.test.mjs` prüft).
- Arbeit direkt auf `main`; Push nach `main` erst nach grünem pre-push-Hook; **nie nach `live`** ohne Freigabe.
- Kein Hook-, Schema- oder Regel-Change. Der Vergleich verschickt **nie** Mails.
- Platzhalter `__offen__`, `__offday__`, `__reise_tag__`, `__ausschreiben__` (js/state.js) sind keine Personen.
- Namensvergleich nur über `sameCrew`/`normCrewName` (js/pure.js).
- Update-Liste: localStorage-Schlüssel `'crewplan_updates_' + <PB-Plan-ID>`; Eintragsform wie `_queueRemovedSlot` (js/userView.js:601).
- Tourfarben: A `#2bb5a0` (blaugrün), B `#f08a3c` (orange); Konflikt `var(--warn)`/rot. Symbole statt Textkürzeln.
- Keine echten Mailadressen/Server-Kennungen in eingecheckte Dateien.
- Gestartete Prozesse (Headless-Chrome, lokaler Server) am Ende beenden.
- **Abweichung von der Spec (Opus-Entscheidung):** kein `logActivity` – `activity_log` ist laut database-schema.md nur für Crew-Reaktionen und erscheint im Login-Popup des Admins; Manager-Umsetzungen dort wären falsch einsortiert.

## Review Focus
1. Person steht in Tour A auf **zwei** Positionen am selben Tag → Raster zeigt beide Kürzel, kein Absturz; Umsetzen „nur B“ öffnet **beide** A-Plätze.
2. Tour B hat an einem Überschneidungstag keine Positionen bzw. leere `assignments` / fehlendes `defaultCrew` → keine Exceptions, Zelle „none“/„freeX“.
3. Name in A „Anna Bauer“, in B „anna bauer “ → als **eine** Person erkannt (gemeinsam), Anzeige mit dem Namen aus A.
4. Plan wurde seit dem Laden in der Touransicht geändert → Schreiben liest frisch und ändert nur den einen Platz; andere Änderungen bleiben erhalten.
5. Tour A = Tour B gewählt → Vergleichen verweigert mit Hinweis.

---

### Task 1: Reine Vergleichslogik

**Files:**
- Create: `js/tourvergleich.js`
- Test: `tests/tourvergleich.test.mjs`

**Interfaces:**
- Consumes: `OFFEN, OFFDAY, REISE_TAG, AUSSCHREIBEN` aus `js/state.js`; `sameCrew, normCrewName` aus `js/pure.js`.
- Produces (alle rein, Eingaben werden nie mutiert außer wo genannt):
  - `isPerson(v: string): boolean` – nicht leer, kein Platzhalter.
  - `effective(plan, date, posId): string` – Abweichung `plan.assignments[date][posId]` falls Schlüssel vorhanden (auch `''`), sonst `plan.defaultCrew[posId]||''`.
  - `overlapDays(a, b): string[]` – sortierte ISO-Daten, die in `a.tourDates` und `b.tourDates` vorkommen.
  - `slotsOf(plan, date, name): string[]` – posIds, auf denen `name` an `date` effektiv steht.
  - `personMatrix(a, b, { days: string[], onlyShared: boolean }): { people: Array<{ name, inA, inB }>, cells: { [name]: { [date]: { state, aPos: string[], bPos: string[] } } } }` – `state ∈ 'conflict'|'A'|'B'|'freeBoth'|'freeA'|'freeB'|'none'`; Personen = Vereinigung `a.crew`∪`b.crew` (normalisiert, Name aus A bevorzugt), gemeinsame zuerst, sonst Reihenfolge der Crews. `freeX` nur an Tagen, an denen Tour X einen tourDate hat.
  - `dayDemand(plan, date): { total, open }` – `open` = Positionen, deren effektiver Wert keine Person ist (`''` oder `OFFEN`/`AUSSCHREIBEN`); `OFFDAY`/`REISE_TAG` zählen nicht als offen. 0/0, wenn der Tag nicht in `plan.tourDates`.
  - `candidates(self, other, date, posId): Array<{ name, kind: 'free'|'other'|'same', otherPos: string[] }>` – Crew von `self`, sortiert free → other → same; `same` = steht in `self` an `date` schon auf anderer Position; die aktuelle Besetzung des Slots selbst fehlt in der Liste.
  - `applySlot(planData, date, posId, value): planData` – tiefe Kopie; wenn `value === (defaultCrew[posId]||'')` Abweichung löschen (und leeres Tagesobjekt entfernen), sonst setzen.
  - `planMove({ a, b, date, name, keep: 'A'|'B' }): Array<{ tour: 'A'|'B', posId, value }>` – für jede Position in der **anderen** Tour, auf der `name` steht: `{ value: OFFEN }`.
  - `planAssign({ self, other, selfTour, date, posId, name }): Array<{ tour, posId, value }>` – setzt `name` auf `self/posId`; steht `name` in `other` am Tag, zusätzlich dessen Plätze → `OFFEN`; `name === null` bedeutet „↩ Stammbesetzung“ (value = `defaultCrew[posId]||''`), `name === OFFEN` erlaubt.

- [ ] **Step 1: Tests schreiben** – Fixture als echte PB-Form (JSON-String geparst wie in `loadSelectedPlan`):
  ```js
  const A = JSON.parse(JSON.stringify({version:3, crew:['Anna Bauer','Tom Richter','Max Mustermann'],
    positions:[{id:'gl',label:'GL',short:'GL'},{id:'lt1',label:'Licht 1',short:'Licht 1'}],
    defaultCrew:{gl:'Anna Bauer', lt1:'Tom Richter'},
    tourDates:[{date:'2026-07-08',type:'show',typeLabel:'Show',loc:'X'},{date:'2026-07-09',type:'show',typeLabel:'Show',loc:'Y'}],
    assignments:{'2026-07-08':{lt1:'__offen__'}}}));
  const B = /* crew ['anna bauer ','Sara Klein','Tom Richter'], positions gl, sys; defaultCrew {gl:'Sara Klein', sys:'Tom Richter'};
               tourDates 2026-07-09, 2026-07-10; assignments {'2026-07-09':{gl:'anna bauer '}} */;
  ```
  Tests (Name → Assertion):
  - `overlapDays: nur gemeinsame Tage` → `['2026-07-09']`
  - `personMatrix: Konflikt über Abweichung (B) + Stammbesetzung (A)` → `cells['Anna Bauer']['2026-07-09'].state === 'conflict'`, aPos `['gl']`, bPos `['gl']`
  - `personMatrix: Konflikt über zwei Stammbesetzungen` → Tom 07-09 `conflict` (A lt1, B sys)
  - `personMatrix: Platzhalter ist keine Person` → Tom 07-08 (A lt1 = OFFEN) `state` ∈ {`freeA`,`freeBoth`} nicht `A`; mit days `['2026-07-08']`
  - `personMatrix: Name normalisiert, gemeinsam zuerst` → people[0..1] sind Anna Bauer, Tom Richter mit `inA && inB`; kein Eintrag `'anna bauer '`
  - `personMatrix: onlyShared filtert` → Max/Sara fehlen bei `onlyShared:true`
  - `dayDemand: OFFEN zählt offen, Tag fehlt → 0/0` → A 07-08 `{total:2, open:1}`, A 07-10 `{total:0,open:0}`
  - `candidates: frei vor anderer Tour vor gleicher Tour` (A, B, '2026-07-09', 'gl' nach Setzen von gl:'' ) → Reihenfolge kinds
  - `applySlot: Rückkehr zur Stammbesetzung löscht Abweichung` → `applySlot(A,'2026-07-08','lt1','Tom Richter').assignments['2026-07-08']` ist `undefined`; Eingabe `A` unverändert
  - `planMove: keep A öffnet alle B-Plätze` (Review Focus 1: Tom zusätzlich auf B gl per Abweichung) → zwei Schritte, beide `OFFEN`, tour `'B'`
  - `planAssign: zieht Person aus anderer Tour ab`
  - `robust: leere Pläne` (Review Focus 2) → `personMatrix({crew:[],positions:[],tourDates:[]}, B, …)` wirft nicht; `dayDemand({}, d)` → `{total:0,open:0}`
- [ ] **Step 2:** `node tests/run.mjs 2>&1 | grep -E "✗|passed"` → FAIL (Modul fehlt).
- [ ] **Step 3:** `js/tourvergleich.js` implementieren (Signaturen oben). Darf nur `state.js`-Konstanten und `pure.js` importieren, nichts mit DOM.
- [ ] **Step 4:** Tests grün. **Rot-Nachweis:** in `personMatrix` die Konfliktbedingung kurz auf `aPos.length && false` ändern → mindestens die zwei Konflikt-Tests fallen; zurücksetzen.
- [ ] **Step 5: Commit** `feat: Tourvergleich – reine Vergleichslogik (v1.2.0)`

### Task 2: Herausnehmen und Update-Liste plan-bezogen

**Files:**
- Modify: `js/dataService.js` (`cancelProposal` ~452, `removeAssignmentSlot` ~682, `softCancelAssignment` ~696)
- Modify: `js/pure.js` (neu `queueAddRemoved`)
- Modify: `js/userView.js:601` (`_queueRemovedSlot` nutzt `queueAddRemoved`)
- Test: `tests/tourvergleich.test.mjs` (erweitern), bestehende `tests/queue.test.mjs` muss grün bleiben

**Interfaces:**
- Produces:
  - `removeAssignmentSlot(dateStr, posId, opts?: { planId: string, statuses: object })` → `{ wasActive, rec, crewName }`. Mit `opts`: Plan-ID aus `opts.planId` statt `_getActivePlanId()`, Status aus `opts.statuses[date][posId]`, entfernt den Eintrag aus `opts.statuses` und fasst den globalen `assignmentStatuses`/`clearStatus` **nicht** an. Ohne `opts`: Verhalten unverändert.
  - `softCancelAssignment(dateStr, posId, opts?)`, `cancelProposal(dateStr, posId, opts?)` – gleiche Regel (opts durchreichen).
  - `queueAddRemoved(q, crewName, email, dateStr, posId, posLabel, aid): q` in `js/pure.js` – mutiert/liefert `q` in exakt der heutigen Form (`{[crewName]:{email, slots:[{kind:'removed',date,posId,posLabel,aid,changes:['Termin entfernt']}]}}`), dedupliziert wie heute, ohne Mail nichts.
- [ ] **Step 1: Tests** (mit `loadGraph()`, fetch-Stub aus `_setup.mjs` wie in `tests/dataservice.test.mjs`):
  - `removeAssignmentSlot mit planId: patcht Record des angegebenen Plans auf cancelled` – Stub liefert Record für Filter mit `plan_id = "PB_B"`; Assertion: PATCH-Body `status:'cancelled'`, Filter enthielt `PB_B`, globaler `assignmentStatuses` unverändert, `opts.statuses['2026-07-09'].gl` gelöscht.
  - `removeAssignmentSlot mit planId: vorgemerkt → DELETE, wasActive false`.
  - `queueAddRemoved: Form und Dedupe` → zweimal gleicher Slot → 1 Eintrag; ohne email → q unverändert.
- [ ] **Step 2:** Tests rot.
- [ ] **Step 3:** Implementieren; `_queueRemovedSlot` ruft `queueAddRemoved(_getCrewUpdateQueue(), …)` und speichert wie bisher.
- [ ] **Step 4:** `node tests/run.mjs 2>&1 | grep -E "✗|passed"` → 0 failed (inkl. queue/bulkstatus/dataservice).
- [ ] **Step 5: Commit** `refactor: Slot-Herausnahme und Update-Liste mit explizitem Plan (v1.2.0)`

### Task 3: Admin-Tab Tourvergleich (UI + Speichern)

**Files:**
- Create: `js/tourvergleich-ui.js`
- Modify: `js/admin-app.js` (Import + `window.tvInit`, `window.tvCompare` u. a. Handler)
- Modify: `admin.html` (Tab-Knopf nach „Werkzeuge“ Z. 555, Abschnitt `<div class="section" id="tabTourvergleich">` nach `tabWerkzeuge`, CSS im `<style>`-Block)
- Test: `tests/tourvergleich.test.mjs` (Struktursperren)

**Interfaces:**
- Consumes: Task 1 komplett; `removeAssignmentSlot(…, { planId, statuses })`, `queueAddRemoved` aus Task 2; `pbGet, pbPatch` (js/pb.js); `esc, showToast` (js/utils.js).
- Produces (für admin.html-Onclicks über `window`): `tvInit()` (füllt beide Selects aus `/api/collections/plans/records?perPage=200&sort=-id`, Manager-Filter `owner="<id>"` wie `loadAdminPlans`), `tvCompare()`, `tvOpenDay(date)`, `tvCloseDay()`, `tvShiftDay(±1)`, `tvPickSlot(tour, date, posId)`, `tvMove(name, date, keep)`.
- Bündel je Tour: `{ pbId, name, plan, statuses, crewMeta }` – geladen wie `loadSelectedPlan` (admin.html:1444-1490: plan_data parsen, `crew_members` per `plan_id`, `assignments` per `plan_id`; Status `cancelled`/`cancel_acked`/`declined` beim Laden **ausfiltern** wie loadAssignmentStatuses).

Verhalten (aus Spec, hier festgelegt):
- Kopf: Select A, Select B, „Vergleichen“, Schalter „nur Überschneidungstage“ (an), „nur gemeinsame Leute“ (an), Hinweiszeile „Beide Touren nicht gleichzeitig in der Touransicht offen haben – deren Auto-Speichern würde überschreiben.“ A = B → Toast „Bitte zwei verschiedene Touren wählen“.
- Zusammenfassung: „⚠ n Konflikttage · m Personen doppelt“ bzw. grün „✓ keine Doppelbelegung“; ohne Überschneidung: „Die Touren überschneiden sich an keinem Tag“ und Raster aller Tage nur bei abgeschaltetem Schalter.
- Raster: `<div class="tv-scroll">` (nur hier `overflow-x:auto`), Tabelle mit sticky erster Spalte. Spaltenkopf: `Mi 09.07`, darunter zwei 4-px-Balken in Tagestyp-Farbe (TYPE_COLOR_DEFAULTS aus js/types.js) für A/B, `title` = „A: Show · Ort / B: …“. Zelle: zwei Hälften (A oben, B unten) mit Position-`short`; Klassen `tv-conflict` (roter Rahmen + ⚠), `tv-free` (gestrichelt), `tv-a`, `tv-b`. Fußzeilen „A offen“, „B offen“ aus `dayDemand` (0 grün, >0 rot). Konfliktzelle-Klick → Mini-Menü „→ nur A“ / „→ nur B“ / „📋 Tagestafel“; andere Zellen und Spaltenkopf → Tagestafel.
- Tagestafel (Modal über `openModal`-Muster, eigene id `tvDayModal`): zwei Spalten in Tourfarbe; je Position Zeile `Label · Person · Statussymbol` (✓ confirmed, ⏳ proposed, ✎ pencilled), Konfliktperson rot; ‹ › springen über `overlapDays`. Klick auf Platz → Liste `candidates` mit 🟢/🟡 „bei B als GL“/⚪ plus „⚠ Offen“ und „↩ Stammbesetzung“. Fußleiste „Frei an diesem Tag“ = Personen mit Zustand `freeBoth|freeA|freeB`.
- Speichern `tvApply(steps)` je Schritt `{tour, posId, value}`, sequenziell:
  1. `rec = await pbGet('/api/collections/plans/records/'+pbId)`; `fresh = JSON.parse(rec.plan_data)`.
  2. Hat der Slot einen Status und wechselt die Person (`!sameCrew(status.crewName, value)`): `r = await removeAssignmentSlot(date, posId, { planId: pbId, statuses })`; bei `r.wasActive && r.rec` → `queueAddRemoved(q, r.crewName, crewMeta[r.crewName]?.email || r.rec.crew_email, date, posId, posLabel, r.rec.id)` auf `localStorage['crewplan_updates_'+pbId]` (try/catch), Hinweis in der Tafel: „Absage für {Name} liegt in der Update-Liste von {Tour} – Versand dort über ‚Updates senden‘.“
  3. `await pbPatch('/api/collections/plans/records/'+pbId, { plan_data: JSON.stringify(applySlot(fresh, date, posId, value)) })`; Bündel-`plan` = Ergebnis; neu rendern.
  4. Fehler → Toast rot mit Meldung, Bündel neu laden.
- Neu eingesetzte Personen: **kein** Status-Record, keine Mail.
- Hell/Dunkel über bestehende CSS-Variablen; Handybreite 390 px: keine waagerechte Seitenscrollbar außer im `.tv-scroll`.

- [ ] **Step 1: Struktursperren-Tests** (Quelltext lesen per `readFileSync`, Aufruf statt Name prüfen):
  - `UI ruft removeAssignmentSlot mit planId` → Regex `/removeAssignmentSlot\([^)]*\{\s*planId/` matcht in `js/tourvergleich-ui.js`.
  - `UI kopiert keine Herausnahme` → kein `status:\s*'cancelled'` und kein `/api/collections/assignments/records/` mit PATCH/DELETE in `js/tourvergleich-ui.js`.
  - `UI verschickt keine Mails` → kein `notify(` / `send[A-Z]\w*Notice` / `sendCrewInvite` in `js/tourvergleich-ui.js`.
  - `UI liest Plan vor dem Patch frisch` → im Rumpf von `tvApply` steht `pbGet(` vor `pbPatch(`.
  - `admin.html hat Tab und Abschnitt` → `data-tab="tourvergleich"` und `id="tabTourvergleich"` vorhanden.
- [ ] **Step 2:** rot.
- [ ] **Step 3:** UI, admin-app-Anbindung, admin.html (Tab-Klick: `switchTab('tourvergleich'); tvInit()`), CSS.
- [ ] **Step 4:** Tests grün; `node --check js/tourvergleich-ui.js`; Rot-Nachweis: `planId` im Aufruf kurz entfernen → Sperre fällt; zurück.
- [ ] **Step 5: Sichtprüfung lokal**: `python3 -m http.server 8765` im Repo (Hintergrund), Headless-Chrome-Screenshots (`"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --screenshot=… --window-size=1400,900` und `390,844`) einer Demo-Seite `scratchpad/tv-demo.html`, die `tourvergleich-ui.js` mit zwei Fixture-Bündeln rendert (Exportfunktion `tvRenderWithBundles(a, b)` dafür vorsehen). Danach Server und Chrome beenden (`ps -ef | grep -E "http.server|Chrome.*headless"`).
- [ ] **Step 6: Commit** `feat: Admin-Tab Tourvergleich – Raster und Tagestafel (v1.2.0)`

### Task 4: Version, Doku, Abnahme auf Test

**Files:**
- Modify: `README.md` (neuer oberster Eintrag v1.2.0 „Tourvergleich“), `index.html`, `login.html`, `admin.html` (Versionsstring + `?v=`-Cachebuster für geänderte Skripte), `docs/guide-admin.html` (Abschnitt „Tourvergleich“: Touren wählen, Raster lesen, Tagestafel, was mit bestätigten Leuten passiert)
- [ ] **Step 1:** Version setzen; `node tests/run.mjs 2>&1 | grep -E "✗|passed"` → 0 failed; `TZ=UTC` und `TZ=Europe/Berlin` ebenso.
- [ ] **Step 2: Commit** `v1.2.0 — Tourvergleich im Admin` und `git push origin main` (pre-push-Hook muss grün sein).
- [ ] **Step 3: Abnahme auf Test-Seite** (nach Pages-Deploy, als Manager-Testkonto aus `.claude.local.md`; per API gegenlesen):
  - Zwei Testpläne anlegen/wählen: Treffer = Person P1 am Tag X in A und B; Nicht-Treffer = P2 nur an einem Tag ohne Überschneidung in A; dazu in B am Tag X ein **bestätigter** Status für P1.
  - Raster zeigt P1@X als Konflikt, P2 ohne Konflikt.
  - „→ nur A“ für P1@X: B-plan_data hat `assignments[X][pos] = '__offen__'`, A-plan_data unverändert, P2-Einträge unverändert; B-Status-Record `cancelled`; `localStorage['crewplan_updates_<B>']` enthält den Eintrag; E-Mail-Log ohne neuen Eintrag.
  - Testdaten danach zurücksetzen.
- [ ] **Step 4:** Nutzer um Prüfung auf der Test-Seite bitten; **live erst nach Freigabe** (`git push origin main:live`).
