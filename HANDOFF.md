# HANDOFF — Tour Crew Plan

> Dieses Dokument ist für den Kollegen und seinen Claude-Assistenten.
> Lies es komplett durch, bevor du irgendetwas tust.

---

## 1. Was ist diese App?

**Tour Crew Plan** ist eine Web-App zur Verwaltung von Crew-Besetzungen für Tourneen.

- Ein **Admin** (Tourmanager) legt Tourdaten, Positionen und Crew-Mitglieder an
- Der Admin weist Crew-Mitglieder pro Position und Tag zu — oder stellt **Anfragen** (Proposals)
- **Crew-Mitglieder** loggen sich ein, sehen ihre zugewiesenen Tage und können **bestätigen oder ablehnen**
- Benachrichtigungen laufen per E-Mail (via Pocketbase-Hook + eigener SMTP-Server)

**Tech-Stack:**
- Vanilla JavaScript (kein Framework, kein Build-Step)
- HTML5 + CSS3
- **Pocketbase** (Self-hosted, läuft auf eigenem Server) — Auth + Datenbank + E-Mail-Hooks
- GitHub Pages (statisches Hosting der Frontend-Dateien)

**Live:** https://m4dm0nky.github.io/Personalplan/
**Pocketbase Admin:** https://crewplanner.nyxlightwork.com/_/
**Pocketbase API:** https://crewplanner.nyxlightwork.com

---

## 2. Aktueller Stand (Übergabe 2026-05-09)

### Was ist fertig ✅

- Komplette Migration von Supabase → Pocketbase abgeschlossen
- `js/pb.js` — neuer Pocketbase REST-Client (ersetzt Supabase SDK)
- `js/config.js` — POCKETBASE_URL auf `https://crewplanner.nyxlightwork.com` gesetzt
- `js/authService.js` — Pocketbase JWT-Auth (localStorage: `pb_token`, `pb_user`)
- `js/dataService.js` — alle CRUD-Operationen auf Pocketbase umgestellt
- `login.html` — Login über Pocketbase Auth
- `.pb_hooks/main.pb.js` — E-Mail-Hook für proposed/declined/invite/reminder
- `pocketbase/pb_schema.json` — Collections-Schema (bereits in Pocketbase importiert)
- Pocketbase-Server läuft (`pocketbase:local` Container auf dem Server)
- Collections importiert: `plans`, `plan_members`, `crew_members`, `assignments`, `crew_invites`

### Was noch offen ist ⏳

| # | Aufgabe | Beschreibung |
|---|---|---|
| 1 | **Hook deployen** | `.pb_hooks/main.pb.js` auf den Server bringen + Container mit neuem Volume neu starten |
| 2 | **SMTP konfigurieren** | Pocketbase Admin UI → Settings → Mail settings → eigenen Mailserver eintragen |
| 3 | **GitHub Pages deployen** | `git push origin main` → App geht live |
| 4 | **Admin-User anlegen** | In Pocketbase Admin UI einen User mit `madmaxmail@web.de` erstellen |
| 5 | **Testen** | Login, Proposal-Workflow, E-Mail-Versand prüfen |

---

## 3. Hook deployen (Schritt für Schritt)

Die Hook-Datei enthält die Server-seitige Logik für E-Mail-Benachrichtigungen.
Sie muss in einen gemounteten Ordner auf dem Host-System.

**Im Repo liegt eine fertige ZIP:** `pocketbase-deploy.zip` (im Root)

Alternativ manuell per SSH auf den Server (`root@crewplanner.nyxlightwork.com`):

### Schritt 1 — Verzeichnis anlegen (auf dem Server)
```bash
mkdir -p /mnt/hdd/pocketbase/pb_hooks
```

### Schritt 2 — Hook-Datei übertragen (vom lokalen Rechner)
```bash
scp .pb_hooks/main.pb.js root@crewplanner.nyxlightwork.com:/mnt/hdd/pocketbase/pb_hooks/main.pb.js
```

### Schritt 3 — Alten Container stoppen
```bash
ssh root@crewplanner.nyxlightwork.com "docker stop pocketbase && docker rm pocketbase"
```

### Schritt 4 — Container neu starten mit Hook-Volume
```bash
ssh root@crewplanner.nyxlightwork.com "docker run -d \
  --name pocketbase \
  --restart always \
  --network pocketbase_pocketbase_net \
  -p 127.0.0.1:8090:8090 \
  -v /mnt/hdd/pocketbase/pb_data:/pb/pb_data \
  -v /mnt/hdd/pocketbase/pb_hooks:/pb/pb_hooks \
  pocketbase:local"
```

### Schritt 5 — Prüfen
```bash
ssh root@crewplanner.nyxlightwork.com "docker logs pocketbase --tail 20"
```

---

## 4. SMTP konfigurieren

Pocketbase Admin UI → `https://crewplanner.nyxlightwork.com/_/` → **Settings → Mail settings**

| Feld | Was eintragen |
|---|---|
| SMTP host | Euren Mailserver-Hostname |
| SMTP port | `587` (oder `465` für SSL) |
| Username | E-Mail-Adresse des Absenders |
| Password | Passwort |
| Sender name | `Tour Crew Plan` |
| Sender address | E-Mail-Adresse des Absenders |

→ **Save changes** → **Send test email** um zu prüfen ob es funktioniert.

---

## 5. GitHub Pages deployen

```bash
git push origin main
```

GitHub Pages aktualisiert sich automatisch innerhalb ~1 Minute.

---

## 6. Admin-User anlegen

In der Pocketbase Admin UI (`https://crewplanner.nyxlightwork.com/_/`):

1. **Collections** → `users` → **New record**
2. Email: `madmaxmail@web.de`
3. Password setzen
4. Speichern

> Der User mit dieser E-Mail wird automatisch als Admin erkannt (`ADMIN_EMAIL` in `js/config.js`).

---

## 7. Test-Checkliste nach Deploy

- [ ] `https://m4dm0nky.github.io/Personalplan/login.html` öffnet sich
- [ ] Login mit `madmaxmail@web.de` funktioniert
- [ ] Tabelle wird geladen (localStorage-Daten bleiben erhalten)
- [ ] Als Admin: Crew-Mitglied einer Position zuweisen → Status ⏳ erscheint
- [ ] Crew-Mitglied bekommt E-Mail (nach SMTP-Konfiguration)
- [ ] Crew-Mitglied kann bestätigen/ablehnen
- [ ] Admin sieht Status-Update (✓ / ✗)

---

## 8. Architektur-Übersicht

```
js/
├── config.js        ← POCKETBASE_URL + ADMIN_EMAIL  ← hier Admin-E-Mail ändern
├── pb.js            ← Pocketbase REST-Client (pbGet, pbPost, pbPatch, pbDelete, pbList, pbFirst, pbUpsert)
├── dataService.js   ← Alle Pocketbase-Ops (proposeCrew, cancelProposal, loadCrewMeta, ...)
├── authService.js   ← Login/Logout, JWT aus localStorage, IS_ADMIN setzen
├── state.js         ← Globale Variablen (crew, POSITIONS, TOUR_DATES, assignments, assignmentStatuses)
├── utils.js         ← Helpers: getVal(), isPending(), showToast(), fmtD()
├── render.js        ← renderTable(), renderHead(), renderBody()
├── bundle.js        ← ⚠️ MANUELLE KOPIE von dropdown.js (kein Build-System!)
├── dropdown.js      ← Dropdowns: openCrewDD(), openDefaultDD(), requestForPos(), bulkCancelPos()
├── crewNotify.js    ← Einladungs-Modal, sendInvite()
├── crewLink.js      ← E-Mail ↔ Crew-Name Verknüpfung (Admin)
├── userView.js      ← Crew-Ansicht (nicht-Admin): confirm/decline
└── init.js          ← App-Start: loadLogosGlobal(), initPlans(), render()
```

### Kritische Gotchas

**bundle.js = manuelle Kopie**
Jede Änderung an `dropdown.js` MUSS auch in `bundle.js` gespiegelt werden.
`bundle.js` lädt VOR `dropdown.js` — `dropdown.js` überschreibt zur Laufzeit.

**Zwei State-Schichten**
```
assignments[date][posId]        → lokale Overrides (sofort, kein Pocketbase)
assignmentStatuses[date][posId] → Pocketbase-Cache { status, crewName, proposedBy }
```
`getVal(dateStr, posId)` in `utils.js` gibt den effektiven Zellwert zurück.

**Auth:** JWT liegt in `localStorage.pb_token`. Kein Token → Redirect zu `login.html`.

**Cache-Bust:** Bei JS/CSS-Änderungen `?v=23` in `index.html` + `login.html` hochzählen.

**Ladereihenfolge** in `index.html` ist kritisch (globaler Scope, kein Modulsystem).

### Pocketbase Collections

```
plans           { id, name, owner(→users) }
plan_members    { plan_id(→plans), user_id(→users), role }
crew_members    { plan_id(→plans), name, email, sort_order, user_id(→users) }
assignments     { plan_id, date, pos_id, pos_label, crew_name, status, proposed_by, responded_at }
crew_invites    { plan_id, crew_name, crew_email, type, plan_name, app_url }
```

### Farbpalette

```
Gold:    #e8c84a   (Aktionen, Hinweise)
Grün:    #4ae8a0   (Erfolg, Bestätigt)
Rot:     #e84a4a   (Fehler, Ablehnen, Danger)
Dark BG: #1a1a2e
```

---

## 9. Lokale Entwicklung

```bash
cd /pfad/zum/repo
python3 -m http.server 8080
# Dann http://localhost:8080 im Browser öffnen
```

Kein npm, kein Build-Step. Datei ändern → Browser neu laden → fertig.

---

## 10. Kontakt & Zugangsdaten

| Was | Wert |
|---|---|
| Pocketbase Admin | https://crewplanner.nyxlightwork.com/_/ |
| Pocketbase API | https://crewplanner.nyxlightwork.com |
| Admin-E-Mail | madmaxmail@web.de |
| GitHub Repo | https://github.com/M4dm0nky/Personalplan |
| Live (GitHub Pages) | https://m4dm0nky.github.io/Personalplan/ |
| Server SSH | root@crewplanner.nyxlightwork.com |
| Pocketbase Container | `pocketbase` (Image: `pocketbase:local`) |
| pb_data Pfad | `/mnt/hdd/pocketbase/pb_data` |
| pb_hooks Pfad | `/mnt/hdd/pocketbase/pb_hooks` |

---

## 11. Mögliche nächste Features

#### Hoch

1. **E-Mail bei Stornierung** — Crew bekommt Mail wenn Admin Anfrage zurückzieht (~1-2h)
2. **Verfügbarkeitsabfrage** — Crew markiert Tage als nicht verfügbar, Admin sieht Overlay (~1 Tag)
3. **iCal-Export pro Crew** — bestätigte Tage als .ics (Basis `calendar.js` existiert, ~2-3h)

#### Mittel

4. **Automatische Erinnerungen** — Pocketbase Cron-Job 7 Tage vor Show (~4h)
5. **Mobile-Ansicht** — CSS Media Queries für kleine Screens (~1 Tag)
6. **Statistik CSV-Export** — für Abrechnung (Basis `stats.js` existiert, ~2h)

#### Niedrig

7. **Sub-Admin / Rollen** — mehrere Admins (~2 Tage)
8. **Push Notifications** — ServiceWorker (~1 Tag)
