# Changelog

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
