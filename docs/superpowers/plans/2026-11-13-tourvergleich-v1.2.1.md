# Tourvergleich v1.2.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Spec: docs/superpowers/specs/2026-11-13-tourvergleich-v1.2.1-design.md (Abschnitte „Design“ sind bindend).

## Global Constraints
- Version v1.2.1. Arbeit auf main, Push erst nach grünem pre-push-Hook, nie nach live.
- Vor „Speichern“ KEIN Schreibaufruf (PATCH/POST/DELETE) an PocketBase aus dem Tourvergleich.
- Absage nur über removeAssignmentSlot(…, { planId, statuses }) + queueAddRemoved auf crewplan_updates_<pbId>; nie Mails.
- Platzhalter __offen__/__offday__/__reise_tag__/__ausschreiben__ sind keine Personen; Namen nur über sameCrew/normCrewName.
- Tourfarben A #2bb5a0, B #f08a3c; esc() für alle Nutzerstrings; Symbole statt Textkürzel.
- Keine echten Mailadressen/Server-Kennungen in eingecheckten Dateien. Gestartete Prozesse beenden.

## Umsetzung
1. **js/tourvergleich.js** (rein, getestet):
   - `planSwitch({ a, b, date, name, to }) → { steps, needsPick }` ersetzt `planMove` (entfernen).
   - `diffPlans(orig, draft, dates?) → Array<{ date, posId, before, after }>`: vergleicht die effektiven Werte je Tag und Position. Ein Hin- und Her-Weg zurück auf den Ausgangswert erzeugt keinen Eintrag.
   - `staleSlots(orig, fresh, diffs) → diffs`: die Plätze, deren frischer Wert vom geladenen abweicht.
   - Für den Entwurf `applySlot`, wie es heute existiert.
   - Tests:
     - A→B→A ergibt einen leeren Diff.
     - Keine freie Stammposition ergibt `needsPick`.
     - Zwei Positionen in der anderen Tour werden beide OFFEN.
     - `staleSlots` erkennt eine Fremdänderung genau am betroffenen Platz und ignoriert Fremdänderungen an anderen Plätzen.
     - Eingaben werden nicht verändert.
2. **js/tourvergleich-ui.js:**
   - Bündel bekommen `orig` (geladener `plan_data`) und `draft` (Arbeitskopie). Alle Klicks ändern nur `draft`, ohne Netz.
   - Raster und Tafel rendern `draft` mit ✎-Markierung aus `diffPlans`.
   - Die Leiste mit Speichern/Verwerfen und Zählern.
   - Die Bestätigungsliste über das vorhandene Dialog-Muster (`js/dialog.js`, wie im Admin genutzt) bzw. ein `modal-bg`.
   - `tvSave()` mit den Schritten 1–4 oben, Doppelklick-Sperre (`busy`) und Fehlermeldung rot mit Neuladen der Bündel.
   - `tvDiscard()`.
   - Abfrage bei ungespeicherten Änderungen (`tvCompare`, Tour-Selects, `switchTab`-Hook, `beforeunload`).
   - Das Menü für gemeinsame Personen an gemeinsamen Tagen, `tvMove` → `planSwitch`, bei `needsPick` die Tafel mit Hinweis.
   - Struktursperren bleiben: Absage nur über `removeAssignmentSlot` mit `planId`, keine Mails, `pbGet` vor `pbPatch`. Neu:
     - Kein `pbPatch`/`removeAssignmentSlot` außerhalb von `tvSave`.
     - Genau ein Patch je Tour.
3. **admin.html:** Markup für die Leiste und den Bestätigungsdialog, CSS (hell, dunkel, 390 px), Hinweistexte.
4. **Version v1.2.1:** README-Eintrag, index.html, login.html, admin.html, Cachebuster `app.js?v=61` und `admin-app.js?v=21`. Abschnitt in docs/guide-admin.html anpassen, mit Entwurf, Speichern, Verwerfen und dem Menü.

Umsetzung per Subagent (Sonnet für 1–3, Haiku für 4), dazu ein kombiniertes Review.

## Prüfung
- `node tests/run.mjs` in beiden Zeitzonen über den pre-push-Hook.
- Rot-Nachweise:
  - `diffPlans` ohne Vergleich der effektiven Werte muss den A→B→A-Test fallen lassen.
  - Eine Schutzprüfung, die immer leer liefert, muss den Fremdänderungs-Test fallen lassen.
- **Klick-Durchlauf im Headless-Chrome gegen eine nachgebildete PocketBase** (wie v1.2.0). Ausgangslage: Tom ist in B bestätigt.
  1. Klicks (→ A, → B, → A, Anna → B) lösen **keinen** Schreibaufruf aus. Die Aufrufliste enthält nur GETs.
  2. Verwerfen stellt die Anzeige wieder her, ohne einen einzigen Schreibaufruf.
  3. Erneut → A, dann Speichern: Genau ein PATCH je Tour. Tom wird in B abgesagt und steht in der Update-Liste von B. Kein Mail-Aufruf.
  4. A→B→A eines bestätigten Platzes und Speichern: **keine** Absage, kein PATCH auf `assignments`.
  5. Fremdänderung genau am betroffenen Platz zwischen Laden und Speichern: Diese Tour wird nicht geschrieben, es kommt eine Meldung, der Entwurf bleibt. Eine Fremdänderung an einem anderen Platz bleibt nach dem Speichern erhalten.
  6. Menü auf einer Zelle ohne Konflikt (Zustand A) vorhanden. Nicht-Treffer: Eine Person nur in einer Crew öffnet direkt die Tagestafel.
- Sichtprüfung von Leiste, Bestätigungsdialog und Menü mit ✓ (hell, dunkel, 390 px), danach Server und Chrome beenden.
- Push auf `main` (Test), der Nutzer prüft dort. **Live erst nach Freigabe.**

## Nachtrag (vom Nutzer freigegeben 2026-11-13): Touransicht lädt nie mehr veraltet und überschreibt nicht blind

**Befund:** Manager-Touransicht lädt beim Start (`js/authService.js` ~98–103: `pbPlanCached ? Promise.resolve() : loadPlanForManager()`) und beim Tourwechsel (`switchPlan` → `_loadPlanFromLS`, js/plans.js:76) nur den Browser-Zwischenspeicher. `_savePlanToLS` (32 Aufrufer, Autospeichern) patcht diesen Stand blind in PocketBase → überschreibt Änderungen aus Tourvergleich, Admin-Werkzeugen oder anderen Geräten.

**Lösung:**
1. **Immer aus der DB laden:** Start und `switchPlan` zeigen den Zwischenspeicher nur als Vorschau und laden danach `loadPlanForManager()` + `loadCrewMeta()` + `loadAssignmentStatuses()` für den Plan mit bekannter PB-ID, dann neu rendern und den Zwischenspeicher mit dem DB-Stand überschreiben.
2. **Schutz vor Überschreiben in `_savePlanToLS`:** Je PB-Plan wird beim Laden aus der DB ein Basisstand gemerkt (normalisiertes `plan_data`). Vor jedem PATCH: Plan frisch lesen; weicht er vom Basisstand ab (oder gibt es keinen Basisstand) → **nicht schreiben**, DB-Stand laden und anzeigen (wenn aktiver Plan), Zwischenspeicher aktualisieren, roter Hinweis „Die Tour wurde zwischendurch woanders geändert – neu geladen. Bitte deine letzte Änderung wiederholen.“ Nach erfolgreichem PATCH ist der gesendete Stand der neue Basisstand. Speichervorgänge je Plan nacheinander (keine Fehlalarme durch eigene, gleichzeitige Saves). Neu-Anlage ohne PB-ID unverändert.
3. **Tourvergleich** aktualisiert nach dem Speichern den Zwischenspeicher `tourplan_plan_<lokaleId>` dieses Browsers für jede gespeicherte Tour (Zuordnung über `tourplan_pb_<lokaleId>` = PB-ID).

**Prüfung:** Unit-Tests mit gemocktem fetch (loadGraph): (a) Basis gleich → PATCH; (b) DB zwischendurch geändert → kein PATCH, State = DB-Stand, Hinweis; (c) kein Basisstand → kein PATCH; (d) zwei schnelle Saves hintereinander → beide PATCH, kein Fehlalarm; (e) Start mit gecachtem Plan lädt trotzdem aus der DB; (f) switchPlan lädt aus der DB. Rot-Nachweis für (b). Bestehende Tests (plans/phantomplan/flows) bleiben grün.
