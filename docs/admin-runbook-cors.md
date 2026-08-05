# Admin-Runbook — CORS-Härtung Live (GitHub-Origin entfernen)

> ⏳ **OFFEN — der einzige verbliebene Admin-Punkt (Stand 2026-08-05).** Braucht SSH-Zugang zur Traefik-Konfiguration. Nicht kritisch: PocketBase verlangt für alle Daten weiterhin Anmeldung, und der Preflight gibt fremden Herkünften keine Freigabe.

**Ziel:** Die **Live**-PocketBase (`api.crewplanner.nyxlightwork.de`) soll nur noch Anfragen
vom Live-Frontend (`https://crewplanner.nyxlightwork.de`) beantworten. Die GitHub-Testseite
(`https://aniflu.github.io`) fliegt aus der **Live**-CORS-Liste.

**Warum:** Seit v0.31.0 gibt es zwei Umgebungen. Die Testseite spricht per Hostname-Erkennung
ohnehin nur noch mit der **Test**-PocketBase — CORS ist die zweite, serverseitige Absicherung
dagegen, dass eine Testseite (oder ein alter Browser-Cache / eine alte Bookmarks-Version) je
wieder in die **echten Tourdaten** schreiben kann.

**Aufwand:** ~5 Minuten, kein Neustart, kein Ausfall. Traefik lädt die Datei automatisch neu.

> ⚠️ **Nur die LIVE-PocketBase anfassen.** Die **Test**-PB behält `aniflu.github.io` in ihrer
> CORS-Liste — sonst funktioniert die Testumgebung nicht mehr.

---

## Schritt 0 — Vorbedingung

Erst durchführen, wenn der Go-Live von v0.31.0 gelaufen ist und geprüft wurde, dass
`aniflu.github.io/Crewplaner` die **Test**-DB benutzt (bereits verifiziert).

## Schritt 1 — Die richtige Datei finden

```bash
ssh hetzner "grep -rl 'aniflu.github.io' /data/coolify/proxy/dynamic/"
```

Erwartet: `/data/coolify/proxy/dynamic/pocketbase-fix.yaml` (ggf. zusätzlich eine eigene
Datei für die **Test**-PB — die **bleibt unverändert**).

Inhalt ansehen, um die richtige Middleware zu identifizieren:

```bash
ssh hetzner "grep -n -A6 'accessControlAllowOriginList' /data/coolify/proxy/dynamic/pocketbase-fix.yaml"
```

Dort steht eine Liste in der Art:

```yaml
        accessControlAllowOriginList:
          - "https://crewplanner.nyxlightwork.de"
          - "https://aniflu.github.io"
```

## Schritt 2 — Backup

```bash
ssh hetzner "cp /data/coolify/proxy/dynamic/pocketbase-fix.yaml \
  /data/coolify/proxy/dynamic/pocketbase-fix.yaml.bak-$(date +%F)"
```

> Das Backup **muss** die Endung `.bak-…` haben (nicht `.yaml`) — sonst liest Traefik es als
> zweite gültige Config-Datei ein und es gibt doppelte Middleware-Definitionen.

## Schritt 3 — Zeile entfernen

Datei bearbeiten:

```bash
ssh hetzner "nano /data/coolify/proxy/dynamic/pocketbase-fix.yaml"
```

Die Zeile mit `aniflu.github.io` **innerhalb von `accessControlAllowOriginList` löschen**, so
dass nur noch bleibt:

```yaml
        accessControlAllowOriginList:
          - "https://crewplanner.nyxlightwork.de"
```

Alles andere in der Datei unverändert lassen — insbesondere die **Router-Priorität 1000**
(die überschreibt die `strip-api`-Middleware, die Coolify bei jedem Redeploy neu schreibt;
siehe CLAUDE.md). Speichern (`Strg+O`, `Enter`, `Strg+X`).

## Schritt 4 — Prüfen

Traefik lädt die Datei innerhalb weniger Sekunden selbst neu. Dann:

**a) Live-Frontend darf weiterhin** — muss den Origin-Header zurückgeben:

```bash
ssh hetzner "curl -s -I -H 'Origin: https://crewplanner.nyxlightwork.de' \
  https://api.crewplanner.nyxlightwork.de/api/health | grep -i 'access-control-allow-origin'"
```

Erwartet: `access-control-allow-origin: https://crewplanner.nyxlightwork.de`

**b) GitHub darf nicht mehr** — es darf **kein** `access-control-allow-origin` kommen:

```bash
ssh hetzner "curl -s -I -H 'Origin: https://aniflu.github.io' \
  https://api.crewplanner.nyxlightwork.de/api/health | grep -i 'access-control-allow-origin'"
```

Erwartet: **keine Ausgabe** (leer).

**c) API lebt weiter:**

```bash
ssh hetzner "curl -s -o /dev/null -w '%{http_code}\n' https://api.crewplanner.nyxlightwork.de/api/health"
```

Erwartet: `200`

**d) Test-Umgebung unbeeinträchtigt** — die Testseite muss weiter funktionieren:

```bash
ssh hetzner "curl -s -I -H 'Origin: https://aniflu.github.io' \
  https://api-test.crewplanner.nyxlightwork.de/api/health | grep -i 'access-control-allow-origin'"
```

Erwartet: `access-control-allow-origin: https://aniflu.github.io`

**e) Marco prüft im Browser:** https://crewplanner.nyxlightwork.de öffnen, einloggen, eine Tour
laden — muss normal laufen (keine CORS-Fehler in der Konsole).

## Rollback (falls etwas klemmt)

```bash
ssh hetzner "cp /data/coolify/proxy/dynamic/pocketbase-fix.yaml.bak-<DATUM> \
  /data/coolify/proxy/dynamic/pocketbase-fix.yaml"
```

Traefik lädt automatisch neu — nach ein paar Sekunden ist der alte Zustand wieder da.

---

## ⚠️ Nach jedem Coolify-Redeploy prüfen

Coolify überschreibt bei jedem Redeploy seine eigenen Traefik-Labels. Der Override in
`pocketbase-fix.yaml` (Priorität 1000) bleibt bestehen und gewinnt — aber wenn nach einem
Redeploy die API `404` liefert oder CORS wieder GitHub erlaubt, ist **immer** hier
nachzusehen (siehe auch CLAUDE.md, Abschnitt „Traefik strip-api Bug").
