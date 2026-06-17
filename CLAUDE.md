# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## ⚠️ PFLICHTREGELN — VOR JEDEM TASK LESEN

1. **Nach JEDEM Fix/Feature: Version erhöhen** — User nach gewünschter Nummer fragen, Stufe vorschlagen. In 5 Dateien: `index.html`, `admin.html`, `login.html` (im bestehenden `<div class="login-version">` — KEIN neues Element anlegen!), `CLAUDE.md`, `README.md`
2. **Kein SSH für Marco** — Marco hat keinen Server-Zugang. Server-Aktionen laufen über den Admin (hat SSH via `ssh hetzner`).
3. **Versionsnummer = User-Entscheidung** — nie selbst festlegen ohne Rückfrage.
4. **Nach Coolify-Redeploy → IMMER strip-api prüfen** — Coolify überschreibt Traefik-Labels bei jedem Redeploy. Fix ist permanent in `/data/coolify/proxy/dynamic/pocketbase-fix.yaml` (Priorität 1000), aber wenn API 404 gibt → das ist die Ursache.

---

## Version & Live-URLs

- Aktuelle Version: **v0.14.13**
- Test (GitHub Pages): https://aniflu.github.io/Crewplaner/
- Frontend (Produktiv): https://crewplanner.nyxlightwork.de
- Pocketbase API: https://api.crewplanner.nyxlightwork.de
- Pocketbase Admin UI: https://api.crewplanner.nyxlightwork.de/_/
- GitHub Repo: https://github.com/Aniflu/Crewplaner

---

## Versionierung

```
v0.14.13 — fix: Logout im Crew-View tat nichts. `onclick="logout()"` hing an `window.logout`, das aber nur gesetzt wird, wenn der app.js-Init durchläuft — bei Crew mit stale gecachtem Sub-Modul bricht der Graph → window.logout undefined → Klick = nichts. Beide Abmelden-Buttons (Sidebar + userBadge) jetzt SELBSTSTÄNDIG inline: `localStorage.removeItem('pb_token'/'pb_user'); location.href='login.html'` (relativer Pfad, geht auf GitHub Pages + Produktiv). Funktioniert auch wenn der App-Init hängt. `window.logout`-Registrierung + Import entfernt (war dadurch orphan → Reachability-Guard fing das). admin.html nutzt eigenes adminLogout().
v0.14.12 — feat+fix: Crew umbenennen ohne Dublette. Es gab keine Rename-Funktion → Umbenennen via entfernen+neu anlegen, und removeCrew löschte den PB-crew_members-Record NICHT → alte Namens-Leiche blieb + saveCrewLink upsertet per Name → neuer Name = neuer Record = Dublette (z.B. Thomas Heine/Haine, Marco Hoch 4×). Neu: renameCrew (crew.js, ✏-Button je Mitglied) ersetzt den Namen lokal (crew/defaultCrew/assignments/crewMeta) UND in PB (renameCrewMember patcht crew_members + assignments-Collection, keine Dublette). removeCrew löscht jetzt den PB-Record mit (deleteCrewMember). PB-Bereinigung: 3 Dubletten gelöscht (Thomas Heine + 2 Marco), „Marco Hoch" bleibt 2× (madmaxmail=Admin + marco@hoch-online.com=GL-Crew, vom User so gewollt).
v0.14.11 — fix: (1) Passwort-Reset-Link „file not found" — PB resetPasswordTemplate war Default (`{APP_URL}/_/#/auth/confirm-password-reset/{TOKEN}` → mit APP_URL=…/login.html ergab das …/login.html/_/… = 404). Auf `{APP_URL}?token={TOKEN}` geändert (passt zu login.html `?token=`-Handler). (2) Logout: zusätzlichen, immer sichtbaren „Abmelden"-Button oben in die Aktionen-Sidebar gesetzt (bestehender userBadge-Logout unten bleibt). HINWEIS Wolf „kein Plan + kein Logout": DB-Lookup (crew_members email=livlights@gmx.de → plan_id) funktioniert; wahrscheinlich stale gecachtes Sub-Modul (laden ohne ?v=) → app.js-Modulgraph bricht → kein Init. Lösung: voller Hard-Reload/Cache-Clear.
v0.14.10 — fix(Self-Register): Selbst-Registrierung (login.html) setzte weder `role` noch `emailVisibility` → registrierte Crew hatte LEERE Rolle (IS_CREW=false → loadPlanForCrew lief nie → KEIN Plan, z.B. Wolf/LivLights@gmx.de) UND unsichtbare E-Mail („Keine E-Mail" in Admin-Liste). Fix: Payload um `role:'crew', emailVisibility:true` ergänzt. admin.html renderUsers: rollenlose User zeigen jetzt „— keine Rolle —" statt sich als „Crew" zu tarnen (Default-Option verschleierte das; erneutes Wählen von „Crew" feuerte kein onchange → wurde nie gespeichert). PB-Einmalfix: 4 self-registrierte User (Wolf/Philine/Kerrin/Pascal) auf role=crew + emailVisibility=true gepatcht.
v0.14.9 — fix(Bestätigen): geplante Crew OHNE Bestätigungs-Record war nicht bestätigbar (z.B. nachträglich eingetragene Tage) — das Zellen-Menü zeigte „Bestätigen" nur bei status==='proposed', und confirmAssignment patchte nur vorhandene Records. Jetzt: (1) openCrewDD bietet „Bestätigen" für JEDE geplante, noch nicht bestätigte Person (Override ODER Standard-Crew); „Alle Termine von X bestätigen" geht über alle geplanten, nicht-confirmten Slots (TOUR_DATES×POSITIONS). (2) confirmAssignment legt einen confirmed-Record an (pbPost, proposed_by:'manual'), wenn keiner existiert. +Test. dropdown.js-Mirror in bundle.js nicht nötig (wird zur Laufzeit überschrieben).
v0.14.8 — fix(Sync-Feedback): savePlan meldete optimistisch „gespeichert", obwohl der PB-Patch fire-and-forget war → bei stillem PB-Fehler (z.B. abgelaufener Token) blieb PB unverändert ohne Hinweis. Jetzt: _savePlanToLS gibt die PB-Promise zurück; savePlan awaitet sie und zeigt EHRLICH „Gespeichert ✓ (lokal + PocketBase)" ODER „PocketBase-Sync FEHLGESCHLAGEN: <Grund> (evtl. neu einloggen)". Diagnose-Tool für den realen Sync-Fehler.
v0.14.7 — fix(Sync): „Speichern"-Button rief nur saveJSON() (JSON-Datei-Download) und schrieb NICHTS nach PocketBase → PB lief aus dem Takt (Manager dachte, der Plan wird gespeichert, war aber nur lokal/Datei). Neuer savePlan() (persistence.js) macht echtes _savePlanToLS(activePlanId) = localStorage + PB-Patch in den eigenen Record. Sidebar: „▶ Speichern"→savePlan(), JSON-Download auf eigenen „⤓ Export JSON"-Button verschoben. (Tagesberechnung war übrigens KORREKT — dw nutzt Label-Gewicht, Nachbereitung=1.0; ein Stale-PB-Snapshot hatte nur frühere Eindrücke verfälscht.)
v0.14.6 — fix(KRITISCH/Datenverlust): Mehr-Plan Cross-Write. _savePlanToLS nutzte `tourplan_pb_<id> || tourplan_active_pb_id` — ohne plan-eigene Zuordnung wurde der GLOBALE active_pb_id-Record gepatcht → „Provinz 2027" überschrieb den „AMK 2026"-Record (Datenverlust). Behoben: (B1) _savePlanToLS schreibt NUR in tourplan_pb_<id>; fehlt der → neuen Record anlegen (pbPost), nie fremden patchen. (B2) loadPlanForManager lädt gezielt tourplan_active_pb_id statt „erster by owner" (Reload überschrieb sonst den angezeigten Plan). (B3) confirmNewPlan zeigt PB-Fehler sichtbar. (B4) switchPlan setzt/löscht tourplan_active_pb_id konsistent. (B5) tests/plans.test.mjs Cross-Write-Guard. RETTUNG: AMK-Record (03fs6r1o8cqeyt2, 59 Tage/8 Crew/356 assignments) wiederhergestellt, „Provinz 2027" in eigenen Record 9z9f5o61goo1nvz ausgelagert. 37 Tests grün.
v0.14.5 — fix+feat: Update-Queue (1) Plan-Scope — Key war 'crewplan_updates_'+activePlanId, aber loadPlanForManager setzt kein activePlanId → leerer Suffix, ALLE Pläne kippten in einen Topf (300+). Jetzt Key = tourplan_active_pb_id (stabil pro Plan) + Einmal-Migration: nur Slots des aktuellen Plans (Datum in TOUR_DATES) übernommen, Rest verworfen, Alt-Topf gelöscht. Anzeige/Count/Send zusätzlich auf aktuelle TOUR_DATES gefiltert. (2) Bulk-Auswahl — Modal jetzt nach Tourblock → Person gruppiert, je Block + je Person „alle/keine", plus globales ALLE/KEINE. _deleteSlotFromQueue liest jetzt dataset (behebt nebenbei kaputtes Quote-Escaping bei Namen). +_queueSelectAll/_queueGrpSel.
v0.14.4 — fix+test: Dialog-System tot seit ES6-Migration (7b95d0f) → ALLE confirm/alert/prompt brachen still. Ursache: in dialog.js wurde das Top-Level-IIFE in `export function initDialogSystem(){ (function(){…}); }` verpackt, aber die invokierenden `()` fehlten → window.showConfirm/showAlert/showPrompt blieben undefined → TypeError beim Aufruf, Aktion brach ab (Symptom: „Zeile löschen" beim Datum-Klick tat nichts; betraf auch deletePlan/removeCrew/Zurückziehen). Fix: `})();`. NEU: tests/dialog.test.mjs (Node-Stubs) prüft, dass window.show* nach Import Funktionen sind. 35 Tests grün.
v0.14.3 — fix+test: „Datum hinzufügen" tot — openAddDate nutzte TYPE_OPTS, dates.js importierte es aber nicht (nur typeFromLabel) → ReferenceError beim Klick, Modal öffnete nie. TYPE_OPTS-Import ergänzt. NEU: Import-Guard (tests/imports.test.mjs) fängt diese ES6-„Bounce"-Klasse statisch — meldet, wenn ein Modul einen Export einer anderen Datei nutzt, ohne ihn zu importieren (und es kein window-Global/Builtin ist). Robust gegen Kommentare/Strings/Template-Literale, aliasierte+mehrzeilige Imports, Parameter; bundle.js (globaler Spiegel) + *.test.js ausgeschlossen. 32 Tests grün.
v0.14.2 — chore+test: Reachability-Audit (tests/reachability.test.mjs) — fängt die Fehlerklasse „Funktion existiert, aber kein Button löst sie aus" (Richtung JS→HTML), die reine Modulgraph-Scanner nicht sehen (so verschwanden in v0.9.9.3 die Tage/Blöcke-Buttons). Harter Test in node tests/run.mjs, beide Richtungen: (A) on*-Handler→undefinierte Funktion (Klick-Crash), (B) window-registriert→kein UI-Trigger (Orphan). Robust gegen alle on*-Attribute, zusammengesetzte Handler, JS-Template-Literale, Inline-Scripts. Dabei einen echten Orphan entfernt: bulkDeclineAllMySlots (Crew „alle absagen" ohne Button) — redundant zum verdrahteten sendCancellations-Flow. 30 Tests grün.
v0.14.1 — fix: zwei Regressionen. (1) Tage/Blöcke-Buttons („Datum hinzufügen", „Tourblock einfügen", „Bereich → Block") waren seit v0.9.9.3 (Sidebar-Cleanup) aus index.html gelöscht — wieder eingesetzt + openAddDate/openBlockRange in app.js window-registriert (Funktionen/Modals existierten noch). (2) Neue Pläne aus index.html erschienen nicht in admin.html: confirmNewPlan legte nur localStorage an, keinen PB-plans-Record. Jetzt direkt pbPost {name, owner} + Mapping cachen + stale tourplan_active_pb_id lösen (behebt auch versehentliches Überschreiben des alten Plans).
v0.14.0 — feat: (1) Händisches Bestätigen — Zellen-Dropdown (openCrewDD) bietet bei angefragten Slots „✓ Nur diesen Tag bestätigen" + „✓ Alle angefragten Termine von {Name} bestätigen" (Status→confirmed via confirmAssignment, kein Mailversand). (2) E-Mail-Vorschau mit Freitext — admin.html: vor Einladung/Erinnerung/Update/Absage poppt eine Vorschau auf, Admin kann persönliche Nachricht ergänzen; geht via neuem Feld crew_invites.custom_message + Hook v4.6 (Notiz-Block) raus. Neuer Absage-Flow (Slot-Auswahl) in der Konsole. SCHEMA (crew_invites.custom_message) + HOOK v4.6 sind deployt — voll funktionsfähig.
v0.13.0 — fix: Backend-Review-Fixes (Crew-Bestätigungspfad). (1) confirm/declineAssignment werfen Fehler jetzt weiter statt sie zu verschlucken → Crew-Bestätigung meldet echte Fehler + Resync statt stillem „grün" bei Netzwerkausfall; alle Bulk-Aufrufer mit try/catch. (2) Lokaler Status wird nur bei echtem PB-Record gesetzt (kein falsches „grün" für defaultCrew-Slots). (3) bulkProposeCrew setzt proposed_by:'bulk' → Hook v4.5 unterdrückt doppelte per-Slot-Anfrage-Mails bei Einladen/Update. (4) Hook v4.5: Datum aus ISO-String (TZ-sicher serverseitig). +4 fetch-gemockte Tests. HOOK-DEPLOY (v4.5) via Admin/SSH ausstehend.
v0.12.2 — fix+test: Zeitzonen-Bug in Datumsbereich-Anlage behoben (dates.js nutzte cur.toISOString() = UTC → bei UTC+x landete der Bereich einen Tag zu früh) + headless Node-Test-Infrastruktur (tests/run.mjs, kein npm). Neues dependency-freies Leaf-Modul js/pure.js (toISODate/eachDateInRange/normCrewName/sameCrew). 17 Tests grün unter TZ=UTC und Europe/Berlin.
v0.12.1 — refactor: Code-Review-Cleanups — (1) sameCrew()/normCrewName() in utils.js: Crew-Namen trim/case-tolerant vergleichen (render hasOpen, dropdown bulkCancelPos, dataService bulkCancelProposals filtert jetzt in JS statt case-sensitivem PB-Filter); (2) hasTableView() statt magischer DOM-ID-Prüfung in plans.js; (3) if(!def)return Guard in bulkCancelPos. render↔userView-Zyklus bewusst belassen (ES6-spec-sicher, nur Aufrufzeit-Zugriffe).
v0.12.0 — feat: Standard-Crew-Buttons („Zurückziehen") personenbezogen statt spaltenbezogen — hasOpen + bulkCancelPos prüfen jetzt nur Slots der Standard-Person (crew_name===def). Behebt: roter Button erschien fälschlich, wenn jemand ANDERES in der Spalte unbestätigt war, obwohl die Standard-Person voll bestätigt ist. bulkCancelProposals(posId, crewName) optional personenbezogen.
v0.11.0 — fix: ES6-MODUL-VOLLSANIERUNG — 24 fehlende Imports/typeof-Guards behoben (via Node-Analyzer gefunden). Behebt: Crew-Namen nicht klickbar (getMyCrewName fehlte in render.js → myName immer null), Block-/Crew-Tabs tot (renderBlockView/renderCrewView nicht importiert), Update-Queue (dropdown/dates/tourblock/render → _queueCrewUpdate/_queueGlobalCrewUpdate), Verfügbarkeit melden (userView _getNewSlotsForCrew/bulkProposeCrew/sendAvailabilityNotice), pending-Action-Handler (init.js openTourBlock u.a.), Plan-Laden (plans.js renderTable/renderCrew, admin-sicher per DOM-Guard), checkAndOpenMySchedule. + Cache-Bust app.js?v=2 / admin-app.js?v=2 (Sub-Module wurden ohne Versionsquery gecached → frühere Fixes kamen verzögert an).
v0.10.9 — fix: zirkulärer Import render↔userView brach alle Klicks — pendingCancellations in state.js verschoben (neutrales Shared-State-Modul)
v0.10.8 — fix: pendingCancellations war module-privat in userView.js → render.js konnte Absagen-Markierung nie anzeigen. Export + Import ergänzt, Crew kann jetzt bestätigte Termine absagen.
v0.10.7 — fix: getNavUrl Bug — /Crewplaner/ (ohne Dateiname) wurde als Produktivserver erkannt → Admin-Konsole + Login-Redirect landeten auf 404. Prüft jetzt parts[0].includes('.') statt length > 1. getNavUrl in login.html ergänzt.
v0.10.6 — chore: Debug-Panel (Auth Bootstrap Logs) aus login.html entfernt + Versions-Marker auf login.html ergänzt
v0.10.5 — fix: ES6-Audit — 35 onclick-Handler auf index.html waren seit Modul-Migration nicht mehr window-registriert (openCrewDD, openDateDD, deletePlan, switchPlan, removeCrew, meinesMelden, toggleCancellation u.v.m.) → crashten beim Klick. Jetzt in app.js zentral registriert. War durch den Bounce verdeckt. + _dismissCrewUpdates Handler ergänzt.
v0.10.4 — chore: Diagnose-Instrumentierung entfernt + Plan-Leichen-Leak gefixt (stabile Transfer-ID + _pruneOrphanPlans Auto-Cleanup). 65 verwaiste localStorage-Keys werden beim nächsten Laden automatisch entfernt.
v0.10.3 — fix: ALLE restlichen fehlenden ES6-Imports (render updateStats/autoSave, persistence savePlansIndex/genPlanId/_today, plans+dropdown hasPermission, dropdown openBlockAssign, userView sendUpdateNotice/pbFirst, crewLink saveCrewLink). Behebt updateStats-Bounce + verhindert Feature-Crashes. Ursache: window-Globals sind seiten-spezifisch.
v0.10.2 — fix: Bounce behoben (render.js colorToDarkBg) + 4 weitere fehlende ES6-Imports (dropdown CREW_COLORS, pdf OFFEN/DE_DAYS/DE_MON/fmt, crewNotify esc). Vollscan aller Module via Node-Analyzer.
v0.10.1 — debug: Persistente Cross-Page Auth-Logs (auth-bootstrap ?v=11) zur Bounce-Diagnose
v0.10.0 — fix: ROOT-CAUSE — Fehlende ES6-Imports (crew/CREW_COLORS in render.js, activePlanId in dataService.js). Behebt admin↔login↔admin-Bounce + Plan-Ladung. Pfade waren nie die Ursache.
v0.9.33 — fix: GitHub Pages — Dynamischer <base> Tag für relative Pfade
v0.9.32 — fix: GitHub Pages — Absolute Pfade zurück auf relative Pfade
v0.9.31 — fix: Plan-Transfer Timing — startApp() nach Plan-Schreiben aufrufen
v0.9.30 — fix: KRITISCH — Alle window.location.href Redirects zu absoluten Pfaden
v0.9.29 — fix: startApp() Timing + Undo broken ES6 Module fixes
v0.9.28 — fix: ES6 Modul Timing-Bug + Undo broken fixes
v0.9.27 — fix: Plan-Transfer Fallback — URL Parameter wenn localStorage blockiert
v0.9.26 — feat: Debug Dashboard — Live-Logging aller console/redirects/storage
v0.9.25 — fix: ENDGÜLTIG — Redirect zu admin.html entfernt. Admin bleibt auf index.html
v0.9.24 — fix: Plan-Transfer Bug — CDN-Cache + Redirect wiederherstellen + skipRefresh
v0.9.23 — fix: Plan-Transfer — 3 Tage Arbeit wiederhergestellt + authService.js localStorage Keys
v0.9.11 — fix: admin-app.js importiert generateICS als adminGenerateICS aus calendar.js (aktuell)
v0.9.10 — fix: Entferne falsche Module-Imports aus render.js und types.js
v0.9.9 — fix: Module-Timing-Bug in admin.html — Warte auf beide authReady + DOMContentLoaded
v0.9.8 — fix: Zentrales Auth-Wall Muster — Einheitliche Authentifizierung auf allen Seiten
v0.9.7 — fix: DE_DAYS/DE_MON Export + Module-Load-Error gefixt
v0.9.3 — fix: ES6-Module-Migration + Auth-Check + 22 fehlende Imports gefixt
v0.9.2 — feat: Email-Log Tab — Filter, Suche & erweiterte Anzeige
v0.9.11.5 — fix: Code Review Fixes — Queue-Stabilität & Checkbox-State Persistence
v0.9.11.4 — fix: Leere Queue-Einträge nicht rendern
v0.9.11.3 — fix: Modal-Scroll trap — Trackpad-Scrolling sperrt Hintergrund
v0.9.11.2 — fix: Scrollbar sichtbar machen mit Custom-Styling (gold auf dunkel)
v0.9.11.1 — fix: Scrollbar im Update-Queue Modal für lange Listen
v0.9.11.0 — feat: Checkboxen im Update-Queue Modal, gezielter Versand mit An-/Abwählen
v0.9.10.0 — feat: Update-Queue Modal mit Sidebar-Badge statt Banner, einzelne Slots löschbar
v0.9.9.31 — fix: declined/proposed Slot korrekt ersetzt beim Crew-Wechsel im Dropdown
v0.9.9.30 — Umfassender Code-Review: XSS-Fixes, IDOR-Schutz, Null-Checks, try/catch, Dead Code entfernt, UX-Fixes
v0.9.9.29 — Code-Review: _findAssignment-Bug, ISO-Datum mailSlot, update-email zeigt nur neue Termine
v0.9.9.25 — PB-Records für neue Termine bei Update-Mail-Versand erstellt
v0.9.9.24 — Update-Mail-Queue erstellt proposed-Records vor Mailversand
v0.9.9.23 — Update-Queue zählt proposed-Crew (nicht nur confirmed), auto-migration
v0.9.9.22 — Update-Mail zeigt nur neue Termine statt alle Slots
v0.9.9.21 — Nachbereitung als Tagestyp (prep, orange, 1 TS)
v0.9.9.20 — tourplan_active_pb_id stabiler PB-Sync-Key, Datum-Hinzufügen fix
v0.9.9.19 — Kurzlink (is.gd) via Hook v4.4, Crew-Anleitung, emailVisibility, defaultCrew-Slots
v0.9.9.18 — Plan-Transfer via sessionStorage (admin→index), loadPlanForManager direkt per owner
v0.9.9.17 — Manager lädt Plan aus PocketBase, "Aktuellen Plan bearbeiten"-Button
v0.9.9.13 — Hook v4.3 (Absage-Email umformuliert), vollständiger Workflow-Audit
v0.9.9.12 — Namen mit Statusfarben in Crew-Ansicht + grau für plan-only Einträge
v0.9.9.11 — Hook v4.2 (per-Slot-Emails entfernt), Einladen=Anfrage, Update-Button
v0.9.9.10 — getMyCrewName() case-insensitiv, PB-Plan direkt für Crew, PB-Bereinigung
v0.9.9.9  — Crew-Ansicht: angefragt/bestätigt/abgelehnt, Sidebar-Buttons, Legende
v0.9.9.8  — E-Mail-Log Tab in Admin-Konsole (Hook v4.1 + email_log Collection)
v0.9.7    — Passwortloses Anlegen: kein Passwortfeld, Auto-Reset-Mail, 🔑-Button
v0.9.7    — Partner-Einladungsmail (♥) + Demo-Plan für neue Manager
v0.9.7    — Einladungssystem + Öffentlicher Booker-View-Link
v0.9.0    — Multi-Rollen-System (RBAC): superadmin, manager, booker, crew
v1.0      — Stable Release
```

**Regel:** Nach JEDEM Fix die Version synchron erhöhen in:
1. `index.html` — `<span class="tour-tag">Personalplan · vX.X.X</span>` (sichtbar in der App — daran testet der User!)
2. `admin.html` — `<span style="...">vX.X.X</span>` im Header neben "Konsole"
3. `CLAUDE.md` — "Aktuelle Version"
4. `README.md` — Version-Zeile

Nie selbst entscheiden — User nach gewünschter Versionsnummer fragen, Stufe vorschlagen.

---

## Aktueller Stand (Stand: 2026-06-02)

### Was funktioniert ✓
- Login/Logout via PocketBase
- Multi-Rollen-System: superadmin/manager → admin.html, crew/booker → index.html
- Manager-Konsole (`admin.html`): Werkzeuge, E-Mail-Log Tab, Benutzer, Rollen, Pläne
- **Manager + Crew laden Plan direkt aus PocketBase** — localStorage optional
- Plan-Transfer admin→index via sessionStorage ("Aktuellen Plan bearbeiten"-Button)
- E-Mail-Log: Hook v4.4 schreibt nach jedem Mailversand in `email_log` Collection
- E-Mail-Flow: Einladung (1 Mail/Person), Erinnerung, Update (neue Termine), Absage
- Einladen = setzt alle Slots auf `proposed` + sendet 1 Invite-Mail (kein per-Slot-Hook mehr)
- Update-Button erscheint wenn neue Slots ohne PB-Record vorhanden (inkl. defaultCrew-Slots)
- Crew-Ansicht: eigene Slots "Bitte bestätigen", fremde Slots mit Name + Statusfarbe
- Crew Sidebar: "Termine bestätigen" (bulkConfirmAllMySlots), "Änderungen mitteilen" (sendCancellations — markierte Slots absagen), "Anleitung" + Farbelegende. Einzel-Absage via Zellen-Modal (declineMySlot). KEIN "alle absagen"-Button (bulkDeclineAllMySlots in v0.14.2 als redundanter Orphan entfernt).
- Hotel/Nachbereitung-Tage (OFF-Typ) zeigen ⏳ wie SHOW/REISE wenn proposed
- Öffentlicher Booker-Link mit Kurzlink (is.gd) — serverseitig via Hook generiert + in PB gespeichert
- Crew-Anleitung aktualisiert (docs/guide-crew.html) — neuer Flow "Bitte bestätigen"
- Benutzer-Verwaltung zeigt E-Mail-Adressen (emailVisibility: true für alle gesetzt)
- Absage-Queue Banner für Sammel-Absagen
- Update-Mail-Flow: nur neue Termine in Mail, proposed+confirmed in Queue, PB-Records werden beim Senden erstellt
- Nachbereitung als Tagestyp (prep, orange, 1 TS) in TYPE_OPTS
- tourplan_active_pb_id als stabiler Fallback-Key für PB-Sync (Datum-Hinzufügen zuverlässig)
- Code-Review: _findAssignment-Bug gefixt (→ pbFirst), ISO-Datum in mailSlots

### Bekannte Einschränkung
- Slots die NUR über `defaultCrew` (nicht explizit in `assignments`) befüllt sind,
  bekommen KEINEN PB-Record beim Einladen-Klick — Workaround: Records manuell via API erstellen
  oder Admin trägt Crew explizit via Dropdown ein

### PocketBase — Benutzer (Stand 2026-06-01)
| E-Mail | Rolle | Hat Account |
|---|---|---|
| madmaxmail@web.de | superadmin | ✓ |
| marco@hoch-online.com | manager | ✓ |
| thomas.haine@gmx.de | crew | ✓ |
| thomasoliver@gmx.de | crew | ✓ |
| peter-weist@gmx.de | crew | ✓ |
| w.greffenius@gmx.de | crew | ✓ |
| fliegendekiwi@live.de | crew | — noch nicht registriert |
| pascalsmirat@web.de | crew | — noch nicht registriert |
| kerrin.gall@outlook.de | crew | — noch nicht registriert |

### Update-Mail-Flow (v0.9.9.22+)
- Banner "UPDATE-MAILS SENDEN →" erscheint wenn Datum hinzugefügt wird
- Queue enthält confirmed + proposed Crew-Mitglieder
- Beim Senden: neue PB-Records (proposed) werden erstellt, dann Mail nur mit NEUEN Terminen
- Informational-Pfad: `_getNewSlotsForCrew` liefert Slots ohne PB-Record → `bulkProposeCrew` → Mail
- Nicht-Informational-Pfad (Slot-Änderung): `pbFirst` sucht Record → auf proposed setzen → Mail

### E-Mail-Typen (Hook v4.4)
| Typ | Wann | Empfänger |
|---|---|---|
| `invite` | Admin klickt "Einladen" | Crew — "Du bist dabei." |
| `reminder` | Admin klickt "Erinnerung" | Crew — "Noch ausstehend." |
| `update` | Admin klickt "↻ Update" | Crew — "Achtung. Neue Termine." |
| `cancellation` | Admin klickt "Absagen senden" | Crew — "Plan geändert. Einsätze entfernt." |
| UPDATE-Hook | Crew lehnt Slot ab | Admin — "Abgelehnt." |

### PocketBase — aktuell aktive Pläne
- **Einziger Plan:** `03fs6r1o8cqeyt2` → "AMK Tour 2026_V3" (12 crew_members, 300+ assignments)
- Alle anderen Pläne wurden bereinigt (2026-05-29)

### Rollen-System
| Rolle | Landing | Rechte |
|---|---|---|
| `superadmin` | `admin.html` | Admin-Konsole + alle Manager-Rechte |
| `manager` | `index.html` | Volle Tour-Verwaltung |
| `booker` | `index.html` | Read-only Touransicht |
| `crew` | `index.html` | Eigene Slots bestätigen, andere Slots sehen |

---

## Zugänge & API-Keys

| Was | Wert |
|---|---|
| Admin-Login (App + PB Admin UI) | `madmaxmail@web.de` |
| Resend API-Key | **nicht im Repo** — in Coolify als Env-Var `RESEND_KEY` (Hook: `$os.getenv('RESEND_KEY')`) |
| Resend Absender | `noreply@crewplanner.nyxlightwork.de` |
| Resend verifizierte Domain | `crewplanner.nyxlightwork.de` |
| GitHub | https://github.com/Aniflu/Crewplaner (main = Production) |
| Server SSH Alias | `ssh hetzner` |
| PocketBase Container | `pocketbase-ad9adhhkygjreidi79i4v5eb` (Coolify-managed) |
| pb_hooks Pfad | `/var/lib/docker/volumes/ad9adhhkygjreidi79i4v5eb_pocketbase-hooks/_data/` |

---

## PocketBase Version & JSVM-Regeln (KRITISCH)

**PocketBase Version: v0.38** (läuft auf v0.23+ Architektur mit inkrementellen Updates)

### Was geht / was nicht

| API | Status | Ersatz |
|---|---|---|
| `$app.dao()` | **NICHT verfügbar** → wirft Go-Panic | `$app.save()` / `$app.delete()` |
| `$app.save(record)` | ✓ verfügbar | — |
| `$app.delete(record)` | ✓ verfügbar | — |
| `$app.auxDelete(record)` | ✓ verfügbar (außerhalb Transaction) | — |
| `$tokens.*` | **NICHT verfügbar** | — |
| `$http.send()` | ✓ verfügbar | kein auto Content-Type mehr! |
| `$getEnv('KEY')` | **NICHT verfügbar** → `ReferenceError` | `$os.getenv('KEY')` |
| `$os.getenv('KEY')` | ✓ verfügbar | — |

### Hook-Regel: e.next() PFLICHT

**`e.next()` muss die ERSTE Zeile in JEDEM Hook-Callback sein.**
Ohne `e.next()` stoppt PocketBase v0.23+ die Execution-Chain → 400 "Failed to create record."

```js
onRecordAfterCreateSuccess(function(e) {
  e.next();          // ← IMMER ERSTE ZEILE
  var r = e.record;
  // ... eigener Code ...
}, 'collection_name');
```

---

## Routing-Architektur

| Domain | Ziel |
|---|---|
| `crewplanner.nyxlightwork.de` | Frontend (nginx, Produktiv) |
| `api.crewplanner.nyxlightwork.de` | Pocketbase API |

**CORS** läuft über Traefik (nicht Pocketbase-Admin). Erlaubte Origins:
- `https://crewplanner.nyxlightwork.de`
- `https://aniflu.github.io`

Kein StripPrefix — `POCKETBASE_URL` hat kein `/api`-Suffix.

---

## Tech-Stack

- **Vanilla JavaScript** — kein Framework, keine Bibliotheken, kein Build-Step
- **HTML5 + CSS3** — separate Dateien
- **localStorage** — persistente Datenspeicherung im Browser
- **Pocketbase** — Self-hosted Backend: Auth, Datenbank (SQLite), JS-Hooks für E-Mails
- **GitHub Pages** — statisches Hosting (Frontend)

---

## Lokale Entwicklung

```bash
python3 -m http.server 8080
# http://localhost:8080 im Browser öffnen
```

Datei in `js/` oder `styles.css` bearbeiten → Browser-Tab neu laden → fertig. Kein npm, kein Build.

**Cache-Bust:** Nach JS/CSS-Änderungen `?v=N` in `index.html` + `login.html` hochzählen.

### Headless-Tests (kein npm)

```bash
node tests/run.mjs                      # alle Logik-Tests
TZ=Europe/Berlin node tests/run.mjs     # Zeitzonen-Regression (Datumsbereiche)
TZ=UTC           node tests/run.mjs
```

- `js/pure.js` = dependency-freies Leaf-Modul (Datums-/Namens-Helfer) → direkt testbar.
- `tests/pure.test.mjs` ohne Stubs; `tests/logic.test.mjs` + `tests/flows.test.mjs` laden den echten Modulgraphen via `tests/_graph.mjs` (Stubs in `tests/_setup.mjs`) — zugleich Headless-Smoke-Test für alle Module.
- Abgedeckt: Datums-Bereiche (TZ-sicher), `getVal`/`isPending`/`sortInsert`/`typeFromLabel`, Crew anlegen/eintragen/löschen, Slot-Diffing (`_getNewSlotsForCrew`), `getMyCrewName` (case-insensitiv), Plan-Persistenz-Roundtrip. **Nicht** abgedeckt (braucht echtes PocketBase → Playwright): Login, E-Mail-Versand, Bestätigen/Absagen über die API.
- Mini-Framework: `tests/_assert.mjs` (`test`/`eq`/`deepEq`/`ok`, Exit-Code 1 bei Fehler). `js/userView.test.js` ist Jest-Stil-Altlast (kein Runner).
- **Reine, testbare Logik gehört nach `js/pure.js`** (oder ein anderes import-freies Leaf), nicht in `utils.js` — letzteres zieht über `types.js→render.js` den ganzen DOM-Graphen rein.

Aktuelle Versionen (Stand 2026-05-30):

| Datei | Version | Anmerkung |
|---|---|---|
| `config.js` | v29 | |
| `pb.js` | v33 | |
| `dataService.js` | v38 | loadPlanForCrew(), loadPlanForManager(), _getActivePlanId() mit Crew/Manager-Fallback |
| `authService.js` | v34 | loadPlanForManager() für IS_MANAGER, loadPlanForCrew() für IS_CREW |
| `rbac.js` | v1 | |
| `state.js` | v25 | |
| `render.js` | v27 | Crew: Namen mit Statusfarbe, nur eigene Slots editierbar |
| `dropdown.js` | v28 | "📧 anfragen"-Button entfernt |
| `bundle.js` | v30 | "📧 anfragen"-Button entfernt (gespiegelt) |
| `crewNotify.js` | v29 | sendInvite=bulkPropose+Mail, sendUpdate, _getNewSlotsForCrew |
| `crewLink.js` | v24 | |
| `userView.js` | v27 | openSlotConfirmModal, bulkConfirmAllMySlots, bulkDeclineAllMySlots |
| `emailLog.js` | v1 | renderEmailLog() für admin.html |
| `plans.js` | v26 | |
| `init.js` | v30 | |
| `tourblock.js` | v25 | |
| alle anderen | v23 | |

---

## Deploy zu Production (GitHub Pages)

```bash
git push origin main
```

GitHub Pages aktualisiert sich automatisch ~1 Minute nach dem Push. Der `main` Branch ist der Produktions-Branch.

---

## Production-Infrastruktur (Server)

**Wichtig:** Container wird von **Coolify** verwaltet — niemals `docker stop/rm/run` manuell ausführen. Nur `docker restart` für Hook-Reload.

**CORS** läuft über Traefik (nicht PocketBase). Erlaubte Origins: `crewplanner.nyxlightwork.de`, `aniflu.github.io`.

### Pocketbase Hook deployen

Hook aus GitHub holen + Container neu starten (alles in einem):

```bash
ssh hetzner "curl -s -o /var/lib/docker/volumes/ad9adhhkygjreidi79i4v5eb_pocketbase-hooks/_data/main.pb.js \
  https://raw.githubusercontent.com/Aniflu/Crewplaner/main/.pb_hooks/main.pb.js \
  && docker restart pocketbase-ad9adhhkygjreidi79i4v5eb"
```

### CORS anpassen (dauerhaft)

CORS wird NICHT mehr über Coolify oder PocketBase-Admin gesetzt, sondern ausschließlich über:
`/data/coolify/proxy/dynamic/pocketbase-fix.yaml` → `accessControlAllowOriginList`
Traefik lädt die Datei automatisch neu — kein Restart nötig.
Erlaubte Origins: `https://crewplanner.nyxlightwork.de`, `https://aniflu.github.io`

### Traefik strip-api Bug (GELÖST — dauerhafter Fix aktiv seit 20. Mai 2026)

Coolify schreibt bei jedem Redeploy `strip-api` Middleware in den HTTPS-Router → `/api/*` gibt 404.
**Dauerhafter Fix:** `pocketbase-fix.yaml` mit Priorität 1000 (Coolify hat ~60) überschreibt immer.
Datei: `/data/coolify/proxy/dynamic/pocketbase-fix.yaml` auf dem Server.
War am 15., 17. und 20. Mai 2026 aufgetreten. Seit 20. Mai permanent gefixt.

### Collections nach Coolify-Redeploy weg (Symptom + Fix)

**Symptom:** Collections in PB Admin nicht sichtbar, aber `/api/collections` gibt 404 — obwohl Daten (SQLite) noch da sind.

**Fix:**
1. PocketBase Admin → Settings → **Import collections**
2. Dieses JSON einfügen (ohne Relation-IDs, alles als text):

```json
[{"name":"plans","type":"base","listRule":"@request.auth.id != \"\"","viewRule":"@request.auth.id != \"\"","createRule":"@request.auth.id != \"\"","updateRule":"@request.auth.id != \"\"","deleteRule":"@request.auth.id != \"\"","fields":[{"name":"name","type":"text","required":true},{"name":"owner","type":"text"},{"name":"plan_data","type":"json"}]},{"name":"plan_members","type":"base","listRule":"@request.auth.id != \"\"","viewRule":"@request.auth.id != \"\"","createRule":"@request.auth.id != \"\"","updateRule":"@request.auth.id != \"\"","deleteRule":"@request.auth.id != \"\"","fields":[{"name":"plan_id","type":"text","required":true},{"name":"user_id","type":"text"},{"name":"role","type":"text"}]},{"name":"crew_members","type":"base","listRule":"@request.auth.id != \"\"","viewRule":"@request.auth.id != \"\"","createRule":"@request.auth.id != \"\"","updateRule":"@request.auth.id != \"\"","deleteRule":"@request.auth.id != \"\"","fields":[{"name":"plan_id","type":"text","required":true},{"name":"name","type":"text","required":true},{"name":"email","type":"email"},{"name":"sort_order","type":"number"},{"name":"user_id","type":"text"}]},{"name":"assignments","type":"base","listRule":"@request.auth.id != \"\"","viewRule":"@request.auth.id != \"\"","createRule":"@request.auth.id != \"\"","updateRule":"@request.auth.id != \"\"","deleteRule":"@request.auth.id != \"\"","fields":[{"name":"plan_id","type":"text","required":true},{"name":"date","type":"text","required":true},{"name":"pos_id","type":"text","required":true},{"name":"pos_label","type":"text"},{"name":"crew_name","type":"text"},{"name":"crew_email","type":"text"},{"name":"status","type":"text"},{"name":"proposed_by","type":"text"},{"name":"responded_at","type":"date"}]},{"name":"crew_invites","type":"base","listRule":"@request.auth.id != \"\"","viewRule":"@request.auth.id != \"\"","createRule":"@request.auth.id != \"\"","updateRule":"@request.auth.id != \"\"","deleteRule":"@request.auth.id != \"\"","fields":[{"name":"plan_id","type":"text"},{"name":"crew_name","type":"text","required":true},{"name":"crew_email","type":"email","required":true},{"name":"type","type":"text","required":true},{"name":"plan_name","type":"text"},{"name":"app_url","type":"text"},{"name":"custom_message","type":"text"}]},{"name":"email_log","type":"base","listRule":"@request.auth.id != \"\"","viewRule":"@request.auth.id != \"\"","createRule":"@request.auth.id != \"\"","updateRule":"","deleteRule":"@request.auth.id != \"\"","fields":[{"name":"plan_id","type":"text"},{"name":"crew_name","type":"text"},{"name":"crew_email","type":"text"},{"name":"email_type","type":"text"},{"name":"sent_at","type":"text"},{"name":"success","type":"text"}]}]
```

3. **"Merge with existing collections"** anhaken
4. **"Replace with original IDs"** klicken (erscheint automatisch wenn Collections/Daten schon da sind)
5. **Review** → **Confirm**

> Daten gehen NICHT verloren — SQLite-Tables bleiben. Nur die Collection-Definitionen fehlen.
> `pb_schema.json` im Repo ist NICHT direkt verwendbar (enthält alte Relation-IDs `pbc_1736455494`).

> ⚠️ **Feldtyp-Falle nach Reimport (v0.14.9):** Beim Wiederherstellen wurden `assignments.proposed_by`
> UND `assignments.plan_id` als **`relation`** statt **`text`** angelegt. Die App schreibt dort aber
> Strings (`proposed_by`='bulk'/'update'/'manual', `plan_id`=Plan-ID) → bei `proposed_by` wirft PB
> dann **„Failed to create record" (validation_missing_rel_records)** → **Einladen/Update/Bestätigen
> legen keine Slot-Records an**. `plan_id`=relation geht zufällig durch (echte Plan-ID löst auf).
> **Fix:** `assignments.proposed_by` muss **Text** sein. PB erlaubt KEINE Typ-Änderung am selben Feld
> („Field type cannot be changed") → Feld löschen + als Text neu anlegen (alte `proposed_by`-Werte =
> unkritische Metadaten). Per API: Collection-`fields` patchen (altes Feld raus, neues Text-Feld rein),
> oder PB-Admin-UI → assignments → proposed_by löschen → neu als „Plain text". Beim Schema-Import IMMER
> alle Felder als `text` (nie relation) anlegen.

Aktuell deployte Hook-Version: **v4.6**
- v4.1: email_log-Write nach jedem Mailversand
- v4.2: assignments CREATE-Hook entfernt (keine per-Slot-Emails mehr)
- v4.3: Absage-Email umformuliert ("Plan geändert")
- v4.4: Short-URL via is.gd bei plans view_token Update (serverseitig, kein CORS-Problem)
- v4.5: (a) Datum aus ISO-String formatiert statt new Date() → keine TZ-Verschiebung bei nicht-UTC-Container. (b) Anfrage-Mail-Guard erweitert: proposed_by `'bulk'` ODER `'update'` → keine doppelte per-Slot-Anfrage-Mail mehr bei Einladen/Update (die senden eigene konsolidierte Mail).
- v4.6: Optionaler Admin-Freitext — Feld `crew_invites.custom_message` wird als hervorgehobener Notiz-Block in invite/reminder/update/cancellation gerendert (`noteBlock`). Leer/fehlend = unverändert. **VORAUSSETZUNG:** Feld `custom_message` (text, optional) muss auf der crew_invites-Collection existieren (PB Admin → crew_invites → New field).
Danach in Docker-Logs prüfen: `[hook] main.pb.js v4.5 geladen`

### Docker-Logs live beobachten

```bash
ssh hetzner "docker logs pocketbase-ad9adhhkygjreidi79i4v5eb --tail 50 -f"
```

### E-Mail (Resend)

Hook sendet via Resend HTTP API (kein SMTP, umgeht Hetzner IP-Reputation-Problem).
- API-Key: in Coolify als `RESEND_KEY` Env-Var gesetzt (`$getEnv('RESEND_KEY')` im Hook)
- Verifizierte Domain: `crewplanner.nyxlightwork.de`
- Absender: `noreply@crewplanner.nyxlightwork.de`

### Admin-User anlegen (Pocketbase Admin UI)

`https://api.crewplanner.nyxlightwork.de/_/` → Collections → `users` → New record → Email: `madmaxmail@web.de`.

---

## Projektstruktur

```
├── index.html            ← HTML-Gerüst + <script> Ladereihenfolge (kritisch!)
├── admin.html            ← Manager/Superadmin-Konsole (Werkzeuge, E-Mail-Log, Benutzer, Pläne)
├── login.html            ← Login-Seite (Pocketbase Auth)
├── view.html             ← Öffentliche Read-only-Ansicht (kein Login, Token-basiert)
├── styles.css
├── .pb_hooks/
│   └── main.pb.js        ← Server-seitige E-Mail-Hooks (Pocketbase Goja-Engine) — v4.1
├── pocketbase/
│   └── pb_schema.json    ← Collections-Schema für Pocketbase-Import
└── js/
    ├── config.js         ← POCKETBASE_URL, ADMIN_EMAIL, SUPABASE_ENABLED
    ├── pb.js             ← Pocketbase REST-Client (pbGet, pbPost, pbPatch, pbDelete, pbList, pbFirst, pbUpsert)
    ├── dataService.js    ← Pocketbase CRUD: proposeCrew, loadCrewMeta, loadAssignmentStatuses, loadPlanForCrew
    ├── authService.js    ← Login/Logout, JWT, IS_CREW-Branch für Plan-Laden, _handleEmailAction()
    ├── state.js          ← Globale Variablen: POSITIONS, TOUR_DATES, crew, assignments, assignmentStatuses
    ├── utils.js          ← getVal(), isPending(), showToast(), fmtD(), genId(), esc()
    ├── render.js         ← renderTable(), renderHead(), renderBody() — Crew-Ansicht mit Status-Labels
    ├── bundle.js         ← ⚠️ MANUELLE KOPIE aus dropdown.js (kein Build-Tool!) — siehe unten
    ├── dropdown.js       ← showDD(), openCrewDD(), openDefaultDD(), requestForPos(), bulkCancelPos()
    ├── userView.js       ← Crew: openSlotConfirmModal(), bulkConfirmAllMySlots(), bulkDeclineAllMySlots()
    ├── emailLog.js       ← Admin: renderEmailLog() — lädt email_log Collection aus PB
    ├── init.js           ← App-Start: loadLogosGlobal(), initPlans(), render()
    └── ...               ← blockview, crewview, plans, pdf, persistence, sidebar, stats, tourblock, types
```

---

## Architektur-Gotchas

**Ladereihenfolge in `index.html` ist kritisch** — globaler Scope, kein Modulsystem. `pb.js` und `config.js` müssen vor allen anderen geladen werden.

**bundle.js = manuelle Kopie** — enthält Kopien der Funktionen aus `dropdown.js`, crew, positions, modals, dates, logos. Jede Änderung an `dropdown.js` MUSS auch in `bundle.js` gespiegelt werden. `dropdown.js` lädt nach `bundle.js` und überschreibt zur Laufzeit.

**Zwei Assignment-State-Schichten:**
```
assignments[date][posId]        → lokale Overrides (sofort, kein Pocketbase)
assignmentStatuses[date][posId] → Pocketbase-Cache { status, crewName, proposedBy }
```
`getVal(dateStr, posId)` in `utils.js` gibt den effektiven Zellwert zurück.

**Destructive Ops = kein Optimistic Update** — bei `cancelProposal` / `bulkCancelProposals` immer erst Pocketbase `await`en, dann lokalen State löschen. Bei Fehler: `loadAssignmentStatuses()` für Resync.

**Logos sind plan-unabhängig** — gespeichert in `tourplan_logos`, nie im Plan-State.

**`isPending(si)`** in `utils.js` — prüft `si.status === 'proposed' || 'declined'`; alle Status-Checks über diese Funktion.

**E-Mails via Pocketbase-Hook** — `proposeCrew()` triggert automatisch `.pb_hooks/main.pb.js`. Kein Frontend-E-Mail-Code nötig.

**`SUPABASE_ENABLED`** in `config.js` — trotz irreführendem Namen: `true` = Pocketbase aktiv, `false` = localStorage-only-Modus.

---

## E-Mail-Bestätigungs-Flow (v2.0)

```
Admin wählt Crew → proposeCrew() → PB assignment record (status=proposed)
  → Hook CREATE fired → E-Mail an crew_email
  → E-Mail: weißes Design, zwei Buttons:
      [✓ BESTÄTIGEN →]  https://crewplanner.nyxlightwork.de?action=confirm&aid=RECORD_ID
      [✗ ABLEHNEN →]   https://crewplanner.nyxlightwork.de?action=decline&aid=RECORD_ID
  → Crew klickt Button → App öffnet → Login falls nötig
  → _handleEmailAction() in authService.js → pbPatch(aid, {status:'confirmed'})
  → loadAssignmentStatuses() → renderTable() → Zelle grün ✓
```

Bei Ablehnen: Hook UPDATE fired (status=declined) → E-Mail an Admin (`madmaxmail@web.de`).

---

## Bekannte Gotchas & Debugging-Wissen

### PocketBase Goja-Isolation (KRITISCH)
Hook-Callbacks laufen in vollständig isoliertem Kontext. Keine äußeren Scope-Variablen
zugänglich — auch nicht `var`-Deklarationen außerhalb des Callbacks. Alle Werte (URLs,
API-Keys, Farben) müssen als String-Literale **innerhalb jeder verschachtelten Funktion**
hardcoded sein. Gelernt durch 4 Versionen (v1.6–v1.9) Debugging. Nie außerhalb definieren!

### sort=-created → 400-Fehler
Nach PocketBase-Schema-Import erkennt PB `created` nicht als sortierbares Feld.
Lösung: Default-Sort in `pb.js` auf `-id` geändert (`sort: sort || '-id'`). Nie zurückändern.

### pbUpsert → Duplicate Records
Wenn `pbFirst` einen 400-Fehler wirft, fällt `pbUpsert` durch zu `pbPost` und erstellt Duplikate.
Symptom: mehrfach gespeicherte `crew_members`. Fix: `-id`-Sort behebt das zugrundeliegende Problem.

### Plans-Record verloren (Data-Loss-Szenario)
Nach Schema-Wipe hatte plans-Record `name=N/A, owner=N/A`. Symptom: Alle PB-Operationen
schlagen still fehl (planId=null). Fix: PB Admin → plans-Record manuell reparieren
(name + owner setzen). Code-Fallback in `_createOrFetchPlanId()` (dataService.js) sucht Plan
per owner allein falls name-Filter fehlschlägt.

### E-Mail landet im Spam (web.de)
web.de filtert aggressiv. SPF/DKIM für crewplanner.nyxlightwork.de prüfen falls E-Mails
nicht ankommen. Nichts kaputt — User muss Spam-Ordner prüfen.

---

## Pocketbase Collections

```
plans           { id, name, owner(→users), plan_data(JSON) }
plan_members    { plan_id(→plans), user_id(→users), role }
crew_members    { plan_id(→plans), name, email, sort_order, user_id(→users) }
assignments     { plan_id, date, pos_id, pos_label, crew_name, crew_email, status, proposed_by, responded_at }
crew_invites    { plan_id, crew_name, crew_email, type, plan_name, app_url, custom_message }
email_log       { plan_id, crew_name, crew_email, email_type, sent_at, success }
```

Assignment-Status-Werte: `proposed` → `confirmed` | `declined`

email_type-Werte: `invite` | `reminder` | `cancellation` | `update` | `availability` | `love_invite` | `staff_invite`

---

## localStorage Keys

| Key | Inhalt |
|---|---|
| `tourplan_plans` | Index aller Pläne `[{id, name, created, modified}]` |
| `tourplan_plan_<id>` | Plan-Daten (OHNE Logos) |
| `tourplan_logos` | Logos global `{booking, band, planer}` als Base64 |
| `tourplan_custom_types` | Benutzerdefinierte Tagestypen |
| `pb_token` | Pocketbase JWT (Auth) |
| `pb_user` | Pocketbase User-Objekt (JSON) |
| `tourplan_pb_<planId>` | Pocketbase Plan-ID für aktiven Plan |

---

## Konventionen

- **Sprache:** Alle UI-Texte auf **Deutsch**
- **Farbpalette:** Gold `#e8c84a`, Grün `#4ae8a0`, Rot `#e84a4a`, Dark BG `#1a1a2e`
- **Kein Modulsystem** — alle JS-Dateien teilen den globalen Scope
- **Font:** `'IBM Plex Mono', monospace` (UI), `'Courier New'` (E-Mail-Templates)

---

## LLM Council Skill

Wenn der User "Consult the council:", "Frag andere KIs", "Was denken ChatGPT und Gemini darüber" oder ähnliches sagt — nutze den `llm-council` Skill via Skill-Tool.

## Tipps

- **`#` in Claude Code** — während einer Session drücken um Learnings direkt in diese CLAUDE.md zu schreiben
- **`.claude.local.md`** — für persönliche Einstellungen die nicht ins Git sollen
