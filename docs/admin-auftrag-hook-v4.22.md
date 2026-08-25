# Auftrag an den Admin — Hook v4.22 deployen

**Datum:** 2026-08-25 · **Betrifft:** `.pb_hooks/main.pb.js` (v4.21 → v4.22)
**Frontend:** v0.10.4, Test und Live bereits ausgerollt.

Ein einziger Schritt: den Hook auf beide Instanzen ziehen und PocketBase neu starten.
Betroffen ist **nur** die Kalender-Route `/ics/{token}/{plan}`; am Mailversand ändert sich
nichts.

## Warum

Ein Crew-Mitglied kann seinen Kalender nicht mehr abonnieren. Sein Client meldet:
**„Der Kalender konnte nicht hinzugefügt werden. Bitte überprüfen Sie die URL"** — eine
Meldung, die auf die Adresse zeigt, während der Fehler im **Inhalt** steckt.

Am Live-Feed nachgemessen: Die Route antwortet mit `200`, `text/calendar` und 33 Terminen,
Zeilenenden und Token sind in Ordnung. Aber:

```
grep -c '^BEGIN:VEVENT'  → 33
grep -c '^DTSTAMP'       → 0
```

`DTSTAMP` ist nach **RFC 5545 § 3.6.1 Pflicht in jedem VEVENT**. Es fehlte seit Einführung des
Feeds in jedem einzelnen. Wer streng prüft, verweigert daraufhin das ganze Abo. Ausgeschlossen
wurden vorher: Route nicht deployt (sie antwortet), `users.feed_token` nach einem Redeploy weg
(Feld da, alle 11 Konten haben einen Token), leerer Plan (`plan_data` beider Touren vorhanden).

## Was sich im Hook ändert

**1. `DTSTAMP` in jedem VEVENT.** Ein Zeitstempel pro Anfrage im Format `YYYYMMDDTHHMMSSZ` —
DTSTAMP meint den Zeitpunkt der Erzeugung des Eintrags, nicht den des Termins.

**2. Der Kalender heißt jetzt wie die Tour.** `X-WR-CALNAME` stand fest auf `Crewplaner`;
zusätzlich wird `NAME` gesetzt (Outlook und Google lesen eher dieses). Wer in zwei Touren
steht, bekam sonst zwei **gleichnamige** Kalender nebeneinander — manche Clients lehnen das
zweite Abo allein deswegen ab. Der Name kommt aus `plans.name`; ist der Feed leer, bleibt es
bei `Crewplaner`.

Die `UID`s bleiben unverändert. Bestehende Abos benennen sich beim nächsten Abgleich selbst
um, es entstehen **keine** doppelten Termine und niemand muss neu abonnieren.

## Vorgehen

Erst **Test**, messen, dann **Live** — wie immer. Der Ablauf ist der gewohnte: Hook-Datei aus
dem `main`-Branch ins jeweilige Volume ziehen, Container neu starten. Volume- und
Container-Namen stehen bewusst **nicht** hier (`tests/privacy.test.mjs` hält dagegen); sie sind
dieselben wie beim letzten Hook-Deploy.

Quelle:
`https://raw.githubusercontent.com/Aniflu/Crewplaner/main/.pb_hooks/main.pb.js`

## Danach messen und die Ausgabe mitschicken

```bash
# 1. Hook-Version im Log — muss v4.22 sein
docker logs --tail 50 <CONTAINER> | grep 'main.pb.js v'

# 2. Der eigentliche Nachweis. <TOKEN> = users.feed_token eines Kontos,
#    <PLAN-ID> = die zugehörige plans.id.
curl -s "https://api.crewplanner.nyxlightwork.de/ics/<TOKEN>/<PLAN-ID>" > /tmp/f.ics
grep -c '^BEGIN:VEVENT' /tmp/f.ics   # Zahl der Termine
grep -c '^DTSTAMP'      /tmp/f.ics   # MUSS dieselbe Zahl sein (vorher: 0)
grep    '^X-WR-CALNAME' /tmp/f.ics   # muss den Tournamen zeigen, nicht „Crewplaner"

# 3. Gegenprobe: ein falscher Token bleibt 404
curl -s -o /dev/null -w "%{http_code}\n" \
  https://api.crewplanner.nyxlightwork.de/ics/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/x
# erwartet: 404
```

Punkt 2 ist der entscheidende: Solange `DTSTAMP` nicht der Zahl der Termine entspricht, ist der
Fehler nicht behoben. Bitte die Ausgabe mitschicken, nicht nur „fertig" melden.

## Danach fachlich prüfen (bei mir, nicht bei dir)

- Auf einem echten Gerät den `webcal://`-Link antippen: Der Kalender muss sich anlegen lassen
  und **unter dem Tournamen** erscheinen.
- Ein Konto mit **zwei** Touren: beide Abos nebeneinander, mit unterschiedlichen Namen.
