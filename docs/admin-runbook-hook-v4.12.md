# Admin-Runbook — Hook v4.12 deployen (v0.5.0)

> ✅ **Erledigt am 2026-08-03** — Hook v4.12 ist auf beiden Backends deployt. Dieses Dokument bleibt als Verlauf stehen.

**Was v4.12 bringt** (zu v0.5.0 „Status am Stück umstellen"):

1. **Kalender-Feed**: vorgemerkte Einsätze (`status = "pencilled"`) bleiben jetzt im
   abonnierbaren Feed. Vorher fielen sie raus und verschwanden **lautlos** aus dem Kalender
   der betroffenen Person. Jeder Termin trägt seinen Stand im Infofeld:
   `Status: Bestätigt | Angefragt | Vorgemerkt`.
2. **Update-Mail**: zwei neue Abschnitte für Statuswechsel — „✎ Jetzt vorgemerkt" bzw.
   „✓ Wieder verbindlich bestätigt". Ohne Aktions-Button, die Crew muss nichts tun.

**Rückwärtskompatibel** — kein Schema-Schritt, keine Datenmigration. Bis zum Deploy läuft die
App vollständig; nur Mail-Wortlaut und Kalender-Status hinken hinterher.

**Reihenfolge: erst Test, prüfen, dann Live.**

---

## Schritt 1 — Test-Backend

Container-Name und Hooks-Volume-Pfad der Test-PB einsetzen (Coolify-Service `pocketbase-test`,
`jl1phsvsusxnqzah6ip20qlc`):

```bash
ssh hetzner "curl -s -o <TEST-HOOKS-PFAD>/main.pb.js \
  https://raw.githubusercontent.com/Aniflu/Crewplaner/main/.pb_hooks/main.pb.js \
  && docker restart <TEST-CONTAINER>"
```

**Prüfen:**

```bash
ssh hetzner "docker logs <TEST-CONTAINER> --tail 20 | grep 'v4.12 geladen'"
ssh hetzner "curl -s -o /dev/null -w '%{http_code}\n' https://api-test.crewplanner.nyxlightwork.de/api/health"
```

Erwartet: `[hook] main.pb.js v4.12 geladen` und `200`.

## Schritt 2 — Kalender-Feed gegenprüfen (Test)

Mit einem Feed-Token + einer Plan-ID aus der Test-DB:

```bash
ssh hetzner "curl -s https://api-test.crewplanner.nyxlightwork.de/ics/<TOKEN>/<PLAN-ID> | grep -E 'STATUS:|Status:'"
```

Erwartet: Zeilen `STATUS:CONFIRMED` bzw. `STATUS:TENTATIVE` und im Infofeld
`Status: Bestätigt` / `Status: Vorgemerkt`.

Marco stellt in der Testumgebung einen Termin auf „vorgemerkt" um; beim nächsten Abruf muss
**derselbe** Termin (keine Dublette) auf `Status: Vorgemerkt` wechseln — die UID bleibt
absichtlich gleich, damit Kalender-Apps ersetzen statt anzulegen.

## Schritt 3 — Live-Backend

Erst nachdem Schritt 1+2 sauber sind:

```bash
ssh hetzner "curl -s -o /var/lib/docker/volumes/ad9adhhkygjreidi79i4v5eb_pocketbase-hooks/_data/main.pb.js \
  https://raw.githubusercontent.com/Aniflu/Crewplaner/main/.pb_hooks/main.pb.js \
  && docker restart pocketbase-ad9adhhkygjreidi79i4v5eb"
```

**Prüfen:**

```bash
ssh hetzner "docker logs pocketbase-ad9adhhkygjreidi79i4v5eb --tail 20 | grep 'v4.12 geladen'"
ssh hetzner "curl -s -o /dev/null -w '%{http_code}\n' https://api.crewplanner.nyxlightwork.de/api/health"
```

> Der Container-Neustart verursacht einen kurzen API-Blip (Sekunden) — am besten in einem
> ruhigen Moment.

## Rollback

Die Vorgängerversion aus dem Git-Verlauf zurückholen und neu starten:

```bash
ssh hetzner "curl -s -o <HOOKS-PFAD>/main.pb.js \
  https://raw.githubusercontent.com/Aniflu/Crewplaner/58dc113/.pb_hooks/main.pb.js \
  && docker restart <CONTAINER>"
```

(`58dc113` = letzter Commit mit Hook v4.11.) Log muss danach `v4.11 geladen` zeigen.
