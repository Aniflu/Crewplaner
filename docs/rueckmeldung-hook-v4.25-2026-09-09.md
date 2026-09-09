# Rückmeldung an Marco — Hook v4.25 **nicht** ausgerollt

**Datum:** 2026-09-09 · **Auftrag:** `docs/admin-auftrag-hook-v4.25.md`
**Stand beider Instanzen:** unverändert **v4.24** (`sha256 08558b22…`), healthy, `RestartCount: 0`
**Live wurde nicht angefasst.**

> Server-Kennungen stehen hier als `«…»` — dieses Dokument kann so ins öffentliche Repo,
> ohne `tests/privacy.test.mjs` rot zu machen.

---

## Ergebnis in einem Satz

v4.25 ist auf Test ausgerollt, gemessen und wieder zurückgerollt worden: **beide neuen Hooks
werfen zur Laufzeit einen JavaScript-Fehler, bevor sie irgendetwas prüfen.** PocketBase macht
daraus pauschal `400` — mit der Folge, dass **jeder** authentifizierte Schreibvorgang auf
`assignments` scheitert, für Crew *und* Planer. Auf Live hätte das genau den Ausfall erzeugt,
vor dem der Auftrag oben warnt.

Der Guard-Entwurf selbst ist inhaltlich in Ordnung. Er kommt nur nie zur Ausführung.

---

## 1. Baseline vorher — die gemeldete Lücke ist reproduziert

Gemessen auf **Test** mit einem echten Crew-Token, noch unter **v4.24**:

| Messung | Ergebnis |
|---|---|
| `PATCH status: pencilled → confirmed` (Crew-Token, eigener Record) | **200** — Status stand danach auf `confirmed` |
| `POST` Zweitrecord für denselben Slot (`plan_id`+`date`+`pos_id`) | **200**, Record wurde angelegt |
| Kontrollprobe: derselbe `PATCH` auf einen **fremden** Record | **404** (updateRule greift) |

Die Kontrollprobe ist der Punkt: Ohne sie hieße „200" nur „irgendetwas antwortet". Beide von dir
beschriebenen Wege sind damit als real belegt, nicht nur als plausibel.

**Zur Falle aus dem Runbook:** Sie ist genau so eingetreten. Die Test-DB hat 853 `assignments`,
davon 33 `pencilled` — **alle** auf `marco@hoch-online.com`, für die es keinen `users`-Datensatz
gab. Ich habe deshalb vorübergehend ein Crew-Konto für diese Adresse angelegt (`users.createRule`
ist `@collection.crew_members.email ?= email`, die Adresse steht in `crew_members` — also der
reguläre App-Weg) und es nach der Messung wieder gelöscht. Details unter „Aufgeräumt".

## 2. Nach dem Deploy von v4.25 auf Test

| # | Messung | erwartet | gemessen |
|---|---|---|---|
| 1 | vorgemerkt → bestätigt (Crew) | 400 `status_transition_denied` | 400, **aber ohne diesen Fehlercode** |
| 2 | vorgemerkt → **abgesagt** (Crew) | **200** | **400** ❌ |
| 3 | Zweitrecord (Crew) | 400 `assignment_create_denied` | 400, **aber ohne diesen Fehlercode** |
| 4 | `/api/health` | 200 | 200 ✅ |
| 5 | Statuswechsel als **Superuser** | 200 | **400** ❌ |
| 6 | `PATCH` **ohne** `status`-Feld (nur `crew_name`) | 200 | **400** ❌ |

Antwortkörper in allen Fällen:

```json
{"data":{},"message":"Something went wrong while processing your request.","status":400}
```

Zwei Dinge fallen daran auf, und beide sind wichtiger als der Statuscode:

- In **keinem** Body stand `status_transition_denied` oder `assignment_create_denied`.
- Im Container-Log stand **keine** der `console.log`-Zeilen, die in beiden Hooks unmittelbar
  **vor** dem `throw` sitzen.

Ein `400` allein hätte hier wie ein Erfolg ausgesehen — Zeile 1 und 3 liefern schließlich
„die erwartete Zahl". Erst Zeile 2, 5 und 6 zeigen, dass der Hook nicht prüft, sondern platzt.

## 3. Ursache — zwei unabhängige Laufzeitfehler

Der echte Fehlertext steht **nicht** im Container-Log, sondern in PocketBases interner Log-DB:

```bash
sqlite3 -readonly «PB-DATA»/auxiliary.db \
  "SELECT created, message, data FROM _logs ORDER BY created DESC LIMIT 10;"
```

```
PATCH …/assignments/…   "error":"TypeError: Object has no member 'originalCopy' at /pb.js:5:30(14)"
POST  …/assignments     "error":"ReferenceError: _istPlaner is not defined at /pb.js:3:26(13)"
```

### (a) `record.originalCopy()` existiert in PocketBase 0.39.9 nicht

In PocketBase 0.23 wurde `originalCopy()` zu **`original()`** umbenannt. Der Aufruf steht in
Zeile 305 **unbedingt vor** dem `if` — deshalb scheitert *jeder* PATCH auf `assignments`, auch
einer ganz ohne `status`-Feld und auch als Superuser (Messung 5 und 6).

### (b) Hook-Handler sehen die Top-Level-Deklarationen der Datei nicht

Jeder Handler läuft in einer eigenen VM, in der er als `/pb.js` erscheint. `_istPlaner`,
`isCrewStatusTransitionAllowed` und die Tabelle `CREW_STATUS_TRANSITIONS` stehen auf oberster
Ebene der Datei und sind darin **nicht sichtbar** — daher der `ReferenceError` in Zeile 3 des
Create-Handlers.

Der bestehende Mail-Hook macht es unbewusst richtig: `sendMail`, `esc` und `fmtISO` sind
**innerhalb** des Handlers definiert. Das ist dieselbe Klasse wie der Goja-Scope-Fehler aus
v1.9 (`APP_URL` als äußeres `const`), nur diesmal mit Funktionsdeklarationen statt Konstanten.

### Warum die Reihenfolge der Fehler stimmt

Der Update-Hook stirbt in Zeile 5 an (a) und erreicht `_istPlaner` in Zeile 8 nie. Der
Create-Hook hat kein `originalCopy()` und stirbt deshalb in Zeile 3 an (b). Beide Fehler sind
damit unabhängig voneinander belegt — nicht einer als Folge des anderen.

## 4. Warum die Tests das nicht gefunden haben

`tests/statusguard.test.mjs` vergleicht die Übergangstabelle im Hook mit der in `js/pure.js`.
Das ist eine **statische** Prüfung des Datenteils. Sie kann nicht sehen, dass die Tabelle zur
Laufzeit in einem Scope liegt, den der Handler nicht erreicht, und sie kennt die
PocketBase-Record-API nicht. Grün heißt hier: „die beiden Tabellen sind gleich" — nicht: „der
Guard läuft".

## 5. Vorschlag für den Fix

Zwei Änderungen, beide klein:

**1. `originalCopy()` → `original()`** — an **beiden** Stellen (Zeile 305 im neuen Guard,
Zeile 388 im bestehenden Mail-Hook, siehe Nebenbefund unten).

**2. Die drei Helfer in beide Handler hineinziehen**, so wie `sendMail`/`esc` es schon machen.
Bewusst doppelt, einmal je Handler — eine gemeinsame Definition auf oberster Ebene ist genau
das, was nicht funktioniert:

```js
onRecordUpdateRequest(function(e) {
  // ── innerhalb des Handlers, sonst unsichtbar (siehe /pb.js-Isolation) ──
  var CREW_STATUS_TRANSITIONS = {
    proposed:  ['confirmed', 'declined'],
    confirmed: ['declined'],
    pencilled: ['declined'],
    cancelled: ['cancel_acked']
  };
  var erlaubt = function(from, to) {
    if (!from) return to === 'confirmed' || to === 'declined';
    var l = CREW_STATUS_TRANSITIONS[from];
    return !!l && l.indexOf(to) !== -1;
  };
  var istPlaner = function(auth, planId) {
    if (!auth) return false;
    var rolle = auth.getString('role');
    if (rolle === 'superadmin' || rolle === 'manager') return true;
    try {
      var plan = $app.findRecordById('plans', planId);
      return !!plan && plan.getString('owner') === auth.id;
    } catch (err) { return false; }
  };

  var auth = e.auth;
  var rec  = e.record;
  var neu  = rec.get('status');
  var alt  = rec.original().get('status');      // ← original(), nicht originalCopy()
  …
```

Der Create-Hook braucht `istPlaner` genauso als lokale Funktion; die Übergangstabelle dort nicht.

**Wenn die Tabelle für `tests/statusguard.test.mjs` auffindbar bleiben soll**, ist die Frage, ob
der Test das Vorkommen *innerhalb* des Handlers noch findet — das entscheidest besser du, es hängt
an seinem Suchmuster.

Ein Gedanke zum Zuschnitt, unabhängig vom Fehler: `alt !== neu` steht schon im `if`. `original()`
erst *dort* aufzurufen statt vorher würde jeden PATCH ohne Statusänderung ganz am Guard
vorbeiführen — dann kann ein Fehler in diesem Zweig auch nie Schreibvorgänge treffen, die ihn
gar nichts angehen. Das ist kein Muss, aber es hätte die Messungen 5 und 6 oben verhindert.

## 6. Nebenbefund — Zeile 388 im **laufenden** v4.24

```js
try {
  var orig = r.originalCopy();
  if (orig && orig.get('status') === 'proposed') { …; return; }   // „keine zweite Anfrage-Mail"
} catch(_) {}
```

Derselbe nicht existierende Aufruf, hier aber in `try { } catch(_) {}` — der Fehler wird also
still verschluckt und die Funktion läuft weiter. Die Prüfung „Status war schon `proposed`, also
keine zweite Mail" hat damit **vermutlich noch nie gegriffen**; ein erneutes `proposed` schickt
eine weitere Anfrage-Mail.

**Das ist aus dem Code geschlossen, nicht gemessen** — Test hat keinen `RESEND_KEY`, und auf Live
wollte ich dafür keine echten Mails auslösen. Über den Log-Eintrag
`[hook] UPDATE proposed: Status unverändert, kein E-Mail gesendet` lässt es sich auf Test
nachweisen (er dürfte nie erscheinen); sag Bescheid, dann messe ich das nach.

## 7. Aufgeräumt

- **Test zurück auf v4.24**, Backup des Vorzustands: `/root/backups/pb-hooks/main.pb.js.test.20260909-183903`
- **Testdaten unverändert:** 853 `assignments`, davon 33 `pencilled` — identisch zur Baseline.
  Der in der Baseline angelegte Zweitrecord ist gelöscht, der geänderte Record steht wieder auf `pencilled`.
- **Temporäre Konten gelöscht:** das Crew-Konto für `marco@hoch-online.com` und ein temporärer
  Superuser (nur für Anlegen/Löschen dieses Kontos nötig, weil `users.deleteRule` auf `superadmin`
  steht). Die `users`-Tabelle auf Test hat wieder genau einen Datensatz, die Superuser-Liste wieder
  die ursprünglichen zwei. Passwörter waren Einmalwerte und sind vernichtet.
- **Keine Mail konnte dabei rausgehen:** Test hat kein `RESEND_KEY` gesetzt und PocketBases eigenes
  SMTP steht auf `enabled: false`.
- `crew_invites.createRule` auf Test geprüft: **leer** ✅

## 8. Was jetzt offen ist

- **Die Lücke auf Live besteht unverändert.** Sie ist oben als real belegt — mit einem Crew-Token
  und einem `curl` lässt sich jeder Status setzen. Das Frontend v0.13.0 nimmt der Crew die falsche
  Frage, mehr nicht.
- Sobald eine korrigierte Fassung im Repo liegt, fahre ich denselben Weg noch einmal: Baseline,
  Test-Deploy, dieselben sechs Messungen, und Live erst, wenn Messung 1 **`400 status_transition_denied`**
  und Messung 2 **`200`** liefert.
- Auf **Live** kann ich den Guard nach dem Deploy nicht mit einem Crew-Token gegenmessen, ohne dort
  ein Konto anzulegen — das mache ich nicht. Wenn du mir für die Live-Messung einen Testzugang
  (Crew-Rolle, mit mindestens einem vorgemerkten Einsatz) gibst, ist der Nachweis dort genauso
  belastbar wie auf Test. Sonst bleibt für Live: Version im Log, Regressionen, `/api/health` — und
  der Guard wäre dort „geladen, aber nicht gewirkt", also genau das, was wir beide nicht wollen.
- Unberührt und weiterhin offen wie im Auftrag beschrieben: `assignments.createRule`/`deleteRule`
  und der fehlende Unique-Index auf `(plan_id, date, pos_id)`.

## Anhang — Messrezept zum Nachvollziehen

```bash
BASE=https://api-test.crewplanner.nyxlightwork.de
TOK=$(curl -s -X POST "$BASE/api/collections/users/auth-with-password" \
      -H 'Content-Type: application/json' \
      -d '{"identity":"<CREW-MAIL>","password":"<PW>"}' \
      | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
REC=<assignments-ID dieser Person mit status=pencilled>

# 1 muss 400 + status_transition_denied sein
curl -s -o /tmp/a.txt -w "1 vorgemerkt -> bestaetigt: %{http_code}\n" \
  -X PATCH "$BASE/api/collections/assignments/records/$REC" \
  -H "Authorization: $TOK" -H 'Content-Type: application/json' -d '{"status":"confirmed"}'
grep -o 'status_transition_denied' /tmp/a.txt || echo "   FEHLERCODE FEHLT -> Hook platzt, statt zu pruefen"

# 2 muss 200 sein (Gegenprobe: Absagen bleibt erlaubt)
curl -s -o /dev/null -w "2 vorgemerkt -> abgesagt:   %{http_code}\n" \
  -X PATCH "$BASE/api/collections/assignments/records/$REC" \
  -H "Authorization: $TOK" -H 'Content-Type: application/json' -d '{"status":"declined"}'

# 6 muss 200 sein — PATCH ohne Statusfeld darf den Guard gar nicht erst betreffen
curl -s -o /dev/null -w "6 PATCH ohne status:        %{http_code}\n" \
  -X PATCH "$BASE/api/collections/assignments/records/$REC" \
  -H "Authorization: $TOK" -H 'Content-Type: application/json' -d '{"crew_name":"Test"}'
```

Und wenn ein `400` unerklärt bleibt — der Grund steht nie im Container-Log, sondern hier:

```bash
sqlite3 -readonly «PB-DATA»/auxiliary.db \
  "SELECT created, message, data FROM _logs WHERE level > 0 ORDER BY created DESC LIMIT 5;"
```
