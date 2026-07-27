# Zwei getrennte Umgebungen — Anleitung für den Server-Admin

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
5. **Schema importieren:** dasselbe Collections-JSON wie Live (siehe `CLAUDE.md` →
   „Collections nach Coolify-Redeploy weg"). **Alle Felder als `text`** anlegen (nie
   `relation` — bekannte Feldtyp-Falle bei `assignments.proposed_by`, `assignments.plan_id`,
   `crew_members.plan_id`, `crew_members.role`).
6. **Zugriffsregeln wie Live** setzen (die Härtung aus v0.26.0 — sonst sind sie nach dem
   Import permissiv):
   - `assignments.updateRule`, `crew_invites.createRule`, `plans` list/viewRule
     (Wortlaut siehe `CLAUDE.md` → Abschnitt „Server-seitige Zugriffsregeln GEHÄRTET").
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

1. In Coolify die bestehende **Crewplaner-Frontend-App** öffnen
   (`od48m2ubvy7rqq55fofbqgph-154940502903`).
2. **Build-Branch** von `main` auf **`live`** umstellen.
   ⚠️ **Wichtig — Reihenfolge:** Solange die App noch `main` baut, geht jeder Test-Push
   sofort live. Diesen Schritt daher **bevor** Marco anfängt, nur-Test auf `main` zu pushen.
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
