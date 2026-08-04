# Admin-Runbook — Hook v4.15 + `plans`-Regel schließen (v0.6.0)

Behebt den Befund vom 2026-08-04: [befund-plans-listrule-2026-08-04.md](befund-plans-listrule-2026-08-04.md).
Kurz: `plans.listRule` endete auf `|| view_token != ""` — ein Zweig, der auf **jeden** Plan mit
Token zutrifft. Dadurch waren alle Pläne anonym abrufbar, **inklusive der `view_token` im
Klartext**. v4.15 bringt eine Route, die den Plan über den Token ausliefert, ohne den Token
selbst preiszugeben; danach kann die Regel zu.

> **Reihenfolge ist zwingend:** erst Hook, dann Frontend, dann Regel. Andersherum bricht die
> öffentliche Ansicht sofort.

---

## Schritt 1 — Hook v4.15 deployen (Test zuerst)

```bash
ssh hetzner "curl -s -o /tmp/main.pb.js \
  https://raw.githubusercontent.com/Aniflu/Crewplaner/main/.pb_hooks/main.pb.js \
  && grep -q 'v4.15 geladen' /tmp/main.pb.js \
  && cp <HOOKS-PFAD>/main.pb.js /root/backups/pb-hooks/main.pb.js.$(date +%s) \
  && cp /tmp/main.pb.js <HOOKS-PFAD>/main.pb.js \
  && docker restart <CONTAINER>"
```

(Das ist bewusst dein Vorgehen vom letzten Mal — nach `/tmp` laden, Version prüfen, erst dann
kopieren. Danke dafür; `curl -o` direkt ins Volume würde bei einem GitHub-Fehler die Fehlerseite
in die Hook-Datei schreiben, und `&&` sieht nur curls Exit-Code.)

**Prüfen:** Log zeigt `[hook] main.pb.js v4.15 geladen`, `/api/health` → `200`.

## Schritt 2 — Route gegenprüfen

Mit einem `view_token` aus `plans`:

```bash
curl -s ".../viewplan/<VIEW-TOKEN>" | head -c 300
```

Erwartet: `{"name":"AMK Tour 2026","plan_data":{...}}`

**Und es darf weder Token noch Owner noch eine Adresse enthalten:**

```bash
curl -s ".../viewplan/<VIEW-TOKEN>" | grep -c 'view_token\|owner\|@'
```

Erwartet: **`0`** · Erfundener Token → `404`

## Schritt 3 — Regel schließen (list **und** view)

PocketBase-Admin → Collection `plans` → API Rules → **List** und **View** je auf:

```
@request.auth.id = owner || @request.auth.role = "superadmin" || (@collection.crew_members.plan_id ?= id && @collection.crew_members.email ?= @request.auth.email)
```

`Create`, `Update`, `Delete` bleiben unverändert.

> Der dritte Zweig ist nötig, damit **Crew** ihre eigenen Touren weiter laden kann
> (`loadPlanForCrew`/`loadCrewPlans` lesen den Plan per `pbGet`; Crew ist weder Owner noch
> superadmin). Ohne ihn wäre die komplette Crew-Ansicht tot.
>
> Die Semantik ist auf der Testinstanz mit einem echten Crew-Konto erprobt: eigene Tour `200`,
> fremde Touren `404`, Auflistung genau 1 Plan, anonym 0. PocketBase bindet beide
> `@collection`-Bedingungen an denselben Datensatz.

## Schritt 4 — Nachkontrolle

```bash
curl -s ".../api/collections/plans/records?perPage=50" | grep -c '"view_token"'
```

Erwartet: **`0`**

Marco kann zusätzlich alles auf einmal prüfen:

```bash
node tools/check-pb-rules.mjs          # beide Instanzen, inkl. Gegenprobe von außen
node tools/check-pb-rules.mjs --fix    # Abweichungen zurücksetzen
```

Das Werkzeug erkennt jetzt auch einen offenliegenden `view_token` und macht die Prüfung an
`totalItems` fest statt am Statuscode — dein Hinweis ist eingearbeitet.

## Schritt 5 — Live

Schritte 1–4 auf Live wiederholen, nachdem Test grün ist.

## Schritt 6 — Tokens neu vergeben (macht Marco, kein SSH nötig)

Die alten Tokens standen offen im Netz. Marco setzt sie per Superuser-API neu — zusammen mit
`view_shorturl: ""`, sonst erzeugt der Kurzlink-Hook keinen neuen Link und der alte is.gd-Link
zeigt auf einen toten Token.

## Rollback

Hook: das Backup aus Schritt 1 zurückkopieren + `docker restart` (schneller als der Weg über
einen Git-Commit). Regel: dritten Zweig wieder auf `|| view_token != ""` setzen — dann läuft die
alte Ansicht wieder, mit dem bekannten Leck.
