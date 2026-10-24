# Funktionstest Crewplaner – Ergebnis 2026-10-24 (Stand `main` ab9325f, v1.0.0)

## 1. Zusammenfassung
Nur die Stufen 1 und 2 (Tests, statische Prüfung) sind gelaufen. Stufe 3 und 4 (Browser, Test-API, Test-Seite)
waren **nicht möglich**: Die Cloud-Umgebung blockiert alle Hosts außer GitHub (Proxy antwortet 403), und es gab
keine Test-Zugangsdaten. Rollen-Abläufe A1–F1 sind deshalb **nicht geprüft**. Gefunden wurde ein echter
Befund: Ein Test ist rot, weil `.githooks/pre-push` in Git ohne Ausführrecht gespeichert ist.

## 2. Umfang
| Stufe | Status |
|---|---|
| 1 Vorhandene Tests | gelaufen. Berlin: 294 grün / 1 rot. UTC: 294 grün / 1 rot. (Die Anleitung nennt 295 grün; hier ist der Test zu F-1 rot.) |
| 2 Statisch | gelaufen: Handler-Registrierung je Seite, interne Links und Anker, Pflicht-Links |
| 3 Browser lokal | nicht möglich: kein Playwright installiert, Test-API vom Proxy blockiert (403), keine Konten |
| 4 Test-Seite | nicht möglich: `aniflu.github.io` vom Proxy blockiert (403) |

## 3. Inventar (Kurzfassung)
on*-Handler in den HTML-Dateien: index 95, admin 60, login 6, view 1 (Vorkommen). Es gibt 57 / 39 / 6 / 1
verschiedene Funktionsnamen. Dynamisch erzeugte Knöpfe aus `js/*.js` sind nur über den vorhandenen
`tests/reachability.test.mjs` abgedeckt, nicht einzeln inventarisiert. Eine Element-für-Element-Tabelle mit
Rollen und Ergebnis fehlt, weil sie ohne Browser nicht belegbar ist.
- Handler-Registrierung (jeder Name im HTML hat eine Zuweisung auf `window` oder eine Funktion im Inline-Skript,
  jeweils im Modul der eigenen Seite): index ✅, admin ✅, login ✅, view ✅. Gegenprobe: Die Prüfung hätte
  einen fehlenden Namen gemeldet (der Name `catch` aus einem try/catch im Handler wurde als Fehlalarm erkannt und ausgeschlossen).
- Interne Links (Dateien und Anker) in index, admin, login, view, guide-admin, guide-crew: ✅ keine toten.
- Pflicht-Links Impressum und Datenschutz (`#datenschutz`) auf allen vier Oberflächen: ✅ vorhanden. ⏭️ Erreichbarkeit
  der Ziele nicht geprüft (Proxy 403).

## 4. Befunde
### F-1 🟡 Pre-Push-Hook ist nicht ausführbar gespeichert
- Was: `.githooks/pre-push` hat in Git den Modus `100644`. Auf Linux/macOS-Klonen läuft der Hook nie, das Test-Gate
  vor jedem Push fehlt dann ohne Meldung. Der Test `.githooks/pre-push existiert und ist ausführbar` schlägt fehl.
- Nachstellen: frischer Klon, `TZ=UTC node tests/run.mjs`.
- Fundstelle: `.githooks/pre-push`, Test in `tests/githook.test.mjs`.
- Fehlerklasse: Ausführrecht geht beim Einchecken von Windows verloren. Weitere Fundstellen: nur diese Datei
  (nur `.githooks/` geprüft; `tools/*` nicht).
- Behebung: `git update-index --chmod=+x .githooks/pre-push`, committen.

## 5. Tote oder fragwürdige Links
Keine toten internen Links. Externe Ziele (`nyxlightwork.de/impressum.html`, mit und ohne `#datenschutz`) nicht erreichbar
geprüft (Proxy 403).

## 6. Positiv
Alle anderen 294 Tests grün in beiden Zeitzonen; kein Handler ohne Registrierung.

## 7. Aufgeräumt
Es wurden keine Testdaten angelegt und nichts gegen Test oder Live geschrieben.
