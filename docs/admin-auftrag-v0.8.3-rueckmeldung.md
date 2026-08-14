# Rückmeldung zu v0.8.3 — D, B und C umgesetzt und nachgemessen

**Datum:** 2026-08-14 · **Bezug:** `docs/admin-auftrag-v0.8.3.md`

Alle drei Punkte umgesetzt. Messausgaben wie gewünscht mitgeschickt, nicht nur „fertig"
gemeldet.

---

## D — PocketBase-Regel Crew-Pool (Test + Live)

**Vorher** (beide Instanzen), `crew_members` auf allen fünf Regeln:

```
@request.auth.role = "superadmin" || (@collection.plans.id ?= plan_id && @collection.plans.owner ?= @request.auth.id)
```

**Nachher**, per `tools/check-pb-rules.mjs --fix` gesetzt (Soll-Regel `POOL_OR_OWNER` stand
schon im Tool), Nachkontrolle beider Instanzen: **0 Abweichungen**:

```
@request.auth.role = "superadmin" || (plan_id = "__pool__" && @request.auth.role = "manager") || (@collection.plans.id ?= plan_id && @collection.plans.owner ?= @request.auth.id)
```

**Funktionstest mit echtem, temporärem Manager-Konto** (nicht Superadmin — der funktioniert
ohnehin), Test und Live identisch:

```
Pool-Liste (plan_id='__pool__')                  totalItems: 3
Neue Person im Pool anlegen                       → 201, Datensatz erstellt
Person im Pool ändern                             → übernommen
Person im Pool löschen                            → HTTP 204
Gegenprobe fremde Touren (plan_id!='__pool__')    totalItems: 0   ← K-3 bleibt zu
```

Anonymer Zugriff weiterhin `totalItems: 0` auf allen sechs Collections, CORS unverändert
korrekt (eigenes Frontend erlaubt, `evil.example.com` nicht). Alle Testkonten (Manager-User,
Pool-Eintrag, temporärer Superuser) danach gelöscht, Login-Versuch mit dem gelöschten
Superuser → 400.

**Nicht getestet:** eine echte Anfrage-Mail an eine neu angelegte Pool-Person (Invite-Hook
selbst unberührt von D, keine Mail an eine Fake-Adresse auf Live auslösen wollen).

---

## B — Coolify Build Pack auf Dockerfile

**Vorher (Static):**

```
.pb_hooks/main.pb.js                                200   ← sollte 404 sein
tools/check-pb-rules.mjs                            200
tests/delivery.test.mjs                             200
README.md / LICENSE / docs/admin-auftrag-v0.8.3.md  200

$ curl -sI https://crewplanner.nyxlightwork.de/ | grep -iE 'strict-transport|frame-options|referrer-policy'
# → keine Treffer
```

**Nachher (Dockerfile, nach Redeploy):**

```
.pb_hooks/main.pb.js                                404
tools/check-pb-rules.mjs                            404
tests/delivery.test.mjs                             404
README.md / LICENSE / docs/admin-auftrag-v0.8.3.md  404

strict-transport-security: max-age=31536000; includeSubDomains
x-content-type-options: nosniff
x-frame-options: DENY
referrer-policy: no-referrer
```

Header auch auf der 404-Seite selbst geprüft (`always` wirkt tatsächlich).

**Pflicht-200-Liste, davor und danach identisch — alles 200:**

```
/  /admin.html  /login.html  /view.html  /styles.css  /theme.css
/favicon.svg  /sw.js  /js/app.js  /js/config.js
/docs/guide-crew.html  /docs/guide-admin.html
```

Container läuft (`Up`, kein Crash-Loop), Rundum-Check aller anderen Domains danach
unverändert grün. CSP bewusst noch auskommentiert — kommt mit deinem zweiten Push.

---

## C — Rate-Limiting am Login

**Abweichung vom Vorschlag im Auftrag:** Statt der Traefik-Middleware haben wir PocketBases
eigene Drosselung aktiviert. Grund: PB läuft auf **0.39.9**, nicht v0.38 wie im Auftrag
vermutet, und bringt bereits eine eigene, endpunktbewusste Rate-Limit-Engine mit — genau die
im Auftrag als Alternative genannte „sauberere Ebene", nur bislang deaktiviert. `/viewplan`,
`/viewstatus`, `/ics` sind im Hook-Code über `routerAdd` außerhalb von `/api/` registriert und
damit strukturell von PBs Regeln ausgenommen, nicht nur per Filterlogik — kein Risiko durch
ein falsch gesetztes `sourceCriterion` in Traefik.

**Vorher (Test + Live identisch):**

```json
"rateLimits": { "enabled": false, "rules": [{"label":"*:auth","duration":3,"maxRequests":2}, ...] }
"trustedProxy": { "headers": [], "useLeftmostIP": false }
```

**Nachher:**

```json
"rateLimits": { "enabled": true, "rules": [{"label":"*:auth","duration":3,"maxRequests":2}, ...] }
"trustedProxy": { "headers": ["X-Forwarded-For"], "useLeftmostIP": true }
```

`trustedProxy` war der eigentliche Stolperstein: ohne ihn hätte PB als Client-IP die interne
Traefik-Container-IP gesehen und alle Nutzer in einen Topf geworfen — dieselbe Falle, vor der
der Auftrag bei der Traefik-Variante warnt, nur auf PB-Seite. Im Request-Log nachgemessen:
`remoteIP: 10.0.1.14` (Traefik) vs. `userIP: 79.225.185.63` (echte Adresse) — korrekt
getrennt.

**15 Login-Fehlversuche (Live, identisch auf Test):**

```
400 400 429 400 400 429 400 400 429 400 400 400 429 429 400
```

**Gegenprobe `/ics` mit erfundenem Token, 12×, muss unbeeinflusst bleiben:**

```
404 404 404 404 404 404 404 404 404 404 404 404   ← nie 429
```

**Normale API-Nutzung während der Drosselung:** `/api/health` → 200
**Gültiger Login nach 4 s Pause:** 200 — keine Selbstsperre

Alle temporären Superuser danach gelöscht, Login-Versuch → 400.

---

## Gesamt

Rundum-Check aller zwölf Domains nach jedem der drei Schritte durchgeführt, durchgehend im
erwarteten Zustand (200 bzw. die bekannten 302/307-Redirects). Einziges verbleibendes
offenes Element laut Auftrag: die CSP, dein zweiter Push.
