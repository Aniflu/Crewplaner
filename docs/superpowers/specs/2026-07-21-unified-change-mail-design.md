# Vereinheitlichte Änderungs-Mail + Aktivitäts-Log — Design Spec

**Datum:** 2026-07-21
**Status:** Approved (Ansatz A, User-Brainstorming)
**Version-Ziel:** wird beim Merge erfragt (Vorschlag v0.30.0 — Feature)

---

## 1. Problem

„Update senden" und „Absage senden" sind heute zwei getrennte Mechanismen mit getrennten
Queues, getrennten Mails und getrennter UI (Sidebar-Button „↻ Updates" vs. rotes Banner
unten rechts, v0.29.2). Aus Sicht des Managers ist aber beides dasselbe: **eine Änderung
am Plan, über die die Crew informiert werden muss** — egal ob ein Tag hinzukommt oder
ein (bestätigter) Tag wegfällt. Außerdem gibt es keine Rückmeldung, ob die Crew eine
Absage überhaupt zur Kenntnis genommen hat.

## 2. Entscheidungen (User-Interview 2026-07-21)

1. **Eine Queue, ein Button:** Der Sidebar-Button „↻ Updates" sammelt neue UND
   entfernte Termine. Das rote „Absagen senden"-Banner unten rechts **entfällt**.
   Das manuelle „Absage"-Werkzeug in der Admin-Konsole (v0.29.3) bleibt als
   Notfall-/Nachtrag-Weg bestehen.
2. **Eine dynamische Mail** pro Person: „Hallo, in der Tour XYZ haben sich folgende
   Änderungen ergeben:" mit zwei Abschnitten:
   - **➕ Neue Termine** → Bitte „bestätige, dass du Zeit hast" (bestehender
     BESTÄTIGEN-Flow, Records stehen auf `proposed`).
   - **➖ Entfernte Termine** → Bitte „bestätige, dass du die Änderung gesehen hast"
     → **EIN Sammel-Button „ÄNDERUNGEN GESEHEN ✓"** pro Mail (nicht pro Termin).
3. **Quittungs-Tracking:** Klick auf „GESEHEN ✓" wird gespeichert. Der Admin sieht
   beim nächsten Login ein **Popup** mit den neuen Reaktionen und kann alles in einem
   **Aktivitäts-Log** (Textzeilen) nachlesen. Die Plan-Tabelle selbst zeigt die
   Quittung NICHT an (bewusst).
4. **Log-Umfang:** ALLE Crew-Reaktionen (zugesagt ✓ / abgelehnt ✗ / Absage gesehen 👁),
   egal ob per Mail-Button oder in der App.

## 3. Lösung (Ansatz A: Soft-Cancel + Client-Log)

### 3.1 Datenmodell

- `assignments.status` (Text-Feld, live verifiziert — kein Select): zwei neue Werte
  - `cancelled` — Zuweisung entfernt, Quittung ausstehend
  - `cancel_acked` — Crew hat die Absage quittiert
  Beim Entfernen einer bestätigten/angefragten Person wird der Record **nicht mehr
  gelöscht**, sondern auf `cancelled` gepatcht (Soft-Cancel) — nur so hat der
  „GESEHEN"-Button ein Ziel (`aid`).
- **NEUE Collection `activity_log`** (alle Felder Text, wie immer — Relation-Falle!):
  `{ plan_id, crew_name, crew_email, action, date, pos_label, detail }`
  `action` ∈ `confirmed | declined | cancel_acked`. Rules: list/create `auth != ""`.
  ⚠️ Coolify-Redeploy/Reimport-Caveat wie bei allen Collections dokumentieren.
  Anlage per PB-Superuser NUR auf ausdrückliche User-Anweisung (Regel pb-admin-access).

### 3.2 Queue & Entfernen-Pfade (Client)

- Queue-Einträge (`userView.js`) bekommen `kind: 'new' | 'removed'` (Default `'new'`
  für Bestand — rückwärtskompatibel).
- `dropdown.js` `_notifyIfWasActive()` (alle 4 Entfernen-/Ersetzen-Pfade aus v0.29.2)
  ruft statt `_storePendingCancellation` jetzt: `softCancelAssignment(date,posId)`
  (dataService, patcht `status:'cancelled'`) + legt einen `removed`-Queue-Eintrag an
  (mit `aid` des Records). `cancelProposal` (hartes Löschen) bleibt für Fälle OHNE
  vorherige Bestätigung/Anfrage (pencilled, Vormerkung zurückziehen etc.).
- `loadAssignmentStatuses` filtert zusätzlich `status != "cancelled" &&
  status != "cancel_acked"` → Zellen sehen aus wie bisher (leer/neu besetzbar).
- Wird ein Slot später NEU besetzt, greift das bestehende `pbUpsert`
  (plan_id+date+pos_id) und überschreibt den cancelled-Record → deshalb **Guard**:
  `ackCancelledAssignments` patcht nur Records, die noch `status==='cancelled'` haben.
- Banner-Code (`#cancellation-banner`, `renderCancellationBanner`,
  `flushAllCancellations`, `_storePendingCancellation`-Aufrufe in dropdown.js) wird
  entfernt; `sendCancellationNotice` bleibt (Admin-Konsolen-Werkzeug nutzt eigenen Pfad).

### 3.3 Mail (Hook v4.10 — Deploy durch Admin)

- `sendUpdateNotice` übergibt Slots künftig mit `{date, posLabel, kind, aid?}`.
- Hook-`update`-Template rendert dynamisch: Intro „…folgende Änderungen ergeben:",
  Abschnitt ➕ (falls vorhanden) mit BESTÄTIGEN-Hinweis/Button (bestehende Logik),
  Abschnitt ➖ (falls vorhanden) mit Button
  `https://crewplanner.nyxlightwork.de?action=ackcancel&aids=<id1>,<id2>`.
  Rückwärtskompatibel: Slots ohne `kind` → wie bisher als „neu" behandelt.
- Ohne Hook-Deploy: Mail kommt im alten Format (nur Terminliste) — App-Seite
  funktioniert unabhängig davon.

### 3.4 Quittung & Aktivitäts-Log

- `authService._handleEmailAction()`: neuer Zweig `action=ackcancel` → nach Login
  `ackCancelledAssignments(aids)` → pro erfolgreichem Patch ein `activity_log`-Eintrag
  (`action:'cancel_acked'`) + Erfolgs-Toast für die Crew.
- Bestehende Reaktionen loggen mit: `confirmAssignment` → `confirmed`,
  `declineAssignment` → `declined` (je ein `logActivity(...)`-Aufruf, fire-and-forget,
  Fehler nur console.warn — Log darf nie den Hauptflow brechen).
- **Admin-Konsole (admin.html):** beim Init `activity_log` laden; Zeilen neuer als
  `localStorage['tourplan_activity_last_seen']` → Popup (Modal) mit Textzeilen,
  danach Timestamp aktualisieren. Neuer Bereich/Tab „Aktivität" listet alle Zeilen
  (neueste zuerst, `sort=-id`).

### 3.5 Nicht-Ziele

- Keine Quittungs-Anzeige in der Plan-Tabelle.
- Kein Umbau des Crew→Admin-Flows („Änderungen mitteilen"/availability).
- Kein per-Termin-GESEHEN-Button (bewusst ein Sammel-Button).

## 4. Fehlerfälle

- Person ohne E-Mail: Entfernung wird soft-cancelled, aber kein Queue-Eintrag (wie
  bisher bei Updates — ohne Mail-Adresse nichts sendbar).
- `ackcancel` auf bereits neu besetztem Slot: Guard (nur `cancelled` patchen), Rest
  wird still übersprungen, Toast nennt die Anzahl quittierter Termine.
- activity_log-Write scheitert: console.warn, Hauptaktion bleibt erfolgreich.

## 5. Tests & Verifikation

- Node-Tests: Queue mit `kind`-Feldern (queue.test.mjs erweitern), Soft-Cancel-Guard
  (dataservice.test.mjs, fetch-gemockt), `loadAssignmentStatuses`-Filter.
- Echt-Browser-Verifikation (Muster v0.29.2/3): echter Code, echtes Menü — Entfernen
  einer bestätigten Person → Queue-Eintrag `removed` + PB-Patch statt Delete.
- Hook v4.10: nicht node-testbar (Goja) → nach Deploy per Test-Mail verifizieren.
- Admin-Popup: Headless mit vorbefülltem activity_log + altem last_seen-Timestamp.

## 6. Rollout

1. Frontend-Merge (Version nach User-Rückfrage, Vorschlag v0.30.0) → Testseite.
2. `activity_log`-Collection anlegen (per Superuser, auf User-Anweisung).
3. Hook v4.10 durch Admin deployen (`curl` + `docker restart`, Log-Zeile prüfen).
4. End-to-End: Tag entfernen → Update senden → Mail-Buttons → Admin-Login-Popup.
