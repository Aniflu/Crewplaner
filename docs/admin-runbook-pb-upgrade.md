# Admin-Runbook — PocketBase-Upgrade (Test + Live) auf aktuelle Version

Ziel: Beide PocketBase-Instanzen von der alten Version (Live = Mai-Image, dangling) auf eine
**aktuelle, explizit getaggte** Version heben — **ohne** die Live-Funktionen (Mail, Kalender-
Feed, Login/Auto-Verify) zu brechen.

**Grundprinzip:** Backup → **erst Test** upgraden & voll durchtesten → **dann Live** im
Wartungsfenster. Nie Live zuerst.

## ⚠️ Das Hauptrisiko: der Hook (`.pb_hooks/main.pb.js`)

Der Hook ist gegen die **JSVM-APIs von PocketBase v0.38** geschrieben und nutzt u.a.:
`e.next()` als Pflicht-erste-Zeile, `$app.save/delete` (NICHT `$app.dao()`), `$os.getenv`,
`$http.send`, `record.getString('jsonField')` + `JSON.parse` (JSON-Felder = JSONRaw),
`$security.randomString`, Custom-Route `routerAdd('GET','/ics/{token}/{plan}', …)` mit
`e.request.pathValue()` / `e.response.header().set()` / `e.string()`, Record-Hooks
(`onRecordAfterCreateSuccess/UpdateSuccess`, `onBootstrap`). **Genau diese APIs können sich
zwischen PB-Versionen ändern.** Deshalb wird der Hook auf Test **explizit verifiziert**, bevor
Live drankommt.

---

## Phase 0 — Zielversion festlegen

1. **Aktuelle Live-Version** bestimmen: PB loggt sie beim Start; oder
   `docker inspect <live-image>` / Coolify-Image-Tab.
2. **Zielversion** = die aktuelle stabile PocketBase-Version. **Als EXPLIZITEN Versions-Tag
   pinnen** (z.B. `ghcr.io/coollabsio/pocketbase:<X.Y.Z>`), **nicht** das floatende `:latest`
   und **nicht** dangling — für Reproduzierbarkeit auf beiden Instanzen.
3. **PocketBase-Changelog** zwischen aktueller und Zielversion überfliegen, v.a. **„JSVM /
   hooks breaking changes"** und **DB-Migrationen**.

## Phase 1 — Backup Live (Pflicht)

1. **PB-natives Backup:** Live-Admin (`api.crewplanner.nyxlightwork.de/_/`) → Settings →
   **Backups** → Backup erstellen → **herunterladen** und sicher ablegen.
2. **Zusätzlich Datei-Backup** des Daten-Volumes (SQLite `pb_data`) + `pb_hooks` auf dem
   Server sichern (analog Forgejo). → Das ist das Sicherheitsnetz für einen Rollback.
3. **Collections-Export** (Settings → Import/Export collections → Export) als JSON ablegen —
   entspricht dem bereits im Repo liegenden `pocketbase/pb_schema_live_2026-07-28.json`,
   aber frisch zur Sicherheit.

## Phase 2 — Upgrade auf TEST zuerst (Live bleibt unangetastet)

1. Test-PB-Image auf den **Zielversions-Tag** setzen (Coolify) → Redeploy.
2. **Grundcheck:** PB startet ohne Fehler (Log), `…/api-test…/api/health` → 200, Admin-UI
   erreichbar, Collections + Rules noch da (nach jedem Redeploy prüfen — Coolify-Falle).
3. **Hook v4.11 neu deployen** und Log prüfen: **`[hook] main.pb.js v4.11 geladen`** — und
   **keine JSVM-Fehler** beim Start. (Das ist der wichtigste Einzelcheck.)
4. **Voll durchtesten** auf der Testseite `aniflu.github.io/Crewplaner`:
   - **Login / Registrierung** (Auto-Verify des users-Hooks).
   - **Plan anlegen**, Crew hinzufügen, Zuweisungen, Vormerken.
   - **Kalender-Feed** aufrufen: `…/api-test…/ics/<token>/<planId>` → liefert `text/calendar`
     (testet die Custom-Route — eine Kern-JSVM-Fläche).
   - **Bestätigen/Ablehnen** über die App → `activity_log` + Status prüfen.
   - **Mail-Pfad (optional, empfohlen):** Test hat bewusst keinen `RESEND_KEY`. Um den
     Mail-Teil des Hooks auf der neuen Version zu prüfen, **temporär** einen `RESEND_KEY`
     auf Test setzen, **eine** Einladung an die **eigene** Adresse auslösen (Mail kommt an?),
     **dann Key wieder entfernen**. Ohne diesen Schritt bleibt der Mail-HTTP-Pfad ungetestet.
5. **Bricht irgendwas** (Hook lädt nicht / Route 500 / Fehler im Log) → die neue Version hat
   die JSVM-API geändert. **Nicht auf Live gehen.** Entweder Hook an die neue Version anpassen
   (dann sag Marco/Claude Bescheid — Hook-Änderung + erneuter Test) oder eine ältere
   Zielversion wählen.

## Phase 3 — Upgrade LIVE (nur wenn Test 100 % sauber)

1. **Kurzes Wartungsfenster** ankündigen (Crew nutzt Live evtl. gerade).
2. **Frisches Live-Backup** direkt davor (Phase 1 wiederholen).
3. Live-PB-Image auf **denselben Zielversions-Tag** setzen → Redeploy.
4. **Verifizieren:**
   - PB startet ohne Fehler, `…/api…/api/health` → 200, Admin-UI erreichbar.
   - **Daten intakt:** ein echter Plan + Zuweisungs-Anzahl stichprobenartig prüfen.
   - **Collections/Rules/strip-api/CORS** nach dem Redeploy erneut prüfen (Coolify-Falle,
     siehe CLAUDE.md: `pocketbase-fix.yaml` Priorität 1000, gehärtete Rules, CORS ohne
     `aniflu.github.io` auf Live).
   - **Hook v4.11 deployen** → Log `v4.11 geladen`.
   - **Echte Flows:** Login, Plan öffnen, echten ICS-Link testen, **eine** Test-Einladung an
     die eigene Adresse (echte Mail kommt an?).
5. **Logs beobachten** (`docker logs … -f`) auf JSVM-Fehler in den ersten Minuten.
6. **Rollback-Plan:** Bei Problemen Image zurück auf den alten Tag + Backup zurückspielen.

## Phase 4 — Nachsorge

- **Beide** Instanzen auf **demselben expliziten Versions-Tag** pinnen (kein `:latest`, kein
  dangling) → reproduzierbar + Test spiegelt Live weiterhin exakt.
- Backups noch eine Weile aufbewahren.
- **CLAUDE.md aktualisieren:** PB-Versionsangabe (aktuell „v0.38") + etwaige JSVM-Änderungen,
  damit künftige Hook-Arbeit die richtige API-Basis kennt.

## Was Marco/Claude beitragen können

- Per Superuser-Zugang: **Collections/Rules nach dem Upgrade gegenprüfen**, ein PB-natives
  **Backup anstoßen**, den **ICS-Feed** technisch testen.
- **Hook an die neue Version anpassen**, falls Phase 2 einen JSVM-Bruch zeigt.
- Der Rest (Image-Tag, Redeploy, Volume-Backup, Wartungsfenster) läuft über den Admin.
