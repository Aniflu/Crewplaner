# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## ⚠️ PFLICHTREGELN — VOR JEDEM TASK LESEN

1. **Nach JEDEM Fix/Feature: Version erhöhen** — User nach gewünschter Nummer fragen, Stufe vorschlagen. In 4 Dateien: `index.html`, `admin.html`, `CLAUDE.md`, `README.md`
2. **Kein SSH für Marco** — Marco hat keinen Server-Zugang. Server-Aktionen laufen über den Admin (hat SSH via `ssh hetzner`).
3. **Versionsnummer = User-Entscheidung** — nie selbst festlegen ohne Rückfrage.
4. **Nach Coolify-Redeploy → IMMER strip-api prüfen** — Coolify überschreibt Traefik-Labels bei jedem Redeploy. Fix ist permanent in `/data/coolify/proxy/dynamic/pocketbase-fix.yaml` (Priorität 1000), aber wenn API 404 gibt → das ist die Ursache.

---

## Version & Live-URLs

- Aktuelle Version: **v0.9.12**
- Test (GitHub Pages): https://aniflu.github.io/Crewplaner/
- Frontend (Produktiv): https://crewplanner.nyxlightwork.de
- Pocketbase API: https://api.crewplanner.nyxlightwork.de
- Pocketbase Admin UI: https://api.crewplanner.nyxlightwork.de/_/
- GitHub Repo: https://github.com/Aniflu/Crewplaner

---

## Versionierung

```
v0.9.11 — fix: admin-app.js importiert generateICS als adminGenerateICS aus calendar.js (aktuell)
v0.9.10 — fix: Entferne falsche Module-Imports aus render.js und types.js
v0.9.9 — fix: Module-Timing-Bug in admin.html — Warte auf beide authReady + DOMContentLoaded
v0.9.8 — fix: Zentrales Auth-Wall Muster — Einheitliche Authentifizierung auf allen Seiten
v0.9.7 — fix: DE_DAYS/DE_MON Export + Module-Load-Error gefixt
v0.9.3 — fix: ES6-Module-Migration + Auth-Check + 22 fehlende Imports gefixt
v0.9.2 — feat: Email-Log Tab — Filter, Suche & erweiterte Anzeige
v0.9.11.5 — fix: Code Review Fixes — Queue-Stabilität & Checkbox-State Persistence
v0.9.11.4 — fix: Leere Queue-Einträge nicht rendern
v0.9.11.3 — fix: Modal-Scroll trap — Trackpad-Scrolling sperrt Hintergrund
v0.9.11.2 — fix: Scrollbar sichtbar machen mit Custom-Styling (gold auf dunkel)
v0.9.11.1 — fix: Scrollbar im Update-Queue Modal für lange Listen
v0.9.11.0 — feat: Checkboxen im Update-Queue Modal, gezielter Versand mit An-/Abwählen
v0.9.10.0 — feat: Update-Queue Modal mit Sidebar-Badge statt Banner, einzelne Slots löschbar
v0.9.9.31 — fix: declined/proposed Slot korrekt ersetzt beim Crew-Wechsel im Dropdown
v0.9.9.30 — Umfassender Code-Review: XSS-Fixes, IDOR-Schutz, Null-Checks, try/catch, Dead Code entfernt, UX-Fixes
v0.9.9.29 — Code-Review: _findAssignment-Bug, ISO-Datum mailSlot, update-email zeigt nur neue Termine
v0.9.9.25 — PB-Records für neue Termine bei Update-Mail-Versand erstellt
v0.9.9.24 — Update-Mail-Queue erstellt proposed-Records vor Mailversand
v0.9.9.23 — Update-Queue zählt proposed-Crew (nicht nur confirmed), auto-migration
v0.9.9.22 — Update-Mail zeigt nur neue Termine statt alle Slots
v0.9.9.21 — Nachbereitung als Tagestyp (prep, orange, 1 TS)
v0.9.9.20 — tourplan_active_pb_id stabiler PB-Sync-Key, Datum-Hinzufügen fix
v0.9.9.19 — Kurzlink (is.gd) via Hook v4.4, Crew-Anleitung, emailVisibility, defaultCrew-Slots
v0.9.9.18 — Plan-Transfer via sessionStorage (admin→index), loadPlanForManager direkt per owner
v0.9.9.17 — Manager lädt Plan aus PocketBase, "Aktuellen Plan bearbeiten"-Button
v0.9.9.13 — Hook v4.3 (Absage-Email umformuliert), vollständiger Workflow-Audit
v0.9.9.12 — Namen mit Statusfarben in Crew-Ansicht + grau für plan-only Einträge
v0.9.9.11 — Hook v4.2 (per-Slot-Emails entfernt), Einladen=Anfrage, Update-Button
v0.9.9.10 — getMyCrewName() case-insensitiv, PB-Plan direkt für Crew, PB-Bereinigung
v0.9.9.9  — Crew-Ansicht: angefragt/bestätigt/abgelehnt, Sidebar-Buttons, Legende
v0.9.9.8  — E-Mail-Log Tab in Admin-Konsole (Hook v4.1 + email_log Collection)
v0.9.7    — Passwortloses Anlegen: kein Passwortfeld, Auto-Reset-Mail, 🔑-Button
v0.9.7    — Partner-Einladungsmail (♥) + Demo-Plan für neue Manager
v0.9.7    — Einladungssystem + Öffentlicher Booker-View-Link
v0.9.0    — Multi-Rollen-System (RBAC): superadmin, manager, booker, crew
v1.0      — Stable Release
```

**Regel:** Nach JEDEM Fix die Version synchron erhöhen in:
1. `index.html` — `<span class="tour-tag">Personalplan · vX.X.X</span>` (sichtbar in der App — daran testet der User!)
2. `admin.html` — `<span style="...">vX.X.X</span>` im Header neben "Konsole"
3. `CLAUDE.md` — "Aktuelle Version"
4. `README.md` — Version-Zeile

Nie selbst entscheiden — User nach gewünschter Versionsnummer fragen, Stufe vorschlagen.

---

## Aktueller Stand (Stand: 2026-06-02)

### Was funktioniert ✓
- Login/Logout via PocketBase
- Multi-Rollen-System: superadmin/manager → admin.html, crew/booker → index.html
- Manager-Konsole (`admin.html`): Werkzeuge, E-Mail-Log Tab, Benutzer, Rollen, Pläne
- **Manager + Crew laden Plan direkt aus PocketBase** — localStorage optional
- Plan-Transfer admin→index via sessionStorage ("Aktuellen Plan bearbeiten"-Button)
- E-Mail-Log: Hook v4.4 schreibt nach jedem Mailversand in `email_log` Collection
- E-Mail-Flow: Einladung (1 Mail/Person), Erinnerung, Update (neue Termine), Absage
- Einladen = setzt alle Slots auf `proposed` + sendet 1 Invite-Mail (kein per-Slot-Hook mehr)
- Update-Button erscheint wenn neue Slots ohne PB-Record vorhanden (inkl. defaultCrew-Slots)
- Crew-Ansicht: eigene Slots "Bitte bestätigen", fremde Slots mit Name + Statusfarbe
- Crew Sidebar: "Termine bestätigen", "Termine absagen", "Anleitung" + Farbelegende
- Hotel/Nachbereitung-Tage (OFF-Typ) zeigen ⏳ wie SHOW/REISE wenn proposed
- Öffentlicher Booker-Link mit Kurzlink (is.gd) — serverseitig via Hook generiert + in PB gespeichert
- Crew-Anleitung aktualisiert (docs/guide-crew.html) — neuer Flow "Bitte bestätigen"
- Benutzer-Verwaltung zeigt E-Mail-Adressen (emailVisibility: true für alle gesetzt)
- Absage-Queue Banner für Sammel-Absagen
- Update-Mail-Flow: nur neue Termine in Mail, proposed+confirmed in Queue, PB-Records werden beim Senden erstellt
- Nachbereitung als Tagestyp (prep, orange, 1 TS) in TYPE_OPTS
- tourplan_active_pb_id als stabiler Fallback-Key für PB-Sync (Datum-Hinzufügen zuverlässig)
- Code-Review: _findAssignment-Bug gefixt (→ pbFirst), ISO-Datum in mailSlots

### Bekannte Einschränkung
- Slots die NUR über `defaultCrew` (nicht explizit in `assignments`) befüllt sind,
  bekommen KEINEN PB-Record beim Einladen-Klick — Workaround: Records manuell via API erstellen
  oder Admin trägt Crew explizit via Dropdown ein

### PocketBase — Benutzer (Stand 2026-06-01)
| E-Mail | Rolle | Hat Account |
|---|---|---|
| madmaxmail@web.de | superadmin | ✓ |
| marco@hoch-online.com | manager | ✓ |
| thomas.haine@gmx.de | crew | ✓ |
| thomasoliver@gmx.de | crew | ✓ |
| peter-weist@gmx.de | crew | ✓ |
| w.greffenius@gmx.de | crew | ✓ |
| fliegendekiwi@live.de | crew | — noch nicht registriert |
| pascalsmirat@web.de | crew | — noch nicht registriert |
| kerrin.gall@outlook.de | crew | — noch nicht registriert |

### Update-Mail-Flow (v0.9.9.22+)
- Banner "UPDATE-MAILS SENDEN →" erscheint wenn Datum hinzugefügt wird
- Queue enthält confirmed + proposed Crew-Mitglieder
- Beim Senden: neue PB-Records (proposed) werden erstellt, dann Mail nur mit NEUEN Terminen
- Informational-Pfad: `_getNewSlotsForCrew` liefert Slots ohne PB-Record → `bulkProposeCrew` → Mail
- Nicht-Informational-Pfad (Slot-Änderung): `pbFirst` sucht Record → auf proposed setzen → Mail

### E-Mail-Typen (Hook v4.4)
| Typ | Wann | Empfänger |
|---|---|---|
| `invite` | Admin klickt "Einladen" | Crew — "Du bist dabei." |
| `reminder` | Admin klickt "Erinnerung" | Crew — "Noch ausstehend." |
| `update` | Admin klickt "↻ Update" | Crew — "Achtung. Neue Termine." |
| `cancellation` | Admin klickt "Absagen senden" | Crew — "Plan geändert. Einsätze entfernt." |
| UPDATE-Hook | Crew lehnt Slot ab | Admin — "Abgelehnt." |

### PocketBase — aktuell aktive Pläne
- **Einziger Plan:** `03fs6r1o8cqeyt2` → "AMK Tour 2026_V3" (12 crew_members, 300+ assignments)
- Alle anderen Pläne wurden bereinigt (2026-05-29)

### Rollen-System
| Rolle | Landing | Rechte |
|---|---|---|
| `superadmin` | `admin.html` | Admin-Konsole + alle Manager-Rechte |
| `manager` | `index.html` | Volle Tour-Verwaltung |
| `booker` | `index.html` | Read-only Touransicht |
| `crew` | `index.html` | Eigene Slots bestätigen, andere Slots sehen |

---

## Zugänge & API-Keys

| Was | Wert |
|---|---|
| Admin-Login (App + PB Admin UI) | `madmaxmail@web.de` |
| Resend API-Key | `re_Suse3V78_FhvG2LoBKzVXgQJX9VhCoDdy` |
| Resend Absender | `noreply@crewplanner.nyxlightwork.de` |
| Resend verifizierte Domain | `crewplanner.nyxlightwork.de` |
| GitHub | https://github.com/Aniflu/Crewplaner (main = Production) |
| Server SSH Alias | `ssh hetzner` |
| PocketBase Container | `pocketbase-ad9adhhkygjreidi79i4v5eb` (Coolify-managed) |
| pb_hooks Pfad | `/var/lib/docker/volumes/ad9adhhkygjreidi79i4v5eb_pocketbase-hooks/_data/` |

---

## PocketBase Version & JSVM-Regeln (KRITISCH)

**PocketBase Version: v0.38** (läuft auf v0.23+ Architektur mit inkrementellen Updates)

### Was geht / was nicht

| API | Status | Ersatz |
|---|---|---|
| `$app.dao()` | **NICHT verfügbar** → wirft Go-Panic | `$app.save()` / `$app.delete()` |
| `$app.save(record)` | ✓ verfügbar | — |
| `$app.delete(record)` | ✓ verfügbar | — |
| `$app.auxDelete(record)` | ✓ verfügbar (außerhalb Transaction) | — |
| `$tokens.*` | **NICHT verfügbar** | — |
| `$http.send()` | ✓ verfügbar | kein auto Content-Type mehr! |
| `$getEnv('KEY')` | **NICHT verfügbar** → `ReferenceError` | `$os.getenv('KEY')` |
| `$os.getenv('KEY')` | ✓ verfügbar | — |

### Hook-Regel: e.next() PFLICHT

**`e.next()` muss die ERSTE Zeile in JEDEM Hook-Callback sein.**
Ohne `e.next()` stoppt PocketBase v0.23+ die Execution-Chain → 400 "Failed to create record."

```js
onRecordAfterCreateSuccess(function(e) {
  e.next();          // ← IMMER ERSTE ZEILE
  var r = e.record;
  // ... eigener Code ...
}, 'collection_name');
```

---

## Routing-Architektur

| Domain | Ziel |
|---|---|
| `crewplanner.nyxlightwork.de` | Frontend (nginx, Produktiv) |
| `api.crewplanner.nyxlightwork.de` | Pocketbase API |

**CORS** läuft über Traefik (nicht Pocketbase-Admin). Erlaubte Origins:
- `https://crewplanner.nyxlightwork.de`
- `https://aniflu.github.io`

Kein StripPrefix — `POCKETBASE_URL` hat kein `/api`-Suffix.

---

## Tech-Stack

- **Vanilla JavaScript** — kein Framework, keine Bibliotheken, kein Build-Step
- **HTML5 + CSS3** — separate Dateien
- **localStorage** — persistente Datenspeicherung im Browser
- **Pocketbase** — Self-hosted Backend: Auth, Datenbank (SQLite), JS-Hooks für E-Mails
- **GitHub Pages** — statisches Hosting (Frontend)

---

## Lokale Entwicklung

```bash
python3 -m http.server 8080
# http://localhost:8080 im Browser öffnen
```

Datei in `js/` oder `styles.css` bearbeiten → Browser-Tab neu laden → fertig. Kein npm, kein Build.

**Cache-Bust:** Nach JS/CSS-Änderungen `?v=N` in `index.html` + `login.html` hochzählen.

Aktuelle Versionen (Stand 2026-05-30):

| Datei | Version | Anmerkung |
|---|---|---|
| `config.js` | v29 | |
| `pb.js` | v33 | |
| `dataService.js` | v38 | loadPlanForCrew(), loadPlanForManager(), _getActivePlanId() mit Crew/Manager-Fallback |
| `authService.js` | v34 | loadPlanForManager() für IS_MANAGER, loadPlanForCrew() für IS_CREW |
| `rbac.js` | v1 | |
| `state.js` | v25 | |
| `render.js` | v27 | Crew: Namen mit Statusfarbe, nur eigene Slots editierbar |
| `dropdown.js` | v28 | "📧 anfragen"-Button entfernt |
| `bundle.js` | v30 | "📧 anfragen"-Button entfernt (gespiegelt) |
| `crewNotify.js` | v29 | sendInvite=bulkPropose+Mail, sendUpdate, _getNewSlotsForCrew |
| `crewLink.js` | v24 | |
| `userView.js` | v27 | openSlotConfirmModal, bulkConfirmAllMySlots, bulkDeclineAllMySlots |
| `emailLog.js` | v1 | renderEmailLog() für admin.html |
| `plans.js` | v26 | |
| `init.js` | v30 | |
| `tourblock.js` | v25 | |
| alle anderen | v23 | |

---

## Deploy zu Production (GitHub Pages)

```bash
git push origin main
```

GitHub Pages aktualisiert sich automatisch ~1 Minute nach dem Push. Der `main` Branch ist der Produktions-Branch.

---

## Production-Infrastruktur (Server)

**Wichtig:** Container wird von **Coolify** verwaltet — niemals `docker stop/rm/run` manuell ausführen. Nur `docker restart` für Hook-Reload.

**CORS** läuft über Traefik (nicht PocketBase). Erlaubte Origins: `crewplanner.nyxlightwork.de`, `aniflu.github.io`.

### Pocketbase Hook deployen

Hook aus GitHub holen + Container neu starten (alles in einem):

```bash
ssh hetzner "curl -s -o /var/lib/docker/volumes/ad9adhhkygjreidi79i4v5eb_pocketbase-hooks/_data/main.pb.js \
  https://raw.githubusercontent.com/Aniflu/Crewplaner/main/.pb_hooks/main.pb.js \
  && docker restart pocketbase-ad9adhhkygjreidi79i4v5eb"
```

### CORS anpassen (dauerhaft)

CORS wird NICHT mehr über Coolify oder PocketBase-Admin gesetzt, sondern ausschließlich über:
`/data/coolify/proxy/dynamic/pocketbase-fix.yaml` → `accessControlAllowOriginList`
Traefik lädt die Datei automatisch neu — kein Restart nötig.
Erlaubte Origins: `https://crewplanner.nyxlightwork.de`, `https://aniflu.github.io`

### Traefik strip-api Bug (GELÖST — dauerhafter Fix aktiv seit 20. Mai 2026)

Coolify schreibt bei jedem Redeploy `strip-api` Middleware in den HTTPS-Router → `/api/*` gibt 404.
**Dauerhafter Fix:** `pocketbase-fix.yaml` mit Priorität 1000 (Coolify hat ~60) überschreibt immer.
Datei: `/data/coolify/proxy/dynamic/pocketbase-fix.yaml` auf dem Server.
War am 15., 17. und 20. Mai 2026 aufgetreten. Seit 20. Mai permanent gefixt.

### Collections nach Coolify-Redeploy weg (Symptom + Fix)

**Symptom:** Collections in PB Admin nicht sichtbar, aber `/api/collections` gibt 404 — obwohl Daten (SQLite) noch da sind.

**Fix:**
1. PocketBase Admin → Settings → **Import collections**
2. Dieses JSON einfügen (ohne Relation-IDs, alles als text):

```json
[{"name":"plans","type":"base","listRule":"@request.auth.id != \"\"","viewRule":"@request.auth.id != \"\"","createRule":"@request.auth.id != \"\"","updateRule":"@request.auth.id != \"\"","deleteRule":"@request.auth.id != \"\"","fields":[{"name":"name","type":"text","required":true},{"name":"owner","type":"text"},{"name":"plan_data","type":"json"}]},{"name":"plan_members","type":"base","listRule":"@request.auth.id != \"\"","viewRule":"@request.auth.id != \"\"","createRule":"@request.auth.id != \"\"","updateRule":"@request.auth.id != \"\"","deleteRule":"@request.auth.id != \"\"","fields":[{"name":"plan_id","type":"text","required":true},{"name":"user_id","type":"text"},{"name":"role","type":"text"}]},{"name":"crew_members","type":"base","listRule":"@request.auth.id != \"\"","viewRule":"@request.auth.id != \"\"","createRule":"@request.auth.id != \"\"","updateRule":"@request.auth.id != \"\"","deleteRule":"@request.auth.id != \"\"","fields":[{"name":"plan_id","type":"text","required":true},{"name":"name","type":"text","required":true},{"name":"email","type":"email"},{"name":"sort_order","type":"number"},{"name":"user_id","type":"text"}]},{"name":"assignments","type":"base","listRule":"@request.auth.id != \"\"","viewRule":"@request.auth.id != \"\"","createRule":"@request.auth.id != \"\"","updateRule":"@request.auth.id != \"\"","deleteRule":"@request.auth.id != \"\"","fields":[{"name":"plan_id","type":"text","required":true},{"name":"date","type":"text","required":true},{"name":"pos_id","type":"text","required":true},{"name":"pos_label","type":"text"},{"name":"crew_name","type":"text"},{"name":"crew_email","type":"text"},{"name":"status","type":"text"},{"name":"proposed_by","type":"text"},{"name":"responded_at","type":"date"}]},{"name":"crew_invites","type":"base","listRule":"@request.auth.id != \"\"","viewRule":"@request.auth.id != \"\"","createRule":"@request.auth.id != \"\"","updateRule":"@request.auth.id != \"\"","deleteRule":"@request.auth.id != \"\"","fields":[{"name":"plan_id","type":"text"},{"name":"crew_name","type":"text","required":true},{"name":"crew_email","type":"email","required":true},{"name":"type","type":"text","required":true},{"name":"plan_name","type":"text"},{"name":"app_url","type":"text"}]},{"name":"email_log","type":"base","listRule":"@request.auth.id != \"\"","viewRule":"@request.auth.id != \"\"","createRule":"@request.auth.id != \"\"","updateRule":"","deleteRule":"@request.auth.id != \"\"","fields":[{"name":"plan_id","type":"text"},{"name":"crew_name","type":"text"},{"name":"crew_email","type":"text"},{"name":"email_type","type":"text"},{"name":"sent_at","type":"text"},{"name":"success","type":"text"}]}]
```

3. **"Merge with existing collections"** anhaken
4. **"Replace with original IDs"** klicken (erscheint automatisch wenn Collections/Daten schon da sind)
5. **Review** → **Confirm**

> Daten gehen NICHT verloren — SQLite-Tables bleiben. Nur die Collection-Definitionen fehlen.
> `pb_schema.json` im Repo ist NICHT direkt verwendbar (enthält alte Relation-IDs `pbc_1736455494`).

Aktuell deployte Hook-Version: **v4.4**
- v4.1: email_log-Write nach jedem Mailversand
- v4.2: assignments CREATE-Hook entfernt (keine per-Slot-Emails mehr)
- v4.3: Absage-Email umformuliert ("Plan geändert")
- v4.4: Short-URL via is.gd bei plans view_token Update (serverseitig, kein CORS-Problem)
Danach in Docker-Logs prüfen: `[hook] main.pb.js v4.4 geladen`

### Docker-Logs live beobachten

```bash
ssh hetzner "docker logs pocketbase-ad9adhhkygjreidi79i4v5eb --tail 50 -f"
```

### E-Mail (Resend)

Hook sendet via Resend HTTP API (kein SMTP, umgeht Hetzner IP-Reputation-Problem).
- API-Key: in Coolify als `RESEND_KEY` Env-Var gesetzt (`$getEnv('RESEND_KEY')` im Hook)
- Verifizierte Domain: `crewplanner.nyxlightwork.de`
- Absender: `noreply@crewplanner.nyxlightwork.de`

### Admin-User anlegen (Pocketbase Admin UI)

`https://api.crewplanner.nyxlightwork.de/_/` → Collections → `users` → New record → Email: `madmaxmail@web.de`.

---

## Projektstruktur

```
├── index.html            ← HTML-Gerüst + <script> Ladereihenfolge (kritisch!)
├── admin.html            ← Manager/Superadmin-Konsole (Werkzeuge, E-Mail-Log, Benutzer, Pläne)
├── login.html            ← Login-Seite (Pocketbase Auth)
├── view.html             ← Öffentliche Read-only-Ansicht (kein Login, Token-basiert)
├── styles.css
├── .pb_hooks/
│   └── main.pb.js        ← Server-seitige E-Mail-Hooks (Pocketbase Goja-Engine) — v4.1
├── pocketbase/
│   └── pb_schema.json    ← Collections-Schema für Pocketbase-Import
└── js/
    ├── config.js         ← POCKETBASE_URL, ADMIN_EMAIL, SUPABASE_ENABLED
    ├── pb.js             ← Pocketbase REST-Client (pbGet, pbPost, pbPatch, pbDelete, pbList, pbFirst, pbUpsert)
    ├── dataService.js    ← Pocketbase CRUD: proposeCrew, loadCrewMeta, loadAssignmentStatuses, loadPlanForCrew
    ├── authService.js    ← Login/Logout, JWT, IS_CREW-Branch für Plan-Laden, _handleEmailAction()
    ├── state.js          ← Globale Variablen: POSITIONS, TOUR_DATES, crew, assignments, assignmentStatuses
    ├── utils.js          ← getVal(), isPending(), showToast(), fmtD(), genId(), esc()
    ├── render.js         ← renderTable(), renderHead(), renderBody() — Crew-Ansicht mit Status-Labels
    ├── bundle.js         ← ⚠️ MANUELLE KOPIE aus dropdown.js (kein Build-Tool!) — siehe unten
    ├── dropdown.js       ← showDD(), openCrewDD(), openDefaultDD(), requestForPos(), bulkCancelPos()
    ├── userView.js       ← Crew: openSlotConfirmModal(), bulkConfirmAllMySlots(), bulkDeclineAllMySlots()
    ├── emailLog.js       ← Admin: renderEmailLog() — lädt email_log Collection aus PB
    ├── init.js           ← App-Start: loadLogosGlobal(), initPlans(), render()
    └── ...               ← blockview, crewview, plans, pdf, persistence, sidebar, stats, tourblock, types
```

---

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

**E-Mails via Pocketbase-Hook** — `proposeCrew()` triggert automatisch `.pb_hooks/main.pb.js`. Kein Frontend-E-Mail-Code nötig.

**`SUPABASE_ENABLED`** in `config.js` — trotz irreführendem Namen: `true` = Pocketbase aktiv, `false` = localStorage-only-Modus.

---

## E-Mail-Bestätigungs-Flow (v2.0)

```
Admin wählt Crew → proposeCrew() → PB assignment record (status=proposed)
  → Hook CREATE fired → E-Mail an crew_email
  → E-Mail: weißes Design, zwei Buttons:
      [✓ BESTÄTIGEN →]  https://crewplanner.nyxlightwork.de?action=confirm&aid=RECORD_ID
      [✗ ABLEHNEN →]   https://crewplanner.nyxlightwork.de?action=decline&aid=RECORD_ID
  → Crew klickt Button → App öffnet → Login falls nötig
  → _handleEmailAction() in authService.js → pbPatch(aid, {status:'confirmed'})
  → loadAssignmentStatuses() → renderTable() → Zelle grün ✓
```

Bei Ablehnen: Hook UPDATE fired (status=declined) → E-Mail an Admin (`madmaxmail@web.de`).

---

## Bekannte Gotchas & Debugging-Wissen

### PocketBase Goja-Isolation (KRITISCH)
Hook-Callbacks laufen in vollständig isoliertem Kontext. Keine äußeren Scope-Variablen
zugänglich — auch nicht `var`-Deklarationen außerhalb des Callbacks. Alle Werte (URLs,
API-Keys, Farben) müssen als String-Literale **innerhalb jeder verschachtelten Funktion**
hardcoded sein. Gelernt durch 4 Versionen (v1.6–v1.9) Debugging. Nie außerhalb definieren!

### sort=-created → 400-Fehler
Nach PocketBase-Schema-Import erkennt PB `created` nicht als sortierbares Feld.
Lösung: Default-Sort in `pb.js` auf `-id` geändert (`sort: sort || '-id'`). Nie zurückändern.

### pbUpsert → Duplicate Records
Wenn `pbFirst` einen 400-Fehler wirft, fällt `pbUpsert` durch zu `pbPost` und erstellt Duplikate.
Symptom: mehrfach gespeicherte `crew_members`. Fix: `-id`-Sort behebt das zugrundeliegende Problem.

### Plans-Record verloren (Data-Loss-Szenario)
Nach Schema-Wipe hatte plans-Record `name=N/A, owner=N/A`. Symptom: Alle PB-Operationen
schlagen still fehl (planId=null). Fix: PB Admin → plans-Record manuell reparieren
(name + owner setzen). Code-Fallback in `_createOrFetchPlanId()` (dataService.js) sucht Plan
per owner allein falls name-Filter fehlschlägt.

### E-Mail landet im Spam (web.de)
web.de filtert aggressiv. SPF/DKIM für crewplanner.nyxlightwork.de prüfen falls E-Mails
nicht ankommen. Nichts kaputt — User muss Spam-Ordner prüfen.

---

## Pocketbase Collections

```
plans           { id, name, owner(→users), plan_data(JSON) }
plan_members    { plan_id(→plans), user_id(→users), role }
crew_members    { plan_id(→plans), name, email, sort_order, user_id(→users) }
assignments     { plan_id, date, pos_id, pos_label, crew_name, crew_email, status, proposed_by, responded_at }
crew_invites    { plan_id, crew_name, crew_email, type, plan_name, app_url }
email_log       { plan_id, crew_name, crew_email, email_type, sent_at, success }
```

Assignment-Status-Werte: `proposed` → `confirmed` | `declined`

email_type-Werte: `invite` | `reminder` | `cancellation` | `update` | `love_invite` | `staff_invite`

---

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

---

## Konventionen

- **Sprache:** Alle UI-Texte auf **Deutsch**
- **Farbpalette:** Gold `#e8c84a`, Grün `#4ae8a0`, Rot `#e84a4a`, Dark BG `#1a1a2e`
- **Kein Modulsystem** — alle JS-Dateien teilen den globalen Scope
- **Font:** `'IBM Plex Mono', monospace` (UI), `'Courier New'` (E-Mail-Templates)

---

## LLM Council Skill

Wenn der User "Consult the council:", "Frag andere KIs", "Was denken ChatGPT und Gemini darüber" oder ähnliches sagt — nutze den `llm-council` Skill via Skill-Tool.

## Tipps

- **`#` in Claude Code** — während einer Session drücken um Learnings direkt in diese CLAUDE.md zu schreiben
- **`.claude.local.md`** — für persönliche Einstellungen die nicht ins Git sollen
