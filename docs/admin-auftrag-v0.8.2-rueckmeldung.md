# Rückmeldung zu v0.8.2 — B und C noch nicht wirksam

**Datum:** 2026-08-13 · **Bezug:** `docs/admin-auftrag-v0.8.2.md`

Nachgemessen, nicht nur der Meldung „fertig" geglaubt — Aufgabe B und C greifen auf Live
noch nicht. Aufgabe A ist bei uns nicht angekommen (siehe unten).

---

## Aufgabe B — Coolify läuft weiterhin auf Static, nicht Dockerfile

```
$ docker exec coolify-db psql -U coolify -c "SELECT build_pack, dockerfile_location
  FROM applications WHERE uuid='od48m2ubvy7rqq55fofbqgph';"

 build_pack | dockerfile_location
------------+---------------------
 static     | /Dockerfile
```

`dockerfile_location` steht korrekt, aber das ist nur ein Textfeld. Der eigentliche
Umschalter **„Build Pack"** in den General-Settings der App steht noch auf **Static** und
wurde nicht auf **Dockerfile** umgestellt. Der laufende Container nutzt entsprechend
Coolifys generische nginx-Config (kompletter Repo-Root wird ausgeliefert), nicht das
`Dockerfile`/`nginx.conf` aus dem Repo:

```bash
$ curl -sI https://crewplanner.nyxlightwork.de/ | grep -iE 'strict-transport|frame-options'
# → keine Treffer, keine Header gesetzt

$ curl -s -o /dev/null -w "%{http_code}\n" https://crewplanner.nyxlightwork.de/.pb_hooks/main.pb.js
200   # sollte 404 sein
$ curl -s -o /dev/null -w "%{http_code}\n" https://crewplanner.nyxlightwork.de/tools/check-pb-rules.mjs
200   # sollte 404 sein
```

`/CLAUDE.md`, `/HANDOFF.md`, `/CHANGELOG.md` liefern zwar 404 — das ist aber vermutlich nur,
weil diese Dateien im aktuellen Commit nicht mehr im Repo-Root liegen, nicht weil eine
Auslieferungs-Regel greift. `.pb_hooks/` und `tools/` liegen weiter im Root und sind über
Static-Serving weiterhin voll erreichbar.

**Bitte:** In Coolify → App „Crewplaner" → Settings → General → **Build Pack** wirklich auf
„Dockerfile" umstellen (Dropdown, nicht nur das Pfad-Feld), dann redeployen.

---

## Aufgabe C — Rate-Limit-Middleware nicht auf dem Server, nur als Text im Repo

Der Commit „Traefik-rateLimit als einfügefertigen Vorschlag im Admin-Auftrag" hat den
YAML-Schnipsel offenbar nur in `docs/admin-auftrag-v0.8.2.md` eingefügt — nicht in die
tatsächliche Konfigurationsdatei auf dem Server:

```
$ cat /data/coolify/proxy/dynamic/pocketbase-fix.yaml
# enthält nur pocketbase-cors — keine rateLimit-Middleware, kein zweiter Router
```

```bash
$ for i in $(seq 1 15); do curl -s -o /dev/null -w "%{http_code} " -X POST \
  -H 'Content-Type: application/json' \
  -d '{"identity":"nicht@vorhanden.example","password":"falsch"}' \
  https://api.crewplanner.nyxlightwork.de/api/collections/users/auth-with-password; done
400 400 400 400 400 400 400 400 400 400 400 400 400 400 400   # kein einziges 429
```

**Bitte:** Den Vorschlag aus dem Auftragsdokument tatsächlich in
`/data/coolify/proxy/dynamic/pocketbase-fix.yaml` auf dem Server eintragen (Hot-Reload,
kein Neustart nötig — Datei speichern reicht). Dabei `/viewplan/`, `/viewstatus/`, `/ics/`
ausdrücklich von der Bremse ausnehmen, wie im Auftrag beschrieben.

---

## Aufgabe A — keine Rückmeldung erhalten

Falls sie schon rausgegangen ist: bitte nochmal an uns, sie ist hier nicht angekommen.

---

## Nach der echten Umsetzung bitte selbst nachmessen

Die drei Befehlsblöcke aus `docs/admin-auftrag-v0.8.2.md` (Auslieferung zu, App unbeschädigt,
Header da, Login-429) — bitte laufen lassen und **die Ausgabe mitschicken**, nicht nur
"fertig" melden. Genau das hat uns diesmal zu einem falschen Grün geführt.
