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

## 2. Aktueller Stand (Stand 2026-07-14) — v0.26.0

> **Juni 2026 (v0.10):** Die ES6-Modul-Migration (v0.9.3) hatte bare Cross-Modul-Referenzen
> hinterlassen → stille `ReferenceError`s (5-Tage-„Bounce"). In v0.10.0–v0.10.6 bereinigt.
> **Merke:** `window`-Globals sind seiten-spezifisch — onclick-Handler müssen vom Entry-Script
> der Seite registriert werden (app.js→index.html, admin-app.js→admin.html).

> **v0.11–v0.14 (bis 17.06.):** breite Stabilisierung. Wichtigste Punkte (Details: CHANGELOG.md / CLAUDE.md):
> - **Test-Guards** statt Raten: `node tests/run.mjs` (38 grün). `imports.test.mjs` fängt fehlende
>   ES6-Imports, `reachability.test.mjs` tote Buttons/onclick→undefined, `dialog.test.mjs` das
>   Dialog-System, `plans.test.mjs` Cross-Write. **Bei „X tut nichts/lädt nicht" ZUERST die Tests laufen lassen.**
> - **KRITISCH gefixt — Mehr-Plan Cross-Write (v0.14.6):** ein Plan ohne eigene PB-Zuordnung
>   überschrieb den Record eines ANDEREN Plans (Datenverlust). `_savePlanToLS` schreibt jetzt nur
>   in `tourplan_pb_<id>`. Es gibt jetzt **2 Pläne**: AMK 2026 (`03fs6r1o8cqeyt2`) + Provinz 2027 (`9z9f5o61goo1nvz`).
> - **„Speichern" schrieb gar nicht nach PB** (rief nur JSON-Download) — gefixt; awaitet jetzt mit ehrlichem Toast (v0.14.7/8).
> - **Dialog-System** (confirm/alert/prompt) war seit ES6-Migration tot (IIFE nie aufgerufen) — gefixt (v0.14.4).
> - **Self-Register** setzte weder Rolle noch emailVisibility → „Crew sieht keinen Plan" + „Keine E-Mail"; gefixt (v0.14.10).
> - **PB-Schema-Falle:** `assignments.proposed_by` war nach Wipe als **relation** statt **text** → „Failed to create record"; auf text gefixt.
> - **Reset-Link** (PB-Mail-Template) zeigte auf 404 → auf `{APP_URL}?token={TOKEN}` gefixt (v0.14.11).
> - Hook ist jetzt **v4.6** (nicht mehr v3.4). Crew umbenennen ohne Dublette (v0.14.12). Logout läuft inline (v0.14.13).

> **v0.15–v0.21 (bis 04.07.):** Stabilisierung „Crew sieht keinen Plan" + Crew-Features. Wichtigste Punkte (Details: CHANGELOG.md / CLAUDE.md):
> - **Test-Guards jetzt 66 grün** (`node tests/run.mjs`). Neu u.a. `syntax.test.mjs` (Firefox-brechende Syntax), `serviceworker.test.mjs`, `stats.test.mjs`, `queue.test.mjs`, `adminmodal.test.mjs`.
> - **„Crew sieht keinen Plan" endgültig eingekreist:** case-sensitiver Mail-Filter (v0.15.0) UND eine ungültige Zuweisung `getActivePlanId()=id;`, die nur **Firefox** beim Parsen abwarf → ganzer Modulgraph tot (v0.16.0). **Bei „sieht nichts in EINEM Browser" zuerst echte Konsole + Engine erfragen.**
> - **Dauerhafte Cache-Lösung (v0.19.0):** Service Worker `sw.js` liefert JS/CSS/HTML network-first (`no-cache`) → kein „stale Sub-Modul"/Hard-Reload mehr.
> - **Crew-Features:** bekannte Crew aus früheren Touren übernehmen (v0.18.0), eigene bestätigte Termine als .ics/PDF exportieren (v0.20.1), zwischen mehreren Touren wechseln (v0.21.0).
> - **Scoping (v0.20.0):** Crew kann nur eigene Einsätze bestätigen/absagen; ICS nur bestätigte Termine. Damals nur app-seitig — die **server-seitigen PB-Regeln sind seit v0.26.0 aktiv** (s. v0.24–v0.26-Block).
> - **Wichtig (plans-viewRule):** Crew kann einen Plan-Record nur lesen, wenn er einen nicht-leeren `view_token` hat (sonst 404 → leere Tour). Jede Tour, die Crew sehen soll, braucht einen view_token („Öffentlicher Booker-Link").

> **v0.22–v0.23.5 (08.–09.07.):** Crew-Verwaltung & Registrierung. Wichtigste Punkte (Details: CHANGELOG.md / CLAUDE.md):
> - **Test-Guards jetzt 74 grün** (`node tests/run.mjs`). Neu u.a. `crewpool.test.mjs`, `directory.test.mjs`, `logic.test.mjs` (esc escaped `"`/`'`).
> - **Globaler Crew-Pool (v0.22.0):** neue Mitglieder an EINER Stelle in der Konsole anlegen — Sentinel `plan_id="__pool__"`; **kein** Login-Konto, das entsteht erst beim Erst-Login über den Einladungslink. **Schema:** Feld `crew_members.role`. „♥ Liebeseinladung" entfernt.
> - **Vereintes Crew-Verzeichnis (v0.23.0):** der „Benutzer"-Tab zeigt alle Personen in EINER per E-Mail zusammengeführten Liste, Name·E-Mail·Rolle editierbar (propagiert in Konto/Pool/alle Touren).
> - **PB-Schema-Falle erneut (v0.23.2):** `crew_members.plan_id` (und `assignments.plan_id`) war **relation** statt **text** → der Pool-Sentinel `"__pool__"` schlug die Validierung durch; auf **text** umgebaut. **Merke: `"__pool__"` ⇒ plan_id MUSS text sein.**
> - **`esc()`-Attribut-Bug (v0.23.3):** Namen mit `"` (z.B. `Robert "Woody" Steinmetz`) brachen in `value="…"` ab — `esc()` maskiert jetzt auch `"`/`'`.
> - **Einladung/Registrierung (v0.23.4/5):** Staff-Invite-Link zeigte von der GitHub-Testseite auf 404 (jetzt fest Produktiv-Login); „Konto erstellen" bei bereits vergebener E-Mail zeigt jetzt „Konto mit dieser E-Mail-Adresse schon vorhanden" + schaltet auf Login. **Merke:** vom Admin vorab angelegte Personen haben schon ein `users`-Konto → sie müssen sich anmelden / Passwort zurücksetzen, nicht neu registrieren.

> **v0.24–v0.26 (11.–14.07.):** Mobile, Today-Line, Review-Härtung + Server-Absicherung. Details: CHANGELOG.md / CLAUDE.md.
> - **Handy-Tauglichkeit (v0.24.0):** `styles.css` bekam Media-Queries → am Handy scrollt die Seite, Tabelle horizontal (sticky Datum), Sidebar als Hamburger-Drawer. +mobile.test.mjs.
> - **„Heute"-Markierung (v0.25.0):** heutige Zeile mit Gold-Strich + „HEUTE"-Badge, vergangene Tage blasser, Auto-Scroll + „→ Heute"-Button. Reine `todayMarkers` (pure.js). +today.test.mjs.
> - **Code-Review-Härtung (v0.26.0), 85 grün:** totes `bundle.js` + `userView.test.js` gelöscht; XSS-Härtung in `showDD` (esc header/label); `pbEscapeFilter`-Regex + `showToast`-Null-Guard + Auto-Scroll-Reset bei Plan-Wechsel.
> - **ECHTE Server-Absicherung (v0.26.0, per Impersonation getestet):** `assignments.updateRule` → Crew ändert nur EIGENE Einsätze; `crew_invites.createRule` → nur Owner/superadmin lösen Fremd-Mails aus (availability bleibt). **⚠️ Coolify-Redeploy/Reimport setzt beide zurück → neu setzen** (Details: docs/security.md, CLAUDE.md).
> - **Pool-Rolle komplett:** Feld `crew_members.role` live angelegt (fehlte trotz v0.22.0-Notiz) **+ Hook v4.8 deployt** → Pool-angelegte Person bekommt ihre Rolle automatisch beim Erst-Login (end-to-end getestet).

### Was ist fertig ✅

- Multi-Rollen-System: `superadmin`, `manager`, `booker`, `crew`
- Login/Logout via PocketBase Auth
- `admin.html` — Konsole für superadmin/manager: Benutzer verwalten, Rollen, Pläne, Werkzeuge
- `index.html` — Tour-Planung für manager/booker/crew
- `login.html` — Login + Registrierung + Passwort-Reset-Flow (token-basiert)
- Plan-Sync: localStorage ↔ PocketBase (`plans`, `plan_data`, `crew_members`)
- E-Mail-Flow: Proposal → Crew bekommt Mail → Bestätigen/Ablehnen per Button → Admin bekommt Rückmeldung
- Einladungs-System: Admin schickt Crew-Einladung / Staff-Einladung per E-Mail (♥ Liebeseinladung in v0.22.0 entfernt)
- Globaler Crew-Pool + vereintes Crew-Verzeichnis in der Konsole (v0.22.0/v0.23.0)
- Alle Custom-Mails via Resend HTTP API (Hook **v4.8 deployt** seit 2026-07-14)
- System-Mails (Passwort-Reset) via PB SMTP → Resend SMTP-Gateway
- Passwortloses User-Anlegen: Admin gibt E-Mail + Rolle ein → Account angelegt → Reset-Link per Mail
- Auto-Verify: Hook setzt `verified=true` serverseitig bei User-Create

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
Erwartete Ausgabe: `[hook] main.pb.js v4.8 geladen` (Repo-Stand = deployt = **v4.8**, seit 2026-07-14)

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
│   └── main.pb.js        ← E-Mail-Hooks (Goja, **v4.8 deployt**) — via Resend HTTP API
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
    └── init.js           ← App-Start: loadLogosGlobal(), initPlans(), render()
```

### Kritische Gotchas

**Kein bundle.js mehr** — seit der ES6-Modul-Migration lädt `index.html` nur `js/app.js` als Modul-Entry; das alte `bundle.js` wurde nie mehr geladen und ist in v0.26.0 gelöscht. Nicht wieder anlegen.

**PocketBase Goja-Isolation** — alle Werte in Hook-Callbacks als String-Literale hardcoden, keine äußeren Variablen.

**sort=-created → 400** — stattdessen `sort=-id` verwenden (CLAUDE.md dokumentiert).

**verified-Feld** — nicht via Collections-API setzbar, nur serverseitig im Hook.

---

## 8. PocketBase Collections

```
users           { id, email, role(superadmin/manager/booker/crew), verified }
plans           { id, name, owner(→users), plan_data(JSON), view_token }
plan_members    { plan_id(→plans), user_id(→users), role }
crew_members    { plan_id, name, email, sort_order, user_id, role }   // plan_id="__pool__" = globaler Pool; role = Konto-Rolle beim Erst-Login (v4.8-Hook)
assignments     { plan_id, date, pos_id, pos_label, crew_name, crew_email, status, proposed_by, responded_at }
crew_invites    { plan_id, crew_name, crew_email, type, plan_name, app_url, custom_message }
```

Assignment-Status-Werte: `proposed` → `confirmed` | `declined`

> 🔒 **Server-Regeln gehärtet (v0.26.0):** `assignments.updateRule` (Crew nur eigene Einsätze) +
> `crew_invites.createRule` (nur Owner/superadmin lösen Fremd-Mails aus). **⚠️ Coolify-Redeploy/Reimport
> setzt sie auf `auth != ""` zurück → neu setzen** (exakte Regeln: docs/security.md · docs/database-schema.md · CLAUDE.md).

> ⚠️ **Schema-Falle (nach Coolify-Wipe/Reimport):** `assignments.proposed_by` MUSS Feldtyp **text**
> sein (die App schreibt `'bulk'`/`'update'`/`'manual'`). Wird es als **relation** angelegt → jeder
> Slot-Create wirft „Failed to create record" → Einladen/Update/Bestätigen kaputt. Fix: Feld löschen +
> als Text neu anlegen (PB erlaubt keine Typ-Änderung am selben Feld). `crew_invites.custom_message`
> (text, optional) muss existieren (Hook v4.6 Freitext-Block).

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
