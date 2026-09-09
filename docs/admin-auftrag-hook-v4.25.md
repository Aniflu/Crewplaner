# Auftrag an den Admin — Hook v4.25 deployen (Statuswechsel-Guard für `assignments`)

**Datum:** 2026-09-09 · **Betrifft:** `.pb_hooks/main.pb.js` (v4.24 → v4.25)
**Frontend:** v0.13.0, gepusht — bitte wie üblich mit ausrollen.

---

## ⚠️ Dieser Deploy ist anders als die letzten drei

v4.22 bis v4.24 haben Mails und Kalender-Feeds verändert: Ging etwas schief, fiel eine
Benachrichtigung aus. **v4.25 enthält zwei BLOCKIERENDE Hooks**, die Schreibvorgänge auf
`assignments` abweisen können. Ein Fehler darin nimmt der Crew das Bestätigen und Absagen —
und damit die Kernfunktion der App.

Bitte deshalb: **Test zuerst, dort wirklich messen** (nicht nur die Version im Log lesen),
und Live erst danach. Das Backup aus dem Deploy ist hier keine Formalität.

## Reihenfolge und Dringlichkeit

Es bricht nichts, wenn der Deploy wartet — das Frontend v0.13.0 läuft mit v4.24 unverändert.
Aber: **Bis der Hook draußen ist, ist die Lücke offen.** Die Prüfung sitzt bis dahin
ausschließlich im Browser, und die lässt sich mit einem Crew-Token und einem `curl` umgehen.
Der gemeldete Fehler ist also erst zur Hälfte behoben.

## Was zu tun ist

Der Weg aus **`docs/admin-runbook-hook-deploy.md`** — erst nach `/tmp`, Version und sha256
als Gate prüfen, Backup, dann kopieren. Erst Test, messen, dann Live.

Danach muss im Log stehen: `[hook] main.pb.js v4.25 geladen`

## Was sich ändert

Zwei neue blockierende Hooks auf `assignments`, beide direkt vor dem bestehenden
Mail-Hook. Sonst nichts — `/notify`, `/myplans`, `/myplan`, `/planstatus`, `/viewplan`,
`/viewstatus`, `/ics` und der gesamte Mailversand sind unverändert.

**1. `onRecordUpdateRequest`** — vergleicht den vorherigen Status (`originalCopy()`) mit dem
neuen und weist ab, was die Crew nicht selbst darf. Erlaubt für Crew ist:

| von | nach |
|---|---|
| `proposed` | `confirmed`, `declined` |
| `confirmed` | `declined` |
| `pencilled` | `declined` |
| `cancelled` | `cancel_acked` |
| kein Record | `confirmed`, `declined` |

Alles andere → **400 `status_transition_denied`**. Insbesondere `pencilled → confirmed` und
jedes Setzen von `pencilled` durch die Crew.

**2. `onRecordCreateRequest`** — die Crew darf direkt nur den **eigenen** Slot anlegen und nur
als `confirmed`. Sonst **400 `assignment_create_denied`**.

**Ausgenommen sind `superadmin`, `manager` und der Plan-Owner** — bewusst eine Obermenge der
heutigen `updateRule`: Wer heute schreiben darf, darf es auch danach.

## Warum

Ein Crew-Konto wurde vom Admin auf **vorgemerkt** gesetzt, bekam beim Login trotzdem
„kannst du an diesen Terminen?" und die Antwort machte daraus stillschweigend eine Zusage.
Vorgemerkt gehört aber ausschließlich Admin und Tourmanager.

Der Filter im Frontend behebt die Frage, nicht die Lücke: **`assignments.updateRule` ist
feldblind.** Sie sagt „Crew darf ihren eigenen Datensatz ändern" und kann nicht unterscheiden,
welches Feld auf welchen Wert geht. Mit dem eigenen Token ließ sich per `PATCH` jeder Status
setzen, komplett an der App vorbei.

Der zweite Hook ist kein Beiwerk: `createRule` steht auf `@request.auth.id != ""` und es gibt
**keinen Unique-Index** auf `(plan_id, date, pos_id)`. Ohne ihn ließe sich der erste umgehen,
indem statt einer Änderung einfach ein **zweiter** Datensatz für denselben Slot mit
`confirmed` angelegt wird.

Dass das im Hook steht und nicht in der Regel, hat den bekannten Grund: Regeln fallen bei
einem Coolify-Redeploy auf den permissiven Stand zurück, Hook-Dateien überleben das.

## Messen danach — „geladen" ist nicht „gewirkt"

Die Version im Log beweist nur, dass die Datei geladen wurde, **nicht**, dass der Prüfpfad je
durchlaufen wurde. Der Nachweis braucht einen echten `PATCH` mit einem **Crew-Token**.

Auf **Test** gilt die bekannte Falle aus dem Runbook: Die Test-DB hat viele `assignments`,
aber einen einzigen `users`-Datensatz, der zu keinem davon gehört. Ein Konto verwenden,
dessen `crew_email` wirklich an einem Einsatz hängt — sonst greift schon die `updateRule`
und man misst den Guard gar nicht.

```bash
# 0. Version im Log
ssh «SERVER» 'docker logs --tail 30 «PB-CONTAINER-LIVE» | grep "main.pb.js v"'

# Vorbereitung: Crew-Token holen und einen VORGEMERKTEN Einsatz dieser Person suchen
BASE=https://api-test.crewplanner.nyxlightwork.de     # Live: https://api.crewplanner...
TOK=$(curl -s -X POST "$BASE/api/collections/users/auth-with-password" \
      -H 'Content-Type: application/json' \
      -d '{"identity":"<CREW-MAIL>","password":"<PASSWORT>"}' | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
REC=<ID eines assignments-Datensatzes dieser Person mit status=pencilled>

# 1. DER NACHWEIS — muss 400 status_transition_denied sein
curl -s -o /tmp/a.txt -w "vorgemerkt -> bestaetigt: %{http_code}\n" \
  -X PATCH "$BASE/api/collections/assignments/records/$REC" \
  -H "Authorization: $TOK" -H 'Content-Type: application/json' \
  -d '{"status":"confirmed"}'; grep -o 'status_transition_denied' /tmp/a.txt

# 2. GEGENPROBE — absagen muss weiterhin durchgehen (200)
curl -s -o /dev/null -w "vorgemerkt -> abgesagt:   %{http_code}\n" \
  -X PATCH "$BASE/api/collections/assignments/records/$REC" \
  -H "Authorization: $TOK" -H 'Content-Type: application/json' \
  -d '{"status":"declined"}'

# 3. Zweitrecord-Weg muss zu sein — 400 assignment_create_denied
curl -s -o /tmp/c.txt -w "Zweitrecord:               %{http_code}\n" \
  -X POST "$BASE/api/collections/assignments/records" \
  -H "Authorization: $TOK" -H 'Content-Type: application/json' \
  -d '{"plan_id":"<PLAN-ID>","date":"<DATUM>","pos_id":"<POS>","crew_email":"<CREW-MAIL>","status":"pencilled"}'
  grep -o 'assignment_create_denied' /tmp/c.txt

# 4. Keine Regression
curl -s -o /dev/null -w "health:                    %{http_code}\n" "$BASE/api/health"
```

**Punkt 1 ist der entscheidende.** Kommt dort ein `200`, ist der Guard nicht wirksam —
dann bitte **nicht** auf Live weitergehen.

### Zusätzlich in der App durchklicken (das findet kein `curl`)

Der Guard darf die Planer nicht einsperren. Vor dem Live-Deploy bitte auf Test:

- **Als Manager:** Sammel-Statuswechsel („Status ändern…"), Vormerken, „→ Jetzt anfragen",
  einzelnes Bestätigen im Zellenmenü — alles muss unverändert gehen.
- **Als Crew:** Anmelden mit einer Person, die **nur** Vormerkungen hat → es darf **kein**
  Terminfenster mehr aufgehen. Über die Schaltfläche „Termine bestätigen" muss es sich
  trotzdem öffnen und dort eine Absage möglich sein.
- **Einladen über die App** (`POST /notify`) muss weiterhin funktionieren. Das ist der eine
  Punkt, den ich nicht durch Lesen beweisen konnte: `/notify` schreibt über
  `$app.runInTransaction`, sollte also nicht durch die Record-Hook-Kette laufen — bitte
  einmal praktisch bestätigen.
- **„GESEHEN ✓"** aus einer Absage-Mail (`cancelled → cancel_acked`) muss weiter gehen.

## Rollback

Das Backup aus dem Deploy zurückkopieren und den Container neu starten (siehe Runbook).
Folgenlos: Frontend v0.13.0 läuft mit v4.24 unverändert weiter — die Oberfläche bietet der
Crew dann schon nichts Falsches mehr an, die Lücke über die REST-API bleibt aber offen.

## Danach

- Hook-Version in `docs/database-schema.md` nachziehen (steht dort aktuell als
  „v4.25 — im Repo, NOCH NICHT deployt") und dieses Dokument oben mit dem Ergebnis stempeln.
- Wie nach jedem Redeploy: `crew_invites.createRule` muss weiterhin **leer** sein.
- Offen und ausdrücklich **nicht** Teil dieses Deploys: `assignments.createRule` und
  `deleteRule` stehen weiter auf `@request.auth.id != ""` (Anlegen für **fremde** Personen,
  Löschen). Siehe `docs/security.md`. Ein Unique-Index auf `(plan_id, date, pos_id)` wäre die
  sauberere Absicherung gegen Doppel-Records als der Create-Hook — eigener Vorgang.
