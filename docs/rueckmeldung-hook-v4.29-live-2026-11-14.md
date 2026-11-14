# Rückmeldung an Marco — Hook v4.29 auf Live

**Datum:** 2026-11-14 · **Auftrag:** `docs/admin-auftrag-hook-v4.29.md`
**Test-Rückmeldung:** `docs/rueckmeldung-hook-v4.29-2026-11-13.md`

| Instanz | Version | sha256 | Zustand |
|---|---|---|---|
| Test | v4.29 | `efe082b79fddd7d7baebcb17d31e3ffc7bc368379d90d76b2bf9fba85c099623` | healthy, `RestartCount: 0` |
| Live | **v4.29** | `efe082b79fddd7d7baebcb17d31e3ffc7bc368379d90d76b2bf9fba85c099623` = GitHub `main` | healthy, `RestartCount: 0` |

> Server-Kennungen stehen hier als `«…»` — dieses Dokument kann so ins öffentliche Repo.

---

## Ergebnis in einem Satz

v4.29 läuft auf Live, ohne Regression und ohne Laufzeitfehler, und **die App v1.4.0 ist ebenfalls
live**. Das habe ich auf Robs' Anweisung direkt gemacht, damit du es nicht noch einmal anstößt.

## App v1.4.0 live

`git push origin main:live` als Fast-Forward `681d833..6209acc`, also genau dein Stand von `main`
mit allen 11 Commits, ohne Merge und ohne Force. Der Webhook hat um 09:32 UTC gebaut, das
Deployment steht auf `finished`, der Container läuft auf `6209accb…`.

- Startseite 200, Versionsangabe **`v1.4.0`**
- `js/crewNotify.js` wird mit „Vormerkung mitteilen" ausgeliefert
- Die Auslieferung bleibt begrenzt: `CLAUDE.md`, `README.md`, `.pb_hooks/main.pb.js`, `docs/…` und
  `tools/…` liefern **404**, eine erfundene Datei als Kontrolle ebenfalls. Befund K-1 ist damit auch
  von Serverseite gegengemessen.

**Ehrlich dazu:** `node tests/run.mjs` lief bei mir nicht, und dein `pre-push`-Hook ist in meinem
Klon nicht aktiv. Grundlage war deine Meldung „469/0 grün" auf genau diesem Stand (`6209acc`).
Falls du danach noch etwas nach `main` geschoben hast, ist das **nicht** live.

## Deploy

Freigabe kam von Robs, nachdem du v1.4.0 auf Test geprüft hattest. Deploy nach
`docs/admin-runbook-hook-deploy.md`:

- Datei nach `/tmp`, Gate auf `// Version: 4.29`, `v4.29 geladen` und `routerAdd`
- sha256 gegen `main` geprüft, unverändert seit dem Test-Deploy (deine v1.4.0-Commits haben den Hook nicht angefasst)
- v4.28 gesichert, dann kopiert und neu gestartet

Keine Coolify-Deployments in der Warteschlange.

Rückweg (v4.28, sha `4e14619b…`): `/root/backups/pb-hooks/main.pb.js.live.20261114-102719`

## Messungen auf Live

Auf Live lege ich kein Konto an, gleiche Linie wie bei v4.28. Gemessen ist deshalb alles, was
ohne Anmeldung geht, und zwar **vorher und nachher mit identischem Skript**:

| # | Messung | vorher (v4.28) | nachher (v4.29) |
|---|---|---|---|
| 1 | Log nach Neustart | — | `[hook] main.pb.js v4.29 geladen` ✅ |
| – | `GET /api/health` | 200 | 200 ✅ |
| – | `POST /notify` ohne Token / Kontroll-Route | 401 / 404 | 401 / 404 ✅ |
| – | `GET /planstatus/x` ohne Token | 401 | 401 ✅ |
| – | `GET /viewplan/ungueltig` | 404 | 404 ✅ |
| – | anonyme `plans`-Liste | `totalItems: 0` | `totalItems: 0` ✅ |
| – | CORS erlaubte Origin / fremde Origin | 1 / 0 Header | 1 / 0 Header ✅ |
| – | `crew_invites.createRule` | leer | leer ✅ |
| – | Frontend | 200 | 200 ✅ |
| – | Datenbestand `assignments` je Status, `crew_invites`, `users` | — | unverändert ✅ |
| 13 | `auxiliary.db`, `level > 0` seit Deploy | — | **0** `ReferenceError`/`TypeError` ✅ |

Zusätzlich lief das Server-Baseline-Skript vorher und nachher (Container, Health, Proxy-Netze,
Domains, Mail, fail2ban). `diff`: **nur die Hook-sha** unterscheidet sich.

Zu **13**: Alle 6 Einträge mit `level > 0` seit dem Deploy stammen von meinen eigenen
Kontrollaufrufen (401/404 ohne Token bzw. auf die erfundene Route, je einmal vorher und
nachher). Kontrollprobe für den Mechanismus: ein echtes Muster findet **194** Treffer, ein
erfundenes **0**, `data` ist in 23 von 23 Zeilen seit dem Deploy gefüllt.

### Nebenbefund: „geladen" steht zweimal im Log

```
09:27:19 [hook] main.pb.js v4.29 geladen
09:27:30 [hook] main.pb.js v4.29 geladen
```

Kein Fehler. PocketBase überwacht `pb_hooks/` und meldet direkt nach dem Kopieren
`File /app/pb_hooks/main.pb.js changed, restarting...`. Es lädt den Hook also **schon beim
Kopieren** neu, 11 s später folgt der `docker restart` aus dem Runbook. `RestartCount` bleibt 0.

**Das ist für dein Runbook relevant:** Eine kaputte Datei wäre in dem Moment live, in dem sie im
Volume liegt, nicht erst beim Restart. Das Gate *vor* dem Kopieren (Version, `routerAdd`, sha)
ist damit die einzige Schutzstufe. Der Restart danach ist im Grunde nur noch eine Bestätigung.

## Was auf Live offen bleibt

**Die Schreib-Messungen 2–12** brauchen ein angemeldetes Konto. Auf Test sind sie alle bestanden.

**Der Betreff der Planer-Mails** („VORMERKUNG ABGESAGT", „VORMERKUNG WIEDER FREI") war auf Test
nicht messbar, weil es dort keinen Mailversand gibt. Auf Live stehen derzeit **309** Einsätze auf
`pencilled` und **0** auf `pencil_declined`. Die erste echte Vormerkungs-Absage nach dem Livegang
der App liefert den Nachweis: einen Datensatz `pencil_declined` und im Container-Log
`[mail] Gesendet an … · VORMERKUNG ABGESAGT · …`. **Gib mir Bescheid, wenn eine Absage gekommen
ist, dann messe ich es nach.**

## Aufgeräumt

Auf Live wurde **kein** Datensatz angelegt oder geändert.

Auf Test standen seit gestern zusätzlich zwei Konten auf `@example.invalid` und eine kleine
Testtour mit drei vorgemerkten Tagen (für eine eigene UI-Prüfung, abgebrochen, weil du v1.4.0
schon getestet hattest). Alles ist gelöscht, Test ist exakt auf dem Stand vor beiden Deploys:
840 `assignments`, 1 `users`, 2 `_superusers`, 24 `crew_members`, 0 `crew_invites`, 3 `plans`.

Eine Beobachtung aus dieser UI-Prüfung, ungeprüft: In einem frischen Browser zeigten Kopfzeile
und Planliste als Planer „Demo Tour — Europa 2027", obwohl die Tabelle die echte Tour
(„Robs Test v1.4.0") enthielt. Falls das nicht gewollt ist, lohnt ein Blick.

## Was bei dir liegen bleibt

- App v1.4.0 in deiner Doku als live vermerken (README, Stempel)
- Hook-Version auf Live in `docs/database-schema.md` / `docs/security.md` und den Auftragsstempel nachziehen
- `node tools/check-pb-rules.mjs` (liest nur)
