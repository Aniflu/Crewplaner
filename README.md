# Tour / Crew — Personalplan

**Live-App:** https://crewplanner.nyxlightwork.de
**Login:** https://crewplanner.nyxlightwork.de/login.html
**Testumgebung:** https://aniflu.github.io/Crewplaner/ (eigene Test-DB, kein Mailversand — seit v0.31.0)

Crew-Scheduling-App für Tourneen. Admin weist Crew-Mitglieder pro Position und Tag zu, Crew bestätigt oder lehnt per App oder E-Mail-Button ab — Benachrichtigungen via Pocketbase-Hook (Resend).

## Version

**v0.31.0** — feat: **Zwei getrennte Umgebungen — GitHub = Test, Hetzner = Live.** Bisher liefen Test-Seite (GitHub) und Live-Seite auf **derselben** Datenbank — Tests wirkten auf echte Daten und konnten echte Mails auslösen. Jetzt sauber getrennt: Die **GitHub-Seite** ist eine echte **Testumgebung** mit **eigener** Datenbank (kein Mailversand) — hier gefahrlos Bugfixes/Features ausprobieren. **Live** (`crewplanner.nyxlightwork.de`) läuft vollständig auf dem Hetzner-Server und wird nur per bewusstem **„Go-Live"** aktualisiert. Das Frontend erkennt automatisch, in welcher Umgebung es läuft, und spricht die richtige Datenbank an. Ablauf: `main` = testen, `main → live` = live schalten (ohne Server-Zugang). *(Backend-Schritte für den Admin: Test-Datenbank aufsetzen, Live auf den `live`-Branch umstellen, Hook v4.11 — siehe `docs/umzug-zwei-umgebungen.md`.)*
**v0.30.2** — fix: **Vormerken verschickte fälschlich eine Absage.** Nachfix zu v0.30.1: Wurde eine bereits bestätigte/angefragte Person über „✎ Vorgemerkt" gesetzt, landete fälschlich eine „Termin entfernt"-Notiz in der Update-Queue — obwohl die Person weiter (vorgemerkt) im Plan steht. Beim nächsten Update-Versand hätte sie eine falsche Absage-Mail bekommen. Jetzt wird nur dann etwas in die Queue gelegt, wenn tatsächlich eine *andere* Person aus dem Slot verdrängt wird (und auch dann geht die Benachrichtigung wie immer erst per Knopfdruck raus, nie automatisch).
**v0.30.1** — fix: **„Vorgemerkt" war im Zellen-Menü kaum erreichbar.** Der Status „Vorgemerkt" (v0.29.0) erschien nur, wenn eine Person schon in der Zelle stand und noch kein Status gesetzt war — bei leeren Zellen fehlte die Option komplett, bei bereits angefragten/bestätigten Zellen ließ sich der Status nicht mehr zurücksetzen. Jetzt steht „✎ Vorgemerkt: {Name}" für jede Person direkt im Zellen-Menü zur Verfügung — für leere wie belegte Zellen, unabhängig vom aktuellen Status.
**v0.30.0** — feat: **Eine „Es gab Änderungen"-Mail für alles — statt getrennter Wege.** Bisher gab es zwei getrennte Mechanismen: den Sidebar-Button „↻ Updates" für neue Termine und ein rotes Banner für Absagen. Jetzt bündelt „↻ Updates" **beides** — egal ob ein Termin hinzukommt oder wegfällt, landet die Änderung dort. Die Crew bekommt **eine** Mail pro Person: „Es gab Änderungen" mit zwei Abschnitten — neue Termine („bitte bestätige, dass du Zeit hast") und entfernte Termine („bitte bestätige, dass du die Änderung gesehen hast", mit einem Sammel-Button „ÄNDERUNGEN GESEHEN ✓"). Alle Reaktionen der Crew (zugesagt, abgelehnt, Absage gesehen) werden jetzt protokolliert — die Konsole zeigt sie im neuen „Aktivität"-Tab und als Popup beim nächsten Login. *(Backend: Hook v4.10 ist deployt — vollständig live.)*
**v0.29.3** — feat: **Absage nachträglich manuell verschicken.** Wurde eine Zuweisung schon entfernt, BEVOR eine Absage-Mail verschickt wurde (egal ob eben erst oder schon vor einer Weile), gab es bisher keinen Weg mehr, die Crew nachträglich zu informieren — der „Absage"-Dialog in der Konsole brach ab, weil er keine aktive Zuweisung mehr fand. Jetzt zeigt der Dialog in diesem Fall ein Formular, um Datum + Position manuell einzutragen und die Absage-Mail trotzdem zu verschicken.
**v0.29.2** — fix: **Crew aus einem Tag entfernen löste keine Absage-Benachrichtigung aus.** Wurde eine bereits bestätigte oder angefragte Person über „Nicht besetzt", „Standard" oder durch Umbesetzen aus einem Tag entfernt, gab es bisher **keine** Möglichkeit, die Crew darüber zu informieren — das Absage-Banner unten rechts („N Absage(n) ausstehend" → „Absagen senden") blieb leer. Jetzt legt jede dieser drei Aktionen zuverlässig eine Absage-Notiz an, wenn die Person zuvor bestätigt oder angefragt war.
**v0.29.1** — fix: **Vorgemerkt-Symbol zeigte in der Manager-Ansicht Roh-Text statt Icon.** Direkter Nachfix zu v0.29.0: in der Tabellenzelle erschien statt des Symbols der HTML-Code selbst als sichtbarer Text (z. B. bei „Vorgemerkt"-Einträgen). Ursache war eine Kollision mit der Sicherheits-Maskierung von Namen; behoben, sodass die Status-Symbole wieder korrekt angezeigt werden.
**v0.29.0** — feat: **Neuer Status „Vorgemerkt" für Termine in der Fernzukunft.** Bisher gab es pro Zelle nur „bestätigt" (✓, grün) und „angefragt" (⏳). Für Termine, die weit in der Zukunft liegen (z. B. 2027), kann jetzt eine Person **vorgemerkt** werden (✎, violett) — eine grobe Vorplanung, **ohne** dass eine Anfrage-Mail verschickt wird. Im Zellen-Menü: „✎ Vorläufig vormerken" zum Setzen, „→ Jetzt anfragen" um die Vormerkung später in eine echte Anfrage umzuwandeln, „✕ Vormerkung zurückziehen" zum Entfernen. Die Status-Symbole (✓/⏳/✎/✗) sind jetzt etwas größer, und die **Legende** (unten in der Sidebar) ist neu für **alle Rollen** sichtbar, nicht mehr nur für Crew. Nebenbei behoben: die Farbe von „angefragt" nutzte noch versehentlich das alte Gold — jetzt einheitlich über die Design-Tokens wie alle anderen Status.
**v0.28.1** — fix: **Hellere Ansicht überarbeitet.** Die helle Variante wirkte „zu weiß" und die Tourtabelle bräunlich (warmer Creme-Grund + orange getönte Vorbereitungs-Tage). Neuer heller Grundton **„Sage"** — ein ruhiges, gedämpftes Salbeigrün-Grau: die Flächen (Header, Kopfzeile, Tabelle, Login-Karte) heben sich jetzt klar voneinander ab, und die Zeilen-Tönung ist entschärft, sodass kein Braun mehr entsteht. **Nur die helle Ansicht** wurde angepasst — das dunkle Erscheinungsbild bleibt exakt wie zuvor.
**v0.28.0** — feat: **Neues Erscheinungsbild „Crewplanner" + Hell/Dunkel-Umschalter.** Die App heißt jetzt durchgängig **Crewplanner** und trägt das neue **„Crew Pass"-Logo** (Sechseck mit Ausweis, goldener Kopf) — dieselbe Markenfamilie wie CallBoard. Neue ruhige Navy/Paper-Farbwelt und die Schrift **Geist** (Titel/Text) + **JetBrains Mono** (Beschriftungen). Oben rechts gibt es auf jeder Seite einen **☀/☾-Knopf**, der zwischen **Hell** und **Dunkel** umschaltet (die Wahl bleibt gespeichert; ohne Wahl folgt die App dem System). Gelb steckt jetzt nur noch im Logo und im **„HEUTE"-Strich** der Tourtabelle; alle Ansichten (Login, Tourplan, Konsole, öffentliche Ansicht) sind einheitlich umgestellt. *(Rein gestalterisch — kein Backend-Schritt, keine Datenänderung.)*
**v0.27.2** — fix: **Öffentlicher Link zeigte keine Besetzung.** Der öffentliche Booker-Link (Read-only-Ansicht ohne Login) zeigte zwar die Tour-Tage, aber in allen Positionsspalten nur Striche — und die falschen Positions-Namen. Ursache: Die Ansichts-Seite füllte die Crew-Daten an der falschen Stelle ein, sodass sie beim Aufbau der Tabelle nie ankamen. Jetzt erscheinen wieder die echten Positionen und Namen. Betraf **alle** öffentlichen Links (auch AMK 2026), fiel bei AMK 2027 nur besonders auf. *(Rein clientseitig, kein Backend-Schritt.)*
**v0.27.1** — fix: **Kalender-Abo gilt nur für die aktuelle Tour.** Der Abo-Feed enthielt bisher die Termine einer Person aus **allen** Touren gemischt. Jetzt gilt jeder Abo-Link nur für die **gerade geöffnete Tour** — das Popup zeigt „Gilt für: <Tourname>". Wer in mehreren Touren ist, wechselt links die Tour und abonniert erneut. *(Backend: Hook v4.9.2, kein Schema-Schritt.)*
**v0.27.0** — feat: **Abonnierbarer Kalender pro Person.** Statt des einmaligen Termin-Downloads kann jetzt jede Person ihren persönlichen Kalender **abonnieren** — er aktualisiert sich danach **automatisch**, sobald sich Einsätze ändern. Neuer Crew-Button „📆 Kalender abonnieren" zeigt einen Ein-Tipp-Link (Apple/iPhone/Android/Outlook) und einen Link für Google Kalender („Per URL"). Der Feed enthält die **bestätigten** (fest) und **angefragten** (vorläufig) Termine über alle Touren. Technik: eine neue Server-Route (`/ics/{token}`) liefert den Kalender live aus den Daten. *(Backend-Schritt über den Admin: Feld `users.feed_token` + Hook v4.9 deployen.)*
**v0.26.1** — fix: **Handy — Einladungs-Popup landete außerhalb des Sichtfelds.** Auf **Android** öffnete die App nach dem Login über den Einladungs-Link automatisch das „Meine Einsätze"-Popup — das aber nicht sichtbar erschien: man sah nur einen schwarzen Hintergrund und musste die Seite hin- und herschieben, um es zu finden. Ursache: Seit der Handy-Tauglichkeit (v0.24) ist die Seite vertikal scrollbar, aber die Popups hatten keinen Scroll-Lock und keine Handy-Regeln — die zentrierte Box rutschte aus dem Bild. Jetzt sind alle Popups am Handy **oben am Bildschirm verankert** (immer sofort sichtbar) und der Hintergrund wird gesperrt. Betrifft alle Popups; am Desktop ändert sich nichts.
**v0.26.0** — fix/chore/security: **Code-Review-Härtung, Aufräumen & echte Server-Absicherung.** Ergebnisse eines Gesamt-Reviews: ungenutzte Alt-Dateien (`bundle.js`, `userView.test.js`) entfernt; die Dropdown-Anzeige escaped jetzt Namen konsequent (XSS-Härtung, konsistent mit v0.23.3); ein PocketBase-Filter-Escape und ein fehlender Null-Schutz beim Hinweis-Toast repariert; nach einem Tour-/Plan-Wechsel springt die Tabelle wieder einmalig zur „Heute"-Zeile. Alles rein clientseitig, 85 Tests grün. **Zusätzlich server-seitig (in PocketBase, per Impersonation getestet):** Crew kann jetzt auch über die API nur noch **eigene** Einsätze bestätigen/absagen und **keine** E-Mails mehr an Fremde auslösen (`assignments.updateRule` + `crew_invites.createRule` gehärtet). Und das Feld `crew_members.role` wurde angelegt + Hook **v4.8** deployt → über den Crew-Pool angelegte Personen bekommen ihre Rolle (Manager/Booker) jetzt automatisch beim Erst-Login.
**v0.25.0** — feat: **„Heute"-Markierung in der Tourtabelle.** Während die Tour läuft, sieht man jetzt auf einen Blick, wo man gerade steht: Die heutige Zeile ist mit einem **goldenen Strich** und einem **„HEUTE"-Badge** hervorgehoben, **vergangene Tage sind abgedunkelt**, und beim Öffnen scrollt die Tabelle automatisch dorthin (plus „→ Heute"-Button). Fällt „heute" auf einen tourfreien Tag, sitzt der Strich zwischen dem letzten vergangenen und dem nächsten kommenden Tag.
**v0.24.0** — feat: **Handy-Tauglichkeit (Responsive-Layout).** Die App ließ sich am Handy nicht bedienen — falsche Anordnung und **gar kein Scrollen**. Ursache: `styles.css` hatte keine Media-Queries; eine fixe 232px-Sidebar + eine an den Viewport gekoppelte Layout-Höhe mit `overflow:hidden` + eine 800px-Mindestbreite der Tabelle sperrten das Scrollen. Jetzt: am Handy scrollt die Seite normal, die Tabelle scrollt horizontal (Datum-Spalte bleibt sichtbar), die Sidebar wird zum **Hamburger-Menü (☰)**, der Header ist schlank und die Kennzahlen-Leiste dreispaltig. Auch die Admin-Konsole ist mobil nutzbar (scrollbare Tabs & Tabellen). Am Desktop ändert sich nichts.
**v0.23.5** — fix: **„Konto erstellen" bei bereits vorhandener E-Mail zeigte nur „Failed to create record".** Wer vorab in der Konsole angelegt wurde, hat schon ein Konto — beim „Konto erstellen" lehnt der Server die E-Mail als vergeben ab. Statt der kryptischen Meldung erscheint jetzt **„Konto mit dieser E-Mail-Adresse schon vorhanden"**, die Seite schaltet automatisch auf den Login um und füllt die E-Mail vor (mit Hinweis auf „Passwort vergessen?"). *(Robert: sein leeres, blockierendes Konto wurde entfernt — er kann sich jetzt frisch registrieren.)*
**v0.23.4** — fix: **„Konto erstellen"-Link in der Staff-Einladung führte auf eine GitHub-404-Seite.** Wurde die Einladung von der GitHub-Pages-Testseite (`aniflu.github.io/Crewplaner/`) verschickt, baute die App den Link aus `window.location.origin + '/login.html'` = `https://aniflu.github.io/login.html` — ohne das `/Crewplaner/`-Präfix → 404. Der Link zeigt jetzt fest auf die Produktiv-Seite (`https://crewplanner.nyxlightwork.de/login.html`), egal von wo die Einladung ausgeht. *(Betroffene bitte erneut einladen — die alte Mail bleibt kaputt.)*
**v0.23.3** — fix: **Namen mit Anführungszeichen wurden abgeschnitten.** Ein Name wie `Robert "Woody" Steinmetz` zeigte im Verzeichnis nur „Robert" — der Rest (ab dem `"`) fehlte. Ursache: die HTML-Escape-Funktion maskierte keine Anführungszeichen, wodurch das `value="…"`-Feld am `"` abbrach. Der Name war in Wahrheit vollständig gespeichert; jetzt wird er auch vollständig angezeigt (betrifft alle Eingabefelder/Buttons mit Namen).
**v0.23.2** — fix (Backend/Schema): **„Namen speichern" scheiterte mit `plan_id: Failed to find all relation records`.** Ursache: `crew_members.plan_id` war in PocketBase als **Relation**-Feld angelegt (statt Text). Beim Speichern eines Namens für ein reines Konto legt die App einen Pool-Eintrag mit `plan_id="__pool__"` an — der Sentinel ist kein echter Plan-Record → Relation-Prüfung schlug fehl. Behoben: `crew_members.plan_id` **und** `assignments.plan_id` von Relation auf **Text** umgestellt (alle Verknüpfungen 1:1 erhalten, kein Datenverlust). Kein App-Code geändert.
**v0.23.1** — fix: **Namen im Verzeichnis speichern jetzt wirklich.** Bei einem reinen Login-Konto (z.B. Robert) landete der Name im Nichts — die `users`-Collection hat kein `name`-Feld, und PocketBase verwarf den Wert stillschweigend (grüner „Gespeichert"-Hinweis, aber Feld danach leer). Namen werden jetzt in `crew_members` (Crew-Pool) gespeichert, wo sie zuverlässig erhalten bleiben und tour-übergreifend sichtbar sind.
**v0.23.0** — feat: **Ein vereintes Crew-Verzeichnis in der Konsole.** Der Tab „Crew & Benutzer" zeigt jetzt **alle Personen in einer Liste** — zusammengeführt aus Login-Konten, Crew-Pool und Touren (per E-Mail). **Name, E-Mail und Rolle sind direkt editierbar** und werden überall übernommen (auch in den Touren). Badges zeigen, wo jemand existiert (Konto / Pool / welche Touren). So bekommt z.B. ein ohne Namen angelegtes Konto endlich einen Namen, und Umbenennungen wirken konsistent in allen Touren.
**v0.22.0** — feat: **Neue Crew-Mitglieder an einer Stelle in der Admin-Konsole anlegen.** Unter „Crew & Benutzer" gibt es jetzt „+ Neues Crew-Mitglied" mit **Name · E-Mail · Rolle**. Die Person landet in einem **globalen Crew-Pool** (alle Touren können sie über „Aus Crew-Pool wählen" übernehmen), mit **E-Mail-Dublettencheck**. Es wird **kein Login-Konto** angelegt — das entsteht erst, wenn die Person zu einer Tour eingeladen wird und sich über den Link einloggt (die im Pool gesetzte Rolle wird dann übernommen). Die „♥ Liebeseinladung" wurde entfernt. *(Einmaliger Backend-Schritt: Feld `role` auf `crew_members` + Hook-Deploy v4.8.)*
**v0.21.0** — feat: **Crew kann zwischen mehreren Touren wechseln.** Wer in mehr als einer Tour eingeplant ist (z.B. AMK + Provinz), sieht jetzt in der Seitenleiste unter „Pläne" alle eigenen Touren und wechselt per Klick zwischen ihnen. Die zuletzt gewählte Tour bleibt auch nach dem Neuladen erhalten. (Vorher landete die Crew nach dem Bestätigen aller Termine nur noch auf einer Tour ohne Umschaltmöglichkeit.)
**v0.20.2** — fix: Im Crew-Kalender-Export (.ics) zeigt jeder Termin jetzt als Titel **„Art: Ort"** (z.B. „Show: Nürnberg – PSD Bank Arena") statt überall nur den Bandnamen; der Bandname steht in den Termin-Details.
**v0.20.1** — feat: **Crew-Mitglieder können ihre eigenen bestätigten Termine exportieren** — zwei neue Buttons „📅 Meine Termine (.ics)" und „📄 Meine Termine (PDF)". Der Kalender-Eintrag enthält bewusst nur **Band** (Tourname), **Ort** und **Art** — keine anderen Namen. Es werden ausschließlich die **eigenen bestätigten** Tage exportiert.
**v0.20.0** — feat/security: Aktionen sind jetzt strikt auf **Person und aktiven Plan** begrenzt — Crew kann nur die **eigenen** Einsätze bestätigen/absagen (nicht fremde). Und der **Kalender-Export (.ics)** enthält jetzt **nur bestätigte Termine**: als Crew deine eigenen bestätigten Tage, als Manager/Admin die bestätigten Einsätze des Plans (mit Namensliste). Unbestätigte/angefragte Tage sind nicht mehr im Export.
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
