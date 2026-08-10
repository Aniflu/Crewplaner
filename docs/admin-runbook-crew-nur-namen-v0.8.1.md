# Admin-Runbook — „Crew sieht nur Namen" · v0.8.1 / Hook v4.20

Stand: 2026-08-10 · Vorgabe des Users: *„Die Crewmitglieder dürfen AUSSCHLIESSLICH nur die
Namen sehen, sonst nichts."* · Grundlage: Audit-Befund K-2/K-3 (`docs/audit-2026-08-09.md`)

> **Dieses Runbook baut auf `docs/admin-runbook-audit-v0.8.0.md` auf.** Dessen Schritt 1
> (`ADMIN_EMAIL` setzen) muss erledigt sein. Schritt 3 dort (crew_members-Regeln) wird hier
> **ersetzt** — die Regel unten ist dieselbe, aber vollständiger.

---

## Ausgangslage — jetzt gemessen, nicht mehr vermutet

Im Audit war offen, ob die `crew_members`-Schreibregeln wirklich offenstehen. Mit
`node tools/check-pb-rules.mjs` am 2026-08-10 gegen **Live** nachgemessen:

```
✗ assignments.listRule    ist: @request.auth.id != ""
✗ assignments.viewRule    ist: @request.auth.id != ""
✗ crew_members.listRule   ist: @request.auth.id != ""
✗ crew_members.viewRule   ist: @request.auth.id != ""
✗ crew_members.createRule ist: @request.auth.id != ""
✗ crew_members.updateRule ist: @request.auth.id != ""
✗ crew_members.deleteRule ist: @request.auth.id != ""
✗ email_log.listRule      ist: @request.auth.id != ""
✗ activity_log.listRule   ist: @request.auth.id != ""
```

Bedeutung im Klartext: **Jedes angemeldete Konto** kann alle Einsätze aller Touren samt
Mailadressen lesen, das Mail- und Aktivitätsprotokoll einsehen — und sich durch Anlegen
eines `crew_members`-Eintrags selbst Zugriff auf **jede** Tour verschaffen.

**Warum das nicht allein mit Regeln zu lösen ist:** PocketBase-Regeln filtern *Datensätze*,
nicht *Felder*. „Crew darf Einsätze lesen, aber ohne Mailadresse" ist als Regel nicht
ausdrückbar. Deshalb Hook-Routen — wie schon bei `/viewstatus` (v4.14), `/viewplan` (v4.15)
und `/myplan` (v4.16).

---

## ⚠️ Die Reihenfolge ist das Wichtigste an diesem Runbook

```
1. Hook v4.20        →  2. Frontend v0.8.1 live      →  3. Regeln
   (neue Wege auf)      (App benutzt die neuen Wege)     (alte Wege zu)
```

**Zwischen jedem Schritt läuft alles weiter**, weil die alten Wege bis zuletzt offen bleiben.

**Wird Schritt 3 vorgezogen, verlieren alle neun Crew-Konten sofort ihre Touren.** Genau das
stand beim v4.16-Rollout falsch herum im Runbook; der Admin hat es damals bemerkt und die
Regel bewusst nicht gesetzt.

**„Frontend live" heißt: das auf der jeweiligen Umgebung AUSGELIEFERTE JavaScript** — nicht
das im Repo. Vor Schritt 3 prüfen:

```bash
# Muss 1 oder mehr ergeben, sonst ist v0.8.1 dort noch nicht ausgeliefert:
curl -s https://crewplanner.nyxlightwork.de/js/dataService.js | grep -c 'planstatus'
curl -s https://aniflu.github.io/Crewplaner/js/dataService.js  | grep -c 'planstatus'
```

---

## Schritt 1 — Hook v4.20 deployen (erst Test, dann Live)

**Neu:**

| Route | Liefert | Ersetzt |
|---|---|---|
| `GET /planstatus/{id}` *(angemeldet)* | Datum, Position, Status, **Anzeigename** einer Tour — **kein `crew_email`** | den direkten `assignments`-Zugriff der Crew |
| `GET /myplan/{id}` *(erweitert)* | zusätzlich `myName` | das Laden **aller** `crew_members` samt Adressen |

Zugriffsprüfung von `/planstatus` ist wortgleich zu `/myplan`: Owner **oder** superadmin
**oder** Crew-Mitglied dieser Tour; Ablehnung als **404**, nicht 403 — verrät nicht, ob es
die Tour gibt.

```bash
# 1. Holen und Inhalt prüfen, BEVOR es ins Volume geht
ssh «SERVER» "curl -s -o /tmp/main.pb.js \
  https://raw.githubusercontent.com/Aniflu/Crewplaner/main/.pb_hooks/main.pb.js \
  && grep -c 'v4.20 geladen' /tmp/main.pb.js \
  && grep -c \"routerAdd('GET', '/planstatus\" /tmp/main.pb.js"
# erwartet: 1 und 1

# 2. Sicherung, einspielen, neu starten
ssh «SERVER» "cp /var/lib/docker/volumes/«PB-HOOKS-VOLUME-LIVE»/_data/main.pb.js \
     /root/backups/pb-hooks/main.pb.js.live.\$(date +%Y%m%d-%H%M%S) \
  && cp /tmp/main.pb.js /var/lib/docker/volumes/«PB-HOOKS-VOLUME-LIVE»/_data/main.pb.js \
  && docker restart «PB-CONTAINER-LIVE»"
```

**Nachmessen — nicht nur ins Log schauen** (Lehre aus v4.17: „geladen" ≠ „wirkt"):

```bash
# Ohne Token muss die Route abweisen:
curl -s -o /dev/null -w "%{http_code}\n" https://api.crewplanner.nyxlightwork.de/planstatus/03fs6r1o8cqeyt2
# erwartet: 401

# Mit einem Crew-Token: Status kommen, aber KEINE Mailadresse
curl -s -H "Authorization: $CREWTOKEN" \
  https://api.crewplanner.nyxlightwork.de/planstatus/03fs6r1o8cqeyt2 | grep -c '@'
# erwartet: 0
```

Danach `node tools/check-viewlink.mjs` — der öffentliche Booker-Link darf sich nicht
verändert haben.

---

## Schritt 2 — Frontend v0.8.1 ausliefern

`main` ist bereits gepusht → **Test** ist versorgt. Für **Live** macht Marco den Go-Live
(`main` → `live`); Coolify baut in 1–2 Minuten neu. Danach die beiden `curl`-Prüfungen von
oben laufen lassen.

**Dazwischen ist alles unkritisch:** Die App benutzt dann schon die neuen Routen, die alten
Wege stehen aber noch offen — es kann also nichts ausfallen.

---

## Schritt 3 — Regeln setzen (erst wenn Schritt 1 + 2 auf BEIDEN Umgebungen stehen)

### Vorab-Prüfung, die man nicht überspringen sollte

Die neue `assignments`-Regel lässt ein Crew-Konto nur Datensätze mit der **eigenen**
Mailadresse sehen. Einsätze mit **leerer** `crew_email` würden dadurch unsichtbar — und
`confirmAssignment` legte beim Bestätigen einen zweiten Datensatz für denselben Slot an.

```bash
# Aktive Einsätze ohne Mailadresse? Erwartet: totalItems 0
curl -s -H "Authorization: $SUPERUSER" \
  'https://api.crewplanner.nyxlightwork.de/api/collections/assignments/records?perPage=1&filter=(crew_email="" %26%26 status!="cancelled" %26%26 status!="cancel_acked")' \
  | grep -o '"totalItems":[0-9]*'
```

Ist die Zahl **größer als 0**, zuerst die Adressen nachtragen (Konsole → Crew verknüpfen)
oder die Regel um `|| crew_email = ""` erweitern. **Nicht einfach weitermachen.**

### Setzen

Am einfachsten mit dem Werkzeug — es kennt den Soll-Stand und kontrolliert danach nach:

```bash
node tools/check-pb-rules.mjs          # zeigt die 11 Abweichungen je Instanz
node tools/check-pb-rules.mjs --fix    # setzt sie und prüft nach
```

Zur Nachvollziehbarkeit, was gesetzt wird:

| Collection | Regeln | Wert |
|---|---|---|
| `assignments` | list, view | `superadmin` **oder** Tour-Eigentümer **oder** `crew_email = eigene Adresse` |
| `crew_members` | list, view, **create, update, delete** | `superadmin` **oder** Tour-Eigentümer |
| `email_log` | list, view | `superadmin` **oder** Tour-Eigentümer |
| `activity_log` | list, view | `superadmin` **oder** Tour-Eigentümer |

`assignments.createRule` bleibt bewusst `@request.auth.id != ""` — die Crew legt beim
Bestätigen ggf. den eigenen Datensatz an.

⚠️ **Pool-Sentinel:** Pool-Einträge tragen `plan_id="__pool__"`, was kein `plans`-Datensatz
ist. Der Eigentümer-Zweig trifft darauf nicht zu → **Pool-Pflege läuft nur noch als
superadmin.** Das entspricht der Praxis (die Konsole läuft als superadmin), muss aber nach
dem Setzen einmal durchgespielt werden: „+ Neues Crew-Mitglied" in der Konsole.

---

## Schritt 4 — Abnahme mit einem echten Crew-Konto

Der eigentliche Beweis. Mit dem Konto eines Crew-Mitglieds anmelden und prüfen:

| | Erwartet |
|---|---|
| Tourtabelle | vollständig sichtbar, **alle Namen** wie bisher |
| Status-Farben (⏳ ✓ ✎ ✗) | unverändert vorhanden |
| Tour-Umschalter in der Seitenleiste | listet die eigenen Touren |
| „Termine bestätigen" | funktioniert |
| Kalender-Abo, „Meine Termine" (ICS/PDF) | funktionieren |

Und die Gegenprobe im Browser — **das ist die Zusage**:

```js
// In der Konsole des angemeldeten Crew-Mitglieds:
JSON.stringify(crewMeta)          // nur der EIGENE Name, keine fremden Adressen
```

```bash
# Mit dem Crew-Token: die alten Wege müssen zu sein
curl -s -H "Authorization: $CREWTOKEN" \
  'https://api.crewplanner.nyxlightwork.de/api/collections/crew_members/records?perPage=1' \
  | grep -o '"totalItems":[0-9]*'        # erwartet: 0

curl -s -H "Authorization: $CREWTOKEN" \
  'https://api.crewplanner.nyxlightwork.de/api/collections/assignments/records?perPage=200' \
  | grep -o '@[a-z0-9.-]*\.[a-z]*' | sort -u
# erwartet: höchstens die EIGENE Adresse
```

---

## Wenn etwas schiefgeht

**Symptom: Crew sieht keine Tour mehr.** Fast sicher die Reihenfolge — Regel gesetzt, bevor
das ausgelieferte Frontend v0.8.1 war. Sofortmaßnahme:

```bash
# crew_members.listRule vorübergehend zurück auf auth != ""
# → Crew sieht ihre Touren sofort wieder, dann Schritt 2 nachholen
```

**Symptom: Tabelle da, aber keine Status-Farben.** Hook v4.20 fehlt oder `/planstatus`
antwortet nicht. Der Aufruf steht in `try/catch` — die Ansicht bleibt heil, nur ungefärbt.
Hook nachdeployen.

**Rollback des Hooks:** Sicherungen liegen in `/root/backups/pb-hooks/`. v4.19 ist der
Stand direkt davor.
