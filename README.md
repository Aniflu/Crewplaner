# Tour / Crew — Personalplan

**Live-App:** https://crewplanner.nyxlightwork.de
**Login:** https://crewplanner.nyxlightwork.de/login.html

Crew-Scheduling-App für Tourneen. Admin weist Crew-Mitglieder pro Position und Tag zu, Crew bestätigt oder lehnt per App oder E-Mail-Button ab — Benachrichtigungen via Pocketbase-Hook (Resend).

## Version

**v0.9.17** — fix: Plan-Transfer-Redirect — debug: Auth-Redirect Debugging — fix: window.* Exports für onclick-Handler — fix: ES6-Imports in app.js — fix: Vollständige window-Exports in admin-app.js für HTML-inline-scripts
**v0.9.12** — fix: admin-app.js importiert generateICS korrekt aus calendar.js
**v0.9.10** — fix: Entferne falsche Module-Imports
**v0.9.9** — fix: Module-Timing-Bug — Warte auf authReady + DOMContentLoaded
**v0.9.8** — fix: Zentrales Auth-Wall Muster — Einheitliche Authentifizierung auf allen Seiten
**v0.9.7** — Bugfix: DE_DAYS/DE_MON Export, Module-Load-Error
**v0.9.3** — Bugfix: ES6-Module-Migration, Auth-Check, Import Fixes
**v0.9.2** — Phase 3 Release: Centralized State Reform & Refactored Architecture

## Tech-Stack

- Vanilla JavaScript (kein Framework, kein Build-Step)
- HTML5 + CSS3
- [PocketBase](https://pocketbase.io) — Auth, SQLite-Datenbank, JS-Hooks für E-Mails
- [Resend](https://resend.com) — E-Mail-Versand via HTTP API
- GitHub Pages — statisches Frontend-Hosting

## Infrastruktur

| Was | Wert |
|---|---|
| Frontend (Live) | https://crewplanner.nyxlightwork.de |
| PocketBase API | https://api.crewplanner.nyxlightwork.de |
| PocketBase Admin UI | https://api.crewplanner.nyxlightwork.de/_/ |
| GitHub Repo | https://github.com/Aniflu/Crewplaner |
| Server SSH | `ssh hetzner` (Admin only) |

## Rollen

| Rolle | Zugang | Rechte |
|---|---|---|
| `superadmin` | admin.html | Alles |
| `manager` | index.html | Tour verwalten, Crew einladen |
| `booker` | index.html | Read-only |
| `crew` | index.html | Eigene Slots bestätigen/ablehnen |

## Lokale Entwicklung

```bash
python3 -m http.server 8080
# http://localhost:8080 im Browser öffnen
```

Kein npm, kein Build. Datei ändern → Browser-Tab neu laden → fertig.

## Deploy

```bash
git push origin main
```

GitHub Pages aktualisiert sich automatisch ~1 Minute nach dem Push.

## PocketBase Hook deployen

```bash
ssh hetzner "curl -s -o /var/lib/docker/volumes/ad9adhhkygjreidi79i4v5eb_pocketbase-hooks/_data/main.pb.js \
  https://raw.githubusercontent.com/Aniflu/Crewplaner/main/.pb_hooks/main.pb.js \
  && docker restart pocketbase-ad9adhhkygjreidi79i4v5eb"
```
