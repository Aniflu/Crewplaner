# Tour / Crew — Personalplan

**Live-App:** https://crewplanner.nyxlightwork.de
**Login:** https://crewplanner.nyxlightwork.de/login.html

Crew-Scheduling-App für Tourneen. Admin weist Crew-Mitglieder pro Position und Tag zu, Crew bestätigt oder lehnt per App oder E-Mail-Button ab — Benachrichtigungen via Pocketbase-Hook (Resend).

## Version

**v0.9.32** — fix: GitHub Pages — Absolute Pfade zurück auf relative Pfade
**v0.9.31** — fix: Plan-Transfer Timing — startApp() nach Plan-Schreiben aufrufen
**v0.9.30** — fix: KRITISCH — Alle window.location.href Redirects zu absoluten Pfaden
**v0.9.29** — fix: startApp() Timing + Undo broken ES6 Module fixes
**v0.9.27** — fix: Plan-Transfer Fallback — URL Parameter wenn localStorage blockiert
**v0.9.26** — feat: Debug Dashboard — Live-Logging aller console/redirects/storage
**v0.9.25** — fix: ENDGÜLTIG — Redirect zu admin.html entfernt. Admin bleibt auf index.html
**v0.9.24** — fix: Plan-Transfer Bug — CDN-Cache killt alle Fixes. Cache-Buster v=10 + Redirect + skipRefresh
**v0.9.23** — fix: Plan-Transfer — 3 Tage Arbeit wiederhergestellt + authService.js localStorage Keys
**v0.9.22** — fix: Plan-Transfer GUARD blockiert admin.html Redirects
**v0.9.21** — fix: Plan-Transfer Button lädt ersten Plan automatisch
**v0.9.20** — fix: Plan-Transfer Bug — sessionStorage und modals.js Null-Check
**v0.9.19** — fix: Plan-Transfer — fix: auth-bootstrap Cache — fix: Plan-Transfer-Redirect — debug: Auth-Redirect Debugging — fix: window.* Exports für onclick-Handler — fix: ES6-Imports in app.js — fix: Vollständige window-Exports in admin-app.js für HTML-inline-scripts
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
