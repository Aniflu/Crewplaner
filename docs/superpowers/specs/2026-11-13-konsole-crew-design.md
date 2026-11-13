# v1.2.3 Fehler „falscher Plan aus der Konsole“ + v1.3.0 Crew & Positionen in die Konsole

## Context
1. **Fehler (v1.2.3):** In der Konsole wird ein Plan geladen (z. B. „Provinz 2027“). Ein Klick auf „👥 Crew & Positionen“ landet in der Touransicht in einem anderen Plan („AMK 2027“). Ursache: `_adminPlanAction(action)` ([admin.html:1407-1410](admin.html#L1407-L1410)) merkt sich nur die Folgeaktion (`tourplan_pending_action`) und springt nach `index.html`. Den geladenen Plan gibt sie **nicht** mit. Die Touransicht öffnet den zuletzt aktiven Plan. Betroffen sind alle vier Knöpfe: Tourblock einfügen, Bereich → Block, Datum hinzufügen, Crew & Positionen. Der Fehler besteht seit v0.9.9.3. Korrekt arbeitet nur „→ In Touransicht laden“ (`loadPlanIntoTourview`, admin.html:1412, mit `_planTransfer_*`, ausgewertet in js/authService.js ~55-90).
2. **Wunsch (v1.3.0):** Alles rund um die Crew wird in der Konsole verwaltet und verschwindet aus der Touransicht. Dazu gehören Positionen, Einladen und Updates senden (Entscheidung des Nutzers).

Versionen (Entscheidung des Nutzers): **v1.2.3** nur den Fehler sofort, **v1.3.0** den Umbau, „vorläufig vormerken“ wird **v1.4.0**.

## Teil 1 – v1.2.3 (sofort)
- `loadPlanIntoTourview` und `_adminPlanAction` nutzen **eine** gemeinsame Übergabe. Dafür kommt `loadPlanIntoTourview` in eine neue Funktion `_transferPlanToTourview(action)`: Sie schreibt die `_planTransfer_*`-Schlüssel und, falls vorhanden, `tourplan_pending_action` und navigiert dann. Ohne geladenen Plan erscheint die bestehende Meldung „Kein Plan geladen“ (adminToast), es gibt keinen Sprung.
- `_adminPlanAction(action)` ruft `_transferPlanToTourview(action)` auf, und `loadPlanIntoTourview()` ruft `_transferPlanToTourview()` auf.
- Prüfen, dass die Folgeaktion in `js/init.js:154-161` erst **nach** dem Laden aus der DB läuft. Seit v1.2.1 lädt die Touransicht den übergebenen Plan per PB-ID frisch. Sonst öffnet der Dialog auf der Vorschau. Muss die Reihenfolge angepasst werden, dann minimal.
- **Test:** In `tests/adminmodal.test.mjs` oder neu: Struktursperre, dass `_adminPlanAction` die Übergabe aufruft, also `_planTransfer_pbid` setzt bzw. `_transferPlanToTourview` aufruft. Verhaltenstest über die Plan-Übergabe in `authService` (loadGraph): Zuletzt aktiv war Plan X. Übergabe von Plan Y mit Folgeaktion. Dann gilt: aktiver Plan = Y, `tourplan_active_pb_id` = Y. Rot-Nachweis: alte `_adminPlanAction` lässt die Sperre fallen.
- Versionsstellen v1.2.3, README-Eintrag, Cachebuster.
- Push `main`, Nutzerprüfung auf Test, **live nur nach Freigabe**.

## Teil 2 – v1.3.0 Crew & Positionen in der Konsole (Design)
**Weg (meine Wahl, Variante C):** Ein in der Konsole geladener Plan wird zum **aktiven Plan**, genau wie in der Touransicht. Gesetzt werden `tourplan_active_pb_id`, die lokale ID und `tourplan_pb_<lokal>`, geladen wird über `loadPlanForManager` mit Basisstand für den Speicherschutz, dazu `loadCrewMeta` und `loadAssignmentStatuses`. Die Konsole nutzt dann **dieselben** Funktionen wie heute die Touransicht:
- Crew: `js/crew.js` (renderCrew, removeCrew, renameCrew, openImportCrewModal, createAndTakeCrew, confirmImportCrew)
- Positionen: openAddPos und die übrigen Positionsfunktionen
- Einladen: `js/crewNotify.js`
- Updates: Update-Liste und Versand in `js/userView.js` (`_openUpdateQueueModal`)

Gespeichert wird über `_savePlanToLS`, also geschützt durch planSync. Es entsteht keine zweite Logik. Die Funktionen zeichnen die Tabelle der Touransicht nur, wenn es sie gibt (`hasTableView()`); wo das fehlt, kommt diese Prüfung dazu.

**Konsole:**
- Die Karte „Crew benachrichtigen“ wird zur großen Karte **„👥 Crew & Positionen“** unter „Plan auswählen“.
  - Crew-Liste mit ✎ umbenennen und ✕ entfernen
  - „＋ Aus Crew-Pool hinzufügen“ und „＋ Neue Person anlegen“
  - je Person der Einladestatus mit „✉ Einladen“
  - Positionen-Liste mit hinzufügen, umbenennen und löschen
  - „↻ Updates senden (n)“, wenn die Update-Liste dieser Tour Einträge hat
- Die bisherigen Plan-Werte (`_wrk*`) werden aus dem aktiven Plan befüllt, damit PDF, ICS und Export weiter funktionieren.
- Alle Rückfragen laufen über den Projektdialog (`showConfirm`), nie über Browser-Abfragen. Diese Regel bekommt der Subagent ausdrücklich mit.

**Touransicht:**
- Die Seitenleisten-Knöpfe „👥 Crew & Positionen“ und „↻ Updates senden“ fallen weg, ebenso das Einladen im Personen-Menü (genaue Stellen bei der Umsetzung per grep auf crewNotify/openCrewNotifyModal).
- Stattdessen erscheint ein Hinweis-Knopf **„👥 Crew in der Konsole verwalten“**. Liegen Updates in der Liste, zeigt er „↻ n Updates offen – in der Konsole senden“. Er springt mit `#crew` in die Konsole, der aktive Plan bleibt erhalten.
- Die Crew-Liste in der Seitenleiste bzw. im „▶ Crew“-Fach bleibt als reine Anzeige mit Farben, ohne Bearbeiten-Knöpfe.

**Nicht-Ziele:** keine Änderung an Hook oder Schema; die Stammbesetzung pro Position bleibt in der Tabellenkopfzeile der Touransicht, denn sie gehört zum Planen.

**Umsetzung v1.3.0** nach v1.2.3 per Subagent (Sonnet), dazu ein Review, ein Klick-Durchlauf im Headless-Chrome gegen eine nachgebildete Datenbank und Bildschirmfotos (hell, dunkel, 390 px). Detailplan per writing-plans, sobald v1.2.3 auf Test ist.

## Prüfung
- **v1.2.3:**
  - Tests in beiden Zeitzonen über den pre-push-Hook.
  - Rot-Nachweis für die neue Sperre.
  - Auf Test: In der Konsole „Provinz 2027“ laden, „👥 Crew & Positionen“ drücken, dann muss sich die Touransicht mit „Provinz 2027“ und dem Crew-Dialog öffnen. Ebenso bei den anderen drei Knöpfen.
- **v1.3.0:** In der Konsole Plan laden, Person anlegen bzw. aus dem Pool hinzufügen, umbenennen, entfernen, Position anlegen, einladen und Updates senden. Danach muss gelten:
  - `plan_data` und `crew_members` sind korrekt.
  - Der Speicherschutz greift, wenn die Touransicht in einem anderen Tab etwas ändert.
  - In der Touransicht gibt es keine Crew-Bearbeitung mehr, aber den Hinweis-Knopf.
  - Keine Browser-Abfragen, die Sperre ist grün.
