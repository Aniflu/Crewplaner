# Abschluss CORS — von v4.17 bis v4.18

**Datum:** 2026-08-05
**Betrifft:** `.pb_hooks/main.pb.js` v4.17 → v4.18, `tools/check-viewlink.mjs`, `docs/security.md`
**Status:** erledigt — beide Instanzen auf **v4.18**, Repo = Server, nichts mehr offen
**Gegenstücke:** `bericht-hook-v4.17-2026-08-05.md`, `bericht-hook-v4.18-2026-08-05.md` (beide vom Admin)

---

## Kurzfassung

Der CORS-Punkt ist geschlossen. Er hat zwei Tage gebraucht, obwohl er am ersten Tag als
„liegt bereit, muss nur deployt werden" gemeldet war — weil der ausgelieferte Fix nicht
funktionierte und das niemand am Log sehen konnte.

Gefunden hat es der Server-Admin, beide Male dadurch, dass er **gemessen hat statt gelesen**.

---

## 1. Der Ausgangsbefund (richtig)

PocketBase antwortet von Haus aus **jeder** Herkunft mit `Access-Control-Allow-Origin: *`.
Das galt hier lange als Traefik-Einstellung und lag deshalb als „braucht SSH" auf der Liste —
ein Denkfehler. Der Header erscheint zusammen mit `Vary: Origin` und den PocketBase-Security-
Headern, **auch auf reinen Hook-Routen**, die der Reverse-Proxy nicht anfasst. Er stammt also
aus PocketBase und ist im Hook lösbar, ohne Server-Zugriff.

Der Befund und der Lösungsweg waren richtig. Die Umsetzung nicht.

## 2. Fehler 1 — v4.17 tat nichts

```js
routerUse(function(e) {
  e.next();                                   // ← arbeitet den Request komplett ab
  …
  e.response.header().set('Access-Control-Allow-Origin', origin);   // wirkungslos
```

`e.next()` läuft die ganze Kette durch. Sobald der Handler den Body schreibt, sind die Header
in Go raus (`WriteHeader` ist gefallen) — jedes spätere `Header().Set()` / `.Del()` verpufft.
**Kein Fehler, kein Log-Eintrag, keine Wirkung.**

Das ist **dieselbe Falle wie bei Hook v4.13**, zwei Tage nach der eigenen Dokumentation
wiederholt: Die Projektregel „`e.next()` zuerst" gilt nur für **beobachtende** Hooks
(`onRecord*Success`). Wer den Request oder die Antwort beeinflusst — abweisen wie v4.13,
Header setzen wie hier — muss **vor** `e.next()` handeln. Die Regel wurde angewendet, ohne zu
prüfen, ob sie für diesen Hook-Typ überhaupt gilt.

Der saubere Beweis des Admins war `http://localhost:8080`: Diese Herkunft steht nur in der
Hook-Positivliste, Traefik kennt sie nicht. Sie bekam trotzdem `*` — die Middleware hatte also
gar nichts gesetzt.

> **Lehre:** `v4.xx geladen` im Log beweist, dass ein Hook **lädt** — nicht, dass er **wirkt**.
> Bei Header-Änderungen müssen die Header gemessen werden.

Ohne diese Nachmessung wäre der Punkt als geschlossen abgehakt worden, während `*` weiter an
jede Herkunft ging.

## 3. Fehler 2 — die Rotationsforderung war voreilig

Im v4.17-Commit stand, der Resend-Schlüssel aus dem Git-Verlauf müsse rotiert werden.
Nachgemessen (vom Admin, nicht von mir):

- Es ist **nicht** der laufende Schlüssel — Verlauf `re_75ZvX…`, Server `re_Suse3…`.
- Der Schlüssel aus dem Verlauf ist bei Resend **bereits ungültig**
  (`GET /domains` → `400 "API key is invalid"`).
- Der aktive Schlüssel ist gültig, Domain verified, Versand läuft.

**Keine Rotation nötig.** Der Eintrag im Verlauf ist wertlos — er bleibt dort zwar für immer
lesbar, aber das ist folgenlos.

> **Lehre:** „Steht ein Secret im Verlauf?" und „Ist DIESES Secret noch gültig?" sind zwei
> Fragen. Die zweite kostet einen einzigen API-Aufruf und entscheidet, ob überhaupt etwas zu
> tun ist. Sie wurde nicht gestellt.

## 4. Die Korrektur (v4.18)

Nur Reihenfolge und Kontrollfluss, die Logik ist unverändert:

1. Header werden **vor** `e.next()` gesetzt.
2. Die drei `return`s sind raus. Sie hätten nach dem Hochziehen das abschließende `e.next()`
   übersprungen — dann würde der Request **nie abgearbeitet**, und `/viewplan`, `/viewstatus`,
   `/ics` wären als erste tot. Stattdessen eine Bedingung (`if (!oeffentlich && origin)`) und
   `return e.next()` als letzte Zeile, auf jedem Weg genau einmal.
3. Bewusst **ohne** ausgelagerte Hilfsfunktion — Goja-Scope-Isolation.

Bestätigt: PocketBases eigene CORS-Middleware läuft **vor** den `routerUse`-Hooks, ein
`set`/`del` davor gewinnt gegen ihr `*`.

**Neuer Guard `tests/cors.test.mjs`** (4 Prüfungen), mutationsgeprüft — alle drei rot:

| Mutation | Ergebnis |
|---|---|
| `e.next()` wieder nach vorne (= der echte v4.17-Fehler) | ✗ rot |
| nackter `return` statt Bedingung (Request nie abgearbeitet) | ✗ rot |
| Ausnahme für `/ics` entfernt | ✗ rot |

**132 Tests grün.**

## 5. Deploy und Gegenprobe (Admin)

Vor dem Deploy geprüft, ob das Repo-v4.18 wirklich der laufende Fix ist — statt es dem Runbook
zu glauben. Nach Normalisieren von Kommentaren und Whitespace blieb **genau eine** abweichende
Zeile: der Versionsstring. 610 Codezeilen sonst deckungsgleich.

Deploy mit zwei Gates (`grep 'v4.18 geladen'` + `sha256sum -c` in `/tmp`, erst dann ins Volume),
erst Test, dann Live.

| | |
|---|---|
| Log | `[hook] main.pb.js v4.18 geladen` (Test 19:52:41, Live 19:53:34) |
| sha256, beide Instanzen | `573d85b45ecd48f68a5a48ac68b4094a67c22fd8dad300b577684d3cf245ecd5` = GitHub `main` |
| Container | beide `healthy`, `RestartCount: 0`, keine Hook-Fehler im Log |

CORS **vor und nach** dem Deploy gemessen — genau der Punkt, an dem v4.17 durchgerutscht war:

| Herkunft (Live) | `Access-Control-Allow-Origin` |
|---|---|
| `https://crewplanner.nyxlightwork.de` (+ `www.`) | genau **ein** Header, eigene Herkunft |
| `https://aniflu.github.io` | **kein** Header |
| `https://evil.example.com` | **kein** Header |
| `http://localhost:8080` | **kein** Header (nur auf Test erlaubt) |

Test spiegelbildlich. Preflight unverändert. Öffentliche Token-Routen behalten `*` (alle drei
Live-Tokens, beide Routen, byte-gleich zur Vormittagsmessung, 0 Mailadressen im Payload).
Keine Regressionen: `plans`/`assignments` anonym `totalItems: 0`, `/myplans` ohne Token 401,
Frontend + `admin.html` + `/api/health` + Admin-UI 200. Zugriffsregeln direkt aus `data.db`
gegengeprüft — auf beiden Instanzen exakt der `check-pb-rules.mjs`-Soll-Stand.

## 6. Zwei Werkzeug-Schwächen, vom Admin gemeldet und behoben

**`check-viewlink.mjs` schreibt** — es legt für eine echte Crew-Adresse ohne Konto
vorübergehend einen `users`-Datensatz an und löscht ihn im `finally`. Das stand nirgends; im
Runbook lief es unter „und automatisiert:" wie eine reine Messung. Der Admin hat es deshalb zu
Recht nicht ungefragt gegen Live gestartet. Jetzt als Warnblock im Datei-Kopf **und** im
Runbook, samt der zwei Restrisiken: Bei hartem Abbruch (Netzabriss, `SIGKILL`) bleibt das Konto
stehen, und während des Laufs existiert in den Produktivdaten ein Konto auf den Namen einer
echten Person.

**Das Deploy-Kommando war unnötig scharf** — `curl -s -o <volume>/main.pb.js` schreibt bei
GitHub-Ausfall oder 404 die Fehlerseite in die Hook-Datei; das nachfolgende `&&` sieht nur
curls Exit-Code, der Restart läuft trotzdem, PocketBase startet mit kaputtem Hook. Ersetzt
durch `-f` + Umweg über `/tmp` + `grep`- und `sha256`-Gate vor dem Kopieren.

## 7. Stand

- Repo und beide Instanzen auf **v4.18**, sha `573d85b4…`.
- App-Version bleibt **v0.6.1** — reiner Hook-Fix, kein ausgeliefertes JS geändert, kein
  Cache-Bust nötig.
- `main` gepusht; `live` hinkt bewusst hinterher (keine Frontend-Änderung, und der Hook wird
  ohnehin von `main` gezogen).
- Der Auto-Deploy-Cron für die Hook-Datei ist weiterhin **aus** — Hook-Deploys von Hand.
- Der Hinweis „kein Deploy blind von `main`" aus dem Zwischenzustand gilt **nicht mehr**.

## 8. Was hängenbleibt

1. **Die `e.next()`-Regel ist typabhängig.** Beobachtender Hook → `e.next()` zuerst.
   Blockierender Request-Hook oder Middleware → erst handeln, dann `e.next()`. Steht jetzt im
   Code, in `CLAUDE.md` und als Guard in `tests/cors.test.mjs`.
2. **Ein Deploy ist erst verifiziert, wenn die Wirkung gemessen ist.** Nicht das Log lesen —
   den Header, den Statuscode, den Payload messen. Zweimal in Folge war das der Unterschied
   zwischen „erledigt" und „sieht erledigt aus".
3. **Behauptungen über fremde Systeme vor dem Melden prüfen.** Die Rotationsforderung, die
   Traefik-Zuschreibung und die Aussage „liegt bereit" waren alle drei Annahmen, die eine
   einzige Messung widerlegt hätte.
