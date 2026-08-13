# Auftrag an den Admin — v0.8.2

**Datum:** 2026-08-12 · **Ausführliche Fassung:** `docs/admin-runbook-auslieferung-v0.8.2.md`

Es sind die drei letzten offenen Punkte aus dem Audit vom 09.08.: die Domain liefert das ganze
Repo aus, das Frontend hat keine Schutz-Header, der Login hat keine Bremse.

Der Repo-Teil ist fertig (`Dockerfile`, `nginx.conf`, Tests, 160 grün). Drei Dinge brauchen dich.

---

## A · Bitte zuerst nur melden, nichts ändern

Welches **Build-Pack** fährt die Live-Frontend-Anwendung in Coolify heute (Static / Nixpacks /
Dockerfile / Compose)? Dazu bitte:

- Base Directory und Publish Directory
- eigenes nginx-Image im Spiel? Liegt dort eine eigene nginx-Konfiguration?
- setzen Traefik-Labels auf der **Frontend**-Anwendung (nicht der API) irgendwelche Header?

Der letzte Punkt ist wichtig: Wird `Strict-Transport-Security` doppelt gesetzt, ignorieren
manche Browser den Header ganz.

---

## B · Coolify auf Dockerfile umstellen

⚠️ **Erst wenn Marco gemeldet hat, dass der `live`-Branch das `Dockerfile` enthält.** Vorher
bricht der Build ab.

Build-Pack auf **Dockerfile** stellen. Das `Dockerfile` liegt in der Repo-Wurzel und braucht
keine Parameter. Es liefert nur noch die App aus (vier HTML-Seiten, `js/`, `assets/`,
`styles.css`, `theme.css`, `favicon.svg`, `sw.js`, `docs/guide-*.html`); `CLAUDE.md`,
`.pb_hooks/`, `tools/`, `tests/` und `CHANGELOG.md` sind dann nicht mehr im Container. Die
mitgelieferte `nginx.conf` setzt HSTS, `nosniff`, `X-Frame-Options: DENY` und `Referrer-Policy`.

### Danach messen

```bash
# muss überall 404 sein
for P in /CLAUDE.md /.pb_hooks/main.pb.js /HANDOFF.md /CHANGELOG.md \
         /tools/check-pb-rules.mjs /README.md /tests/run.mjs; do
  printf "%-32s " "$P"; curl -s -o /dev/null -w "%{http_code}\n" "https://crewplanner.nyxlightwork.de$P"
done

# muss überall 200 sein  ← die wichtigere Liste
for P in / /login.html /admin.html /view.html /js/app.js /js/dataService.js \
         /styles.css /theme.css /sw.js /favicon.svg /assets/fonts/geist-400.woff2 \
         /docs/guide-crew.html /docs/guide-admin.html; do
  printf "%-32s " "$P"; curl -s -o /dev/null -w "%{http_code}\n" "https://crewplanner.nyxlightwork.de$P"
done

# muss vier Zeilen ausgeben
curl -sI https://crewplanner.nyxlightwork.de/ \
  | grep -iE 'strict-transport|content-type-options|frame-options|referrer-policy'
```

Ein 404 in der zweiten Liste heißt: die App ist tot → melden, Marco macht `git revert`,
Coolify baut in ein bis zwei Minuten zurück.

**Die CSP kommt bewusst erst danach** als zweiter Push von Marcos Seite — für die
nginx-Konfiguration gibt es keine Testumgebung, deshalb erst die Auslieferung scharf und messen,
dann die CSP. Du musst dafür nichts tun.

---

## C · Rate-Limiting am Login

Unabhängig von A und B, kann sofort laufen.

Gemessen: zwölf Login-Fehlversuche in Folge, alle mit `400`, keine Verzögerung, keine Sperre.

Traefik-Middleware `rateLimit` auf die Auth-Pfade, Weg über
`/data/coolify/proxy/dynamic/pocketbase-fix.yaml` (dieselbe Datei wie beim strip-api-Fix,
Traefik lädt automatisch neu).

⚠️ **`/viewplan/`, `/viewstatus/` und `/ics/` ausnehmen.** Dort ist der lange Zufalls-Token die
Zugangsberechtigung, und ein Kalender-Abo fragt regelmäßig ab — eine Bremse auf `/ics/` bräche
die Abos der Crew, und zwar lautlos: In der Kalender-App fehlen dann einfach Termine.

Bitte außerdem prüfen, ob PocketBase v0.38 eine eigene Drosselung mitbringt und ob sie aktiv
ist — das wäre die sauberere Ebene, weil sie den Endpunkt kennt statt nur den Pfad.

### Danach messen

```bash
# erwartet: nicht mehr 15× 400, sondern 429 ab der Schwelle
for i in $(seq 1 15); do
  curl -s -o /dev/null -w "%{http_code} " -X POST -H 'Content-Type: application/json' \
    -d '{"identity":"nicht@vorhanden.example","password":"falsch"}' \
    https://api.crewplanner.nyxlightwork.de/api/collections/users/auth-with-password
done; echo

# erwartet: durchgehend 200 — bitte nicht überspringen
for i in $(seq 1 12); do curl -s -o /dev/null -w "%{http_code} " \
  "https://api.crewplanner.nyxlightwork.de/ics/<TOKEN>/<PLAN-ID>"; done; echo
```

---

## Was NICHT angefasst wird

Hook und Zugriffsregeln bleiben unberührt — v0.8.2 fasst weder `main.pb.js` noch die
PocketBase-Rules an. Wenn dort etwas kippt, kommt es nicht von diesem Stand.
