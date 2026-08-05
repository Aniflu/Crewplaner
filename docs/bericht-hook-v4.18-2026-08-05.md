# Bericht an Marco — Hook v4.18 ist auf beiden Instanzen, Sonderzustand aufgelöst

**Datum:** 2026-08-05 (abends)
**Betrifft:** `docs/admin-runbook-hook-v4.18.md`, `.pb_hooks/main.pb.js` v4.18
**Status auf dem Server:** Live **und** Test laufen auf **`v4.18`**, identisch mit GitHub `main`
**Vorgänger:** `bericht-hook-v4.17-2026-08-05.md` — Punkt 6 daraus ist damit erledigt

---

## Kurzfassung

Dein v4.18 ist eingespielt. Der Drift zwischen Server (`v4.17-fix`) und Repo (`v4.17`) ist weg,
Repo = Server, ein Deploy von `main` ist wieder gefahrlos.

Vorher habe ich geprüft, ob dein v4.18 **wirklich** der laufende Fix ist — statt es dem Runbook zu
glauben. Ergebnis: ja, bis auf den Versionsstring Zeichen für Zeichen. Das war kein Misstrauen sondern
Notwendigkeit: hätte sich beim Übertragen etwas verschoben, hätte der Deploy den Fix stillschweigend
zurückgenommen, und CORS wäre wieder offen gewesen — ohne dass irgendein Log das gezeigt hätte.

Am gemessenen Verhalten hat sich erwartungsgemäß **nichts** geändert. Genau das war das Ziel.

---

## 1. Prüfung vor dem Deploy: ist v4.18 wirklich v4.17-fix?

Der rohe `diff` sah zunächst nach mehr aus als erwartet — du hast im CORS-Block die Einrückung
mitgezogen (in meiner Fassung standen die Zeilen innerhalb von `if (!oeffentlich && origin)` noch
auf der alten Ebene). Optisch also ein Block von ~15 geänderten Zeilen.

Nach Entfernen von Kommentar- und Leerzeilen und Normalisieren der Whitespace bleibt übrig:

```
1c1
< console.log('[hook] main.pb.js v4.17-fix geladen');
---
> console.log('[hook] main.pb.js v4.18 geladen');
```

**Eine Zeile.** 610 Code-Zeilen auf beiden Seiten, sonst deckungsgleich. Der Kontrollfluss ist
unverändert: Header vor `e.next()`, kein `return` innerhalb des Blocks, `return e.next()` als
einzige letzte Zeile. Deine Kommentare zur Reihenfolge und zur Falle mit den drei `return`s sind
zusätzlich drin — gut, dass das jetzt im Code steht und nicht nur im Runbook.

## 2. Deploy

Erst Test, dann Live. Abweichend vom Runbook-Kommando **nicht** `curl -o` direkt ins Volume,
sondern: nach `/tmp` laden → `grep 'v4.18 geladen'` → `sha256sum -c` gegen den GitHub-Hash → erst
dann kopieren und neu starten. Beide Gates mussten passieren, bevor die Datei das Volume gesehen hat.

| | |
|---|---|
| Version im Log | `[hook] main.pb.js v4.18 geladen` (Test 19:52:41, Live 19:53:34) |
| sha256 im Volume, **beide** Instanzen | `573d85b45ecd48f68a5a48ac68b4094a67c22fd8dad300b577684d3cf245ecd5` |
| = sha256 GitHub `main` | ✅ identisch |
| Container | beide `healthy`, `RestartCount: 0` |
| Fehler im Log | keine, insbesondere kein `[hook] CORS-Middleware:` |
| Backup vorher (Test) | `/root/backups/pb-hooks/main.pb.js.test.20260805-215241` |
| Backup vorher (Live) | `/root/backups/pb-hooks/main.pb.js.live.20260805-215333` |
| Rollback auf v4.16 | `/root/backups/pb-hooks/main.pb.js.live.20260805-110118` |

Die beiden neuen Backups sind inhaltlich `v4.17-fix`, also identisch mit dem jetzt laufenden Stand —
ein Rollback dorthin wäre wirkungslos. Wer wirklich zurück will, nimmt die v4.16-Datei.

## 3. Gegenprobe — vor **und** nach dem Deploy gemessen

Das ist der Punkt, an dem v4.17 durchgerutscht ist, deshalb diesmal beides: eine Baseline vor dem
Anfassen, dieselbe Messung danach.

**Live** (`api.crewplanner.nyxlightwork.de/api/health`)

| Herkunft | vorher | nachher |
|---|---|---|
| `https://crewplanner.nyxlightwork.de` | genau **ein** Header, eigene Herkunft | unverändert |
| `https://www.crewplanner.nyxlightwork.de` | eigene Herkunft | unverändert |
| `https://aniflu.github.io` | **kein** Header | unverändert |
| `https://evil.example.com` | **kein** Header | unverändert |
| `http://localhost:8080` | **kein** Header | unverändert |

**Test** (`api-test.crewplanner…`) spiegelbildlich: `aniflu.github.io`, `localhost:8080` und
`127.0.0.1:8080` bekommen jeweils ihre eigene Herkunft zurück, die Live-Herkunft und
`evil.example.com` bekommen **keinen** Header.

**Preflight** (`OPTIONS` auf `/api/collections/users/auth-with-password` mit
`Access-Control-Request-Method` + `-Headers`): erlaubte Herkunft mit ACAO, fremde ohne;
`allow-methods` = `GET,POST,PUT,DELETE,OPTIONS,PATCH`, `allow-headers` =
`Content-Type,Authorization,Accept` — unverändert.

**Öffentliche Token-Routen behalten `*`** — alle drei Live-Tokens, beide Routen, jeweils mit
`Origin: https://evil.example.com`:

```
Token 1  viewplan   200 | * |  9749 Bytes | 0 @-Treffer
Token 1  viewstatus 200 | * | 20329 Bytes | 0 @-Treffer
Token 2  viewplan   200 | * |  8639 Bytes | 0 @-Treffer
Token 2  viewstatus 200 | * | 17090 Bytes | 0 @-Treffer
Token 3  viewplan   200 | * |  5963 Bytes | 0 @-Treffer
Token 3  viewstatus 200 | * | 11457 Bytes | 0 @-Treffer
```

Byte-Zahlen identisch mit der Messung von heute Vormittag — die Antworten sind also nicht nur
„auch 200", sondern inhaltlich derselbe Stand. Erfundener Token → 404.

**Keine Regressionen:** `plans` und `assignments` anonym `totalItems: 0`, `/myplans` ohne Token 401,
Frontend + `admin.html` + `/api/health` + Admin-UI `/_/` → 200, auf beiden Instanzen.

**Zugriffsregeln gegengeprüft** (direkt aus `data.db`, damit der Hook-Deploy nicht unbemerkt etwas
mitverschoben hat) — auf **beiden** Instanzen identisch:

| Collection | list | view | create |
|---|---|---|---|
| `plans` | `@request.auth.id = owner \|\| @request.auth.role = "superadmin"` | dito | `@request.auth.id != ""` |
| `assignments` | `@request.auth.id != ""` | dito | dito |
| `users` | `@request.auth.role = "superadmin"` | `… \|\| @request.auth.id = id` | `@collection.crew_members.email ?= email` |

Das ist exakt der Soll-Stand, den `check-pb-rules.mjs` erwartet (`PLANS_RULE`).

## 4. Zwei Anmerkungen zu deinen Werkzeugen

**`check-viewlink.mjs` ist ein schreibender Lauf** — das ist sauber gebaut, aber man sollte es
wissen, bevor man es gegen Live startet. Es legt für eine echte Crew-Mailadresse ohne Konto
vorübergehend einen User an, meldet sich damit an und löscht ihn im `finally` wieder; bestehende
Konten fasst es bewusst nicht an. Zwei Restpunkte: bei einem harten Abbruch (Netzabriss,
`SIGKILL`) kommt das `finally` nicht mehr durch und das Konto bleibt stehen, und für die Dauer des
Laufs existiert in den Produktivdaten ein Konto auf den Namen einer echten Person. Ich habe es
deshalb nicht ungefragt gegen Live laufen lassen — die beiden Prüfziele sind oben direkt abgedeckt
(Booker-Link über alle drei Tokens, Regeln aus der DB). Ein Hinweis im Datei-Kopf, dass der Lauf
schreibt, wäre hilfreich; im Runbook steht er unter „und automatisiert:" wie eine reine Messung.

Beide Werkzeuge brauchen außerdem deine lokale Superuser-Datei
(`~/.claude/projects/…/pb-admin.local.json`). Vom Server aus sind sie damit nicht nutzbar — sie
laufen bei dir, nicht bei mir.

**Das Deploy-Kommando im Runbook ist unnötig scharf.** `curl -s -o <volume>/main.pb.js …` schreibt
bei einem GitHub-Ausfall oder 404 die **Fehlerseite** in die Hook-Datei, und das nachfolgende `&&`
sieht nur curls Exit-Code — der Restart läuft trotzdem, PocketBase startet mit kaputtem Hook. Ein
`-f` und ein Zwischenschritt über `/tmp` kosten nichts:

```bash
curl -sf -o /tmp/main.pb.js.new https://raw.githubusercontent.com/Aniflu/Crewplaner/main/.pb_hooks/main.pb.js
grep -q 'v4.18 geladen' /tmp/main.pb.js.new
echo "<sha256>  /tmp/main.pb.js.new" | sha256sum -c -
cp /tmp/main.pb.js.new <volume>/main.pb.js && docker restart <container>
```

## 5. Stand jetzt

- Repo und beide Instanzen sind auf **v4.18**, sha `573d85b4…`.
- Der Sonderzustand aus dem letzten Bericht ist aufgelöst; der Hinweis „kein Deploy blind von `main`"
  gilt nicht mehr.
- Der Auto-Deploy-Cron für die Hook-Datei ist weiterhin **aus** (letzter Lauf 16.05.), Hook-Deploys
  passieren also weiterhin nur von Hand.

Von meiner Seite ist zu diesem Punkt nichts mehr offen.
