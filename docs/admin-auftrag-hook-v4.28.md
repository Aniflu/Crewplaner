# Auftrag an den Admin — Hook v4.28 deployen (wer hat zuletzt geschrieben)

**Datum:** 2026-09-16 · **Betrifft:** `.pb_hooks/main.pb.js` (v4.27 live → v4.28)
**Frontend:** v0.13.7, unverändert ausgerollt — dort ist nichts zu tun.
**Feld:** `assignments.changed_by` ist auf Test und Live **bereits angelegt** (Text, `hidden`).

---

## Worum es geht

Seit v0.13.6 tragen Einsätze `created` und `updated` — sie sagen **wann**, nicht **wer**. Die
beiden naheliegenden Quellen dafür taugen nicht, beide nachgemessen:

- Das PocketBase-Request-Log führt nur die Auth-**Art** (`users` / `_superusers`), keine Person,
  und `maxDays: 1` löscht es nach 24 Stunden.
- `activity_log` deckt nur Crew-Antworten ab und wird vom Browser geschrieben — also fälschbar.

v4.28 setzt deshalb serverseitig `changed_by` auf die **ID des angemeldeten Kontos**. Daran kann
ein Client nichts drehen. Das Feld ist `hidden`: Die Crew bekommt es über die API nicht
ausgeliefert, auch nicht bei den eigenen Einsätzen — sie soll nicht sehen, welcher Planer sie
eingeteilt hat (Linie „Crew sieht nur Namen", v0.8.1). Lesen kann es nur ein Superuser.

## Was v4.28 ändert

**Ein eigener Abschnitt „2a" vor den Guards**, mit je einem `onRecordCreateRequest` und
`onRecordUpdateRequest` auf `assignments`, die nichts prüfen, sondern nur `changed_by` setzen.
Dazu **eine Zeile** in der `/notify`-Transaktion vor `tx.save(r)`.

⚠️ **Warum ein eigener Hook und nicht eine Zeile im Guard:** Der Statuswechsel-Guard steigt
viermal früh aus (`e.next(); return;`) — bei fehlendem Auth, bei Planern, bei fremden Datensätzen.
Ausgerechnet beim Planer-Pfad, dem häufigsten, bliebe das Feld sonst leer.

⚠️ **Die neuen Hooks werfen nichts.** Alles in `try/catch`, kein `throw`; schlägt das Setzen fehl,
wird ohne Feld weitergeschrieben. Wir fassen denselben Pfad an, an dem v4.25 die Crew vom Zu- und
Absagen abgeschnitten hat — ein fehlender Protokolleintrag ist das nie wert.

⚠️ **Die Logik steht bewusst doppelt**, einmal je Handler. Deklarationen auf oberster Dateiebene
sind in diesem Hook nicht zuverlässig sichtbar (Lehre aus v4.25/v4.26). Bitte nicht „aufräumen" —
`tests/statusguard.test.mjs` hält das fest.

## Deploy

Unverändert nach `docs/admin-runbook-hook-deploy.md` — **Test zuerst, messen, dann Live.**

## Messen

**Vorher eine Nullprobe sichern:** Notiere die ID eines Einsatzes, der **vor** dem Deploy zuletzt
geändert wurde. Sein `changed_by` muss danach **leer** bleiben. Ohne diese Gegenprobe belegt ein
gefülltes Feld nur, dass irgendwo ein Wert steht — nicht, dass er von diesem Hook kommt.

| # | Messung | erwartet |
|---|---|---|
| 1 | Log nach dem Neustart | `[hook] main.pb.js v4.28 geladen` |
| 2 | Crew bestätigt einen eigenen Slot in der App, danach den Datensatz **als Superuser** lesen | `changed_by` = ID **dieses Crew-Kontos** |
| 3 | Als Planer über „Jetzt anfragen" (`POST /notify`) einen Slot anlegen, als Superuser lesen | `changed_by` = ID **des Planers**, nicht der Crew |
| 4 | Denselben Datensatz mit dem **Crew-Token** abrufen | Feld `changed_by` fehlt in der Antwort |
| 5 | Nullprobe von oben erneut lesen | `changed_by` weiterhin **leer** |
| 6 | Regression: bestätigen **und** absagen als Crew | funktioniert wie bisher |
| 7 | `auxiliary.db` (`_logs`, `level > 0`) | kein `ReferenceError` / `TypeError` |

**Messung 6 ist die wichtigste.** Alles andere ist Komfort; ein Hook, der das Zu- und Absagen
bricht, ist ein Ausfall für die ganze Crew. Wenn sie fehlschlägt: **nicht auf Live gehen**,
zurückrollen und melden.

Messung 2 und 3 zusammen zeigen, dass wirklich der Handelnde protokolliert wird und nicht
pauschal der Betroffene — bei `/notify` handelt der Planer im Namen einer anderen Person, dort
müssen sich die beiden IDs unterscheiden.

## Was ich nicht prüfen konnte

Ausdrücklich als Bitte, nicht als Behauptung: Ich kann den Hook nicht laufen lassen, ein Deploy
braucht SSH. Geprüft ist nur, was sich am Code prüfen lässt — vier Wächter in
`tests/hookchangedby.test.mjs`: dass der Block existiert und `auth.id` schreibt, dass er kein
`throw` enthält, dass er **vor** den Guards registriert ist, und dass auch der `/notify`-Weg das
Feld setzt. Ob `e.auth` in dieser PocketBase-Version in beiden Request-Hooks tatsächlich gefüllt
ist, zeigt erst Messung 2 und 3.

## Danach

- Hook-Version in `docs/database-schema.md` nachziehen und dieses Dokument oben stempeln.
- Wie nach jedem Redeploy: `node tools/check-pb-rules.mjs` — prüft seit v0.13.6 auch, ob die
  Felder `created`, `updated` und `changed_by` noch da sind (ein Schema-Reimport setzt `hidden`
  zurück, dann läge die ID offen).
