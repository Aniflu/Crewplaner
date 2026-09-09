# Auftrag an den Admin — Hook v4.26 deployen (Korrektur des gescheiterten v4.25)

> ✅ **Erledigt am 2026-09-09.** v4.26 auf Test und Live (`sha 8f642184…`), beide Instanzen
> healthy, `RestartCount: 0`. Alle **sechs** Messungen auf Test wie erwartet:
>
> | # | Messung | gemessen |
> |---|---|---|
> | 1 | vorgemerkt → bestätigt (Crew) | **400 · `status_transition_denied`** ✅ |
> | 2 | vorgemerkt → abgesagt (Crew) | 200 ✅ |
> | 3 | Zweitrecord (Crew) | **400 · `assignment_create_denied`** ✅ |
> | 4 | `/api/health` | 200 ✅ |
> | 5 | Superuser-Statuswechsel | 200 ✅ |
> | 6 | `PATCH` ohne `status`-Feld | 200 ✅ |
>
> Messung 1 und 3 tragen den **Fehlercode im Body** — das ist der Unterschied zu v4.25, wo
> dieselben Zeilen zwar 400 lieferten, aber ohne Code, weil der Hook platzte statt zu prüfen.
> Zusammen mit 2, 5 und 6 ist damit belegt: Der Guard prüft, statt pauschal abzuweisen.
>
> **Damit ist die gemeldete Lücke geschlossen** — ein Crew-Token kann `pencilled → confirmed`
> nicht mehr setzen, auch nicht per `curl` an der App vorbei.
>
> 📌 **Offen geblieben** (siehe unten, kein Mangel des Deploys):
> die Gegenmessung mit Crew-Token auf **Live** (braucht einen Testzugang), die Nachmessung des
> Mail-Nebenbefunds, und die Durchklick-Liste (`/notify`, Manager-Sammelvorgänge, „GESEHEN ✓").
>
> Dieses Dokument bleibt als Verlauf stehen.

**Datum:** 2026-09-09 · **Betrifft:** `.pb_hooks/main.pb.js` (v4.24 live → v4.26)
**Vorgeschichte:** `docs/rueckmeldung-hook-v4.25-2026-09-09.md` · **Ersetzt:** `admin-auftrag-hook-v4.25.md`
**Frontend:** v0.13.0, unverändert — schon ausgerollt, hier ist nichts zu tun.

---

## Zuerst: Dein Befund war in beiden Punkten richtig

Beide Laufzeitfehler am Code nachvollzogen, beide behoben. Die Messreihe hat genau das
geleistet, was ein Blick ins Log nicht kann — dass Messung 1 und 3 „die erwartete Zahl"
lieferten, während Messung 2, 5 und 6 den Hook als platzend entlarvten, ist der Grund, warum
das nicht live gegangen ist.

Zum zweiten Punkt noch eine Verschärfung, die beim Nachprüfen herauskam: Meine drei
Deklarationen waren die **einzigen** auf oberster Ebene der gesamten Datei. Alles andere —
`sendMail`, `esc`, `fmtISO`, `LABEL` — liegt seit jeher handler-lokal. Mein Kommentar berief
sich als Vorbild ausgerechnet auf die `LABEL`-Map, und die steht **innerhalb** ihres Handlers.
Ich habe ein Muster behauptet, das die Datei gar nicht hat.

## Warum die Nummer auf 4.26 springt

Du hast ein v4.25 gemessen. Bliebe die Nummer, zeigte `docker logs` denselben Stand für zwei
verschiedene Dateien — und die erste Frage jeder Fehlersuche („welche Version läuft?") ginge
wieder ins Leere. Im Log muss künftig **`[hook] main.pb.js v4.26 geladen`** stehen.

## Was sich gegenüber v4.25 geändert hat

**1. `originalCopy()` → `original()`**, an beiden Stellen — im Guard und im Mail-Hook
(dein Nebenbefund, siehe unten).

**2. Alle Helfer stehen jetzt INNERHALB der Handler**, bewusst doppelt: Übergangstabelle und
`erlaubt()` im Update-Handler, `istPlaner()` in beiden. Über der Stelle steht der Grund als
Kommentar, damit es niemand „aufräumt".

**3. Reihenfolge umgestellt — das ist deine Anregung, in ihrer stärksten Form.** Der Guard
sortiert jetzt erst alles aus, was ihn nichts angeht, und liest **danach** erst den Vorzustand:

```
if (!auth)                                  → durchlassen
if (istPlaner(auth, plan_id))               → durchlassen      ← Planer berührt original() nie
if (crew_email !== eigene Adresse)          → durchlassen      ← updateRule fängt das ohnehin
                                            ↓
                        erst hier: rec.original().get('status')
```

Damit kann ein Fehler in diesem Zweig **nur noch Crew-Statuswechsel** treffen statt jeden
Schreibvorgang auf der Collection. Deine Messungen 5 (Superuser) und 6 (PATCH ohne
`status`-Feld) laufen jetzt am Guard vorbei, ohne ihn überhaupt zu betreten.

Bewusst **kein** `try/catch` um den Guard: Ein Sicherheits-Check, der bei einem Fehler
durchwinkt, ist keiner. Die Beschränkung des Wirkungsbereichs oben ist der Ersatz dafür.

## Was die Tests jetzt zusätzlich abfangen

Die Suite konnte den Fehler nicht finden — sie prüfte den *Datenteil*, während der *Code* nie
lief. Zwei neue Wächter holen nach, was statisch überhaupt prüfbar ist, beide gegengeprüft
(künstlich ausgelöst, beide schlagen an):

- **keine Deklaration auf oberster Dateiebene** im Hook (nennt Zeilennummer und Zeile),
- **kein `originalCopy(`** irgendwo, mit Gegenprobe, dass `original()` überhaupt vorkommt.

Was sie weiterhin **nicht** können: beweisen, dass der Guard auf dem Server greift. Das bleibt
deine Messreihe.

## Deploy

Unverändert nach `docs/admin-runbook-hook-deploy.md` — Test zuerst, messen, dann Live. Es gilt
weiter, was im v4.25-Auftrag oben stand: **Diese Hooks sind blockierend.** Ein Fehler nimmt der
Crew das Bestätigen und Absagen.

## Messen — deine Messreihe, unverändert übernommen

Bitte **dieselben sechs Messungen** wie beim letzten Mal; sie haben sich bewährt. Das Rezept
steht im Anhang deiner Rückmeldung. Erwartet wird jetzt:

| # | Messung | erwartet |
|---|---|---|
| 1 | vorgemerkt → bestätigt (Crew) | **400 + `status_transition_denied` im Body** |
| 2 | vorgemerkt → **abgesagt** (Crew) | **200** |
| 3 | Zweitrecord (Crew) | **400 + `assignment_create_denied` im Body** |
| 4 | `/api/health` | 200 |
| 5 | Statuswechsel als **Superuser** | **200** |
| 6 | `PATCH` ohne `status`-Feld | **200** |

**Der Fehlercode im Body ist der eigentliche Nachweis, nicht die 400.** Fehlt er bei 1 oder 3,
platzt der Hook wieder, statt zu prüfen — dann bitte wie beim letzten Mal zurückrollen und
nicht auf Live gehen. Und wenn ein `400` unerklärt bleibt: der Grund steht in `auxiliary.db`,
nicht im Container-Log — dein `sqlite3`-Einzeiler hat das gezeigt und gehört ab jetzt in die
Routine.

Zusätzlich in der App durchklicken (findet kein `curl`): Manager-Sammelvorgänge, Vormerken,
„→ Jetzt anfragen", Einladen über `POST /notify`, „GESEHEN ✓" aus einer Absage-Mail, und der
Login eines Crew-Kontos mit **nur** Vormerkungen (kein Fenster, aber über die Schaltfläche
erreichbar und absagbar).

## Dein Nebenbefund — behoben, und ich nehme dein Angebot an

`r.originalCopy()` im Mail-Hook steckte in `try { } catch(_) {}`. Der Aufruf ist auf
`original()` korrigiert; das `catch` bleibt bewusst stehen, weil hier die harmlose Richtung
gilt (fällt die Prüfung aus, geht eine Mail zu viel raus — beim Guard wäre es umgekehrt, und
deshalb steht dort keins).

**Ja, bitte miss das auf Test nach.** Der Nachweis ist die Zeile
`[hook] UPDATE proposed: Status unverändert, kein E-Mail gesendet` — sie dürfte bisher **nie**
erschienen sein und muss ab v4.26 erscheinen, wenn ein bereits `proposed`-Datensatz erneut auf
`proposed` gesetzt wird. Kein `RESEND_KEY` nötig, es geht nur um die Logzeile.

## Was ich nicht prüfen konnte

Weiterhin offen und ausdrücklich als Bitte, nicht als Behauptung: dass **`POST /notify`** von
den Guards unberührt bleibt. Es schreibt über `$app.runInTransaction`, sollte also nicht durch
die Record-Hook-Kette laufen — aber das ist aus dem Code geschlossen, und genau diese Sorte
Schluss hat sich bei v4.25 als falsch erwiesen.

## Zur Live-Messung

Dein Punkt, dass du auf Live ohne Testkonto nicht gegenmessen kannst, steht. Das entscheidet
Marco — ohne einen Crew-Zugang mit mindestens einem vorgemerkten Einsatz bliebe der Guard auf
Live „geladen, aber nicht gewirkt".

## Aufräumen auf Test

Nichts weiter nötig — du hast die Baseline sauber wiederhergestellt (853 `assignments`, 33
`pencilled`, Zweitrecord gelöscht, temporäre Konten weg). Falls wieder ein Crew-Konto nötig
ist, gerne denselben Weg.

## Danach

- Hook-Version in `docs/database-schema.md` nachziehen (steht dort als „v4.26 — im Repo, NOCH
  NICHT deployt") und dieses Dokument oben mit dem Ergebnis stempeln.
- Wie nach jedem Redeploy: `crew_invites.createRule` muss **leer** sein.
- Unberührt und weiterhin offen: `assignments.createRule`/`deleteRule` und der fehlende
  Unique-Index auf `(plan_id, date, pos_id)`.
