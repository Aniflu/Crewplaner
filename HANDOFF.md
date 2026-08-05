# HANDOFF — Crewplanner

> Dieses Dokument ist für den Kollegen und seinen Claude-Assistenten.
> Lies es komplett durch, bevor du irgendetwas tust.

---

## 1. Was ist diese App?

**Crewplanner** (intern/Repo: „Tour Crew Plan") ist eine Web-App zur Verwaltung von Crew-Besetzungen für Tourneen.

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

## 2. Aktueller Stand (Stand 2026-08-05) — v0.6.1

> ⚠️ **SEIT v0.31.0 — ZWEI GETRENNTE UMGEBUNGEN (zuerst lesen!):**
> - **Branch `main` = TEST** → GitHub Pages `aniflu.github.io/Crewplaner` → **Test-**PocketBase `api-test.crewplanner.nyxlightwork.de` (eigene, leere DB, **kein** Mailversand).
> - **Branch `live` = PRODUKTION** → Coolify-nginx `crewplanner.nyxlightwork.de` → **Live-**PocketBase `api.crewplanner.nyxlightwork.de` (echte Tourdaten).
> - **`git push origin main` = auf TEST veröffentlichen** (NICHT live!). **Go-Live = `main → live` pushen** (Coolify baut den Live-Container automatisch).
> - Das Frontend wählt die API **automatisch nach Hostname** (`pickApiUrl`, js/pure.js) — derselbe Code in beiden Umgebungen.
> - **Hook `main.pb.js` v4.16** läuft auf **BEIDEN** Backends → Hook-Änderungen immer an beide deployen (erst Test, dann Live).
> - Runbooks: `docs/admin-runbook-*.md` (die erledigten tragen oben einen ✅-Vermerk).
> - **Versionsreihe:** Nach v0.31.0 wurde bewusst auf kleine Nummern zurückgesetzt, um schrittweise auf 1.0 zuzugehen. Reihenfolge: v0.31.0 → v0.5.0 → v0.5.1 → v0.5.2 → v0.6.0 → v0.6.1.
> - **Offen (optional):** PocketBase-Versions-Upgrade beider Instanzen (Live noch auf altem Mai-Image) — Backup + Test-first, siehe pb-upgrade-Runbook. Außerdem der CORS-Platzhalter `*` für unbekannte Herkünfte (`docs/admin-runbook-cors.md`).

> 🔒 **Sicherheitsrunde 3.–5. August 2026 — bitte vor Änderungen an Zugriffsregeln lesen.**
> In vier Tagen kamen drei Löcher ans Licht, alle derselben Fehlerklasse: *eine Ansicht liest
> direkt aus einer Collection, und die Zugriffsregel wird so weit geöffnet, bis das geht.*
> 1. `assignments.listRule` war **leer** → 913 Einsätze inkl. **10 Crew-Mailadressen** ohne Login abrufbar.
> 2. `plans.listRule` endete auf `|| view_token != ""` → **alle** Pläne anonym lesbar, **inklusive der Tokens im Klartext**.
> 3. Angemeldete Crew bekam den `view_token` ihrer eigenen Tour im Payload.
>
> **Gegenmittel, jetzt durchgängig umgesetzt:** Was öffentlich oder eingeschränkt sichtbar sein
> soll, läuft über eine **Hook-Route**, die gezielt nur die nötigen Felder herausgibt —
> `/viewplan/{token}`, `/viewstatus/{token}`, `/myplans`, `/myplan/{id}`. Die Collection-Regeln
> bleiben dadurch eng: **keine** Collection ist ohne Anmeldung lesbar.
>
> **Zwei Werkzeuge prüfen das nach jeder Änderung** (Zugangsdaten kommen aus einer lokalen Datei,
> nicht aus dem Repo):
> ```bash
> node tools/check-pb-rules.mjs     # gehärtete Regeln + Gegenprobe von außen; --fix repariert
> node tools/check-viewlink.mjs     # öffentlicher Link Ende-zu-Ende, inkl. Crew-Sicht
> ```
> ⚠️ **Coolify-Redeploy/Schema-Reimport setzt Zugriffsregeln zurück** — nach jedem Redeploy
> `check-pb-rules.mjs` laufen lassen.
> ⚠️ **Reihenfolge beim Verschärfen einer Regel: Hook → Frontend → Regel.** „Frontend" heißt das
> auf der Umgebung **ausgelieferte** JS, nicht das im Repo. Ein Runbook von uns drehte das
> einmal um; der Admin bemerkte es und verhinderte, dass 9 Crew-Konten ausgesperrt wurden.

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
> - ~~**Wichtig (plans-viewRule):** Crew kann einen Plan-Record nur lesen, wenn er einen nicht-leeren `view_token` hat.~~ **Gilt seit v0.6.1 NICHT mehr** — Crew lädt über `/myplans` bzw. `/myplan/{id}`, der Zugriff hängt allein am `crew_members`-Eintrag. Der `view_token` dient nur noch dem öffentlichen Booker-Link.

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

> **v0.26.1–v0.28.0 (14.–19.07.):** Handy-Popup-Fix, Kalender-Abo, öffentlicher-Link-Fix, kompletter Rebrand. Details: CHANGELOG.md / CLAUDE.md.
> - **Handy-Einladungs-Popup (v0.26.1):** landete nach Login außerhalb des Sichtfelds (nur schwarzer Backdrop) — Body-Scroll-Lock + Mobile-Anker-Regeln für alle Modals ergänzt.
> - **Abonnierbarer Kalender pro Person (v0.27.0/v0.27.1):** neue Server-Route `/ics/{token}/{plan}` (Hook **v4.9.2**) liefert einen live aktualisierten ICS-Feed — Ein-Tipp-Abo statt Einmal-Download. **Wichtig:** ein Abo gilt nur für die *aktuell geöffnete* Tour (v0.27.1-Korrektur, vorher mischte der Feed alle Touren einer Person). Feld `users.feed_token` (⚠️ Redeploy löscht es → Backfill-Hook vergibt automatisch neue Tokens beim nächsten User-Zugriff).
> - **Öffentlicher Link zeigte keine Besetzung (v0.27.2):** `view-app.js` schrieb den Render-State nach `window.*` statt über die state.js-Setter → render.js/getVal lasen nie davon. Betraf ALLE öffentlichen Links. Gefixt + Guard-Test ergänzt.
> - **Kompletter Rebrand (v0.28.0):** neues „Crew Pass"-Logo (Hexagon), Navy/Paper-Farbwelt, Geist + JetBrains Mono, **Hell/Dunkel-Umschalter** (☀/☾) auf allen 4 Seiten. Neue zentrale `theme.css` (Light/Dark/OS via `data-theme`) ersetzt die bisherige 4-Welten-CSS-Fragmentierung. Gold nur noch im Logo + „HEUTE"-Strich. **Test-Guards jetzt 102 grün.**

> **v0.28.1–v0.30.2 (19.–25.07.):** Helle-Theme-Nachfix, dritter Zell-Status, Absage-Härtung, vereinheitlichte Änderungs-Mail, „Vorgemerkt" direkt anwählbar. Details: CHANGELOG.md / CLAUDE.md.
> - **Helles Theme überarbeitet (v0.28.1):** wirkte „zu weiß"/bräunlich — neuer ruhiger Grundton **„Sage"** (nur helle Variante geändert, Dunkel unverändert).
> - **Dritter Zell-Status „Vorgemerkt" (v0.29.0):** ✎, violett — grobe Vorplanung für Fernzukunft-Termine **ohne** Mailversand, „→ Jetzt anfragen" wandelt später in eine echte Anfrage um. Nebenbei Farbtoken-Fix bei „angefragt" (nutzte noch altes Gold). Legende jetzt für **alle Rollen** sichtbar (vorher nur Crew).
> - **Icon-Rendering-Nachfix (v0.29.1):** Status-Symbole erschienen kurzzeitig als Roh-HTML-Text (esc()-Kollision) — behoben.
> - **Absage-Benachrichtigung nachgehärtet (v0.29.2/v0.29.3):** „Nicht besetzt"/„Standard"/Umbesetzen lösten bisher **keine** Absage-Notiz aus (fehlender Import + fehlende Aufrufe) — jetzt tun das alle Entfernen-Wege einheitlich. Für schon vor dem Fix gelöschte Zuweisungen: manuelles Nachtragen im Absage-Dialog der Konsole.
> - **Vereinheitlichte „Es gab Änderungen"-Mail + Aktivitäts-Log (v0.30.0):** das rote Absage-Banner ist **ersetzt** — der Sidebar-Button „↻ Updates" bündelt jetzt neue UND entfernte Termine in **einer** Mail pro Person mit zwei Abschnitten. Entfernen setzt Zuweisungen auf `status:'cancelled'` (**Soft-Cancel statt Löschen**), damit ein „ÄNDERUNGEN GESEHEN ✓"-Mail-Button ein Ziel hat; Quittung → `cancel_acked`. Alle Crew-Reaktionen landen in der neuen Collection **`activity_log`** — Konsole zeigt sie im „Aktivität"-Tab + als Login-Popup. **Hook jetzt v4.10** (deployt 2026-07-22, per `[hook] main.pb.js v4.10 geladen` + `/api/health`→200 verifiziert). **Test-Guards jetzt 108 grün.**
> - **„Vorgemerkt" direkt anwählbar + Nachfix (v0.30.1/v0.30.2):** der v0.29.0-Status war im Zellen-Menü kaum erreichbar (nur bei belegter Zelle ohne Status) — jetzt gibt es pro Person einen „✎ Vorgemerkt: Name"-Eintrag für **jede** Zelle. Code-Review-Nachfix (v0.30.2): das Vormerken einer bereits bestätigten Person erzeugte fälschlich einen „Termin entfernt"-Queue-Eintrag → nur noch bei Verdrängung einer *anderen* aktiven Person (`sameCrew`-Check). Nur `js/dropdown.js`, kein Hook/Schema.

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
- Abonnierbarer Kalender-Feed pro Person + Tour (v0.27.0/v0.27.1, `/ics/{token}/{plan}`)
- Hell/Dunkel-Umschalter + neues Markendesign „Crew Pass" auf allen 4 Seiten (v0.28.0), helle Palette „Sage" (v0.28.1)
- Dritter Zell-Status „Vorgemerkt" (✎, kein Mailversand) für Fernzukunft-Vorplanung (v0.29.0)
- Vereinheitlichte „Es gab Änderungen"-Mail (neue + entfernte Termine in einer Mail) mit Soft-Cancel + Aktivitäts-Log/-Tab (v0.30.0)
- Sammel-Statuswechsel „bestätigt ⇄ vorgemerkt" (Person → Tourblock → Tag) + vorgemerkte Termine im Kalender mit Status im Infofeld (v0.5.0)
- Registrierung nur für vorab freigegebene E-Mail-Adressen, Rolle kommt aus `crew_members` (v0.5.1)
- Öffentliche Ansicht und Crew-Ladepfad laufen über Hook-Routen statt über Collections (v0.5.2/v0.6.0/v0.6.1)
- Alle Custom-Mails via Resend HTTP API (Hook **v4.16 deployt** seit 2026-08-05)
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
Erwartete Ausgabe: `[hook] main.pb.js v4.10 geladen` (Repo-Stand = deployt = **v4.10**, seit 2026-07-22)

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
├── theme.css             ← Zentrale Design-Tokens (Hell/Dunkel, Fonts) — seit v0.28.0
├── styles.css
├── favicon.svg
├── assets/fonts/         ← Geist + JetBrains Mono (selbstgehostet, seit v0.28.0)
├── .pb_hooks/
│   └── main.pb.js        ← E-Mail-Hooks (Goja, **v4.10 deployt**) — via Resend HTTP API + Kalender-Feed + Aktivitäts-Log
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
users           { id, email, role(superadmin/manager/booker/crew), verified, feed_token }   // feed_token seit v0.27.0 (Kalender-Abo)
plans           { id, name, owner(→users), plan_data(JSON), view_token, view_shorturl }   // view_token = Geheimnis, verlässt den Server nur über /viewplan; view_shorturl seit v0.6.1 ungenutzt (is.gd entfernt)
plan_members    { plan_id(→plans), user_id(→users), role }
crew_members    { plan_id, name, email, sort_order, user_id, role }   // plan_id="__pool__" = globaler Pool; role = Konto-Rolle beim Erst-Login; ZUGLEICH die Freigabeliste: nur hier eingetragene Adressen dürfen sich registrieren (v0.5.1)
assignments     { plan_id, date, pos_id, pos_label, crew_name, crew_email, status, proposed_by, responded_at }
crew_invites    { plan_id, crew_name, crew_email, type, plan_name, app_url, custom_message }
email_log       { plan_id, crew_name, crew_email, email_type, sent_at, success }
activity_log    { plan_id, crew_name, crew_email, action, date, pos_label, ts }  // Crew-Reaktions-Log (v0.30.0): action=confirmed|declined|cancel_acked; ts client-gesetzt (ISO, Sortierung -id)
```

Assignment-Status-Werte: `proposed` → `confirmed` | `declined` | `pencilled` (v0.29.0, „vorgemerkt", kein Mailversand) | `cancelled` → `cancel_acked` (v0.30.0, Soft-Cancel statt Löschen — beide werden aus allen Zellen-Ladepfaden gefiltert)

> 🔒 **Server-Regeln gehärtet — Stand 2026-08-05.** Keine Collection ist ohne Anmeldung lesbar.
> Wichtigste Regeln: `plans` list/view = `owner || superadmin` (Crew liest über `/myplans`,
> `/myplan/{id}`); `assignments.listRule` = `auth != ""` (war einmal LEER = weltöffentlich);
> `assignments.updateRule` (Crew nur eigene Einsätze); `crew_invites.createRule` (nur
> Owner/superadmin lösen Fremd-Mails aus); `users.createRule` = nur vorab freigegebene Adressen.
> **⚠️ Coolify-Redeploy/Reimport setzt sie zurück → `node tools/check-pb-rules.mjs` laufen lassen,
> `--fix` repariert.** Exakte Regeln: docs/security.md · docs/database-schema.md · CLAUDE.md.

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
