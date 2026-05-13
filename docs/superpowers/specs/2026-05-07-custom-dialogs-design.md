# Custom Dialog System — Design Spec

**Datum:** 2026-05-07  
**Status:** Approved  

## Problem

Die App nutzt an 22 Stellen native Browser-Dialoge (`confirm()`, `alert()`, `prompt()`). Diese erscheinen im Chrome-Default-Design und brechen das visuelle Erscheinungsbild der App (Dark BG `#1a1a2e`, Gold `#e8c84a`). Der User hat dies beim Zurückziehen einer GL-Anfrage bemerkt.

## Ziel

Alle nativen Browser-Dialoge durch custom Modals ersetzen, die zum App-Design passen. Kein Build-Schritt, kein Framework.

## Design (genehmigt)

**Stil A:** Klassisches Modal mit goldenem Streifen oben (für Hinweise) bzw. rotem Streifen (für destruktive Aktionen).

- Backdrop: dunkles halbtransparentes Overlay über der gesamten App
- Modal-Box: `background: #12122a`, `border-top: 3px solid #e8c84a` (Hinweis) oder `#e84a4a` (Löschen/Destruktiv)
- Titel: uppercase, `color: #e8c84a` oder `#e84a4a`
- Buttons: OK = gold (`#e8c84a`), Löschen = rot (`#e84a4a`), Abbrechen = dunkel (`#2a2a4a`)
- Klick außerhalb Overlay = Abbrechen
- ESC-Taste = Abbrechen
- Enter-Taste = Bestätigen

## Architektur

### Neue Datei: `js/dialog.js`

Injiziert einmalig CSS + HTML-Overlay-Markup beim ersten Aufruf. Stellt drei globale Promise-basierte Funktionen bereit:

```js
async function showAlert(msg)
// → Promise<void> — Zeigt Hinweis mit OK-Button

async function showConfirm(msg, confirmLabel = 'OK')
// → Promise<boolean> — true = bestätigt, false = abgebrochen

async function showPrompt(msg, defaultValue = '')
// → Promise<string|null> — string = Eingabe, null = abgebrochen
```

`dialog.js` muss als **erstes Script** in `index.html` geladen werden (vor allen anderen JS-Dateien), da die Funktionen im globalen Scope liegen müssen.

### Geänderte Dateien

| Datei | Änderungen | native Aufrufe |
|---|---|---|
| `js/dialog.js` | NEU | — |
| `index.html` | dialog.js als erstes Script hinzufügen | — |
| `js/dropdown.js` | 3 Aufrufe ersetzen, Funktionen async | prompt ×1, confirm ×2 |
| `js/positions.js` | 1 Aufruf ersetzen, Funktion async | confirm ×1 |
| `js/types.js` | 2 Aufrufe ersetzen | alert ×1, confirm ×1 |
| `js/dates.js` | 5 Aufrufe ersetzen, confirmAddDate() async | alert ×5 |
| `js/plans.js` | 2 Aufrufe ersetzen | confirm ×1, alert ×1 |
| `js/pdf.js` | 1 Aufruf ersetzen | alert ×1 |
| `js/persistence.js` | 1 Aufruf ersetzen | alert ×1 |
| `js/tourblock.js` | 3 Aufrufe ersetzen | alert ×3 |
| `js/bundle.js` | Sync mit dropdown.js (CLAUDE.md-Pflicht) | 3 gespiegelte Stellen |

**Nicht angefasst:** `tourplan.html` (per CLAUDE.md: "ältere Version, nicht bearbeiten")

### Callsite-Umbau

Synchroner `confirm()`:
```js
// Vorher:
if (!confirm('Zeile löschen?')) return;

// Nachher:
const ok = await showConfirm('Zeile löschen?', 'Löschen');
if (!ok) return;
```

Synchrones `alert()`:
```js
// Vorher:
if (!typeLabel) { alert('Bitte Art/Kategorie wählen.'); return; }

// Nachher:
if (!typeLabel) { await showAlert('Bitte Art/Kategorie wählen.'); return; }
```

Synchrones `prompt()`:
```js
// Vorher:
const val = prompt('Tagesart eingeben:', row.typeLabel);

// Nachher:
const val = await showPrompt('Tagesart eingeben:', row.typeLabel);
```

## Vollständige Callsite-Liste

| Datei | Typ | Aktion |
|---|---|---|
| dropdown.js:32 | prompt | Eigene Tagesart eingeben |
| dropdown.js:47 | confirm | Zeile löschen |
| dropdown.js:111 | confirm | Alle Anfragen zurückziehen |
| positions.js:6 | confirm | Position löschen |
| types.js:93 | confirm | Tagesart löschen |
| types.js:163 | alert | Bezeichnung fehlt |
| dates.js:41 | alert | Art/Kategorie fehlt |
| dates.js:42 | alert | Ort fehlt |
| dates.js:46 | alert | Datum fehlt |
| dates.js:51 | alert | Von/Bis fehlt |
| dates.js:52 | alert | Datum-Range ungültig |
| plans.js:44 | confirm | Plan löschen |
| plans.js:86 | alert | Plan-Name fehlt |
| pdf.js:394 | alert | Keine Daten für Filter |
| persistence.js:55 | alert | Import-Fehler |
| tourblock.js:10 | alert | Start/End fehlt |
| tourblock.js:10 | alert | Start > End |
| tourblock.js:68 | alert | Start > End (Edit) |
| bundle.js:65 | prompt | Sync mit dropdown.js:32 |
| bundle.js:80 | confirm | Sync mit dropdown.js:47 |
| bundle.js:134 | confirm | Sync mit dropdown.js:111 |

## Verifikation

1. Jeden Dialog-Typ manuell auslösen:
   - Datum ohne Ort hinzufügen → `showAlert`
   - Zeile löschen → `showConfirm` (roter Streifen)
   - GL-Anfrage zurückziehen → `showConfirm`
   - Eigene Tagesart → `showPrompt` mit Eingabefeld
2. ESC und Klick außerhalb = Modal schließt ohne Aktion
3. Enter = Bestätigung
4. Kein natives Browser-Dialog darf mehr erscheinen
5. Chrome, Firefox, Safari testen
