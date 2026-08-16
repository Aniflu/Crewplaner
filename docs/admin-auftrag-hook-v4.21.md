# Auftrag an den Admin — Hook v4.21 deployen

**Datum:** 2026-08-16 · **Betrifft:** `.pb_hooks/main.pb.js` (v4.20 → v4.21)
**Frontend:** v0.9.3, bereits auf Test und Live — es wartet auf diesen Hook.

Ein einziger Schritt: den Hook auf beide Instanzen ziehen und PocketBase neu starten.
Das Frontend läuft bereits, es fehlt nur die Gegenseite.

## Was sich im Hook ändert

**1. Die Update-Mail zählt keine Termine mehr auf.**
Bisher stand je Art eine Tabelle mit allen Datumsangaben darin. Bei einer 60-Tage-Tour wurde
die Mail unlesbar lang — und sie veraltet ohnehin: Wer sie zwei Tage später öffnet, liest einen
Stand von gestern. Künftig nennt sie nur noch **was** sich geändert hat („2 neue Termine",
„Ein Termin ist entfallen") und verweist auf die App.

Die Aktions-Knöpfe bleiben unverändert, insbesondere **„ÄNDERUNGEN GESEHEN ✓"** mit den `aids` —
das ist die Quittung für entfallene Termine und darf nicht wegfallen.

**2. `/planstatus/{id}` liefert zusätzlich die eigenen entfallenen Einsätze.**
Das ist die Voraussetzung für Punkt 1: Beim Aufheben nimmt der Planer den Slot aus `plan_data`,
für die Crew verschwindet der Tag damit spurlos. Der zurückbleibende Datensatz steht auf
`cancelled` und wurde von der Route ausdrücklich ausgefiltert. Ohne diese Ergänzung hätte die
Crew nach dem Kürzen der Mail **keine Möglichkeit mehr**, von einem entfallenen Tag zu erfahren.

Neu im Antwort-Objekt: `cancelled: [{ date, posId, posLabel, aid }]`.

⚠️ **Datenschutz:** Gefiltert wird auf `crew_email = {:m}`, also die Adresse des **anfragenden**
Kontos. Es kommen keine fremden Absagen und keine fremden Adressen dazu; ausgelesen wird
`crew_email` nirgends. Die Linie aus v0.8.1 („Crew sieht nur Namen") bleibt unangetastet — der
Guard in `tests/crewprivacy.test.mjs` prüft jetzt genau darauf und wurde gegengeprüft (ein
eingebautes Leck schlägt an).

## Vorgehen

Erst **Test**, messen, dann **Live** — wie immer.

Der Ablauf ist der gewohnte: Hook-Datei aus dem `main`-Branch ins jeweilige Volume ziehen und
den Container neu starten. Volume- und Container-Namen stehen bewusst **nicht** hier — sie
gehören nicht ins Repo (`tests/privacy.test.mjs` hält dagegen). Sie sind dieselben wie beim
letzten Hook-Deploy.

Quelle:
`https://raw.githubusercontent.com/Aniflu/Crewplaner/main/.pb_hooks/main.pb.js`

## Danach messen und die Ausgabe mitschicken

```bash
# 1. Hook-Version im Log — muss v4.21 sein
docker logs --tail 50 <CONTAINER> | grep 'main.pb.js v'

# 2. Route antwortet weiterhin und trägt das neue Feld
#    (mit einem gültigen Crew-Token; ohne Token muss 401 kommen)
curl -s -o /dev/null -w "%{http_code}\n" https://api.crewplanner.nyxlightwork.de/planstatus/IRGENDEINE_ID
# erwartet: 401

# 3. Gegenprobe Datenschutz: die Antwort darf KEINE Mailadresse enthalten
curl -s -H "Authorization: Bearer <CREW-TOKEN>" \
  https://api.crewplanner.nyxlightwork.de/planstatus/<PLAN-ID> | grep -c '@'
# erwartet: 0
```

Punkt 3 ist der wichtige. Bitte die Ausgabe mitschicken, nicht nur „fertig" melden.

## Danach fachlich prüfen (bei mir, nicht bei dir)

- Eine Update-Mail an ein Testkonto: kurz, mit den Knöpfen, ohne Datumsliste
- Als Crew einloggen: Popup zeigt offene Anfragen **und** entfallene Tage mit „Gesehen"
