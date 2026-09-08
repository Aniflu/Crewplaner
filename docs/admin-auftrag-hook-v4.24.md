# Auftrag an den Admin — Hook v4.24 deployen (Tourname im Kalender-Titel)

**Datum:** 2026-09-08 · **Betrifft:** `.pb_hooks/main.pb.js` (v4.23 → v4.24)
**Frontend:** v0.12.0, auf Test und Live bereits ausgerollt.

---

## Kein Zeitdruck, keine Reihenfolge-Abhängigkeit

Anders als bei v4.23: Das Frontend kann ohne diesen Deploy leben. Bis der Hook draußen ist,
zeigen **Abos** den alten Titel (`Reisetag: Berlin`), die **Downloads** schon den neuen
(`Provinz 2027 · Reisetag`). Nichts bricht, es ist nur uneinheitlich.

## Was zu tun ist

Der Weg aus **`docs/admin-runbook-hook-deploy.md`** — erst nach `/tmp`, Version und sha256
prüfen, Backup, dann kopieren. Erst Test, messen, dann Live.

Danach muss im Log stehen: `[hook] main.pb.js v4.24 geladen`

## Was sich ändert — nur eine Zeile

Der sichtbare Titel jedes Kalender-Eintrags im Abo-Feed:

```
vorher:   SUMMARY:Reisetag: Berlin
nachher:  SUMMARY:Provinz 2027 · Reisetag
```

Der Ort wandert in das Feld darunter, das schon immer gesetzt war (`LOCATION:Berlin`) — die
Kalender-Apps zeigen ihn als eigene Zeile an. `PRODID` zählt auf `Feed v4.24` hoch.

**Unverändert:** `UID`, `DTSTAMP`, `DTSTART/DTEND`, `STATUS`, `X-WR-CALNAME`, die
Zugriffsprüfung über den Token, und alle anderen Routen (`/notify`, `/myplans`, `/myplan`,
`/planstatus`, `/viewplan`, `/viewstatus`) samt Mailversand.

**Für die Crew heißt das:** Bestehende Abos übernehmen den neuen Titel beim nächsten Abgleich
von selbst. Weil die `UID`s gleich bleiben, entstehen **keine** doppelten Termine, und
niemand muss neu abonnieren.

## Warum

Wer in mehreren Touren steht, sah in der Monatsansicht nur `Reisetag` und wusste nicht, zu
welcher Tour der Tag gehört. Der Tourname stand bisher nur in der Beschreibung — die man
aufklappen muss — und im Kalendernamen, den man in der Monatsansicht nicht sieht.

Der Tourname steht bewusst **vorne**: Kalender schneiden lange Titel ab, und was vorne steht,
sieht man sicher.

## Messen danach

```bash
# 1. Version im Log
ssh «SERVER» 'docker logs --tail 30 «PB-CONTAINER-LIVE» | grep "main.pb.js v"'

# 2. Der eigentliche Nachweis — <TOKEN> = users.feed_token, <PLAN-ID> = plans.id
curl -s "https://api.crewplanner.nyxlightwork.de/ics/<TOKEN>/<PLAN-ID>" > /tmp/f.ics
grep '^SUMMARY'          /tmp/f.ics   # muss mit dem Tournamen beginnen
grep -c '^LOCATION'      /tmp/f.ics   # Zahl muss …
grep -c '^BEGIN:VEVENT'  /tmp/f.ics   # … dieser hier entsprechen
grep -c '^DTSTAMP'       /tmp/f.ics   # ebenfalls (Regression aus v4.22 im Blick behalten)

# 3. Kontrollprobe: falscher Token bleibt 404
curl -s -o /dev/null -w "%{http_code}\n" \
  https://api.crewplanner.nyxlightwork.de/ics/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/x
```

Punkt 2 ist der entscheidende: Steht der Tourname nicht in `SUMMARY`, ist der Zweck verfehlt —
und `LOCATION` muss vollzählig sein, sonst hat die Crew keinen Ort mehr am Termin.

## Rollback

Das Backup aus dem Deploy zurückkopieren und den Container neu starten (siehe Runbook).
Folgenlos: Das Frontend funktioniert mit v4.23 unverändert weiter, die Abos zeigen dann
wieder den alten Titel.
