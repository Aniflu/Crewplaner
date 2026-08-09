# Admin-Runbook — Hook v4.17: CORS eingrenzen (löst den letzten offenen Punkt)

> ⛔ **ÜBERHOLT — nicht mehr nach dieser Anleitung deployen.**
> Der hier beschriebene Hook **wirkt nicht**: v4.17 setzte die Header nach `e.next()`, zu diesem
> Zeitpunkt ist die Antwort längst geschrieben. Er lädt, läuft, meldet `v4.17 geladen` — und
> ändert keinen einzigen Header (Admin-Messung 2026-08-05).
> **→ `admin-runbook-hook-v4.18.md`.** Die Begründung unten (das `*` kommt aus PocketBase, nicht
> aus Traefik) bleibt richtig und ist weiterhin lesenswert.

## Warum — und warum es doch KEIN SSH braucht

Der CORS-Punkt stand tagelang als „braucht Zugriff auf die Traefik-Datei" auf der Liste. **Das
war falsch gedacht.** Nachgemessen am 2026-08-05:

```
curl -s -D - -o /dev/null -H "Origin: https://evil.example.com" https://api.crewplanner.nyxlightwork.de/api/health
→ access-control-allow-origin: *
   vary: Origin
   x-content-type-options / x-frame-options / x-xss-protection
```

Der `*`-Header kommt **zusammen mit `Vary: Origin` und den PocketBase-Security-Headern** — und
er erscheint auch auf `/myplans`, einer reinen Hook-Route, die der Reverse-Proxy nicht anfasst.
Das `*` stammt also **aus PocketBase selbst**, nicht aus Traefik. Traefik überschreibt es nur
für die eine dort konfigurierte Herkunft.

Damit ist es im Hook lösbar — kein Server-Zugriff nötig.

## Was v4.17 tut

Eine `routerUse`-Middleware setzt den Header nach einer Positivliste, die sich **aus dem eigenen
Hostnamen** ergibt (keine Umgebungsvariable, keine zwei Hook-Dateien):

| Instanz | erlaubte Herkunft |
|---|---|
| `api.crewplanner…` | `https://crewplanner.nyxlightwork.de` (+ `www.`) |
| `api-test.crewplanner…` | `https://aniflu.github.io` (+ `localhost:8080` fürs Entwickeln) |

Alles andere bekommt **keinen** `Access-Control-Allow-Origin`-Header mehr → der Browser
verweigert fremden Seiten das Auslesen.

**Bewusste Ausnahme:** `/viewplan/…`, `/viewstatus/…` und `/ics/…` behalten `*`. Das sind die
token-geschützten öffentlichen Routen — dort *ist* der Token die Zugangsberechtigung, und ein
Kalender-Abo oder eine eingebettete Ansicht muss von überall abrufbar sein.

Die Middleware ist komplett in `try/catch` gekapselt: Sollte die JSVM-Header-API abweichen,
schlägt kein einziger Request fehl — es bleibt beim bisherigen Verhalten und im Log steht
`[hook] CORS-Middleware: …`.

---

## Deploy (Test zuerst)

```bash
ssh «SERVER» "curl -s -o /tmp/main.pb.js \
  https://raw.githubusercontent.com/Aniflu/Crewplaner/main/.pb_hooks/main.pb.js \
  && grep -q 'v4.17 geladen' /tmp/main.pb.js \
  && cp <HOOKS-PFAD>/main.pb.js /root/backups/pb-hooks/main.pb.js.\$(date +%s) \
  && cp /tmp/main.pb.js <HOOKS-PFAD>/main.pb.js \
  && docker restart <CONTAINER>"
```

**Prüfen:** Log zeigt `[hook] main.pb.js v4.17 geladen` — und **kein** `CORS-Middleware:`-Fehler.

## Gegenprobe

```bash
# fremde Herkunft → darf KEINEN Header bekommen (erwartet: leer)
curl -s -D - -o /dev/null -H "Origin: https://evil.example.com" \
  https://api-test.crewplanner.nyxlightwork.de/api/health | grep -i access-control-allow-origin

# eigenes Frontend → muss freigegeben sein
curl -s -D - -o /dev/null -H "Origin: https://aniflu.github.io" \
  https://api-test.crewplanner.nyxlightwork.de/api/health | grep -i access-control-allow-origin

# öffentliche Token-Route → bleibt absichtlich offen (erwartet: *)
curl -s -D - -o /dev/null -H "Origin: https://evil.example.com" \
  https://api-test.crewplanner.nyxlightwork.de/viewplan/<TOKEN> | grep -i access-control-allow-origin
```

**Und der eigentliche Test:** Die Testseite muss weiterhin funktionieren — einloggen, Tour
laden, keine CORS-Fehler in der Browser-Konsole. Danach dasselbe auf Live.

Marco prüft es zusätzlich automatisch mit:

```bash
node tools/check-pb-rules.mjs
```

Das Werkzeug hat seit heute eine eigene CORS-Probe (eigene Herkunft freigegeben / fremde nicht)
und meldet gegen den aktuellen Stand korrekt **rot**, solange v4.17 nicht läuft.

## Rollback

Backup aus dem Deploy-Befehl zurückkopieren + `docker restart`. Der Log muss danach
`v4.16 geladen` zeigen. Danach ist wieder alles wie vorher — inklusive des `*`.

## Danach

Damit ist **kein Punkt mehr offen.** Die Traefik-Datei muss für CORS nicht angefasst werden;
das ältere `docs/admin-runbook-cors.md` ist damit gegenstandslos.
