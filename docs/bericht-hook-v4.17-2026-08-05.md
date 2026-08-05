# Bericht an Marco — Hook v4.17 (CORS): Befund richtig, Fix wirkungslos

**Datum:** 2026-08-05
**Betrifft:** `docs/admin-runbook-hook-v4.17.md`, `.pb_hooks/main.pb.js` v4.17
**Status auf dem Server:** beide Instanzen laufen auf **`v4.17-fix`** (siehe unten) — **nicht** auf dem GitHub-Stand

---

## Kurzfassung

Dein Befund stimmt: PocketBase antwortet **jeder** Herkunft mit `Access-Control-Allow-Origin: *`,
Traefik überschreibt das nur für die eine dort eingetragene Herkunft. Nachgemessen auf beiden
Instanzen, bevor irgendetwas angefasst wurde.

**Aber das veröffentlichte v4.17 tut nichts.** Die Middleware lädt sauber, läuft, wirft keinen
Fehler — und ändert keinen einzigen Header. Ursache ist eine Zeile. Der Fix ist eine Zeile, aber
er lässt sich **nicht** durch bloßes Umsortieren erledigen (Details unten, sonst tötest du jeden
Request).

Ich habe den korrigierten Hook auf Test **und** Live eingespielt, weil der Punkt sonst offen
geblieben wäre. Damit weicht der laufende Hook vom Repo ab, bis du das als **v4.18** übernimmst.

---

## 1. Der Befund selbst — bestätigt

```bash
curl -s -D - -o /dev/null -H "Origin: https://evil.example.com" \
  https://api.crewplanner.nyxlightwork.de/api/health | grep -i access-control-allow-origin
```

| Instanz | Herkunft | vorher |
|---|---|---|
| Live | `evil.example.com` | `access-control-allow-origin: *` |
| Live | `crewplanner.nyxlightwork.de` | `…: https://crewplanner.nyxlightwork.de` (von Traefik) |
| Live | `aniflu.github.io` | `access-control-allow-origin: *` |
| Test | `evil.example.com` | `access-control-allow-origin: *` |

Deine Analyse, dass das `*` aus PocketBase kommt und nicht aus dem Reverse-Proxy, ist richtig —
und damit auch, dass es im Hook lösbar ist, ohne die Traefik-Datei anzufassen.

## 2. Warum v4.17 wirkungslos ist

```js
routerUse(function(e) {
  e.next();          // ← hier ist die Antwort bereits geschrieben
  try {
    …
    e.response.header().set('Access-Control-Allow-Origin', origin);
```

`e.next()` arbeitet den kompletten Request ab. Sobald der Handler den Body schreibt, sind die
Header in Go raus (`WriteHeader` ist gefallen) — jedes spätere `Header().Set()` / `.Del()` läuft
ins Leere. Kein Fehler, kein Log-Eintrag, keine Wirkung.

**Nach dem Deploy von unverändertem v4.17 auf Test:**

```
2026/08/05 08:55:14 [hook] main.pb.js v4.17 geladen        ← lädt
health=healthy restarts=0                                  ← läuft
evil.example.com  → access-control-allow-origin: *         ← wirkt nicht
```

Der Beweis, dass wirklich der Hook das Problem ist und nicht Traefik, war
**`http://localhost:8080`**: diese Herkunft steht nur in deiner Positivliste, Traefik kennt sie
nicht. Sie bekam trotzdem `*` statt sich selbst zurück. Also hat die Middleware nichts gesetzt.

> Merke fürs nächste Mal: `v4.xx geladen` im Log beweist, dass der Hook **lädt** — nicht, dass er
> **wirkt**. Bei Header-Änderungen müssen die Header gemessen werden.

## 3. Der Fix — und die Falle darin

Die Header müssen **vor** `e.next()` gesetzt werden. Das reicht aber nicht: dein Block enthält
drei `return`s (öffentliche Routen, kein `Origin`). Verschiebt man ihn unverändert nach oben,
überspringen diese `return`s das `e.next()` — und dann wird **jeder** betroffene Request nicht
mehr abgearbeitet. Die öffentlichen Routen `/viewplan`, `/viewstatus`, `/ics` wären als erste tot.

Deshalb: `return`s raus, Bedingung rein, `return e.next()` ans Ende. Bewusst **ohne** ausgelagerte
Hilfsfunktion — wegen des bekannten Goja-Scope-Verhaltens, das euch schon bei den
`crew_invites`-Mails erwischt hat.

```diff
 routerUse(function(e) {
-  e.next();
   try {
     var pfad = '';
     try { pfad = String(e.request.url.path || ''); } catch (err0) { pfad = ''; }
-    if (pfad.indexOf('/viewplan/') === 0 || pfad.indexOf('/viewstatus/') === 0 || pfad.indexOf('/ics/') === 0) return;
+    var oeffentlich = (pfad.indexOf('/viewplan/') === 0 || pfad.indexOf('/viewstatus/') === 0 || pfad.indexOf('/ics/') === 0);

     var origin = '';
     try { origin = String(e.request.header.get('Origin') || ''); } catch (err1) { origin = ''; }
-    if (!origin) return;   // kein Browser-Aufruf (curl, Server) → CORS irrelevant

     var host = '';
     try { host = String(e.request.host || ''); } catch (err2) { host = ''; }

+    if (!oeffentlich && origin) {
+
     var erlaubt;
     if (host.indexOf('api-test.') === 0) {
       erlaubt = ['https://aniflu.github.io', 'http://localhost:8080', 'http://127.0.0.1:8080'];
     } else {
       erlaubt = ['https://crewplanner.nyxlightwork.de', 'https://www.crewplanner.nyxlightwork.de'];
     }

     var ok = false;
     for (var i = 0; i < erlaubt.length; i++) { if (erlaubt[i] === origin) { ok = true; break; } }

     if (ok) {
       e.response.header().set('Access-Control-Allow-Origin', origin);
     } else {
       // Fremde Herkunft: Freigabe zurücknehmen. Der Browser blockiert das Auslesen dann.
       e.response.header().del('Access-Control-Allow-Origin');
     }
     e.response.header().set('Vary', 'Origin');
+    }
   } catch (err) {
     // Nie den Request scheitern lassen, nur weil die Header-Feinjustierung klemmt.
     console.error('[hook] CORS-Middleware:', err.message || String(err));
   }
+  return e.next();
 });
```

Deine Logik selbst (Positivliste aus dem Hostnamen, Ausnahme für die Token-Routen, alles in
`try/catch`) ist unverändert — nur die Reihenfolge und der Kontrollfluss.

Nebenbei bestätigt: PocketBases eigene CORS-Middleware läuft **vor** den `routerUse`-Hooks. Ein
`set`/`del` vor `e.next()` gewinnt also gegen ihr `*`. Genau das war die offene Frage.

## 4. Was jetzt auf dem Server läuft

| | |
|---|---|
| Version im Log | `[hook] main.pb.js v4.17-fix geladen` |
| sha256 | `062d996ed4083e7ab3609440530fb920a1b86453ed717228efb8d6a8e6f311f4` |
| Instanzen | Live (`ad9adhhk…`) **und** Test (`jl1phsvs…`) |
| Referenzkopie | `/root/backups/pb-hooks/main.pb.js.v4.17-fix` |
| Rollback | `/root/backups/pb-hooks/main.pb.js.live.20260805-110118` (= v4.16) |

Der Versionsstring lautet bewusst `v4.17-fix` und nicht `v4.17` — sonst würde ein sha-Vergleich
gegen GitHub grün aussehen, obwohl die Dateien verschieden sind. Falls deine Prüfwerkzeuge auf
`v4.17` matchen, ist das der Grund.

## 5. Gegenprobe (alles gemessen, nicht abgeleitet)

**Live**

| Herkunft | `Access-Control-Allow-Origin` |
|---|---|
| `https://crewplanner.nyxlightwork.de` | genau **ein** Header mit der eigenen Herkunft |
| `https://www.crewplanner.nyxlightwork.de` | eigene Herkunft |
| `https://aniflu.github.io` | **kein** Header |
| `https://evil.example.com` | **kein** Header |
| `http://localhost:8080` | **kein** Header (nur auf Test erlaubt) |

„Genau ein Header" war eine eigene Sorge: auf Live setzt Traefik denselben Header für die eigene
Herkunft. Zwei `Access-Control-Allow-Origin`-Header lehnt jeder Browser ab — es ist aber
tatsächlich nur einer, Traefiks `headers`-Middleware überschreibt statt anzuhängen.

**Preflight** (`OPTIONS` auf `/api/collections/users/auth-with-password`, mit
`Access-Control-Request-Method` + `-Headers`): erlaubte Herkunft bekommt ACAO, `evil` bekommt
keinen. `allow-methods` / `allow-headers` unverändert.

**Öffentliche Token-Routen behalten `*`** — alle drei Live-Tokens, beide Routen:

```
7fa2c95b  viewplan   200 | *  |  9749 Bytes | 0 @-Treffer
7fa2c95b  viewstatus 200 | * | 20329 Bytes | 0 @-Treffer
aeb81e71  viewplan   200 | *  |  8639 Bytes | 0 @-Treffer
aeb81e71  viewstatus 200 | * | 17090 Bytes | 0 @-Treffer
628a7ae4  viewplan   200 | *  |  5963 Bytes | 0 @-Treffer
628a7ae4  viewstatus 200 | * | 11457 Bytes | 0 @-Treffer
```

**Keine Regressionen:** `plans` und `assignments` anonym `totalItems: 0`, `/myplans` ohne Token
401, erfundener Token 404, Frontend + `admin.html` + `/api/health` 200, beide Container
`healthy` mit `RestartCount: 0`, Body der Antworten unverändert vollständig.

`node tools/check-pb-rules.mjs` sollte gegen beide Instanzen jetzt grün melden — die CORS-Probe
trifft auf den korrigierten Stand.

## 6. Was ich von dir brauche

1. **Fix als v4.18 ins Repo** (Diff oben, Versionsstring auf `4.18`). Bis dahin darf **kein**
   Deploy blind `main` ziehen — das würde den Fix zurücknehmen und CORS wieder öffnen.
2. Danach ziehe ich beide Instanzen normal auf v4.18 nach (mit sha-Gate gegen GitHub), und der
   Sonderzustand ist wieder weg.

## 7. Nebenbefund: der Resend-Schlüssel muss **nicht** rotiert werden

Deine Commit-Nachricht sagt, der Schlüssel aus `CHANGELOG.md` müsse bei Resend rotiert werden.
Nachgeprüft, statt angenommen:

- Es ist **nicht** der laufende Schlüssel — im Git-Verlauf steht `re_75ZvX…`, auf dem Server
  läuft `re_Suse3…`.
- Der Schlüssel aus dem Verlauf ist bei Resend **bereits ungültig**:
  `GET https://api.resend.com/domains` → `400 {"message":"API key is invalid"}`.
- Der aktive Schlüssel ist gültig: `200`, Domain `crewplanner.nyxlightwork.de` verified, Versand
  läuft.

Also kein Handlungsbedarf. Richtig bleibt: der Eintrag ist im öffentlichen Verlauf für immer
lesbar — nur eben wertlos.
