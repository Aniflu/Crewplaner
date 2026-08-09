# Admin-Runbook — Hook v4.18: die CORS-Middleware wirkt jetzt wirklich

**Ersetzt `admin-runbook-hook-v4.17.md`.** Wer v4.17 schon deployt hat, hat CORS **nicht**
eingegrenzt — nur eine Middleware installiert, die nichts tut.

## Was war

v4.17 setzte die Antwort-Header **nach** `e.next()`:

```js
routerUse(function(e) {
  e.next();                                    // ← arbeitet den Request komplett ab
  …
  e.response.header().set('Access-Control-Allow-Origin', origin);   // wirkungslos
```

`e.next()` läuft die ganze Kette durch. Sobald der Handler den Body schreibt, sind die Header
in Go raus (`WriteHeader` ist gefallen) — jedes spätere `Header().Set()` / `.Del()` läuft ins
Leere. **Kein Fehler, kein Log-Eintrag, keine Wirkung.** Nach dem v4.17-Deploy auf Test:

```
2026/08/05 08:55:14 [hook] main.pb.js v4.17 geladen        ← lädt
health=healthy restarts=0                                  ← läuft
evil.example.com  → access-control-allow-origin: *         ← wirkt nicht
```

Der saubere Beweis, dass es am Hook lag und nicht an Traefik, war `http://localhost:8080`:
Diese Herkunft steht nur in der Hook-Positivliste, Traefik kennt sie nicht. Sie bekam trotzdem
`*` statt sich selbst — die Middleware hatte also gar nichts gesetzt.

> **Merke:** `v4.xx geladen` im Log beweist, dass der Hook **lädt** — nicht, dass er **wirkt**.
> Bei Header-Änderungen müssen die Header gemessen werden.

Dies ist dieselbe Falle wie bei Hook v4.13: Die Projektregel „`e.next()` zuerst" gilt nur für
**beobachtende** Hooks (`onRecord*Success`). Wer den Request oder die Antwort beeinflusst —
abweisen wie v4.13, Header setzen wie hier — muss **vor** `e.next()` handeln.

## Was v4.18 ändert

Nur Reihenfolge und Kontrollfluss, die Logik ist unverändert (Positivliste aus dem eigenen
Hostnamen, Ausnahme für die Token-Routen, alles in `try/catch`):

1. Header werden **vor** `e.next()` gesetzt.
2. Die drei `return`s sind raus. Sie hätten nach dem Hochziehen das abschließende `e.next()`
   übersprungen — dann würde der Request **nie abgearbeitet**, und `/viewplan`, `/viewstatus`,
   `/ics` wären als erste tot. Stattdessen: eine Bedingung (`if (!oeffentlich && origin)`) und
   `return e.next()` als letzte Zeile, auf jedem Weg genau einmal.
3. Bewusst **ohne** ausgelagerte Hilfsfunktion — wegen der bekannten Goja-Scope-Isolation.

Inhaltlich gilt weiterhin:

| Instanz | erlaubte Herkunft |
|---|---|
| `api.crewplanner…` | `https://crewplanner.nyxlightwork.de` (+ `www.`) |
| `api-test.crewplanner…` | `https://aniflu.github.io` (+ `localhost:8080` fürs Entwickeln) |

Alles andere bekommt **keinen** `Access-Control-Allow-Origin` mehr. **Ausnahme:** `/viewplan/…`,
`/viewstatus/…`, `/ics/…` behalten `*` — dort *ist* der Token die Zugangsberechtigung, und ein
Kalender-Abo muss von überall abrufbar sein.

## Herkunft dieses Stands

Der Fix stammt vom Admin (Bericht: `bericht-hook-v4.17-2026-08-05.md`) und lief seit dem
2026-08-05 als **`v4.17-fix`** auf beiden Instanzen — bewusst mit abweichendem Versionsstring,
damit ein sha-Vergleich gegen GitHub nicht fälschlich grün aussieht. Dieses Repo-v4.18 ist
derselbe Code mit dem Versionsstring `4.18`.

- Referenzkopie auf dem Server: `/root/backups/pb-hooks/main.pb.js.v4.17-fix`
- Rollback (= v4.16): `/root/backups/pb-hooks/main.pb.js.live.20260805-110118`

## Deploy

Nichts Besonderes — reine Hook-Datei, **kein** Schema-Schritt, keine Regeländerung, keine
Reihenfolge-Abhängigkeit zum Frontend (die Middleware betrifft nur Antwort-Header).

**Erst Test, dann Live.**

⚠️ **Nicht `curl -o` direkt ins Volume.** Ohne `-f` schreibt curl bei einem GitHub-Ausfall
oder 404 die **Fehlerseite** in die Hook-Datei, und das nachfolgende `&&` sieht nur den
Exit-Code von curl — der Restart läuft trotzdem, PocketBase startet mit kaputtem Hook. Der
Umweg über `/tmp` mit zwei Gates kostet nichts (Formulierung vom Admin, 2026-08-05):

```bash
SHA=573d85b45ecd48f68a5a48ac68b4094a67c22fd8dad300b577684d3cf245ecd5

curl -sf -o /tmp/main.pb.js.new \
  https://raw.githubusercontent.com/Aniflu/Crewplaner/main/.pb_hooks/main.pb.js
grep -q 'v4.18 geladen' /tmp/main.pb.js.new
echo "$SHA  /tmp/main.pb.js.new" | sha256sum -c -

# erst wenn BEIDE Gates durch sind:
cp /tmp/main.pb.js.new <VOLUME>/main.pb.js && docker restart <CONTAINER>
```

| | Volume / Container |
|---|---|
| LIVE | `/var/lib/docker/volumes/«PB-HOOKS-VOLUME-LIVE»/_data/` · `«PB-CONTAINER-LIVE»` |
| TEST | Volume + Container-Name beim Admin (Coolify-Service `pocketbase-test`) |

Danach im Log: `[hook] main.pb.js v4.18 geladen`. Da der laufende `v4.17-fix` inhaltlich
identisch ist, darf sich am gemessenen Verhalten **nichts** ändern — der Deploy ist die
Rückkehr in den Normalzustand (Repo = Server), nicht eine Verhaltensänderung.

## Gegenprobe (Header messen, nicht Log lesen)

```bash
for o in https://crewplanner.nyxlightwork.de https://aniflu.github.io https://evil.example.com; do
  printf '%-40s ' "$o"
  curl -s -D - -o /dev/null -H "Origin: $o" \
    https://api.crewplanner.nyxlightwork.de/api/health \
    | grep -i '^access-control-allow-origin' || echo '(kein Header)'
done
```

Erwartung auf **Live**:

| Herkunft | `Access-Control-Allow-Origin` |
|---|---|
| `https://crewplanner.nyxlightwork.de` | genau **ein** Header mit der eigenen Herkunft |
| `https://www.crewplanner.nyxlightwork.de` | eigene Herkunft |
| `https://aniflu.github.io` | **kein** Header |
| `https://evil.example.com` | **kein** Header |
| `http://localhost:8080` | **kein** Header (nur auf Test erlaubt) |

„Genau ein Header" ist der Punkt zum Hinsehen: Auf Live setzt Traefik denselben Header für die
eigene Herkunft. Zwei `Access-Control-Allow-Origin`-Header lehnt jeder Browser ab — gemessen
ist es aber nur einer, Traefiks `headers`-Middleware überschreibt statt anzuhängen.

**Preflight** (`OPTIONS` auf `/api/collections/users/auth-with-password` mit
`Access-Control-Request-Method` und `-Headers`): erlaubte Herkunft bekommt ACAO, fremde nicht;
`allow-methods` / `allow-headers` unverändert.

**Öffentliche Routen behalten `*`** — je Live-Token beide Routen prüfen:

```bash
curl -s -D - -o /dev/null -H "Origin: https://evil.example.com" \
  https://api.crewplanner.nyxlightwork.de/viewplan/<TOKEN> | grep -i access-control-allow-origin
→ access-control-allow-origin: *
```

**Und automatisiert** — beide Werkzeuge laufen bei **Marco** (sie brauchen die lokale
Superuser-Datei), nicht auf dem Server:

```bash
node tools/check-pb-rules.mjs     # nur lesend — CORS-Probe + Regeln gegen beide Instanzen
node tools/check-viewlink.mjs     # ⚠️ SCHREIBT (siehe unten) — Booker-Link Ende-zu-Ende
```

⚠️ **`check-viewlink.mjs` ist kein reiner Messlauf.** Er legt für eine echte Crew-Adresse
ohne Konto vorübergehend einen `users`-Datensatz an und löscht ihn im `finally` wieder.
Bei hartem Abbruch bleibt das Konto stehen; währenddessen existiert in den Produktivdaten
ein Konto auf den Namen einer echten Person. Gegen Live also bewusst starten — für eine
reine Deploy-Kontrolle reichen die curl-Proben oben. `--only=test` ist gefahrlos.

## Rollback

```bash
ssh «SERVER» "cp /root/backups/pb-hooks/main.pb.js.live.20260805-110118 \
  /var/lib/docker/volumes/«PB-HOOKS-VOLUME-LIVE»/_data/main.pb.js \
  && docker restart «PB-CONTAINER-LIVE»"
```

Zurück auf v4.16: CORS steht dann wieder auf `*` für alle, alles andere bleibt unverändert.
