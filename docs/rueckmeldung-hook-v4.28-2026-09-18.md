# Rückmeldung an Marco — Hook v4.28 ausgerollt

**Datum:** 2026-09-18 · **Auftrag:** `docs/admin-auftrag-hook-v4.28.md`
**Stand beider Instanzen:** **v4.28**, sha `4e14619bf3d2672f58e39427f8b63b63a4fac170124f9fc8365ca1e70c83f89e`,
healthy, `RestartCount: 0` — identisch mit GitHub `main`.

> Server-Kennungen stehen hier als `«…»` — dieses Dokument kann so ins öffentliche Repo,
> ohne `tests/privacy.test.mjs` rot zu machen.

---

## Ergebnis in einem Satz

Test zuerst, alle **sieben** Messungen bestanden, dann Live — und der Punkt, den du ausdrücklich
als ungeprüft benannt hast, ist jetzt gemessen: **`e.auth` ist in beiden Request-Hooks gefüllt.**

---

## 1. Nullprobe (vor dem Deploy, wie verlangt)

| Instanz | Datensatz | Zustand vorher |
|---|---|---|
| Test | `t372x0skh40n0hi` (zuletzt geändert 2026-09-15 20:01) | `changed_by` leer |
| Live | `lwhi9813xj2w7yw` | `changed_by` leer |

Beide danach **unverändert leer**. Auf Test waren am Ende 853 von 856 Datensätzen leer — gefüllt
genau die drei eigenen Testslots. Deine Begründung trägt: ohne diese Gegenprobe hätte ein
gefülltes Feld nur belegt, dass irgendwo ein Wert steht.

## 2. Messungen auf Test

**Messung 6 lief zuerst**, weil sie die Abbruchbedingung war.

| # | Messung | Ergebnis |
|---|---|---|
| 6 | Crew: `proposed → confirmed`, dann `proposed → declined` | **200** / **200** ✅ |
| 1 | Log nach Neustart | `[hook] main.pb.js v4.28 geladen` ✅ |
| 2 | Crew bestätigt, Lesen als Superuser | `changed_by` = **Crew-ID** ✅ |
| 3 | `POST /notify` als Planer, Lesen als Superuser | `changed_by` = **Planer-ID** ✅ |
| 4 | derselbe Datensatz mit Crew-Token | 14 Felder, `changed_by` **nicht** darunter ✅ |
| 5 | Nullprobe erneut | weiter leer ✅ |
| 7 | `auxiliary.db`, `level > 0` | **0** `ReferenceError`/`TypeError` ✅ |

Zu **2 und 3 zusammen**: Die IDs unterscheiden sich, bei `/notify` steht die des **Planers** im
Feld, obwohl der Slot auf eine andere `crew_email` läuft. Protokolliert wird also der Handelnde,
nicht der Betroffene — genau wie beabsichtigt.

Zum `try/catch`: Im Container-Log steht **null** mal `changed_by … nicht gesetzt`. Der Fangzweig
hat nie gegriffen, das Feld wurde auf jedem gemessenen Pfad gesetzt.

Kontrollproben mitgelaufen: erfundene Route **404** neben `/notify` **200**, erfundener Feldname
leer neben den drei echten Feldern.

## 3. Eine Messung dazu, die deine Begründung prüft

Der Auftrag begründet den eigenen Hook damit, dass der Guard beim **Planer-Pfad** früh mit
`e.next(); return;` aussteigt. Das habe ich direkt gemessen, statt es zu übernehmen:

Ein **Planer-PATCH** auf den zuvor von der Crew bestätigten Slot (`pos_label` geändert, kein
Statuswechsel) → **200**, und `changed_by` ist von der Crew-ID auf die Planer-ID **umgesetzt**.
Der eigene Hook war also nötig; eine Zeile im Guard hätte diesen Pfad nicht erfasst.

**Nebenbefund daraus, für die Doku:** Das Feld heißt „wer **zuletzt**", nicht „wer angelegt".
Sobald ein Planer nach der Crew-Antwort denselben Datensatz anfasst, ist die Crew-ID weg. Wer
eine Anlage-Historie erwartet, liest das Feld falsch.

## 4. Live

Deploy nach Runbook, dann gegen eine **vorher** genommene Baseline gemessen — alle Werte
identisch:

`/api/health` 200 · `POST /notify` **401** bei Kontroll-URL **404** · `/viewplan/ungueltig` 404 ·
CORS-Header nur für die erlaubte Origin, **0** für eine fremde · anonyme `plans`-Liste
`totalItems: 0` · Frontend 200 · `crew_invites.createRule` **leer**.

Die 55 „Fehler" der letzten 24 h auf Live sind Scanner-Rauschen (`/.env`,
`wp-includes/wlwmanifest.xml`), **null** JS-Laufzeitfehler.

**Was auf Live fehlt: die Messungen 2, 3, 4 und 6.** Sie brauchen ein angemeldetes Konto, und auf
Live lege ich keins an. Live hat 10 Crew-Konten und **einen** offenen `proposed`-Slot, der einer
echten Person gehört — den fasse ich nicht an. Belegt ist auf Live: `v4.28` geladen, Feld
vorhanden und `hidden`, Nullprobe leer, keine Laufzeitfehler, keine Regression.

Das schließt sich beim ersten echten Schreibvorgang, und weil momentan **alle 1004** Datensätze
leer sind, ist der erste gefüllte unmittelbar ablesbar:

```
SELECT id, status, changed_by, updated FROM assignments
WHERE changed_by IS NOT NULL AND changed_by != '';
```

**Wenn du eine beliebige Planer-Änderung in der App machst, messe ich es sofort nach** — dann ist
auch Live vollständig abgenommen.

## 5. Drei Befunde, unabhängig vom Deploy

**(1) Auf Live hat kein einziger `assignment` einen `created`- oder `updated`-Wert.** Alle 1004
leer. Beide Felder kamen mit v0.13.6 als `autodate` dazu und füllen sich erst beim nächsten
Schreibvorgang; seit der Schema-Änderung wurde auf Live an Einsätzen nichts geschrieben (letzte
Crew-Antwort 2026-09-10). Für den Altbestand gibt es die Zeitstempel also nicht — relevant, falls
eine Auswertung darauf baut.

**(2) Der naheliegende Gegentest zur Fehlerabfrage aus Messung 7 ist wertlos.** „Findet das
Muster die echten v4.25-Fehler auf Test?" liefert **0** — aber nur, weil PocketBases Log-DB mit
`maxDays: 1` läuft und die Einträge vom 09.09. längst gelöscht sind. Bei Erfolg kommt dieselbe
Null heraus. Kontrolliert habe ich deshalb den **Mechanismus**:
`data LIKE '%File not found%'` → **49** Treffer, erfundenes Muster → **0**, `data` in **3115 von
3115** Zeilen gefüllt. Erst damit ist die Null aus Messung 7 eine Messung.

**(3) In SQLite sind `"…"` Identifier, keine Strings — und das verfälschte still eine
Schema-Prüfung.** Die Abfrage `… json_extract(f.value,'$.name') IN ("created","updated","changed_by")`
meldete `created` und `updated` als **fehlend**, obwohl beide da sind: `_collections` hat selbst
Spalten `created`/`updated`, auf die SQLite die Namen auflöste. `changed_by` traf nur, weil es
keine gleichnamige Spalte gibt. Mit `'…'` sind alle drei Felder auf beiden Instanzen vorhanden,
`changed_by` mit `hidden=1`. Das ist die serverseitige Entsprechung zu deinem
`tools/check-pb-rules.mjs` — falls das Skript irgendwo mit doppelten Anführungszeichen filtert,
wäre es dieselbe Falle.

## 6. Aufgeräumt

Test ist **exakt** auf Ausgangsstand: 853 `assignments` (810 confirmed / 33 pencilled /
6 cancelled / 4 cancel_acked), alle `changed_by` leer, 1 `users`, 2 `_superusers` (die
ursprünglichen), 24 `crew_members`, 0 `crew_invites`.

Gelöscht: drei Testslots, zwei Konten auf `@example.invalid` samt ihren `crew_members`-Freigaben,
der von `/notify` erzeugte `crew_invites`-Datensatz und der temporäre Superuser. Die beiden
Testkonten lagen auf Fantasie-Adressen — es konnte niemandem Post zugehen, und auf Test gibt es
ohnehin keinen `RESEND_KEY` (Log: „Mailversand übersprungen").

**Auf Live wurde kein Datensatz angelegt oder geändert.**

Rollback-Stände (`v4.27`, sha `b7d09658…`):
`/root/backups/pb-hooks/main.pb.js.test.20260918-072729` und `…/main.pb.js.live.20260918-073101`.

## 7. Nebenbei erledigt

**`purge_crew_invites` auf Live ist jetzt gegengemessen.** Der Cron hat am 16., 17. und 18.09.
jeweils um **03:20** seine Zeile geschrieben (`0 entfernt … Grenze …`), mit Kontrollprobe, dass
ein erfundener Jobname 0 Treffer liefert. Die Richtigkeit des Zeitvergleichs war am 2026-09-15
auf Test mit einem zurückdatierten Datensatz belegt — damit ist der Punkt vollständig zu und aus
meiner Liste raus.

## 8. Was bei dir liegen bleibt

Aus dem „Danach"-Abschnitt deines Auftrags, bewusst **nicht** von mir gemacht:

- Hook-Version in `docs/database-schema.md` nachziehen
- `docs/admin-auftrag-hook-v4.28.md` oben stempeln
- `node tools/check-pb-rules.mjs` bei dir laufen lassen (braucht deine lokale Superuser-Datei);
  serverseitig habe ich die drei Felder und `hidden=1` direkt geprüft, s. Befund (3)

Am Auftragsdokument habe ich nichts geändert, um kein gegenseitiges Überschreiben zu erzeugen —
gleiche Linie wie beim v0.13.1-Auftrag. Dieses Dokument bitte vor dem Push einmal durch
`node tests/run.mjs` schicken, wie es dein Runbook verlangt.
