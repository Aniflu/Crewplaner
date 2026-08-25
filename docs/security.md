# Sicherheitsrichtlinie — Crewplanner

Stand: v0.9.4 (2026-08-16) · Hook v4.21

---

## Stand der Härtung — das Audit vom 09.08.2026 ist abgeschlossen

Alle Befunde sind zu, jeder mit einer Messung belegt (nicht mit einer Fertigmeldung):

| Befund | Erledigt | Belegt durch |
|---|---|---|
| K-2 · Crew sah fremde Mailadressen | v0.8.1, Hook v4.20 | `/planstatus` ohne Adressen, mit Live-Crew-Konto abgenommen |
| K-3 · Rechteausweitung über `crew_members` | v0.8.1 | PB-Regeln `OWNER_ONLY`, später `POOL_OR_OWNER` |
| K-1 · Die Domain lieferte das ganze Repo aus | 2026-08-14 | Build Pack auf Dockerfile; `.pb_hooks/`, `tools/`, `tests/`, `*.md` → 404 |
| W-2 · Keine Schutz-Header | 2026-08-14 | HSTS, `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy` — auch auf Fehlerseiten |
| W-4 · Token im `localStorage` ohne CSP | v0.8.4 | CSP aktiv, `connect-src` auf eigene API begrenzt |
| Kein Rate-Limiting am Login | 2026-08-14 | PocketBase-eigene Drosselung + `trustedProxy`; gemessen: 429 ab dem dritten Fehlversuch, `/ics/` unbeeinflusst |

Zwei Dinge, die dabei nebenbei geschlossen wurden und in keinem Befund standen:

- **Kurzlink über is.gd** (v0.8.4): Beim Erzeugen des öffentlichen Ansichts-Links ging der
  frisch gewürfelte `view_token` an einen fremden Dienst. Im Hook war dieser Weg mit v4.16
  entfernt worden — der Weg im Browser wurde damals übersehen. Jetzt entfernt, nicht nur
  durch die CSP blockiert.
- **Schriften von Google** (v0.8.4): Die beiden Anleitungsseiten und das PDF-Fenster luden von
  `fonts.googleapis.com`. Die Anleitung verlinkt der Hook in jeder Crew-Mail — damit meldete
  sich jeder Leser bei Google. Alle Schriften liegen jetzt selbst im Projekt.

**Offen:** nichts aus diesem Audit.

---

## Resend-Schlüssel im Git-Verlauf (2026-08-05) — kein Handlungsbedarf

Beim Aufräumen gefunden: In `CHANGELOG.md` stand seit **v0.9.3 (Commit `37b414d`)** ein
vollständiger Resend-API-Schlüssel im Klartext — in einem **öffentlichen** GitHub-Repository.
Aus der aktuellen Fassung entfernt; im Git-Verlauf bleibt er für immer lesbar.

**KORREKTUR (2026-08-05, vom Admin am echten Dienst nachgemessen — meine ursprüngliche
Forderung „muss rotiert werden" war voreilig, weil ich nicht geprüft hatte, WELCHER Schlüssel
dort steht):**

- Es ist **nicht** der laufende Schlüssel: im Verlauf steht `re_75ZvX…`, auf dem Server läuft
  `re_Suse3…`.
- Der Schlüssel aus dem Verlauf ist bei Resend **bereits ungültig**:
  `GET https://api.resend.com/domains` → `400 {"message":"API key is invalid"}`.
- Der aktive Schlüssel ist gültig (`200`), Domain `crewplanner.nyxlightwork.de` verified,
  Versand läuft.

Also **keine Rotation nötig**. Der Eintrag im Verlauf ist wertlos. Wäre es der laufende
Schlüssel gewesen, gälte: löschen, neu erzeugen, in Coolify als `RESEND_KEY` hinterlegen
(die Test-Instanz hat bewusst **keinen**) — ein fremder Zugriff erlaubt Mailversand über die
verifizierte Domain und schadet der Domain-Reputation.

**Lehre:** „Steht ein Secret im Verlauf?" und „Ist DIESES Secret noch gültig?" sind zwei
Fragen. Die zweite kostet einen einzigen API-Aufruf und entscheidet, ob überhaupt etwas zu
tun ist.

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
| Create | `@collection.crew_members.email ?= email` *(seit v0.5.1 — vorher leer = jede Adresse konnte sich registrieren)* |
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
| `plans` · List/View | `@request.auth.id = owner \|\| @request.auth.role = "superadmin"` — **der frühere Zweig `\|\| view_token != ""` ist seit v0.6.0 RAUS**, er machte alle Pläne inkl. Tokens anonym lesbar (siehe Historie unten) |
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

Das `verified`-Feld kann **nicht** per Collections-API gesetzt werden — auch nicht mit superadmin-Auth-Token. Es wird serverseitig via `onRecordAfterCreateSuccess`-Hook gesetzt (main.pb.js, **aktuell v4.18, deployt 2026-08-05 auf beide Instanzen**). Derselbe users-Create-Hook übernimmt zusätzlich die Rolle aus dem Crew-Pool (`crew_members.role`, Sentinel `plan_id="__pool__"`) und vergibt einen `feed_token` für den Kalender-Abo-Feed (`/ics/{token}/{plan}`, seit v0.27.0).

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

## Öffentlich lesbare Daten (Stand 2026-08-05)

**Ohne Anmeldung ist keine einzige Collection mehr lesbar.** Gegengeprüft auf Live und Test:
`plans`, `assignments`, `crew_members`, `users`, `email_log`, `activity_log` → jeweils
`totalItems: 0`.

> ⚠️ **Nicht am HTTP-Status festmachen.** PocketBase antwortet bei einer *Filter*-Regel mit
> **200 und leerer Liste**; nur eine `null`-Regel liefert 403. Maßgeblich ist `totalItems`.
> (Hinweis des Server-Admins, 2026-08-04.)

Öffentliche Daten fließen ausschließlich über die token-geschützten Hook-Routen (siehe unten),
die gezielt filtern, was sie herausgeben.

**Prüfen:** `node tools/check-pb-rules.mjs` (Regeln + Gegenprobe von außen) und
`node tools/check-viewlink.mjs` (öffentlicher Link Ende-zu-Ende, inkl. Crew-Sicht).

### Historie — drei Löcher in vier Tagen

| Datum | Was offen lag | Ursache |
|---|---|---|
| 2026-08-03 | 913 Einsätze inkl. **10 Crew-E-Mail-Adressen**, ohne Login und ohne Link | `assignments.listRule` war **leer** — nötig, damit `view.html` Status-Farben anzeigen konnte |
| 2026-08-04 | **alle Tourpläne** inkl. der `view_token` im Klartext | `plans.listRule` endete auf `\|\| view_token != ""`; der Zweig trifft auf *jeden* Plan mit Token zu |
| 2026-08-04 | `view_token` im Payload für angemeldete Crew der eigenen Tour | Crew las den Plan direkt über die Collection |

**Gemeinsame Fehlerklasse:** Eine Ansicht liest direkt aus einer Collection, und die
Zugriffsregel wird so weit geöffnet, bis das geht. **Gegenmittel:** Was öffentlich oder
eingeschränkt sichtbar sein soll, läuft über eine Hook-Route, die nur die nötigen Felder
herausgibt — dann kann die Regel eng bleiben.

---

## CORS

PocketBase antwortet von Haus aus **jeder** Herkunft mit `Access-Control-Allow-Origin: *`.
Das galt hier lange als Reverse-Proxy-Einstellung und wurde deshalb als „braucht SSH"
liegengelassen — ein Denkfehler: Der Header erscheint zusammen mit `Vary: Origin` und den
PocketBase-Security-Headern, **auch auf reinen Hook-Routen**, die Traefik nicht anfasst.

Eine `routerUse`-Middleware grenzt das ein — eingeführt in **v4.17**, aber **wirksam erst ab
v4.18**: v4.17 setzte die Header nach `e.next()`, zu diesem Zeitpunkt ist die Antwort in Go
längst geschrieben und jedes `Header().Set()` verpufft folgenlos. Der Hook lud, lief, meldete
`v4.17 geladen` — und änderte keinen einzigen Header (vom Admin am 2026-08-05 gemessen; siehe
`admin-runbook-hook-v4.18.md`). Die erlaubte Herkunft ergibt sich aus dem eigenen Hostnamen:

| Instanz | erlaubt |
|---|---|
| `api.crewplanner…` | `https://crewplanner.nyxlightwork.de` (+ `www.`) |
| `api-test.crewplanner…` | `https://aniflu.github.io`, `localhost:8080` |

Fremde Herkünfte bekommen **keinen** Header → der Browser verweigert das Auslesen.

⚠️ **Die Traefik-Ebene existiert weiterhin und bleibt unangetastet.** In
`/data/coolify/proxy/dynamic/pocketbase-fix.yaml` steht auf Live genau **eine** erlaubte
Herkunft (`https://crewplanner.nyxlightwork.de`). Sie schadet nicht (wo beide Ebenen dieselbe
Herkunft setzen, kommt trotzdem genau ein Header an — Traefik überschreibt statt anzuhängen)
und ist die einzige Ebene, die auch dann noch greift, wenn ein Hook-Deploy schiefgeht.
**Folge, die man kennen muss:** `https://www.crewplanner.nyxlightwork.de` steht dort **nicht**
und hängt damit **allein an der Hook-Positivliste** — fliegt die Herkunft aus dem Hook, bricht
`www.`, und Traefik fängt das nicht auf.

**Bewusste Ausnahme:** `/viewplan/…`, `/viewstatus/…`, `/ics/…` behalten `*` — dort ist der
Token die Zugangsberechtigung, und ein Kalender-Abo muss von überall abrufbar sein.

**Einordnung:** Der praktische Schaden des `*` war gering (alle Collections verlangen Anmeldung;
das Token liegt origin-isoliert im Browser-Speicher, eine fremde Seite kommt nicht daran). Es
widersprach aber der Doku — und „steht so in der Doku" ist kein Sicherheitsniveau.

**Prüfen:** `node tools/check-pb-rules.mjs` (eigene CORS-Probe: eigene Herkunft freigegeben,
fremde nicht). ⚠️ **Nicht am Log festmachen:** `v4.xx geladen` beweist, dass der Hook LÄDT,
nicht dass er WIRKT. Bei Header-Änderungen müssen die Header gemessen werden — genau daran
ging v4.17 unbemerkt vorbei.

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

## Server-Routen (Hook)

**Ohne Login, durch Token geschützt** — die Sicherheit hängt am nicht-erratbaren Token:

- **`GET /viewplan/{token}`** (v4.15) — öffentlicher Booker-Link: liefert **nur** `name` +
  `plan_data`. Kein `view_token`, kein `owner`, kein `view_shorturl`.
- **`GET /viewstatus/{token}`** (v4.14) — Status-Farben derselben Ansicht: **nur** Datum,
  Position, Status, Anzeigename. Keine E-Mail-Adressen.
- **`GET /ics/{token}/{plan}`** (v4.9.2) — persönlicher Kalender-Feed: `users.feed_token`
  identifiziert die Person, das Plan-Segment grenzt auf **eine** Tour ein.

**Mit Login, serverseitig geprüft:**

- **`GET /myplans`**, **`GET /myplan/{id}`** (v4.16, `$apis.requireAuth()`) — die Touren der
  angemeldeten Crew. Zugriff nur für Owner, superadmin oder `crew_members` *dieser* Tour;
  Ablehnung als **404** (verrät nicht, ob die Tour existiert). Antwort **ohne** `view_token`,
  `view_shorturl`, `owner`.

> **Warum Hook-Routen statt Collection-Regeln:** PocketBase-Regeln filtern pro Datensatz und
> können einen Token aus dem Request nicht an *einen* Datensatz binden. `view_token != ""` gibt
> deshalb **alle** Pläne mit Token frei, nicht den einen. Eine Hook-Route löst den Token selbst
> auf und bestimmt, welche Felder zurückgehen.

> **Kein URL-Kürzer mehr.** Bis v0.6.0 schickte ein Hook die Ansichts-URL **inklusive Token** an
> is.gd — ein fremder Dienst, der sie dauerhaft speichert, bei kurzen und durchprobierbaren
> Adressen. In v0.6.1 entfernt; die Konsole zeigt die lange URL.

## Datenschutz (DSGVO)

Gespeicherte personenbezogene Daten: Name, E-Mail, Einsatz-Daten.
Zweck: Crew-Planung für Tourneen.
Verantwortlich: Betreiber («SUPERADMIN-MAIL»).

Daten können jederzeit über PB Admin UI gelöscht werden.

**Pflichtangaben nach außen** (seit v0.10.1): Crewplanner wird mit nyx lightwork vertrieben, das
dortige zentrale Impressum gilt mit. Der Rechts-Footer aller vier Oberflächen verweist auf
https://nyxlightwork.de/impressum.html bzw. `…#datenschutz`; die Repo-Dateien `impressum.html`
und `datenschutz.html` sind nicht mehr verlinkt und **keine gültige Fassung** (Platzhalter).

⚠️ **Für dieses Dokument die eigentliche Regel:** Wer hier einen neuen externen Empfänger
einträgt — ein weiterer Mail-Dienst, eine Analyse, ein CDN, eine fremde Schrift — muss ihn in
der Erklärung auf nyxlightwork.de nachziehen **und** die Banner-Freiheit neu bewerten
(§ 25 Abs. 2 Nr. 2 TDDDG trägt nur, solange es keinen fremden Host gibt). `tests/legal.test.mjs`
fängt das nur für Resend ab, nicht allgemein.

---

## Incident Response

1. Credentials sofort in Coolify + Resend Dashboard rotieren
2. Docker-Container neu starten (`docker restart pocketbase-...`)
3. Git-History auf versehentlich committete Secrets prüfen: `git log -S "re_" --all`
4. Resend: kompromittierten Key löschen, neuen erstellen, in Coolify hinterlegen
