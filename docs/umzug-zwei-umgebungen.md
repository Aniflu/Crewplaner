# Zwei getrennte Umgebungen — Anleitung für den Server-Admin

> ✅ **Erledigt am 2026-07-30** — beide Umgebungen laufen getrennt. Dieses Dokument bleibt als Verlauf stehen.

**Ziel:** GitHub wird eine **echte, isolierte Testumgebung**, Live läuft getrennt und wird
nur per bewusstem „Go-Live" aktualisiert. Marco hat **keinen SSH-/Server-Zugang** — die hier
beschriebenen Schritte auf dem Hetzner-Server kann nur der Admin ausführen.

## Zielbild

| | **TEST** | **LIVE** |
|---|---|---|
| Frontend | GitHub Pages, Branch `main` | bestehender Coolify-nginx-Container, Branch `live` |
| URL | `aniflu.github.io/Crewplaner` | `crewplanner.nyxlightwork.de` |
| Backend (PocketBase) | **NEU:** `api-test.crewplanner.nyxlightwork.de` | bestehend: `api.crewplanner.nyxlightwork.de` |
| Mailversand | **aus** (kein `RESEND_KEY`) | echt (Resend, unverändert) |
| Daten | eigene Test-DB | echte Tourdaten |

Das Frontend wählt seine PocketBase **automatisch nach Hostname** (Code v0.31.0):
`crewplanner.nyxlightwork.de` → Live-API, alles andere (GitHub Pages, localhost) → Test-API.
Es ist also **derselbe Code** in beiden Umgebungen — es muss beim Deploy nichts umgeschrieben
werden.

---

## Schritt 1 — Test-PocketBase aufsetzen (einmalig)

Eine **zweite** PocketBase-Instanz, nur für die GitHub-Testseite, **ohne** Mailversand.

1. In **Coolify** eine neue PocketBase-App anlegen (gleiches Vorgehen/Image wie die Live-API).
2. **Domain** in Coolify/Traefik: `api-test.crewplanner.nyxlightwork.de`
   - DNS-A-Record auf den Server, TLS via Traefik (wie bei `api.crewplanner…`).
3. **CORS** (Traefik dynamic config, analog zur Live-Regel `pocketbase-fix.yaml`):
   erlaubte Origin **`https://aniflu.github.io`**. Kein `StripPrefix` (wie Live).
4. **`RESEND_KEY` NICHT setzen.** Dann überspringt der Hook den Mailversand komplett
   (Code-Guard v4.11) → auf Test gehen garantiert keine echten Mails raus.
5. **Schema importieren:** Fertiger, aktueller **Live-Export** liegt im Repo unter
   **`pocketbase/pb_schema_live_2026-07-28.json`** (8 App-Collections, read-only aus der
   Live-PB gezogen). PB Admin → Settings → **Import collections** → diese JSON → Confirm.
   Vorteil: garantierte Parität — die **korrekten Feldtypen** (alle kritischen Felder bereits
   `text`, nicht `relation`) **und** die **gehärteten Zugriffsregeln** (v0.26.0) sind darin
   schon enthalten. *(Die alte `pocketbase/pb_schema.json` NICHT verwenden — veraltete
   Relation-IDs.)*
6. **Zugriffsregeln prüfen:** Sie kommen mit dem Export mit (`assignments.updateRule`,
   `crew_invites.createRule`, `plans` list/viewRule). Nach dem Import kurz gegenprüfen, dass
   sie nicht auf das permissive `@request.auth.id != ""` zurückgefallen sind.
7. Feld **`users.feed_token`** (text, optional) anlegen.
8. **Hook deployen** → siehe Schritt 3 (Test-Pfad).
9. **Superuser** für die Test-Instanz anlegen (Login ins Test-Admin-UI
   `https://api-test.crewplanner.nyxlightwork.de/_/`).
10. **Prüfen:** `curl -I https://api-test.crewplanner.nyxlightwork.de/api/health` → `200`.

> Die Test-DB startet leer. Marco legt zum Testen auf der GitHub-Seite selbst einen Plan an.
> **Bitte an Marco durchgeben:** Container-Name und Hooks-Volume-Pfad der neuen Test-Instanz
> (für künftige Hook-Deploys), sowie den Test-Superuser-Zugang.

---

## Schritt 2 — Live-Container auf den `live`-Branch umstellen (einmalig)

Damit Test-Pushes auf `main` **nicht** mehr automatisch live gehen.

> ✅ **Vorbedingung erledigt:** Der `live`-Branch existiert bereits auf GitHub (angelegt
> 2026-07-28 aus dem **aktuellen Live-Stand**, also vor v0.31.0). Die Branch-Umstellung ist
> damit ein **No-Op für Live** — Coolify baut denselben Stand, der jetzt schon läuft. Das
> neue v0.31.0-Frontend kommt erst später per bewusstem `main → live`-Merge (Go-Live).

1. In Coolify die bestehende **Crewplaner-Frontend-App** öffnen
   (`od48m2ubvy7rqq55fofbqgph-154940502903`).
2. **Build-Branch** von `main` auf **`live`** umstellen.
   ⚠️ **Wichtig — Reihenfolge:** Solange die App noch `main` baut, geht jeder Test-Push
   sofort live. Diese Umstellung daher **bevor** Marco v0.31.0 auf `main` pusht.
3. **Auto-Deploy on push** anlassen (so löst `git push origin live` das Go-Live aus).
4. Einmal manuell **Redeploy** auslösen → Live ist sauber vom `live`-Branch gebaut.
5. **Prüfen:** `curl -I https://crewplanner.nyxlightwork.de` → `200`, Version unverändert.

---

## Schritt 3 — Hook `main.pb.js` v4.11 auf BEIDE Backends deployen

Ab jetzt bekommen **zwei** PocketBase-Instanzen den Hook. Reihenfolge: **erst Test, prüfen,
dann Live.** Der Hook liegt im GitHub-Repo unter `.pb_hooks/main.pb.js`.

**Test-Backend** (Container-Name/Volume vom Admin einsetzen — aus Schritt 1):

```bash
ssh hetzner "curl -s -o <TEST-HOOKS-VOLUME>/main.pb.js \
  https://raw.githubusercontent.com/Aniflu/Crewplaner/main/.pb_hooks/main.pb.js \
  && docker restart <TEST-PB-CONTAINER>"
```

**Live-Backend** (wie bisher, siehe `CLAUDE.md`):

```bash
ssh hetzner "curl -s -o /var/lib/docker/volumes/ad9adhhkygjreidi79i4v5eb_pocketbase-hooks/_data/main.pb.js \
  https://raw.githubusercontent.com/Aniflu/Crewplaner/main/.pb_hooks/main.pb.js \
  && docker restart pocketbase-ad9adhhkygjreidi79i4v5eb"
```

**Prüfen** (in den Docker-Logs beider Container): `[hook] main.pb.js v4.11 geladen`

> Hinweis: Solange der Hook v4.11 nur von `main` gezogen wird, ist das ok — der Hook-Code ist
> in beiden Branches identisch. Alternativ vom `live`-Branch ziehen (`…/live/.pb_hooks/…`).

---

## Schritt 4 (optional, empfohlen) — GitHub aus der Live-CORS entfernen

**Erst NACH** erfolgreicher Umstellung und Prüfung, dass die GitHub-Seite die Test-DB nutzt:
`https://aniflu.github.io` aus der **Live**-Backend-CORS (`pocketbase-fix.yaml`) entfernen.
Dann kann die Testseite die Live-DB nicht einmal mehr erreichen. **Reihenfolge zwingend:**
zuerst Frontend v0.31.0 live/getestet, dann diesen Schritt — sonst sperrt man sich vorher aus.

---

## Der Alltag danach (für Marco, kein Server-Zugang nötig)

- **Testen:** `git push origin main` → erscheint auf `aniflu.github.io/Crewplaner`, redet mit
  der **Test-DB**. Gefahrlos ausprobieren.
- **Go-Live:** geprüften Stand von `main` nach `live` bringen:
  ```bash
  git checkout live && git merge main && git push origin live && git checkout main
  ```
  → Coolify baut den Live-Container automatisch neu. Kein Admin, kein SSH nötig.

Nur **Server-Sachen** (neue Collection, Schema-Änderung, Hook-Update, CORS) brauchen weiter
den Admin — für Hooks: einfach diesen Schritt 3 erneut ausführen (beide Backends).
