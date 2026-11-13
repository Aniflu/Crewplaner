# Tourvergleich (v1.2.0): zwei Touren nebeneinander, Personal jonglieren

## Context
Zwei Touren (Band A, Band B) haben teils dasselbe Stammpersonal. Normalerweise touren sie nicht gleichzeitig, jetzt überschneiden sich aber Termine. Der Nutzer will im Adminbereich zwei Touren wählen und dann sehen:
- an welchen Tagen sich die Touren überschneiden,
- welche Leute an diesen Tagen in beiden Touren eingeplant oder möglich sind.

Direkt dort verteilt er die Leute: Mensch 1 zu A, Mensch 2 zu B. Infrage kommt das Personal, das schon in der Crew der jeweiligen Tour steht.

Vorbild sind Rentman, Float und Ganttic: Personen als Zeilen, Tage als Spalten, Buchungen in Projektfarbe, Doppelbuchung rot, Umbuchen per Klick.

Entschieden: **Raster als Übersicht, Klick auf einen Tag öffnet die Tagestafel A | B** (Variante C). Version **v1.2.0**.

## Was es heute gibt (genutzt, nicht neu gebaut)
- Planinhalt (`plans.plan_data`): `crew[]`, `positions[]`, `defaultCrew{posId→Name}` als Stammbesetzung, `assignments{date→{posId→Wert}}` als Abweichung je Tag, `tourDates[]`.
- Wer an einem Tag wirklich arbeitet, berechnet `getVal` in [js/utils.js:14](js/utils.js#L14): erst die Abweichung, sonst die Stammbesetzung. Platzhalter wie `OFFEN`, `OFFDAY`, `REISE_TAG` und `AUSSCHREIBEN` ([js/state.js](js/state.js)) sind keine Personen.
- Namen werden mit `sameCrew`/`normCrewName` verglichen ([js/pure.js:29](js/pure.js#L29)).
- Der Status einer Besetzung (angefragt, bestätigt, vorgemerkt) steht in der Collection `assignments`. Wie das Herausnehmen funktioniert, regelt `removeAssignmentSlot`/`softCancelAssignment` in [js/dataService.js:637-720](js/dataService.js#L637). Bestätigte oder angefragte Besetzungen werden auf `cancelled` gesetzt und landen in der Update-Liste (`_queueRemovedSlot`, [js/userView.js:601](js/userView.js#L601)). Diese Funktionen hängen heute am **aktiven** Plan.
- Die Admin-Konsole lädt schon jeden Plan einzeln mit Plan, Crew-Mails und Status: `loadSelectedPlan` in [admin.html:1444](admin.html#L1444). Die Planliste kommt aus `loadAdminPlans`: Manager sehen ihre eigenen Pläne, Superadmins alle.
- Hook, Schema und Zugriffsregeln: **keine Änderung nötig**. Plan-PATCH ist für Eigentümer und Superadmin erlaubt. Deshalb ist kein Admin-Auftrag nötig.

## Design

### Bedienung
Neuer Admin-Tab **„🔀 Tourvergleich“**, sichtbar wie „Werkzeuge“.
1. Kopfzeile: zwei Auswahllisten für Tour A und Tour B, Knopf „Vergleichen“. Jede Tour bekommt eine feste Akzentfarbe, A blaugrün und B orange.
2. Schalter: „nur Überschneidungstage“ (Standard an) und „nur gemeinsame Leute“ (Standard an).
3. **Raster:** Zeilen sind die Personen, gemeinsame Leute oben. Spalten sind die Tage. Jede Zelle ist zweigeteilt, oben A und unten B, jeweils mit dem Kürzel der Position.
   - ⚠ rot umrandet: in beiden Touren eingesetzt, also ein Konflikt.
   - gestrichelt: in beiden Crews und an dem Tag noch frei, also verfügbar.
   - Fußzeilen „A offen n“ und „B offen n“ je Tag, farbig: grün bei 0, rot bei offenen Plätzen.
   - Spaltenkopf: Datum und Wochentag, darunter je Tour ein Farbbalken für die Tagesart (Show, Reise, Aufbau) mit Ort im Tooltip.
   - Kopfzeile oben: „n Konflikttage · m Personen doppelt“.
4. **Tagestafel** öffnet sich per Klick auf einen Spaltenkopf oder eine Zelle. Sie zeigt zwei Spalten A | B mit allen Positionen: aktuelle Person und Statussymbol (✓ bestätigt, ⏳ angefragt, ✎ vorgemerkt). Personen im Konflikt sind rot. Mit Pfeilen geht es zum vorigen oder nächsten Überschneidungstag.
   - Klick auf einen Platz öffnet die Personenauswahl aus der Crew dieser Tour, sortiert: 🟢 frei · 🟡 „bei B als GL“ (Auswahl zieht die Person dort ab, ihr Platz in B wird ⚠ Offen) · ⚪ schon in derselben Tour auf anderer Position. Dazu kommen „⚠ Offen“ und „↩ Stammbesetzung“.
   - Im Raster gibt es als Abkürzung „→ nur A“ bzw. „→ nur B“: Die Person behält ihren Platz in der einen Tour, ihr Platz in der anderen wird Offen.
   - Unten die Leiste „Frei an diesem Tag“ mit Chips für Personen ohne Einsatz.

### Speichern (pro Klick, sofort)
- Vor jedem Schreiben den Plan-Datensatz **frisch lesen**, nur den einen Platz ändern und `plan_data` patchen. Entspricht der neue Wert der Stammbesetzung, wird die Abweichung entfernt.
- Hatte der verdrängte Platz den Status bestätigt oder angefragt: Status auf `cancelled` setzen und einen Eintrag in die **Update-Liste dieser Tour** schreiben. Die Tafel meldet dann: „Absage für X liegt in der Update-Liste von Tour B – Versand dort über ‚Updates senden‘“. Bei vorgemerkt oder abgelehnt wird der Statuseintrag gelöscht. **Der Vergleich verschickt nie selbst Mails.**
- Neu eingesetzte Personen bekommen keinen Statuseintrag, wie in der Tabelle auch. Angefragt wird wie bisher über „Einladen/Updates“ in der Touransicht.
- Jede Änderung kommt ins Aktivitätsprotokoll (`logActivity`).
- Hinweis in der Ansicht: „Beide Touren nicht gleichzeitig in der Touransicht geöffnet haben.“ Deren automatisches Speichern würde sonst überschreiben.

### Nicht-Ziele
- Mehr als zwei Touren.
- Automatisches Verteilen (Vorschlagsalgorithmus).
- Ziehen mit der Maus (Klick reicht und funktioniert auch mobil).
- Änderungen an Hook oder Schema.
- Mailversand aus dem Vergleich.

## Umsetzung (Dateien)
1. **Neu `js/tourvergleich.js`** (rein, ohne DOM, mit Tests) – Kernlogik:
   - `effective(planData, date, posId)`: wie `getVal`, aber mit Plan als Parameter.
   - `overlapDays(a, b)`, `personMatrix(a, b, opts)` mit den Zellzuständen `conflict|A|B|freeBoth|freeA|freeB|none`, `dayDemand(plan, date)`.
   - `candidates(planX, planY, date, posId)` mit Sortierung frei, andere Tour, gleiche Tour.
   - `applySlot(planData, date, posId, value)`: gibt neuen `plan_data` zurück und entfernt die Abweichung, wenn der Wert der Stammbesetzung entspricht.
   - `planMove(...)`: liefert die nötigen Schreibschritte für beide Touren, inklusive „Platz in der anderen Tour → OFFEN“.
2. **[js/dataService.js](js/dataService.js):** `removeAssignmentSlot`, `softCancelAssignment` und `cancelProposal` bekommen den optionalen Parameter `{ planId, statuses }`. Ohne Parameter bleibt alles wie bisher. So bleibt es **ein** Weg für das Herausnehmen, keine zweite Kopie.
3. **[js/userView.js](js/userView.js):** `_queueRemovedSlot` mit optionalem Plan-Schlüssel, Schlüsselbildung wie `_queuePlanKey`.
4. **Neu `js/tourvergleich-ui.js`**: Laden zweier Pläne mit eigenem Bündel je Plan, ohne die Admin-Globals `TOUR_DATES/POSITIONS/...` anzufassen; Raster, Tagestafel, Auswahl und Speichern. Anbindung über `js/admin-app.js` wie die bestehenden Module.
5. **[admin.html](admin.html):** Tab-Knopf, Abschnitt `tabTourvergleich`, CSS für Raster, Zelle, Tafel (dunkel und hell, mobil: nur das Raster scrollt waagerecht, Spalte mit Namen bleibt stehen).
6. Version **v1.2.0** in README (oberster Eintrag), index.html, login.html und admin.html, dazu `?v=`-Cachebuster. Ein Abschnitt in `docs/guide-admin.html`.

## Prüfung
- **Unit-Tests** `tests/tourvergleich.test.mjs` mit echten Datenformen (`plan_data` wie von PB geliefert, inklusive Platzhaltern und Stammbesetzung ohne Abweichung). Geprüft werden: Konflikt über Stammbesetzung, Konflikt über Abweichung, kein Konflikt an Tagen ohne Überschneidung, Platzhalter zählen nicht als Person, Namensvergleich ohne Groß-/Kleinschreibung, `applySlot` entfernt die Abweichung bei Rückkehr zur Stammbesetzung. Rot-Nachweis: Konfliktregel absichtlich kaputt machen, der Test muss fallen.
- **Sperre am Aufrufort:** Ein Test stellt sicher, dass die UI `removeAssignmentSlot` mit `planId` aufruft und keine eigene Kopie der Herausnahme hat.
- `node tests/run.mjs`, beide Zeitzonen über den pre-push-Hook.
- **Abnahme auf Test** (zwei Testpläne):
  - Mensch 1 an Tag X in A und B als Treffer, Mensch 2 an einem Tag ohne Überschneidung als Nicht-Treffer.
  - Mensch 1 → „nur A“: In B ist der Platz Offen, A ist unverändert, Mensch 2 ist unberührt (beide Plan-Datensätze per API gegenlesen).
  - Ein bestätigter Platz in B wird verdrängt: Der Statuseintrag ist `cancelled`, die Update-Liste von B hat den Eintrag, keine Mail im E-Mail-Log.
- Den Tab per Headless-Chrome-Screenshot prüfen (Desktop und Handybreite), danach den Browser beenden.
- Ablauf: Commit auf `main`, Push, der Nutzer prüft auf der Test-Seite, **live erst nach Freigabe**.

## Ablauf nach Freigabe
Design als `docs/superpowers/specs/2026-11-13-tourvergleich-design.md` committen, danach den Detailplan mit `superpowers:writing-plans`, Umsetzung mit `superpowers:subagent-driven-development`: Sonnet für die Logik und die UI, Haiku für Version und Doku, Opus prüft.
