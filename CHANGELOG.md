# Changelog

## v0.9.8.9 — 2026-05-26

### Fix: Explizite Anfrage-Option im Slot-Dropdown

- **`js/dropdown.js`** / **`js/bundle.js`** — Neues Item "📧 [Name] anfragen" erscheint im Slot-Dropdown wenn ein Name zugewiesen ist, der Crewmember eine E-Mail hat, und noch keine Anfrage (PB-Record) existiert
- Ein Klick = ein Aufruf von `proposeCrew` = eine E-Mail — vollständig admin-kontrolliert
- Gilt für alle Tagestypen (Show, Off, Reise, Prep etc.)
- Keine automatische E-Mail — nur auf expliziten Klick des Admins

---

## v0.9.8.8 — 2026-05-26

### Revert: v0.9.8.7 automatisches proposeCrew zurückgenommen

- **`js/dropdown.js`** / **`js/bundle.js`** — Crew-Zuweisung im Dropdown ruft wieder nur `setAssign` auf, kein `proposeCrew`
- E-Mails werden ausschließlich manuell vom Admin im Adminfenster ausgelöst — nie automatisch

---

## v0.9.8.7 — 2026-05-26

### Fix: Crew-Zuweisung löst jetzt automatisch Anfrage aus

- **`js/dropdown.js`** / **`js/bundle.js`** — Wenn Admin in `openCrewDD` einen Namen mit 📧 auswählt, wird nach `setAssign` automatisch `proposeCrew` aufgerufen → PB-Record mit `status='proposed'` angelegt → E-Mail an Crewmitglied
- Guard gegen Duplikate: `proposeCrew` wird nur aufgerufen wenn kein bestehender Antrag für dieselbe Person vorhanden ist
- Bei Wechsel von Person A → Person B: Ausstehender Antrag für A wird automatisch zurückgezogen (Absage-E-Mail in Queue), neuer Antrag für B erstellt
- Gilt für ALLE Tagestypen (Show, Off, Reise, Prep etc.) — kein Typ-Filter

---

## v0.9.8.6 — 2026-05-25

### Feature: Ausschreiben-Slot

- **`js/state.js`** — Konstante `AUSSCHREIBEN = '__ausschreiben__'` hinzugefügt
- **`js/dropdown.js`** — Neuer Eintrag "📋 Ausschreiben" (orange) im Crew-Dropdown
- **`js/render.js`** — Manager/Booker sehen "📋 Ausschr." (orange); eingeloggte Crew sieht "📋 Bewerben"-Button (ruft `meinesMelden()` auf); Supabase-Status hat weiterhin Vorrang
- **`js/bundle.js`** — dropdown.js gespiegelt

---

## v0.9.8.5 — 2026-05-25

### Feature: Offday & Reisetag als neue Slot-Zustände

- **`js/state.js`** — Konstanten `OFFDAY = '__offday__'` und `REISE_TAG = '__reise_tag__'` hinzugefügt
- **`js/dropdown.js`** — Zwei neue Einträge im Crew-Dropdown: 🏖 Offday (grün) und ✈ Reisetag (blau)
- **`js/render.js`** — Visuelle Anzeige für beide Zustände; Supabase-Status hat Vorrang (OFFDAY/REISE_TAG werden nur angezeigt wenn kein aktiver proposed/confirmed/declined-Status vorhanden)
- **`js/bundle.js`** — dropdown.js gespiegelt
- Tageszähler im Crew-Sidebar zählt Offday/Reise-Tage nicht als Arbeitstage (automatisch durch Name-Matching)

## v0.9.7.1 — 2026-05-21

### Security: XSS-Escaping + Doppel-E-Mail-Schutz + Admin-E-Mail aus ENV

- **`.pb_hooks/main.pb.js`** (v3.9→v4.0)
  - `esc()`-Funktion in allen 3 Hooks — `crewName`, `posLabel`, `planName` werden in HTML-Templates HTML-escaped (verhindert XSS in E-Mails)
  - UPDATE-Hook (assignments): prüft via `r.originalCopy()` ob Status bereits `proposed` war — sendet keine E-Mail wenn sich nichts geändert hat (verhindert Doppel-E-Mails bei `pbUpsert`-Calls)
  - Admin-E-Mail für Ablehnungs-Benachrichtigung jetzt via `$os.getenv('ADMIN_EMAIL')` mit Fallback auf hardcodierten Wert
  - `app_url`-Feld für JSON-Slot-Transport in Absage-Mails explizit kommentiert

- **`js/dataService.js`** — `proposeCrew()` und `bulkProposeCrew()` mit WARNUNG-Kommentaren versehen (beide Funktionen triggern PB-Hook → E-Mail; werden aktuell von keiner UI-Aktion aufgerufen)

- **`js/userView.js`** — `meinesMelden()` ruft kein `proposeCrew()` mehr auf; rein lokal (bereits in v0.9.7.0 gefixt, hier dokumentiert)

### Deploy erforderlich

```bash
ssh hetzner "curl -o /var/lib/docker/volumes/ad9adhhkygjreidi79i4v5eb_pocketbase-hooks/_data/main.pb.js \
  https://raw.githubusercontent.com/Aniflu/Crewplaner/main/.pb_hooks/main.pb.js \
  && docker restart pocketbase-ad9adhhkygjreidi79i4v5eb"
```

### Optional: ADMIN_EMAIL in Coolify setzen

Damit Ablehnungs-Mails flexibel an die richtige Adresse gehen:
```
ADMIN_EMAIL=deine@email.de
```

---

## v0.9.7.0 — 2026-05-21

### Fix: sendInvite() + meinesMelden() — keine ungewollten E-Mails mehr

- **`js/crewNotify.js`** — `sendInvite()`: `bulkProposeCrew()`-Block entfernt; sendet jetzt genau 1 E-Mail via `sendCrewInvite()`
- **`js/userView.js`** — `meinesMelden()`: `proposeCrew()`-Aufruf entfernt; rein lokal (kein PB-Record, kein E-Mail-Trigger)

---

## v0.9.6.2 — 2026-05-18

### Fix: createUser() — verified-Feld via Hook setzen

- **`.pb_hooks/main.pb.js`** (v3.3→v3.4) — Neuer Handler `onRecordAfterCreateSuccess` auf `users`-Collection: setzt `verified=true` serverseitig, da PocketBase das Feld per Collections-API nicht beschreibbar macht
- **`admin.html`** — Fehlerhafte `pbPatch(... verified: true)`-Zeile entfernt; Flow funktioniert jetzt vollständig: Anlegen → Hook verifiziert → Reset-Mail via PB SMTP (Resend-Gateway)

### Deploy erforderlich

```bash
ssh hetzner "curl -o /var/lib/docker/volumes/ad9adhhkygjreidi79i4v5eb_pocketbase-hooks/_data/main.pb.js \
  https://raw.githubusercontent.com/Aniflu/Crewplaner/main/.pb_hooks/main.pb.js \
  && docker restart pocketbase-ad9adhhkygjreidi79i4v5eb"
```

---

## v0.9.6.1 — 2026-05-18

### Versionsnummern + Kleinfix

- **`admin.html`** — Versionsnummer im Header ergänzt (`vX.X.X` neben "Konsole")
- **`CLAUDE.md`** — Regel: Version muss in allen 4 Dateien (index.html, admin.html, CLAUDE.md, README.md) synchron gehalten werden

---

## v0.9.6 — 2026-05-18

### Passwortloses User-Anlegen + Reset-Flow

- **`admin.html`** — Passwortfeld aus "Neuer Benutzer"-Formular entfernt; `createUser()` generiert Zufalls-Passwort und sendet sofort Reset-Link
- **`admin.html`** — ♥ Liebeseinladung-Button direkt im Benutzer-Formular (sendet love_invite über crew_invites-Hook)
- **`admin.html`** — 🔑 Reset-Button pro User in der Benutzerliste
- **`admin.html`** — Superadmin-Delete-Regel: Users Collection → Delete rule = `@request.auth.role = "superadmin"`
- **`admin.html`** — `emailVisibility: true` beim Anlegen → E-Mail-Adresse in der Tabelle sichtbar
- **`login.html`** — Reset-Formular: `?token=` in URL → zeigt "Passwort festlegen"-Form statt Login; `doConfirmReset()` via `confirm-password-reset` API
- **`.pb_hooks/main.pb.js`** (v3.3) — love_invite + staff_invite E-Mail-Typen ergänzt; Resend HTTP API für alle Custom-Mails; PB SMTP (Resend-Gateway smtp.resend.com:587) für System-Mails (Password-Reset)

### Manueller PocketBase-Schritt (einmalig, bereits gesetzt)

- **Settings → Application URL:** `https://aniflu.github.io/Crewplaner/login.html` — steuert Reset-Link-Ziel in PB-E-Mails
- **Settings → Mail (SMTP):** smtp.resend.com:587 mit Resend-API-Key als Passwort

---

## v0.9.5 — 2026-05-18

### Partner-Einladung (♥) + Demo-Plan

- **`admin.html`** — Werkzeuge-Tab: ♥ Liebeseinladung per `crew_invites` + `type=love_invite`
- **`.pb_hooks/main.pb.js`** — love_invite-E-Mail-Template (warmes Onboarding-Design)
- Demo-Plan-Seed für neue Manager

---

## v0.9.4 — 2026-05-17

### Einladungssystem + Öffentlicher View-Link

- **`admin.html`** — Werkzeuge-Tab: Crew-Einladung und -Erinnerung per E-Mail aus der Konsole
- **`view.html`** — Öffentliche Read-only-Ansicht (Token-basiert, kein Login nötig)
- **`js/plans.js`** — `view_token` generieren + in PB speichern; Link in Werkzeuge-Tab anzeigen

---

## v0.9.3 — 2026-05-17

### Security-Fixes & Code-Qualität

- **`admin.html`** — XSS-Fixes: Crew-Namen, E-Mails und Plan-Namen werden jetzt überall mit `esc()` gerendert; onclick-Injection verhindert durch `data-*` Attribute + `dataset.*` Zugriff
- **`.pb_hooks/main.pb.js`** (v2.2→v2.3) — Resend API Key aus Quellcode entfernt; wird jetzt über PocketBase Environment Variable `RESEND_KEY` geladen (`$getEnv('RESEND_KEY')`)
- **`js/bundle.js`** — Mit `dropdown.js` synchronisiert: `proposeCrew()` Aufruf + E-Mail-Badge (`📧`) + `renderTable()` nach Dropdown-Aktionen ergänzt
- **`index.html`** — Script-Ladereihenfolge korrigiert: `pb.js` lädt jetzt vor `dialog.js` (wie in CLAUDE.md dokumentiert)
- **`tourplan.html`** — Alte 83 KB Monolith-Datei gelöscht (nicht mehr referenziert)
- **`js/init.js`** (v29) — Silent catch-Blocks durch `console.warn` ersetzt; Legacy-Migration zeigt Toast bei Fehler
- **`js/plans.js`** (v26) — PocketBase-Sync-Fehler werden jetzt in Console geloggt (war komplett silent)

### Manuelle Schritte erforderlich

1. **Resend API Key in PocketBase setzen:** PB Admin UI → Settings → Environment Variables → `RESEND_KEY` = `re_75ZvXHSz_2eCzUVHziYm6mj3sJwzavv2s`
2. **Alten Key rotieren:** Resend Dashboard → API Keys → alten Key löschen und neuen erstellen, dann in PB erneut setzen
3. **Hook deployen:**
   ```bash
   ssh hetzner "curl -o /var/lib/docker/volumes/ad9adhhkygjreidi79i4v5eb_pocketbase-hooks/_data/main.pb.js https://raw.githubusercontent.com/Aniflu/Crewplaner/main/.pb_hooks/main.pb.js && docker restart pocketbase-ad9adhhkygjreidi79i4v5eb"
   ```

---

## v0.9.2 — 2026-05-17

### Bug-Fixes & Verbesserungen

- **`admin.html`** — Plan-Dropdown war leer: `sort=-created` → `sort=-id` (bekanntes PB-Gotcha, CLAUDE.md dokumentiert)
- **`index.html`** — Button-Label "Konsole öffnen" → "Admin Konsole"; Version v0.9.2
- **`js/init.js`** (v28→v29) — `tourplan_active_plan` aus localStorage konsumieren: ermöglicht direktes Aktivieren eines Plans beim Start von index.html
- **`admin.html`** — Button "→ In Touransicht laden" im Werkzeuge-Tab: schreibt plan_data in localStorage, setzt aktiven Plan und öffnet index.html

---

## v0.9.1 — 2026-05-17

### Neu: Manager-Konsole + Werkzeuge-Tab

- **`admin.html`** — Zugang jetzt für `manager` + `superadmin`; Manager-Rolle sieht Werkzeuge-Tab, Superadmin zusätzlich Benutzer/Rollen/Pläne
- **`admin.html` → Werkzeuge-Tab** (neu) — Plan-Auswahl aus PocketBase, Plan-Infos, Crew verknüpfen inline, Crew benachrichtigen (Einladung/Erinnerung), JSON Export/Import, PDF Export (via pdf.js), Kalender .ics, Logos-Verwaltung
- **`js/plans.js`** (v25→v26) — `plan_data` wird nach dem lokalen Speichern automatisch in PB synchronisiert (silent fail); `confirmRenamePlan` Bug gefixt (falscher `pbPatch`-Aufruf)
- **`js/authService.js`** (v31→v32) — Superadmin-Auto-Redirect entfernt (verursachte Loop bei „Zu meinen Touren"); `btnKonsole` statt `btnCrewLink/btnCrewNotify` in `_showUserBadge`
- **`index.html`** — Sidebar bereinigt: PDF, ICS, Logos, Tagesarten, Crew verknüpfen, Crew benachrichtigen entfernt; `⚙ Konsole öffnen`-Button für Manager/Superadmin hinzugefügt; Version v0.9.1

### Bug-Fixes

- **Redirect-Loop** (authService.js): Superadmin konnte „Zu meinen Touren" nicht nutzen → Auto-Redirect entfernt
- **Pläne-Tab Error** (admin.html): `expand=owner` aus Query entfernt → keine API-Rule-Fehler mehr
- **`confirmRenamePlan`** (plans.js): `pbPatch('plans', pbId, {name})` war falscher API-Aufruf → korrekt: `pbPatch('/api/collections/plans/records/'+pbId, {name})`

### Manuelle PocketBase-Schritte erforderlich

1. **`plans` Collection → `plan_data` Feld** (JSON oder Text, nicht required) — nötig für Werkzeuge-Tab
2. **`plans` Collection → List rule**: `@request.auth.role = "superadmin" || @request.auth.id = owner`
3. **`plans` Collection → View/Update rule**: `@request.auth.id = owner || @request.auth.role = "superadmin"`

---

## v0.9.0 — 2026-05-17

### Neu: Multi-Rollen-System (RBAC)

- **`js/rbac.js`** (neu) — `hasPermission(action)` Helper; O(1) Switch-Statement für alle Berechtigungsprüfungen
- **`js/state.js`** — `USER_ROLE`, `IS_SUPERADMIN`, `IS_MANAGER`, `IS_BOOKER`, `IS_CREW` als neue globale Flags; `IS_ADMIN` bleibt für Backwards-Kompatibilität (`= IS_MANAGER`)
- **`js/authService.js`** — liest `user.role` aus PocketBase; setzt alle Rollen-Flags; Superadmin wird automatisch zu `admin.html` weitergeleitet
- **`login.html`** — `_redirectAfterAuth()` leitet Superadmin zu `admin.html`, alle anderen zu `index.html`
- **`admin.html`** (neu) — Separate Admin-Konsole: Benutzer verwalten (Rolle per Dropdown ändern, entfernen), Rollen-Übersicht mit Permission-Matrix, Pläne-Verwaltung; nur für Superadmin zugänglich
- **`js/render.js`** — Booker-Rolle sieht Zellen read-only als `<span>` (kein Dropdown), `IS_MANAGER` statt `IS_ADMIN`
- **`js/dropdown.js`** + **`js/bundle.js`** — `hasPermission('assignCrew')` statt `IS_ADMIN`
- **`js/crewNotify.js`**, **`js/crewLink.js`**, **`js/userView.js`**, **`js/plans.js`** — alle Permission-Checks auf `hasPermission()` umgestellt

### Rollen

| Rolle | Beschreibung |
|---|---|
| `superadmin` | Admin-Konsole + alle Manager-Rechte |
| `manager` | Volle Tour-Verwaltung (bisheriger Admin) |
| `booker` | Read-only Touransicht |
| `crew` | Nur eigene Slots sehen/bestätigen |

### Manuelle PocketBase-Schritte erforderlich
1. `users` Collection: Feld `role` (select: superadmin/manager/booker/crew, Default: crew) hinzufügen
2. `madmaxmail@web.de` auf `superadmin` setzen
3. API Rule für `users`: updateRule = `@request.auth.role = "superadmin"`

---

## v0.8.5.9 — 2026-05-17

### Neu: Crew-Mitglied Onboarding-Flow

- **`login.html`** — Registrierungsformular hinzugefügt ("Noch kein Konto? Registrieren")
  - Erstes Öffnen der App nach Einladungs-E-Mail zeigt gelben Banner "Du wurdest zu einem Einsatz eingeladen"
  - Crew-Mitglieder können sich selbst ein Pocketbase-Konto anlegen (E-Mail + Passwort)
  - Nach Registrierung: automatischer Login + Weiterleitung zur App
- **`js/authService.js`** — `?action=confirm&aid=...` Parameter werden vor dem Login-Redirect in localStorage gerettet und nach dem Login automatisch verarbeitet

### Bugfix

- **`js/authService.js`** — Query-Parameter gingen beim Redirect zu `login.html` verloren (beide Pfade gefixt: fehlendes Token + abgelaufenes Token)

---

## v0.8.5.8 — 2026-05-17

### Bugfix

- **`js/plans.js`** — `confirmRenamePlan()` synct neuen Plan-Namen jetzt auch in Pocketbase via `pbPatch` (bisher nur localStorage)

---

## v0.8.5.7 — 2026-05-17

### Neu: Absage-Queue Banner

- **`js/crewNotify.js`** — `renderCancellationBanner()`, `flushAllCancellations()`, `clearAllCancellations()` hinzugefügt
- **`index.html`** — Roter floating Banner bei entfernten bestätigten Slots; "ABSAGEN SENDEN" schickt Sammel-Mail pro Crew-Mitglied

---

## v2.1.1 — 2026-05-13

### Bugfix

- **`js/init.js`** — `_savePlanToLS(id)` im Auto-Plan-Ersteller ergänzt.
  Plan-Daten werden jetzt korrekt in localStorage gespeichert.
  Verhindert: Plan verschwindet bei Reload, "Plan nicht gefunden"-Fehler beim Email-Speichern.

---

## v2.1 — 2026-05-09

### Migration: Supabase → Pocketbase

- **`js/pb.js`** (neu) — schlanker Pocketbase REST-Client: `pbGet`, `pbPost`, `pbPatch`, `pbDelete`, `pbList`, `pbFirst`, `pbUpsert`
- **`js/config.js`** — Supabase URL/Key entfernt, `POCKETBASE_URL` hinzugefügt
- **`js/authService.js`** — Supabase Session-Auth durch Pocketbase JWT-Auth ersetzt (`pb_token` + `pb_user` in localStorage)
- **`js/dataService.js`** — alle CRUD-Operationen auf Pocketbase umgestellt, E-Mail-Versand an Pocketbase-Hooks delegiert
- **`login.html`** — Supabase SDK entfernt, Login via `POST /api/collections/users/auth-with-password`
- **`index.html`** — Supabase CDN entfernt, `pb.js` ergänzt
- **`.pb_hooks/main.pb.js`** (neu) — Server-seitige E-Mail-Hooks (proposed, declined, invite, reminder) via Pocketbase Goja-Engine
- **`pocketbase/pb_schema.json`** (neu) — Collections-Schema für Pocketbase-Import

### Sonstiges

- Supabase Edge Function (`supabase/functions/`) wird nicht mehr aktiv genutzt

---

## v2.0 — 2026-04-23

### Neu
- **Ops-Console Redesign** — komplett überarbeitetes UI: Gold-Rail (`#d4a53a`), monochromer Grundton, Archivo Display + JetBrains Mono
- **3 Ansichten** — Tabelle, Blöcke (Karten-Grid), Crew-Timeline als Segmented Control
- **KPI-Strip** — 6 Zellen im Header: Tage · Shows · Reise · Prep · OFF · Offen
- **PDF-Export neu** — 3 Druck-Ansichten (Tabelle / Blöcke / Crew-Timeline), einheitlicher Header mit Gold-Rail, A4 Querformat
- **Bereich → Block** — bestehende Tage nachträglich per Datumsbereich einem Tourblock zuweisen oder umgruppieren
- **blockview.js** — Tourblock-Karten-Ansicht mit Timeline-Streifen
- **crewview.js** — Crew-Timeline-Ansicht (eine Zeile pro Person, Monats-Raster)
- **bundle.js** — Action-Bundle Utilities

### Geändert
- Row-Accent-Bar links je nach Tagesart, Type-Dot vor Typ-Label
- Datum-Darstellung: Weekday-Label in Caps + fette Datumzahl
- Venue-Typo mit Archivo Display
- Stats-Bar unten: flach, monospace
- Sidebar mit Section-Headern in Caps, kompaktere Plan-Liste

---

## v0.9.6 — 2026 (vor Redesign)

- Kalender-Export (.ics) für Google Calendar / Apple Calendar / Outlook
- Multi-Plan-System: beliebig viele Pläne parallel
- Tourblock-Wizard: Datumsbereich mit Tagesart-Auswahl pro Tag
- Custom Tagesarten plan-übergreifend gespeichert
- Logo-System (Planer, Band, Booking) plan-unabhängig
- PDF-Export mit Positions- und Crew-Filter
- Sticky Header + erste 3 Spalten beim Scrollen
- Import / Export als JSON

---

## v0.9.x — Entwicklungsphase

- Initiales Multi-File-Refactoring aus monolithischem `tourplan.html`
- Split in `index.html` + `js/*.js` Module (globaler Scope, kein Bundler)
- localStorage-Persistenz, Plan-Migration von `tourplan_v3`
