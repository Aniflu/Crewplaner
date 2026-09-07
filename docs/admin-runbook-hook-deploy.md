# Runbook — Hook deployen (`.pb_hooks/main.pb.js`)

Der verbindliche Weg. Die älteren Runbooks (`golive`, `registrierungs-sperre`, `umzug`,
`umzug-zwei-umgebungen`) zeigten einen Einzeiler, der **so nicht mehr benutzt werden soll** —
warum, steht unten.

> Alle `«…»` sind Platzhalter — die echten Werte stehen in `.claude.local.md`, nicht im
> Repo. Das Repo ist öffentlich; `tests/privacy.test.mjs` hält dagegen und wird rot,
> sobald eine Server-Kennung hier landet (genau das ist beim Schreiben passiert).

---

## ⚠️ Warum nicht `curl -o` direkt ins Volume

Der alte Einzeiler lautete sinngemäß:

```bash
ssh «SERVER» "curl -s -o <VOLUME>/main.pb.js <URL> && docker restart <CONTAINER>"
```

Zwei Fehler, vom Admin beim v4.23-Deploy benannt:

1. **`curl -s` ohne `-f` schreibt auch eine Fehlerseite in die Datei.** Antwortet GitHub mit
   404 oder einer Wartungsseite, landet HTML in `main.pb.js`.
2. **`&&` prüft nur curls Exit-Code, nicht den Inhalt.** Der Restart läuft dann trotzdem — mit
   kaputtem Hook. Und weil direkt ins Volume geschrieben wurde, ist die alte Fassung schon weg.

Ergebnis wäre eine PocketBase-Instanz ohne funktionierende Hooks: kein Mailversand, kein
Kalender-Feed, keine `/myplans`-Route — also auch keine App für die Crew.

## Der richtige Weg: erst nach `/tmp`, prüfen, sichern, dann kopieren

Nichts wird überschrieben, bevor die neue Datei geprüft ist. Vor dem Kopieren geht die alte
Fassung ins Backup. `set -e` bricht bei jedem Fehlschlag ab.

**Test** (ermittelt Volume und Container selbst, bricht ab, wenn sie nicht eindeutig sind):

```bash
ssh «SERVER» 'set -e
URL=https://raw.githubusercontent.com/Aniflu/Crewplaner/main/.pb_hooks/main.pb.js
V=$(docker volume ls --format "{{.Name}}" | grep -i pocketbase-hooks | grep -v "«PB-HOOKS-VOLUME-LIVE»")
C=$(docker ps --format "{{.Names}}" | grep -i pocketbase | grep -v "«PB-CONTAINER-LIVE»")
{ [ -n "$V" ] && [ "$(echo "$V" | wc -l)" -eq 1 ]; } || { echo "ABBRUCH — Volume nicht eindeutig:"; echo "$V"; exit 1; }
{ [ -n "$C" ] && [ "$(echo "$C" | wc -l)" -eq 1 ]; } || { echo "ABBRUCH — Container nicht eindeutig:"; echo "$C"; exit 1; }
echo "Volume: $V · Container: $C"
curl -fsSL "$URL" -o /tmp/main.pb.js
grep -m1 "^// Version:" /tmp/main.pb.js
grep -q "^routerAdd" /tmp/main.pb.js || { echo "ABBRUCH — das ist keine Hook-Datei"; exit 1; }
sha256sum /tmp/main.pb.js
mkdir -p /root/backups/pb-hooks
cp "/var/lib/docker/volumes/$V/_data/main.pb.js" "/root/backups/pb-hooks/main.pb.js.test.$(date +%Y%m%d-%H%M%S)"
cp /tmp/main.pb.js "/var/lib/docker/volumes/$V/_data/main.pb.js"
docker restart "$C"'
```

**Live:**

```bash
ssh «SERVER» 'set -e
URL=https://raw.githubusercontent.com/Aniflu/Crewplaner/main/.pb_hooks/main.pb.js
VOL=/var/lib/docker/volumes/«PB-HOOKS-VOLUME-LIVE»/_data
curl -fsSL "$URL" -o /tmp/main.pb.js
grep -m1 "^// Version:" /tmp/main.pb.js
grep -q "^routerAdd" /tmp/main.pb.js || { echo "ABBRUCH — das ist keine Hook-Datei"; exit 1; }
sha256sum /tmp/main.pb.js
mkdir -p /root/backups/pb-hooks
cp "$VOL/main.pb.js" "/root/backups/pb-hooks/main.pb.js.live.$(date +%Y%m%d-%H%M%S)"
cp /tmp/main.pb.js "$VOL/main.pb.js"
docker restart «PB-CONTAINER-LIVE»'
```

Die Platzhalter in `«…»` stehen in `.claude.local.md` (nicht im Repo — `tests/privacy.test.mjs`
hält dagegen).

**Reihenfolge:** immer erst Test, messen, dann Live.

## Danach messen — und zwar mit Kontrollprobe

Ein Statuscode allein beweist nichts. Neben der neuen Route immer eine **erfundene** URL
mitmessen: Ändert sich die neue von 404 auf etwas anderes, während die Kontrolle 404 bleibt,
ist die Route wirklich neu da.

```bash
# Version im Log
ssh «SERVER» 'docker logs --tail 30 «PB-CONTAINER-LIVE» | grep "main.pb.js v"'

# Neue Route + Kontrolle
curl -s -o /dev/null -w "neu:       %{http_code}\n" -X POST https://api.crewplanner.nyxlightwork.de/notify
curl -s -o /dev/null -w "kontrolle: %{http_code}\n" -X POST https://api.crewplanner.nyxlightwork.de/gibtsnicht123

# Keine Regression
curl -s -o /dev/null -w "health:    %{http_code}\n" https://api.crewplanner.nyxlightwork.de/api/health
```

## „Geladen" ist nicht „gewirkt"

Der wichtigste Satz aus zwei Vorfällen (v4.17 und v4.22): Dass der Hook geladen ist und eine
Route antwortet, heißt **nicht**, dass der geprüfte Pfad je durchlaufen wurde. Ein 401 belegt
nur, dass die Route existiert und den Zugriff prüft.

Der Erfolgspfad braucht einen echten Aufruf mit gültigem Token — und auf **Test** ein Konto,
dessen Daten zu den vorhandenen Datensätzen passen: Die Test-DB hat viele `assignments`, aber
einen einzigen `users`-Datensatz, der zu keinem davon gehört. Eine grüne Messung dort kann
deshalb heißen, dass gar nichts gemessen wurde.

## Rollback

Die Backups aus dem Deploy liegen unter `/root/backups/pb-hooks/`:

```bash
ssh «SERVER» 'cp /root/backups/pb-hooks/main.pb.js.live.<ZEITSTEMPEL> \
  /var/lib/docker/volumes/«PB-HOOKS-VOLUME-LIVE»/_data/main.pb.js \
  && docker restart «PB-CONTAINER-LIVE»'
```

## Nach jedem Deploy

Die Hook-Version in der Übersicht nachziehen. Beim v4.22-Deploy unterblieb das — die Doku
nannte noch v4.21, während längst v4.22 lief. Wer dann einen Fehler sucht, sucht am falschen
Stand.
