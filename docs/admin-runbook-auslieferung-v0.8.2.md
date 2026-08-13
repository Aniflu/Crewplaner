# Auftrag an den Admin — Auslieferung begrenzen, Schutz-Header, Login-Bremse

**Datum:** 2026-08-12 · **Betrifft:** v0.8.2 · **Vorgänger:** `docs/admin-auftrag-schritt3-regeln-2026-08-11.md`
**Audit-Befunde:** K-1, W-2, W-3 — die drei letzten offenen Punkte aus der Prüfung vom 09.08.

---

## Kurz

Drei Dinge, in dieser Reihenfolge:

1. **Rückmeldung, keine Änderung** — welches Build-Pack fährt die Live-Frontend-Anwendung in
   Coolify heute? Davon hängt der Rest ab, und ich rate hier nicht.
2. **Coolify auf Dockerfile umstellen** — danach liefert die Domain nur noch die App aus und
   schickt Schutz-Header. Das kommt aus dem Repo, du änderst nichts von Hand.
3. **Rate-Limiting in Traefik** — der einzige Teil, der wirklich Handarbeit ist.

Neu im Repo (Branch `main`, noch nicht auf `live`): `Dockerfile`, `nginx.conf`,
`tests/delivery.test.mjs`.

---

## Ausgangslage — gemessen, nicht angenommen

Gegen Live, ohne Anmeldung:

```
/CLAUDE.md                  200   (181 KB — Chronik jeder je gefundenen Lücke)
/.pb_hooks/main.pb.js       200   (der vollständige Server-Hook)
/tools/check-pb-rules.mjs   200   (Prüfwerkzeug inkl. Soll-Regelwerk)
/CHANGELOG.md               200

$ curl -sI https://crewplanner.nyxlightwork.de/
server: nginx/1.31.3          ← das ist alles. Kein HSTS, kein CSP, kein X-Frame-Options.
```

Login, zwölf Fehlversuche in Folge: `400 400 400 400 400 400 400 400 400 400 400 400` —
keine Verzögerung, keine Sperre.

---

## Schritt 1 — Ist-Zustand melden (bitte VOR jeder Änderung)

In der Doku steht zur Live-Anwendung nur „bestehender Coolify-nginx-Container, Branch `live`".
Das reicht nicht, um die Umstellung sicher zu planen. Bitte melde:

- Welches **Build-Pack** ist eingestellt (Static / Nixpacks / Dockerfile / Docker Compose)?
- Welches **Base Directory** und welcher **Publish Directory** stehen dort?
- Wird ein eigenes nginx-Image verwendet, und liegt irgendwo eine **eigene nginx-Konfiguration**,
  die meine `nginx.conf` überschreiben oder ergänzen würde?
- Gibt es Traefik-Labels/Middlewares auf der **Frontend**-Anwendung (nicht der API), die Header
  setzen oder entfernen?

Der letzte Punkt ist nicht akademisch: Wenn Traefik bereits Header setzt, addieren sich beide
Ebenen, und bei `Strict-Transport-Security` doppelt gesetzt ignorieren manche Browser den
Header ganz.

---

## Schritt 2 — Coolify auf Dockerfile umstellen

Die Live-Anwendung (Frontend, Branch `live`) auf Build-Pack **Dockerfile** stellen. Das
`Dockerfile` liegt in der Repo-Wurzel und braucht keine Parameter.

**Was es tut — und warum es so aussieht:** Es zählt auf, was ausgeliefert werden soll, statt zu
filtern, was nicht soll. Das ist der ganze Kern des Befunds: Bisher lag alles im Netz, *weil*
niemand es aktiv herausgenommen hatte. Nach der Umstellung ist eine neue Datei im Repo
standardmäßig **nicht** öffentlich.

Ausgeliefert werden: die vier HTML-Seiten, `js/`, `assets/` (Schriften), `styles.css`,
`theme.css`, `favicon.svg`, `sw.js` und `docs/guide-admin.html` + `docs/guide-crew.html`.

⚠️ **Die beiden Anleitungen müssen mit** — der Hook verlinkt sie seit v4.11 in den Mails an die
Crew (`crewplanner.nyxlightwork.de/docs/guide-crew.html`). Fielen sie weg, liefe jeder
Anleitungs-Link in jeder künftigen Mail ins Leere.

Die `nginx.conf` bringt die Schutz-Header mit: HSTS, `nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: no-referrer`.

**Die CSP ist in diesem Schritt bewusst noch auskommentiert.** Grund: Für die
nginx-Konfiguration gibt es keine Testumgebung — Test ist GitHub Pages, dort lässt sich kein
Header erproben. Sie wird also zwangsläufig zuerst auf Live scharf, und dann soll klar sein,
woran es liegt, falls etwas bricht. Deshalb erst dieser Schritt, messen, dann die CSP.

### Danach messen

```bash
# Auslieferung zu — erwartet: überall 404
for P in /CLAUDE.md /.pb_hooks/main.pb.js /HANDOFF.md /CHANGELOG.md \
         /tools/check-pb-rules.mjs /README.md /tests/run.mjs; do
  printf "%-32s " "$P"; curl -s -o /dev/null -w "%{http_code}\n" "https://crewplanner.nyxlightwork.de$P"
done

# App unbeschädigt — erwartet: überall 200
for P in / /login.html /admin.html /view.html /js/app.js /js/dataService.js \
         /styles.css /theme.css /sw.js /favicon.svg /assets/fonts/geist-400.woff2 \
         /docs/guide-crew.html /docs/guide-admin.html; do
  printf "%-32s " "$P"; curl -s -o /dev/null -w "%{http_code}\n" "https://crewplanner.nyxlightwork.de$P"
done

# Header da — erwartet: vier Zeilen
curl -sI https://crewplanner.nyxlightwork.de/ \
  | grep -iE 'strict-transport|content-type-options|frame-options|referrer-policy'
```

Die zweite Liste ist die wichtigere. Ein 404 auf `/js/app.js` heißt: die App ist tot.

---

## Schritt 3 — CSP scharfschalten (zweiter Push)

Kommt von Marcos Seite als eigener Push; du musst dafür nichts tun außer nach dem Rebuild
mitzumessen. Die Regel:

```
default-src 'self';
connect-src 'self' https://api.crewplanner.nyxlightwork.de;
img-src 'self' data:; font-src 'self'; worker-src 'self';
script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';
frame-ancestors 'none'
```

`unsafe-inline` ist ein bewusster Kompromiss — die App lebt von `onclick=`-Handlern; eine
strenge Regel legte sie sofort lahm. Die Schutzwirkung, auf die es ankommt, steckt in
`connect-src`: Eingeschleuster Code könnte das Anmelde-Token (liegt im `localStorage`,
Befund W-4) nicht mehr an einen fremden Server schicken.

Nach dem Rebuild bitte im Browser mit offener Konsole durchklicken — Login, Tourtabelle,
Konsole, Booker-Link, ein Kunden-Logo, Kalender-Abo. Jede Verletzung erscheint dort als
`Refused to …`. Wenn etwas bricht, bitte die Konsolenzeile im Wortlaut melden; daraus ist
sofort ersichtlich, welche Direktive zu eng ist.

---

## Schritt 4 — Rate-Limiting am Login (W-3)

Traefik-Middleware `rateLimit` auf die Auth-Pfade, Weg über
`/data/coolify/proxy/dynamic/pocketbase-fix.yaml` — dieselbe Datei wie beim strip-api-Fix,
Traefik lädt sie automatisch neu.

⚠️ **Nicht drosseln: `/viewplan/`, `/viewstatus/`, `/ics/`.** Dort ist der lange Zufalls-Token
die Zugangsberechtigung, und ein Kalender-Abo fragt regelmäßig ab — eine Bremse auf `/ics/`
bräche die Abos der Crew, und zwar lautlos: In der Kalender-App fehlen dann einfach Termine.

Bitte zusätzlich prüfen, ob PocketBase v0.38 eigene Drosselung mitbringt und ob sie aktiv ist —
wenn ja, ist das die sauberere Ebene, weil sie den Endpunkt kennt statt nur den Pfad.

### Danach messen

```bash
# Login — erwartet: nicht mehr 15× 400, sondern 429 ab der Schwelle
for i in $(seq 1 15); do
  curl -s -o /dev/null -w "%{http_code} " -X POST -H 'Content-Type: application/json' \
    -d '{"identity":"nicht@vorhanden.example","password":"falsch"}' \
    https://api.crewplanner.nyxlightwork.de/api/collections/users/auth-with-password
done; echo

# Kalender-Abo — erwartet: durchgehend 200, die Route darf die Bremse NICHT abbekommen
for i in $(seq 1 12); do curl -s -o /dev/null -w "%{http_code} " \
  "https://api.crewplanner.nyxlightwork.de/ics/<TOKEN>/<PLAN-ID>"; done; echo
```

Die zweite Messung bitte nicht überspringen. Sie ist der Nachweis, dass die Bremse nur den
Login trifft.

---

## Wenn etwas schiefgeht

| Symptom | Ursache | Sofortmaßnahme |
|---|---|---|
| Seite weiß, `/js/app.js` → 404 | Datei fehlt im `Dockerfile` | `git revert` des Commits, Coolify baut in ~1–2 Min zurück |
| Anleitungs-Links in Mails tot | `docs/guide-*.html` nicht mitkopiert | dito |
| Schriften sehen falsch aus | `assets/` fehlt, Fallback auf Systemschrift | dito |
| Konsole voll `Refused to …` | CSP zu eng | CSP-Zeile auskommentieren, Push, Wortlaut melden |
| Crew meldet fehlende Kalender-Termine | Rate-Limit greift auf `/ics/` | Middleware aus der YAML nehmen |
| Login antwortet auch bei richtigem Passwort mit 429 | Schwelle zu niedrig | dito, dann höher ansetzen |

Rollback des Frontends allgemein: `git revert` bzw. `git push --force-with-lease origin <alt>:live`.
Der Hook bleibt in allen Fällen unberührt — v0.8.2 fasst weder Hook noch Zugriffsregeln an.

---

## Was danach noch offen ist

- **Die Git-Historie.** Die interne Doku ist aus dem aktuellen Repo-Stand heraus, aber alte
  Commits bleiben über GitHub abrufbar — und die Commits vor v0.8.0 enthalten die echten
  Mailadressen. Ein Umschreiben (`git filter-repo` + Force-Push) bricht jeden Klon und setzt
  `live` neu auf. Eigene Entscheidung, bewusst nicht Teil dieses Stands.
- **W-4** — Token im `localStorage`. Der Umbau auf HttpOnly-Cookies ist mit PocketBase groß und
  riskant; die CSP aus Schritt 3 ist die empfohlene Gegenmaßnahme, nicht der Umbau.
- **W-6 / Guard-Blindheit** — von rund zwölf Guards sind bisher nur einige mutationsgeprüft.
  Die acht neuen aus v0.8.2 sind es.
