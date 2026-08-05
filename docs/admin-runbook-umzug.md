# Admin-Runbook — Testumgebung aufsetzen (Stand 2026-07-28)

> ✅ **Erledigt am 2026-07-30** — die Testumgebung steht. Dieses Dokument bleibt als Verlauf stehen.

Konkrete „mach jetzt das"-Anleitung für den Server-Admin. Ausführliche Hintergründe:
[umzug-zwei-umgebungen.md](umzug-zwei-umgebungen.md). Marco hat **keinen** SSH-/Server-Zugang.

---

## Was bereits erledigt ist (Marcos Seite)

- ✅ **`live`-Branch** existiert auf GitHub — angelegt aus dem **aktuellen Live-Stand** (vor
  v0.31.0). Die Umstellung von Coolify auf `live` ist damit ein **No-Op für Live**.
- ✅ **Schema-Export** liegt im Repo: `pocketbase/pb_schema_live_2026-07-28.json` (8 App-
  Collections, korrekte Feldtypen = alles `text`, gehärtete Rules v0.26.0, inkl.
  `users.feed_token` + `crew_members.role`).
- ✅ **Hook `v4.11`** liegt auf `main` (`.pb_hooks/main.pb.js`) — bereit zum Deploy.
- ⏸ Das **v0.31.0-Frontend** (Hostname-basierte API-Wahl) ist bewusst **noch nicht** auf
  `main` — Marco pusht es erst, wenn Schritt A+B unten fertig sind.

## Zielbild

| | TEST | LIVE |
|---|---|---|
| Frontend | GitHub Pages, `main` (`aniflu.github.io/Crewplaner`) | Coolify-nginx, `live` (`crewplanner.nyxlightwork.de`) |
| Backend | **NEU:** `api-test.crewplanner.nyxlightwork.de` (ohne Mail) | `api.crewplanner.nyxlightwork.de` |

---

## Schritt A — Test-PocketBase aufsetzen (Live bleibt unberührt)

1. **DNS:** A-Record `api-test.crewplanner.nyxlightwork.de` → Server-IP.
2. **Coolify:** zweite PocketBase-App anlegen — **identisches Image/Version wie Live**
   (`ghcr.io/coollabsio/pocketbase`, PB v0.38; Parität ist wichtig, der Hook nutzt v0.38-APIs).
   Domain in Coolify auf `api-test.crewplanner.nyxlightwork.de`, TLS via Traefik.
3. **Traefik-Override** analog `pocketbase-fix.yaml`:
   - CORS erlaubt **nur** `https://aniflu.github.io`
   - **kein** StripPrefix (wie Live)
4. **`RESEND_KEY` NICHT setzen.** Der Hook v4.11 überspringt dann den Mailversand komplett →
   auf Test gehen garantiert keine echten Mails raus.
5. **Schema importieren:** PB Admin (`https://api-test.crewplanner.nyxlightwork.de/_/`) →
   Settings → **Import collections** → Datei **`pocketbase/pb_schema_live_2026-07-28.json`**
   aus dem Repo → **nur Schema, keine Daten** (Test startet leer) → Confirm.
6. **Rules gegenprüfen** (kommen mit dem Import): `assignments.updateRule`,
   `crew_invites.createRule`, `plans` list/viewRule dürfen **nicht** auf das permissive
   `@request.auth.id != ""` zurückgefallen sein.
7. **Hook v4.11 deployen** (Container-Name + Hooks-Volume-Pfad der neuen Instanz einsetzen):

   ```bash
   ssh hetzner "curl -s -o <TEST-HOOKS-VOLUME>/main.pb.js \
     https://raw.githubusercontent.com/Aniflu/Crewplaner/main/.pb_hooks/main.pb.js \
     && docker restart <TEST-PB-CONTAINER>"
   ```
   Log prüfen: `[hook] main.pb.js v4.11 geladen`
8. **Superuser** für die Test-Instanz anlegen (für Marco/Claude zum Einrichten/Testen).
9. **Health-Check:** `curl -I https://api-test.crewplanner.nyxlightwork.de/api/health` → `200`.

## Schritt B — Live-Container auf `live`-Branch umstellen (No-Op für Live)

1. Coolify → bestehende **Crewplaner-Frontend-App** (`od48m2ubvy7rqq55fofbqgph-154940502903`).
2. **Build-Branch** `main` → **`live`** umstellen, **Auto-Deploy on push** anlassen, einmal
   **Redeploy**. Da `live` = aktueller Live-Stand ist, baut Coolify identisch → Live ändert
   sich funktional nicht.
3. **Prüfen:** `curl -I https://crewplanner.nyxlightwork.de` → `200`, Version unverändert (v0.30.2).

> ⚠️ Reihenfolge: Schritt B **vor** Marcos v0.31.0-Push auf `main`. Solange die App noch
> `main` baut, würde ein `main`-Push sofort live gehen.

---

## Was JETZT noch NICHT gemacht wird

- ❌ Hook v4.11 auf die **Live**-PB (`api.crewplanner…`) — kommt zusammen mit dem Go-Live.
- ❌ Go-Live des Frontends (`main → live`-Merge) — macht Marco/Claude nach dem Test.
- ❌ `aniflu.github.io` aus der **Live**-CORS entfernen — optionale Härtung ganz am Ende,
  Anleitung: [admin-runbook-cors.md](admin-runbook-cors.md).

## Bitte an Marco zurückmelden

- **Container-Name** und **Hooks-Volume-Pfad** der Test-PB (für künftige Hook-Deploys)
- **Test-Superuser-Zugang** (sicher übermitteln)
- Bestätigung: **Schema importiert**, **Health-Check 200**, **Coolify auf `live` umgestellt**

Danach: Marco/Claude pusht v0.31.0 auf `main`, prüft die Testseite gegen die Test-DB, dann
gemeinsamer Go-Live (`main → live` + Hook v4.11 auf Live).
