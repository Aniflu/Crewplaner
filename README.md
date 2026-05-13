# Tour / Crew — Personalplan

**Live-App:** https://crewplanner.nyxlightwork.com
**Login:** https://crewplanner.nyxlightwork.com/login.html

Crew-Scheduling-App für Tourneen. Der Admin weist Crew-Mitglieder pro Position und Tag zu, Crew bestätigt oder lehnt ab — Benachrichtigungen per E-Mail via Pocketbase-Hook.

## Version

**v2.1.1** — [Changelog](CHANGELOG.md)

## Tech-Stack

- Vanilla JavaScript (kein Framework, kein Build-Step)
- HTML5 + CSS3
- localStorage (Plan-Daten, client-seitig)
- [Pocketbase](https://pocketbase.io) — Auth, SQLite-Datenbank, E-Mail-Hooks
- GitHub Pages — statisches Hosting

## Infrastruktur

| Was | Wert |
|---|---|
| Live | https://crewplanner.nyxlightwork.com |
| Pocketbase API | https://crewplanner.nyxlightwork.com |
| Pocketbase Admin UI | https://crewplanner.nyxlightwork.com/_/ |
| GitHub Repo | https://github.com/Aniflu/Crewplaner |
| Server SSH | `root@crewplanner.nyxlightwork.com` |

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

## Rollback

```bash
git checkout v2.1-stable
git push origin main --force
```
