# Auftrag an den Admin — Hook v4.27 deployen (crew_invites räumt sich selbst auf)

**Datum:** 2026-09-14 · **Betrifft:** `.pb_hooks/main.pb.js` (v4.26 live → v4.27)
**Frontend:** v0.13.4, unverändert ausgerollt — dort ist nichts zu tun.
**Vorgeschichte:** `docs/admin-auftrag-v0.13.1.md`, `docs/security.md`

---

## Worum es geht

`crew_invites` ist der Postausgang: Für jede verschickte Mail legt der Hook einen Auslöse-Datensatz
an. Gelesen wird er nach dem Versand von niemandem mehr — das Frontend fasst die Collection gar
nicht an, der Hook selbst nur einmal beim Anlegen. Trotzdem blieb jeder Datensatz für immer
liegen: Am 13.09. lagen auf Live **73** Stück mit Namen und Mailadressen von 12 Personen.

Der Altbestand ist mit v0.13.3 einmalig geleert (73 → 0) und die Collection ist seitdem dicht
(alle Regeln „nur superuser“). **Das Nachwachsen stoppt aber erst dieser Hook.**

## Was v4.27 ändert

Ein einziger neuer Block, direkt nach dem Mail-Hook:

```js
cronAdd('purge_crew_invites', '20 3 * * *', function () { … });
```

Er löscht täglich um 3:20 Uhr, was älter als **30 Tage** ist, in Stücken von maximal 500.
Grundlage ist das neue Feld `created` (`autodate`), das die Collection seit v0.13.4 hat — vorher
war das Alter eines Eintrags **gar nicht** bestimmbar. Das Feld ist auf Test und Live bereits
gesetzt und vergibt Werte (geprüft mit je einem Probe-Datensatz, danach gelöscht).

⚠️ **Bewusst NICHT im Mail-Hook gelöscht**, so naheliegend das wäre: Dort liefe `$app.delete` in
der Transaktion der Anlage. Genau diese Sorte Eingriff hat mit v4.25 den Statuswechsel-Guard
zerlegt — Laufzeitfehler, Crew konnte weder zu- noch absagen, Rückrollen auf Test. Ein Cron läuft
außerhalb dieser Transaktion: Geht er schief, bleibt der Mailversand unberührt. Der Lauf steckt
zusätzlich in `try/catch`, damit ein Fehlschlag höchstens einen Tag kostet.

`tests/hookcron.test.mjs` hält beides fest: dass der Cron da ist **und** dass im Mail-Hook kein
`$app.delete` steht.

## Deploy

Unverändert nach `docs/admin-runbook-hook-deploy.md` — **Test zuerst, messen, dann Live.**

## Messen — drei Punkte, alle sofort prüfbar

| # | Messung | erwartet |
|---|---|---|
| 1 | Container-Log nach dem Neustart | `[hook] main.pb.js v4.27 geladen` |
| 2 | `GET /api/crons` (als Superuser) | Liste enthält **`purge_crew_invites`** mit `20 3 * * *` |
| 3 | Eine echte Mail auslösen (Einladung oder Update) | Mail kommt an wie bisher |

**Messung 2 ist der eigentliche Nachweis, nicht Messung 1.** „Geladen“ ist nicht „wirksam“ — das
ist die Lehre aus v4.17, wo eine Ladezeile im Log eine Wirkung vortäuschte, die es nicht gab.

**Und du musst keinen Tag auf 3:20 Uhr warten:** Ein Cronjob lässt sich von Hand auslösen mit
`POST /api/crons/purge_crew_invites` (Superuser-Token). Dass das in dieser PocketBase-Version
geht, ist geprüft — auf der Test-Instanz mit PocketBases eigenem, harmlosem `__pbLogsCleanup__`:
**204**, und ein erfundener Jobname liefert **404**, die Antwort sagt also wirklich etwas aus. Auf der leeren Collection muss der Lauf
`purge_crew_invites: 0 entfernt` ins Log schreiben und **fehlerfrei** durchlaufen. Genau das ist
die Stelle, an der ein Tippfehler im Filter auffliegt.

Wenn Messung 2 fehlschlägt oder der Handlauf einen Fehler wirft: **bitte nicht auf Live gehen**,
sondern zurückrollen und melden. Dann stimmt etwas am Cron-Aufruf, und das sehen wir uns an,
bevor irgendetwas löscht.

## Was ich nicht prüfen konnte

Ausdrücklich als Bitte, nicht als Behauptung: Ich habe **keinen** Weg, den Hook selbst laufen zu
lassen — ein Deploy braucht SSH. Alles oben ist am Code hergeleitet und statisch geprüft, nicht
auf einem laufenden PocketBase gemessen. Die drei Messungen sind deshalb der eigentliche Test,
nicht eine Formalie.

Ungeprüft ist besonders: ob `$app.findRecordsByFilter` mit dem Zeitvergleich
(`created < {:g}`, Format `YYYY-MM-DD HH:MM:SS.sssZ`) in dieser PocketBase-Version genau so
greift. Falls der Handlauf `0 entfernt` meldet, obwohl alte Datensätze da sind, liegt es daran.

## Falls du es nicht deployen willst

Es gibt einen zweiten Weg, der ohne Server-Zugang auskommt: `tools/purge-invites.mjs`. Das
Werkzeug macht dasselbe von außen über die API — Trockenlauf als Standard, Löschen erst mit
`--loeschen`, JSON-Sicherung vorher. Dann räumt allerdings nichts von allein auf, sondern nur,
wenn jemand daran denkt.

## Danach

- Hook-Version in `docs/database-schema.md` nachziehen und dieses Dokument oben mit dem Ergebnis
  stempeln, wie bei v4.26.
- Wie nach jedem Redeploy: `crew_invites.createRule` muss **leer** (nur superuser) sein —
  seit v0.13.3 gilt das auch für `listRule`, `viewRule`, `updateRule` und `deleteRule`.
  `node tools/check-pb-rules.mjs` prüft das in einem Lauf.
