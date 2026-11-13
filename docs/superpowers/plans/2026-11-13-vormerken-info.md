# v1.4.0 Vorläufig vormerken als Information – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Spec: docs/superpowers/specs/2026-11-13-vormerken-info-design.md (bindend).

**Goal:** Vormerkung = reine Information: Info-Mail und Popup, die Crew darf nur absagen oder eine eigene Vormerkungs-Absage zurücknehmen, der Planer sieht „gesehen ✓“ und bekommt „VORMERKUNG ABGESAGT“-Mails.

**Architecture:** Neuer Status `pencil_declined` (Textfeld, kein Schema). Statusregeln in js/pure.js mit Kopie im Hook. Neuer notify-Typ `pencil_info`. „gesehen“ über `activity_log` (`pencil_seen`). Der Hook ist **rückwärtskompatibel** (v4.29 erlaubt weiter `pencilled→declined`), damit Live-App v1.3.0 und Hook v4.29 zusammenpassen.

**Tech Stack:** Vanilla ES-Module, PocketBase-Hook (Goja, `.pb_hooks/main.pb.js`), Tests `node tests/run.mjs`.

## Global Constraints
- App **v1.4.0**, Hook **4.29**.
- **Push-Reihenfolge:** Task 1 (Hook und Auftrag) wird allein auf `main` gepusht; Hook-Dateien ändern das Frontend nicht. Die App-Tasks 2–5 bleiben **lokal**, bis die Rückmeldung „Hook v4.29 auf Test deployt“ da ist. Danach Push `main`, Nutzerprüfung, Hook live, App live (nur nach Freigabe).
- Crew-Statusregeln, wörtlich in pure.js und Hook gleich:
  `proposed:['confirmed','declined'], confirmed:['declined'], pencilled:['pencil_declined','declined'], pencil_declined:['pencilled'], cancelled:['cancel_acked']`. `declined` aus `pencilled` bleibt nur für die alte App, die neue App nutzt es nicht.
- `pencil_declined` zählt wie `declined`: nicht im Kalender oder ICS, nicht verfügbar. Die Tabelle zeigt durchgestrichenes Violett „✎✗“ mit Tooltip „Vormerkung abgesagt“.
- Texte genau wie in der Spec: Betreffe „VORMERKUNG ABGESAGT“, „VORMERKUNG WIEDER FREI“, „Vormerkung – nur Information · {Tour}“; Popup-Titel „ℹ Nur zur Information“, Knopf „OK, verstanden“; Knöpfe „✉ Vormerkung mitteilen“, „✗ Absagen“, „✗ Alle absagen“, „↩ Wieder vormerken“, „gesehen ✓ {Datum}“.
- Nie `confirm()`, `alert()` oder `prompt()` des Browsers. `esc()` für Nutzerstrings. Keine echten Adressen oder Server-Kennungen. Prozesse beenden.

## Review Focus
1. Die alte App v1.3.0 läuft gegen Hook 4.29: Absage einer Vormerkung (`declined`) wird weiter angenommen, eine Einladung mit vorgemerkten Tagen setzt diese **nicht** auf proposed.
2. Die Crew versucht `declined → pencilled` oder `pencil_declined → confirmed` → der Hook lehnt ab.
3. Eine Person mit vorgemerkten **und** angefragten Tagen bekommt eine Einladung → nur die angefragten bzw. ungeplanten Tage sind enthalten, die vorgemerkten bleiben vorgemerkt.
4. Popup: neue Vormerkungen nach einem früheren OK → das Popup erscheint erneut nur mit den neuen Tagen; nach OK genau ein `pencil_seen`-Eintrag.
5. Alle Status-Listen (Tourvergleich-Bündel, `loadAssignmentStatuses`, ICS, Bulk-Status, Konsole) kennen `pencil_declined` und brechen nicht.

---

### Task 1: Hook v4.29 und Admin-Auftrag (wird zuerst gepusht)
**Files:** `.pb_hooks/main.pb.js`, `js/pure.js` (Tabelle `CREW_STATUS_TRANSITIONS`), `tests/statusguard.test.mjs`, `tests/pure.test.mjs`, Hook-Tests nach Muster `tests/hook*.test.mjs`. Neu: `docs/admin-auftrag-hook-v4.29.md` (Ablauf nach `docs/admin-runbook-hook-deploy.md`, Vorlage `docs/admin-auftrag-hook-v4.28.md`).
- Statusregeln wie in den Global Constraints, Hook-Kopie (~357-361) gleich.
- Nach-Update-Mail (~444-580):
  - `pencil_declined` → Admin-Mail „VORMERKUNG ABGESAGT · {Position} · {Datum} · {Name}“
  - Übergang `pencil_declined→pencilled` → „VORMERKUNG WIEDER FREI · …“
  - „ABGELEHNT“ nur bei `declined`
- `/notify` (~976-1100):
  - Typ `pencil_info` in TABELLE und Mail-Vorlage nach Spec-Text, mit Terminliste, optionalem `customMessage` und App-Link. Kein Status-Schreiben, kein `crew_invites`-Eintrag, außer das bestehende Muster verlangt ihn für den Versand; dann wie `availability` behandeln und begründen. Drosselung wie Einladung.
  - Bei `invite`, `reminder` und `update`: Datensätze mit Status `pencilled` oder `pencil_declined` **nicht** auf `proposed` setzen und aus der Mail-Liste nehmen.
- `/planstatus`: liefert `pencil_declined` mit aus.
- Version 4.29, Changelog-Kopf.
- Admin-Auftrag mit Inhalt:
  - was sich ändert
  - Einspielen erst auf **Test**, dann auf Live
  - Prüfpunkte, darunter: die Absage einer Vormerkung erzeugt die Mail „VORMERKUNG ABGESAGT“, und eine Einladung lässt eine Vormerkung unverändert
  - Rückmeldung als `docs/rueckmeldung-hook-v4.29-<datum>.md`
  - Rückweg auf 4.28
- **Tests:**
  - Statusguard-Gleichheit
  - Fälle aus Review Focus 1 und 2 als reine Funktionstests der Hook-Regeln (Muster der vorhandenen Hook-Tests)
  - Rot-Nachweis: Hook-Tabelle ohne `pencil_declined:['pencilled']` → Gleichheitstest rot
- Commit `hook: v4.29 – Vormerkung als Information (Auftrag an Admin)`. **Diesen Commit allein pushen**, die App-Dateien bleiben unberührt. Prüfen mit `git show --stat`: nur `.pb_hooks`, `js/pure.js`, Tests, Docs. Ist `js/pure.js` im Frontend aktiv, ist das in Ordnung, denn die Tabelle ist rückwärtskompatibel.

### Task 2: App-Statuslogik für `pencil_declined` (lokal)
**Files:** js/dataService.js (`declineAssignment` → für Vormerkungen `pencil_declined`; neu `restorePencilled(dateStr,posId)`: `pencil_declined→pencilled` mit Client-Prüfung über `isCrewStatusTransitionAllowed`; `loadAssignmentStatuses`), js/pure.js (`_ICS_RANK` und Labels: `ICS_STATUS_LABEL` ohne `pencil_declined`), js/render.js (Zellstil), js/bulkStatus.js, js/tourvergleich-ui.js (Ladefilter wie `declined`), js/crewNotify.js (`_getNewSlotsForCrew`, Einladungs- und Erinnerungsfilter: **ohne** `pencilled`/`pencil_declined`), js/utils.js `isPending`/`isPencilled` (prüfen).
- **Tests:**
  - Crew-Absage einer Vormerkung sendet `status:'pencil_declined'`, Rücknahme sendet `'pencilled'`.
  - Die Einladungs-Slotliste enthält keine vorgemerkten Tage (Review Focus 3).
  - Jede Status-Liste verarbeitet `pencil_declined` ohne Fehler (Review Focus 5).
  - Rot-Nachweis für den Einladungsfilter.

### Task 3: Konsole – mitteilen, gesehen, Zähler (lokal)
**Files:** js/crewNotify.js (Zeile je Person: „✉ Vormerkung mitteilen“ mit vorgemerkten Tagen > 0, Vorschau mit Freitext wie `openInvitePreview`, Vermerk „mitgeteilt am“ je Plan wie die Einladungs-Vermerke; „gesehen ✓ {Datum}“ aus `activity_log` mit Filter `plan_id`, `crew_name`/`crew_email`, `action='pencil_seen'`, jüngster Eintrag; „✎✗ n Vormerkungen abgesagt“), js/dataService.js `sendPencilInfo(crewName, crewEmail, slots, customMessage)` → `notify({type:'pencil_info', planId, crewName, crewEmail, planName, slots, customMessage?})`, admin.html Aktivitäts-Tab-Labels (`pencil_seen` 👁 „hat die Vormerkung gesehen“, `pencil_declined` ✎✗ „hat eine Vormerkung abgesagt“, `pencil_restored` ↩ „hat eine Vormerkung wieder angenommen“).
- **Tests:**
  - `pencil_info`-Nutzlast festschreiben (planId aus dem Konsolen-Plan)
  - ohne vorgemerkte Tage kein Knopf
  - gesehen ✓ aus gemocktem `activity_log`
  - Rot-Nachweis

### Task 4: Crew – Popup, Absagen, Zurücknehmen (lokal)
**Files:** js/userView.js (`checkAndOpenMySchedule` bzw. neu `checkPencilInfoPopup()`: zeigt das Popup, wenn vorgemerkte Tage existieren, deren Schlüssel `date|posId` nicht in `localStorage['crew_pencil_seen_<PB>']` stehen; OK → Schlüssel ergänzen und **ein** `logActivity('pencil_seen', {planId,…})`; Abschnitt „✎ Vorgemerkt“: „✗ Alle absagen“, je Tag „✗ Absagen“; Abschnitt bzw. Zellen für `pencil_declined`: „↩ Wieder vormerken“; `openSlotConfirmModal` für beide Status), js/render.js (Crew-Zelle `pencil_declined` klickbar → Rücknahme), js/dataService.js `logActivity`-Aktionen `pencil_declined`/`pencil_restored` bei Crew-Aktionen.
- Das Popup nutzt den Projektdialog bzw. ein `modal-bg` im Projektdesign, nie Browser-Dialoge.
- **Tests:**
  - Popup nur bei neuen Vormerkungen (Review Focus 4)
  - genau ein `pencil_seen` je OK
  - Absage → `pencil_declined`, Rücknahme → `pencilled`
  - „Alle absagen“ betrifft nur Vormerkungen, keine Anfragen
  - Rot-Nachweis

### Task 5: Version, Doku, Abnahme (lokal)
- v1.4.0 in den Versionsstellen, Cachebuster +1, README-Eintrag.
- docs/guide-admin.html: Vormerkung mitteilen, gesehen, Absagen.
- docs/guide-crew.html und docs/user/getting-started.md: Vormerkung = Info, absagen, zurücknehmen.
- docs/database-schema.md: Statuswerte und Statusregeln mit Vermerk „ab Hook v4.29“.
- **Klick-Durchlauf im Headless-Chrome gegen eine nachgebildete Datenbank:**
  - Konsole: Mitteilen → genau ein notify `pencil_info`; gesehen ✓ erscheint nach gemocktem `pencil_seen`.
  - Crew-Ansicht: Popup → OK → ein Log-Eintrag; Tag absagen → `pencil_declined`; zurücknehmen → `pencilled`; „Alle absagen“; Einladung nimmt keine Vormerkung mit.
  - keine Browser-Abfragen
- Bildschirmfotos hell, dunkel und 390 px; Server und Chrome beenden.
- Gesamt-Review, danach **warten auf die Test-Rückmeldung des Admins**, dann Push `main`.
