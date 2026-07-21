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

- Aktuelle Version: **v0.30.0**
- Test (GitHub Pages): https://aniflu.github.io/Crewplaner/
- Frontend (Produktiv): https://crewplanner.nyxlightwork.de
- Pocketbase API: https://api.crewplanner.nyxlightwork.de
- Pocketbase Admin UI: https://api.crewplanner.nyxlightwork.de/_/
- GitHub Repo: https://github.com/Aniflu/Crewplaner

---

## Versionierung

```
v0.30.0 — feat(Vereinheitlichte Änderungs-Mail + Aktivitäts-Log): User-Wunsch nach dem v0.29.2/3-Verlauf — „Update" heißt: JEDE Änderung an bestätigten Terminen, egal ob ein Tag HINZUKOMMT oder WEGFÄLLT, gehört in EINE „Es gab Änderungen"-Mail mit dynamischem Inhalt (neue Termine: „bestätige, dass du Zeit hast"; entfernte: „bestätige, dass du die Änderung gesehen hast"). Design-Spec docs/superpowers/specs/2026-07-21-unified-change-mail-design.md (Ansatz A, approved), Plan docs/superpowers/plans/2026-07-21-unified-change-mail.md, Umsetzung via Subagent-Driven-Development (pro Task frischer Implementer + Spec-Review + Quality-Review). KERNENTSCHEIDUNG „Soft-Cancel": Beim Entfernen einer bestätigten/angefragten Person wird der assignments-Record NICHT mehr gelöscht, sondern auf `status:'cancelled'` gepatcht — nur so hat der „ÄNDERUNGEN GESEHEN ✓"-Mail-Button ein Ziel (aid). Quittung → `cancel_acked`. Beide Werte werden aus ALLEN Zellen-Ladepfaden gefiltert (loadAssignmentStatuses + view-app.js) → Tabelle zeigt sie nie; Wiederbesetzen desselben Slots überschreibt den cancelled-Record via bestehendem pbUpsert (deshalb Guard: Quittung patcht NUR noch-cancelled-Records + eigene E-Mail). UMSETZUNG: (1) dataService: `softCancelAssignment` (warn+rethrow-Muster), `ackCancelledAssignments(aids)→n` (Status+Email-Guard, leere-Email-Guard), `logActivity(action,{...})` (fire-and-forget POST auf NEUE Collection activity_log — Fehler brechen nie den Hauptflow). (2) userView-Queue: Slots tragen `kind:'new'|'removed'` (fehlend=legacy=new); NEU `_queueRemovedSlot(...aid)`; Self-Heal-Ausnahme für removed (die sind per Definition nicht mehr in getVal — OHNE die Ausnahme würde der Self-Heal sie sofort wieder wegheilen!); Modal zeigt ➕ neu/➖ entfernt-Tags. (3) dropdown.js: `_notifyIfWasActive`→async `_removeAssignment` in allen 4 Entfernen-/Ersetzen-Pfaden (confirmed/proposed→Soft-Cancel+Queue; pencilled/declined→hartes Löschen wie bisher, die brauchen keine Absage-Info). (4) Das rote Absage-Banner unten rechts (v0.29.2) ist ERSETZT und entfernt (index.html+app.js+crewNotify.js; das manuelle Konsolen-„Absage"-Werkzeug v0.29.3 bleibt als Nachtrag-Weg). (5) `_sendUpdateForEntry` trennt removed/normal; removed gehen mit {kind,aid} in die Mail und werden NICHT auf proposed gepatcht; WICHTIGER Guard `&& normal.length` beim Fallback — ein rein-entfernter Eintrag darf nicht versehentlich den ganzen Plan anfragen. (6) HOOK v4.10 (Goja: nur var, kein Template-Literal, Helfer im Handler): `type==='update'` rendert „Es gab Änderungen." mit ➕-Abschnitt (TERMINE BESTÄTIGEN→App) und ➖-Abschnitt mit Button `?action=ackcancel&aids=id1,id2` (nur wenn aids vorhanden); rückwärtskompatibel (Slots ohne kind=neu). (7) authService `_handleEmailAction`: neuer `ackcancel`-Zweig (im try, differenzierter Toast, Resync) + logActivity bei Mail-confirm/decline; dataService confirm/decline loggen In-App-Reaktionen NUR bei `IS_CREW && !IS_MANAGER` (Manager-Klicks sind keine Crew-Reaktion — Mail-Links loggen immer, da per crew_email-Guard nur die Person selbst klicken kann). (8) NEUE PB-Collection **activity_log** { plan_id, crew_name, crew_email, action, date, pos_label, ts } — 2026-07-21 per Superuser live angelegt + mit Test-Record verifiziert; `ts` CLIENT-gesetzt (Collections haben kein created-Feld, sort=-id-Gotcha); Rules auth!="" (delete superadmin), ⚠️ Redeploy/Reimport-Caveat wie üblich. (9) admin.html: neuer „Aktivität"-Tab (renderActivityLog, perPage=200 sort=-id) + Login-Popup checkNewActivity (Zeilen neuer als localStorage `tourplan_activity_last_seen`; Timestamp wird VOR dem Early-Return gesetzt → Popup zeigt dieselben Zeilen nie doppelt); alle dynamischen Werte esc()-escaped. TESTS: +3 (softCancel patcht statt löscht + Cache-Leerung; ack nur cancelled + activity_log-POST; removed-Slots überleben Self-Heal) → 108 grün (TZ UTC+Berlin). VERIFIZIERT echt im Browser (echtes state/dropdown/dataService, fetch-Mock): „— Nicht besetzt" bei bestätigter Person → PATCH status:cancelled (kein DELETE) + Queue-Eintrag kind:removed mit aid. app.js?v=42→43, admin-app.js?v=13→14. ROLLOUT: Hook v4.10 muss vom Admin deployt werden (bis dahin kommt die Update-Mail im alten Format OHNE ➖-Abschnitt/GESEHEN-Button — App-Seite funktioniert unabhängig); activity_log-Collection ist schon live.
v0.29.3 — feat(Absage-Dialog: manuellen Termin nachtragen — für schon entfernte Zuweisungen): User-Folgereport nach v0.29.2: „Aber ich habe das VOR deinem Fix gelöscht — du musst das für diese Situation jetzt anders lösen." Berechtigt: v0.29.2 fixt nur den GEHENDEN Fall (Aktion läuft mit dem korrigierten Code ab jetzt richtig) — für eine Aktion, die VOR dem Fix passiert ist, existiert in PocketBase längst kein Status-Record mehr, an dem irgendeine Automatik ansetzen könnte. WEITERE DIAGNOSE deckte auf: BEIDE Absage-Wege der App (die dropdown.js-Queue aus v0.29.2 UND das Admin-Konsolen-Tool `openAdminCancellation`, admin.html) hängen strukturell davon ab, dass die Zuweisung noch mit `status='confirmed'/'proposed'` in `_wrkAssignmentStatuses` existiert — `openAdminCancellation` brach bisher sogar mit `if(!slots.length){adminToast('Keine Einsätze zum Absagen');return;}` sofort ab, wenn nichts mehr aktiv war. Damit gab es AKTUELL KEINEN Weg, für eine bereits (auch schon vor v0.29.2) entfernte Zuweisung nachträglich eine Absage-Mail zu verschicken — nicht nur für diesen einen Fall, sondern strukturell für jede zukünftige ähnliche Situation. FIX (admin.html, „Crew benachrichtigen" → „Absage"): `openAdminCancellation` bricht nicht mehr ab, wenn keine aktiven Slots gefunden werden, sondern zeigt einen Hinweis + ein manuelles Eingabeformular (Datum + Positions-/Hinweis-Text) im selben Absage-Dialog. Neue Funktion `cxlAddManual()` fügt eine Checkbox-Zeile mit synthetischer `pos_id` (`manual_mN`) hinzu, exakt im selben Format wie die automatisch erkannten Zeilen — `cancelSelectNext()` liest weiterhin generisch ALLE Checkboxen in `#cancelSelectBody` aus (keine Änderung dort nötig); die anschließende PB-Löschung pro Slot ist bereits tolerant gegenüber „nichts gefunden" (try/catch, No-Op), der Mailversand läuft unverändert über `crew_invites` type:'cancellation'. VERIFIZIERT mit dem ECHTEN, aus admin.html extrahierten Code (kein Nachbau) in Headless-Chrome: Person ohne aktive Zuweisung → Absage-Dialog öffnet trotzdem mit Hinweis, manueller Eintrag (Datum+Position) erzeugt eine Checkbox-Zeile, `cancelSelectNext()` übergibt sie korrekt an die E-Mail-Vorschau. 105 Tests grün (kein Testpfad für admin.html-Inline-JS berührt). Kein Hook/Schema-Schritt.
v0.29.2 — fix(Crew aus einem Tag entfernen löste NIE eine Absage-Benachrichtigung aus): User-Report: „Ich habe in AMK 2026 Crew aus Tagen mit „Nicht besetzt" gelöscht und erwartet, dass ich Updates an die Crew rausschicken kann, aber ich bekomme keine Updates zum Schicken." SYSTEMATISCHES DEBUGGING (Root-Cause vor Fix, wie in CLAUDE.md gefordert) deckte ZWEI zusammenhängende Bugs auf: (1) HAUPTURSACHE (genau der User-Fall): „— Nicht besetzt" läuft über `_applyState('')` (dropdown.js) — die Funktion löscht zwar den PB-Status-Record eines bestätigten/angefragten Slots (`cancelProposal`), ruft aber NIE `_storePendingCancellation` auf, um eine Absage in die Queue zu legen. Dasselbe galt für „↩ Standard: X" (eigener Code-Pfad, dieselbe Lücke) und für das Umbesetzen auf eine andere Person. Der Manager hatte für DREI von fünf Entfernen-/Ersetzen-Wegen im Zellen-Menü keine Möglichkeit, die Crew zu informieren. (2) LATENTER BUG (bei den ANDEREN zwei Wegen, „✕ Anfrage zurückziehen"/„✕ Besetzung aufheben"): dort WURDE `_storePendingCancellation(...)` zwar aufgerufen — aber die Funktion ist in `crewNotify.js` weder `export`iert noch in `dropdown.js` importiert → `ReferenceError`, vom umgebenden try/catch verschluckt (PB-Record wurde trotzdem gelöscht, nur die Absage-Notiz ging verloren). Das projekteigene Import-Guard (`tests/imports.test.mjs`) konnte das NICHT fangen, weil es nur EXPORTIERTE Namen prüft — eine nicht-exportierte private Funktion ist für den Guard unsichtbar. FIX: (a) `_storePendingCancellation` in crewNotify.js exportiert + in dropdown.js importiert. (b) Neuer zentraler Helfer `_notifyIfWasActive()` in `openCrewDD` (dropdown.js) — prüft `si.status==='confirmed'||'proposed'` (pencilled/declined brauchen keine Absage: pencilled wusste nichts, declined weiß schon Bescheid) und legt bei Treffer die Absage-Notiz an; aufgerufen aus `_applyState`, „↩ Standard" UND den beiden vorhandenen (jetzt korrekt importierten) Entfernen-Buttons — einheitlich statt dreifach dupliziert/inkonsistent. NEBENEFFEKT: das bereits vorhandene, aber nie befüllte Absage-Banner (`#cancellation-banner`, unten rechts, „N Absage(n) ausstehend" → „ABSAGEN SENDEN" → `flushAllCancellations`→`sendCancellationNotice`) funktioniert jetzt zum ersten Mal wie vorgesehen. VERIFIZIERT mit ECHT AUSGEFÜHRTEM Code in echtem Headless-Chrome (state.js+dropdown.js+crewNotify.js, kein Mock): bestätigter Slot → Klick „— Nicht besetzt" im echten gerenderten Menü → `tourplan_pending_cancellations` in localStorage enthält danach korrekt den Eintrag für Person+Datum+Position. 105 Tests weiterhin grün (Import-Guard deckt die Re-Regression jetzt ab, da die Funktion nun ein echter Export ist). Kein Hook/Schema.
v0.29.1 — fix(v0.29.0-Nachfix: Status-Icon-Span erschien als Roh-Text in Manager/Booker-Ansicht): User meldete per Screenshot „die Admin-Ansicht der Zellen ist kaputt" — Zellen zeigten wörtlich `<span style="font-size:1.4em;...">` als sichtbaren Text statt das Icon zu rendern. URSACHE: render.js baute die neuen Status-Icons (✓/⏳/✎/✗, v0.29.0) als HTML-`<span>` DIREKT in die `display`-Variable — die aber an mehreren Ausgabestellen (IS_MANAGER, IS_BOOKER, disabled-Fallback) durch `esc()` läuft (nötig, weil dort auch rohe Crew-Namen escaped werden müssen, v0.23.3-XSS-Härtung). `esc()` maskierte das `<span>`-Tag zu sichtbarem Text statt es zu rendern — der Fehler betraf nur die Icon-Härtung von v0.29.0, nicht ältere Zellen. FIX: Icon-HTML jetzt in eigener Variable `icHtml` (vertrauenswürdig, NIE von uns escaped, da nie aus Nutzereingaben) getrennt von `display` (bleibt reiner Name-Text, wie gehabt an jeder Stelle mit `esc()` behandelt); alle vier Ausgabestellen hängen `icHtml` unescaped voran. VERIFIZIERT mit echtem, im Browser AUSGEFÜHRTEM render.js (nicht nur einer Mockup-Seite wie beim ursprünglichen v0.29.0-Check) — Manager- UND Booker-Zweig geprüft: Icon rendert als echtes `<span>`-Element (font-size 14px = 1.4×), kein Roh-Tag-Text mehr sichtbar. 105 Tests weiterhin grün. Lehre: bei HTML-generierendem Code künftig mit ECHT AUSGEFÜHRTEM Code verifizieren, nicht nur mit einer separat handgebauten CSS-Mockup-Seite (die die tatsächliche esc()-Verkettung nicht abbildet).
v0.29.0 — feat(Dritter Zell-Status „Vorgemerkt" + Farb-/Icon-Konsistenz-Fix): User-Wunsch — für Termine weit in der Zukunft (z.B. 2027) soll der Manager Personen schon GROB vorplanen können, OHNE sie offiziell anzufragen (kein Mailversand). Bisher gab es nur confirmed(✓)/proposed(⏳)/declined(✗). RECHERCHE VORAB (2 parallele Explore-Agents): (a) Der PB-Hook (main.pb.js) prüft Mailversand exakt string-spezifisch auf `status==='proposed'`/`'declined'` → ein neuer Wert `pencilled` triggert AUTOMATISCH keine Mail. (b) `confirmedIcsRows` (pure.js) + `calcByPers` (stats.js) filtern strikt auf `status==='confirmed'` → `pencilled` fällt automatisch aus Kalender-Export UND Tage-Zählung raus (kein Code nötig). (c) FUND: render.js färbte Status-Icons bis dato HARTCODIERT (`#e8c84a`/`#4ae8a0`/`#e84a4a`) statt über die seit v0.28.0 existierenden theme.css-Tokens — „angefragt" nutzte dabei noch das ALTE Gold, Verstoß gegen die Rebrand-Regel „Gold nur Logo/HEUTE". User entschied: mitfixen. VORSCHAU ZUERST (User-Bedingung, wie beim Rebrand): interaktives Artifact mit 3 Icon/Farb-Kandidaten an der echten Tabelle (Hell+Dunkel) — dabei ein technischer Fund: ⏳/📌 rendern (macOS) als FESTE Emoji-Glyphen (nicht per CSS färbbar, Pin sogar fix ROT → Kollision mit „abgesagt"!), während ✓/✗/✎/◆/◌ als echte, färbbare Textzeichen rendern. User wählte **✎ Bleistift + Violett**, Wunsch „Symbole etwas größer". UMSETZUNG: (1) NEU in theme.css: `--pencilled` (hell `#7A5FB3` / dunkel `#A98DE0`) + `--{show,warn,pencilled}-wash`/`-wash-2` (analog zum bestehenden `--accent-wash`-Muster) in allen 4 Theme-Scopes. (2) render.js: neuer `_statIc(ch)`-Helper (`font-size:1.4em`) für alle 4 Status-Icons (✓/⏳/✎/✗) — sowohl im Haupt-Rendering-Zweig als auch im „Crew sieht fremden Slot"-Zweig (der bisher GAR keine pencilled-Unterscheidung hatte, fiel in den proposed-Auffangzweig mit alter Gold-Farbe); alle 4 Status jetzt auf Tokens statt Hex, „angefragt" nutzt `var(--accent)` (deckungsgleich mit der Legende, die das schon vorher tat). (3) dataService.js: `pencilInAssignment(date,posId,crewName,crewEmail)` (status:'pencilled', pbUpsert, kein Mail-Aufruf) + `promotePencilledToProposed(date,posId)` („Jetzt anfragen" — patcht NUR den Status, sendet bewusst KEINE eigene Mail, Slot wird danach von der bestehenden Einladen/Update-Sammelfunktion wie jeder andere proposed-Slot erfasst — kein doppelter Mail-Pfad). (4) utils.js: `isPencilled(si)` — bewusst NICHT Teil von `isPending` (kein Warten auf Crew-Antwort, reiner Manager-Platzhalter). (5) dropdown.js (openCrewDD): neuer Menüpunkt „✎ Vorläufig vormerken" (wenn geplant, aber noch kein Status-Record); bei pencilled: „→ Jetzt anfragen" + „✕ Vormerkung zurückziehen" (cancelProposal wiederverwendet, generischer Delete); bestehendes „✕ Besetzung aufheben" um `!isPencilled(si)` ergänzt (sonst zwei Entfernen-Buttons gleichzeitig). (6) Legende (index.html): aus der `crew-only`-Sidebar-Sektion gelöst (User-Entscheidung: für Manager UND Crew sichtbar), vierter Punkt „✎ vorgemerkt" ergänzt, alle Punkte mit Icon-Präfix. +tests/logic.test.mjs (isPencilled-Guard, NICHT in isPending), +tests/stats.test.mjs (pencilled zählt nicht in total), +tests/pure.test.mjs (pencilled fällt aus ICS-Export). 105 grün. VERIFIZIERT headless (echte theme.css+styles.css, Hell+Dunkel): alle 4 Status-Icons korrekt gefärbt+größer, Legende mit 4 Punkten. NEBENFUND beim PB-Schema-Check (User bat mich direkt, es umzusetzen): `assignments.status` ist LIVE ein **Text**-Feld, KEIN Select (entgegen der bisherigen Doku-Annahme in docs/database-schema.md, dort korrigiert) → **keine PocketBase-Schema-Änderung nötig**, `pencilled` funktioniert sofort als freier Text-Wert. app.js?v=41→42. Kein Hook-Code-Änderung nötig (bestehende proposed/declined-Trigger reichen).
v0.28.1 — fix(Helle Ansicht: „zu weiß + hässliches Braun" → „Sage"): User mochte das v0.28.0-Hell-Theme nicht. DIAGNOSE (theme.css + styles.css): (1) „zu weiß" = `--panel`/`--panel2` waren reines `#FFFFFF` → Header, KPI-Strip, Tabellenkopf, Sidebar, Modals alle strahlend weiß, Grund `--bg:#F1EFE9` nur minimal abgesetzt → keine Struktur. (2) „Braun" = `--bg:#F1EFE9` ist ein WARMES Creme (Gelb/Rot-Stich); darauf lagen die fixen Zeilen-Tönungen (styles.css `.row-prep{--row-bg:rgba(232,154,74,.03)}` = Orange) + prep-Textfarbe `--prep:#c07a2e`. AMK 2027 = fast nur prep-Tage → Orange-auf-Creme = Braun-Eindruck. VORGEHEN: 2 farbige Hell-Alternativen als interaktives Artifact gezeigt (A „Cool Slate" kühles Blaugrau, B „Sage" Salbeigrün-Grau) — User wählte **B · Sage**. UMSETZUNG (NUR Hell, Dunkel byte-identisch): (a) theme.css Hell-Blöcke (`:root`-Default + `:root[data-theme="light"]`) auf Sage: `--bg:#E7ECE4 --panel:#FCFDFB --panel2:#FFFFFF --rule:#D5DCCD --rule-2:#C7D0BD --ink-2:#3B4A40 --muted:#5C6A5E` (`--ink`/`--accent` bleiben Navy #10172A), Status `--show:#2E8B57 --reise:#3B6FB0 --prep:#A96C34`. Grund getönt + Panels heller → heben sich ab (nicht mehr „alles weiß"). (b) Zeilen-Tönungen tokenisiert: neue `--row-{show,reise,prep}-bg/-hover` je Theme in theme.css (DUNKEL = die bisherigen rgba-Werte, unverändert; HELL = entschärft/kühler, damit prep nicht mehr braun auf dem Grund wirkt); styles.css `.row-*` (277-279) nutzt jetzt diese Tokens statt hardcodierter rgba. VERIFIZIERT headless (echte theme.css+styles.css an Tourtabelle): Hell = ruhiges Salbei, saubere prep-Zeilen, HEUTE-Gold unverändert; Dunkel = optisch identisch zu v0.28.0. 102 grün. theme.css?v=1→2, styles.css?v=24→25. Kein Hook/Schema, keine Logik/Layout-Änderung.
v0.28.0 — feat(Rebrand „Crew Pass" + Hell/Dunkel-Umschalter, NYX-Lightwork-CI): kompletter Marken-/Design-Umbau nach Konzept 1d („Crew Pass", übergebener Design-Brief), konsistent zur Schwester-App CallBoard/Bauzeitenplan. WUNSCH DES USERS: neues Logo/Farben/Schriften, BEIDE Themes (hell „Paper" + dunkel „Navy") mit Umschalter wie bei CallBoard, Gold pragmatisch (nur Logo + „HEUTE"-Strich), Geist-Schrift, ALLE vier Oberflächen. VORSCHAU ZUERST (User-Bedingung): interaktives Artifact gebaut + freigegeben, bevor eine Zeile App-Code geändert wurde. UMSETZUNG: (1) NEU `theme.css` — EINE zentrale Token-Ebene (behebt die bisherige 4-Welten-Fragmentierung): `:root`=hell/Paper Default, `:root[data-theme="dark"]`=Navy, `@media(prefers-color-scheme:dark) :root:where(:not([data-theme="light"]))`=OS-Vorgabe; Tokens `--bg/--panel/--panel2/--rule/--rule-2/--ink/--ink-2/--muted/--accent/--on-accent/--accent-wash(-2)/--ink-wash`, Status `--show/--reise/--prep/--off/--warn` (hell auf Kontrast justiert), `--gold:#f7c948` (NUR Logo+HEUTE), Fonts `--sans:'Geist'`/`--mono:'JetBrains Mono'` via @font-face (selbstgehostet in `assets/fonts/`, 7 woff2 aus dem Schwester-Repo), Kompat-Aliase `--rule-soft/--muted-dim/--display` + `.theme-toggle`/`.cp-mark`. Werte 1:1 aus dem Brief. (2) UMSCHALTER: FOUC-Inline-Script im `<head>` ALLER 4 Seiten (`cp_mode` aus localStorage → `data-theme` am `<html>`, VOR dem CSS, kein Aufblitzen); `#themeToggle`-Knopf (☀/☾, zeigt das Ziel) im Header jeder Seite; Handler in app.js (`window.toggleTheme`) + view-app.js + inline in login/admin. (3) LOGO: „Crew Pass"-Hexagon (Inline-SVG, Outlines `currentColor` → invertiert je Theme, Kopf-Kreis fest gold) im Header/Login/Konsole/View; `favicon.svg` (Navy+Gold) auf allen 4 Seiten. „Tour/Crew"→„Crewplanner". (4) ENT-GOLDEN: styles.css + alle Inline-Styles (index/admin/login/view) von hartcodierten Hex auf Tokens umgezogen (~40 Gold- + zig bg/border/text-Stellen); dekoratives Gold (Header-Rail, aktive Tour, Buttons, Aktions-Banner) → `var(--accent)` (Navy hell/Weiß dunkel); Gold BLEIBT nur im Logo + „HEUTE"-Zeile (`--gold`). Header-Gold-Balken entfällt (Brief: „nur Haarlinie"). Status-Farben bleiben bedeutungstragend. (5) SCHRIFT: Google-Fonts-Links (IBM Plex Mono/Bebas Neue/Archivo) raus → Geist (UI/Titel) + JetBrains Mono (Labels/Meta) selbstgehostet. +tests/theme.test.mjs (Guard: theme.css/favicon existieren, Light+Dark+OS-Scope, alle 4 Seiten haben FOUC-Script/theme.css-Link/Favicon/#themeToggle; KEIN #e8c84a/#d4a53a mehr). 102 grün. VERIFIZIERT headless (Chrome, file://): theme.css schaltet Paper↔Navy korrekt; Login, Tourtabelle (Header/KPI/Status/HEUTE-Gold) und Konsole je in HELL und DUNKEL geprüft — echte Geist/JetBrains-Fonts, Logo mit goldenem Kopf, kein Gold sonst. app.js?v=40→41, view-app.js?v=2→3, styles.css?v=23→24, NEU theme.css?v=1. KEIN Hook/Schema. NB: Die per-Tour hochgeladenen Kunden-Logos (booking/band/planer) bleiben unangetastet — das ist ein Feature, keine App-Marke.
v0.27.2 — fix(Öffentlicher Booker-Link zeigte keine Besetzung — „leer, ohne Termine"): User meldete, der öffentliche Link für „AMK 2027" sei leer. DIAGNOSE (PB-Superuser, read-only): der plans-Record x1ewcohg4p7uued hat plan_data (33 tourDates, 6 Positionen, defaultCrew voll besetzt) UND einen view_token — Daten+Zugriff waren korrekt (unauth-Fetch via view_token lieferte 33 Termine). Headless-Chrome-Render des LIVE-Links zeigte: Datumszeilen da, aber ALLE Positionszellen `—` und der Kopf die DEFAULT-Positionen statt der geplanten. Gegenprobe AMK 2026 (03fs6r1o8cqeyt2): identisch kaputt → KEIN AMK-2027-Spezifikum, sondern genereller Bug in `view.html`. URSACHE: `view-app.js` befüllte den Render-State via `window.crew/POSITIONS/assignments/defaultCrew = …`. Aber render.js + utils.js (`getVal`) lesen die ES-MODUL-BINDINGS aus state.js, NICHT `window.*` → die window-Zuweisungen erreichten die Modul-Variablen nie (blieben leer/Default). Nur `TOUR_DATES` wurde per `.splice()` in-place mutiert → deshalb rendern die Datumszeilen, während defaultCrew/assignments/POSITIONS/crew leer bleiben. AMK 2027 fiel extra auf, weil dort plan_data.assignments leer ist und ALLES aus defaultCrew käme (das nie ankam). FIX: `view-app.js` ruft jetzt die state.js-Setter `setCrew/setPositions/setTourDates/loadAssignmentsData/setDefaultCrew/loadStatusesData` statt window.*-Zuweisungen; assignmentStatuses wird als lokales Objekt gebaut und via `loadStatusesData` gesetzt. VERIFIZIERT (headless, lokaler Server mit echten AMK-2027-plan_data, kein PB/CORS): Kopf = echte Positionen (GL/System/Licht 1–3/Follow Me), Zellen = echte Namen (Marco Hoch/Oliver Thomas/Philine Behnke/Peter Weist/Wolf Geffenius/Pascal Smirat) statt `—`. +tests/viewapp.test.mjs (Guard: view-app.js nutzt die Setter, KEINE window.*-Daten-Zuweisung). NEBENBEFUND: der Fix deckte einen latenten False-Positive im Import-Guard auf — `init.js` nutzt `defaultCrew` nur als Objekt-Key im Demo-Plan (`defaultCrew:{…}`), was der Guard fälschlich als „fehlender Import" wertete (vorher durch view-app.js' `window.defaultCrew=` als window-Global maskiert). tests/imports.test.mjs neutralisiert jetzt Objekt-Property-Keys (`{name:…}`/`,name:…`) vor der Nutzungs-Suche. 95 grün. view-app.js?v=1→2 (view.html). KEIN Hook/Schema, KEIN app.js-Bump (index.html unberührt an der Render-Kette).
v0.27.1 — fix(Kalender-Abo NUR für die aktuelle Tour, nicht alle): Folgekorrektur zu v0.27.0 — der Feed aggregierte die Termine einer Person über ALLE ihre Touren (Peter Weist: AMK 2026 + 2027 in EINEM Kalender). User-Wunsch: ein Abo = nur die Termine der aktuell geöffneten Tour. UMSETZUNG: (1) HOOK v4.9.2: Route `/ics/{token}` → `/ics/{token}/{plan}` (2. Pfad-Param = PB-Plan-ID via `e.request.pathValue('plan')`); assignments-Filter zusätzlich `&& plan_id = {:p}` → nur Einsätze DIESER Person in DIESEM Plan; der „alle Touren"-Pfad entfällt (bare `/ics/{token}` → 404). (2) `feedUrls(baseUrl, token, planId)` (pure.js) hängt das Plan-Segment an (beide URL-kodiert). (3) `openSubscribeModal` (userView.js) liest die aktive Tour aus `tourplan_active_pb_id` + `_activePlanName()`, baut den tour-spezifischen Link, zeigt „Gilt für: <Tour>" + Hinweis „für andere Tour links umschalten und erneut abonnieren"; fehlt eine geöffnete Tour → Hinweis statt Link. tests/feed.test.mjs auf 3-Param-Signatur + Plan-Segment angepasst. 93 grün. app.js?v=39→40. BACKEND: Hook v4.9.2 re-deployt (kein Schema-Schritt, feed_token bleibt). VERIFIZIERT per Superuser (2026-07-19): `/ics/<token>/03fs6r1o8cqeyt2` = nur AMK-2026 (53 CONFIRMED), `/…/x1ewcohg4p7uued` = nur AMK-2027 (33 TENTATIVE) — Peter Weist getrennt statt 53+33 gemischt; bare `/ics/{token}` → 404.
v0.27.0 — feat(Abonnierbarer Kalender-Feed pro Person): Wunsch des Users — statt des einmaligen ICS-DOWNLOADS (crewIcsContent, pure.js) einen abonnierbaren Online-Kalender, der sich pro Person automatisch aus den eingetragenen Terminen aktualisiert. Ein Abo braucht zwingend einen SERVER-Endpoint (feste URL, liefert `text/calendar`, wird von der Kalender-App periodisch geholt) → NEUE PocketBase-Route + Schemafeld (Deploy über Admin, Marco hat kein SSH). UMSETZUNG: (1) HOOK v4.9 (main.pb.js): (a) `users`-CREATE-Hook setzt zusätzlich einen `feed_token` (`$security.randomString(40)`), falls leer; (b) `onBootstrap`-Backfill vergibt bestehenden users ohne Token einmalig einen (selbstheilend, guarded); (c) NEUE öffentliche, UNAUTHENTIFIZIERTE Route `routerAdd('GET','/ics/{token}')` — Token→user→email, lädt `assignments` (confirmed+proposed) über ALLE Pläne via `findRecordsByFilter`, holt Bandname+Ort/Art pro Datum aus `plans.plan_data` (JSON, je Plan gecacht), baut ICS (pro plan_id+date EIN Ganztags-Event wie der Download; **confirmed→STATUS:CONFIRMED, proposed→STATUS:TENTATIVE**; stabile UID `planId-date@crewplanner` → Updates ersetzen statt duplizieren), liefert `text/calendar`. Goja-Isolation eingehalten (alle Helfer/Literale INNERHALB des Handlers). (2) FRONTEND (kein Backend): Crew-Sidebar-Button „📆 Kalender abonnieren" (index.html) → neue `openSubscribeModal()` (userView.js) zeigt im neuen `#subscribeModal` den persönlichen `webcal://…/ics/{token}`-Link (Ein-Tipp-Abo Apple/iPhone/Android/Outlook) + `https://…`-Variante (Google „Per URL") mit Kopier-Buttons + Kurzanleitung. Token kommt aus `pb_user.feed_token` (der Start-`auth-refresh` in authService.js liefert das Feld frisch → nach dem Backfill sofort da; fehlt es → Hinweis „einmal neu einloggen"). (3) reine, testbare `feedUrls(baseUrl,token)→{https,webcal}` (pure.js) baut die URLs (Slash-Trim, webcal-Schema, Token-URL-Kodierung). Das `#subscribeModal` profitiert automatisch vom v0.26.1-Handy-Fix. +tests/feed.test.mjs (5 Fälle). 93 grün. app.js?v=38→39. SCHEMA: neues Feld `users.feed_token` (text, optional). BACKEND-SCHRITTE (Admin): (a) Feld `users.feed_token` anlegen, (b) Hook v4.9 deployen (curl+docker restart), (c) `curl -I https://api.crewplanner.nyxlightwork.de/ics/<token>` → `Content-Type: text/calendar` + valides VCALENDAR prüfen (Route liegt NICHT unter /api, strip-api irrelevant; falls Traefik nur /api+/_ weiterleitet → Route erreichbar machen). Der Server-ICS-Builder läuft in Goja → NICHT unter Node testbar, Verifikation per curl + Kalender-App (Apple/Google/Outlook).
v0.26.1 — fix(Handy: Einladungs-Popup landet außerhalb des Sichtfelds / „schwarzes Bild"): Öffnet ein Crew-Mitglied auf **Android** eine Einladungs-Mail, klickt den Link und loggt sich ein, öffnet die App nach dem Login automatisch das „Meine Einsätze"-Modal (`checkAndOpenMySchedule`→`openMyScheduleModal`, userView.js; via authService.js loadAll-then). Das Popup war aber nicht sichtbar — man sah nur den schwarzen Backdrop und musste die Seite hin- und herschieben, um die Box zu suchen. URSACHE (kein JS-Bug): Alle Modals liegen auf Body-Ebene und teilen sich `.modal-bg`/`.modal-box` (styles.css) — `position:fixed;inset:0` + flex-**zentriert**. Seit v0.24 ist die Handy-Seite vertikal **scrollbar** (`.layout{height:auto}`), aber es gab (1) KEINEN Body-Scroll-Lock beim Öffnen und (2) KEINE Mobile-Regeln für `.modal-bg`/`.modal-box`. Auf Android deckt der fixed-Backdrop zwar den Viewport (schwarz), die flex-zentrierte Box sitzt aber im Zentrum des *Layout*-Viewports; bei gescrolltem Zustand / dynamischer URL-Bar liegt das außerhalb des Sichtfelds → Box „weg", Hintergrund scrollt mit. FIX (rein CSS + winziges JS, gilt für ALLE Modals auf index.html + view.html, da gemeinsames `modals.js`/`styles.css`): (A) `styles.css` global `body.modal-open{overflow:hidden}` (Desktop harmlos, Seite scrollt dort eh nicht) + im `@media(max-width:768px)`-Block wird das Overlay selbst zur Scroll-Fläche und richtet die Box OBEN aus statt sie zu zentrieren: `.modal-bg{align-items:flex-start;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:12px}`, `.modal-box{width:100%;max-width:none;max-height:none;margin:auto 0}` → Box startet IMMER im sichtbaren Bereich, auch wenn höher als der Viewport. (B) `js/modals.js`: `openModal` setzt `body.modal-open`, `closeModal` entfernt es NUR wenn kein weiteres `.modal-bg.open` mehr offen ist (Schutz für gestapelte Modals wie crewImportModal über crewModal). +tests/mobile.test.mjs erweitert (Guard: Mobile-`.modal-bg` flex-start+overflow-y:auto, `body.modal-open`-Regel, modals.js setzt/entfernt modal-open). 88 grün. admin.html (eigenes Inline-CSS, Desktop-primär) bewusst NICHT angefasst. Kein Cache-Bust nötig (SW hält frisch), kein Hook/Schema. VERIFIKATION am echten Android-Gerät ausstehend (gerätespezifisch → Headless reicht nicht).
v0.26.0 — fix/chore(Code-Review-Sammlung „fixe alles" nach Gesamt-Review): mehrere App-seitige Härtungen + Aufräumen, KEINE Feature-/Verhaltensänderung. (1) TOTER CODE: `js/bundle.js` (505 LOC) wurde seit der ES6-Modul-Migration (v0.9.3+) NIRGENDS mehr geladen (kein `<script>` in irgendeiner HTML, kein `import`) — die alte „manuelle Kopie aus dropdown.js, muss gespiegelt werden"-Regel war obsolet und die Kopie bereits divergiert (fehlte z.B. die v0.23.3-esc-Härtung). Gelöscht + zugehörige Gotcha-/Projektstruktur-Regel aus CLAUDE.md entfernt. Ebenso `js/userView.test.js` (275 LOC Jest-Altlast ohne Runner) gelöscht. (2) XSS-INKONSISTENZ: `showDD` (dropdown.js) interpolierte `header` und (im Dot-Zweig) `it.label` UNescaped in `innerHTML` — hier landen Crew-/Positionsnamen; widersprach der esc-Disziplin (v0.23.3). Jetzt `esc(header)`/`esc(it.label)`/`esc(it.dot)`. (3) `pbEscapeFilter` (pb.js): Backslash-Regex war `/\\\\/g` → matchte nur DOPPEL-Backslashes, ein einzelnes `\` wurde nicht verdoppelt (theoretischer Filter-Ausbruch mit `\"`). Fix: `/\\/g`→`'\\\\'`. (4) `showToast` (utils.js): Null-Guard auf `#toast` ergänzt (vorher TypeError auf Seiten ohne Toast-Element, anders als `_showMailError`). (5) Auto-Scroll (render.js, v0.25.0-Nachzug): neues `resetTodayAutoScroll()` — `switchPlan` (plans.js) + `switchCrewPlan` (userView.js) setzen das Einmal-Flag zurück, damit auch ein NEU geladener Plan/Tour einmalig zu „heute" scrollt (vorher nur der erste Plan der Session). 85 grün (Reachability-/Import-Guards decken bundle.js-Löschung + neue Imports ab). app.js?v=37→38. Kein Hook/Schema. OFFEN (bewusst NICHT per Push angefasst, siehe Backlog): server-seitige PB-Zugriffsregeln (Crew kann fremde assignments direkt patchen / beliebige crew_invites-Mails triggern) — braucht deliberaten, gegen die Live-Touren getesteten Rollout, kein Blind-Apply.
v0.25.0 — feat(„Heute"-Markierung in der Tourtabelle / Today-Line): Wunsch des Users — während die Tour läuft auf einen Blick sehen, „wo wir gerade sind" (der „Strich"). Recherche (FullCalendar nowIndicator, Gantt „today line", Outlook „shaded past days"): etabliertes Muster = Linie auf dem heutigen Datum + vergangene Tage abdunkeln + „Heute"-Sprungbutton. Da die Tage hier SENKRECHT laufen (jede `<tr>`=ein Tag), wird die (in Gantt waagerechte) Today-Line zu einer markierten Heute-ZEILE mit Strich obendrauf. Gewählt (Outlook-Stil): Zeile markiert + Strich + vergangene Tage blasser + Auto-Scroll + „→ Heute"-Button. WICHTIG: Rot ist belegt (declined) → Markierung nutzt Gold-Akzent (`var(--accent)`), nicht Rot. UMSETZUNG (rein clientseitig, KEINE Änderung an Status-/Zuweisungslogik): (1) `pure.js` `todayMarkers(dateList,todayISO)→{today,next}` (reine, TZ-sichere Leaf-Fn, nutzt bestehendes `toISODate`; ISO-Strings lexikografisch=chronologisch; `today`=exakter Tourtag sonst null, `next`=kleinstes Datum>heute für den Strich bei Lücke/vor Tourbeginn; nach Tourende beide null → kein Strich). (2) `render.js` renderBody vergibt pro Datenzeile `is-today`/`is-nextday`/`is-past` + „HEUTE"-Badge in der date-cell; neue `scrollToToday()` (springt zu `tr.is-today`||`tr.is-nextday`, `scrollIntoView({block:'center'})`); Auto-Scroll EINMALIG in renderTable (Flag `_autoScrolledToday`, guarded mit `typeof requestAnimationFrame==='function'` → Node-Tests brechen nicht). (3) `styles.css`: `.is-past td{opacity:.5}`, `.is-today td{background:rgba(212,165,58,.10)!important}`, Strich via `box-shadow:inset 0 2px 0 0 var(--accent)` auf allen td (durchgehend inkl. position:sticky-Spalten — echter border-top bricht dort), `.today-badge` (Gold-Pille). (4) `index.html` „→ Heute"-Button (⌖, alle Rollen) in der Sidebar; `app.js` registriert `window.scrollToToday`. +tests/today.test.mjs (todayMarkers: exakter Tag/Lücke/vor Start/nach Ende/unsortiert/kaputte Werte). 85 grün. VERIFIZIERT per Headless-Chrome (Desktop+Handy): Heute-Zeile mit Gold-Strich über die ganze Breite + „HEUTE"-Badge, vergangene Tage abgedunkelt, kommende normal. app.js?v=36→37. Kein Hook/Schema.
v0.24.0 — feat(Handy-Tauglichkeit / Responsive-Layout): Die App war am Handy unbenutzbar — falsche Anordnung und **gar kein Scrollen**. URSACHE (kein Bug im JS): `styles.css` hatte NULL Media-Queries; drei Desktop-Annahmen bildeten zusammen einen Scroll-Trap: (1) `.layout{grid-template-columns:232px 1fr}` (fixe Sidebar fraß am Handy fast die ganze Breite), (2) `.layout{height:calc(100vh-84px-66px)}` + `.table-wrap{overflow:hidden}` (Layout-Höhe fix an Viewport gekoppelt, Kind clippte Überlauf → vertikales Scrollen unmöglich), (3) `table{min-width:800px}` (breiter als jedes Handy, horizontaler Scroll von overflow:hidden blockiert). Viewport-Tag war überall korrekt (nie das Problem). FIX (rein CSS + winziges JS, KEINE Änderung der getesteten Render-Logik): (A) `styles.css` bekommt einen `@media(max-width:768px)`-Block ans Ende — löst den Scroll-Trap (`.layout` einspaltig + `height:auto`, `.table-wrap`/`.view-pane` `overflow:visible` → Body scrollt vertikal; `.table-area{overflow-x:auto}` → Tabelle scrollt horizontal, Datum-Spalte bleibt sticky), macht die Sidebar zum **Off-Canvas-Drawer** (`.sidebar{position:fixed;transform:translateX(-100%)}` + `.sidebar.open`), blendet Desktop-Toggle+FAB aus (`#btnSidebar,#fabSidebar{display:none}`), schlanker Header (Seiten-Logos aus, `h1` kleiner), KPI-Strip 6→3 Spalten, Blöcke/Crew-Ansicht einspaltig. Utility `.mobile-only`/`.desktop-only`. (B) index.html: Hamburger `#btnMenu.mobile-only` (im Header) + Backdrop `#drawerBackdrop`, beide `onclick=toggleDrawer()`. (C) js/sidebar.js: neue `toggleDrawer()` (toggelt `.open` auf Sidebar+Backdrop, Muster wie `.modal-bg.open`; getrennt vom Desktop-`toggleSidebar`, das UNVERÄNDERT bleibt → keine Desktop-Regression). js/app.js registriert `window.toggleDrawer`. (D) admin.html (eigenes Inline-CSS): eigener `@media(max-width:768px)` — Tabs horizontal scrollbar, Verzeichnis-Tabelle scrollbar (`display:block;overflow-x:auto`), Such-Input full-width. login.html war bereits responsiv. +tests/mobile.test.mjs (Guard: styles.css/admin.html haben mobilen Breakpoint + `.layout` einspaltig; #btnMenu→toggleDrawer verdrahtet + `window.toggleDrawer` registriert). 79 grün. VERIFIZIERT per Headless-Chrome-Render (Harness lädt echtes styles.css): Handy → `pageScrollsV:true` (Bug weg), Hamburger sichtbar, KPI 3-spaltig, Drawer öffnet mit Backdrop; Desktop (1200px) → `layoutCols:"232px …"`, KPI 6-spaltig, Hamburger versteckt, alter Toggle da (unverändert). app.js?v=35→36, admin-app.js?v=12→13. Kein Hook/Schema.
v0.23.5 — fix(„Konto erstellen" bei vergebener E-Mail zeigte nur „Failed to create record"): Folge von v0.23.4 — Robert klickte den (jetzt korrekten) Link, landete auf login.html, „Konto erstellen" → „Registrierung fehlgeschlagen: Failed to create record." OHNE Feld-Zusatz. DIAGNOSE (PB-Superuser): `users.createRule=''` (öffentliche Registrierung erlaubt, NICHT das Problem); stattdessen existierte bereits ein `users`-Record `robert.steinmetz@tse-ag.com` (id ygbwq8k0ji7y24c, created 2026-07-07 21:12, verified) — angelegt beim Anlegen Roberts in der Konsole, NICHT durch eine erfolgreiche Selbst-Registrierung. Anonymer Repro-POST bestätigte: PB liefert `data:{email:{code:validation_not_unique}}` + generisches `message:"Failed to create record."`. Robert sah nur die generische message → sein Browser lud ein ALTES pb.js (vor v0.22.0, das den Feld-Grund `(email: …)` anhängt); die aktuelle Version zeigt den Grund. URSACHE des Dead-Ends: Admin legt Personen vorab an (Konsole/altes Formular) → Konto existiert → Staff-Einladung schickt sie auf „KONTO ERSTELLEN" → Kollision. FIXES: (1) login.html `doRegister` erkennt `validation_not_unique` (via `e.data.email.code` ODER Regex auf message) → zeigt „Konto mit dieser E-Mail-Adresse schon vorhanden" (Wortlaut vom User gewünscht), ruft neuen Helfer `_switchToLogin(email)` (blendet registerWrap aus, loginWrap ein, füllt #email vor, Toggle-Text zurück) → Sackgasse wird zum klaren Login-Pfad für JEDEN vorab angelegten User. (2) DATEN (PB-Superuser, auf User-Anweisung „Konto löschen → neu registrieren"): blockierenden leeren users-Record `ygbwq8k0ji7y24c` gelöscht (HTTP 204, danach users=0) — die 3 crew_members (Pool __pool__ + AMK + Provinz, alle `user_id=''`, also NICHT verknüpft) blieben unangetastet → Robert bleibt in beiden Touren eingeplant und kann sich jetzt frisch registrieren. Nur login.html geändert; KEIN Hook/Schema. Tests unverändert (kein Testpfad berührt). Kein Cache-Bust-Query auf login.html (SW hält frisch).
v0.23.4 — fix(Staff-Einladung „KONTO ERSTELLEN"-Link → GitHub-404): Robert Steinmetz (2026-07-08 als reines Konto/Pool-Mitglied angelegt) bekam eine `staff_invite`-Mail; Klick auf „KONTO ERSTELLEN →" landete auf einer GitHub-404-Seite. URSACHE: `sendStaffInvite` (admin.html) baute `app_url` aus `window.location.origin + '/login.html'`. Wurde die Einladung von der GitHub-Pages-TESTSEITE (`https://aniflu.github.io/Crewplaner/admin.html`) verschickt, ist `origin` = `https://aniflu.github.io` → Link = `https://aniflu.github.io/login.html` — OHNE das Repo-Präfix `/Crewplaner/` → GitHub Pages 404. Der Hook rendert genau diesen `app_url` in den Button (main.pb.js:216, `staff_invite`; ebenso der tote `love_invite`-Zweig:207). Auf Produktiv (`crewplanner.nyxlightwork.de`) liegt login.html im Root → dort ging es zufällig. FIX: `app_url` fest auf `https://crewplanner.nyxlightwork.de/login.html` verdrahtet — Empfänger landen IMMER auf Produktiv, egal von wo der Admin sendet (konsistent mit allen anderen Hook-Buttons, die schon prod hardcoden). Rein clientseitig, KEIN Hook-Deploy nötig. Betroffene (Robert) einmal neu einladen — die alte Mail bleibt kaputt. Kein Cache-Bust nötig (admin.html lädt keine ?v=-Version für diese Inline-Funktion; SW hält frisch). 74 grün unverändert (kein Testpfad berührt).
v0.23.3 — fix(Namen mit " abgeschnitten in der Anzeige): Symptom — Name `Robert "Woody" Steinmetz` zeigte im Verzeichnis nur „Robert " (alles ab dem `"` weg); User las es als „nur Vorname / alles nach dem Leerzeichen weg". URSACHE: der Name war korrekt in der DB (v0.23.2-Fix wirkte, Pool-Record `crew_members{plan_id:"__pool__"}` angelegt), aber `esc()` (utils.js) baute Escaping über den `textContent→innerHTML`-Trick, der NUR `<`,`>`,`&` maskiert — **nicht `"`/`'`**. In `value="${esc(e.name)}"` (admin.html renderDirectory + ~10 weitere Attribut-Stellen: title=, data-crew=, data-email= …) bricht der Wert dann am ersten inneren `"` ab. FIX: `esc()` maskiert jetzt zusätzlich `"`→`&quot;` und `'`→`&#39;` per expliziter replace-Map (DOM-frei, funktioniert in Text- UND Attributkontext → alle Stellen auf einmal). +logic.test.mjs (esc escaped "/'/<>&). 74 grün. app.js?v=34→35, admin-app.js?v=11→12. Kein Schema/Backend-Schritt.
v0.23.2 — fix(Backend/Schema, kein App-Code): „Namen speichern" im Verzeichnis brach mit `plan_id: Failed to find all relation records with the provided ids.` ab. URSACHE: `crew_members.plan_id` war in PocketBase als **relation**-Feld angelegt (Ziel `plans`, cascadeDelete) statt **text** — dieselbe Feldtyp-Falle wie früher bei `assignments.proposed_by` (siehe Deploy-Abschnitt), vermutlich durch Coolify-Redeploy/Schema-Reimport. `saveDirectoryEntry`/`createPoolMember` legen für ein reines Konto einen Pool-Eintrag mit `plan_id="__pool__"` an → der Sentinel ist KEIN echter plans-Record → Relation-Validierung schlägt fehl → Pool-Anlegen kam nie durch (erklärt rückwirkend, warum v0.22.0/v0.23.0-Pool-Records nie entstanden). FIX (via PB-Superuser-API, kein SSH): `crew_members.plan_id` UND `assignments.plan_id` von relation→text umgebaut (PB erlaubt keine In-Place-Typänderung → Backup aller Werte, Feld ersetzen, Werte zurückschreiben). crew_members: 14 Records (9 AMK + 5 Provinz) unverändert; assignments: 709 Records (360 AMK + 349 Provinz) unverändert; kein Datenverlust. End-to-End verifiziert: Test-Record mit `plan_id="__pool__"` wird jetzt akzeptiert (200), danach gelöscht. `assignments.proposed_by` war bereits korrekt text. Keine Code-/Test-Änderung (73 grün unverändert), reiner Daten-/Schema-Fix.
v0.23.1 — fix(Namensspeichern im Verzeichnis persistierte nicht): Symptom — Name eintippen + „Speichern" zeigte grünes „Gespeichert ✓", Feld war nach Reload wieder leer (bei reinem Konto wie Robert). URSACHE: die `users`-Collection hat KEIN `name`-Feld (PB-v0.23+-Auth-Standardschema); `saveDirectoryEntry` patchte `users.name` → PocketBase IGNORIERT unbekannte Felder beim PATCH still (HTTP 200) → nichts gespeichert. Erklärt auch, warum überall nur E-Mails zu sehen waren. FIX: Namen leben in `crew_members` (dort existiert das Feld nachweislich — createPoolMember/Tour-Crew). `saveDirectoryEntry` patcht `users.name` NICHT mehr; hat die Person weder Pool- noch Tour-Record (reines Konto), wird beim Namensspeichern ein Pool-`crew_members`-Eintrag `{plan_id:"__pool__", name, email, role}` angelegt → Name persistiert + Person tour-übergreifend verfügbar. Kein Backend-Schritt (KEIN users.name-Feld nötig). Dublettensicher (Bedingung `!pool && !tours` ⇒ kein crew_members mit der Mail). admin-app.js?v=10→11. 73 grün.
v0.23.0 — feat(Vereintes Crew-Verzeichnis in der Konsole): Folgeproblem nach v0.22.0 — „Robert Steinmetz" war vor dem Deploy übers ALTE Formular angelegt worden = reines users-Konto OHNE Namen; die Benutzer-Tabelle zeigt einen Namen nur wenn gesetzt (admin.html:1152) und bot KEIN Namensfeld. Namen liegen an drei Stellen: users.name, crew_members.name (Pool + je Tour), plan_data.crew/defaultCrew/assignments (Tour-JSON). LÖSUNG (User wollte „ein vereintes Verzeichnis"): der „Benutzer"-Tab zeigt jetzt EINE Liste aller Personen, per E-Mail zusammengeführt (`mergeCrewDirectory`, pure.js), mit editierbarem Name·E-Mail·Rolle + Badges (Konto/Pool/Touren). `renderDirectory`/`saveDirectoryEntry`/`loadDirectory`/`filterDirectory` (admin.html) ersetzen renderUsers+renderCrewPool (beide entfernt, ebenso updateRole/renamePoolMember/removePoolMember). `saveDirectoryEntry` propagiert eine Namensänderung nach users.name + Pool-crew_members + PRO TOUR: Plan FRISCH laden → `renameInPlanData(pd,old,new)` (pure.js, immutabel: crew/defaultCrew/assignments) → plans.plan_data patchen, crew_members.name patchen, assignments.crew_name patchen (gegen Stale/Cross-Write, vgl. v0.14.6); E-Mail→users/crew_members/assignments.crew_email; Rolle→users/Pool. Kollisions-Guard (Name existiert in Tour schon). „+ Neues Crew-Mitglied" (v0.22.0) bleibt. +tests/directory.test.mjs (mergeCrewDirectory Merge/Trennung/Name-Priorität; renameInPlanData Ersetzung+Immutabilität). 73 grün. app.js?v=33→34, admin-app.js?v=9→10. KEIN Schema/Hook nötig.
v0.22.0 — feat(Globaler Crew-Pool: neue Mitglieder an EINER Stelle in der Admin-Konsole anlegen): Auslöser — der User wollte in „+ Neuer Benutzer" ein Crew-Mitglied anlegen, konnte aber nur E-Mail+Rolle (keinen Namen) eingeben, und die Person tauchte nicht in „Crew verknüpfen"/„benachrichtigen" auf. URSACHE (kein Bug): zwei getrennte Konzepte verwechselt — „+ Neuer Benutzer" legt ein `users`-Login-Konto an (nie ein Name); ein Crew-Mitglied einer Tour lebt in `plan_data.crew` (JSON), „Crew verknüpfen/benachrichtigen" iterieren über die `crew`-Namensliste des GELADENEN Plans (admin.html). Ein Konto ist nie Teil einer Tour. LÖSUNG (nach User-Vorgabe): (1) Formular umgebaut → „+ Neues Crew-Mitglied" mit Name·E-Mail·Rolle → neue `createPoolMember()` (admin.html): E-Mail normalisiert (`normEmail`, pure.js), SERVER-seitiger Dublettencheck (`crew_members?filter=email="…"` tour-übergreifend → „E-Mail bereits vergeben"), dann `pbPost crew_members {plan_id:"__pool__", name, email, role}` — KEIN Konto, KEINE Reset-Mail. (2) `renderCrewPool()` listet Pool-Records (Sentinel `plan_id="__pool__"`) mit ✏/× (renamePoolMember/removePoolMember); geladen aus `loadUsers()`. (3) Konto entsteht erst beim Erst-Login über den Einladungslink: `users`-Create-Hook (main.pb.js v4.8) übernimmt via `findFirstRecordByFilter` die im Pool gesetzte `role` (≠crew). login.html bleibt Default `crew` (Client kann `users.role` nicht setzen — updateRule=superadmin; Pool lesen braucht Auth → daher server-seitig). (4) „♥ Liebeseinladung" komplett entfernt (beide Buttons + createUserWithLove/sendLoveInvite). (5) pb.js hängt jetzt den echten Feld-Grund aus `data` an den Error (statt nur generisch „Failed to create record"). Tour-Integration nutzt bestehendes „Aus Crew-Pool wählen" (loadAllKnownCrew liest alle crew_members inkl. Pool). SCHEMA: neues optionales Textfeld `crew_members.role` (fehlt → Default crew). +tests/crewpool.test.mjs (normEmail). 68 grün. app.js?v=32→33, admin-app.js?v=8→9. BACKEND-SCHRITT: `crew_members.role` (text) via PB Admin UI anlegen + Hook v4.8 deployen (sonst greift die Pool-Rolle nicht; Pool-Anlegen selbst funktioniert auch ohne).
v0.21.0 — feat(Crew-Plan-Umschalter in der Seitenleiste): Crew in MEHREREN Touren (z.B. Oliver Thomas: AMK + Provinz) sah nach dem Bestätigen ALLER Termine nur noch EINE Tour ohne Wechselmöglichkeit — Ursache: `_getActivePlanId` Crew-Zweig (dataService.js) bevorzugt den Plan mit offenen `proposed`-Anfragen; ist nichts mehr offen → `chosen=planIds[0]` (Reihenfolge unbestimmt), zweiter Plan unerreichbar. Die „Pläne"-Sidebar-Sektion war für Crew leer (renderPlanList liest getPlansIndex = nur Manager-localStorage). FIX: (1) neue `loadCrewPlans()` (dataService.js) — crew_members per Email → eindeutige plan_ids → Plan-Namen via pbGet → `[{id,name}]` alphabetisch. (2) `renderCrewPlanList(plans, activeId)` + `switchCrewPlan(pbId)` (userView.js) füllen dasselbe `#planList`-Element wie der Manager; Klick lädt via `loadPlanForCrew`→`loadCrewMeta`+`loadAssignmentStatuses`→renderTable neu. (3) gewählte Tour merkt sich in neuem localStorage-Key `tourplan_crew_selected_pb_id`; `_getActivePlanId` Crew-Zweig prüft ihn ZUERST (nur wenn noch unter den plan_ids der Crew, sonst verwerfen→bisherige proposed-Logik) → Auswahl stabil über Reload. (4) authService.js befüllt die Liste im Crew-loadAll-then; app.js registriert `window.switchCrewPlan`. Rein app-seitig, kein Hook/Schema. +tests/dataservice.test.mjs (loadCrewPlans: Dedup+Sortierung, gelöschter Plan übersprungen). 66 grün. app.js?v=31→32.
v0.20.2 — fix(Crew-ICS-Titel): `crewIcsContent` (pure.js) setzte `SUMMARY` = Bandname → jeder Tag sah im Kalender gleich aus. Jetzt `SUMMARY = "Art: Ort"` (z.B. „Show: Nürnberg – PSD Bank Arena"), Bandname wandert in die `DESCRIPTION` (`Band:/Art:/Ort:`), `LOCATION` = Ort. Test angepasst. 64 grün. app.js?v=30→31.
v0.20.1 — feat(Crew: eigener .ics + PDF, nur eigene bestätigten Termine): zwei crew-only Sidebar-Buttons „📅 Meine Termine (.ics)" (`downloadMyICS`) + „📄 Meine Termine (PDF)" (`printMySchedule`) in userView.js. Beide über `_myConfirmedExport` (getMyCrewName + `confirmedIcsRows({onlyCrew,myName})`). ICS-Eintrag bewusst NUR **Band** (SUMMARY = Plan-/Tourname), **Ort** (LOCATION), **Art** (DESCRIPTION) — KEINE anderen Namen/Positionen; reine `crewIcsContent(band, rows, dateMeta)` (pure.js, getestet). PDF = Druckfenster (Datum · Art · Ort, Titel = Band) → „Als PDF speichern". Bandname für Crew: `loadPlanForCrew` (dataService.js) merkt `plan.name` in `tourplan_active_plan_name` + Header `#activePlanName`; `_activePlanName` liest den Key als Fallback (getPlansIndex ist bei Crew leer). Leer → Toast „Keine bestätigten Termine". +tests/pure.test.mjs (crewIcsContent Format-Guard). 64 grün. app.js?v=29→30.
v0.20.0 — feat(Scoping-Hardening: Aktionen auf Person+Plan; ICS nur bestätigt): (1) EIGENTÜMER-PRÜFUNG: `confirmAssignment`/`declineAssignment` (dataService.js) prüfen bei `IS_CREW && !IS_MANAGER`, dass der Ziel-Record `crew_email===CURRENT_USER_EMAIL` (bzw. beim Anlage-Zweig `crewMeta[getVal].email===` eigene Mail) — sonst `throw 'Zugriff verweigert'`. Crew kann also nur EIGENE Einsätze bestätigen/absagen; Manager unverändert (verwaltet den Plan). Plan-Scope war schon über `_getActivePlanId` gegeben. (2) ICS NUR BESTÄTIGT: neue reine `confirmedIcsRows(tourDates, positions, statuses, {onlyCrew,myName,allowTypes})` (pure.js) liefert nur Tage mit ≥1 confirmed-Slot. `calendar.js generateICS` (index.html, Crew+Manager) nutzt sie → Crew exportiert nur EIGENE bestätigte Tage, Manager alle bestätigten (Beschreibung listet „Position: Name"); leer → „Keine bestätigten Termine". Admin-Inline-`adminGenerateICS` (admin.html) analog über `_wrkAssignmentStatuses`. (vorher: ganzer Plan nach Tagestyp, unabhängig von Bestätigung). Server-seitige PB-Regeln bewusst NICHT Teil (App-seitig). +Tests: dataservice (Crew fremd→verweigert, eigen→ok), pure (confirmedIcsRows). 63 grün. app.js?v=28→29, admin-app.js?v=7→8.
v0.19.1 — fix(Crew-Pool-Import verschmolz verschiedene Personen + Mehr-Plan-Crew + Admin-ICS): PB-Superuser-Diagnose ergab: der Pool-Import (v0.18.0) führte zwei VERSCHIEDENE „Marco Hoch" (Admin madmaxmail@web.de + GL-Crew marco@hoch-online.com, beide AMK) über den NAMEN zusammen und übernahm die falsche Mail nach Provinz. Folge: Provinz-„Marco" = madmaxmail (59 proposed unter falscher Mail); Marcos App (marco@hoch-online.com) resolvte nur auf AMK → er bestätigte AMK (56); Admin sah in Provinz nichts. FIXES: (1) `dedupKnownCrew` (pure.js) schlüsselt jetzt nach E-MAIL (lowercase), sonst Name → gleichnamige mit verschiedenen Mails bleiben getrennt. (2) `_getActivePlanId` Crew-Zweig (dataService.js): `pbList` statt `pbFirst`; bei Crew in MEHREREN Plänen den mit `proposed`-Anfragen bevorzugen (sonst zufällig) → Crew landet dort, wo Antwort ansteht. (3) Admin-ICS: `window.adminGenerateICS`-Override aus admin-app.js entfernt → die Inline-`adminGenerateICS` (admin.html, liest GELADENEN Plan) bedient den Button wieder (vorher las calendar.js `state.js` = falscher/veralteter Plan → AMK-ICS in Provinz). DATEN-REPARATUR (PB, nur Provinz): „Marco Hoch"→marco@hoch-online.com + 59 assignments crew_email umgestellt (AMK unangetastet). crewimport.test.mjs an Mail-Keying angepasst; 58 grün. app.js?v=27→28, admin-app.js?v=6→7. NB: Marco hat versehentlich AMK (56) bestätigt — bewusst nicht angefasst.
v0.19.0 — feat(DAUERHAFTE Cache-Lösung via Service Worker): behebt das wiederkehrende „stale Sub-Modul"-Problem (js/*.js luden ohne ?v= → Browser-Cache → Fixes kamen erst nach manuellem Hard-Reload). NEU: `sw.js` (Repo-Root) — Service Worker, der gleich-Origin JS/CSS/HTML **network-first mit `cache:'no-cache'`** (Revalidierung) ausliefert → immer aktueller Stand. Cached NICHTS selbst (kein `caches.put`) → kann NIE eine alte Version „einsperren"; bei Netzfehler Fallback auf normalen Fetch. PB-API (andere Origin) unangetastet. Registrierung in index/admin/login/view.html (`<head>`), mit einmaligem Auto-Reload bei `controllerchange` (guarded). Ab jetzt: Deploy → einmal noch Hard-Reload (SW installiert sich), danach kommen Updates OHNE manuelles Cache-Leeren an. Kill-Switch in sw.js dokumentiert. +tests/serviceworker.test.mjs (SW existiert, no-cache, kein eigenes Caching; alle Seiten registrieren ihn). 57 grün. app.js?v=26→27, admin-app.js?v=5→6.
v0.18.3 — fix(Crew „Termine bestätigen" → „keine offenen Termine" trotz sichtbarer Tage): `getMyPendingSlots` (userView.js) sammelte NUR `assignmentStatuses`-Records mit `status==='proposed'` + exaktem `crewName===myName`. Die Crew SIEHT ihre Tage aber via `getVal` (assignments/defaultCrew) — unabhängig von Records. → sichtbar, aber „nichts offen" (z.B. Einladung ohne Record-Anlage / reine defaultCrew-Slots). FIX: `getMyPendingSlots` iteriert TOUR_DATES×POSITIONS, nimmt Slots wo `sameCrew(getVal(date,pos), myName)` und `status!=='confirmed'` (tolerant, inkl. Slots ohne Record; confirmAssignment legt den Record beim Bestätigen an, dataService.js:230). Sidebar-Button `bulkConfirmAllMySlots` öffnet jetzt die AUSWAHL-Liste (`openMyScheduleModal`: alles angehakt → abwählen was nicht geht → „Bestätigen ✓" bestätigt Rest, lehnt Abgewählte ab) statt blind alle zu bestätigen. Abgewählte ohne Record = No-op (keine Absage-Mail-Flut); mit Record → declined. +Test (flows.test.mjs getMyPendingSlots getVal-basiert). 52 grün. app.js?v=25→26.
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

## Aktueller Stand (Stand: 2026-06-17 — teilweise historisch; maßgeblich ist der Versionierungs-Changelog oben + CHANGELOG.md)

### Was funktioniert ✓
- Login/Logout via PocketBase
- Multi-Rollen-System: superadmin/manager → admin.html, crew/booker → index.html
- Manager-Konsole (`admin.html`): Werkzeuge, E-Mail-Log Tab, Benutzer, Rollen, Pläne
- **Manager + Crew laden Plan direkt aus PocketBase** — localStorage optional
- Plan-Transfer admin→index via sessionStorage ("Aktuellen Plan bearbeiten"-Button)
- E-Mail-Log: Hook v4.8 schreibt nach jedem Mailversand in `email_log` Collection
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

### E-Mail-Typen (Hook v4.8)
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
| `record.get('jsonField')` | liefert **JSONRaw ([]byte)**, KEIN JS-Objekt → `.foo` ist `undefined` | `JSON.parse(record.getString('jsonField'))` (getString = cast.ToString → JSON-Text). Gelernt v4.9→v4.9.1 (leerer /ics-Feed). |
| `$security.randomString(n)` | ✓ verfügbar (alphanum. Token, z.B. `feed_token`) | — |
| `routerAdd('GET','/pfad/{p}', fn)` | ✓ Custom-Route; `e.request.pathValue('p')`, `e.response.header().set(k,v)`, `return e.string(200,txt)`. KEIN `e.next()` (nur Record-Hooks). Route liegt am Root (nicht `/api`) → strip-api irrelevant, Traefik reicht sie durch. | — |

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
- **74 Tests grün** (Stand v0.23.5). Test-Dateien (`tests/*.test.mjs`, auto-discovered von `run.mjs`):
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
    - `serviceworker.test.mjs` — `sw.js` existiert, revalidiert (no-cache) & cached nichts stale; index/admin/login/view.html registrieren ihn (dauerhafte Cache-Lösung).
- **Nicht** abgedeckt (braucht echtes PocketBase): Login, E-Mail-Versand, echte PB-Schreibpfade.
- Mini-Framework: `tests/_assert.mjs` (`test`/`eq`/`deepEq`/`ok`, Exit-Code 1). `js/userView.test.js` ist Jest-Stil-Altlast (kein Runner).
- **Reine, testbare Logik gehört nach `js/pure.js`** (import-freies Leaf), nicht in `utils.js`.

**Cache-Bust-Stand:** `index.html` lädt `theme.css?v=2` + `styles.css?v=25` + `js/app.js?v=43`; `view.html` lädt `js/view-app.js?v=3`; `admin.html` lädt `js/admin-app.js?v=14`. Alle 4 Seiten laden `theme.css?v=2` (zentrale Token-/Font-Ebene, seit v0.28.0; helle Palette „Sage" seit v0.28.1). **Seit v0.19.0 hält der Service Worker (`sw.js`) alle Module dauerhaft frisch** (network-first/`no-cache`) → normalerweise KEIN Hard-Reload mehr nötig. Beim ERSTEN Laden nach dem v0.19.0-Deploy installiert sich der SW (einmaliger Auto-Reload via `controllerchange`, sonst 1× Hard-Reload). Danach kommen Updates automatisch an. Fällt der SW aus (kein SW-Support/deregistriert): Sub-Module laden ohne `?v=` → dann wie früher Hard-Reload. Kill-Switch: Kommentar in `sw.js`.

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
[{"name":"plans","type":"base","listRule":"@request.auth.id != \"\"","viewRule":"@request.auth.id != \"\"","createRule":"@request.auth.id != \"\"","updateRule":"@request.auth.id != \"\"","deleteRule":"@request.auth.id != \"\"","fields":[{"name":"name","type":"text","required":true},{"name":"owner","type":"text"},{"name":"plan_data","type":"json"}]},{"name":"plan_members","type":"base","listRule":"@request.auth.id != \"\"","viewRule":"@request.auth.id != \"\"","createRule":"@request.auth.id != \"\"","updateRule":"@request.auth.id != \"\"","deleteRule":"@request.auth.id != \"\"","fields":[{"name":"plan_id","type":"text","required":true},{"name":"user_id","type":"text"},{"name":"role","type":"text"}]},{"name":"crew_members","type":"base","listRule":"@request.auth.id != \"\"","viewRule":"@request.auth.id != \"\"","createRule":"@request.auth.id != \"\"","updateRule":"@request.auth.id != \"\"","deleteRule":"@request.auth.id != \"\"","fields":[{"name":"plan_id","type":"text","required":true},{"name":"name","type":"text","required":true},{"name":"email","type":"email"},{"name":"sort_order","type":"number"},{"name":"user_id","type":"text"},{"name":"role","type":"text"}]},{"name":"assignments","type":"base","listRule":"@request.auth.id != \"\"","viewRule":"@request.auth.id != \"\"","createRule":"@request.auth.id != \"\"","updateRule":"@request.auth.id != \"\"","deleteRule":"@request.auth.id != \"\"","fields":[{"name":"plan_id","type":"text","required":true},{"name":"date","type":"text","required":true},{"name":"pos_id","type":"text","required":true},{"name":"pos_label","type":"text"},{"name":"crew_name","type":"text"},{"name":"crew_email","type":"text"},{"name":"status","type":"text"},{"name":"proposed_by","type":"text"},{"name":"responded_at","type":"date"}]},{"name":"crew_invites","type":"base","listRule":"@request.auth.id != \"\"","viewRule":"@request.auth.id != \"\"","createRule":"@request.auth.id != \"\"","updateRule":"@request.auth.id != \"\"","deleteRule":"@request.auth.id != \"\"","fields":[{"name":"plan_id","type":"text"},{"name":"crew_name","type":"text","required":true},{"name":"crew_email","type":"email","required":true},{"name":"type","type":"text","required":true},{"name":"plan_name","type":"text"},{"name":"app_url","type":"text"},{"name":"custom_message","type":"text"}]},{"name":"email_log","type":"base","listRule":"@request.auth.id != \"\"","viewRule":"@request.auth.id != \"\"","createRule":"@request.auth.id != \"\"","updateRule":"","deleteRule":"@request.auth.id != \"\"","fields":[{"name":"plan_id","type":"text"},{"name":"crew_name","type":"text"},{"name":"crew_email","type":"text"},{"name":"email_type","type":"text"},{"name":"sent_at","type":"text"},{"name":"success","type":"text"}]}]
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

> ⚠️ **`plan_id` als relation → „Namen speichern"/Pool bricht ab (v0.23.2):** Wiederholte Variante derselben Falle,
> diesmal auf **`crew_members.plan_id`** (und weiterhin `assignments.plan_id`). Symptom: **`plan_id: Failed to find
> all relation records with the provided ids.`** Ursache: der Crew-Pool nutzt den **Sentinel `plan_id="__pool__"`**
> (`createPoolMember`/`saveDirectoryEntry`, admin.html) — bei einem **relation**-Feld ist `"__pool__"` kein echter
> plans-Record → Validierung schlägt fehl → Pool-Records entstehen NIE (auch echte Plan-IDs bei anderen Writes gehen
> nur „zufällig" durch). **Fix:** `crew_members.plan_id` **und** `assignments.plan_id` müssen **Text** sein. Umbau =
> Werte sichern → Relation-Feld raus, Text-Feld gleichen Namens rein (`required:false`, sonst Migration meckert) →
> Werte zurückschreiben. Am 2026-07-08 per PB-Superuser-API erledigt (crew_members 14, assignments 709 Records,
> 0 Verlust). **Merke: `"__pool__"` ⇒ `crew_members.plan_id` MUSS text sein**, sonst geht der globale Pool nicht.

Aktuell im Repo: **v4.10** (2026-07-21 — zweiteilige Änderungs-Mail, siehe v0.30.0-Eintrag). ⚠️ **NOCH NICHT deployt** — deployt ist weiterhin v4.9.2 (2026-07-19); bis zum Deploy kommt die Update-Mail im alten, einteiligen Format (kein ➖-Abschnitt/GESEHEN-Button), App-Seite funktioniert unabhängig davon. Feld `users.feed_token` ist angelegt + alle 10 User backfilled (2026-07-19 per Superuser). Kalender-Abo **tour-spezifisch** (`/ics/{token}/{plan}`) end-to-end verifiziert: Peter Weist getrennt (AMK 2026 = 53 CONFIRMED, AMK 2027 = 33 TENTATIVE, keine Vermischung), bare `/ics/{token}` → 404. Feld `users.feed_token` ist angelegt + alle 10 User backfilled (2026-07-19 per Superuser). Kalender-Abo **tour-spezifisch** (`/ics/{token}/{plan}`) end-to-end verifiziert: Peter Weist getrennt (AMK 2026 = 53 CONFIRMED, AMK 2027 = 33 TENTATIVE, keine Vermischung), bare `/ics/{token}` → 404.

> ✅ **Pool-Rollen-Kette KOMPLETT & end-to-end verifiziert (2026-07-14).** Zwei Glieder waren offen,
> beide jetzt erledigt: (1) Feld `crew_members.role` (text, optional) am 2026-07-13 per PB-Superuser
> angelegt (fehlte live trotz v0.22.0-„Schema"-Notiz → `createPoolMember` schrieb `role`, PB verwarf es
> still, wie bei [[users-no-name-field]]). (2) Hook v4.8 vom Admin deployt. TEST (Superuser, dann
> aufgeräumt): Pool-Member `role='manager'` + neuer `users`-Record mit Default `role='crew'` gleicher
> Mail → nach dem users-CREATE-Hook ist `users.role='manager'` (aus Pool kopiert) UND `verified=true`.
> Pool-angelegte Personen bekommen ihre Rolle jetzt beim Erst-Login automatisch.
- v4.1: email_log-Write nach jedem Mailversand
- v4.2: assignments CREATE-Hook entfernt (keine per-Slot-Emails mehr)
- v4.3: Absage-Email umformuliert ("Plan geändert")
- v4.4: Short-URL via is.gd bei plans view_token Update (serverseitig, kein CORS-Problem)
- v4.5: (a) Datum aus ISO-String formatiert statt new Date() → keine TZ-Verschiebung bei nicht-UTC-Container. (b) Anfrage-Mail-Guard erweitert: proposed_by `'bulk'` ODER `'update'` → keine doppelte per-Slot-Anfrage-Mail mehr bei Einladen/Update (die senden eigene konsolidierte Mail).
- v4.6: Optionaler Admin-Freitext — Feld `crew_invites.custom_message` wird als hervorgehobener Notiz-Block in invite/reminder/update/cancellation gerendert (`noteBlock`). Leer/fehlend = unverändert. **VORAUSSETZUNG:** Feld `custom_message` (text, optional) muss auf der crew_invites-Collection existieren (PB Admin → crew_invites → New field).
- v4.7: `type==='invite'` rendert eine Terminliste (DATUM/POSITION-Tabelle), wenn `app_url` ein JSON-Slot-Array ist (`sendAdminInvite` schickt das). Ist `app_url` eine reine URL → unverändert generisch (rückwärtskompatibel). Ermöglicht EINE Einladungsmail mit allen Terminen der Person.
- v4.8: users-CREATE-Hook (bisher nur Auto-Verify) übernimmt jetzt zusätzlich die **Rolle aus dem globalen Crew-Pool** — sucht via `findFirstRecordByFilter('crew_members','plan_id="__pool__" && email={:email}')`; ist dort eine `role` ≠ `crew` gesetzt, wird sie auf den neuen `users`-Record geschrieben (das Konto entsteht erst beim Erst-Login über den Einladungslink). Query-Fehler/kein Treffer → Default-Rolle bleibt (kein harter Fehler). Voraussetzung: Feld `crew_members.role` (text) muss existieren.
- v4.9: (a) `users`-CREATE-Hook vergibt zusätzlich einen `feed_token` (`$security.randomString(40)`), falls leer. (b) `onBootstrap`-Backfill vergibt bestehenden users ohne Token einmalig einen (selbstheilend). (c) NEUE öffentliche, UNAUTHENTIFIZIERTE Route `routerAdd('GET','/ics/{token}')` → persönlicher, abonnierbarer ICS-Feed EINER Person über ALLE Touren (confirmed→CONFIRMED, proposed→TENTATIVE; stabile UID `planId-date@crewplanner`). Bandname/Ort/Art kommen aus `plans.plan_data`. **VORAUSSETZUNG:** Feld `users.feed_token` (text, optional) muss existieren; nach Deploy `curl -I …/ics/<token>` → `Content-Type: text/calendar` prüfen.
- v4.9.1: fix — `planMeta` im /ics-Handler parst `plan_data` jetzt via `getString`+`JSON.parse` (JSON-Feld = JSONRaw/[]byte im Goja-Hook; `.get()` gab kein brauchbares JS-Objekt → Ort/Art/Titel blieben leer, Feed fiel auf den Bandnamen zurück). Fallback auf `.get()`, falls schon Objekt.
- v4.9.2: fix — Kalender-Feed jetzt tour-spezifisch. Route `/ics/{token}` → `/ics/{token}/{plan}` (2. Pfad-Param `e.request.pathValue('plan')`), assignments-Filter zusätzlich `&& plan_id = {:p}` → ein Abo enthält nur die Termine EINER Tour (v0.27.1, User-Wunsch). Bare `/ics/{token}` (ohne Plan) → 404.
- v4.10: feat (v0.30.0, **NOCH NICHT deployt**, Repo-Stand) — `type==='update'` rendert jetzt eine zweiteilige „Es gab Änderungen."-Mail statt der bisherigen einteiligen „Achtung."-Mail. Slots werden nach `kind` getrennt: ohne `kind` oder `kind!=='removed'` → ➕-Abschnitt „Neue Termine — bitte bestätige, dass du Zeit hast" (rückwärtskompatibel zum alten Format); `kind==='removed'` → ➖-Abschnitt „Entfernte Termine — bitte bestätige, dass du die Änderung gesehen hast" + (nur wenn `aid`-Werte vorhanden) Button „ÄNDERUNGEN GESEHEN ✓" → `?action=ackcancel&aids=id1,id2` (App-seitig behandelt in authService `_handleEmailAction`, patcht die soft-gecancelten Records auf `cancel_acked`). Beide Abschnitte sind optional (nur gerendert, wenn Slots des jeweiligen Typs vorhanden).
Danach in Docker-Logs prüfen: `[hook] main.pb.js v4.10 geladen`

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
    ├── dropdown.js       ← showDD(), openCrewDD(), openDefaultDD(), requestForPos(), bulkCancelPos()
    ├── userView.js       ← Crew: openSlotConfirmModal(), bulkConfirmAllMySlots(), bulkDeclineAllMySlots()
    ├── emailLog.js       ← Admin: renderEmailLog() — lädt email_log Collection aus PB
    ├── init.js           ← App-Start: loadLogosGlobal(), initPlans(), render()
    └── ...               ← blockview, crewview, plans, pdf, persistence, sidebar, stats, tourblock, types
```

---

## Architektur-Gotchas

**Ladereihenfolge in `index.html` ist kritisch** — globaler Scope, kein Modulsystem. `pb.js` und `config.js` müssen vor allen anderen geladen werden.

**Kein bundle.js mehr** — seit der ES6-Modul-Migration (v0.9.3+) lädt `index.html` nur noch `js/app.js` als Modul-Entry; die frühere `bundle.js` (manuelle Kopie aus `dropdown.js` etc.) wurde nie mehr geladen und ist in v0.25.1 gelöscht. Änderungen an `dropdown.js` NICHT mehr spiegeln.

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
users           { id, email, role, verified, feed_token }  // Auth-Collection; feed_token (v0.27.0) = nicht-erratbarer Schlüssel für die Kalender-Abo-Route /ics/{token}
plans           { id, name, owner(→users), plan_data(JSON), view_token }
plan_members    { plan_id(→plans), user_id(→users), role }
crew_members    { plan_id, name, email, sort_order, user_id(→users), role }  // plan_id="__pool__" = globaler Crew-Pool (v0.22.0), role = Konto-Rolle beim Erst-Login
assignments     { plan_id, date, pos_id, pos_label, crew_name, crew_email, status, proposed_by, responded_at }  // status seit v0.30.0 zusätzlich: cancelled (Soft-Cancel, Absage-Quittung ausstehend) → cancel_acked (quittiert); beide aus den Zellen-Ladepfaden gefiltert
crew_invites    { plan_id, crew_name, crew_email, type, plan_name, app_url, custom_message }
email_log       { plan_id, crew_name, crew_email, email_type, sent_at, success }
activity_log    { plan_id, crew_name, crew_email, action, date, pos_label, ts }  // Crew-Reaktions-Log (v0.30.0): action=confirmed|declined|cancel_acked; ts client-gesetzt (ISO, Sortierung -id)
```

> ⚠️ **`plans`-Zugriffsregel (LIVE, wichtig!):** Die echte list/viewRule ist
> `@request.auth.id = owner || @request.auth.role = "superadmin" || view_token != ""`
> — NICHT das permissive `@request.auth.id != ""` aus dem Schema-Import-JSON oben im Deploy-Abschnitt.
> **Folge:** Crew (weder Owner noch superadmin) kann einen Plan-Record NUR lesen, wenn er einen
> nicht-leeren `view_token` hat. Fehlt der → `GET plans/records/<id>` gibt **404** → `loadPlanForCrew`
> bricht ab (leere Tour) und der v0.21.0-Crew-Umschalter (`loadCrewPlans`) blendet die Tour aus.
> **Jede Tour, die Crew sehen soll, braucht einen `view_token`** (entsteht über „Öffentlicher
> Booker-Link" in der Konsole, oder per PATCH). Gefunden 2026-07-04: Provinz 2027 hatte keinen →
> Oliver Thomas sah sie nicht; per Superuser gesetzt.

> 🔒 **Server-seitige Zugriffsregeln GEHÄRTET (v0.26.0, 2026-07-13, per PB-Superuser).** Vorher war
> alles `@request.auth.id != ""` (jeder eingeloggte Crew-User konnte fremde Einsätze patchen + über
> `crew_invites` Mails an beliebige Adressen triggern). LIVE gesetzt + per Impersonation getestet
> (Crew patcht eigenen Einsatz=200, fremden=404, Invite-Create=400/blockiert; Superadmin=200):
> - **`assignments.updateRule`** =
>   `@request.auth.role = "superadmin" || (@request.auth.id != "" && crew_email = @request.auth.email) || (@collection.plans.id ?= plan_id && @collection.plans.owner ?= @request.auth.id)`
>   → Crew ändert nur EIGENE Einsätze (crew_email = eigene, alle lowercase); Owner/superadmin alles.
>   createRule/deleteRule bewusst UNVERÄNDERT (`auth != ""`) — Crew-Confirm legt ggf. eigenen Record an.
> - **`crew_invites.createRule`** =
>   `@request.auth.role = "superadmin" || (@request.auth.id != "" && type = "availability") || (@collection.plans.id ?= plan_id && @collection.plans.owner ?= @request.auth.id)`
>   → nur Owner/superadmin dürfen invite/reminder/update/cancellation (mailen an Fremde); `availability`
>   (Crew-Bereitschaft, mailt NUR an Admin) bleibt jedem Eingeloggten erlaubt.
> ⚠️ **Coolify-Redeploy / Schema-Reimport SETZT DIESE REGELN ZURÜCK** auf das permissive `auth != ""`
> (wie beim strip-api/plans-viewRule) → nach jedem Reimport diese zwei Regeln erneut setzen. Das
> Schema-Import-JSON oben zeigt sie NICHT (bewusst permissiv für die Notfall-Wiederherstellung).

Assignment-Status-Werte: `proposed` → `confirmed` | `declined` | `pencilled` (v0.29.0, „vorgemerkt") | `cancelled` → `cancel_acked` (v0.30.0, Soft-Cancel statt Löschen)

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
