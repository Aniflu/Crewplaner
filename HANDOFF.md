# HANDOFF — Tour Crew Plan

> Dieses Dokument ist für den Kollegen und seinen Claude-Assistenten.
> Lies es komplett durch, bevor du irgendetwas tust.

---

## 1. Was ist diese App?

**Tour Crew Plan** ist eine Web-App zur Verwaltung von Crew-Besetzungen für Tourneen.

- Ein **Admin** (Tourmanager/Superadmin) legt Tourdaten, Positionen und Crew-Mitglieder an
- Der Admin weist Crew-Mitglieder pro Position und Tag zu — oder stellt **Anfragen** (Proposals)
- **Crew-Mitglieder** loggen sich ein, sehen ihre zugewiesenen Tage und können **bestätigen oder ablehnen**
- Benachrichtigungen laufen per E-Mail (via PocketBase-Hook + Resend HTTP API)

**Tech-Stack:**
- Vanilla JavaScript (kein Framework, kein Build-Step)
- HTML5 + CSS3
- **PocketBase** (Self-hosted, Coolify-managed) — Auth + SQLite-Datenbank + JS-Hooks für E-Mails
- GitHub Pages (statisches Hosting der Frontend-Dateien)

**Live:** https://crewplanner.nyxlightwork.de
**PocketBase Admin:** https://api.crewplanner.nyxlightwork.de/_/
**PocketBase API:** https://api.crewplanner.nyxlightwork.de

---

## 2. Aktueller Stand (Übergabe 2026-05-18) — v0.9.6.2

### Was ist fertig ✅

- Multi-Rollen-System: `superadmin`, `manager`, `booker`, `crew`
- Login/Logout via PocketBase Auth
- `admin.html` — Konsole für superadmin/manager: Benutzer verwalten, Rollen, Pläne, Werkzeuge
- `index.html` — Tour-Planung für manager/booker/crew
- `login.html` — Login + Registrierung + Passwort-Reset-Flow (token-basiert)
- Plan-Sync: localStorage ↔ PocketBase (`plans`, `plan_data`, `crew_members`)
- E-Mail-Flow: Proposal → Crew bekommt Mail → Bestätigen/Ablehnen per Button → Admin bekommt Rückmeldung
- Einladungs-System: Admin schickt Crew-Einladung oder ♥ Liebeseinladung per E-Mail
- Alle Custom-Mails via Resend HTTP API (Hook v3.4)
- System-Mails (Passwort-Reset) via PB SMTP → Resend SMTP-Gateway
- Passwortloses User-Anlegen: Admin gibt E-Mail + Rolle ein → Account angelegt → Reset-Link per Mail
- Auto-Verify: Neuer Hook (v3.4) setzt `verified=true` serverseitig bei User-Create

### Rollen-System

| Rolle | Landing | Rechte |
|---|---|---|
| `superadmin` | `admin.html` | Admin-Konsole + alle Manager-Rechte |
| `manager` | `index.html` | Volle Tour-Verwaltung |
| `booker` | `index.html` | Read-only Touransicht |
| `crew` | `index.html` | Nur eigene Slots sehen/bestätigen |

---

## 3. Infrastruktur

| Was | Wert |
|---|---|
| Frontend Live | https://crewplanner.nyxlightwork.de (nginx) |
| PocketBase API | https://api.crewplanner.nyxlightwork.de |
| PocketBase Admin UI | https://api.crewplanner.nyxlightwork.de/_/ |
| GitHub Repo | https://github.com/Aniflu/Crewplaner (main = Production) |
| Server SSH | `ssh hetzner` (Alias in ~/.ssh/config) |
| PocketBase Container | `pocketbase-ad9adhhkygjreidi79i4v5eb` (Coolify-managed) |
| pb_hooks Pfad | `/var/lib/docker/volumes/ad9adhhkygjreidi79i4v5eb_pocketbase-hooks/_data/` |
| E-Mail-Provider | Resend (HTTP API für Custom-Mails, SMTP-Gateway für System-Mails) |
| Resend Absender | `noreply@crewplanner.nyxlightwork.de` |

**Wichtig:** Container wird von **Coolify** verwaltet — niemals `docker stop/rm/run` ausführen. Nur `docker restart` für Hook-Reload.

---

## 4. Hook deployen

```bash
ssh hetzner "curl -o /var/lib/docker/volumes/ad9adhhkygjreidi79i4v5eb_pocketbase-hooks/_data/main.pb.js \
  https://raw.githubusercontent.com/Aniflu/Crewplaner/main/.pb_hooks/main.pb.js \
  && docker restart pocketbase-ad9adhhkygjreidi79i4v5eb"
```

Danach prüfen: `ssh hetzner "docker logs pocketbase-ad9adhhkygjreidi79i4v5eb --tail 20"`
Erwartete Ausgabe: `[hook] main.pb.js v3.4 geladen`

---

## 5. Frontend deployen

```bash
git push origin main
```

GitHub Pages aktualisiert sich automatisch ~1 Minute nach dem Push.

---

## 6. PocketBase E-Mail-Konfiguration (bereits gesetzt)

**Resend API-Key** in Coolify als Env-Var `RESEND_KEY` hinterlegt.

**PB Admin UI → Settings → Mail (SMTP):**
- Host: `smtp.resend.com` Port: `587`
- Benutzername: `resend`
- Passwort: Resend API-Key
- Absender: `noreply@crewplanner.nyxlightwork.de`

**PB Admin UI → Settings → Application URL:**
`https://aniflu.github.io/Crewplaner/login.html`
(steuert Reset-Link-Ziel in System-E-Mails)

---

## 7. Architektur-Übersicht

```
├── index.html            ← App für manager/booker/crew
├── admin.html            ← Konsole für superadmin/manager
├── login.html            ← Login + Registrierung + Passwort-Reset
├── view.html             ← Öffentliche Read-only-Ansicht (Token-basiert)
├── styles.css
├── .pb_hooks/
│   └── main.pb.js        ← E-Mail-Hooks (Goja, v3.4) — via Resend HTTP API
└── js/
    ├── config.js         ← POCKETBASE_URL, ADMIN_EMAIL
    ├── pb.js             ← PocketBase REST-Client (pbGet/Post/Patch/Delete/List/First/Upsert)
    ├── authService.js    ← Login/Logout, JWT, IS_ADMIN, _handleEmailAction()
    ├── dataService.js    ← CRUD: proposeCrew, cancelProposal, loadCrewMeta, loadAssignmentStatuses
    ├── state.js          ← Globale Vars: POSITIONS, TOUR_DATES, crew, assignments
    ├── rbac.js           ← hasPermission(action) — O(1) Switch
    ├── utils.js          ← getVal(), isPending(), showToast(), fmtD(), esc()
    ├── render.js         ← renderTable(), renderHead(), renderBody()
    ├── dropdown.js       ← Dropdowns, openCrewDD(), requestForPos()
    ├── bundle.js         ← ⚠️ MANUELLE KOPIE aus dropdown.js (kein Build!)
    └── init.js           ← App-Start: loadLogosGlobal(), initPlans(), render()
```

### Kritische Gotchas

**bundle.js = manuelle Kopie** — jede Änderung an `dropdown.js` MUSS auch in `bundle.js` gespiegelt werden.

**PocketBase Goja-Isolation** — alle Werte in Hook-Callbacks als String-Literale hardcoden, keine äußeren Variablen.

**sort=-created → 400** — stattdessen `sort=-id` verwenden (CLAUDE.md dokumentiert).

**verified-Feld** — nicht via Collections-API setzbar, nur serverseitig im Hook.

---

## 8. PocketBase Collections

```
users           { id, email, role(superadmin/manager/booker/crew), verified }
plans           { id, name, owner(→users), plan_data(JSON), view_token }
plan_members    { plan_id(→plans), user_id(→users), role }
crew_members    { plan_id(→plans), name, email, sort_order, user_id(→users) }
assignments     { plan_id, date, pos_id, pos_label, crew_name, crew_email, status, proposed_by, responded_at }
crew_invites    { plan_id, crew_name, crew_email, type, plan_name, app_url }
```

Assignment-Status-Werte: `proposed` → `confirmed` | `declined`

---

## 9. Test-Checkliste nach Deploy

- [ ] https://crewplanner.nyxlightwork.de öffnet sich
- [ ] Login mit `madmaxmail@web.de` funktioniert → landet auf admin.html
- [ ] admin.html → "Neuer Benutzer" → E-Mail eingeben → Erstellen → Toast grün, keine Fehler
- [ ] Docker-Logs zeigen `[hook] User auto-verified: <email>`
- [ ] Reset-E-Mail kommt an → Link → login.html zeigt Passwort-Formular
- [ ] Passwort setzen → einloggen → funktioniert
- [ ] Crew-Proposal: Slot klicken → Crew wählen → E-Mail kommt an → Bestätigen → Zelle grün

---

## 10. Zugangsdaten (Übersicht)

| Was | Wert |
|---|---|
| Admin-Login | `madmaxmail@web.de` |
| GitHub | https://github.com/Aniflu/Crewplaner |
| Resend API-Key | in Coolify als `RESEND_KEY` (nicht im Code!) |
| PocketBase Container | `pocketbase-ad9adhhkygjreidi79i4v5eb` |
