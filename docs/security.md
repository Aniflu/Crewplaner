# Sicherheitsrichtlinie — Crewplanner

Stand: v0.30.2

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

### API Rules — Datenzugriff (seit v0.26.0 gehärtet)

Vorher war fast alles `@request.auth.id != ""` (jeder eingeloggte Crew-User konnte fremde Einsätze
patchen und über `crew_invites` Mails an beliebige Adressen auslösen). Am 2026-07-13 per PB-Superuser
gehärtet und per **Impersonation** getestet (Crew patcht eigenen Einsatz=200, fremden=404,
Invite-Create=blockiert; Superadmin=200):

| Collection · Operation | Rule |
|---|---|
| `assignments` · Update | `@request.auth.role = "superadmin" || (@request.auth.id != "" && crew_email = @request.auth.email) || (@collection.plans.id ?= plan_id && @collection.plans.owner ?= @request.auth.id)` |
| `crew_invites` · Create | `@request.auth.role = "superadmin" || (@request.auth.id != "" && type = "availability") || (@collection.plans.id ?= plan_id && @collection.plans.owner ?= @request.auth.id)` |
| `plans` · List/View | `@request.auth.id = owner || @request.auth.role = "superadmin" || view_token != ""` |
| `activity_log` · List/View/Create | `auth != ""` (jeder Eingeloggte, seit v0.30.0) |
| `activity_log` · Delete | `@request.auth.role = "superadmin"` |

- **assignments.update:** Crew ändert nur EIGENE Einsätze (`crew_email` = eigene, alle klein
  gespeichert → case-sensitiver PB-Vergleich passt); Owner/superadmin verwalten den ganzen Plan.
  create/deleteRule bewusst UNVERÄNDERT (`auth != ""`) — Crew-Bestätigung legt ggf. eigenen Record an.
- **crew_invites.create:** nur Owner/superadmin dürfen `invite`/`reminder`/`update`/`cancellation`
  (mailen an Fremde); `availability` (Crew-Bereitschaft, mailt NUR an den Admin) bleibt jedem Eingeloggten erlaubt.

> ⚠️ **Coolify-Redeploy / Schema-Reimport setzt diese Regeln auf `auth != ""` zurück** (wie strip-api /
> plans-viewRule). Nach jedem Reimport diese zwei Regeln erneut setzen. Details: `CLAUDE.md` → Collections.

### E-Mail-Sichtbarkeit

`emailVisibility` ist standardmäßig `false`. Beim Anlegen eines Users via Admin-Konsole wird `emailVisibility: true` gesetzt, damit die E-Mail-Adresse in der Admin-Tabelle erscheint.

### verified-Feld

Das `verified`-Feld kann **nicht** per Collections-API gesetzt werden — auch nicht mit superadmin-Auth-Token. Es wird serverseitig via `onRecordAfterCreateSuccess`-Hook gesetzt (main.pb.js, **aktuell v4.10, deployt seit 2026-07-22**). Derselbe users-Create-Hook übernimmt zusätzlich die Rolle aus dem Crew-Pool (`crew_members.role`, Sentinel `plan_id="__pool__"`) und vergibt einen `feed_token` für den Kalender-Abo-Feed (`/ics/{token}/{plan}`, seit v0.27.0).

---

## Kontoanlage (Registrierung)

**Seit v0.5.1 geschlossen.** Vorher war `users.createRule` leer — **jede beliebige Person**
konnte sich selbst ein Konto anlegen (auf Test und Live). Jetzt gilt:

- Ein Konto entsteht **nur**, wenn die E-Mail-Adresse vorher in `crew_members` steht —
  globaler Pool (`plan_id="__pool__"`) **oder** Crew einer Tour. Angelegt wird sie vom Planer
  in der Konsole („+ Neues Crew-Mitglied") oder direkt beim Besetzen einer Tour.
- Die dort hinterlegte **Rolle** übernimmt der Post-Create-Hook beim ersten Login. Der Client
  kann `users.role` nicht selbst setzen (`updateRule` = superadmin).
- Abgewiesene Versuche bekommen einen neutralen Hinweis, der **nicht** verrät, ob die Adresse
  existiert.

Zwei Ebenen, weil Zugriffsregeln bei Coolify-Redeploy/Schema-Reimport zurückfallen:

| Ebene | Prüfung | Überlebt Redeploy? |
|---|---|---|
| `users.createRule` = `@collection.crew_members.email ?= email` | exakt (PB `=` ist case-sensitiv) | nein — neu setzen |
| Hook v4.13 (`onRecordCreateRequest` auf `users`) | kleingeschrieben | ja (Datei im Volume) |

Im Hook steht die Prüfung bewusst **vor** `e.next()` — danach wäre der Datensatz bereits
angelegt und die Sperre wirkungslos (abgesichert durch `tests/registration.test.mjs`).

**Nicht betroffen:** Anmeldung und „Passwort vergessen" bestehender Konten.

⚠️ In einer **leeren** Datenbank sperrt die Regel alle aus — der erste `crew_members`-Eintrag
muss über den PocketBase-Superuser rein (siehe `admin-runbook-registrierungs-sperre.md`).

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

`esc()` maskiert `& < > " '` (seit v0.23.3 auch Quotes → sicher im Attributkontext).
Seit v0.26.0 escaped auch die Dropdown-Engine `showDD` (dropdown.js) `header`/`label`/`dot`
konsequent (vorher landeten Crew-/Positionsnamen im Dot-Zweig unescaped im `innerHTML`).

---

## E-Mail-Hooks (PocketBase Goja)

Der Hook in `.pb_hooks/main.pb.js` sendet E-Mails via Resend HTTP API.

- API-Key wird via `$os.getenv('RESEND_KEY')` geladen (nie hardcoded — `$getEnv` existiert in PB v0.38 nicht)
- Alle Werte in Callback-Funktionen hardcoded (Goja-Isolation — keine äußeren Scope-Variablen)
- Fehler werden geloggt aber werfen keine Ausnahmen die den Request blockieren

---

## Aktions-Scoping (Crew)

Zwei Ebenen, seit v0.26.0 **beide** aktiv:
1. **App-seitig (v0.20.0):** `confirmAssignment`/`declineAssignment` (dataService.js) prüfen, dass der
   Ziel-Record die **eigene** E-Mail trägt → Crew kann in der App nur eigene Einsätze bestätigen/absagen.
2. **Server-seitig (v0.26.0):** die PocketBase-`assignments.updateRule` erzwingt dasselbe auf DB-Ebene
   (`crew_email = @request.auth.email`), sodass ein direkter API-Aufruf die App-Prüfung nicht mehr
   umgehen kann; `crew_invites.createRule` verhindert, dass Crew Mails an Fremde auslöst. Siehe
   „API Rules — Datenzugriff" oben. Der Plan-Scope kommt zusätzlich über die `view_token`-basierte plans-viewRule.

> ✅ Damit ist der frühere Backlog-Punkt „echte server-seitige Sperre" erledigt (2026-07-13, getestet).
> ⚠️ Rest-Lücke: `assignments.listRule` ist live `''` (public list) — bewusst nicht angefasst, um den
> öffentlichen view.html-Booker nicht zu brechen; `crew_members` ist weiterhin `auth != ""`.

---

## Öffentliche, unauthentifizierte Routen

Zwei Server-Routen sind bewusst **ohne** Login erreichbar — Sicherheit läuft hier über einen
nicht-erratbaren Token statt über Auth:

- **`plans` mit `view_token`** (öffentlicher Booker-Link, `view.html`): Read-only, liest nur `plan_data`.
- **`/ics/{token}/{plan}`** (Kalender-Abo-Feed, Hook v4.9.2, seit v0.27.0): `users.feed_token`
  (`$security.randomString(40)`) identifiziert die Person, das zweite Pfadsegment grenzt auf EINE
  Tour ein (v0.27.1 — vorher lieferte ein Token alle Touren gemischt, eine Person in zwei Touren
  sah beide vermengt). Beide Tokens sind lang genug, um praktisch nicht erratbar zu sein; ein
  kompromittierter Token gibt nur Lesezugriff auf Tourdaten/Termine preis, keine Schreibrechte.

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
