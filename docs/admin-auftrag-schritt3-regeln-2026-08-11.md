# Auftrag an den Admin — Schritt 3 ist freigegeben

**Datum:** 2026-08-11 · **Betrifft:** v0.8.1 / Hook v4.20 · **Vorgänger:** `docs/admin-runbook-crew-nur-namen-v0.8.1.md`

---

## Kurz

**Schritt 2 ist erledigt und gemessen. Du kannst Schritt 3 machen.**

Deine Frage war, ob du in Abständen selbst prüfen sollst oder auf ein Signal wartest.
**Weder noch — du musst nie pollen.** Der Go-Live ist ein `git push` ohne Server-Zugang;
Marco bzw. ich mache ihn und melde das Ergebnis. Genau das ist hiermit passiert.

**Zwei Dinge bitte VOR Schritt 3 abhaken** (Abschnitt „Vorab-Prüfungen" weiter unten):
`ADMIN_EMAIL` gesetzt? — und: gibt es aktive Einsätze mit leerer `crew_email`?

---

## Was passiert ist

### Korrektur zu deiner Ausgangslage

Du gingst davon aus, dass Live auf v0.8.0 steht. **Tatsächlich stand es auf v0.6.1** — zwölf
Commits hinter `main`, zurück bis vor Hook v4.18. Die gesamte Datenschutz-Arbeit aus v0.8.0
hatte die Produktion nie erreicht. Damit war der Go-Live nicht bloß Vorbedingung für Schritt 3,
sondern selbst der dringendste offene Punkt: Live veröffentlichte weiterhin die Kontaktdaten
von neun Crew-Mitgliedern.

`main` → `live` war ein Fast-Forward (null eigene Commits auf `live`), Coolify hat in ~15
Sekunden neu gebaut.

### Dein Hook-Deploy — unabhängig gegengeprüft

Nicht aus dem Log geglaubt, sondern gemessen:

| Aufruf ohne Token | Live | Test |
|---|---|---|
| `/planstatus/{id}` | 401 | 401 |
| `/myplan/{id}` | 401 | 401 |
| `/myplans` | 401 | 401 |
| erfundene Route `/gibtsnicht/x` | **404** | — |

Der Unterschied 401 ↔ 404 ist der eigentliche Beweis: Die Routen existieren wirklich und
`requireAuth` greift — v4.19 hätte auf `/planstatus` mit 404 geantwortet. Sauber gemacht.

### Live nach dem Go-Live

```
Version                              Personalplan · v0.8.1
js/dataService.js  planstatus        2 Treffer      (vorher 0)
CLAUDE.md          Mailadressen      0              (vorher 20)
CLAUDE.md          Server-Kennungen  0
/debug.html                          404            (vorher 200)
/pocketbase/pb_schema_live_*.json    404            (vorher 200)
/pocketbase/pb_schema.json           404
/supabase/schema.sql                 404
/LICENSE                             Copyright (c) 2026 Marco Hoch
```

Gegenprobe, dass nichts kaputt ist: `/`, `/login.html`, `/admin.html`, `/view.html`,
`/js/app.js`, `/js/dataService.js`, `/theme.css`, `/styles.css`, `/sw.js`, `/favicon.svg`,
`/docs/guide-crew.html` → alle **200**. `/api/health` → **200**. Anonym `plans` → **0**.

`node tools/check-viewlink.mjs` läuft vollständig grün: Booker-Link, Missbrauchsproben,
Crew-Sicht.

### `/planstatus` funktional geprüft — mit einer Einschränkung

Ich habe `check-viewlink.mjs` um genau diese Route erweitert, weil sie mit echtem Token
ungeprüft war — und sie ist es, die das Zumachen der `assignments`-Regel überhaupt
rechtfertigt. Ergebnis mit echtem Crew-Token:

```
✓ Status der eigenen Tour abrufbar — HTTP 200
✓ Status-Farben werden geliefert — 61 Tage
✓ keine E-Mail-Adresse im Status-Payload
✓ kein crew_email-Feld im Status-Payload
✓ Anzeigenamen sind enthalten (Crew soll Namen sehen)
✓ Status einer fremden Tour → 404
✓ eigener Name (myName) kommt mit
```

⚠️ **Das lief auf TEST, nicht auf Live.** Das Werkzeug legt nur für Personen **ohne**
bestehendes Konto ein temporäres Prüfkonto an (und räumt es wieder ab) — auf Live haben alle
sechs geeigneten Personen bereits eines, deshalb überspringt es den Abschnitt dort. Für Live
gilt damit: Route existiert, weist ohne Token ab. **Der funktionale Beweis auf Live kommt aus
der Abnahme in Schritt 4.**

Beide Instanzen fahren laut deiner Messung dieselbe Hook-Datei, das Risiko ist also klein —
aber es ist eine Annahme, keine Messung, und das soll so dastehen.

---

## Vorab-Prüfungen — bitte nicht überspringen

### A · Ist `ADMIN_EMAIL` auf beiden Instanzen gesetzt?

Hook v4.20 enthält die Änderung aus v4.19: Die Superadmin-Adresse kommt **ausschließlich** aus
der Umgebung, der fest verdrahtete Rückfall ist weg (er stand in einer öffentlich
ausgelieferten Datei). Ist die Variable nicht gesetzt, entfallen dort **stillschweigend** zwei
Mails an den Planer — die Bereitschaftsmeldung („BEREITSCHAFT · …") und die
Absage-Benachrichtigung („ABGELEHNT · …"). Der Hook schreibt nur eine Zeile ins Log.

**Das gilt schon jetzt, unabhängig vom Go-Live.**

```bash
ssh «SERVER» "docker exec «PB-CONTAINER-LIVE» printenv ADMIN_EMAIL"
# und dasselbe für die Test-Instanz
```

Leer? Dann in Coolify auf **beiden** Instanzen setzen (Wert: die Superadmin-Adresse, steht in
Marcos lokaler `.claude.local.md`) und die Container neu starten.

### B · Aktive Einsätze mit leerer `crew_email`?

Die neue `assignments`-Regel lässt ein Crew-Konto nur Datensätze mit der **eigenen** Adresse
sehen. Einsätze mit leerer `crew_email` würden dadurch unsichtbar — und `confirmAssignment`
legte beim Bestätigen einen **zweiten** Datensatz für denselben Slot an.

```bash
curl -s -H "Authorization: $SUPERUSER" \
  'https://api.crewplanner.nyxlightwork.de/api/collections/assignments/records?perPage=1&filter=(crew_email="" %26%26 status!="cancelled" %26%26 status!="cancel_acked")' \
  | grep -o '"totalItems":[0-9]*'
# erwartet: "totalItems":0
```

Größer als 0? Dann **erst** die Adressen nachtragen (Konsole → Crew verknüpfen) oder die Regel
um `|| crew_email = ""` erweitern. Nicht einfach weitermachen.

---

## Schritt 3 — Regeln setzen

Am einfachsten mit dem Werkzeug; es kennt den Soll-Stand und kontrolliert danach nach:

```bash
node tools/check-pb-rules.mjs          # zeigt die 11 Abweichungen je Instanz
node tools/check-pb-rules.mjs --fix    # setzt sie und prüft nach
```

Zur Nachvollziehbarkeit, was gesetzt wird:

| Collection | Regeln | Wert |
|---|---|---|
| `assignments` | list, view | superadmin **oder** Tour-Eigentümer **oder** `crew_email = eigene Adresse` |
| `crew_members` | list, view, **create, update, delete** | superadmin **oder** Tour-Eigentümer |
| `email_log` | list, view | superadmin **oder** Tour-Eigentümer |
| `activity_log` | list, view | superadmin **oder** Tour-Eigentümer |

`assignments.createRule` bleibt bewusst `@request.auth.id != ""` — die Crew legt beim
Bestätigen ggf. den eigenen Datensatz an.

**Zu `crew_members.create/update/delete`:** Das ist Audit-Befund K-3, und er ist inzwischen
**gemessen** statt vermutet — `check-pb-rules.mjs` liest auf Live überall
`@request.auth.id != ""`. Praktisch heißt das: Jedes angemeldete Konto kann sich durch Anlegen
eines `crew_members`-Eintrags selbst Zugriff auf **jede** Tour verschaffen, weil `/myplan/{id}`
genau darauf prüft. Geprüft und unbedenklich: `saveCrewLink` (der einzige Schreibpfad der App)
läuft ausschließlich über manager-gesicherte Aufrufer.

⚠️ **Pool-Sentinel:** Pool-Einträge tragen `plan_id="__pool__"`, was kein `plans`-Datensatz ist.
Der Eigentümer-Zweig trifft darauf nicht zu → **Pool-Pflege läuft danach nur noch als
superadmin.** Das entspricht der Praxis (die Konsole läuft als superadmin), muss aber einmal
durchgespielt werden: „+ Neues Crew-Mitglied" in der Konsole muss weiter funktionieren.

**Erst Test, dann Live.**

---

## Schritt 4 — Abnahme mit einem echten Crew-Konto

Der Beweis, der auf Live noch fehlt. Mit dem Konto eines Crew-Mitglieds anmelden:

| Prüfpunkt | Erwartet |
|---|---|
| Tourtabelle | vollständig, **alle Namen** wie bisher |
| Status-Farben (⏳ ✓ ✎ ✗) | unverändert vorhanden |
| Tour-Umschalter in der Seitenleiste | listet die eigenen Touren |
| „Termine bestätigen" | funktioniert |
| Kalender-Abo, „Meine Termine" (ICS/PDF) | funktionieren |

Und die Gegenprobe — **das ist die Zusage an Marco**:

```js
// Browser-Konsole des angemeldeten Crew-Mitglieds:
JSON.stringify(crewMeta)     // NUR der eigene Name, keine fremden Adressen
```

```bash
# Mit dem Crew-Token: die alten Wege müssen zu sein
curl -s -H "Authorization: $CREWTOKEN" \
  'https://api.crewplanner.nyxlightwork.de/api/collections/crew_members/records?perPage=1' \
  | grep -o '"totalItems":[0-9]*'          # erwartet: 0

curl -s -H "Authorization: $CREWTOKEN" \
  'https://api.crewplanner.nyxlightwork.de/api/collections/assignments/records?perPage=200' \
  | grep -o '@[a-z0-9.-]*\.[a-z]*' | sort -u
# erwartet: höchstens die EIGENE Adresse
```

---

## Wenn etwas schiefgeht

**Crew sieht keine Tour mehr.** Fast sicher die Reihenfolge — Regel gesetzt, bevor das
ausgelieferte Frontend v0.8.1 war. Das ist hier nicht mehr zu erwarten (gemessen: `planstatus`
ist in beiden ausgelieferten `dataService.js`), aber die Sofortmaßnahme wäre:
`crew_members.listRule` vorübergehend zurück auf `@request.auth.id != ""`.

**Tabelle da, aber keine Status-Farben.** `/planstatus` antwortet nicht. Der Aufruf steht in
`try/catch` — die Ansicht bleibt heil, nur ungefärbt. Hook prüfen.

**Rollback der Regeln:** `node tools/check-pb-rules.mjs` zeigt jederzeit Ist gegen Soll; der
alte Stand war überall `@request.auth.id != ""`.

**Rollback des Frontends:** `git push --force-with-lease origin d0a7ef1:live`, Coolify baut
zurück. Der Hook bleibt unberührt — v4.20 ist rückwärtskompatibel.

**Rollback des Hooks:** Sicherungen in `/root/backups/pb-hooks/`, v4.19 ist der Stand davor.

---

## Danach noch offen

Aus `docs/admin-runbook-audit-v0.8.0.md`, unverändert:

- **Auslieferung serverseitig begrenzen** (Befund K-1). Die Personendaten sind zwar aus den
  Dateien heraus, aber `CLAUDE.md`, `.pb_hooks/main.pb.js` und `tools/` liegen weiterhin
  öffentlich — mitsamt der Chronik aller früheren Lücken. Empfehlung bleibt Variante B
  (Deploy-Schritt statt nginx-Regeln), weil A bei jeder neuen Dateiendung nachgezogen werden muss.
- **Sicherheits-Header** (W-2): Das Live-Frontend liefert weiterhin **keinen einzigen** —
  kein HSTS, kein CSP, kein `X-Frame-Options`, kein `Referrer-Policy`.
- **Rate-Limiting am Login** (W-3): 12 Fehlversuche in Folge, keine Drosselung.
