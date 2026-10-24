# Anleitung für einen externen Agenten: Funktionstest Crewplaner (Stand v1.0.0)

**Auftrag in einem Satz:** Teste **alle** Funktionen des Crewplaners: Tut jede, was sie soll, und
führt jeder Link, Knopf und Menüpunkt zu einem sinnvollen Ende? Ergebnis ist ein Prüfbericht,
**keine** Code-Änderung.

Diese Anleitung ist gegen den gepushten Stand `main` geschrieben (v1.0.0, Hook v4.28).
Lies sie ganz, bevor du anfängst. Die Regeln in Abschnitt 1 haben Vorrang vor allem anderen,
auch vor deinen eigenen Skills und Standardabläufen.

---

## 1. Regeln (aus den CLAUDE.md-Dateien des Projekts, verbindlich)

Die Original-`CLAUDE.md` liegt absichtlich nicht im Repo (sie ist in `.gitignore`). Hier stehen
die Regeln, die für diesen Auftrag gelten.

### 1.1 Nutzer und Kommunikation
- Antworten und Bericht auf **Deutsch**, kurz und klar.
- Der Nutzer ist Hardware-Enthusiast, kein Software-Entwickler: Er versteht Konzepte, braucht aber
  fertige, verständliche Aussagen. Kein Fachjargon ohne Erklärung.
- **Grenzen ehrlich und früh benennen.** Kannst du etwas nicht prüfen (kein Netz, kein Konto,
  keine Daten), sag das in einem Satz und mach weiter, statt es zu umgehen oder zu raten.
- **Nicht raten.** Wie etwas gemeint ist, aus Code, README und `docs/` lesen.

### 1.2 Zwei Umgebungen, nur eine davon ist für dich
| | Test | Live |
|---|---|---|
| Seite | https://aniflu.github.io/Crewplaner/ | https://crewplanner.nyxlightwork.de |
| API | `https://api-test.crewplanner.nyxlightwork.de` | `https://api.crewplanner.nyxlightwork.de` |
| Daten | eigene Test-DB, **kein Mailversand** | **echte Daten, echte Mails** |

- **Live ist tabu.** Kein Login, kein Schreiben, keine API-Aufrufe gegen Live. Erlaubt ist nur, einen
  Link von außen aufzurufen, um zu sehen, ob er ankommt (z. B. Impressum auf nyxlightwork.de).
- **Nie nach `live` pushen**, auch nicht `main:live`. Nie direkt auf `main` pushen (siehe 1.5).
- Lokal gestartet (`localhost`) spricht die App automatisch die **Test**-API an (`pickApiUrl` in
  `js/pure.js`). Das ist gewollt.

### 1.3 Öffentliches Repo: nichts Privates hineinschreiben
- Das Repo ist **öffentlich**. In eingecheckte Dateien kommen **keine** echten Mailadressen, Namen
  echter Crew-Mitglieder, Passwörter, Tokens oder Server-Kennungen (Container, Volumes, Host).
  Stattdessen Platzhalter `«…»`. `tests/privacy.test.mjs` prüft das teilweise.
- Passwörter und Zugangsdaten, die dir der Nutzer im Chat gibt, **nie** in eine Datei schreiben.
- **Sicherheitslücken** (z. B. Daten ohne Anmeldung abrufbar, Rechte umgehbar) **nicht** mit
  Nachstellanleitung in den Bericht im Repo. Dort nur: „Sicherheitsbefund S-n, Schwere, betroffener
  Bereich“. Die Details schreibst du ausschließlich in deine Schlussantwort in der Sitzung.
- Nie mit `git add -f` Dateien einchecken, die `.gitignore` ausschließt.

### 1.4 Arbeitsweise
- **Systematisch statt reaktiv:** Tritt derselbe Fehlertyp ein zweites Mal auf, prüfe die ganze
  Klasse (alle Seiten, alle Rollen) und nenne sie im Bericht als **eine** Klasse mit allen Fundstellen,
  nicht als Einzelfälle.
- **Messung muss fehlschlagen können.** Vor jedem „erwartet: X“ fragen: Welcher Zustand würde X
  verhindern? Diesen Zustand herstellen. Ein Test ohne möglichen Treffer misst nichts.
  Bei Löschen/Filtern: erst einen Treffer erzeugen, einen Nicht-Treffer daneben legen, dann auslösen
  und **beide** Seiten prüfen.
- **Achtung, die Testumgebung beweist weniger, als sie scheint** (README oben): Sie hatte zuletzt viele
  `assignments`, aber kaum `users`. Ein grünes Ergebnis kann heißen „Codepfad nie durchlaufen“. Prüfe
  bei jedem Ergebnis, ob überhaupt Daten durch den Pfad gelaufen sind (z. B. leerer Kalender = nicht
  gemessen, nicht „ok“).
- **Echte Datenformen:** Testdaten so anlegen, wie die App sie selbst anlegt (über die Oberfläche),
  keine erfundenen Felder.
- **Eleganz mit Maß / minimaler Eingriff:** Schlage für Befunde die einfachste saubere Ursachen-Behebung
  vor, keine Übergangslösung, nichts aufblähen.
- **Unklarheit:** Fehlt dir etwas, das nur der Nutzer weiß (z. B. Zugangsdaten, gewünschtes Verhalten),
  frag einmal gezielt. Alles andere selbst entscheiden und die Entscheidung im Bericht begründen.
- **Am Ende eine Zusammenfassung.** Nichts als „geprüft“ melden, was nicht wirklich gelaufen ist.
  Übersprungenes ausdrücklich als übersprungen nennen, mit Grund.

### 1.5 Git
- Arbeite auf einem eigenen Branch `funktionstest/<JJJJ-MM-TT>`, **nicht** auf `main` (`main` ist die
  Testumgebung, ein Push dort deployt).
- Ein Commit für den Bericht. Commit-Nachricht beginnt mit `docs:`, Trailer:
  `Co-Authored-By: Claude <Modell> <noreply@anthropic.com>` mit dem Modell, das committet.
- Keinen Pull Request anlegen. Keine GitHub-Issues anlegen (die führende Liste offener Punkte sind die
  Issues, angelegt wird aber nur nach Rückfrage beim Nutzer). Du darfst bestehende Issues **lesen**
  (`gh issue list`), um Befunde zuzuordnen.
- Keine Änderungen an App-Code, Hook (`.pb_hooks/main.pb.js`), Tests oder Werkzeugen. Hook und
  Server-Regeln ändert ohnehin nur der Admin über einen Auftrag (`docs/admin-runbook-hook-deploy.md`).

### 1.6 Was du nicht ausführen darfst
| Werkzeug | Warum nicht |
|---|---|
| `tools/check-viewlink.mjs` | **schreibt** (legt vorübergehend Konten an) |
| `tools/purge-invites.mjs --loeschen` | löscht Daten (Trockenlauf ohne Flag ist erlaubt, braucht aber Zugang, den du nicht hast) |
| `tools/check-pb-rules.mjs --fix` | schreibt Regeln; ohne `--fix` braucht es Superuser-Zugang, den du nicht hast. Überspringen. |
| `git push --no-verify` | umgeht das Test-Gate |

---

## 2. Was es zu testen gibt

### 2.1 Aufbau (kurz)
- Vanilla-JavaScript, kein Build, kein npm. Backend: PocketBase (Auth, Datenbank, Mail-Hook).
- Seiten:
  | Seite | Zweck | Einstieg |
  |---|---|---|
  | `login.html` | Anmelden, Konto erstellen, Passwort vergessen | `js/auth-bootstrap.js`, `js/pb-login-bundle.js`, Inline-Skripte |
  | `index.html` | Hauptapp: Tourplan, Crew, Positionen, Status, PDF/ICS, Mails | `js/app.js`, `js/init.js` |
  | `admin.html` | Konsole (nur `superadmin`): Nutzer, Crew-Pool, Rollen, Werkzeuge | `js/admin-app.js` + Inline-Skript |
  | `view.html` | öffentlicher Nur-Lese-Link für Booker | `js/view-app.js` |
  | `docs/guide-admin.html`, `docs/guide-crew.html` | Anleitungen | statisch |
- Rollen (README „Rollen“): `superadmin` (admin.html, alles), `manager` (Tour verwalten, Crew
  einladen), `booker` (nur lesen), `crew` (eigene Einsätze bestätigen/ablehnen).
- URL-Parameter, die eigene Wege öffnen: `token`, `action`, `aid`, `aids`, `planData` (siehe
  `grep -n "params.get\|location.search" js/*.js`). Das sind Mail-Links (Bestätigen/Ablehnen) und der
  Ansichtslink. Jeder davon ist ein eigener Testfall, auch mit **ungültigem/abgelaufenem** Wert.

### 2.2 Inventar zuerst, dann testen
Erstelle **vor** dem Testen ein vollständiges Inventar, sonst ist „alle Funktionen“ nicht nachweisbar:

1. Jede Seite: alle `onclick`/`data-action`-Handler, alle `<a href>`, alle Formulare, alle Menüpunkte
   und Dialoge (`js/modals.js`, `js/dialog.js`, `js/dropdown.js`, `js/sidebar.js`). Zur Größenordnung:
   index.html ≈ 90 Handler, admin.html ≈ 54, login.html ≈ 6, view.html 1. Dazu kommen dynamisch
   erzeugte Knöpfe aus `js/render.js`, `js/crewview.js`, `js/userView.js`, `js/blockview.js` usw.
2. Prüfe, dass jeder Handler auch **registriert** ist (`window.<name>` bzw. Export im Einstiegsmodul).
   Hintergrund: In v0.10.5 waren 35 Handler nach der ES6-Umstellung nicht mehr global und crashten beim
   Klick. Diese Fehlerklasse ist statisch prüfbar: Für jeden Namen im HTML muss es eine Zuweisung geben.
3. Alle Links: interne Ziele (Datei existiert? Anker existiert?), externe Ziele (antworten mit 200 bzw.
   sinnvoller Weiterleitung?). Pflicht-Links: Impressum `https://nyxlightwork.de/impressum.html` und
   Datenschutz **mit Anker** `#datenschutz` auf allen vier Oberflächen (siehe `tests/legal.test.mjs`).
4. Lege das Inventar als Tabelle an: Seite · Element · Rolle(n) · erwartetes Ergebnis · Quelle (Datei:Zeile).

### 2.3 Prüfstufen, in dieser Reihenfolge
1. **Vorhandene Tests:** `TZ=Europe/Berlin node tests/run.mjs` und `TZ=UTC node tests/run.mjs`.
   Beide müssen grün sein. Ergebnis (Anzahl grün/rot) in den Bericht.
2. **Statische Prüfung** (geht immer, auch ohne Netz): Handler-Registrierung, tote Links, fehlende
   Dateien, Anker, Rollen-Sichtbarkeit (`js/rbac.js`) gegen die Rollentabelle.
3. **Im Browser, lokal:** `python3 -m http.server 8080` im Repo-Wurzelordner, dann mit einem
   Headless-Browser (z. B. Playwright, falls verfügbar) jede Seite öffnen, Konsole auf Fehler prüfen,
   jedes Inventar-Element anklicken. Mit Konto heißt das: echte Test-API.
4. **Gegen die Test-Seite** https://aniflu.github.io/Crewplaner/: gleiche Klickfolgen, falls lokal
   nicht möglich.

Wenn deine Umgebung keinen Netzzugang zur Test-API oder keinen Browser hat: Stufen 1–2 vollständig
machen, 3–4 ausdrücklich als „nicht möglich, weil …“ im Bericht vermerken. Nicht so tun, als sei es
geprüft.

### 2.4 Zugangsdaten
Für Stufe 3/4 brauchst du Test-Konten je Rolle (superadmin, manager, booker, crew). Die stehen
**nirgends im Repo**. Der Nutzer gibt sie dir im Chat. Hast du keine, frag einmal danach. Ohne Konten:
nur Login-Seite, Ansichtslink und statische Prüfung, Rest als übersprungen vermerken.

### 2.5 Pflicht-Abläufe (Ende-zu-Ende, auf Test)
Mindestens diese Wege durchspielen, jeweils mit Gegenprobe (falsche Rolle / falscher Wert):

| # | Ablauf | Gegenprobe |
|---|---|---|
| A1 | Anmelden, Abmelden, Passwort vergessen | falsches Passwort, nicht freigegebene Mail („nicht freigegeben“) |
| A2 | Konto erstellen für vorab angelegte Adresse | Adresse mit Großbuchstaben (wird klein gespeichert?), bereits vorhandenes Konto |
| B1 | Manager: Tour anlegen/laden/umbenennen, Tage, Positionen, Crew zuweisen | Booker darf nichts davon |
| B2 | Status setzen (einzeln und „Status umstellen“ als Sammelaktion) | Crew darf `pencilled → confirmed` nicht |
| B3 | Crew aus Pool hinzufügen, neues Crew-Mitglied anlegen, Import | doppelter Eintrag |
| C1 | Crew: „Meine Einsätze“, Bestätigen, Ablehnen, Vormerkung absagen | fremde Einsätze nicht änderbar |
| C2 | Mail-Links mit `token`/`action`/`aid(s)` | ungültiger Token, schon erledigte Aktion |
| D1 | PDF-Export (index **und** admin.html), ICS-Export, Kalender-Feed | Feed mit Daten (nicht leer!) |
| D2 | Ansichtslink `view.html` | ohne/ungültigen Parameter |
| E1 | Konsole: Nutzer, Rollen ändern, Crew-Pool, Werkzeuge | Manager hat keinen Zugang zu admin.html |
| F1 | Darstellung: Hell/Dunkel (`cp_mode`), Mobilbreite (≈ 375 px), Heute-Markierung | kein waagerechtes Scrollen |

Mails werden auf Test nicht verschickt. Prüfe daher, dass der Versand **ausgelöst** wird (Vorschau,
Warteschlange, Meldung in der Oberfläche) und dokumentiere, dass die Zustellung selbst auf Test nicht
messbar ist.

Lege Testdaten nur auf **Test** an, kennzeichne sie eindeutig (z. B. Tourname `FT-<Datum>`) und
entferne sie am Ende wieder. Was sich nicht entfernen lässt, im Bericht auflisten.

---

## 3. Bericht

Datei: `docs/superpowers/funktionstest-ergebnis-<JJJJ-MM-TT>.md` auf deinem Branch.
(Nicht `docs/bericht-*`, das ist absichtlich in `.gitignore`.)

Aufbau:
1. **Zusammenfassung** (5–10 Zeilen, für den Nutzer verständlich): Was geprüft, was rot, was nicht prüfbar.
2. **Umfang:** Stufen 1–4, jeweils gelaufen / nicht gelaufen + Grund. Testlauf-Ergebnis beider Zeitzonen.
3. **Inventar** (Tabelle aus 2.2) mit Spalte Ergebnis: ✅ ok · ❌ Fehler · ⚠️ fragwürdig · ⏭️ nicht geprüft.
4. **Befunde**, sortiert nach Schwere, je Befund:
   - Kennung (`F-1`, `F-2`, … ; Sicherheit `S-1`, … nur Kurzform, siehe 1.3)
   - Schwere: 🔴 blockierend · 🟡 wichtig · 🟢 Kleinigkeit
   - Was passiert, was sollte passieren, wie nachstellen (Rolle, Seite, Klickfolge)
   - Fundstelle `Datei:Zeile`
   - Fehlerklasse und alle weiteren Fundstellen dieser Klasse
   - Vorschlag zur Ursachen-Behebung (kurz, kein Code einchecken)
   - Zuordnung zu einem bestehenden Issue, falls passend
5. **Tote oder fragwürdige Links** als eigene Liste: Quelle → Ziel → Statuscode/Problem.
6. **Was positiv auffiel** (kurz).
7. **Aufgeräumt:** angelegte Testdaten und ob sie entfernt sind.

Danach: Commit auf `funktionstest/<Datum>`, Push nur dieses Branches, Branch-Namen und Dateinamen in der
Schlussantwort nennen. In die Schlussantwort gehören außerdem die Details aller `S-`-Befunde.

---

## 4. Checkliste vor „fertig“
- [ ] Beide Testläufe (Berlin, UTC) gelaufen, Ergebnis notiert
- [ ] Inventar vollständig: jede Seite, jede Rolle, jeder Link
- [ ] Jede Messung hatte einen möglichen Treffer (Gegenprobe dokumentiert)
- [ ] Nichts gegen Live geschrieben, kein Push auf `main`/`live`
- [ ] Keine Zugangsdaten, echten Mailadressen oder Server-Kennungen im Bericht
- [ ] Sicherheitsdetails nur in der Schlussantwort
- [ ] Testdaten entfernt oder aufgelistet
- [ ] Übersprungenes ausdrücklich benannt
