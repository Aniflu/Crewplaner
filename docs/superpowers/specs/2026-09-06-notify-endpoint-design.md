# Ein serverseitiger Endpoint für alle Mail-auslösenden Vorgänge

Stand: 2026-09-06 · betrifft `.pb_hooks/main.pb.js`, `js/dataService.js`, `admin.html`,
`js/userView.js`, `js/crewNotify.js`

---

## Warum

Beim Einladen eines neu angelegten Crew-Mitglieds in „Provinz 2027" kam „Too many requests",
die Einladung ging nicht raus. An der Live-Instanz nachgemessen: PocketBase läuft mit der
Regel **`*:create` = 20 Anfragen pro 5 Sekunden**, und im Log beider Versuche steht dasselbe
Muster — 20 × `POST 200` auf `assignments/records`, dann der 21. mit **429**.

v0.10.6 hält die Grenze jetzt client-seitig ein (`_drossel` in `js/pb.js`, max. 18 Anlagen
pro 5 Sekunden). Das behebt das Symptom, nicht die Ursache. Die Ursache ist, dass **ein
fachlicher Vorgang — „diese Person für 25 Termine anfragen und einladen" — als 26 einzelne
HTTP-Schreibvorgänge modelliert ist.**

Vier Schwächen bleiben deshalb bestehen:

1. **Die Drossel zählt pro Browser-Tab, der Server pro IP.** Zwei offene Tabs oder zwei
   Personen gleichzeitig teilen sich das Serverlimit, unsere Buchführung nicht.
2. **Der Vorgang ist nicht atomar.** Das Anlegen kann zur Hälfte durchlaufen und die Mail
   danach scheitern: Slots stehen auf „angefragt", die Person weiß nichts davon. v0.10.5 hat
   nur die *Falschmeldung* darüber behoben — der inkonsistente Zustand selbst ist vom Client
   aus nicht verhinderbar.
3. **Die Konstante `18` dupliziert Serverwissen.** Ändert jemand die Regel auf 10, ist sie
   still falsch.
4. **Die Wartezeit wächst mit der Tour** (25 Termine ≈ 7 s, 60 ≈ 15 s).

Ein Server-Endpoint löst alle vier auf, statt sie zu umgehen: Eine Anfrage kann keine
Mengengrenze reißen, egal wie viele Tabs offen sind.

## Ziel

Alle sechs Mail-auslösenden Vorgänge laufen über **einen** authentifizierten Endpoint, der
die betroffenen Datensätze und den Mail-Auslöser in **einer Transaktion** schreibt.

Nicht-Ziele: das Mail-Rendering im Hook (rund 250 Zeilen HTML) anfassen; das Datenmodell
ändern; Vormerkungen/Bestätigungen/Statuswechsel umstellen (die lösen keine Mail aus und
bleiben auf dem direkten, gedrosselten Weg).

---

## Der Vertrag

```
POST /notify          (authentifiziert, wie alle bestehenden Hook-Routen)
{ type, planId, crewName, crewEmail,
  slots?, removeSlots?, proposedBy?, customMessage? }

→ 200 { ok: true, angelegt: 12, aktualisiert: 3, geloescht: 0 }
→ 400 unbekannter Typ oder fehlende Pflichtfelder
→ 404 das Konto darf für diese Tour nicht handeln
```

Zwei Felder ergeben sich aus dem bestehenden Code und wurden beim ersten Entwurf übersehen:

- **`removeSlots`** — die Absage in `admin.html` **löscht** vor dem Mailversand Records
  (`pbDelete` je Slot). Ohne dieses Feld bliebe ausgerechnet der Absage-Vorgang weiterhin
  halb-abbrechbar. Die Löschung gehört in dieselbe Transaktion.
- **`proposedBy`** — der Crew-Update-Weg in `userView.js` schreibt `proposed_by: 'update'`,
  und `userView.js:211` liest das wieder aus (`si?.proposedBy === 'update'` → „geändert").
  Der Server darf das nicht auf `'bulk'` vereinheitlichen. Standard bleibt `'bulk'`.

**404 statt 403** — wortgleich zu `/myplan` und `/planstatus`: die Ablehnung verrät nicht,
ob es die Tour überhaupt gibt.

Der Client schickt **fachliche Daten und baut das Transportformat der Mail nicht mehr
selbst.** Heute stopft er je nach Typ mal eine URL, mal ein JSON-Slot-Array in dasselbe Feld
`app_url` — daher die 5000-Zeichen-Falle, die schon einmal zugeschlagen hat (`_schlankeSlots`,
`APP_URL_GRENZE` in `dataService.js`). Künftig füllt der Server das Feld und prüft die Länge
dort, wo die Grenze gilt.

### Typ-Tabelle

Statt verstreuter `if`-Zweige eine Tabelle im Handler — sie ist die Rechteprüfung:

| Typ | wer darf | darf Slots mitschicken |
|---|---|---|
| `invite` | Owner der Tour / superadmin | **ja** |
| `update` | Owner der Tour / superadmin | **ja** |
| `reminder` | Owner der Tour / superadmin | **ja** |
| `cancellation` | Owner der Tour / superadmin | nein |
| `availability` | Crew-Mitglied **dieser** Tour, nur für sich selbst | nein |
| `staff_invite` | superadmin | nein (hat keine Tour) |

Die Spalte heißt bewusst **„darf mitschicken"** und nicht „legt an": Der Server schreibt, was
er bekommt. Das ist kein Detail — `sendInvite` in `crewNotify.js` legt die Slots heute
**unabhängig vom Typ** an, also auch beim `reminder`, während der Admin-Weg beim `reminder`
keine schreibt. Eine Tabelle, die „reminder → nein" festlegt, hätte beim Umbau stillschweigend
Verhalten geändert. `slots` bleibt optional; beide heutigen Wege bilden sich unverändert ab.

`staff_invite` auf superadmin entspricht der geltenden `crew_invites.createRule`: ohne
`plan_id` greift dort ohnehin nur der superadmin-Zweig.

Die Owner-Prüfung wird aus `/myplan` übernommen (`plan.getString('owner') === auth.id ||
auth.getString('role') === 'superadmin'`), die Crew-Prüfung aus derselben Route
(`crew_members` mit `plan_id` + `email`). `availability` zusätzlich: die angegebene
Mailadresse muss die des angemeldeten Kontos sein — sonst könnte ein Crew-Konto im Namen
einer anderen Person melden.

## Transaktion und Fehlerverhalten

Slots **und** Auslöse-Record entstehen in einem `$app.runInTransaction`. Weil der Mail-Hook
an `onRecordAfterCreateSuccess` hängt, feuert er erst **nach** dem Commit. Damit gilt:
entweder stehen alle Termine und die Mail geht raus, oder nichts ist passiert und es geht
auch keine Mail. Der halbe Zustand ist strukturell ausgeschlossen, nicht bloß
unwahrscheinlicher.

Eine Mail ist ein externer HTTP-Aufruf und kann nie Teil einer Datenbank-Transaktion sein.
Scheitert Resend selbst, bleibt das wie heute im `email_log` mit `success: false` sichtbar;
die Daten sind davon unberührt.

Das Anlegen bleibt **idempotent**: existiert ein Slot bereits (gleicher `plan_id` + `date` +
`pos_id`), wird er aktualisiert statt verdoppelt. Ein zweiter Klick nach einem Fehlschlag
erzeugt keine Geisterdatensätze.

## Umstellung

**Reihenfolge, und die ist nicht verhandelbar.** Der Hook muss vor dem Frontend live sein,
sonst ruft die App eine Route auf, die es nicht gibt. Dieses Projekt hat die Falle schon
getreten — im Hook steht die Warnung wörtlich am `/myplans`-Umbau („MUSS vor dem Zumachen
der Regel ausgerollt sein, sonst findet kein Crew-Mitglied mehr seine Tour").

1. Route additiv deployen (niemand ruft sie auf, nichts kann brechen)
2. Auf der Test-Instanz nachmessen, dass sie tut, was sie soll
3. Frontend umstellen — alle neun Aufrufstellen in einem Zug
4. `crew_invites.createRule` zumachen (Entscheidung vom 2026-09-06: sauberer Schnitt,
   zusammen mit Schritt 3)

**Neun Aufrufstellen**: vier in `js/dataService.js` (`sendCrewInvite`, `sendUpdateNotice`,
`sendCancellationNotice`, `sendAvailabilityNotice`), fünf in `admin.html` (`staff_invite`,
`sendAdminEmail`, `sendAdminInvite`, `sendAdminUpdate`, Absage). `bulkProposeCrew` fällt aus
dem Einladen-Pfad heraus — das macht der Server. `_pbRoute` in `dataService.js` kann heute
nur GET und braucht POST.

**Das Risiko dieses Schnitts** — eine übersehene Aufrufstelle fällt sofort und für alle aus —
wird maschinell ausgeschlossen: siehe Vollständigkeits-Wächter unten.

**Die Drossel in `js/pb.js` bleibt.** Sie ist dann kein Krückstock mehr, sondern das Netz für
alles, was weiterhin direkt schreibt: Vormerkungen, Bestätigungen, Statuswechsel.

## Absicherung

Hook-Code läuft in Goja, nicht in Node — die Suite kann ihn nicht ausführen. Deshalb zwei
Ebenen, und die erste ist ehrlich als das zu benennen, was sie ist: ein Textwächter beweist
Struktur, keine Funktion.

**Ebene 1 — Wächter über `main.pb.js`** (Muster wie `tests/cors.test.mjs`,
`tests/feed.test.mjs`, `tests/crewprivacy.test.mjs`):

- die Route prüft Rechte, bevor sie schreibt
- sie schreibt in `runInTransaction`
- sie gibt keine Mailadressen und keine Datensatz-IDs zurück
- jeder der sechs Typen ist in der Typ-Tabelle vertreten

**Ebene 2 — Vollständigkeits-Wächter über das Frontend** (der eigentliche Schutz für den
sauberen Schnitt): kein `pbPost` auf `crew_invites/records` mehr in `js/` oder `admin.html`.
Solange irgendwo einer steht, ist die Suite rot — eine unvollständige Umstellung kann nicht
live gehen.

**Ebene 3 — Abnahme auf der Test-Instanz.** Dort ist **kein `RESEND_KEY`** gesetzt, der Hook
überspringt den Mailversand ausdrücklich und schreibt trotzdem die Records: Der echte Vorgang
lässt sich durchspielen, ohne dass jemand Post bekommt. Einschränkung, die schon im
README-Kasten steht: Die Test-DB hat einen einzigen `users`-Datensatz, der zu keinem
`assignments` passt — „eine grüne Messung auf Test kann also heißen: nichts gemessen." Für
eine belastbare Abnahme braucht es dort einen Plan mit passendem Konto. **Das Anlegen dieser
Testdaten ist ein schreibender Eingriff in die Test-DB und wird vorher freigegeben.**

## Offene Punkte, bewusst nicht Teil dieses Umbaus

- **`assignments.createRule` = `@request.auth.id != ""`** — jedes angemeldete Konto darf
  Einsätze in jeder Tour anlegen (`deleteRule` ebenso). Zumachen lässt sich das erst, wenn
  auch Vormerkungen und Statuswechsel serverseitig laufen. Eigener Vorgang.
- **`crew_invites` wächst unbegrenzt** und enthält Mailadressen: Der Hook löscht den
  Auslöse-Record nach dem Versand nicht, obwohl der Kommentar in `dataService.js` das
  behauptet.
- **PB-Regeln überleben einen Redeploy/Reimport nicht zuverlässig** (siehe bisherige
  Erfahrung im Projekt) — die Härtung aus Schritt 4 gehört in den Redeploy-Runbook.
