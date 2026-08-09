# Admin-Runbook — Registrierungs-Sperre scharfschalten (v0.5.1, Hook v4.13)

> ✅ **Erledigt am 2026-08-03** — Regel und Hook v4.13 auf beiden Backends. Dieses Dokument bleibt als Verlauf stehen.

## Warum

`users.createRule` ist derzeit **leer** — auf Test **und** Live kann sich **jede beliebige
Person** selbst ein Konto anlegen. Künftig soll gelten: Ein Konto entsteht nur für
E-Mail-Adressen, die der Planer vorher angelegt hat (Eintrag in `crew_members` — globaler
Pool **oder** Crew einer Tour). Die dort hinterlegte **Rolle** wird beim ersten Login
übernommen.

Abgesichert wird auf **zwei** Ebenen, weil Zugriffsregeln bei Coolify-Redeploy /
Schema-Reimport auf den permissiven Stand zurückfallen (in diesem Projekt mehrfach passiert):

| Ebene | Wirkung | Überlebt Redeploy? |
|---|---|---|
| `users.createRule` | hartes Tor in der Datenbank | **nein** → nach jedem Reimport neu setzen |
| Hook v4.13 | zweite Schicht, prüft zusätzlich kleingeschrieben | **ja** (Datei im Volume) |

---

## ⚠️ Schritt 0 — Erststart, SONST SPERRT MAN SICH AUS

Mit aktiver Sperre kann sich in einer **leeren** Datenbank **niemand** mehr registrieren.
Vor dem Scharfschalten muss mindestens ein Eintrag existieren.

- **Live**: unkritisch, 23 `crew_members` vorhanden (Stand 2026-08-01), darunter
  `«SUPERADMIN-MAIL»`. Nichts zu tun.
- **Test**: Datenbank ist leer → **zwingend zuerst** anlegen. Im Test-PocketBase-Admin
  (`https://api-test.crewplanner.nyxlightwork.de/_/`) → Collection `crew_members` → **New record**:

| Feld | Wert |
|---|---|
| `plan_id` | `__pool__` |
| `name` | Marco Hoch |
| `email` | `«SUPERADMIN-MAIL»` |
| `role` | `superadmin` |

Danach registriert sich Marco normal über die Login-Seite und ist sofort Superadmin
(die Rolle zieht der Hook aus diesem Eintrag).

> Weitere Personen legt Marco anschließend selbst in der Konsole an
> („+ Neues Crew-Mitglied") — dafür ist kein Server-Zugang nötig.

## Schritt 1 — Hook v4.13 deployen (erst Test, dann Live)

**Test** (Container-Name und Hooks-Pfad der Test-PB einsetzen):

```bash
ssh «SERVER» "curl -s -o <TEST-HOOKS-PFAD>/main.pb.js \
  https://raw.githubusercontent.com/Aniflu/Crewplaner/main/.pb_hooks/main.pb.js \
  && docker restart <TEST-CONTAINER>"
```

**Live:**

```bash
ssh «SERVER» "curl -s -o /var/lib/docker/volumes/«PB-HOOKS-VOLUME-LIVE»/_data/main.pb.js \
  https://raw.githubusercontent.com/Aniflu/Crewplaner/main/.pb_hooks/main.pb.js \
  && docker restart «PB-CONTAINER-LIVE»"
```

**Prüfen:** Log zeigt `[hook] main.pb.js v4.13 geladen`, `/api/health` → `200`.

> Der Hook bringt zugleich **v4.12** mit (vorgemerkte Termine im Kalender-Feed +
> Statuswechsel-Abschnitt in der Update-Mail, siehe
> [admin-runbook-hook-v4.12.md](admin-runbook-hook-v4.12.md)) — ein Deploy erledigt beides.

## Schritt 2 — `users.createRule` setzen

PocketBase-Admin → Collection `users` → **API Rules** → **Create rule**:

```
@collection.crew_members.email ?= email
```

Speichern. Auf **beiden** Instanzen, jeweils nach Schritt 0.

## Schritt 3 — Prüfen

**a) Nicht freigegebene Adresse muss abgewiesen werden:**

```bash
curl -s -X POST https://api-test.crewplanner.nyxlightwork.de/api/collections/users/records \
  -H "Content-Type: application/json" \
  -d '{"email":"fremder@example.com","password":"test12345","passwordConfirm":"test12345"}'
```

Erwartet: Fehlermeldung (`not_allowlisted` bzw. Regel-Ablehnung), **kein** angelegter Datensatz.
Gegenprobe im Log: `[hook] Registrierung abgewiesen (nicht freigegeben): fremder@example.com`.

**b) Freigegebene Adresse muss durchgehen:** Marco registriert sich über die Login-Seite mit
der in Schritt 0 angelegten Adresse → Konto entsteht, `users.role` = `superadmin`.

**c) Bestehende Konten unberührt:** mit einem vorhandenen Konto anmelden, „Passwort vergessen"
auslösen — beides muss unverändert funktionieren (die Sperre betrifft nur das **Anlegen**).

## Rollback

Sperre vorübergehend aufheben:

1. `users.createRule` wieder leeren (PB-Admin).
2. Hook zurücksetzen — die Vorgängerversion (v4.12) aus dem Git-Verlauf holen:
   ```bash
   ssh «SERVER» "curl -s -o <HOOKS-PFAD>/main.pb.js \
     https://raw.githubusercontent.com/Aniflu/Crewplaner/ad0ff86/.pb_hooks/main.pb.js \
     && docker restart <CONTAINER>"
   ```
   Log muss danach `v4.12 geladen` zeigen.

## Nach jedem Coolify-Redeploy prüfen

`users.createRule` gehört ab jetzt auf die Checkliste — zusammen mit `assignments.updateRule`
und `crew_invites.createRule` (v0.26.0) sowie dem strip-api-Fix. Der Hook fängt einen Verlust
der Regel zwar ab, aber beide Ebenen sollten stehen.
