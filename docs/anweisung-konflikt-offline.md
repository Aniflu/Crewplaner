# Anweisung: Konflikte ohne Datenverlust + Offline-Arbeit am Plan

Stand: 2026-11-18 · Ziel-Version: nächste Minor (Nummer vorher bei Marco erfragen)

## Problem

**1. Konflikt = eigene Änderung weg.** `guardedPatch` (`js/planSync.js`) liest vor jedem
PATCH den Record frisch. Weicht er vom Basisstand ab, wird **nicht** geschrieben, sondern der
DB-Stand geladen (`reloadFromDb`), und es erscheint der Toast `MSG_ZWISCHENDURCH` („… Bitte deine
letzte Änderung wiederholen“). Für den inaktiven Plan überschreibt `onReloaded` in `js/plans.js`
(`_savePlanToLS`, ca. Z. 233–244) sogar den lokalen Zwischenspeicher. Die lokale Änderung ist
damit verloren. Bei einem Klick ist das ärgerlich, nach einer Stunde Arbeit offline ein
Datenverlust.

**2. Offline geht nicht.** `sw.js` legt bewusst nichts ab (`fetch(...).catch(() => fetch(req))`).
Ohne Netz lädt die App nicht. Fällt das Netz während der Arbeit weg, meldet `guardedPatch` nur
`MSG_OFFLINE`, und **nichts merkt sich**, dass dieser Plan noch hochgeladen werden muss.

## Ziel

- Eine lokale Änderung geht **nie stillschweigend** verloren.
- Der Plan lässt sich offline weiter bearbeiten und wird beim nächsten Netz hochgeladen.
- Ein echter Konflikt (beide Seiten haben geändert) wird **dem Menschen** vorgelegt.

**Geltungsbereich:** nur `plan_data` (Manager-Bearbeitung). Alles, was über Hook-Routen oder
`assignments` läuft (Einladen, Bestätigen, Absagen, Mails), braucht den Server. Diese Knöpfe sind
offline **gesperrt mit Hinweis** („Braucht Verbindung“) und werden nicht in eine Warteschlange
gelegt, denn eine Mail, die Stunden später rausgeht, ist schlimmer als keine.

## Umsetzung

### A. Merkliste je Plan (neben dem Plan, nicht darin)

Im Plan-Index (`getPlansIndex`/`savePlansIndex`) je Eintrag zwei Felder:

- `dirty: true|false` bedeutet „lokal geändert, noch nicht auf dem Server“. `_savePlanToLS` setzt
  `true`, ein erfolgreicher PATCH setzt `false`.
- `basis`: der Stand, auf dem die lokale Änderung aufsetzt. Hier wandert der heutige `_base`
  aus `planSync.js` **persistent** hin. Heute lebt `_base` nur im Speicher und ist nach einem
  Neuladen weg. Gespeichert wird ein kurzer Hash des normierten Strings (`normPlanData`,
  existiert schon), nicht der ganze String. Ein `updated`-Feld an `plans` ist laut
  `docs/database-schema.md` nicht belegt (nur bei `assignments`). Es nachzurüsten wäre eine
  Schemaänderung samt Admin-Auftrag, für diese Aufgabe also **nicht** nötig.

Beides gehört **nicht** in `plan_data` und nicht in den JSON-Export.

### B. Entscheidung als reine Funktion (testbar, DOM-frei)

`abgleich(lokal, server)` in `js/pure.js` (oder neben `planSync.js`), Eingabe
`{dirty, basis}` und den Hash des frisch gelesenen Server-`plan_data`, Ausgabe genau eine Aktion:

| lokal `dirty` | Server-Hash = `basis`? | Aktion |
|---|---|---|
| nein | ja | nichts |
| nein | nein | herunterladen (still, mit Toast „neuere Fassung geladen“) |
| ja | ja | hochladen |
| ja | nein | **Konflikt → Dialog** |

`guardedPatch` ruft nur noch diese Funktion. Den Zweig „nicht schreiben, DB-Stand übernehmen“
bei `dirty` gibt es nicht mehr.

### C. Konfliktdialog statt Toast

Über `showConfirm`-Bausteine aus `js/dialog.js` (**nie** `confirm()`), drei Knöpfe:

- **Meine behalten:** PATCH mit dem lokalen Stand, danach `basis` = Hash des gesendeten Stands.
- **Die vom Server nehmen:** lokalen Stand verwerfen, Server-Stand laden.
- **Beide behalten:** Server-Stand laden, den lokalen als **neuen Plan** „<Name> (Kopie dieses
  Geräts)“ anlegen, über den bestehenden Anlege-Weg mit eigenem Record.

Abbruch (Escape) ändert nichts. Der Plan bleibt `dirty`, und der Dialog kommt beim nächsten
Abgleich wieder. `MSG_ZWISCHENDURCH` entfällt.

### D. Wann abgeglichen wird

- Nach dem Speichern wie heute, nur dass ein Netzfehler `dirty` stehen lässt, statt die Änderung
  zu vergessen. Der Toast sagt „Offline – lokal gesichert, wird nachgeholt“ (gelb, nicht rot).
- Beim Start, beim `online`-Event und bei `visibilitychange → visible`: alle `dirty` Pläne
  abgleichen.
- Speicher-Vorgänge je Plan bleiben in der bestehenden Kette (`_queue`) nacheinander.

### E. Offline-Start (`sw.js`)

Von „legt nichts ab“ auf **network-first mit Ablage als Rückfall**:

- Online wird wie bisher immer frisch geholt (`cache: 'no-cache'`), dabei landet eine Kopie mit
  `cache.put` in einem Cache je `SW_VERSION`. **Nur bei Netzfehler** wird aus der Ablage bedient,
  bei Navigation ersatzweise `index.html`. Damit bleibt die Zusage „sperrt nie eine alte Version
  ein“ wahr, solange Netz da ist.
- `install`: App-Hülle vorladen (`index.html`, `login.html`, `admin.html`, `view.html`, alle
  `js/*.js`, `styles.css`, `theme.css`, `assets/**`, `favicon.svg`). `activate`: fremde
  Cache-Versionen löschen. Kill-Switch-Kommentar behalten, Kopfkommentar anpassen.
- Die PB-API (fremde Origin) fasst der SW weiter **nicht** an.
- **Anmeldung offline:** Ein vorhandener Token in `localStorage` reicht zum Öffnen. Ohne Token
  zeigt `login.html` „Erste Anmeldung braucht Verbindung“. Abgelaufene Tokens werden erst online
  erneuert, nicht offline verworfen.

## Prüfung

- **`tests/plansync.test.mjs` erweitern:** je Tabellenzeile aus B ein Test. Ein Test belegt,
  dass bei Konflikt **weder** PATCH gesendet **noch** der lokale Stand überschrieben wird. Rot-
  Nachweis: den Konfliktzweig absichtlich auf „herunterladen“ drehen, der Test muss anschlagen.
- **Neu:** Netzfehler beim PATCH → `dirty` bleibt `true`; nächster Abgleich mit Netz → PATCH
  geht raus, `dirty` wird `false`. Gegenprobe: ein nicht-`dirty` Plan sendet nichts.
- **Neu:** Struktursperre, dass jede ausgelieferte Datei in der Vorlade-Liste von `sw.js` steht
  (in beide Richtungen, keine fehlende und keine tote).
- **Browser (headless, zwei Kontexte = zwei Geräte):** A und B öffnen denselben Plan, B geht
  offline und ändert, A ändert online, B geht online, und der Dialog erscheint mit drei Knöpfen.
  Außerdem: erster Aufruf online, dann offline neu laden, die App startet. Gegenprobe: frischer
  Kontext ohne Erstbesuch, offline, startet **nicht**. Screenshot des Dialogs ansehen.
- Bestehende Tests in beiden Zeitzonen grün (pre-push-Hook).

## Nicht Teil dieser Aufgabe

Kein Feld-für-Feld-Zusammenführen, keine Live-Aktualisierung per PB-Subscription und keine
Offline-Warteschlange für Mails oder Zuweisungen. Server und Hook bleiben unverändert, es ist also
**kein Admin-Auftrag nötig**.
