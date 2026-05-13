# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Version & Live-URLs

- Aktuelle Version: **v2.1.1**
- Live (GitHub Pages): https://m4dm0nky.github.io/Personalplan/
- Pocketbase API: https://crewplanner.nyxlightwork.com
- Pocketbase Admin UI: https://crewplanner.nyxlightwork.com/_/
- GitHub Repo: https://github.com/M4dm0nky/Personalplan

## Tech-Stack

- **Vanilla JavaScript** — kein Framework, keine Bibliotheken, kein Build-Step
- **HTML5 + CSS3** — separate Dateien
- **localStorage** — persistente Datenspeicherung im Browser
- **Pocketbase** — Self-hosted Backend: Auth, Datenbank (SQLite), JS-Hooks für E-Mails
- **GitHub Pages** — statisches Hosting (Frontend)

## Lokale Entwicklung

```bash
python3 -m http.server 8080
# http://localhost:8080 im Browser öffnen
```

Datei in `js/` oder `styles.css` bearbeiten → Browser-Tab neu laden → fertig. Kein npm, kein Build.

**Cache-Bust:** Nach JS/CSS-Änderungen `?v=N` in `index.html` + `login.html` hochzählen (aktuell `v=24` für pb.js/config.js, `v=23` für den Rest).

## Deploy zu Production (GitHub Pages)

```bash
git push origin main
```

GitHub Pages aktualisiert sich automatisch ~1 Minute nach dem Push. Der `main` Branch ist der Produktions-Branch.

## Production-Infrastruktur (Server)

| Was | Wert |
|---|---|
| Server SSH | `root@crewplanner.nyxlightwork.com` |
| Pocketbase Container | `pocketbase` (Image: `pocketbase:local`) |
| pb_data Pfad | `/mnt/hdd/pocketbase/pb_data` |
| pb_hooks Pfad | `/mnt/hdd/pocketbase/pb_hooks` |
| Admin-E-Mail | `madmaxmail@web.de` |

### Pocketbase Hook deployen

Der Hook `.pb_hooks/main.pb.js` steuert E-Mail-Benachrichtigungen (proposed/declined/invite/reminder). Er muss auf den Server und der Container muss mit dem Volume neu gestartet werden:

```bash
# Hook übertragen
scp .pb_hooks/main.pb.js root@crewplanner.nyxlightwork.com:/mnt/hdd/pocketbase/pb_hooks/main.pb.js

# Container neu starten mit Hook-Volume
ssh root@crewplanner.nyxlightwork.com "docker stop pocketbase && docker rm pocketbase && docker run -d \
  --name pocketbase --restart always --network pocketbase_pocketbase_net \
  -p 127.0.0.1:8090:8090 \
  -v /mnt/hdd/pocketbase/pb_data:/pb/pb_data \
  -v /mnt/hdd/pocketbase/pb_hooks:/pb/pb_hooks \
  pocketbase:local"

# Prüfen
ssh root@crewplanner.nyxlightwork.com "docker logs pocketbase --tail 20"
```

### Admin-User anlegen (Pocketbase Admin UI)

`https://crewplanner.nyxlightwork.com/_/` → Collections → `users` → New record → Email: `madmaxmail@web.de`.
Der User mit dieser E-Mail wird automatisch als Admin erkannt (`ADMIN_EMAIL` in `js/config.js`).

### SMTP konfigurieren

Pocketbase Admin UI → **Settings → Mail settings** → SMTP-Daten eintragen → Save → Send test email.

## Projektstruktur

```
├── index.html            ← HTML-Gerüst + <script> Ladereihenfolge (kritisch!)
├── login.html            ← Login-Seite (Pocketbase Auth)
├── styles.css
├── .pb_hooks/
│   └── main.pb.js        ← Server-seitige E-Mail-Hooks (Pocketbase Goja-Engine)
├── pocketbase/
│   └── pb_schema.json    ← Collections-Schema für Pocketbase-Import
└── js/
    ├── config.js         ← POCKETBASE_URL, ADMIN_EMAIL
    ├── pb.js             ← Pocketbase REST-Client (pbGet, pbPost, pbPatch, pbDelete, pbList, pbFirst, pbUpsert)
    ├── dataService.js    ← Pocketbase CRUD: proposeCrew, cancelProposal, bulkProposeCrew, loadCrewMeta, loadAssignmentStatuses
    ├── authService.js    ← Login/Logout, JWT aus localStorage, IS_ADMIN
    ├── state.js          ← Globale Variablen: POSITIONS, TOUR_DATES, crew, assignments, assignmentStatuses
    ├── utils.js          ← getVal(), isPending(), showToast(), fmtD(), genId(), esc()
    ├── render.js         ← renderTable(), renderHead(), renderBody()
    ├── bundle.js         ← ⚠️ MANUELLE KOPIE aus dropdown.js (kein Build-Tool!) — siehe unten
    ├── dropdown.js       ← showDD(), openCrewDD(), openDefaultDD(), requestForPos(), bulkCancelPos()
    ├── init.js           ← App-Start: loadLogosGlobal(), initPlans(), render()
    └── ...               ← blockview, crewview, plans, pdf, persistence, sidebar, stats, tourblock, types
```

## Architektur-Gotchas

**Ladereihenfolge in `index.html` ist kritisch** — globaler Scope, kein Modulsystem. `pb.js` und `config.js` müssen vor allen anderen geladen werden.

**bundle.js = manuelle Kopie** — enthält Kopien der Funktionen aus `dropdown.js`, crew, positions, modals, dates, logos. Jede Änderung an `dropdown.js` MUSS auch in `bundle.js` gespiegelt werden. `dropdown.js` lädt nach `bundle.js` und überschreibt zur Laufzeit.

**Zwei Assignment-State-Schichten:**
```
assignments[date][posId]        → lokale Overrides (sofort, kein Pocketbase)
assignmentStatuses[date][posId] → Pocketbase-Cache { status, crewName, proposedBy }
```
`getVal(dateStr, posId)` in `utils.js` gibt den effektiven Zellwert zurück.

**Destructive Ops = kein Optimistic Update** — bei `cancelProposal` / `bulkCancelProposals` immer erst Pocketbase `await`en, dann lokalen State löschen. Bei Fehler: `loadAssignmentStatuses()` für Resync.

**Logos sind plan-unabhängig** — gespeichert in `tourplan_logos`, nie im Plan-State.

**`isPending(si)`** in `utils.js` — prüft `si.status === 'proposed' || 'declined'`; alle Status-Checks über diese Funktion.

**E-Mails via Pocketbase-Hook** — `proposeCrew()` und `declineAssignment()` triggern automatisch `.pb_hooks/main.pb.js`. Kein Frontend-E-Mail-Code nötig.

## Pocketbase Collections

```
plans           { id, name, owner(→users) }
plan_members    { plan_id(→plans), user_id(→users), role }
crew_members    { plan_id(→plans), name, email, sort_order, user_id(→users) }
assignments     { plan_id, date, pos_id, pos_label, crew_name, status, proposed_by, responded_at }
crew_invites    { plan_id, crew_name, crew_email, type, plan_name, app_url }
```

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

## Konventionen

- **Sprache:** Alle UI-Texte auf **Deutsch**
- **Farbpalette:** Gold `#e8c84a`, Grün `#4ae8a0`, Rot `#e84a4a`, Dark BG `#1a1a2e`
- **Kein Modulsystem** — alle JS-Dateien teilen den globalen Scope
- **`SUPABASE_ENABLED`** in `config.js` — trotz irreführendem Namen: auf `true` = Pocketbase aktiv, `false` = localStorage-only-Modus

## LLM Council Skill

Wenn der User "Consult the council:", "Frag andere KIs", "Was denken ChatGPT und Gemini darüber" oder ähnliches sagt — nutze den `llm-council` Skill via Skill-Tool.

## Tipps

- **`#` in Claude Code** — während einer Session drücken um Learnings direkt in diese CLAUDE.md zu schreiben
- **`.claude.local.md`** — für persönliche Einstellungen die nicht ins Git sollen
