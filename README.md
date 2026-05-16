# Tour / Crew — Personalplan

**Live-App:** https://crewplanner.nyxlightwork.de
**Login:** https://crewplanner.nyxlightwork.de/login.html

Crew-Scheduling-App für Tourneen. Der Admin weist Crew-Mitglieder pro Position und Tag zu, Crew bestätigt oder lehnt ab — Benachrichtigungen per E-Mail via Pocketbase-Hook.

## Version

**v0.8.5.5** — [Changelog](CHANGELOG.md)

## Tech-Stack

- Vanilla JavaScript (kein Framework, kein Build-Step)
- HTML5 + CSS3
- localStorage (Plan-Daten, client-seitig)
- [Pocketbase](https://pocketbase.io) — Auth, SQLite-Datenbank, E-Mail-Hooks
- GitHub Pages — statisches Hosting

## Infrastruktur

| Was | Wert |
|---|---|
| Live | https://crewplanner.nyxlightwork.de |
| Pocketbase API | https://crewplanner.nyxlightwork.de |
| Pocketbase Admin UI | https://crewplanner.nyxlightwork.de/_/ |
| GitHub Repo | https://github.com/Aniflu/Crewplaner |
| Server SSH | `root@crewplanner.nyxlightwork.de` |

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

## Dokumentation

- **[Benutzer-Anleitung](docs/user/getting-started.md)** - Erste Schritte und grundlegende Nutzung
- **[Sicherheitsrichtlinien](docs/security.md)** - Datenschutz, Zugriffsrechte und Best Practices
- **[Datenbank-Struktur](docs/database-schema.md)** - Schema-Definitionen und ER-Modelle
- **[FAQ](docs/faq.md)** - Häufige Fragen und Troubleshooting

## Features & Roadmap

### Aktuelle Features
- **Ressourcenplanung**: Intuitive Zuordnung von Touren und Mitarbeitern
- **Echtzeit-Synchronisation**: Änderungen spiegeln sich sofort wider
- **Automatisierung**: Regelmäßige Aufgaben und intelligente Erinnerungen
- **Reporting & Analytics**: Detaillierte Exporte (CSV, PDF, Excel)
- **API-Integration**: RESTful API für externe Systeme
- **Berechtigungen**: Granulare Rollen und Zugriffslevel
- **Dashboard**: Live-Überblick über Kapazitäten und Auslastung

### Roadmap
- [x] MVP Release & Initialer Launch
- [x] Beta-Tester-Feedback Integration
- [ ] **Mobile App Q3 2026** (iOS & Android)
- [ ] KI-gestützte Planungsvorschläge
- [ ] Multi-Sprachunterstützung (DE, EN, FR)
- [ ] Dark Mode & themenbasiertes Design

## Support & Kontakt

- **Support E-Mail:** support@personalplan.example.com
- **GitHub Issues:** [Fehler melden & Feature-Requests](https://github.com/Personalplan/issues)
- **Live Chat:** [Chat starten](https://chat.personalplan.example.com)
