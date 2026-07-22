# Changelog

> **v0.10.7 – v0.14.13 (Juni 2026)** — kondensiert. Vollständige, ausführliche Einträge: `CLAUDE.md` → Abschnitt „Versionierung".

## v0.29.0 – v0.30.0 — 2026-07-21
- **feat (v0.29.0):** Dritter Zell-Status „Vorgemerkt" (✎, violett) für Fernzukunft-Termine ohne Mailversand + Übergang „→ Jetzt anfragen"; nebenbei Farbtoken-Fix bei „angefragt" (nutzte noch altes Gold).
- **fix (v0.29.1):** Status-Icon-Span erschien in Manager/Booker-Ansicht als Roh-Text (esc() maskierte das Icon-HTML) — Icon jetzt in eigener, nie escapter Variable.
- **fix (v0.29.2):** Crew aus einem Tag entfernen löste NIE eine Absage-Benachrichtigung aus — weder bei „Nicht besetzt" noch bei zwei der drei anderen Entfernen-Wege (fehlender Import).
- **feat (v0.29.3):** Absage-Dialog in der Konsole erlaubt jetzt auch das manuelle Nachtragen eines Termins, wenn die Zuweisung schon (auch vor dem Fix) entfernt wurde.
- **feat (v0.30.0):** Vereinheitlichte „Es gab Änderungen"-Mail + Aktivitäts-Log. Ein „↻ Updates"-Button für neue UND entfernte Termine (das rote Absage-Banner aus v0.29.2 ist ersetzt); Entfernen setzt jetzt `status:'cancelled'` (Soft-Cancel statt Löschen) statt zu löschen, damit ein „ÄNDERUNGEN GESEHEN ✓"-Mail-Button ein Ziel hat; Quittung → `cancel_acked`. Alle Crew-Reaktionen (zugesagt/abgelehnt/Absage gesehen) landen in der neuen Collection `activity_log` — Admin-Konsole zeigt sie im „Aktivität"-Tab + Login-Popup mit den neuen Zeilen. Hook v4.10 (deployt 2026-07-22) rendert die zweiteilige Mail. 108 grün. Details: `CLAUDE.md` → Versionierung.

## v0.28.0 — 2026-07-19
- **feat:** Rebrand „Crew Pass" + Hell/Dunkel-Umschalter (NYX-Lightwork-CI). Kompletter Marken-/Design-Umbau nach übergebenem Design-Brief, konsistent zur Schwester-App CallBoard/Bauzeitenplan: neues Hexagon-Logo, Navy/Paper-Palette, Geist + JetBrains Mono statt IBM Plex Mono/Bebas Neue/Archivo. Neue zentrale `theme.css` mit Light/Dark/OS-Tokens (`data-theme` am `<html>`, Schlüssel `cp_mode`) behebt die bisherige 4-Welten-CSS-Fragmentierung (styles.css + je eigenes Inline-CSS in admin/login/view). ☀/☾-Umschalter auf allen vier Seiten, Fonts selbstgehostet (`assets/fonts/`). Gold `#f7c948` lebt jetzt nur noch im Logo + im „HEUTE"-Strich der Tourtabelle — alle dekorativen Gold-Stellen (Header-Rail, Buttons, Banner) auf `var(--accent)` umgestellt. Vorschau (interaktives Artifact) vor jeder Code-Änderung mit dem User abgestimmt. +tests/theme.test.mjs. 102 grün. app.js?v=40→41, view-app.js?v=2→3, styles.css?v=23→24, NEU theme.css?v=1. Kein Hook/Schema.
- **fix:** Öffentlicher Booker-Link (v0.27.2) zeigte keine Besetzung. `view-app.js` befüllte den Render-State über `window.crew/POSITIONS/assignments/defaultCrew=…` statt über die state.js-Setter → render.js/getVal lasen nie davon (nur `TOUR_DATES` per `.splice()` wirkte). Betraf alle öffentlichen Links, nicht nur einzelne Touren. Fix: state.js-Setter (`setCrew`/`setPositions`/`setTourDates`/`loadAssignmentsData`/`setDefaultCrew`/`loadStatusesData`) statt window-Zuweisungen. +tests/viewapp.test.mjs.

## v0.27.0 – v0.27.1 — 2026-07-19
- **feat:** Abonnierbarer Kalender pro Person (v0.27.0). Statt eines einmaligen ICS-Downloads liefert eine neue Server-Route (`/ics/{token}`, Hook v4.9) einen live aktualisierten Kalender-Feed pro Crew-Mitglied (`users.feed_token`) — Ein-Tipp-Abo für Apple/Android/Outlook, „Per URL" für Google. Feed enthält bestätigte (CONFIRMED) und angefragte (TENTATIVE) Termine über alle Touren. **fix (v0.27.1):** Feed war fälschlich tour-übergreifend gemischt (eine Person in zwei Touren sah beide vermengt) — Route auf `/ics/{token}/{plan}` erweitert (Hook v4.9.2), ein Abo gilt jetzt nur für die aktuell geöffnete Tour.

## v0.26.1 — 2026-07-14
- **fix:** Handy — Einladungs-Popup landete außerhalb des Sichtfelds (nur schwarzer Backdrop sichtbar). Ursache: kein Body-Scroll-Lock + keine Mobile-Regeln für `.modal-bg`/`.modal-box` seit dem Scrollbar-Fix (v0.24). Fix: `body.modal-open{overflow:hidden}` + am Handy Overlay als Scroll-Fläche mit Box oben verankert statt zentriert.

## v0.26.0 — 2026-07-14
- **fix/chore/security:** Sammlung aus einem Gesamt-Code-Review + echte Server-Absicherung.
  - **Aufräumen:** `js/bundle.js` (505 LOC, seit der ES6-Migration nie mehr geladen) und `js/userView.test.js` (Jest-Altlast ohne Runner) gelöscht; die stale „bundle.js muss gespiegelt werden"-Regel aus CLAUDE.md entfernt.
  - **XSS-Härtung:** `showDD` (dropdown.js) escaped jetzt `header`/`label`/`dot` (vorher landeten Crew-/Positionsnamen unescaped im `innerHTML`).
  - **Kleinfixes:** `pbEscapeFilter` (pb.js) verdoppelt einzelne Backslashes korrekt (Regex war `/\\\\/`); `showToast` (utils.js) mit Null-Guard; Auto-Scroll zur „Heute"-Zeile springt nach Tour-/Plan-Wechsel wieder (`resetTodayAutoScroll` in `switchPlan`/`switchCrewPlan`). 85 Tests grün. app.js?v=37→38.
  - **Server-seitig (PocketBase, per Impersonation getestet):** `assignments.updateRule` → Crew ändert nur EIGENE Einsätze (crew_email = eigene), Owner/superadmin alles. `crew_invites.createRule` → nur Owner/superadmin dürfen invite/reminder/update/cancellation (mailen an Fremde); `availability` (mailt nur an Admin) bleibt erlaubt. ⚠️ Coolify-Redeploy/Reimport setzt beide zurück → neu setzen.
  - **Feld `crew_members.role` (text) angelegt** (fehlte live trotz v0.22.0-Notiz → createPoolMember-Rolle wurde still verworfen) + **Hook v4.8 deployt** → Pool-Rolle wird beim Erst-Login automatisch aufs `users`-Konto übernommen (end-to-end getestet). Deployte Hook-Version jetzt **v4.8** (war v4.6).

## v0.25.0 — 2026-07-12
- **feat:** „Heute"-Markierung in der Tourtabelle (Today-Line). Die heutige Zeile bekommt einen goldenen Strich + „HEUTE"-Badge, vergangene Tage werden abgedunkelt, beim Öffnen scrollt die Tabelle einmalig dorthin (+ „→ Heute"-Button). Reine, TZ-sichere Leaf-Funktion `todayMarkers` (pure.js); Strich via `box-shadow:inset` (sticky-Spalten-sicher), Gold statt Rot (declined-Kollision). +tests/today.test.mjs. 85 grün. app.js?v=36→37. Kein Hook/Schema.

## v0.24.0 — 2026-07-11
- **feat:** Handy-Tauglichkeit / Responsive-Layout. `styles.css` hatte keine Media-Queries → am Handy war die App unbedienbar (falsche Anordnung + gar kein Scrollen). Neuer `@media(max-width:768px)`-Block löst den Scroll-Trap (einspaltiges Layout, `height:auto`, Tabelle horizontal scrollbar mit sticky Datum-Spalte), Sidebar wird Off-Canvas-Drawer (Hamburger + Backdrop, neue `toggleDrawer`), schlanker Header, KPI 6→3 Spalten. admin.html eigener Breakpoint. +tests/mobile.test.mjs. 79 grün. app.js?v=35→36, admin-app.js?v=12→13. Kein Hook/Schema.

## v0.23.5 — 2026-07-09
- **fix:** „Konto erstellen" bei bereits vergebener E-Mail zeigte nur „Failed to create record". Wer vorab in der Konsole angelegt wurde, hat schon ein `users`-Konto → PB lehnt die E-Mail als vergeben ab. `doRegister` (login.html) erkennt jetzt `validation_not_unique` → Meldung „Konto mit dieser E-Mail-Adresse schon vorhanden", schaltet auf den Login um und füllt die E-Mail vor (neuer Helfer `_switchToLogin`). Roberts blockierender Leer-Account wurde per PB-Superuser entfernt (Crew-Einträge blieben). Kein Hook/Schema, Tests unverändert (74 grün).

## v0.23.4 — 2026-07-09
- **fix:** „KONTO ERSTELLEN"-Link der Staff-Einladung führte auf eine GitHub-404-Seite. `sendStaffInvite` (admin.html) baute `app_url` aus `window.location.origin + '/login.html'` → von der GitHub-Pages-Testseite fehlte das `/Crewplaner/`-Präfix. Link jetzt fest auf `https://crewplanner.nyxlightwork.de/login.html`. 74 grün.

## v0.23.3 — 2026-07-08
- **fix:** Namen mit Anführungszeichen wurden in der Anzeige abgeschnitten (`Robert "Woody" Steinmetz` → nur „Robert"). `esc()` (utils.js) maskierte über den `textContent→innerHTML`-Trick nur `<`,`>`,`&`, nicht `"`/`'` → in `value="${esc(...)}"` brach der Wert am inneren `"` ab. `esc()` maskiert jetzt zusätzlich `"`→`&quot;` und `'`→`&#39;` (DOM-frei, Text- und Attributkontext). +logic.test.mjs. 74 grün. app.js?v=34→35, admin-app.js?v=11→12.

## v0.23.2 — 2026-07-08
- **fix (Backend/Schema, kein App-Code):** „Namen speichern" brach mit `plan_id: Failed to find all relation records` ab. `crew_members.plan_id` war als **relation** statt **text** angelegt → der Pool-Sentinel `plan_id="__pool__"` ist kein echter plans-Record → Validierung schlug fehl (Pool-Records entstanden nie). `crew_members.plan_id` UND `assignments.plan_id` von relation→text umgebaut (14 bzw. 709 Records, kein Datenverlust). Keine Code-/Teständerung (73 grün).

## v0.23.1 — 2026-07-08
- **fix:** Namen im Verzeichnis speichern persistierte nicht (grünes „Gespeichert ✓", nach Reload leer). `users` hat kein `name`-Feld → PB verwarf den PATCH still. Namen leben in `crew_members`; `saveDirectoryEntry` legt bei reinem Konto einen Pool-Eintrag `{plan_id:"__pool__", name, email, role}` an. 73 grün. admin-app.js?v=10→11.

## v0.23.0 — 2026-07-08
- **feat:** Vereintes Crew-Verzeichnis in der Konsole. Der „Benutzer"-Tab zeigt jetzt ALLE Personen in EINER Liste, per E-Mail zusammengeführt (`mergeCrewDirectory`), mit editierbarem Name·E-Mail·Rolle + Badges (Konto/Pool/Touren). Namensänderung propagiert nach users, Pool-crew_members und pro Tour ins Plan-JSON (`renameInPlanData`) + assignments. +tests/directory.test.mjs. 73 grün. app.js?v=33→34, admin-app.js?v=9→10.

## v0.22.0 — 2026-07-08
- **feat:** Globaler Crew-Pool — neue Mitglieder an EINER Stelle in der Admin-Konsole anlegen („+ Neues Crew-Mitglied": Name·E-Mail·Rolle → `createPoolMember`, Sentinel `plan_id="__pool__"`, server-seitiger Dublettencheck). Kein Login-Konto/Reset-Mail; Konto entsteht erst beim Erst-Login über den Einladungslink, Rolle wird vom users-Create-Hook (v4.8) aus dem Pool übernommen. „♥ Liebeseinladung" entfernt. **Schema:** neues Textfeld `crew_members.role`. +tests/crewpool.test.mjs. 68 grün. app.js?v=32→33, admin-app.js?v=8→9.

## v0.21.0 — 2026-07-04
- **feat:** Crew-Plan-Umschalter in der Seitenleiste. Crew in mehreren Touren (z.B. Oliver Thomas: AMK + Provinz) sah nach dem Bestätigen aller Termine nur noch eine Tour ohne Wechselmöglichkeit. Neue „Pläne"-Sektion füllt für Crew dasselbe `#planList` wie beim Manager (`loadCrewPlans` → `renderCrewPlanList`/`switchCrewPlan`); gewählte Tour bleibt über Reload erhalten (localStorage `tourplan_crew_selected_pb_id`), `_getActivePlanId` prüft ihn zuerst. +tests (loadCrewPlans Dedup+Sortierung). 66 grün. app.js?v=31→32.

## v0.20.2 — 2026-07-02
- **fix:** Crew-ICS-Titel — `crewIcsContent` (pure.js) setzte `SUMMARY` = Bandname (jeder Tag gleich). Jetzt `SUMMARY = "Art: Ort"`, Bandname in `DESCRIPTION`, `LOCATION` = Ort. 64 grün. app.js?v=30→31.

## v0.20.1 — 2026-07-02
- **feat:** Crew exportiert eigene bestätigte Termine — zwei Buttons „📅 Meine Termine (.ics)" + „📄 Meine Termine (PDF)". ICS-Eintrag bewusst nur Band (SUMMARY) / Ort (LOCATION) / Art (DESCRIPTION), keine anderen Namen. Bandname für Crew via `tourplan_active_plan_name`. +tests (crewIcsContent Format-Guard). 64 grün. app.js?v=29→30.

## v0.20.0 — 2026-07-02
- **feat/security:** Scoping-Hardening. `confirmAssignment`/`declineAssignment` prüfen bei Crew, dass der Ziel-Record die eigene E-Mail trägt → Crew kann nur eigene Einsätze bestätigen/absagen. ICS enthält nur bestätigte Termine (neue reine `confirmedIcsRows`, Crew+Manager+Admin). Server-seitige PB-Regeln bewusst nicht Teil (app-seitig). +tests. 63 grün. app.js?v=28→29, admin-app.js?v=7→8.

## v0.19.1 — 2026-07-01
- **fix:** Crew-Pool-Import verschmolz zwei verschiedene „Marco Hoch" (Admin- vs. GL-Crew-Konto) über den Namen und übernahm die falsche Mail nach Provinz. `dedupKnownCrew` schlüsselt jetzt nach E-Mail (lowercase), sonst Name. `_getActivePlanId` Crew-Zweig nutzt `pbList` und bevorzugt bei Mehr-Plan-Crew den Plan mit offenen Anfragen. Admin-ICS liest wieder den geladenen Plan. Provinz-Daten repariert. 58 grün. app.js?v=27→28, admin-app.js?v=6→7.

## v0.19.0 — 2026-07-01
- **feat:** Dauerhafte Cache-Lösung via Service Worker (`sw.js`) — liefert gleich-Origin JS/CSS/HTML network-first (`no-cache`, revalidierend) aus, cached nichts stale. Behebt das wiederkehrende „stale Sub-Modul"-Problem (Fixes kamen erst nach Hard-Reload). Registriert in index/admin/login/view.html mit einmaligem Auto-Reload. +tests. 57 grün. app.js?v=26→27, admin-app.js?v=5→6.

## v0.18.3 — 2026-07-01
- **fix:** Crew „Termine bestätigen" meldete „keine offenen Termine" trotz sichtbarer Tage (`getMyPendingSlots` sammelte nur proposed-Records, nicht die via `getVal`/defaultCrew sichtbaren Slots). Jetzt iteriert es TOUR_DATES×POSITIONS über `getVal` und öffnet eine Auswahl-Liste (alles angehakt → abwählen was nicht geht). 52 grün. app.js?v=25→26.

## v0.18.2 — 2026-07-01
- **fix+feat:** Admin-„Einladung" öffnete kein Fenster — admin.html fehlte die Aufdeck-Regel `.modal-bg.open{display:flex}` (eigenes inline-CSS, kein styles.css). Ergänzt. Neu: `sendAdminInvite` schickt EINE Mail mit allen Terminen der Person + legt proposed-Records an. Hook v4.7 rendert die Terminliste. +tests. 51 grün. admin-app.js?v=4→5.

## v0.18.1 — 2026-07-01
- **fix:** Crew-Pool-Button öffnete nichts — `crewImportModal` war mit inline `display:none` gebaut, `openModal` deckt aber nur `.modal-bg.open` auf. Als echtes `.modal-bg`/`.modal-box` neu gebaut. Button umbenannt „＋ Aus Crew-Pool wählen". 49 grün. app.js?v=24→25.

## v0.18.0 — 2026-07-01
- **feat:** Bekannte Crew aus früheren Touren übernehmen. Neuer Button „＋ Bekannte Crew übernehmen" im Crew-Dialog → tour-übergreifende Liste (`loadAllKnownCrew` + `dedupKnownCrew`, doppelte Namen zusammengeführt, E-Mail bevorzugt) zum Anhaken; ausgewählte landen mit E-Mail im aktuellen Plan. +tests. 49 grün. app.js?v=23→24.

## v0.17.3 — 2026-07-01
- **fix:** „Updates"-Button erscheint jetzt auch für Tage, die schon länger im Plan stehen (nicht nur beim Hinzufügen). `_liveNewSlotsByCrew` erkennt eingeplante, noch nicht bestätigte/angefragte Slots read-only und mergt sie beim Öffnen in die Queue. +tests. 47 grün. app.js?v=22→23.

## v0.17.2 — 2026-06-30
- **fix+feat:** (1) Folge-Regression v0.17.1 — Update-Bar erschien nach „Tag hinzufügen" nicht mehr (Queue las aus `assignmentStatuses`; frischer Tag hat dort keine Records). Befüllt jetzt über `getVal`. (2) Self-Heal entfernt nicht-mehr-eingeplante Slots. (3) E-Mail-Vorschau pro Person beim Update-Senden mit optionalem Freitext (Hook v4.6 `custom_message`). app.js?v=21→22. 46 grün.

## v0.17.1 — 2026-06-30
- **fix:** Beim Hinzufügen von Tagen/Tourblöcken wanderten alle Einsätze des ganzen Plans in die Update-Queue statt nur der neuen. `_queueGlobalCrewUpdate(desc, dates)` queued jetzt nur die übergebenen (neuen) Tage. Neuer „QUEUE LEEREN"-Button. +tests. 45 grün. app.js?v=20→21.

## v0.17.0 — 2026-06-30
- **fix (4 Themen):** (1) Tage-Berechnung zählt nur bestätigte Slots (`calcByPers` prüft `assignmentStatuses`). (2) Unbesetzen leert die Zelle wirklich (setAssign auf '' statt defaultCrew-Fallback). (3) Update-Badge zählt gefilterte Slots statt Personen (kein Badge bei leerem Modal). (4) Phantom-Pläne unterbunden — PB-Plan-Write auf `IS_MANAGER` gegated; 6 „Tour 2026"-Duplikate entfernt. +tests. 43 grün. app.js?v=19→20, admin-app.js?v=3→4.

## v0.16.0 — 2026-06-18
- **fix:** Crew mit **Firefox** sah nie einen Plan (leere Tabelle). Ursache: ungültige Zuweisung `getActivePlanId()=id;` in persistence.js — V8/Chrome parst tolerant durch, SpiderMonkey/Firefox wirft `SyntaxError` und reißt den ganzen Modulgraphen mit → kein App-Init. Fix: `setActivePlanId(id);`. Neuer Test-Guard `syntax.test.mjs`. app.js?v=18→19. 39 grün.

## v0.15.0 — 2026-06-18
- **fix:** Crew mit groß/klein gemischter E-Mail (z.B. `LivLights@gmx.de`) sah keinen Plan — der case-sensitive PocketBase-`=`-Filter im `crew_members`-Lookup fand 0 Treffer. login.html normalisiert E-Mails jetzt bei Login + Registrierung auf Kleinschreibung; Wolfs `users.email` per Superuser auf `livlights@gmx.de` korrigiert.

## v0.14.13 — 2026-06-17
- **fix:** Logout im Crew-View tat nichts (`onclick="logout()"` hing an `window.logout`, das bei hängendem App-Init fehlt). Beide Abmelden-Buttons jetzt selbstständig inline (Token löschen + `location.href='login.html'`). `window.logout` entfernt (war orphan).

## v0.14.12 — 2026-06-17
- **feat+fix:** Crew umbenennen (✏) ohne Dublette — Name wird lokal + in PB (`crew_members` + `assignments`) ersetzt; `removeCrew` löscht den PB-Record mit. PB-Dubletten bereinigt (Thomas Heine, 2× Marco).

## v0.14.11 — 2026-06-16
- **fix:** Passwort-Reset-Link „file not found" → PB-`resetPasswordTemplate` auf `{APP_URL}?token={TOKEN}` (passt zu login.html). Zusätzlicher sichtbarer Logout-Button in der Sidebar.

## v0.14.10 — 2026-06-16
- **fix:** Self-Register setzte weder `role` noch `emailVisibility` → „Crew sieht keinen Plan" + „Keine E-Mail". Payload um `role:'crew', emailVisibility:true` ergänzt; Admin-Liste zeigt rollenlose User. 4 Bestands-User gepatcht.

## v0.14.9 — 2026-06-16
- **fix:** Geplante Crew ohne Bestätigungs-Record war nicht bestätigbar → `confirmAssignment` legt jetzt einen confirmed-Record an; Zellen-Menü bietet „Bestätigen" für jede geplante Person.
- **PB-Schema-Fix:** `assignments.proposed_by` von relation auf text (war Ursache von „Failed to create record").

## v0.14.6–v0.14.8 — 2026-06-14/15
- **fix(KRITISCH, Datenverlust):** Mehr-Plan Cross-Write — `_savePlanToLS` patchte ohne eigene Zuordnung den globalen `active_pb_id`-Record → „Provinz 2027" überschrieb „AMK 2026". Jetzt nur eigener Record. AMK wiederhergestellt, Provinz in eigenen Record ausgelagert. + Cross-Write-Test.
- **fix:** „Speichern" schrieb gar nicht nach PB (rief nur JSON-Download); jetzt echtes `savePlan()` mit awaited PB-Sync + ehrlichem Erfolg/Fehler-Toast.

## v0.14.4–v0.14.5 — 2026-06-13
- **fix:** Dialog-System (confirm/alert/prompt) seit ES6-Migration tot (IIFE nie aufgerufen → `window.show*` undefined). + `dialog.test.mjs`.
- **fix+feat:** Update-Queue pro Plan scopen (war global, 300+ Einträge) + Bulk-/Block-Auswahl im Modal.

## v0.14.1–v0.14.3 — 2026-06-12/13
- **fix:** Tage/Blöcke-Buttons wiederhergestellt; neue Pläne landen in admin.html; „Datum hinzufügen" (fehlender `TYPE_OPTS`-Import) gefixt.
- **chore+test:** Reachability-Audit + Import-Guard (`tests/reachability.test.mjs`, `tests/imports.test.mjs`) — fangen tote Buttons + fehlende ES6-Imports statisch.

## v0.11.0–v0.13.0 — 2026-06
- **fix:** ES6-Modul-Vollsanierung (24 fehlende Imports), Backend-Review (echte Fehler statt stillem „grün"), personenbezogene „Zurückziehen"-Buttons, TZ-sichere Datumsbereiche, `sameCrew`/`normCrewName`.

## v0.10.7 — 2026-06-12
- **fix:** `getNavUrl`-Bug (`/Crewplaner/` ohne Dateiname wurde als Produktivserver erkannt → Admin-Konsole/Login-Redirect 404).

---

## v0.10.6 — 2026-06-12

### Chore: login.html aufgeräumt
- Debug-Overlay „Auth Bootstrap Logs" (zeigte `_authBootstrapLogs` aus localStorage) entfernt — Überbleibsel der Bounce-Diagnose
- Versionsanzeige korrigiert: bestehende `.login-version` aktualisiert (war doppelt + veraltet auf v0.9.7)

---

## v0.10.5 — 2026-06-12

### Fix: ES6-Migrations-Audit — 35 fehlende onclick-Handler-Registrierungen
- Seit der ES6-Modul-Migration (v0.9.3) waren ~35 onclick-Handler auf `index.html` nicht mehr als `window.X` registriert → `ReferenceError` beim Klick (verdeckt durch den Bounce, da index.html nie durchlud)
- Betroffen u.a.: `openCrewDD`, `openDateDD`, `openDefaultDD`, `openTypeDD`, `requestAll`, `requestForPos`, `bulkCancelPos`, `openPosMenu`, `openRenamePos`, `deletePlan`, `renamePlan`, `switchPlan`, `confirmNewPlan`, `deleteType`, `openEditType`, `removeCrew`, `saveCrewLinkRow`, `sendInvite`, `sendUpdate`, `tbChangeType`, `meinesMelden`, `toggleCancellation`, `startLocEdit`
- Alle zentral in `js/app.js` importiert + registriert; 4 interne `userView.js`-Funktionen exportiert
- `admin.html` (inline-Handler) und `view.html` (view-app.js) waren nicht betroffen — geprüft

---

## v0.10.4 — 2026-06-12

### Chore: Diagnose-Instrumentierung entfernt + Plan-Leichen-Leak gefixt
- `_logAuth`-Diagnosezeilen aus `authService.js` entfernt; `auth-bootstrap.js`-Logger zurück auf Original
- **Plan-Leichen-Leak:** Der Plan-Transfer (`authService.js`) erzeugte bei jedem „Plan bearbeiten"-Klick eine neue ID (`Date.now()`) und löschte alte `tourplan_plan_*`-Keys nie → in 5 Tagen Bounce-Testing 65 verwaiste localStorage-Keys
- Fix: stabile ID (`pbplan_<pbid>`) + neuer `_pruneOrphanPlans()` (`plans.js`), aufgerufen beim Transfer + jedem App-Start → verwaiste Keys werden automatisch entfernt

---

## v0.10.3 — 2026-06-12

### Fix: Alle restlichen fehlenden ES6-Imports
- `dropdown.js` (`CREW_COLORS`, `hasPermission`, `openBlockAssign`), `pdf.js` (`OFFEN`, `DE_DAYS`, `DE_MON`, `fmt`), `crewNotify.js` (`esc`), `persistence.js` (`savePlansIndex`, `genPlanId`, `_today`), `plans.js` (`hasPermission`), `userView.js` (`sendUpdateNotice`, `pbFirst`), `crewLink.js` (`saveCrewLink`)

---

## v0.10.0 – v0.10.2 — 2026-06-11/12

### Fix: ROOT-CAUSE des 5-Tage-„Bounce" (admin↔login↔admin, Plan lädt nicht aus PocketBase)
- Ursache war **nie** Pfade/`getNavUrl`/`<base>` (daran wurde 5 Tage erfolglos geschraubt), sondern **fehlende ES6-Imports** nach der Modul-Migration: bare Referenzen warfen stille `ReferenceError`s, die (im `catch` von `authService.js`) als Redirect zu login.html und zurück zu admin.html erschienen
- **v0.10.0:** `crew`/`CREW_COLORS` in `render.js`, `activePlanId` in `dataService.js`
- **v0.10.1:** persistente Cross-Page Auth-Logs zur Diagnose (temporär, in v0.10.4 entfernt)
- **v0.10.2:** `colorToDarkBg` in `render.js` (`renderBody`) — der eigentliche Bounce-Auslöser
- **Erkenntnis:** `window`-Globals sind seiten-spezifisch — ein bare Aufruf crasht auf der Seite, deren Entry-Script ihn nicht registriert

---

## v0.9.9.0 — 2026-05-27

### Feature: Datum einem Tourblock zuweisen

- **`js/tourblock.js`** — Neue Funktion `openBlockAssign(dateStr)`: öffnet Modal mit Dropdown aller vorhandenen Blöcke; weist einzelnes Datum dem gewählten Block zu
- **`js/dropdown.js`** / **`js/bundle.js`** — `openDateDD` hat zwei neue Items:
  - "→ Block zuweisen…" → öffnet Block-Picker
  - "✕ Aus Block entfernen" → erscheint nur wenn Datum bereits in einem Block ist

---

## v0.9.8.9 — 2026-05-26

### Fix: Explizite Anfrage-Option im Slot-Dropdown

- **`js/dropdown.js`** / **`js/bundle.js`** — Neues Item "📧 [Name] anfragen" erscheint im Slot-Dropdown wenn ein Name zugewiesen ist, der Crewmember eine E-Mail hat, und noch keine Anfrage (PB-Record) existiert
- Ein Klick = ein Aufruf von `proposeCrew` = eine E-Mail — vollständig admin-kontrolliert
- Gilt für alle Tagestypen (Show, Off, Reise, Prep etc.)
- Keine automatische E-Mail — nur auf expliziten Klick des Admins

---

## v0.9.8.8 — 2026-05-26

### Revert: v0.9.8.7 automatisches proposeCrew zurückgenommen

- **`js/dropdown.js`** / **`js/bundle.js`** — Crew-Zuweisung im Dropdown ruft wieder nur `setAssign` auf, kein `proposeCrew`
- E-Mails werden ausschließlich manuell vom Admin im Adminfenster ausgelöst — nie automatisch

---

## v0.9.8.7 — 2026-05-26

### Fix: Crew-Zuweisung löst jetzt automatisch Anfrage aus

- **`js/dropdown.js`** / **`js/bundle.js`** — Wenn Admin in `openCrewDD` einen Namen mit 📧 auswählt, wird nach `setAssign` automatisch `proposeCrew` aufgerufen → PB-Record mit `status='proposed'` angelegt → E-Mail an Crewmitglied
- Guard gegen Duplikate: `proposeCrew` wird nur aufgerufen wenn kein bestehender Antrag für dieselbe Person vorhanden ist
- Bei Wechsel von Person A → Person B: Ausstehender Antrag für A wird automatisch zurückgezogen (Absage-E-Mail in Queue), neuer Antrag für B erstellt
- Gilt für ALLE Tagestypen (Show, Off, Reise, Prep etc.) — kein Typ-Filter

---

## v0.9.8.6 — 2026-05-25

### Feature: Ausschreiben-Slot

- **`js/state.js`** — Konstante `AUSSCHREIBEN = '__ausschreiben__'` hinzugefügt
- **`js/dropdown.js`** — Neuer Eintrag "📋 Ausschreiben" (orange) im Crew-Dropdown
- **`js/render.js`** — Manager/Booker sehen "📋 Ausschr." (orange); eingeloggte Crew sieht "📋 Bewerben"-Button (ruft `meinesMelden()` auf); Supabase-Status hat weiterhin Vorrang
- **`js/bundle.js`** — dropdown.js gespiegelt

---

## v0.9.8.5 — 2026-05-25

### Feature: Offday & Reisetag als neue Slot-Zustände

- **`js/state.js`** — Konstanten `OFFDAY = '__offday__'` und `REISE_TAG = '__reise_tag__'` hinzugefügt
- **`js/dropdown.js`** — Zwei neue Einträge im Crew-Dropdown: 🏖 Offday (grün) und ✈ Reisetag (blau)
- **`js/render.js`** — Visuelle Anzeige für beide Zustände; Supabase-Status hat Vorrang (OFFDAY/REISE_TAG werden nur angezeigt wenn kein aktiver proposed/confirmed/declined-Status vorhanden)
- **`js/bundle.js`** — dropdown.js gespiegelt
- Tageszähler im Crew-Sidebar zählt Offday/Reise-Tage nicht als Arbeitstage (automatisch durch Name-Matching)

## v0.9.7.1 — 2026-05-21

### Security: XSS-Escaping + Doppel-E-Mail-Schutz + Admin-E-Mail aus ENV

- **`.pb_hooks/main.pb.js`** (v3.9→v4.0)
  - `esc()`-Funktion in allen 3 Hooks — `crewName`, `posLabel`, `planName` werden in HTML-Templates HTML-escaped (verhindert XSS in E-Mails)
  - UPDATE-Hook (assignments): prüft via `r.originalCopy()` ob Status bereits `proposed` war — sendet keine E-Mail wenn sich nichts geändert hat (verhindert Doppel-E-Mails bei `pbUpsert`-Calls)
  - Admin-E-Mail für Ablehnungs-Benachrichtigung jetzt via `$os.getenv('ADMIN_EMAIL')` mit Fallback auf hardcodierten Wert
  - `app_url`-Feld für JSON-Slot-Transport in Absage-Mails explizit kommentiert

- **`js/dataService.js`** — `proposeCrew()` und `bulkProposeCrew()` mit WARNUNG-Kommentaren versehen (beide Funktionen triggern PB-Hook → E-Mail; werden aktuell von keiner UI-Aktion aufgerufen)

- **`js/userView.js`** — `meinesMelden()` ruft kein `proposeCrew()` mehr auf; rein lokal (bereits in v0.9.7.0 gefixt, hier dokumentiert)

### Deploy erforderlich

```bash
ssh hetzner "curl -o /var/lib/docker/volumes/ad9adhhkygjreidi79i4v5eb_pocketbase-hooks/_data/main.pb.js \
  https://raw.githubusercontent.com/Aniflu/Crewplaner/main/.pb_hooks/main.pb.js \
  && docker restart pocketbase-ad9adhhkygjreidi79i4v5eb"
```

### Optional: ADMIN_EMAIL in Coolify setzen

Damit Ablehnungs-Mails flexibel an die richtige Adresse gehen:
```
ADMIN_EMAIL=deine@email.de
```

---

## v0.9.7.0 — 2026-05-21

### Fix: sendInvite() + meinesMelden() — keine ungewollten E-Mails mehr

- **`js/crewNotify.js`** — `sendInvite()`: `bulkProposeCrew()`-Block entfernt; sendet jetzt genau 1 E-Mail via `sendCrewInvite()`
- **`js/userView.js`** — `meinesMelden()`: `proposeCrew()`-Aufruf entfernt; rein lokal (kein PB-Record, kein E-Mail-Trigger)

---

## v0.9.6.2 — 2026-05-18

### Fix: createUser() — verified-Feld via Hook setzen

- **`.pb_hooks/main.pb.js`** (v3.3→v3.4) — Neuer Handler `onRecordAfterCreateSuccess` auf `users`-Collection: setzt `verified=true` serverseitig, da PocketBase das Feld per Collections-API nicht beschreibbar macht
- **`admin.html`** — Fehlerhafte `pbPatch(... verified: true)`-Zeile entfernt; Flow funktioniert jetzt vollständig: Anlegen → Hook verifiziert → Reset-Mail via PB SMTP (Resend-Gateway)

### Deploy erforderlich

```bash
ssh hetzner "curl -o /var/lib/docker/volumes/ad9adhhkygjreidi79i4v5eb_pocketbase-hooks/_data/main.pb.js \
  https://raw.githubusercontent.com/Aniflu/Crewplaner/main/.pb_hooks/main.pb.js \
  && docker restart pocketbase-ad9adhhkygjreidi79i4v5eb"
```

---

## v0.9.6.1 — 2026-05-18

### Versionsnummern + Kleinfix

- **`admin.html`** — Versionsnummer im Header ergänzt (`vX.X.X` neben "Konsole")
- **`CLAUDE.md`** — Regel: Version muss in allen 4 Dateien (index.html, admin.html, CLAUDE.md, README.md) synchron gehalten werden

---

## v0.9.6 — 2026-05-18

### Passwortloses User-Anlegen + Reset-Flow

- **`admin.html`** — Passwortfeld aus "Neuer Benutzer"-Formular entfernt; `createUser()` generiert Zufalls-Passwort und sendet sofort Reset-Link
- **`admin.html`** — ♥ Liebeseinladung-Button direkt im Benutzer-Formular (sendet love_invite über crew_invites-Hook)
- **`admin.html`** — 🔑 Reset-Button pro User in der Benutzerliste
- **`admin.html`** — Superadmin-Delete-Regel: Users Collection → Delete rule = `@request.auth.role = "superadmin"`
- **`admin.html`** — `emailVisibility: true` beim Anlegen → E-Mail-Adresse in der Tabelle sichtbar
- **`login.html`** — Reset-Formular: `?token=` in URL → zeigt "Passwort festlegen"-Form statt Login; `doConfirmReset()` via `confirm-password-reset` API
- **`.pb_hooks/main.pb.js`** (v3.3) — love_invite + staff_invite E-Mail-Typen ergänzt; Resend HTTP API für alle Custom-Mails; PB SMTP (Resend-Gateway smtp.resend.com:587) für System-Mails (Password-Reset)

### Manueller PocketBase-Schritt (einmalig, bereits gesetzt)

- **Settings → Application URL:** `https://aniflu.github.io/Crewplaner/login.html` — steuert Reset-Link-Ziel in PB-E-Mails
- **Settings → Mail (SMTP):** smtp.resend.com:587 mit Resend-API-Key als Passwort

---

## v0.9.5 — 2026-05-18

### Partner-Einladung (♥) + Demo-Plan

- **`admin.html`** — Werkzeuge-Tab: ♥ Liebeseinladung per `crew_invites` + `type=love_invite`
- **`.pb_hooks/main.pb.js`** — love_invite-E-Mail-Template (warmes Onboarding-Design)
- Demo-Plan-Seed für neue Manager

---

## v0.9.4 — 2026-05-17

### Einladungssystem + Öffentlicher View-Link

- **`admin.html`** — Werkzeuge-Tab: Crew-Einladung und -Erinnerung per E-Mail aus der Konsole
- **`view.html`** — Öffentliche Read-only-Ansicht (Token-basiert, kein Login nötig)
- **`js/plans.js`** — `view_token` generieren + in PB speichern; Link in Werkzeuge-Tab anzeigen

---

## v0.9.3 — 2026-05-17

### Security-Fixes & Code-Qualität

- **`admin.html`** — XSS-Fixes: Crew-Namen, E-Mails und Plan-Namen werden jetzt überall mit `esc()` gerendert; onclick-Injection verhindert durch `data-*` Attribute + `dataset.*` Zugriff
- **`.pb_hooks/main.pb.js`** (v2.2→v2.3) — Resend API Key aus Quellcode entfernt; wird jetzt über PocketBase Environment Variable `RESEND_KEY` geladen (`$getEnv('RESEND_KEY')`)
- **`js/bundle.js`** — Mit `dropdown.js` synchronisiert: `proposeCrew()` Aufruf + E-Mail-Badge (`📧`) + `renderTable()` nach Dropdown-Aktionen ergänzt
- **`index.html`** — Script-Ladereihenfolge korrigiert: `pb.js` lädt jetzt vor `dialog.js` (wie in CLAUDE.md dokumentiert)
- **`tourplan.html`** — Alte 83 KB Monolith-Datei gelöscht (nicht mehr referenziert)
- **`js/init.js`** (v29) — Silent catch-Blocks durch `console.warn` ersetzt; Legacy-Migration zeigt Toast bei Fehler
- **`js/plans.js`** (v26) — PocketBase-Sync-Fehler werden jetzt in Console geloggt (war komplett silent)

### Manuelle Schritte erforderlich

1. **Resend API Key in PocketBase setzen:** PB Admin UI → Settings → Environment Variables → `RESEND_KEY` = `re_75ZvXHSz_2eCzUVHziYm6mj3sJwzavv2s`
2. **Alten Key rotieren:** Resend Dashboard → API Keys → alten Key löschen und neuen erstellen, dann in PB erneut setzen
3. **Hook deployen:**
   ```bash
   ssh hetzner "curl -o /var/lib/docker/volumes/ad9adhhkygjreidi79i4v5eb_pocketbase-hooks/_data/main.pb.js https://raw.githubusercontent.com/Aniflu/Crewplaner/main/.pb_hooks/main.pb.js && docker restart pocketbase-ad9adhhkygjreidi79i4v5eb"
   ```

---

## v0.9.2 — 2026-05-17

### Bug-Fixes & Verbesserungen

- **`admin.html`** — Plan-Dropdown war leer: `sort=-created` → `sort=-id` (bekanntes PB-Gotcha, CLAUDE.md dokumentiert)
- **`index.html`** — Button-Label "Konsole öffnen" → "Admin Konsole"; Version v0.9.2
- **`js/init.js`** (v28→v29) — `tourplan_active_plan` aus localStorage konsumieren: ermöglicht direktes Aktivieren eines Plans beim Start von index.html
- **`admin.html`** — Button "→ In Touransicht laden" im Werkzeuge-Tab: schreibt plan_data in localStorage, setzt aktiven Plan und öffnet index.html

---

## v0.9.1 — 2026-05-17

### Neu: Manager-Konsole + Werkzeuge-Tab

- **`admin.html`** — Zugang jetzt für `manager` + `superadmin`; Manager-Rolle sieht Werkzeuge-Tab, Superadmin zusätzlich Benutzer/Rollen/Pläne
- **`admin.html` → Werkzeuge-Tab** (neu) — Plan-Auswahl aus PocketBase, Plan-Infos, Crew verknüpfen inline, Crew benachrichtigen (Einladung/Erinnerung), JSON Export/Import, PDF Export (via pdf.js), Kalender .ics, Logos-Verwaltung
- **`js/plans.js`** (v25→v26) — `plan_data` wird nach dem lokalen Speichern automatisch in PB synchronisiert (silent fail); `confirmRenamePlan` Bug gefixt (falscher `pbPatch`-Aufruf)
- **`js/authService.js`** (v31→v32) — Superadmin-Auto-Redirect entfernt (verursachte Loop bei „Zu meinen Touren"); `btnKonsole` statt `btnCrewLink/btnCrewNotify` in `_showUserBadge`
- **`index.html`** — Sidebar bereinigt: PDF, ICS, Logos, Tagesarten, Crew verknüpfen, Crew benachrichtigen entfernt; `⚙ Konsole öffnen`-Button für Manager/Superadmin hinzugefügt; Version v0.9.1

### Bug-Fixes

- **Redirect-Loop** (authService.js): Superadmin konnte „Zu meinen Touren" nicht nutzen → Auto-Redirect entfernt
- **Pläne-Tab Error** (admin.html): `expand=owner` aus Query entfernt → keine API-Rule-Fehler mehr
- **`confirmRenamePlan`** (plans.js): `pbPatch('plans', pbId, {name})` war falscher API-Aufruf → korrekt: `pbPatch('/api/collections/plans/records/'+pbId, {name})`

### Manuelle PocketBase-Schritte erforderlich

1. **`plans` Collection → `plan_data` Feld** (JSON oder Text, nicht required) — nötig für Werkzeuge-Tab
2. **`plans` Collection → List rule**: `@request.auth.role = "superadmin" || @request.auth.id = owner`
3. **`plans` Collection → View/Update rule**: `@request.auth.id = owner || @request.auth.role = "superadmin"`

---

## v0.9.0 — 2026-05-17

### Neu: Multi-Rollen-System (RBAC)

- **`js/rbac.js`** (neu) — `hasPermission(action)` Helper; O(1) Switch-Statement für alle Berechtigungsprüfungen
- **`js/state.js`** — `USER_ROLE`, `IS_SUPERADMIN`, `IS_MANAGER`, `IS_BOOKER`, `IS_CREW` als neue globale Flags; `IS_ADMIN` bleibt für Backwards-Kompatibilität (`= IS_MANAGER`)
- **`js/authService.js`** — liest `user.role` aus PocketBase; setzt alle Rollen-Flags; Superadmin wird automatisch zu `admin.html` weitergeleitet
- **`login.html`** — `_redirectAfterAuth()` leitet Superadmin zu `admin.html`, alle anderen zu `index.html`
- **`admin.html`** (neu) — Separate Admin-Konsole: Benutzer verwalten (Rolle per Dropdown ändern, entfernen), Rollen-Übersicht mit Permission-Matrix, Pläne-Verwaltung; nur für Superadmin zugänglich
- **`js/render.js`** — Booker-Rolle sieht Zellen read-only als `<span>` (kein Dropdown), `IS_MANAGER` statt `IS_ADMIN`
- **`js/dropdown.js`** + **`js/bundle.js`** — `hasPermission('assignCrew')` statt `IS_ADMIN`
- **`js/crewNotify.js`**, **`js/crewLink.js`**, **`js/userView.js`**, **`js/plans.js`** — alle Permission-Checks auf `hasPermission()` umgestellt

### Rollen

| Rolle | Beschreibung |
|---|---|
| `superadmin` | Admin-Konsole + alle Manager-Rechte |
| `manager` | Volle Tour-Verwaltung (bisheriger Admin) |
| `booker` | Read-only Touransicht |
| `crew` | Nur eigene Slots sehen/bestätigen |

### Manuelle PocketBase-Schritte erforderlich
1. `users` Collection: Feld `role` (select: superadmin/manager/booker/crew, Default: crew) hinzufügen
2. `madmaxmail@web.de` auf `superadmin` setzen
3. API Rule für `users`: updateRule = `@request.auth.role = "superadmin"`

---

## v0.8.5.9 — 2026-05-17

### Neu: Crew-Mitglied Onboarding-Flow

- **`login.html`** — Registrierungsformular hinzugefügt ("Noch kein Konto? Registrieren")
  - Erstes Öffnen der App nach Einladungs-E-Mail zeigt gelben Banner "Du wurdest zu einem Einsatz eingeladen"
  - Crew-Mitglieder können sich selbst ein Pocketbase-Konto anlegen (E-Mail + Passwort)
  - Nach Registrierung: automatischer Login + Weiterleitung zur App
- **`js/authService.js`** — `?action=confirm&aid=...` Parameter werden vor dem Login-Redirect in localStorage gerettet und nach dem Login automatisch verarbeitet

### Bugfix

- **`js/authService.js`** — Query-Parameter gingen beim Redirect zu `login.html` verloren (beide Pfade gefixt: fehlendes Token + abgelaufenes Token)

---

## v0.8.5.8 — 2026-05-17

### Bugfix

- **`js/plans.js`** — `confirmRenamePlan()` synct neuen Plan-Namen jetzt auch in Pocketbase via `pbPatch` (bisher nur localStorage)

---

## v0.8.5.7 — 2026-05-17

### Neu: Absage-Queue Banner

- **`js/crewNotify.js`** — `renderCancellationBanner()`, `flushAllCancellations()`, `clearAllCancellations()` hinzugefügt
- **`index.html`** — Roter floating Banner bei entfernten bestätigten Slots; "ABSAGEN SENDEN" schickt Sammel-Mail pro Crew-Mitglied

---

## v2.1.1 — 2026-05-13

### Bugfix

- **`js/init.js`** — `_savePlanToLS(id)` im Auto-Plan-Ersteller ergänzt.
  Plan-Daten werden jetzt korrekt in localStorage gespeichert.
  Verhindert: Plan verschwindet bei Reload, "Plan nicht gefunden"-Fehler beim Email-Speichern.

---

## v2.1 — 2026-05-09

### Migration: Supabase → Pocketbase

- **`js/pb.js`** (neu) — schlanker Pocketbase REST-Client: `pbGet`, `pbPost`, `pbPatch`, `pbDelete`, `pbList`, `pbFirst`, `pbUpsert`
- **`js/config.js`** — Supabase URL/Key entfernt, `POCKETBASE_URL` hinzugefügt
- **`js/authService.js`** — Supabase Session-Auth durch Pocketbase JWT-Auth ersetzt (`pb_token` + `pb_user` in localStorage)
- **`js/dataService.js`** — alle CRUD-Operationen auf Pocketbase umgestellt, E-Mail-Versand an Pocketbase-Hooks delegiert
- **`login.html`** — Supabase SDK entfernt, Login via `POST /api/collections/users/auth-with-password`
- **`index.html`** — Supabase CDN entfernt, `pb.js` ergänzt
- **`.pb_hooks/main.pb.js`** (neu) — Server-seitige E-Mail-Hooks (proposed, declined, invite, reminder) via Pocketbase Goja-Engine
- **`pocketbase/pb_schema.json`** (neu) — Collections-Schema für Pocketbase-Import

### Sonstiges

- Supabase Edge Function (`supabase/functions/`) wird nicht mehr aktiv genutzt

---

## v2.0 — 2026-04-23

### Neu
- **Ops-Console Redesign** — komplett überarbeitetes UI: Gold-Rail (`#d4a53a`), monochromer Grundton, Archivo Display + JetBrains Mono
- **3 Ansichten** — Tabelle, Blöcke (Karten-Grid), Crew-Timeline als Segmented Control
- **KPI-Strip** — 6 Zellen im Header: Tage · Shows · Reise · Prep · OFF · Offen
- **PDF-Export neu** — 3 Druck-Ansichten (Tabelle / Blöcke / Crew-Timeline), einheitlicher Header mit Gold-Rail, A4 Querformat
- **Bereich → Block** — bestehende Tage nachträglich per Datumsbereich einem Tourblock zuweisen oder umgruppieren
- **blockview.js** — Tourblock-Karten-Ansicht mit Timeline-Streifen
- **crewview.js** — Crew-Timeline-Ansicht (eine Zeile pro Person, Monats-Raster)
- **bundle.js** — Action-Bundle Utilities

### Geändert
- Row-Accent-Bar links je nach Tagesart, Type-Dot vor Typ-Label
- Datum-Darstellung: Weekday-Label in Caps + fette Datumzahl
- Venue-Typo mit Archivo Display
- Stats-Bar unten: flach, monospace
- Sidebar mit Section-Headern in Caps, kompaktere Plan-Liste

---

## v0.9.6 — 2026 (vor Redesign)

- Kalender-Export (.ics) für Google Calendar / Apple Calendar / Outlook
- Multi-Plan-System: beliebig viele Pläne parallel
- Tourblock-Wizard: Datumsbereich mit Tagesart-Auswahl pro Tag
- Custom Tagesarten plan-übergreifend gespeichert
- Logo-System (Planer, Band, Booking) plan-unabhängig
- PDF-Export mit Positions- und Crew-Filter
- Sticky Header + erste 3 Spalten beim Scrollen
- Import / Export als JSON

---

## v0.9.x — Entwicklungsphase

- Initiales Multi-File-Refactoring aus monolithischem `tourplan.html`
- Split in `index.html` + `js/*.js` Module (globaler Scope, kein Bundler)
- localStorage-Persistenz, Plan-Migration von `tourplan_v3`
