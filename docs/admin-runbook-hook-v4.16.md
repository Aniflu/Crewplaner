# Admin-Runbook — Hook v4.16 + `plans`-Regel final zuschneiden (v0.6.1)

> ✅ **Erledigt am 2026-08-04/05** — Hook v4.16 auf beiden Backends, `plans`-Regel auf Live und Test final zugeschnitten, gegengeprüft (kein Konto hat eine Tour verloren). Dieses Dokument bleibt als Verlauf stehen.

Schließt deinen dritten Punkt vom 2026-08-04: *„ein eingeloggtes Crew-Mitglied sieht im Payload
seiner eigenen Tour weiterhin den `view_token`."* Stimmt — und ist jetzt app-seitig behoben.

**Was v4.16 bringt:**

1. **Zwei authentifizierte Routen** `GET /myplans` und `GET /myplan/{id}` (`$apis.requireAuth()`).
   Sie liefern der angemeldeten Crew ihre Touren bzw. eine Tour — **ohne** `view_token`,
   `view_shorturl`, `owner`. Zugriffsprüfung serverseitig: Owner **oder** App-Rolle
   `superadmin` **oder** `crew_members` dieser Tour; Ablehnung als **404** (verrät nicht, ob es
   die Tour gibt). Der Crew-Ladepfad im Frontend nutzt sie ab v0.6.1.
2. **Die is.gd-Kurzlinks sind raus.** Der Hook schickte bei jeder Token-Änderung die
   vollständige Ansichts-URL **inklusive Token** an is.gd — ein fremder Dienst, der sie
   dauerhaft speichert. Das untergräbt genau das Geheimnis, das wir gerade geschützt haben.
   Nebenbei funktionierte der Aufruf vom Server ohnehin nicht mehr: nach der Token-Rotation
   blieben alle sechs Kurzlinks leer, auch nach erneutem Anstoßen (is.gd ist von außen
   erreichbar, vom Server offenbar nicht — falls du im Log etwas dazu siehst, interessiert es
   mich, aber es ist kein Blocker mehr). Die Konsole fällt sauber auf die lange URL zurück.

> **Reihenfolge wie immer: Hook → Frontend → Regel.** Andersherum verliert jede Crew ihre Tour.
> Das Frontend (v0.6.1) liegt auf `main`, Live folgt erst nach deinem Deploy.

---

## Schritt 1 — Hook v4.16 (Test zuerst)

```bash
ssh «SERVER» "curl -s -o /tmp/main.pb.js \
  https://raw.githubusercontent.com/Aniflu/Crewplaner/main/.pb_hooks/main.pb.js \
  && grep -q 'v4.16 geladen' /tmp/main.pb.js \
  && cp <HOOKS-PFAD>/main.pb.js /root/backups/pb-hooks/main.pb.js.\$(date +%s) \
  && cp /tmp/main.pb.js <HOOKS-PFAD>/main.pb.js \
  && docker restart <CONTAINER>"
```

**Prüfen:** `[hook] main.pb.js v4.16 geladen`, `/api/health` → `200`

## Schritt 2 — Routen gegenprüfen

⚠️ **Ein Punkt, den ich nicht selbst prüfen konnte:** ob `$apis.requireAuth()` in eurem
PocketBase-Build existiert. Das Projekt hatte hier schon Ausfälle (`$app.dao()`, `$getEnv`,
`$tokens` fehlten nach dem v0.23-Sprung). Falls im Log ein `ReferenceError` zu `$apis`
auftaucht, **bitte sofort melden** — dann baue ich die Prüfung ohne Middleware
(Authorization-Header selbst lesen, `$app.findAuthRecordByToken`).

Ohne Token muss es abgewiesen werden:

```bash
curl -s -o /dev/null -w "%{http_code}\n" ".../myplans"          # erwartet: 401 (nicht 200)
```

Mit einem echten Nutzer-Token:

```bash
TOK=$(curl -s -X POST ".../api/collections/users/auth-with-password" \
  -H "Content-Type: application/json" -d '{"identity":"<CREW-MAIL>","password":"<PW>"}' \
  | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
curl -s ".../myplans" -H "Authorization: Bearer $TOK" | grep -c 'view_token'   # erwartet: 0
```

## Schritt 3 — Regel final zuschneiden (List **und** View, Collection `plans`)

```
@request.auth.id = owner || @request.auth.role = "superadmin"
```

Das ist **genau deine ursprüngliche Fassung** — sie wird jetzt korrekt, weil Crew die
Collection nicht mehr anfasst. Der `crew_members`-Zweig aus v0.6.0 entfällt.

`Create`/`Update`/`Delete` unverändert.

## Schritt 4 — Nachkontrolle

Marco prüft beides automatisch:

```bash
node tools/check-viewlink.mjs     # inkl. neuem Crew-Durchlauf
node tools/check-pb-rules.mjs
```

Der Crew-Durchlauf legt für ein crew_members-Mitglied **ohne bestehendes Konto** ein
temporäres Konto an, prüft `/myplans`, `/myplan` (eigene ladbar, fremde 404, kein Token) und
die Gegenprobe, dass der direkte REST-Weg für Crew **zu** ist — und räumt das Konto wieder ab.
Gegen den jetzigen Stand meldet er korrekt die zwei offenen Schritte (Routen 404, REST noch
offen).

## Schritt 5 — Live (⚠️ korrigierte Reihenfolge)

> **Korrektur.** Die ursprüngliche Fassung dieses Runbooks sagte hier „Schritte 1–4 auf Live
> wiederholen, danach merged Marco" — das widerspricht der Regel oben (**Hook → Frontend →
> Regel**) und hätte auf Live **allen 9 Crew-Konten sofort ihre Touren genommen**, weil dort
> noch das v0.6.0-Frontend mit dem alten REST-Pfad lief. Der Admin hat den Widerspruch
> bemerkt, nachgesehen und die Regel bewusst **nicht** gesetzt. Richtig ist:

1. **Hook v4.16 auf Live** (Schritt 1) — kann jederzeit, ändert für sich nichts.
2. **Frontend live**: Marco merged `main → live` (v0.6.1).
3. **Vorher-Check** — der ausgelieferte Crew-Pfad muss die neuen Routen nutzen:
   ```bash
   curl -s https://crewplanner.nyxlightwork.de/js/dataService.js | grep -c 'myplan'
   ```
   Muss **> 0** sein. Ist es 0, liegt dort noch v0.6.0 → **Regel NICHT setzen.**
4. **Erst dann die Regel** (Schritt 3) auf Live setzen.
5. Nachkontrolle (Schritt 4).

## Rollback

Backup aus Schritt 1 zurückkopieren + `docker restart`. Regel: den `crew_members`-Zweig wieder
anhängen (Fassung aus v0.6.0) — dann läuft der alte Crew-Pfad wieder.

---

## Erledigt seit deinem letzten Bericht

- **`test@test.com`** ist von der Live-PocketBase entfernt (Kontodaten vorher gesichert,
  danach 4 Superuser übrig: `robert@`, `admin@`, `marco@nyxlightwork.de`, `madmaxmail@`).
- **Tokens neu vergeben** auf beiden Instanzen; alte tot (404), neue funktionieren (200).
  Es gingen keine Links verloren — es hatte noch niemand einen.
- **v0.6.0 ist live**, die öffentliche Ansicht auf Live ist verifiziert (73 Zeilen, 6 Namen,
  350 Status-Symbole, kein Token im HTML).
