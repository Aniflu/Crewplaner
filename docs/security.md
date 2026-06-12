# Sicherheitsrichtlinie — Tour Crew Plan

Stand: v0.10.6

---

## Zugänge & Credentials

| Was | Wo gespeichert | Rotieren wenn |
|---|---|---|
| Resend API-Key | Coolify Env-Var `RESEND_KEY` | Key kompromittiert |
| PB Admin-Passwort | Nur im Kopf / Passwort-Manager | Regelmäßig |
| SSH-Key (hetzner) | `~/.ssh/` (lokal, nie im Repo) | Jährlich |

**Niemals in den Code committen:** API-Keys, Passwörter, SSH-Keys.

---

## PocketBase Sicherheitskonfiguration

### API Rules (users-Collection)

| Operation | Rule |
|---|---|
| Create | *(leer — erlaubt Selbstregistrierung)* |
| Update | `@request.auth.role = "superadmin"` |
| Delete | `@request.auth.role = "superadmin"` |

### E-Mail-Sichtbarkeit

`emailVisibility` ist standardmäßig `false`. Beim Anlegen eines Users via Admin-Konsole wird `emailVisibility: true` gesetzt, damit die E-Mail-Adresse in der Admin-Tabelle erscheint.

### verified-Feld

Das `verified`-Feld kann **nicht** per Collections-API gesetzt werden — auch nicht mit superadmin-Auth-Token. Es wird serverseitig via `onRecordAfterCreateSuccess`-Hook gesetzt (main.pb.js v3.4).

---

## Infrastruktur-Sicherheit

### Server

- SSH-Zugang nur per Key, kein Passwort-Login
- Container von Coolify verwaltet — kein manuelles `docker stop/rm/run`
- Nur `docker restart` für Hook-Reloads erlaubt

### CORS

Läuft über Traefik (nicht PocketBase). Erlaubte Origins:
- `https://crewplanner.nyxlightwork.de`
- `https://aniflu.github.io`

---

## XSS-Schutz (admin.html + index.html)

Alle user-generierten Inhalte werden mit `esc()` (in `utils.js`) gerendert.
Interaktive Elemente nutzen `data-*` Attribute + `dataset.*` Zugriff — kein `onclick`-Injection.

---

## E-Mail-Hooks (PocketBase Goja)

Der Hook in `.pb_hooks/main.pb.js` sendet E-Mails via Resend HTTP API.

- API-Key wird via `$getEnv('RESEND_KEY')` geladen (nie hardcoded)
- Alle Werte in Callback-Funktionen hardcoded (Goja-Isolation — keine äußeren Scope-Variablen)
- Fehler werden geloggt aber werfen keine Ausnahmen die den Request blockieren

---

## Datenschutz (DSGVO)

Gespeicherte personenbezogene Daten: Name, E-Mail, Einsatz-Daten.
Zweck: Crew-Planung für Tourneen.
Verantwortlich: Betreiber (madmaxmail@web.de).

Daten können jederzeit über PB Admin UI gelöscht werden.

---

## Incident Response

1. Credentials sofort in Coolify + Resend Dashboard rotieren
2. Docker-Container neu starten (`docker restart pocketbase-...`)
3. Git-History auf versehentlich committete Secrets prüfen: `git log -S "re_" --all`
4. Resend: kompromittierten Key löschen, neuen erstellen, in Coolify hinterlegen
