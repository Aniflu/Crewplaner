# Tourvergleich v1.2.1: Entwurfsmodus mit Speichern/Verwerfen, Menü immer verfügbar

## Context
v1.2.0 ist auf Test. Rückmeldungen des Nutzers:
1. Das kleine Menü (→ A / → B / 📋 Tagestafel) erscheint nur auf ⚠-Konfliktzellen. Nach dem ersten Zuordnen öffnet ein Klick nur noch die Tagestafel. Wer sich verklickt oder Varianten durchprobieren will, kommt nicht schnell zurück. Gewünscht: **immer** das Menü.
2. Bisher speichert jeder Klick sofort in die Touren. Gewünscht sind ein **„Speichern“** und ein **„Verwerfen“**: Man probiert erst alles im Vergleich durch. In den Touren passiert erst etwas, wenn man auf Speichern drückt.

Befund im Code:
- Das Menü hängt an `data-act="menu"` nur bei `state === 'conflict'` ([js/tourvergleich-ui.js](js/tourvergleich-ui.js), Zellen-Render).
- `tvApply` schreibt pro Klick sofort (Plan frisch lesen → Status absagen → patchen).
- `planMove` ([js/tourvergleich.js:125](js/tourvergleich.js#L125)) macht nur die Plätze in der anderen Tour offen und setzt die Person nicht in die gewählte Tour. Hin- und Herklicken würde die Person deshalb aus beiden Touren nehmen.

## Design

### Entwurf statt Sofort-Speichern
- Nach „Vergleichen“ arbeitet die Ansicht auf einer **Arbeitskopie** beider Touren. Jeder Klick ändert nur die Kopie. Raster, Zählung und Tagestafel zeigen den Entwurf.
- Geänderte Plätze werden markiert (✎-Punkt in der Zelle bzw. Zeile der Tafel).
- Unten fest eine Leiste: **„✎ n Änderungen · ⚠ m Konflikte übrig“**, **[💾 Speichern]** und **[↩ Verwerfen]**. Beide Knöpfe sind gesperrt, solange es keine Änderungen gibt.
- **Verwerfen:** Nach einer Rückfrage wird die Arbeitskopie auf den geladenen Stand zurückgesetzt. Es wird nichts geschrieben.
- **Speichern:** Zuerst kommt eine Bestätigung mit einer Liste je Tour: Tag, Position, vorher → nachher. Dazu kommt der Hinweis „Diese bestätigten/angefragten Leute bekommen eine Absage in die Update-Liste: …“. Sind noch Konflikte übrig: „Es gibt noch m Konflikte – trotzdem speichern?“. Nach OK:
  1. Je Tour den Plan **frisch lesen**.
  2. **Schutzprüfung:** Für jeden geänderten Platz muss der frische Wert dem beim Laden gelesenen Wert entsprechen. Weicht einer ab, weil die Tour zwischendurch woanders geändert wurde, wird für **diese Tour nichts geschrieben**. Es kommt die Meldung „{Tour} wurde zwischendurch geändert ({Tag} {Position}) – bitte neu vergleichen“. Der Entwurf bleibt erhalten.
  3. Für verdrängte Plätze mit Status bestätigt oder angefragt: `removeAssignmentSlot(…, { planId, statuses })` und ein Eintrag in die Update-Liste der Tour. Das ist der bestehende Weg. Hinweis wie bisher, mit Warnung bei fehlender Mailadresse.
  4. **Ein** `pbPatch` je Tour mit allen Änderungen. Danach die Bündel neu laden, der Entwurf ist dann leer.
- Hat sich eine Person im Entwurf hin und her bewegt und landet am Ende wieder auf ihrem alten Platz, ist das **keine Änderung**. Es geht keine Absage raus.
- Tourwechsel, erneutes „Vergleichen“, Tabwechsel oder Verlassen der Seite mit offenen Änderungen fragen nach: „Ungespeicherte Änderungen verwerfen?“ (beim Verlassen der Seite über `beforeunload`).
- Hinweiszeile neu: „Änderungen werden erst mit 💾 Speichern in die Touren übernommen.“ Die Warnung zur gleichzeitig offenen Touransicht bleibt, ist aber weniger kritisch, weil die Schutzprüfung greift.

### Menü immer
- Jede Zelle einer **gemeinsamen** Person (in beiden Crews) an einem Tag, den **beide** Touren haben, öffnet das Menü. Das gilt auch für die Zustände A, B, freeBoth und Konflikt.
  - Einträge: `→ {Tour A}` · `→ {Tour B}` (✓ an der Tour, in der die Person gerade steht, trotzdem klickbar) · `📋 Tagestafel`.
- Andere Zellen (Person nur in einer Crew, Tag nur einer Tour) öffnen weiter direkt die Tagestafel.

### „→ zu X“ (neu `planSwitch`, ersetzt `planMove`)
- In der anderen Tour werden alle Plätze der Person an diesem Tag OFFEN.
- In X: Steht die Person dort schon, bleibt es so. Sonst kommt sie auf ihre **Stammposition** in X zurück, sofern der Platz frei ist (`''`, OFFEN oder AUSSCHREIBEN). Damit ist die Abweichung wieder weg.
- Keine freie Stammposition: Es wird nichts geraten. Die Tagestafel öffnet sich mit dem Hinweis „{Name} hat in {Tour X} keine freie Stammposition – bitte Platz wählen“ und der Kandidatenliste von X.

**Meine Festlegungen:**
- Speichern ist auch mit übrigen Konflikten erlaubt, nach einer Rückfrage. Teilergebnisse sollen sicherbar sein.
- Die Schutzprüfung bricht nur die betroffene Tour ab, die andere wird gespeichert.

**Nicht-Ziele:** kein Rückgängig Schritt für Schritt (Verwerfen setzt alles zurück), keine Änderung an Hook oder Schema, keine Mails.

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
