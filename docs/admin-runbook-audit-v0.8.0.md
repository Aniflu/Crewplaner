# Admin-Runbook — Audit-Nacharbeiten v0.8.0 / Hook v4.19

Stand: 2026-08-09 · Grundlage: `docs/audit-2026-08-09.md`

Marco hat keinen Server-Zugang. Alles hier braucht SSH oder Coolify.
**Fünf Schritte, in dieser Reihenfolge.** Schritt 1 ist Voraussetzung für Schritt 2.

Was bereits im Repo erledigt ist (kein Admin nötig): Lizenz, `esc()`-Härtung, CORS-Guard,
`debug.html` und die Schema-Abzüge gelöscht, Mailadressen und Server-Kennungen aus den
eingecheckten Dateien entfernt. Tests: 147 grün.

---

## Schritt 1 — `ADMIN_EMAIL` in Coolify setzen ⚠️ VOR dem Hook-Deploy

**Warum:** Der Hook hatte die Superadmin-Adresse an zwei Stellen fest verdrahtet, als Rückfall
hinter `$os.getenv('ADMIN_EMAIL')`. Da `main.pb.js` öffentlich ausgeliefert wird (Befund K-1),
stand sie damit im Netz — zusammen mit dem fehlenden Rate-Limiting am Login (Schritt 5) ein
namentlich benanntes Angriffsziel. Ab v4.19 kommt sie **ausschließlich** aus der Umgebung.

**Folge, wenn dieser Schritt ausbleibt:** Zwei Mails an den Planer entfallen — die
Bereitschaftsmeldung („BEREITSCHAFT · …") und die Absage-Benachrichtigung („ABGELEHNT · …").
Der Hook läuft normal weiter und schreibt nur eine Zeile ins Log. Es bricht also nichts, aber
es fällt auch nicht auf. Deshalb: erst setzen, dann deployen.

Auf **beiden** Instanzen (Live und Test) als Umgebungsvariable eintragen:

```
ADMIN_EMAIL=«SUPERADMIN-MAIL»
```

Danach Container neu starten und prüfen:

```bash
ssh «SERVER» "docker exec «PB-CONTAINER-LIVE» printenv ADMIN_EMAIL"
# erwartet: die Superadmin-Adresse (steht in .claude.local.md)
```

---

## Schritt 2 — Hook v4.19 deployen

**Was sich ändert** (klein, aber zwei davon sind sicherheitsrelevant):

1. Superadmin-Adresse nur noch aus `ADMIN_EMAIL`, kein fest verdrahteter Rückfall (siehe 1).
2. Der tote `love_invite`-Zweig ist entfernt — das Feature gibt es seit v0.22.0 nicht mehr.
3. Sonst **keine** Änderung. Die CORS-Middleware aus v4.18 ist byte-gleich geblieben.

**Nicht** wie in früheren Runbooks blind per `curl` aus GitHub ziehen — erst prüfen, dann ins
Volume (das Vorgehen, das sich beim v4.18-Deploy bewährt hat):

```bash
# 1. Nach /tmp holen und Inhalt kontrollieren
ssh «SERVER» "curl -s -o /tmp/main.pb.js \
  https://raw.githubusercontent.com/Aniflu/Crewplaner/main/.pb_hooks/main.pb.js \
  && grep -c \"v4.19 geladen\" /tmp/main.pb.js \
  && grep -c \"love_invite\" /tmp/main.pb.js \
  && grep -c \"ADMIN_EMAIL') ||\" /tmp/main.pb.js"
# erwartet: 1  (Versionsstring)
#           0  (kein love_invite mehr)
#           0  (kein fest verdrahteter Rückfall)

# 2. Sicherung, dann einspielen
ssh «SERVER» "cp /var/lib/docker/volumes/«PB-HOOKS-VOLUME-LIVE»/_data/main.pb.js \
     /root/backups/pb-hooks/main.pb.js.live.\$(date +%Y%m%d-%H%M%S) \
  && cp /tmp/main.pb.js /var/lib/docker/volumes/«PB-HOOKS-VOLUME-LIVE»/_data/main.pb.js \
  && docker restart «PB-CONTAINER-LIVE»"

# 3. Nachmessen — NICHT nur ins Log schauen
ssh «SERVER» "docker logs «PB-CONTAINER-LIVE» --tail 20 | grep 'v4.19 geladen'"
curl -s -o /dev/null -w "%{http_code}\n" https://api.crewplanner.nyxlightwork.de/api/health
```

**Erst Test, dann Live.** Und die Lehre aus v4.17 gilt weiter: *„v4.19 geladen" beweist, dass
der Hook LÄDT — nicht, dass er WIRKT.* Nach dem Deploy:

```bash
node tools/check-pb-rules.mjs      # CORS + anonyme Sichtbarkeit unverändert?
node tools/check-viewlink.mjs      # Booker-Link Ende-zu-Ende noch heil?
```

---

## Schritt 3 — `crew_members`-Regeln schließen (Befund K-3)

**Das ist der wirksamste Einzelschritt im ganzen Runbook.** Aufwand: eine Stunde.

**Was offen ist:** `crew_members` hat für `create`, `update` und `delete` keine Beschränkung
(Stand des Schema-Imports: durchgehend `@request.auth.id != ""`). Die Hook-Route `/myplan/{id}`
entscheidet über Zugriff allein danach, ob ein `crew_members`-Datensatz mit der eigenen Adresse
und der gewünschten `plan_id` existiert:

```js
var m = $app.findFirstRecordByFilter('crew_members',
  'plan_id = {:p} && email = {:m}', { p: planId, m: mail });
darf = !!m;
```

Jedes angemeldete Konto kann sich diesen Datensatz also **selbst anlegen** — und damit Zugriff
auf jede Tour verschaffen. Plan-IDs sind über die (ebenfalls offene) `assignments`-Liste
trivial zu beschaffen. Dieselbe Regel erlaubt außerdem, fremde Crew-Datensätze umzubenennen
oder zu löschen.

**Zuerst nachmessen** — im Audit war das die eine offene Frage, weil ohne Superuser nicht
einsehbar:

```bash
# Mit Superuser-Token: stehen die drei Regeln wirklich offen?
curl -s -H "Authorization: $TOKEN" \
  "https://api.crewplanner.nyxlightwork.de/api/collections/crew_members" \
  | python3 -m json.tool | grep -E '"(create|update|delete)Rule"'
```

**Dann setzen** (Live und Test), für alle drei Regeln denselben Ausdruck:

```
@request.auth.role = "superadmin" || (@collection.plans.id ?= plan_id && @collection.plans.owner ?= @request.auth.id)
```

**Geprüft und unbedenklich:** `saveCrewLink` (dataService.js:615) — der einzige Schreibpfad auf
`crew_members` aus der App — läuft ausschließlich über manager-gesicherte Aufrufer
(`crewLink.js` hinter `hasPermission('linkCrewEmail')`, `crew.js` ist manager-only). Kein
Crew-Konto schreibt dort. Die Verschärfung nimmt also niemandem etwas weg.

⚠️ **Der Pool-Sentinel:** Pool-Einträge tragen `plan_id="__pool__"`, was kein echter
plans-Record ist. Der `@collection.plans`-Zweig trifft darauf nicht zu → **nur superadmin legt
Pool-Mitglieder an.** Das entspricht der Praxis (Konsole läuft als superadmin), sollte aber
nach dem Setzen einmal durchgespielt werden: „+ Neues Crew-Mitglied" in der Konsole muss
weiter funktionieren.

**Danach in `tools/check-pb-rules.mjs` eintragen** (Konstante `SOLL`, Abschnitt
`crew_members`) — sonst fällt die Regel beim nächsten Coolify-Redeploy still zurück, und
genau so sind die letzten drei Befunde entstanden.

---

## Schritt 4 — Auslieferung auf App-Dateien begrenzen (Befund K-1)

**Was ist:** `crewplanner.nyxlightwork.de` liefert jede Datei des Repos aus. Gemessen, alle
mit `200`: `/CLAUDE.md` (164 KB), `/.pb_hooks/main.pb.js`, `/HANDOFF.md`, `/docs/security.md`,
`/tools/check-pb-rules.mjs`, `/CHANGELOG.md`.

Die Hälfte ist im Repo erledigt: Mailadressen und Server-Kennungen sind draußen (Platzhalter
`«…»`, echte Werte in Marcos lokaler `.claude.local.md`), `debug.html` und die Schema-Abzüge
gelöscht. Was bleibt, ist die Chronik der Lücken und die Server-Logik — die gehören nicht ins
Netz, lassen sich aber nur serverseitig zurückhalten.

**Ausliefern soll nur:** `index.html`, `admin.html`, `login.html`, `view.html`, `js/`,
`assets/`, `styles.css`, `theme.css`, `favicon.svg`, `sw.js`, `docs/guide-*.html`.

**Variante A — nginx-Regeln** (schnell, ~30 Min):

```nginx
location ~* \.(md|mjs|json|yaml|yml|sh|ts|sql)$ { return 404; }
location ~ ^/(\.pb_hooks|tools|tests|pocketbase|\.github|\.git) { return 404; }
```
Ausnahme nicht vergessen, falls `docs/guide-*.html` betroffen wäre (HTML ist oben nicht
gefiltert, sollte also durchgehen).

**Variante B — Deploy-Schritt** (~½ Tag, dafür dauerhaft): im Coolify-Build nur die
Auslieferungsdateien in den Container kopieren. Dann ist „öffentlich" eine Entscheidung statt
der Voreinstellung — und eine neue Datei im Repo landet nicht automatisch im Netz.

**Empfehlung: B**, weil A bei jeder neuen Dateiendung nachgezogen werden muss.

**Danach nachmessen:**

```bash
for P in /CLAUDE.md /.pb_hooks/main.pb.js /HANDOFF.md /CHANGELOG.md /tools/check-pb-rules.mjs; do
  echo -n "$P "; curl -s -o /dev/null -w "%{http_code}\n" "https://crewplanner.nyxlightwork.de$P"
done   # erwartet: überall 404

# Gegenprobe — die App muss weiter laufen:
for P in / /login.html /admin.html /js/app.js /theme.css /docs/guide-crew.html; do
  echo -n "$P "; curl -s -o /dev/null -w "%{http_code}\n" "https://crewplanner.nyxlightwork.de$P"
done   # erwartet: überall 200
```

---

## Schritt 5 — Sicherheits-Header und Rate-Limiting (Befunde W-2, W-3)

### 5a · Header (~1 Std)

Gemessen liefert das Live-Frontend **keinen einzigen** Schutz-Header:

```
$ curl -sI https://crewplanner.nyxlightwork.de/
server: nginx/1.31.3
```

Ergänzen:

```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Content-Type-Options    "nosniff" always;
add_header X-Frame-Options           "DENY" always;
add_header Referrer-Policy           "no-referrer" always;
```

**CSP zuletzt und vorsichtig.** Die App nutzt reichlich `onclick=`-Handler und Inline-`<style>`
— eine strenge Richtlinie legt sie sofort lahm. Realistischer Einstieg:

```nginx
add_header Content-Security-Policy "default-src 'self'; connect-src 'self' https://api.crewplanner.nyxlightwork.de; img-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'" always;
```

Das `unsafe-inline` ist ein Kompromiss. Wichtig ist `connect-src`: Es verhindert, dass eine
XSS-Lücke das Anmelde-Token zu einem fremden Server schickt — und das Token liegt in
`localStorage` (Befund W-4). **Nach dem Setzen alle vier Seiten im Browser durchklicken**,
besonders Konsole und Booker-Link.

### 5b · Rate-Limiting (~1 Std)

Zwölf Fehlversuche in Folge gegen den Login, alle gleich beantwortet, keine Drosselung:

```
400 400 400 400 400 400 400 400 400 400 400 400
```

Traefik-Middleware `rateLimit` auf die Auth-Pfade legen (Weg über
`/data/coolify/proxy/dynamic/pocketbase-fix.yaml`, wie beim strip-api-Fix). Zusätzlich prüfen,
ob PocketBase v0.38 eigene Drosselung mitbringt und aktiviert ist.

Nicht drosseln: `/viewplan/`, `/viewstatus/`, `/ics/` — dort sind die Tokens lang und zufällig,
und ein Kalender-Abo fragt regelmäßig ab.

---

## Noch nicht Teil dieses Runbooks: K-2

**Befund K-2 (jedes angemeldete Konto liest alle Zuweisungen und alle Crew-Datensätze)** wurde
bewusst herausgehalten — Marcos Entscheidung. Er berührt den Ladepfad **jedes** Crew-Mitglieds
und braucht eigene Hook-Routen (`/pool`, `/planassignments/{id}`), einen Frontend-Umbau und
erst danach die Regelverschärfung.

**Reihenfolge dort zwingend: Hook → Frontend → Regel** — und „Frontend" heißt das auf der
jeweiligen Umgebung *ausgelieferte* JS, nicht das im Repo. Beim v4.16-Rollout stand das schon
einmal falsch herum im Runbook; wäre es befolgt worden, hätten alle neun Crew-Konten auf Live
sofort ihre Touren verloren. Kommt als eigener Stand mit eigenem Runbook.

Schritt 3 dieses Runbooks nimmt bereits den gefährlichsten Teil weg — die Möglichkeit, sich
selbst Zugriff auf fremde Touren zu verschaffen.
