# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Version & Live-URLs

- Aktuelle Version: **v0.8.5**
- Test (GitHub Pages): https://aniflu.github.io/Crewplaner/
- Frontend (Ziel): https://crewplanner.nyxlightwork.de
- Pocketbase API: https://api.crewplanner.nyxlightwork.de
- Pocketbase Admin UI: https://api.crewplanner.nyxlightwork.de/_/
- GitHub Repo: https://github.com/Aniflu/Crewplaner

## Routing-Architektur

| Domain | Ziel |
|---|---|
| `crewplanner.nyxlightwork.de` | Frontend (nginx, Produktiv) |
| `api.crewplanner.nyxlightwork.de` | Pocketbase API |

**CORS** läuft über Traefik (nicht Pocketbase-Admin). Erlaubte Origins:
- `https://crewplanner.nyxlightwork.de`
- `https://aniflu.github.io`

Kein StripPrefix — `POCKETBASE_URL` hat kein `/api`-Suffix.

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
| Server SSH Alias | `ssh hetzner` |
| Pocketbase Container | `pocketbase-ad9adhhkygjreidi79i4v5eb` (Coolify-managed) |
| pb_hooks Pfad | `/var/lib/docker/volumes/ad9adhhkygjreidi79i4v5eb_pocketbase-hooks/_data/` |
| Admin-E-Mail | `madmaxmail@web.de` |
| Frontend | `crewplanner.nyxlightwork.de` |
| Pocketbase API | `api.crewplanner.nyxlightwork.de` |

**Wichtig:** Container wird von **Coolify** verwaltet — niemals `docker stop/rm/run` manuell ausführen. Nur `docker restart` für Hook-Reload.

**CORS** läuft über Traefik (nicht PocketBase). Erlaubte Origins: `crewplanner.nyxlightwork.de`, `aniflu.github.io`.

### Pocketbase Hook deployen

Hook aus GitHub holen + Container neu starten (alles in einem):

```bash
ssh hetzner "curl -o /var/lib/docker/volumes/ad9adhhkygjreidi79i4v5eb_pocketbase-hooks/_data/main.pb.js \
  https://raw.githubusercontent.com/Aniflu/Crewplaner/main/.pb_hooks/main.pb.js \
  && docker restart pocketbase-ad9adhhkygjreidi79i4v5eb"
```

### E-Mail (Resend)

Hook sendet via Resend HTTP API (kein SMTP, umgeht Hetzner-Block).
- Verifizierte Domain: `crewplanner.nyxlightwork.de`
- Absender: `noreply@crewplanner.nyxlightwork.de`
- PocketBase Mail settings: `smtp.resend.com:587`, Username `resend`, Password = API-Key

### Admin-User anlegen (Pocketbase Admin UI)

`https://api.crewplanner.nyxlightwork.de/_/` → Collections → `users` → New record → Email: `madmaxmail@web.de`.

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
