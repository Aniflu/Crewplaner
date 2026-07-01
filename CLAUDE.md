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

- Aktuelle Version: **v0.18.2**
- Test (GitHub Pages): https://aniflu.github.io/Crewplaner/
- Frontend (Produktiv): https://crewplanner.nyxlightwork.de
- Pocketbase API: https://api.crewplanner.nyxlightwork.de
- Pocketbase Admin UI: https://api.crewplanner.nyxlightwork.de/_/
- GitHub Repo: https://github.com/Aniflu/Crewplaner

---

## Versionierung

```
v0.18.2 — fix(Admin-„Einladung" öffnete kein Fenster) + feat(Einladung mit allen Terminen): ROOT CAUSE „gar nichts": admin.html bringt EIGENES inline-CSS mit (lädt NICHT styles.css); `.modal-bg{display:none}` war da, aber die Aufdeck-Regel `.modal-bg.open{display:flex}` FEHLTE → `openModal` (setzt nur `.open`) machte KEIN Admin-Modal sichtbar (Einladung/Update/Absage-Vorschau, PDF, Kalender). FIX: `.modal-bg.open{display:flex}` in admin.html ergänzt. FEATURE: neue `sendAdminInvite(crewName)` (ersetzt Invite-Zweig von sendAdminEmail) baut alle eingeplanten Slots der Person (TOUR_DATES×POSITIONS, assignments-Override ?? defaultCrew; confirmed übersprungen), zeigt Vorschau mit Termintabelle, legt beim Senden proposed-Records an (`proposed_by:'bulk'` → Hook unterdrückt per-Slot-Mail, main.pb.js:258) und schickt EINE crew_invites-invite mit `app_url=JSON(slots)`. HOOK v4.7: `type==='invite'` rendert Terminliste, wenn app_url ein JSON-Slot-Array ist (sonst generisch/rückwärtskompatibel). +tests/adminmodal.test.mjs (Guard für die Aufdeck-Regel); 51 grün. admin-app.js?v=4→5. HOOK-DEPLOY (v4.7) via Admin/SSH nötig, sonst Mail ohne Terminliste.
v0.18.1 — fix(Crew-Pool-Button öffnete nichts): der v0.18.0-Button „＋ Bekannte Crew übernehmen" tat nichts. Ursache: `crewImportModal` war mit inline `style="display:none"` gebaut, `openModal` fügt aber nur die Klasse `.open` hinzu — sichtbar wird dadurch NUR ein `.modal-bg` (styles.css: `.modal-bg.open{display:flex}`). → Modal blieb versteckt (Funktion lief, Anzeige nicht). FIX: `crewImportModal` als echtes `.modal-bg`/`.modal-box` (z-index:520 über crewModal) → `openModal/closeModal` greifen. Button umbenannt „＋ Aus Crew-Pool wählen" + Hinweistext (Pool = alle je angelegten Crew-Mitglieder, Anhaken → in diese Tour). Keine Logikänderung (Picker/loadAllKnownCrew/dedupKnownCrew unverändert). app.js?v=24→25. 49 Tests grün. HINWEIS: Sub-Module ohne `?v=` → nach Deploy Hard-Reload nötig.
v0.18.0 — feat(Bekannte Crew aus früheren Touren übernehmen): `crew_members` sind pro Plan (plan_id) → Crew einer alten Tour war mit einem neuen Plan (z.B. „Provinz 2027") nicht verknüpft; man musste jeden Namen einzeln eintippen (addCrew, nur Name, keine E-Mail). NEU: im *Crew & Positionen*-Dialog Button „＋ Bekannte Crew übernehmen" → `openImportCrewModal` (crew.js) lädt via `loadAllKnownCrew` (dataService.js → `pbListAll('crew_members','')` ohne plan_id-Filter, Single-Owner-Setup) eine TOUR-ÜBERGREIFENDE, per `dedupKnownCrew` (pure.js) zusammengeführte Liste (doppelte Namen verschmolzen, Eintrag mit E-Mail bevorzugt, alphabetisch). Bereits im Plan vorhandene Namen werden ausgeblendet. Angehakte → `confirmImportCrew`: `crew.push(name)` + `saveCrewLink(name,email)` (legt crew_members-Record im AKTUELLEN Plan an + setzt crewMeta) → sofort einplan-/einladbar. Modal `crewImportModal` (index.html) mit ALLE/KEINE. `dedupKnownCrew` als reine, testbare Leaf-Funktion (pure.js). +tests/crewimport.test.mjs; 49 grün. app.js?v=23→24.
v0.17.3 — fix(Updates-Bar nur beim Hinzufügen, nicht für bestehende Tage): v0.17.2 füllte die Queue NUR im Moment des Datum-Hinzufügens (`confirmAddDate`). Ein Tag, der vor dem Code / vor Reload hinzugefügt wurde (z.B. 07.07 „VORBEREITUNG"), tauchte NIE in der Queue auf → „Updates"-Button fehlte, obwohl eingeplante, unbestätigte Personen (kursiv/grau) sichtbar waren. FIX: LIVE-Erkennung — `_liveNewSlotsByCrew()` (userView.js) sammelt über `_getNewSlotsForCrew` je Crew alle eingeplanten (getVal), aber noch nicht bestätigten/angefragten Slots (kein aktiver PB-Record). `_updateCrewUpdateBar` zählt diese read-only mit → Button/Badge erscheinen für JEDEN solchen Tag (bestätigte Slots haben Records → kein Flut bestehender Tage). `_openUpdateQueueModal` mergt die Live-Slots fest in die Queue (`_mergeLiveNewSlots`, idempotent) → auswähl-/sendbar inkl. Vorschau. +queue.test.mjs Live-Erkennung; 47 grün. app.js?v=22→23.
v0.17.2 — fix(Folge-Regression v0.17.1) + feat(E-Mail-Vorschau): (1) REGRESSION: Nach „Tag hinzufügen" erschien die Sidebar-„Updates"-Bar nicht mehr. Ursache: `_queueGlobalCrewUpdate(desc, dates)` (userView.js) las die zu queuenden Slots aus `assignmentStatuses` (PB-Cache) — ein FRISCH hinzugefügter Tag hat dort aber keine Records; seine Belegung kommt aus `defaultCrew`/`getVal`. → Queue blieb leer → `_updateCrewUpdateBar` blendete `btnUpdateQueue` aus. FIX: `_queueGlobalCrewUpdate` befüllt jetzt über `getVal(date, pos.id)` (defaultCrew+Overrides) für die übergebenen Tage; Slots speichern zusätzlich `posId`; Eintrag bleibt `informational:true`. (2) SELF-HEAL: `_updateCrewUpdateBar` verwirft `informational`-Slots, deren `getVal(date,posId)` nicht mehr dem gequeueten Namen entspricht — entfernt der Manager nach dem Hinzufügen Namen, sinkt die Anzahl live (läuft bei jedem renderTable). (3) E-MAIL-VORSCHAU: Beim „AUSWAHL SENDEN" poppt pro Person ein Vorschau-Popup (`updatePreviewModal`, An/Betreff/Einleitung/Termin-Tabelle) mit optionalem Freitext (Buttons Abbrechen/Überspringen/Senden); Sendelogik aus `_sendQueueEntries` in Helper `_sendUpdateForEntry(name, entry, customText)` extrahiert (von Vorschau-Pfad + `_sendPendingUpdates` genutzt). `sendUpdateNotice` nimmt 4. Param `customMessage` → `custom_message` an Hook v4.6 (Notiz-Block). app.js?v=21→22. queue.test.mjs an getVal-Verhalten + Self-Heal angepasst; 46 grün.
v0.17.1 — fix(Update-Queue flutet bei Datumsänderung): Beim Hinzufügen von Tagen/Bereichen (confirmAddDate, dates.js) oder Einfügen eines Tourblocks (tbConfirm, tourblock.js) wanderten ALLE bestätigten/angefragten Slots des ganzen Plans in die Update-Queue — nicht nur die neuen. Ursache: `_queueGlobalCrewUpdate(changeDesc)` (userView.js) iterierte über das GESAMTE assignmentStatuses ohne Datums-Filter. Folge: Badge zeigte „8" (= Anzahl PERSONEN, Object.keys(q).length), Queue enthielt aber ~300 Einträge (= Summe aller Slots). FIX: Signatur → `_queueGlobalCrewUpdate(changeDesc, dates)`; nur Slots auf den übergebenen (= tatsächlich neuen) Datumswerten werden gequeued (`if(only && !only.has(dateStr))return`). Aufrufer übergeben jetzt die neuen Tage: dates.js `addedDates`, bundle.js-Spiegel `addedDates`, tourblock.js sammelt `added`. Da neue Tage noch keine Zuweisungen haben → nichts mehr geflutet; echte per-Tag-Änderungen laufen weiter über das date-spezifische `_queueCrewUpdate`. NEU: „QUEUE LEEREN"-Button im Update-Modal (`_clearUpdateQueue`, mit showConfirm) räumt den bereits gefluteten Bestand (liegt auf gültigen Datumswerten → wird von `_updateCrewUpdateBar` NICHT auto-bereinigt). +tests/queue.test.mjs (nur übergebene Datumswerte queuen, leere Liste = nichts); 45 grün. app.js?v=20→21.
v0.17.0 — fix(Sammel, 4 Themen nach längerer Nutzungspause): (1) TAGE-BERECHNUNG zählt jetzt AUSSCHLIESSLICH bestätigte Slots — calcByPers (stats.js) prüft `assignmentStatuses[date][pos].status==='confirmed'` (vom Manager händisch ODER von der Crew bestätigt); nur-platzierte/Standard-Crew/proposed/declined fließen NICHT mehr in `total`, werden als `proposed` separat geführt (Tooltip „X bestätigt · Y angefragt", kleines „+Y" hinter der Zahl). Recalc lief schon bei jedem renderTable() (Änderung + Plan-Open Admin&Crew) — nur die Zählung war falsch. (2) UNBESETZEN leert die Zelle WIRKLICH: „Besetzung aufheben"/„Anfrage zurückziehen" (dropdown.js) setzen den Override jetzt explizit auf '' via setAssign (persistiert) statt clearAssignmentSlot — letzteres fiel auf defaultCrew zurück, sodass eine Standard-Crew-Person sofort wieder erschien. catch macht jetzt loadAssignmentStatuses()-Resync + zeigt err.message (kein stiller Halbzustand mehr, in dem der PB-Record überlebt und nach Reload zurückkommt). (3) UPDATE-BADGE „4 trotz leerem Modal": _updateCrewUpdateBar (userView.js) zählte Personen (Object.keys), das Modal filtert Slots gegen TOUR_DATES; ein Auto-Add fügte proposed-Mitglieder mit leeren slots:[] hinzu → Badge+1, Modal leer. Jetzt: Queue beim Anzeigen bereinigen (nur Slots in TOUR_DATES behalten, Mitglieder ohne gültige Slots raus), Button-Sichtbarkeit an slotCount. (4) PHANTOM-PLÄNE: _createOrFetchPlanId (dataService.js) legte bei activePlanId=null mit Default-Namen 'Tour Plan' leere Plan-Records an → entfernt (nur noch auflösen: pinned→Name→Owner, sonst null, NIE pbPost). ZUSÄTZLICH die echte Quelle der real existierenden Leichen: _savePlanToLS (plans.js) pbPostete bei autoSave im CREW-Browser (lokaler Plan ohne pbId-Mapping) einen Plan owned vom Crew-User → PB-Write jetzt hart auf `IS_MANAGER` gegated (manager|superadmin). Das waren Folgen des v0.14.10-Roleless-Bugs (Wolf/Thomas hatten leere Rolle → IS_MANAGER-Pfad → autoSave). PB-BEREINIGUNG: 6 abhängigkeitsfreie „Tour 2026"-Duplikate gelöscht (5× owned Wolf, 1× Thomas; alle 9 crew_members + alle 357 assignments hingen an AMK, keiner an den Phantomen) — AMK 03fs6r1o8cqeyt2 + Provinz 9z9f5o61goo1nvz unangetastet. TESTS: +stats.test.mjs (confirmed-only), +phantomplan.test.mjs (kein pbPost wenn unauflösbar); 43 grün. app.js?v=19→20, admin-app.js?v=3→4.
v0.16.0 — fix(ECHTE URSACHE für „Wolf sieht keinen Plan"): persistence.js Zeile 72 hatte `getActivePlanId()=id;` — eine Zuweisung an einen Funktionsaufruf-Rückgabewert (ungültige Syntax). V8/Chrome PARST das tolerant durch (node `--check` wirft nichts; Headless-Chrome rendert den Plan voll), aber SpiderMonkey/Firefox wirft beim Parsen `SyntaxError: invalid assignment left-hand side`. Da app.js persistence.js als ES-Modul importiert, riss der Parse-Fehler in Firefox den GANZEN Modulgraphen mit → app.js-Init lief nie → keine window.*-Registrierungen (setView u.a. „is not defined") → leere Tabelle. Deshalb sahen alle Chrome/Safari-Nutzer (Marco) den Plan, Wolf (Firefox) NIE — bestätigt durch Wolfs echte Firefox-Konsole. FIX: `getActivePlanId()=id;` → `setActivePlanId(id);` (Setter existierte schon, plans.js:17) + `setActivePlanId` zum plans.js-Import ergänzt. NEU: tests/syntax.test.mjs (dependency-frei) fängt `name(...) = …` (V8 toleriert / Firefox bricht) — die bestehenden node-Guards sahen das nicht, weil node = V8. app.js?v=18→19. 39 Tests grün. (v0.15.0-Mail-Fix war NICHT die Ursache, bleibt als sinnvolle Härtung.)
v0.15.0 — fix: Crew mit groß/klein gemischter E-Mail sah keinen Plan (leere Tabelle trotz korrekter Daten). Konkret: Wolf (`LivLights@gmx.de`) war der EINZIGE der 9 User mit gemischtschreibung in `users.email` — und der einzige mit dem Problem. Ursache: der Crew-Plan-Lookup (`_getActivePlanId`, dataService.js) filtert `crew_members` per `email = "…"` und PocketBases `=` ist case-sensitiv (SQLite BINARY); `crew_members.email` war klein gespeichert. Der aktuelle Code lowercased die Mail zwar (`CURRENT_USER_EMAIL.toLowerCase()`), aber Wolfs Browser führte das offenbar nicht aus → `email = "LivLights@gmx.de"` ≠ `livlights@gmx.de` → 0 Treffer → planId=null → `loadPlanForCrew` bricht ab → TOUR_DATES leer → App da, Tabelle leer. Verifiziert: mit Wolfs echtem Token (PB `impersonate`) lieferten alle Abfragen serverseitig korrekt (Plan, plan_data, 358 assignments) — Problem war NUR die gemischte Mail. WURZEL: Self-Register (login.html `doRegister`) speicherte die Mail mit `.trim()` ohne `.toLowerCase()`. FIX: (1) login.html normalisiert Mail bei Login + Registrierung auf Kleinschreibung (`.trim().toLowerCase()`); (2) Wolfs bestehender `users.email` per PB-Superuser-Patch auf `livlights@gmx.de` korrigiert. NB: Cache war NICHT die Ursache (Wolf testete mehrere Browser) — entgegen der bisherigen „stale Sub-Modul"-Vermutung.
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

## Aktueller Stand (Stand: 2026-06-17)

### Was funktioniert ✓
- Login/Logout via PocketBase
- Multi-Rollen-System: superadmin/manager → admin.html, crew/booker → index.html
- Manager-Konsole (`admin.html`): Werkzeuge, E-Mail-Log Tab, Benutzer, Rollen, Pläne
- **Manager + Crew laden Plan direkt aus PocketBase** — localStorage optional
- Plan-Transfer admin→index via sessionStorage ("Aktuellen Plan bearbeiten"-Button)
- E-Mail-Log: Hook v4.6 schreibt nach jedem Mailversand in `email_log` Collection
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

### Neu seit v0.14 (Stand 2026-06-17)
- **Mehr-Plan sauber**: jeder Plan schreibt nur in seinen eigenen PB-Record, kein Cross-Write mehr (v0.14.6). 2 aktive Pläne (AMK + Provinz 2027).
- **„Speichern" schreibt wirklich nach PB** mit ehrlichem Erfolg/Fehler-Toast (v0.14.7/v0.14.8). JSON-Export ist eigener Button.
- **Manager bestätigt geplante Crew direkt** im Zellen-Menü — auch ohne Vorab-Anfrage; confirmAssignment legt den Record an (v0.14.9).
- **Crew umbenennen (✏) ohne Dublette**; Entfernen löscht den PB-crew_members-Record mit (v0.14.12).
- **Self-Register** setzt `role:'crew'` + `emailVisibility:true` (v0.14.10); rollenlose User zeigt die Admin-Liste als „— keine Rolle —".
- **Passwort-Reset-Link** repariert (PB-Template → `?token=`); **Logout** läuft inline (geht auch bei hängendem App-Init) (v0.14.11/v0.14.13).
- **Test-Guards** (38 grün, `node tests/run.mjs`): Reachability (tote Buttons/orphans), Import-Guard (fehlende ES6-Imports), Dialog (window.show* gesetzt), Plans (Cross-Write).
- **PB-Schema**: `assignments.proposed_by` muss **text** sein (war nach Wipe relation → „Failed to create record"; gefixt, siehe Gotcha unten).

### Bekannte Einschränkung
- Slots die NUR über `defaultCrew` (nicht explizit in `assignments`) befüllt sind,
  bekommen beim **Einladen**-Klick keinen proposed-Record. Mitigiert: der Manager kann sie
  jetzt direkt über das Zellen-Menü bestätigen (v0.14.9 legt den Record an).
- `crewMeta` schlüsselt nach **Name** → zwei gleichnamige crew_members (z.B. „Marco Hoch" 2×)
  können `getMyCrewName` ambig machen. Aktuell bewusst so (Marco = Admin + GL-Crew).

### PocketBase — Benutzer (Stand 2026-06-17)
Alle 9 registriert, alle `emailVisibility=true`, alle mit Rolle gesetzt.
| E-Mail | Rolle | Anmerkung |
|---|---|---|
| madmaxmail@web.de | superadmin | Owner aller Pläne (id 4lrx6gnh6k8hl2e); macht Manager-Tasks |
| marco@hoch-online.com | crew | Marcos GL-Crew-Testaccount (um Crew-Sicht zu sehen) |
| LivLights@gmx.de | crew | **Wolf Geffenius** (nicht mehr w.greffenius@gmx.de!) |
| fliegendekiwi@live.de | crew | Philine Behnke |
| pascalsmirat@web.de | crew | Pascal Smirat |
| kerrin.gall@outlook.de | crew | Kerrin Gall |
| peter-weist@gmx.de | crew | Peter Weist |
| thomas.haine@gmx.de | crew | Thomas Haine |
| thomasoliver@gmx.de | crew | Oliver Thomas |

> Kein User mit Rolle `manager` aktuell — Manager-Aufgaben laufen über den superadmin (madmaxmail).

### Update-Mail-Flow (v0.9.9.22+)
- Banner "UPDATE-MAILS SENDEN →" erscheint wenn Datum hinzugefügt wird
- Queue enthält confirmed + proposed Crew-Mitglieder
- Beim Senden: neue PB-Records (proposed) werden erstellt, dann Mail nur mit NEUEN Terminen
- Informational-Pfad: `_getNewSlotsForCrew` liefert Slots ohne PB-Record → `bulkProposeCrew` → Mail
- Nicht-Informational-Pfad (Slot-Änderung): `pbFirst` sucht Record → auf proposed setzen → Mail

### E-Mail-Typen (Hook v4.6)
| Typ | Wann | Empfänger |
|---|---|---|
| `invite` | Admin klickt "Einladen" | Crew — "Du bist dabei." |
| `reminder` | Admin klickt "Erinnerung" | Crew — "Noch ausstehend." |
| `update` | Admin klickt "↻ Update" | Crew — "Achtung. Neue Termine." |
| `cancellation` | Admin klickt "Absagen senden" | Crew — "Plan geändert. Einsätze entfernt." |
| UPDATE-Hook | Crew lehnt Slot ab | Admin — "Abgelehnt." |

### PocketBase — aktuell aktive Pläne (Stand 2026-06-17)
- `03fs6r1o8cqeyt2` → **"AMK Tour 2026_V3"** (59 Tage 23.06.–29.09.2026, 9 crew_members nach Dedup, 356 assignments). Owner madmaxmail.
- `9z9f5o61goo1nvz` → **"Provinz 2027"** (27 Tage Mai–Aug 2027, noch keine Crew). Owner madmaxmail.
- localStorage-Mapping: lokale Plan-ID → PB-ID via `tourplan_pb_<localId>`; AMK lokal = `pbplan_03fs6r1o8cqeyt2`, Provinz lokal = `pmqc7fre5`.
- ⚠️ Bei „Plan weg / falscher Plan" → an Mehr-Plan-Sync denken (v0.14.6), nicht an Caching. assignments hängen an `plan_id` — Record-IDs nie umbenennen/löschen.

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
- **51 Tests grün** (Stand v0.18.2). Test-Dateien (`tests/*.test.mjs`, auto-discovered von `run.mjs`):
  - `pure.test.mjs` — reine Logik ohne Stubs (Datums-Bereiche TZ-sicher, Namens-Helfer).
  - `crewimport.test.mjs` — `dedupKnownCrew` führt tour-übergreifende Crew zusammen (doppelte Namen, E-Mail-Bevorzugung, Sortierung).
  - `logic.test.mjs` + `flows.test.mjs` + `dataservice.test.mjs` — laden den echten Modulgraphen via `tests/_graph.mjs` (Stubs in `tests/_setup.mjs`); decken getVal/isPending/sortInsert, Crew-CRUD, Slot-Diffing, getMyCrewName, Plan-Roundtrip, confirm/decline (fetch-gemockt) ab.
  - **Guards** (fangen ganze Fehlerklassen statisch):
    - `reachability.test.mjs` — tote Buttons (Funktion ohne onclick) + onclick→undefinierte Funktion.
    - `imports.test.mjs` — Modul nutzt Fremd-Export ohne Import (ES6-„Bounce").
    - `dialog.test.mjs` — `window.showConfirm/showAlert/showPrompt` werden nach Import gesetzt.
    - `plans.test.mjs` — `_savePlanToLS` patcht nie einen fremden Record (Cross-Write).
    - `stats.test.mjs` — `calcByPers` zählt nur `confirmed` in `total` (proposed/declined separat/nicht).
    - `phantomplan.test.mjs` — `_getActivePlanId` legt nie einen Plan an, wenn keiner auflösbar ist (kein Phantom).
    - `queue.test.mjs` — `_queueGlobalCrewUpdate(desc, dates)` befüllt die Queue aus `getVal` nur für die übergebenen (neuen) Tage; `_updateCrewUpdateBar` Self-Heal entfernt nicht-mehr-eingeplante Slots.
    - `adminmodal.test.mjs` — admin.html hat die Aufdeck-Regel `.modal-bg.open{display:flex}` (sonst öffnet KEIN Admin-Modal; eigenes inline-CSS, kein styles.css).
- **Nicht** abgedeckt (braucht echtes PocketBase): Login, E-Mail-Versand, echte PB-Schreibpfade.
- Mini-Framework: `tests/_assert.mjs` (`test`/`eq`/`deepEq`/`ok`, Exit-Code 1). `js/userView.test.js` ist Jest-Stil-Altlast (kein Runner).
- **Reine, testbare Logik gehört nach `js/pure.js`** (import-freies Leaf), nicht in `utils.js`.

**Cache-Bust-Stand:** `index.html` lädt `js/app.js?v=25`, `admin.html` lädt `js/admin-app.js?v=5`. Sub-Module laden OHNE `?v=` → bei „Crew/Wolf sieht nichts" zuerst Hard-Reload/Cache-Clear (stale Sub-Modul bricht den Graphen). Per-Modul-Versionsnummern werden nicht mehr gepflegt.

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

Aktuell deployte Hook-Version: **v4.6** (Repo: **v4.7** — Deploy via Admin/SSH ausstehend)
- v4.1: email_log-Write nach jedem Mailversand
- v4.2: assignments CREATE-Hook entfernt (keine per-Slot-Emails mehr)
- v4.3: Absage-Email umformuliert ("Plan geändert")
- v4.4: Short-URL via is.gd bei plans view_token Update (serverseitig, kein CORS-Problem)
- v4.5: (a) Datum aus ISO-String formatiert statt new Date() → keine TZ-Verschiebung bei nicht-UTC-Container. (b) Anfrage-Mail-Guard erweitert: proposed_by `'bulk'` ODER `'update'` → keine doppelte per-Slot-Anfrage-Mail mehr bei Einladen/Update (die senden eigene konsolidierte Mail).
- v4.6: Optionaler Admin-Freitext — Feld `crew_invites.custom_message` wird als hervorgehobener Notiz-Block in invite/reminder/update/cancellation gerendert (`noteBlock`). Leer/fehlend = unverändert. **VORAUSSETZUNG:** Feld `custom_message` (text, optional) muss auf der crew_invites-Collection existieren (PB Admin → crew_invites → New field).
- v4.7: `type==='invite'` rendert eine Terminliste (DATUM/POSITION-Tabelle), wenn `app_url` ein JSON-Slot-Array ist (`sendAdminInvite` schickt das). Ist `app_url` eine reine URL → unverändert generisch (rückwärtskompatibel). Ermöglicht EINE Einladungsmail mit allen Terminen der Person.
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
