# v1.4.0 „Vorläufig vormerken“ als reine Information – Design (Hook v4.29)

## Warum
Vormerken soll Leuten aus dem Stammpool sagen: „Da kommt eine Tour, halte dir die Tage frei, vielleicht kommt eine Anfrage.“ Es ist **keine** Anfrage und **keine** Zusage. Die Person sieht die Termine mit dem klaren Hinweis „nur Information“, bestätigt mit OK und sieht sie dann in ihrer Tabelle. Danach darf sie nur absagen (einzelne Tage oder alle) oder eine eigene Absage zurück auf vorgemerkt setzen. So erfährt der Planer früh, wer nicht kann, und kann diese Leute aus dem Tourpool nehmen.

## Heute (Befund)
- Vormerken (`pencilInAssignment`, Sammel-Status „VORMERKEN“) verschickt keine Mail.
- Die Crew sieht vorgemerkte Tage in „Meine Einsätze“ (js/userView.js:224-260) mit kurzem Text und kann nur absagen. Bestätigen ist im Client und im Hook gesperrt.
- **Fehler im Konzept:**
  - Eine Einladung aus der Konsole nimmt vorgemerkte Tage mit (js/crewNotify.js:431-450, Filter `!== 'confirmed'`).
  - Der Hook setzt sie beim Senden auf `proposed` (.pb_hooks/main.pb.js ~1085).
  - Aus „vorgemerkt“ wird so still eine echte Anfrage.
- Absage → vorgemerkt ist heute verboten (Statusregeln js/pure.js:174-179 und Hook-Kopie main.pb.js:357-361).

## Entscheidungen des Nutzers
1. **Mail und Hinweis in der App:**
   - In der Konsole gibt es je Person „✉ Vormerkung mitteilen“: eine Sammelmail mit den vorgemerkten Tagen und dem Satz „nur Information, keine Anfrage“, mit Vorschau und Freitext wie bei der Einladung.
   - Beim nächsten Login sieht die Person zusätzlich ein Popup.
2. **Absage einer Vormerkung:** Der Planer bekommt sofort eine Mail, aber mit eigenem Betreff **„VORMERKUNG ABGESAGT“**, nicht „ABGELEHNT“.
3. **„gesehen ✓“:** Das OK im Popup ist für den Planer in der Konsole sichtbar.

## Lösung
**Neuer Status `pencil_declined` („vorgemerkt – abgesagt“).** Das Statusfeld ist ein freier Text, deshalb braucht es keine Schema-Änderung.
- Crew-Übergänge:
  - `pencilled → pencil_declined` (absagen)
  - `pencil_declined → pencilled` (Absage zurücknehmen)
- `pencilled → declined` entfällt für die Crew. `declined` bleibt nur für Absagen auf echte Anfragen.
- So kann niemand eine Absage auf eine echte Anfrage in eine Vormerkung zurückverwandeln.
- Für das Planen zählt `pencil_declined` wie „nicht verfügbar“, so wie `declined`:
  - erscheint in keinem Kalender und keinem ICS
  - Tabelle: durchgestrichenes Violett mit „✎✗“, Tooltip „Vormerkung abgesagt“
- Der Planer darf weiter alles: neu vormerken, anfragen, entfernen.

**Vormerkung bleibt Vormerkung.**
- Einladung, Erinnerung und Update aus der Konsole nehmen **keine** vorgemerkten Tage mehr mit.
- Der Hook (`/notify`) setzt vorgemerkte Datensätze nie auf `proposed`.
- Aus vorgemerkt wird nur über „→ Jetzt anfragen“ eine Anfrage, also bewusst durch den Planer.

**Info-Mail (neuer notify-Typ `pencil_info`):**
- Betreff „Vormerkung – nur Information · {Tour}“.
- Text: „Du bist für diese Termine vorgemerkt. Das ist **keine Anfrage**. Halte dir die Tage bitte frei. Ob du wirklich gebraucht wirst, erfährst du mit einer Anfrage. Wenn du schon weißt, dass du nicht kannst, sag bitte in der App ab.“
- Danach die Terminliste, der optionale Freitext und der Link zur App.
- Kein Bestätigen-Knopf. Der Hook schreibt dabei **keinen** Status.
- In der Konsole erscheint je Person „✉ Vormerkung mitteilen“, sobald sie vorgemerkte Tage hat, mit Vermerk „mitgeteilt am …“. Der Vermerk wird je Plan gespeichert, wie bei den Einladungen.

**Crew-Seite:**
- **Popup beim Öffnen**, wenn es vorgemerkte Tage gibt, die die Person noch nicht mit OK bestätigt hat:
  - Titel „ℹ Nur zur Information“
  - Text „Das ist keine Anfrage …“
  - Liste der Tage
  - Knopf „OK, verstanden“
- Das OK merkt sich im Browser die bestätigten Tage. Zusätzlich schreibt es **einen** Eintrag `pencil_seen` in `activity_log`, je Plan und Person. Diese Collection darf jede angemeldete Person beschreiben, eine Regeländerung ist also nicht nötig.
- Im Popup gibt es kein Absagen, nur OK. Abgesagt wird danach in der Tabelle bzw. in „Meine Einsätze“.
- **Meine Einsätze / Zelle:**
  - vorgemerkter Tag: „✗ Absagen“
  - abgesagte Vormerkung: „↩ Wieder vormerken“
  - im Abschnitt „✎ Vorgemerkt“ zusätzlich „✗ Alle absagen“
  - nichts sonst, kein Bestätigen

**Planer-Seite (Konsole):**
- In der Crew-Karte je Person:
  - „✉ Vormerkung mitteilen“
  - „gesehen ✓ {Datum}“ aus `activity_log` (`pencil_seen`, jüngster Eintrag)
  - Zähler „✎✗ n Vormerkungen abgesagt“
- Der Aktivitäts-Tab zeigt `pencil_seen` („hat die Vormerkung gesehen“, 👁) und `pencil_declined` bzw. `pencil_restored`.

**Hook v4.29 (Auftrag an den Admin):**
1. Statusregeln wie oben, in pure.js und im Hook gleich. `tests/statusguard.test.mjs` vergleicht beide.
2. Nach-Update-Mail:
   - bei `pencil_declined` → Mail an den Admin „VORMERKUNG ABGESAGT · Position · Datum · Name“
   - bei `pencil_declined → pencilled` → „VORMERKUNG WIEDER FREI · …“
   - die bisherige „ABGELEHNT“-Mail nur noch für `declined`
3. `/notify`:
   - neuer Typ `pencil_info` (Mail-Vorlage, kein Status-Schreiben, gleiche Drosselung wie Einladungen)
   - Einladung, Erinnerung und Update überspringen Datensätze mit Status `pencilled` und `pencil_declined`, statt sie auf `proposed` zu setzen
4. `/planstatus` (Crew) liefert `pencil_declined` mit, damit die Crew zurücknehmen kann.
5. Version 4.29, Changelog.

**Reihenfolge (zwingend):**
1. Hook v4.29 auf **Test**, dazu Rückmeldung.
2. App v1.4.0 auf Test, Nutzer prüft.
3. Hook v4.29 auf **Live**, dazu Rückmeldung.
4. App v1.4.0 live.

Die App sendet `pencil_declined` und `pencil_info` erst, wenn der passende Hook läuft. Vorher würde der Server ablehnen. Deshalb darf die App erst nach dem Hook auf eine Umgebung.

## Nicht-Ziele
- Kein Bestätigen von Vormerkungen durch die Crew.
- Keine automatische Mail beim Vormerken. Mitteilen ist ein bewusster Knopfdruck.
- Keine Schema- oder Regeländerung.

## Prüfung
- Tests:
  - Statusregeln in pure.js und im Hook gleich
  - Crew: `pencilled→pencil_declined→pencilled` erlaubt; `declined→pencilled`, `pencil_declined→confirmed` und `pencilled→confirmed` verboten
  - Einladung nimmt keine vorgemerkten Tage mit
  - `pencil_info`-Nutzlast festgeschrieben
  - Popup erscheint nur bei unbestätigten Vormerkungen
  - `pencil_seen` wird genau einmal je OK geschrieben
  - Rot-Nachweise
- Hook: die bestehenden Hook-Tests (Muster tests/hook*.test.mjs), dazu die neuen Fälle.
- Klick-Durchlauf im Headless-Chrome gegen eine nachgebildete Datenbank:
  - Crew: Popup, OK, absagen, zurücknehmen
  - Planer: mitteilen, gesehen ✓ erscheint
- Auf Test nach dem Hook-Deploy echt mit einem Crew-Testkonto. Die README warnt, dass Test dafür ein Crew-Konto mit passender Adresse braucht. Das bereite ich vor bzw. benenne es.
