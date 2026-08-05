# Befund: `plans.listRule` machte Pläne + `view_token` öffentlich

> ✅ **Behoben in v0.6.0/v0.6.1** — Hook-Routen statt offener Collection, Regel final auf `owner || superadmin`, Tokens neu vergeben. Dieses Dokument bleibt als Verlauf stehen.

**Datum:** 2026-08-04 · **Gefunden vom:** Server-Admin, beim Gegenprüfen der Annahme
„der geheime `view_token` IST die Auth" nach dem Deploy von Hook v4.14
**Betroffen:** Live und Test gleichermaßen · **Verursacht durch v4.14?** Nein, vorbestehend
**Status:** app-seitig behoben in **v0.6.0** (Hook v4.15 + neue Regel)

---

## Kurzfassung

`plans.listRule` lautete:

```
@request.auth.id = owner || @request.auth.role = "superadmin" || view_token != ""
```

Der dritte Zweig trifft auf **jeden** Plan zu, der einen Token hat. Eine PocketBase-Regel
filtert pro Datensatz und kann den Token aus dem Request nicht an *einen* Datensatz binden —
sie gab also nicht „den Plan zum Token" frei, sondern **alle**.

Folge: Die `plans`-Collection war ohne Anmeldung auflistbar, **inklusive `view_token` im
Klartext**. Die Tokens waren damit nicht geheim, sondern in einem einzigen Request aufzählbar;
`/viewstatus/{token}` aus v4.14 war faktisch eine öffentliche Route.

## Was offen lag

Anonym, ohne jeden Header, alle 3 Pläne vollständig: `name`, `owner`, `plan_data`
(Crew-Klarnamen, 61/59/33 Tourtage, Positionen), `view_shorturl`, `view_token`.

## Was NICHT betroffen war (zuerst, weil es die naheliegende Sorge ist)

- **Keine E-Mail-Adressen** — 0 `@`-Treffer im gesamten anonymen Payload.
- **`assignments` war wirksam zu.** Anonymer Abruf liefert `totalItems: 0`. Der HTTP-**200**
  dabei ist kein Leck, sondern PocketBases normales Verhalten bei einer *Filter*-Regel — nur
  eine `null`-Regel antwortet mit 403. **Nicht am Statuscode festmachen, sondern an
  `totalItems`.** (Wichtige Korrektur an unserer eigenen Prüfmethodik.)
- **Der Fix vom 2026-08-03 hielt** — die 913 Einsätze inkl. Crew-Adressen blieben gesperrt.
- **`plan_data.assignments` ist keine Hintertür dorthin:** enthält nur Namen
  (`{"gl":"Marco Hoch"}`), keine Adressen.
- **v4.14 gab nichts Zusätzliches preis** — nur `status` + `crew_name`, und die Namen standen
  ohnehin im öffentlichen `plan_data.crew`.

## Reproduktion (vor dem Fix)

```bash
curl -s ".../api/collections/plans/records?perPage=50" | grep -o '"view_token":"[a-f0-9]*"'
curl -s ".../api/collections/plans/records?perPage=50" | grep -c '@'      # erwartet 0
curl -s ".../api/collections/assignments/records?perPage=1"               # totalItems 0
```

## Warum die Regel so aussah

Sie war tragend, nicht versehentlich: `view.html` musste den Plan zum Token laden können, ohne
dass jemand angemeldet ist. `view_token != ""` war der kürzeste Weg dahin.

Das ist **dieselbe Fehlerklasse wie die leere `assignments.listRule` am 3. August**: Eine
öffentliche Ansicht liest direkt aus einer Collection, und die Regel wird so weit geöffnet, bis
das geht. Beide Male war die Lösung, den Zugriff über eine Hook-Route zu führen, die genau das
herausgibt, was die Ansicht braucht — und dann die Regel zu schließen.

## Behebung (v0.6.0)

1. **Hook v4.15** — neue Route `GET /viewplan/{token}`: löst den Plan über den Token auf und
   liefert **nur** `name` + `plan_data`. Ohne `view_token`, ohne `owner`, ohne `view_shorturl`.
2. **`view-app.js`** nutzt diese Route statt der `plans`-REST-API.
3. **Neue Regel** (list + view):
   ```
   @request.auth.id = owner || @request.auth.role = "superadmin"
     || (@collection.crew_members.plan_id ?= id && @collection.crew_members.email ?= @request.auth.email)
   ```

### Korrektur am ursprünglichen Fix-Vorschlag

Vorgeschlagen war `@request.auth.id = owner || @request.auth.role = "superadmin"`. Das hätte
**jedes Crew-Mitglied ausgesperrt**: `loadPlanForCrew` und `loadCrewPlans` (dataService.js)
holen den Plan per `pbGet`; Crew ist weder Owner noch superadmin und kam bis dahin
ausschließlich über den `view_token`-Zweig durch. Deshalb der dritte Zweig oben.

### Erprobt, nicht angenommen

Ob PocketBase beide `@collection`-Bedingungen an **denselben** crew_members-Datensatz bindet,
war offen. Auf der Testinstanz mit einem echten Crew-Konto geprüft
(`thomas.haine@gmx.de`, ausschließlich Crew in AMK Tour 2026):

| Prüfung | Ergebnis |
|---|---|
| eigene Tour lesen | `200` ✓ |
| fremde Tour (Provinz 2027) | `404` ✓ |
| fremde Tour (AMK 2027) | `404` ✓ |
| auflisten als Crew | `totalItems: 1` — nur die eigene ✓ |
| anonym auflisten | `totalItems: 0` ✓ |

PocketBase bindet also korrekt. Regel und Testkonto wurden danach wieder zurückgesetzt, weil
die Regel erst **nach** dem Deploy von v4.15 scharf werden darf.

## Reihenfolge beim Scharfschalten

**Erst Route + Frontend, dann die Regel.** Andersherum bricht die öffentliche Ansicht sofort.
(Am 3. August lag die Falle genau umgekehrt: Regel zuerst geschlossen → Ansicht verlor ihre
Status-Farben.)

`/viewstatus` und `/ics` laufen unverändert weiter — Hook-Routen fragen über
`$app.findFirstRecordByFilter(...)` auf DAO-Ebene ab, API-Regeln greifen dort nicht.

## Tokens

Die drei `view_token` standen offen im Netz; wie lange, lässt sich nicht sagen. Sie werden
nach dem Umbau neu vergeben — zusammen mit `view_shorturl: ""`, sonst erzeugt der Kurzlink-Hook
keinen neuen Link (er steigt aus, wenn schon eine is.gd-URL vorhanden ist) und der alte
Kurzlink zeigte auf einen toten Token. **Folge:** bereits verschickte Booker-Links werden
ungültig.

## Dank

Der Fund geht auf den Server-Admin zurück, der beim Deploy nicht nur das Runbook abgearbeitet,
sondern die zugrunde liegende Sicherheitsannahme selbst nachgeprüft hat — inklusive des
Hinweises, dass HTTP-Statuscodes bei PocketBase-Filterregeln kein taugliches Prüfkriterium sind.
