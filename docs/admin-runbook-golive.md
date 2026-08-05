# Admin-Runbook — Go-Live (Live-seitige Schritte)

> ✅ **Erledigt am 2026-07-30** — der erste Go-Live ist durch; der Ablauf ist inzwischen Routine (siehe CLAUDE.md, Abschnitt „Deploy"). Dieses Dokument bleibt als Verlauf stehen.

Die Testumgebung steht (siehe [admin-runbook-umzug.md](admin-runbook-umzug.md)). Dieses
Runbook betrifft **nur den ersten Go-Live** von v0.31.0 auf Live und ist danach die Vorlage
für künftige Go-Lives.

## Wer macht was

- **Marco/Claude** schaltet das **Frontend** live (Git): `main → live`. Coolify baut den
  Live-Container automatisch neu (Auto-Deploy on push auf `live`). **Kein Admin-Schritt nötig.**
- **Admin** macht **einmalig** den **Live-Hook** aktuell (unten). Optional die CORS-Härtung.

## Schritt 1 — Hook v4.11 auf die Live-PocketBase (einmalig)

Die Live-PB läuft noch auf Hook **v4.10**. v4.11 bringt: Doc-Links auf
`crewplanner.nyxlightwork.de/docs` (statt GitHub) + einen No-Op-Guard bei fehlendem
`RESEND_KEY` (auf Live irrelevant, da der Key gesetzt ist → **kein Verhaltensunterschied für
den Live-Mailversand**). Rückwärtskompatibel — kann auch schon vor dem Frontend-Go-Live
deployt werden.

```bash
ssh hetzner "curl -s -o /var/lib/docker/volumes/ad9adhhkygjreidi79i4v5eb_pocketbase-hooks/_data/main.pb.js \
  https://raw.githubusercontent.com/Aniflu/Crewplaner/main/.pb_hooks/main.pb.js \
  && docker restart pocketbase-ad9adhhkygjreidi79i4v5eb"
```

**Prüfen** (Docker-Logs Live-PB): `[hook] main.pb.js v4.11 geladen`
Kurz danach: `curl -I https://api.crewplanner.nyxlightwork.de/api/health` → `200`.

> Der Container-Neustart verursacht einen kurzen API-Blip (Sekunden). Am besten in einem
> ruhigen Moment / zusammen mit dem Frontend-Go-Live.

## Schritt 2 — (optional, empfohlen) GitHub aus der Live-CORS entfernen

**Erst NACH** erfolgreichem Go-Live und Prüfung, dass die GitHub-Testseite die **Test**-DB
nutzt (das ist bereits verifiziert). Dann `https://aniflu.github.io` aus der **Live**-CORS
entfernen, damit die Testseite die Live-DB gar nicht mehr erreichen kann.

👉 **Schritt-für-Schritt-Anleitung mit allen Befehlen, Prüfungen und Rollback:
[admin-runbook-cors.md](admin-runbook-cors.md)**

Kurzfassung: im Live-CORS-Override (`/data/coolify/proxy/dynamic/pocketbase-fix.yaml`) unter
`accessControlAllowOriginList` die Zeile `aniflu.github.io` streichen, sodass nur noch
`https://crewplanner.nyxlightwork.de` erlaubt ist. Traefik lädt die Datei automatisch neu
(kein Restart, kein Ausfall).

Die **Test**-PB behält ihren eigenen Override mit `aniflu.github.io` — nur die **Live**-PB
wird eingeschränkt.

## Verifikation nach Go-Live

- `curl -I https://crewplanner.nyxlightwork.de` → `200`, Version zeigt **v0.31.0**.
- Live-Frontend spricht weiterhin `api.crewplanner.nyxlightwork.de` an (Hostname-Erkennung),
  echte Tourdaten unverändert.
- Docker-Logs Live-PB: `v4.11 geladen`.

## Zusammengefasst: künftiger Standard-Ablauf

1. Marco testet auf `aniflu.github.io/Crewplaner` (→ Test-DB, keine echten Mails).
2. Passt → Marco/Claude: `main → live` (Frontend-Go-Live, Coolify baut automatisch).
3. Hook-Änderungen? → Admin deployt `main.pb.js` an **beide** PB (erst Test, dann Live,
   Befehle in [admin-runbook-umzug.md](admin-runbook-umzug.md) bzw. oben).
