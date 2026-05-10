# CLAUDE.md — Tour Crew Plan

## Version & Live-URL

- Aktuelle Version: **v2.1**
- Live: https://m4dm0nky.github.io/Personalplan/
- Pocketbase: https://crewplanner.nyxlightwork.com

## Tech-Stack

- **Vanilla JavaScript** — kein Framework, keine Bibliotheken
- **HTML5 + CSS3** — separate Dateien, kein Build-Schritt
- **localStorage** — persistente Datenspeicherung im Browser
- **Google Fonts** — IBM Plex Mono, Bebas Neue
- **GitHub Pages** — statisches Hosting (Frontend)
- **Pocketbase** — Self-hosted Backend: Auth, Datenbank (SQLite), JS-Hooks für E-Mails
- **Kein Build-System** — kein npm, kein webpack, kein Transpiler

## Projektstruktur

```
Personalplan/
├── index.html            ← HTML-Gerüst + <link>/<script> Tags
├── login.html            ← Login-Seite (Pocketbase Auth)
├── styles.css            ← Gesamtes CSS
├── tourplan.html         ← ältere Version, nicht bearbeiten
├── .pb_hooks/
│   └── main.pb.js        ← Pocketbase Server-Hooks (E-Mails: proposed/declined/invite/reminder)
├── pocketbase/
│   └── pb_schema.json    ← Collections-Schema für Pocketbase-Import
└── js/
    ├── config.js         ← POCKETBASE_URL, ADMIN_EMAIL
    ├── pb.js             ← Pocketbase REST-Client (pbGet, pbPost, pbPatch, pbDelete, pbList, pbFirst, pbUpsert)
    ├── dataService.js    ← Pocketbase CRUD: proposeCrew, cancelProposal, bulkProposeCrew, loadCrewMeta, loadAssignmentStatuses
    ├── authService.js    ← Login/Logout, JWT aus localStorage, IS_ADMIN
    ├── state.js          ← Globale Variablen, POSITIONS, TOUR_DATES, crew, assignments, assignmentStatuses
    ├── types.js          ← TYPE_OPTS, loadCustomTypes(), saveCustomType()
    ├── utils.js          ← Hilfsfunktionen (todayStr, genId, esc, isPending, …)
    ├── render.js         ← renderTable(), renderHead(), renderBody()
    ├── bundle.js         ← MANUELLE KOPIE: crew + dropdown + positions + modals + dates + logos (kein Build-Tool!)
    ├── dropdown.js       ← showDD(), openCrewDD(), openDefaultDD(), requestForPos(), bulkCancelPos()
    ├── tourblock.js      ← Tourblock-Wizard (tbConfirm, tbChangeType)
    ├── stats.js          ← Statistik-Berechnungen
    ├── sidebar.js        ← toggleSidebar(), renderPlanList()
    ├── plans.js          ← Multi-Plan-System (switchPlan, savePlanToLS, renderPlanList)
    ├── pdf.js            ← openPDFExport(), generatePDF()
    ├── persistence.js    ← saveProjectJSON(), importProjectJSON(), collectData()
    ├── blockview.js      ← Block-Ansicht (alternativer View)
    ├── crewview.js       ← Crew-Übersichts-View
    ├── crewLink.js       ← E-Mail ↔ Crew-Name Verknüpfung (Admin)
    ├── crewNotify.js     ← Crew-Einladungs-Modal, sendInvite(), bulkProposeCrew-Trigger
    ├── userView.js       ← Crew-Ansicht (nicht-Admin): confirm/decline eigene Slots
    └── init.js           ← App-Start: loadLogosGlobal(), initPlans(), render()
```

**Ladereihenfolge ist kritisch** (globaler Scope, kein Modulsystem) — Reihenfolge in `index.html` beachten.

## Entwicklungs-Workflow

```bash
python3 -m http.server 8080   # lokalen Server starten
# dann http://localhost:8080 im Browser öffnen
```

Datei in `js/` oder `styles.css` bearbeiten → Browser-Tab neu laden → fertig.
Für GitHub Pages: committen und pushen → automatisch live.

Kein `npm install`, kein `npm run build`, kein Compiler.

## localStorage Keys

| Key | Inhalt |
|---|---|
| `tourplan_plans` | Index aller Pläne `[{id, name, created, modified}]` |
| `tourplan_plan_<id>` | Plan-Daten (OHNE Logos) |
| `tourplan_logos` | Logos global `{booking, band, planer}` als Base64 |
| `tourplan_custom_types` | Benutzerdefinierte Tagestypen |
| `pb_token` | Pocketbase JWT (Auth) |
| `pb_user` | Pocketbase User-Objekt (JSON) |
| `tourplan_pb_<planId>` | Pocketbase Plan-ID für aktiven Plan |

## Architektur-Gotchas

- **Logos sind plan-unabhängig** — werden in `tourplan_logos` gespeichert, nicht im Plan-State. `_savePlanToLS()` speichert NIE Logos.
- **Multi-Plan**: `switchPlan(id)` speichert aktuellen Plan zuerst, dann lädt den neuen.
- **Custom Types**: `typeFromLabel(label)` leitet Kategorie (`show/reise/prep/off`) aus dem Label ab — neue Labels werden in `tourplan_custom_types` gespeichert und bleiben global erhalten.
- **Tabelle**: Sticky Header (2 Zeilen) + sticky erste 3 Spalten via `fixStickyColumns()` — wird nach jedem `renderTable()` automatisch aufgerufen.
- **`window.renderTable` Wrapper**: überschreibt `renderTable` in `init.js` um autoSave + `fixStickyColumns()` immer mit auszuführen.
- **Migration**: alter `tourplan_v3` Key wird beim Start automatisch als "Tour 2026" importiert.
- **bundle.js = manuelle Kopie** — enthält Kopien der Funktionen aus dropdown.js, crew, positions, modals, dates, logos. Jede Änderung an `dropdown.js` MUSS auch in `bundle.js` gespiegelt werden. `dropdown.js` lädt nach `bundle.js` und überschreibt zur Laufzeit.
- **Zwei Assignment-State-Schichten**: `assignments[date][posId]` = lokale Overrides (sofort); `assignmentStatuses[date][posId]` = Pocketbase-Cache `{status, crewName, proposedBy}`. `getVal()` in `utils.js` ist der kanonische Weg um den effektiven Zellwert zu lesen.
- **Destructive Ops = kein Optimistic Update** — bei `cancelProposal` / `bulkCancelProposals` immer erst Pocketbase `await`en, dann lokalen State löschen. Bei Fehler: `loadAssignmentStatuses()` für Resync aufrufen.
- **`isPending(si)`** in `utils.js` — prüft `si.status === 'proposed' || 'declined'`; alle Status-Checks über diese Funktion.
- **`loadCrewMeta()`** und **`loadAssignmentStatuses()`** in `dataService.js` — bei leerem Cache am Anfang von Admin-Aktionen aufrufen.
- **E-Mails via Pocketbase-Hook** — `proposeCrew()` und `declineAssignment()` triggern automatisch `.pb_hooks/main.pb.js` auf dem Server. Kein Frontend-E-Mail-Code nötig.

## Konventionen

- **Sprache:** Alle UI-Texte auf **Deutsch**
- **Farbpalette beibehalten:** Gold `#e8c84a`, Grün `#4ae8a0`, Rot `#e84a4a`, Dark BG `#1a1a2e`
- **Keine externen Abhängigkeiten** — App soll offline funktionieren
- **Kein Modulsystem** — alle JS-Dateien teilen den globalen Scope

## Tests

Manuell im Browser:
- Verschiedene Browser prüfen (Chrome, Firefox, Safari)
- PDF-Export über Ctrl+P / Cmd+P testen
- Import/Export-Roundtrip mit JSON-Dateien prüfen
- Plan-Wechsel testen (Logos müssen plan-übergreifend erhalten bleiben)

## LLM Council Skill

Wenn der User "Consult the council:", "Frag andere KIs", "Was denken ChatGPT und Gemini darüber" oder ähnliches sagt — nutze den `llm-council` Skill via Skill-Tool.

Der Skill befragt ChatGPT und Gemini, analysiert deren Antworten und synthetisiert einen Plan mit Quellenangaben.

Voraussetzung: `.env`-Datei im Projektverzeichnis mit API-Keys (siehe `~/.claude/skills/llm-council/.env.template`).

## Tipps

- **`#` in Claude Code** — während einer Session drücken um Learnings direkt in diese CLAUDE.md zu schreiben
- **`.claude.local.md`** — für persönliche Einstellungen die nicht ins Git sollen
