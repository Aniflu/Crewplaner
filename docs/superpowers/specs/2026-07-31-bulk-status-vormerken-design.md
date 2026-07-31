# Design — Sammel-Statuswechsel „bestätigt ⇄ vorgemerkt" + Status im Kalender (v0.50.0)

Stand: 2026-07-31 · Status: **approved**

## Problem

Der Zell-Status **„vorgemerkt" (✎)** aus v0.29.0 markiert Termine, die geplant, aber noch
nicht verbindlich sind. Setzen lässt er sich bisher **nur Zelle für Zelle**. Bei einer Tour mit
30–60 Tagen × mehreren Positionen ist das für eine ganze Person unbrauchbar — Zitat des Users:
„sau umständlich auf alle Personen zu münzen".

Für die Gegenrichtung existiert die Sammelaktion längst: „✓ Alle Termine von X bestätigen"
(`openCrewDD`, dropdown.js). Für ✎ fehlt sie.

## Ziel

Der Manager wählt **Personen → Tourblöcke → einzelne Tage** und setzt deren bestätigte Termine
in einem Rutsch auf vorgemerkt — und ebenso zurück.

Zwei Anforderungen aus dem Brainstorming greifen über den Dialog hinaus:

1. **Vorgemerkte Termine bleiben im Kalender.** Heute filtern sowohl der abonnierbare
   Server-Feed als auch der Client-Export strikt auf `confirmed` — eine Vormerkung ließe den
   Termin im Kalender der Person still verschwinden. Stattdessen: Termin bleibt, der **Status
   steht im Infofeld** und ändert sich beim Umschalten mit.
2. **Die Crew wird informiert** — nicht automatisch, sondern über die bestehende
   **Update-Queue** („Updates senden"-Knopfdruck), analog zu entfernten Terminen (v0.30.0).

## Entscheidungen

| Frage | Entscheidung | Begründung |
|---|---|---|
| Auswahl-Umfang | Person → Tourblock → Tag, Checkboxen je Ebene | Wunsch des Users; identisches Muster wie das Update-Queue-Modal |
| Quell-Status | nur `confirmed` für den Hinweg | „Personen die zugesagt haben" |
| Richtung | beide, Umschalter im Dialog | symmetrisch, gleiche Auswahl-Logik |
| Einstieg | Sidebar-Knopf **+** Zellen-Menü (Person vorausgewählt) | schneller Weg aus der Zelle, vollständiger Weg aus der Sidebar |
| Benachrichtigung | Queue-Eintrag, Versand per Knopfdruck | konsistent zum Update-Modell; nie automatischer Mailversand |
| Kalender | vorgemerkt bleibt drin, `Status:`-Zeile im Infofeld | sonst verschwinden Termine lautlos aus dem Abo |
| Tage-Zählung | unverändert — vorgemerkt zählt **nicht** in `total` | die KPI „bestätigte Tage" soll ehrlich bleiben (v0.17.0) |

## Architektur

### Neuer Dialog — `js/bulkStatus.js`

Eigenes Modul (userView.js ist mit ~900 Zeilen schon groß genug).

- `openBulkStatusModal(prefillCrew)` — `prefillCrew` optional für den Zellen-Einstieg.
- Modus-Umschalter: `✓ → ✎` (Default) und `✎ → ✓`; er bestimmt nur den Quell-Status.
- Datenquelle: `TOUR_DATES × POSITIONS`, Slot aufnehmen wenn
  `assignmentStatuses[date][posId].status === quelle`. Gruppierung Person → Block → Tag über
  den vorhandenen `_dateBlockId`-Helfer und die Blockreihenfolge aus `TOUR_DATES`.
- Auswahl-Logik nach dem Vorbild von `_openUpdateQueueModal` / `_applyQueueSel` / `_queueGrpSel`
  (userView.js): „alle/keine" je Block und je Person, globales ALLE/KEINE. Auswahlzustand
  modul-lokal — im Gegensatz zur Queue ist das eine Einmal-Aktion, nichts zu persistieren.
- Anwenden ruft die **bestehenden** Funktionen: `pencilInAssignment` bzw. `confirmAssignment`
  (dataService.js). Fehlerbehandlung wie in dropdown.js: Toast + `loadAssignmentStatuses()`
  als Resync, dann `renderTable()`.
- Anschließend je Slot `_queueStatusSlot(...)`.

### Update-Queue — dritte Sorte `kind:'status'`

Bisher: `kind:'new'` und `kind:'removed'`. Neu `kind:'status'` mit `to:'pencilled'|'confirmed'`
— **eine** Sorte für beide Richtungen, damit Modal, Mail und Tests nur einen Zweig kennen.

- `_queueStatusSlot(crewName,email,date,posId,posLabel,to)` neben `_queueRemovedSlot`.
- Self-Heal: `status`-Slots sind — anders als `removed` — weiter in `getVal` sichtbar, also
  gilt `getVal(s.date, s.posId) === name`. Nimmt der Manager die Person ganz aus der Zelle,
  fällt der Eintrag raus und der Entfernen-Pfad legt seinen eigenen `removed`-Eintrag an.
- Modal-Tag: `✎ vorgemerkt` / `✓ wieder bestätigt`.
- **Kritisch:** `_sendUpdateForEntry` muss `status`-Slots wie `removed` aus `normal`
  ausschließen. Sonst patcht der „Änderung an bestehenden Einsätzen"-Zweig sie auf `proposed`,
  zerstört die eben gesetzte Vormerkung und löst eine Anfrage-Mail aus. Der `&& normal.length`-
  Guard aus v0.30.0 gilt sinngemäß mit.

### Hook v4.12

Im `type === 'update'`-Zweig ein dritter Abschnitt neben ➕/➖:

- `to === 'pencilled'` → „✎ Diese Termine stehen jetzt als vorgemerkt — vorläufig geplant,
  noch nicht verbindlich. Du musst nichts tun."
- `to === 'confirmed'` → „✓ Diese Termine sind wieder verbindlich bestätigt."
- Kein Button, keine Quittung (nicht gefordert).
- Goja-Regeln: nur `var`, keine Template-Literale, Helfer und Literale im Handler.
- Rückwärtskompatibel — unter v4.11 landen die Slots im generischen ➕-Abschnitt.

### Kalender

**Server-Feed** `/ics/{token}/{plan}`: Filter um `pencilled` erweitern, pro Tag den höchsten
Rang bestimmen (`confirmed > proposed > pencilled`), `DESCRIPTION` um
`Status: Bestätigt|Angefragt|Vorgemerkt` ergänzen, VEVENT-`STATUS:` nur bei bestätigt
`CONFIRMED`. Die stabile UID (`planId-date@crewplanner`) bleibt — Kalender-Apps **ersetzen**
den Termin beim nächsten Abruf, der Status wandert also automatisch mit, ohne Dubletten.

**Client-Export** (`js/pure.js`): `confirmedIcsRows` nimmt `pencilled` mit auf und gibt den
Status pro Slot zurück; wegen des dann irreführenden Namens Umbenennung in `icsExportRows`
(drei Aufrufstellen). `crewIcsContent` schreibt dieselbe `Status:`-Zeile wie der Server-Feed,
damit Download und Abo identisch aussehen. `adminGenerateICS` (admin.html) zieht nach.

**`calcByPers`** (stats.js) bleibt unverändert, abgesichert durch einen Regressionstest.

## Tests

- `pure.test.mjs` — vorgemerkt im Export enthalten mit `Status: Vorgemerkt`, bestätigt mit
  `Status: Bestätigt`, abgesagt/entfernt weiterhin nicht.
- `queue.test.mjs` — `_queueStatusSlot` legt `kind:'status'` mit `to` an; Self-Heal greift;
  **`_sendUpdateForEntry` patcht `status`-Slots nicht auf `proposed`**.
- `stats.test.mjs` — vorgemerkt zählt weiterhin nicht in `total`.
- Reachability- und Import-Guards decken das neue Modul, den Sidebar-Knopf und die
  `window`-Registrierung automatisch ab.

## Rollout

- Version **v0.50.0** in den fünf Pflichtdateien, Cache-Bust `app.js?v=44→45`.
- Hook v4.12 muss der Admin auf **beide** Backends deployen (erst Test, dann Live).
- Bis dahin funktioniert der App-Teil vollständig; nur Mail-Wortlaut und Kalender-Status
  hinken hinterher.
