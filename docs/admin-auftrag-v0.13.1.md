# Auftrag an den Admin — v0.13.1 (zur Kenntnis + ein Klick auf Live)

**Datum:** 2026-09-11 · **Betrifft:** Frontend v0.13.0 → v0.13.1, `nginx.conf`, Tests
**Hook:** v4.26, **unverändert** — kein Hook-Deploy, kein Neustart, keine PB-Regeln.
**Stand:** Test und Live sind schon ausgerollt (`main` = `live` = `5a746be`). Coolify hat
selbst nachgezogen, auf dem Server ist nichts zu tun.

---

## Was sich geändert hat

**1. Tests laufen vor jedem Push.** Neu ist `.githooks/pre-push`: Er lässt `node tests/run.mjs`
unter `TZ=Europe/Berlin` und `TZ=UTC` laufen und bricht den Push bei Rot ab. Bisher gab es weder
CI noch Hooks, und `main:live` ging ungeprüft raus.

**Für dich wichtig:** Du lädst über die GitHub-Weboberfläche hoch („Add files via upload"), und
das läuft an jedem Git-Hook vorbei. Das ist in Ordnung, deine Uploads sind Rückmeldungen und
Messberichte. Sie werden beim nächsten Push von Marco mitgeprüft, auch vom neuen Unicode-Test
(Punkt 3). Solltest du irgendwann doch lokal klonen und pushen, dann bitte einmal in diesem
Clone:

```bash
git config core.hooksPath .githooks
```

**2. Neuer Header: `Permissions-Policy`.** In `nginx.conf` stehen `camera=(), microphone=(),
geolocation=(), payment=(), usb=()` mit `always`. Die Zwischenablage ist **bewusst nicht**
gesperrt, weil „Link kopieren" in `admin.html` und `js/userView.js` sie über
`navigator.clipboard` benutzt. `tests/delivery.test.mjs` schlägt an, falls sie jemand sperrt.

**3. Neuer Test: `tests/unicode.test.mjs`.** Er schlägt bei unsichtbaren Zero-Width- und
Bidi-Steuerzeichen an. Die sieht man weder im Editor noch im GitHub-Diff, ein Sprachmodell liest
sie aber mit. Das Repo ist sauber. Falls er einmal wegen einer hochgeladenen Datei rot wird,
nennt er Datei, Zeile, Spalte und Codepoint.

## Schon gemessen (2026-09-11, gegen `crewplanner.nyxlightwork.de`)

| Messung | Ergebnis |
|---|---|
| Versionsmarker in `index.html` | `Personalplan · v0.13.1` ✅ |
| Header auf `/` (200) | CSP, **Permissions-Policy**, Referrer-Policy, HSTS, `nosniff`, `X-Frame-Options: DENY` ✅ |
| Header auf einer 404-Seite | alle sechs genauso ✅ (`always` wirkt) |
| Tests | 280/280 grün unter beiden Zeitzonen |

Jeder der drei neuen Guards ist mit Gegenprobe gemessen: absichtlich gebrochen, rot gesehen,
zurückgebaut. Der Push mit einem absichtlich roten Test ging gegen ein Wegwerf-Repo, dort kam
nichts an.

## Einzige Bitte: einmal „Link kopieren" auf Live

Das kann `curl` nicht messen. Die Permissions-Policy lässt die Zwischenablage absichtlich offen,
aber ob der Browser das auf Live genauso sieht, zeigt nur ein echter Klick:

1. Auf `crewplanner.nyxlightwork.de` im Admin-Bereich eine Tour öffnen, **für die schon ein
   öffentlicher Link existiert**. Dann ist in der Karte „Öffentlicher Link" die Zeile
   „Kurzlink" mit dem Knopf **„Kopieren"** sichtbar.
2. **Nur „Kopieren" klicken** (`copyShortLink()`, `admin.html:704`). **Nicht** „Link
   generieren" oder „Neu generieren". Das schreibt auf Live-Daten und gehört nicht zu dieser
   Messung. Hat keine Tour einen Link, bitte die Messung auslassen und das so melden.
3. Erwartet wird die Meldung **„Kurzlink kopiert ✓"**. „Kopieren fehlgeschlagen" wäre der
   Befund.
4. Zur Sicherheit in ein Textfeld einfügen, es muss der Kurzlink ankommen. In der Konsole (F12)
   darf **kein** Hinweis zu `Permissions-Policy` oder `clipboard` stehen.

Kommt der Link nicht an oder steht dort ein Policy-Hinweis, bitte kurz melden, **nichts selbst
ändern**. Dann liegt es an der Header-Zeile in `nginx.conf`, und das korrigieren wir über den
normalen Weg.

## Danach

- Dieses Dokument oben mit dem Ergebnis des Klicks stempeln, wie bei v4.26.
- Unberührt und weiterhin offen: `assignments.createRule`/`deleteRule` und der fehlende
  Unique-Index auf `(plan_id, date, pos_id)`.
