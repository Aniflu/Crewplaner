# Admin-Runbook — Hook v4.14 deployen (v0.5.2)

> ✅ **Erledigt am 2026-08-04** — Hook v4.14 ist auf beiden Backends deployt und verifiziert. Dieses Dokument bleibt als Verlauf stehen.

## Warum

Am 3. August kam heraus, dass `assignments.listRule` **leer** war — alle 913 Einsätze inkl.
**10 echter Crew-E-Mail-Adressen** waren ohne Anmeldung und ohne den geheimen Ansichts-Link
abrufbar. Die Regel ist geschlossen (`@request.auth.id != ""`, auf beiden Instanzen gesetzt).

Sie war aber tragend: `view.html` las die Collection ungeschützt, um im öffentlichen
Booker-Link die Status-Farben (⏳/✓/✎) zu zeigen. Seit dem Schließen fehlen diese Farben.

v4.14 bringt sie zurück, ohne die Daten wieder zu öffnen: eine neue Route
`GET /viewstatus/{token}` prüft den geheimen `view_token` und gibt **nur** Datum, Position,
Status und Anzeigename heraus — **keine E-Mail-Adressen**, und nur für den einen Plan.

**Ungefährlich auszurollen:** Ohne den Deploy rendert die öffentliche Ansicht wie bisher
(nur ohne Farben) — der Abruf steht clientseitig in einem `try/catch`.

---

## Deploy (erst Test, dann Live)

**Test** (Container/Pfad wie beim letzten Mal):

```bash
ssh hetzner "curl -s -o <TEST-HOOKS-PFAD>/main.pb.js \
  https://raw.githubusercontent.com/Aniflu/Crewplaner/main/.pb_hooks/main.pb.js \
  && docker restart <TEST-CONTAINER>"
```

**Live:**

```bash
ssh hetzner "curl -s -o /var/lib/docker/volumes/ad9adhhkygjreidi79i4v5eb_pocketbase-hooks/_data/main.pb.js \
  https://raw.githubusercontent.com/Aniflu/Crewplaner/main/.pb_hooks/main.pb.js \
  && docker restart pocketbase-ad9adhhkygjreidi79i4v5eb"
```

**Prüfen:** Log zeigt `[hook] main.pb.js v4.14 geladen`, `/api/health` → `200`.

## Gegenprobe

Mit einem `view_token` aus der `plans`-Collection:

```bash
curl -s "https://api.crewplanner.nyxlightwork.de/viewstatus/<VIEW-TOKEN>" | head -c 400
```

Erwartet: JSON mit `{"plan":"…","statuses":{"2026-06-23":{"gl":{"status":"confirmed","crewName":"…"}}}}`

**Und das Wichtigste — es darf KEINE Mailadresse enthalten:**

```bash
curl -s "https://api.crewplanner.nyxlightwork.de/viewstatus/<VIEW-TOKEN>" | grep -c "@" 
```

Erwartet: `0`

Falscher/erfundener Token → `404`.

Danach den öffentlichen Link im Browser öffnen: Die Status-Farben müssen wieder da sein.

## Nach dem Deploy: Regeln kontrollieren

Der Container-Neustart ist harmlos, aber ein **Coolify-Redeploy** setzt Zugriffsregeln
erfahrungsgemäß zurück. Marco kann das jederzeit selbst prüfen:

```bash
node tools/check-pb-rules.mjs          # nur prüfen
node tools/check-pb-rules.mjs --fix    # Abweichungen zurücksetzen
```

Das Werkzeug prüft beide Instanzen und macht zusätzlich die Gegenprobe von außen
(„was liefert die API ohne Anmeldung?").

## Rollback

```bash
ssh hetzner "curl -s -o <HOOKS-PFAD>/main.pb.js \
  https://raw.githubusercontent.com/Aniflu/Crewplaner/dd8aec8/.pb_hooks/main.pb.js \
  && docker restart <CONTAINER>"
```

(`dd8aec8` = letzter Commit mit Hook v4.13.) Log muss danach `v4.13 geladen` zeigen.
