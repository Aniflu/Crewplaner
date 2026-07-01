# Tour / Crew — Personalplan

**Live-App:** https://crewplanner.nyxlightwork.de
**Login:** https://crewplanner.nyxlightwork.de/login.html

Crew-Scheduling-App für Tourneen. Admin weist Crew-Mitglieder pro Position und Tag zu, Crew bestätigt oder lehnt per App oder E-Mail-Button ab — Benachrichtigungen via Pocketbase-Hook (Resend).

## Version

**v0.19.1** — fix: Beim **Crew-Pool-Übernehmen** wurden zwei verschiedene Personen mit gleichem Namen (z.B. „Marco Hoch" Admin- vs. Crew-Konto) fälschlich zusammengeführt und die falsche E-Mail übernommen — dadurch sah der Admin Bestätigungen nicht und die Einladung ging an die falsche Adresse. Jetzt werden Personen **über die E-Mail** unterschieden. Zusätzlich: Crew, die in mehreren Touren steht, landet in der App auf der Tour mit **offenen Anfragen**; und der **Kalender-Export (.ics)** in der Konsole nutzt jetzt den **geladenen Plan** (vorher ggf. eine andere Tour). Die betroffenen Provinz-2027-Daten wurden korrigiert.
**v0.19.0** — feat: **Automatische Aktualisierung (kein „Cache leeren" mehr).** Ein Service Worker sorgt dafür, dass die App immer die neueste Version lädt. Nach diesem Update ist **einmal** noch ein harter Reload nötig — danach kommen künftige Änderungen von selbst an, ohne manuelles Cache-Leeren.
**v0.18.3** — fix: Als Crew meldete **„Termine bestätigen"** „keine offenen Termine", obwohl die eigenen Tage in der Tabelle standen. Jetzt öffnet der Knopf eine **Auswahl-Liste mit allen eingeplanten Tagen** (alle angehakt) — du entfernst die Haken bei Tagen, die du nicht kannst, und **„Bestätigen ✓"** bestätigt den Rest (abgewählte werden, falls angefragt, abgesagt).
**v0.18.2** — fix + feat: In der **Admin-Konsole** öffnete der **„Einladung"**-Knopf (und die anderen Vorschau-Fenster) gar nichts — der Konsole fehlte die CSS-Regel, die solche Fenster sichtbar macht. Jetzt gehen sie auf. Zusätzlich: die **Einladungs-E-Mail listet alle Termine** des Crew-Mitglieds auf (EINE Mail pro Person) und legt die Anfrage-Einträge an, damit die Crew direkt bestätigen kann. *(Hinweis: Die Terminliste in der Mail erscheint erst, nachdem der Server-Hook v4.7 vom Admin deployt wurde.)*
**v0.18.1** — fix: Der Button für den **Crew-Pool** öffnete kein Fenster (das Auswahl-Modal wurde nie sichtbar). Jetzt öffnet **„＋ Aus Crew-Pool wählen"** (im Dialog *Crew & Positionen*) korrekt die Liste, in der du einzelne Personen anhaken und in die aktuelle Tour übernehmen kannst.
**v0.18.0** — feat: **Bekannte Crew aus früheren Touren übernehmen.** Im Dialog *Crew & Positionen* gibt es jetzt den Button **„＋ Bekannte Crew übernehmen"** — er zeigt eine tour-übergreifende Liste aller je angelegten Crew-Mitglieder (doppelte Namen zusammengefasst) zum Anhaken. Die ausgewählten Personen landen **mit E-Mail** im aktuellen Plan und sind sofort einplan- und einladbar. Kein manuelles Abtippen mehr.
**v0.17.3** — fix: Die **„Updates"-Schaltfläche** erscheint jetzt auch für Tage, die schon länger im Plan stehen — nicht mehr nur im Moment des Hinzufügens. Sobald an einem Tag Personen eingeplant, aber noch nicht bestätigt/angefragt sind (die grau/kursiv dargestellten Namen), taucht die Schaltfläche automatisch auf, und du kannst diese Termine anfragen (inkl. E-Mail-Vorschau). Bereits bestätigte Tage bleiben außen vor.
**v0.17.2** — fix + feat: (1) Behebt eine Folge der v0.17.1: nach dem **Hinzufügen eines Tages** erschien die **„Updates"-Schaltfläche** in der Seitenleiste nicht mehr — die für den neuen Tag vorbefüllten Personen landeten nicht in der Liste. Jetzt erscheint sie wieder, und wenn du Namen aus dem neuen Tag entfernst, passt sich die Anzahl sofort an. (2) Neu: Beim **Update-Senden** erscheint pro Person eine **E-Mail-Vorschau** (Empfänger, Betreff, betroffene Termine) mit optionalem Freitext-Feld — du siehst vor dem Versand genau, was rausgeht, und kannst Personen überspringen.
**v0.17.1** — fix: Beim **Hinzufügen von Tagen** (oder Einfügen eines Tourblocks) wanderten bisher **alle** Einsätze des ganzen Plans in die Update-Queue statt nur der neuen — die Anzeige zeigte z.B. „8" (Personen), die Queue enthielt aber hunderte Einträge (Slots). Jetzt werden nur die tatsächlich neuen Tage berücksichtigt. Neuer **„QUEUE LEEREN"-Button** im Update-Fenster, um einen bereits vollgelaufenen Bestand auf einen Schlag zu entfernen.
**v0.17.0** — fix (4 Themen): (1) **Tage-Berechnung** zählt jetzt ausschließlich **bestätigte** Tage (Manager bestätigt händisch oder Crew bestätigt) — nur platzierte/angefragte Tage zählen nicht mehr in die Summe, werden aber separat als „angefragt" angezeigt. (2) **Crew aus einem Tag herausnehmen** leert die Zelle jetzt wirklich (vorher kam die Standard-Crew sofort zurück) — mit ehrlicher Fehlermeldung + Resync statt stillem Halbzustand. (3) **Update-Badge** zeigt keine Zahl mehr, wenn die Liste leer ist (Zähler und Liste nutzen jetzt dieselbe Filterung). (4) **Phantom-Pläne** unterbunden: Crew-Browser konnten versehentlich Plan-Duplikate anlegen — PocketBase-Schreibzugriff auf Pläne ist jetzt auf Manager beschränkt; 6 vorhandene „Tour 2026"-Duplikate wurden entfernt.
**v0.16.0** — fix: Crew-Mitglieder, die **Firefox** nutzen, sahen nie einen Plan (leere Tabelle). Ursache: eine ungültige Zuweisung (`getActivePlanId()=id`) in `persistence.js`, die Chrome tolerant durchparst, Firefox aber als `SyntaxError` ablehnt — dadurch brach der gesamte JavaScript-Modulgraph in Firefox. Korrigiert zu `setActivePlanId(id)` + neuer Test-Guard, der solche Firefox-brechende Syntax automatisch fängt.
**v0.15.0** — fix: Crew mit groß/klein gemischter E-Mail (z.B. `LivLights@gmx.de`) sah keinen Plan — leere Tabelle trotz korrekter Daten. Ursache: der `crew_members`-Lookup nutzt einen case-sensitiven PocketBase-Filter, und die Self-Registrierung speicherte die E-Mail ohne Kleinschreibung. Jetzt normalisiert `login.html` E-Mails bei Login + Registrierung auf Kleinschreibung; Wolfs bestehender `users.email`-Record wurde in PocketBase auf `livlights@gmx.de` korrigiert.
**v0.14.13** — fix: Abmelden-Button im Crew-View funktioniert jetzt — läuft selbstständig inline (Token löschen + zurück zu login.html), unabhängig vom App-Init
**v0.14.12** — feat+fix: Crew-Mitglied umbenennen (✏) ohne Dublette — aktualisiert Name überall + in PocketBase; `removeCrew` löscht jetzt auch den PB-Record (keine Namens-Leichen mehr)
**v0.14.11** — fix: Passwort-Reset-Link reparieren (PB-Mail-Template zeigte auf eine 404-Route statt `login.html?token=`) + zusätzlicher, immer sichtbarer „Abmelden"-Button in der Sidebar
**v0.14.10** — fix: Selbst-Registrierung setzt jetzt `role:crew` + `emailVisibility:true` — behebt „Crew sieht keinen Plan" (leere Rolle) und „Keine E-Mail" in der Admin-Liste; Rollen-Dropdown markiert rollenlose User
**v0.14.9** — fix: Crew, die im Plan steht aber nie „angefragt" wurde (z. B. nachträglich eingetragene Tage), lässt sich jetzt im Zellen-Menü direkt bestätigen — „Bestätigen" legt nötigenfalls den fehlenden Eintrag selbst an
**v0.14.8** — fix: „Speichern" wartet jetzt auf den PocketBase-Sync und meldet ehrlich Erfolg oder den echten Fehler (z. B. abgelaufener Login) — statt fälschlich „gespeichert" anzuzeigen
**v0.14.7** — fix: „Speichern"-Button speichert jetzt wirklich nach PocketBase (rief vorher nur den JSON-Datei-Download auf) — JSON-Export ist jetzt ein eigener Button
**v0.14.6** — fix (kritisch, Datenverlust): Mehr-Plan-Cross-Write — ein Plan ohne eigene PB-Zuordnung überschrieb den Record eines anderen Plans. `_savePlanToLS` schreibt jetzt nur in den eigenen Record (legt sonst einen an), `loadPlanForManager` lädt den gewählten statt „ersten" Plan. + Cross-Write-Test
**v0.14.5** — fix+feat: Update-Queue — pro Plan scopen (Key auf stabile PB-Plan-ID, behebt „300 Einträge über alle Pläne") + Bulk-Auswahl im Modal: nach Tourblock & Person gruppiert mit „alle/keine"-Schaltern + globalem ALLE/KEINE
**v0.14.4** — fix+test: Dialog-System repariert — `confirm/alert/prompt` waren seit der ES6-Migration tot (IIFE in dialog.js nie aufgerufen → `window.show*` undefined), dadurch brach u.a. „Zeile löschen" beim Datum-Klick still ab. + Regressions-Test
**v0.14.3** — fix+test: „Datum hinzufügen" reparieren (fehlender `TYPE_OPTS`-Import in dates.js → ReferenceError beim Klick) + Import-Guard, der fehlende Modul-Imports statisch fängt (`node tests/run.mjs`)
**v0.14.2** — chore+test: Reachability-Audit — harter Test (`node tests/run.mjs`) fängt tote Features ohne UI-Trigger (Funktion existiert, aber kein Button) + kaputte onclick-Handler. Redundanten Orphan `bulkDeclineAllMySlots` entfernt
**v0.14.1** — fix: Tage/Blöcke-Buttons wiederhergestellt (seit v0.9.9.3 verschwunden) + neue Pläne landen jetzt in der Admin-Ansicht (PB-Record beim Anlegen)
**v0.14.0** — feat: Händisches Bestätigen im Zellen-Dropdown (einzeln/alle) + E-Mail-Vorschau mit Freitext vor dem Senden (Einladung/Erinnerung/Update/Absage) — braucht Schema-Feld custom_message + Hook v4.6
**v0.13.0** — fix: Crew-Bestätigung meldet jetzt echte Fehler (statt stillem „grün"), kein false-confirm ohne Record, keine doppelten Anfrage-Mails (Hook v4.5), TZ-sichere Hook-Datumsformatierung
**v0.12.2** — fix+test: Zeitzonen-Bug bei Datumsbereichen behoben (Off-by-one bei UTC+x) + headless Node-Tests (tests/run.mjs)
**v0.12.1** — refactor: Code-Review-Cleanups — toleranter Crew-Namensvergleich (sameCrew), benannter View-Helper, Guards
**v0.12.0** — feat: Standard-Crew-Buttons personenbezogen — „Zurückziehen" erscheint/wirkt nur noch für die Standard-Person der Position, nicht die ganze Spalte
**v0.11.0** — fix: ES6-Modul-Vollsanierung — 24 fehlende Imports behoben (Crew-Klick, Block/Crew-Tabs, Update-Queue, Verfügbarkeit, Plan-Laden) + Cache-Bust app.js?v=2
**v0.10.9** — fix: zirkulärer Import render↔userView brach alle Klicks — pendingCancellations in state.js verschoben
**v0.10.8** — fix: Crew kann bestätigte Termine absagen — pendingCancellations war nie als ES6-Export sichtbar für render.js
**v0.10.7** — fix: getNavUrl erkennt /Crewplaner/ korrekt → Admin-Konsole 404 auf GitHub Pages behoben
**v0.10.6** — chore: Debug-Panel aus login.html entfernt + Versions-Marker auf login.html
**v0.10.5** — fix: ES6-Audit — 35 onclick-Handler auf index.html waren seit Migration nicht mehr global registriert (crashten beim Klick), jetzt in app.js registriert
**v0.10.4** — chore: Diagnose-Logs entfernt + Plan-Leichen-Leak gefixt (stabile Transfer-ID + Auto-Cleanup verwaister localStorage-Keys)
**v0.10.3** — fix: ALLE restlichen fehlenden ES6-Imports (render updateStats/autoSave, persistence, plans/dropdown hasPermission, userView, crewLink) — behebt Bounce + Feature-Crashes
**v0.10.2** — fix: Bounce behoben (render.js colorToDarkBg) + 4 weitere fehlende ES6-Imports (dropdown, pdf, crewNotify)
**v0.10.1** — debug: Persistente Cross-Page Auth-Logs zur Bounce-Diagnose
**v0.10.0** — fix: ROOT-CAUSE — Fehlende ES6-Imports (crew/CREW_COLORS in render.js, activePlanId in dataService.js). Behebt admin↔login↔admin-Bounce + Plan-Ladung.
**v0.9.33** — fix: GitHub Pages — Dynamischer <base> Tag für relative Pfade
**v0.9.32** — fix: GitHub Pages — Absolute Pfade zurück auf relative Pfade
**v0.9.31** — fix: Plan-Transfer Timing — startApp() nach Plan-Schreiben aufrufen
**v0.9.30** — fix: KRITISCH — Alle window.location.href Redirects zu absoluten Pfaden
**v0.9.29** — fix: startApp() Timing + Undo broken ES6 Module fixes
**v0.9.27** — fix: Plan-Transfer Fallback — URL Parameter wenn localStorage blockiert
**v0.9.26** — feat: Debug Dashboard — Live-Logging aller console/redirects/storage
**v0.9.25** — fix: ENDGÜLTIG — Redirect zu admin.html entfernt. Admin bleibt auf index.html
**v0.9.24** — fix: Plan-Transfer Bug — CDN-Cache killt alle Fixes. Cache-Buster v=10 + Redirect + skipRefresh
**v0.9.23** — fix: Plan-Transfer — 3 Tage Arbeit wiederhergestellt + authService.js localStorage Keys
**v0.9.22** — fix: Plan-Transfer GUARD blockiert admin.html Redirects
**v0.9.21** — fix: Plan-Transfer Button lädt ersten Plan automatisch
**v0.9.20** — fix: Plan-Transfer Bug — sessionStorage und modals.js Null-Check
**v0.9.19** — fix: Plan-Transfer — fix: auth-bootstrap Cache — fix: Plan-Transfer-Redirect — debug: Auth-Redirect Debugging — fix: window.* Exports für onclick-Handler — fix: ES6-Imports in app.js — fix: Vollständige window-Exports in admin-app.js für HTML-inline-scripts
**v0.9.12** — fix: admin-app.js importiert generateICS korrekt aus calendar.js
**v0.9.10** — fix: Entferne falsche Module-Imports
**v0.9.9** — fix: Module-Timing-Bug — Warte auf authReady + DOMContentLoaded
**v0.9.8** — fix: Zentrales Auth-Wall Muster — Einheitliche Authentifizierung auf allen Seiten
**v0.9.7** — Bugfix: DE_DAYS/DE_MON Export, Module-Load-Error
**v0.9.3** — Bugfix: ES6-Module-Migration, Auth-Check, Import Fixes
**v0.9.2** — Phase 3 Release: Centralized State Reform & Refactored Architecture

## Tech-Stack

- Vanilla JavaScript (kein Framework, kein Build-Step)
- HTML5 + CSS3
- [PocketBase](https://pocketbase.io) — Auth, SQLite-Datenbank, JS-Hooks für E-Mails
- [Resend](https://resend.com) — E-Mail-Versand via HTTP API
- GitHub Pages — statisches Frontend-Hosting

## Infrastruktur

| Was | Wert |
|---|---|
| Frontend (Live) | https://crewplanner.nyxlightwork.de |
| PocketBase API | https://api.crewplanner.nyxlightwork.de |
| PocketBase Admin UI | https://api.crewplanner.nyxlightwork.de/_/ |
| GitHub Repo | https://github.com/Aniflu/Crewplaner |
| Server SSH | `ssh hetzner` (Admin only) |

## Rollen

| Rolle | Zugang | Rechte |
|---|---|---|
| `superadmin` | admin.html | Alles |
| `manager` | index.html | Tour verwalten, Crew einladen |
| `booker` | index.html | Read-only |
| `crew` | index.html | Eigene Slots bestätigen/ablehnen |

## Lokale Entwicklung

```bash
python3 -m http.server 8080
# http://localhost:8080 im Browser öffnen
```

Kein npm, kein Build. Datei ändern → Browser-Tab neu laden → fertig.

## Deploy

```bash
git push origin main
```

GitHub Pages aktualisiert sich automatisch ~1 Minute nach dem Push.

## PocketBase Hook deployen

```bash
ssh hetzner "curl -s -o /var/lib/docker/volumes/ad9adhhkygjreidi79i4v5eb_pocketbase-hooks/_data/main.pb.js \
  https://raw.githubusercontent.com/Aniflu/Crewplaner/main/.pb_hooks/main.pb.js \
  && docker restart pocketbase-ad9adhhkygjreidi79i4v5eb"
```
