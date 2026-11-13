# Auftrag an den Admin — Hook v4.29 deployen (Vormerkung als Information)

> ✅ **Test erledigt 2026-11-13** (`docs/rueckmeldung-hook-v4.29-2026-11-13.md`, 13/13 bestanden). ⏳ **Live:** wartet auf Marcos Freigabe.

**Datum:** 2026-11-13 · **Betrifft:** `.pb_hooks/main.pb.js` (v4.28 → v4.29)
**Frontend:** Die App (v1.4.0) wird erst **nach** der Rückmeldung „Hook v4.29 auf Test deployt“ auf Test gebracht. Hier ist am Frontend nichts zu tun. Die Live-App v1.3.0 läuft mit v4.29 unverändert weiter (rückwärtskompatibel).
**Schema/Regeln:** keine Änderung. `assignments.status` und `crew_invites.type` sind freie Textfelder.

---

## Worum es geht

Eine **Vormerkung** soll nur noch eine Information sein („halte dir die Tage frei“), keine Anfrage. Dafür braucht der Server drei Dinge:

1. Einen neuen Status **`pencil_declined`** (Crew sagt eine Vormerkung ab, und kann das zurücknehmen).
2. Einen neuen Mail-Typ **`pencil_info`** (Info-Mail an die vorgemerkte Person, ohne Bestätigen-Knopf).
3. Eine Korrektur: Einladung, Erinnerung und Update dürfen vorgemerkte Tage **nicht mehr** still auf „angefragt“ (`proposed`) setzen.

## Was v4.29 ändert

- **Statusregeln der Crew** (Wächter auf `assignments`): `pencilled → pencil_declined` und `pencil_declined → pencilled` sind neu erlaubt. `pencilled → declined` bleibt erlaubt, nur damit die alte App v1.3.0 weiter funktioniert. Weiter verboten: `declined → pencilled`, `pencil_declined → confirmed`, `pencilled → confirmed`.
- **Mail an den Planer** (nach Statuswechsel): bei `pencil_declined` der Betreff „VORMERKUNG ABGESAGT · Position · Datum · Name“, bei `pencil_declined → pencilled` „VORMERKUNG WIEDER FREI · …“. Die Mail „ABGELEHNT“ kommt nur noch bei `declined`. Alle diese Mails gehen nur bei einem **echten Statuswechsel** raus, nicht bei jedem erneuten Speichern.
- **`POST /notify`:** neuer Typ `pencil_info` (Betreff „Vormerkung – nur Information · «Tour»“, schreibt **keinen** Status, legt nur den Mail-Auslöser an). Bei Einladung, Erinnerung und Update werden Datensätze mit Status `pencilled` oder `pencil_declined` übersprungen und nicht in die Terminliste der Mail aufgenommen.
- **`GET /planstatus`:** unverändert im Code. Der Filter schließt `pencil_declined` nicht aus, die Crew sieht es also.
- Version und Logzeile auf 4.29.

⚠️ **Bitte nicht „aufräumen“:** Die Statustabelle steht bewusst doppelt (App `js/pure.js` und Hook), und die Handler-Logik ist je Handler lokal (Goja-Isolation, Lehre aus v4.25). `tests/statusguard.test.mjs` und `tests/hookpencil.test.mjs` halten das fest.

## Bekannter harmloser Unterschied (alte App v1.3.0)

Solange auf Live noch die App v1.3.0 läuft: Eine Einladung mit vorgemerkten Tagen lässt diese Tage jetzt **vorgemerkt** (früher wurden sie still „angefragt“). Die alte App kann sie lokal bis zum Neuladen als „angefragt“ zeigen. Das ist gewollt und kein Fehler.

## Deploy

Unverändert nach `docs/admin-runbook-hook-deploy.md` — **zuerst Test, messen, dann Live.** Live erst, wenn der Auftraggeber es ausdrücklich freigibt (die App v1.4.0 wird zwischendurch auf Test geprüft).

## Messen (auf Test, danach kurz auf Live)

| # | Messung | erwartet |
|---|---|---|
| 1 | Log nach dem Neustart | `[hook] main.pb.js v4.29 geladen` |
| 2 | Regression: Crew-Konto bestätigt und sagt eine echte Anfrage ab | funktioniert wie bisher (Mail „ABGELEHNT“ bei Absage) |
| 3 | Einen Einsatz auf `pencilled` setzen (als Planer), dann als Crew auf `declined` setzen (alte App) | wird angenommen |
| 4 | Einen Einsatz auf `pencilled` setzen, als Crew auf `pencil_declined` setzen | wird angenommen; Mail „VORMERKUNG ABGESAGT · …“ beim Planer (Test hat keinen Mailversand: Logzeile `kein RESEND_KEY` statt Mail genügt) |
| 5 | Derselbe Einsatz: Crew setzt `pencil_declined → pencilled` | wird angenommen; „VORMERKUNG WIEDER FREI“ |
| 6 | Crew versucht `pencil_declined → confirmed` und `declined → pencilled` | beides mit `status_transition_denied` abgelehnt |
| 7 | **Einladung lässt Vormerkung unverändert:** `POST /notify` mit `type: invite`, `slots` und `mailSlots` für einen Tag mit Status `pencilled` und einen Tag ohne Record | der vorgemerkte Datensatz bleibt `pencilled`, der andere wird `proposed`; die Mail führt nur den zweiten Tag (`mailSlots` wird ebenfalls gefiltert, aber nur neue Termine; Statuszeilen und Entfallen-Einträge bleiben) |
| 8 | `POST /notify` mit `type: pencil_info`, `mailSlots` mit zwei Terminen | Antwort `ok`, **kein** Statusdatensatz verändert, `crew_invites`-Eintrag mit Typ `pencil_info` |
| 9 | `GET /planstatus/{id}` als Crew, mit einem `pencil_declined`-Einsatz | Status `pencil_declined` ist in der Antwort |
| 10 | Einen `pencil_declined`-Einsatz ohne Statuswechsel erneut speichern (z. B. Planer ändert eine Notiz) | **keine** zweite Mail, Logzeile „Status unverändert, kein E-Mail gesendet“ |
| 11 | `POST /notify` mit `type: pencil_info` ohne `mailSlots` (oder leer) | Antwort 400 „mailSlots fehlen“, kein `crew_invites`-Eintrag |
| 12 | `POST /notify` `type: invite` für einen Tag, der nur aus einem `pencilled`-Einsatz besteht | Antwort `{ok:true, skipped:'keine Termine'}`, keine Mail, kein Datensatz verändert |
| 13 | `auxiliary.db` (`_logs`, `level > 0`) | kein `ReferenceError` / `TypeError` |

**Messung 2 ist die wichtigste.** Bricht das Zu- und Absagen, ist das ein Ausfall für die ganze Crew: **nicht auf Live gehen**, zurückrollen und melden.

## Rückweg

Wenn eine Messung fehlschlägt: die gesicherte `main.pb.js` **v4.28** zurückspielen (Datei vor dem Deploy sichern), Neustart wie im Runbook, Log prüfen auf `v4.28 geladen`, und melden. Die App v1.4.0 darf dann nicht auf diese Umgebung.

## Rückmeldung

Bitte als `docs/rueckmeldung-hook-v4.29-<datum>.md` (je Umgebung: Test, Live) mit den dreizehn Messungen, `RestartCount` und dem Befund aus `_logs`. Erst danach gilt der Hook als deployt.

## Danach (macht Claude)

- Hook-Version in `docs/database-schema.md` und `docs/security.md` nachziehen, diesen Auftrag oben stempeln, README.
- Wie nach jedem Redeploy: `node tools/check-pb-rules.mjs` (liest nur).

## Was ich nicht prüfen konnte

Der Hook läuft nur in PocketBase (Goja), nicht in Node. Geprüft ist das Verhalten der Wächter-Regeln und des Slot-Filters mit Attrappen (`tests/hookpencil.test.mjs`) sowie die Struktur der Mail-Vorlagen. Ob alles auf dem Server wirkt, zeigen erst die Messungen oben.
