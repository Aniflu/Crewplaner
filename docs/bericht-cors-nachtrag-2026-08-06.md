# Nachtrag an Marco — CORS-Abschluss gegengeprüft, ein Restpunkt auf der Serverseite

**Datum:** 2026-08-06
**Betrifft:** dein `docs/bericht-cors-abschluss-2026-08-05.md`
**Status auf dem Server:** unverändert **v4.18** auf beiden Instanzen, sha `573d85b4…`, CORS wie beschrieben
**Vorgänger:** `bericht-hook-v4.17-2026-08-05.md`, `bericht-hook-v4.18-2026-08-05.md`

---

## Kurzfassung

Dein Abschlussbericht deckt sich mit dem, was hier läuft. Ich habe den Stand trotzdem noch einmal
gemessen statt ihn zu übernehmen — in dem Punkt sind wir uns ja inzwischen einig.

Von meiner Seite ist zu CORS **nichts** mehr offen. Ein Punkt bleibt aber, der dich betrifft, obwohl
er nicht im Hook steckt: der **Auto-Deploy-Cron** für die Hook-Datei liegt seit Mai auf dem Server
und hat genau die Schwäche, die du gerade im Runbook behoben hast. Er ist aus, und solange er aus
ist, passiert nichts — aber er sollte nicht unbedacht wieder angehen. Details in Abschnitt 3.

---

## 1. Stand nachgemessen (2026-08-06)

| | Live `ad9adhh…` | Test `jl1phsv…` |
|---|---|---|
| sha256 im Volume | `573d85b45ecd48f68a5a48ac68b4094a67c22fd8dad300b577684d3cf245ecd5` | identisch |
| = GitHub `main` | ✅ | ✅ |
| Log | `[hook] main.pb.js v4.18 geladen` (19:53:34) | dito (19:52:52) |

Seit dem Deploy hat sich nichts verschoben. CORS auf Live, eben gemessen:

```
https://crewplanner.nyxlightwork.de       → 1 Header, eigene Herkunft
https://www.crewplanner.nyxlightwork.de   → 1 Header, eigene Herkunft
https://evil.example.com                  → kein Header
```

Kleine Korrektur zu deinem Bericht, folgenlos: das Test-Deploy datierst du auf 19:52:41, im
Container-Log steht 19:52:52. Kopier- gegen Ladezeitpunkt.

## 2. Zu „die Traefik-Zuschreibung war ein Denkfehler"

Das stimmt in der Schlussfolgerung, aber ich würde es genauer fassen, damit daraus nicht die falsche
Aufräumaktion folgt: **Die Traefik-CORS-Middleware existiert weiterhin und tut auch etwas.** In
`/data/coolify/proxy/dynamic/pocketbase-fix.yaml` steht auf Live genau eine erlaubte Herkunft:

```
accessControlAllowOriginList:
  - "https://crewplanner.nyxlightwork.de"
```

Der Denkfehler war nicht „Traefik macht CORS", sondern die Umkehrung daraus — dass damit auch
festgelegt sei, wer **keinen** Header bekommt. Traefik hat für die eine konfigurierte Herkunft den
Header gesetzt; für alle anderen ist PocketBases `*` einfach durchgelaufen.

Zwei praktische Folgen:

- **`https://www.crewplanner.nyxlightwork.de` steht nicht in der Traefik-Liste** und bekommt oben
  trotzdem seine eigene Herkunft zurück. Diese Herkunft hängt also **allein** an deiner
  Hook-Positivliste. Fliegt sie dort raus, bricht `www.` — Traefik fängt das nicht auf.
- Wo beide Ebenen dieselbe Herkunft setzen (Live-Herkunft, auf Test `aniflu.github.io`), kommt
  trotzdem **genau ein** Header an, kein Duplikat. Es besteht also kein Grund, die Traefik-Seite
  anzufassen — sie schadet nicht, und sie ist die einzige Ebene, die auch dann noch greift, wenn ein
  Hook-Deploy schiefgeht.

Der Rest deiner drei Lehren passt unverändert. Dass PocketBases eigene CORS-Middleware **vor** den
`routerUse`-Hooks läuft, war hier bisher nur empirisch belegt — gut, das jetzt begründet zu haben.
Und der Guard `tests/cors.test.mjs` ist der eigentliche Gewinn aus der Sache: die `e.next()`-Reihenfolge
ist damit keine Konvention mehr, die man beim nächsten Mal wieder falsch anwenden kann.

## 3. Der Restpunkt: der Auto-Deploy-Cron

Beim Durchsehen ist mir aufgefallen, dass `/usr/local/bin/deploy-pb-hook.sh` unverändert von Mai auf
dem Server liegt. **Er läuft nicht** — kein Eintrag in `crontab -l`, keiner in `/etc/cron.d`, letzter
Log-Eintrag 16.05. Wenn er aber je wieder scharf geschaltet wird, bringt er drei Dinge mit:

1. **Kein Inhalts-Gate.** Er schreibt mit `curl -sf -o` direkt in das Live-Volume. Das `-f` ist da,
   der Rest deiner Verschärfung nicht: kein Umweg über `/tmp`, kein `grep` auf den Versionsstring,
   kein `sha256`. Ein 200er mit falschem Inhalt landet also unbesehen in der Hook-Datei.
2. **Er deployt nur Live.** Die Test-Instanz kommt im Script nicht vor. Ein Push auf `main` ginge
   damit ungetestet direkt in Produktion — bei einem Hook, der wie v4.17 sauber lädt und trotzdem
   nichts tut, merkt das niemand.
3. **Er triggert auf den Repo-HEAD, nicht auf die Hook-Datei.** Jeder Commit auf `main` — auch ein
   reiner Frontend-Commit — löst ein `docker restart` der Live-PocketBase aus.

Meine Empfehlung: **auslaufen lassen**. Hook-Deploys sind selten, sie brauchen ohnehin eine Messung
danach (genau der Punkt aus deinem Bericht), und die kann ein Cron nicht leisten. Wenn du den
Automatismus trotzdem willst, baue ich ihn mit deinen Gates um — dann aber Test zuerst, Live erst
nach einer bestandenen Messung, und getriggert auf den Hash der Hook-Datei statt auf den Repo-HEAD.
Sag Bescheid, was dir lieber ist; ich fasse ihn bis dahin nicht an.

## 4. Stand

- Repo und beide Instanzen auf **v4.18**, sha `573d85b4…`, seit dem Deploy unverändert.
- CORS ist von meiner Seite abgeschlossen, es steht nichts mehr auf meiner Liste.
- Offen ist nur die Entscheidung zum Cron oben — kein Zeitdruck, der Zustand ist stabil.
