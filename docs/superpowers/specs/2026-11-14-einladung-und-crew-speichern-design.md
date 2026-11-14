# v1.5.0 Einladung mit Status · Crew speichert gesammelt – Design (Hook v4.30)

## Warum
Befund am Plan „Provinz 2027“ (Live, 2026-11-14, nur gelesen):
- Die Konsole zeigt fast alle als „⚪ Nicht eingeladen“, obwohl laut `email_log` fast alle Einladungen bekommen haben. Ursache: Der Vermerk „eingeladen“ liegt nur im `localStorage` des Browsers (js/crewNotify.js:81-95, 141-152) und gilt zusätzlich nur, wenn die Person einen angefragten Termin hat. Wer nur vorgemerkt ist, steht immer auf „Nicht eingeladen“.
- „Für 0 Einsätze vorgesehen“: Die Einladung zählt nur Termine, die weder bestätigt noch vorgemerkt sind (`_einladbar`, js/crewNotify.js:511). Oliver Thomas hat 46 vorgemerkte Termine → 0. Die App sendet trotzdem: Er hat am 2026-11-14 eine Einladung **ohne Termine** bekommen.
- Der Planer bekommt für jede einzelne Crew-Reaktion eine eigene Mail (ABGELEHNT, VORMERKUNG ABGESAGT, WIEDER FREI); bei 60 Terminen sind das bis zu 60 Mails.

## Das Modell des Nutzers (verbindlich)
- **Einladung** = „Du bist bei Tour X dabei“. Je Person und Tour. Geht **nie ohne Termine** raus.
- **Status** gehört zu jedem Termin: vorläufig vorgemerkt · angefragt · bestätigt · abgesagt. Die Einladung **teilt den Status mit, ändert ihn nicht**.
- Einzige Ausnahme: Ein Termin, der in der Tabelle steht und noch **keinen** Status hat, wird beim Einladen **angefragt** (Entscheidung des Nutzers, Variante a).
- Ob jemand eingeladen ist, sagt der **Mailserver** (`email_log`), nicht der Browser.
- Die Crew ändert nichts sofort. Sie sammelt ihre Änderungen und schreibt sie mit **„💾 Änderungen speichern“** oder wirft sie mit **„↩ Verwerfen“** weg. Erst beim Speichern ändert sich der Live-Plan. Danach bekommt der Planer **eine** Mail mit allem.
- **Regel „mehr als 5“:** Jede Mail mit Terminliste (an Crew und Planer) zeigt bei **mehr als 5** Einträgen keine Einzeldaten, sondern: Zählung je Art + „Es gibt mehr als 5 Einträge. Bitte logg dich ein und schau nach.“ Bei ≤ 5 die Liste wie bisher.

## Ziele
1. Einladungsmail mit Tabelle Datum · Position · Status (bzw. Zählung bei > 5).
2. Einladen ohne Termine ist unmöglich (App sperrt, Server lehnt ab).
3. Konsole: „📧 Eingeladen am …“ aus `email_log`, getrennt davon die Status-Zählung.
4. Crew: alle Status-Änderungen sammeln, speichern/verwerfen, ein Server-Aufruf, eine Mail an den Planer.
5. Keine Einzel-Mails an den Planer mehr bei Crew-Reaktionen.
6. Keine Knöpfe in Mails, die am Speichern vorbei schreiben.

## Nicht-Ziele
- Keine Änderung an den Planer-Werkzeugen in der Tabelle (vormerken, anfragen, entfernen).
- Keine Schema-Änderung, keine neue Collection, keine Regeländerung außer dem Guard im Hook.
- Die Einzel-Anfrage-Mail an die Crew, wenn der Planer **einen** Slot manuell anfragt (ANFRAGE · …), bleibt, verliert aber ihre Bestätigen/Absagen-Knöpfe (Ziel 6).
- Kein `beforeunload`-Dialog.

## Anti-Ziele (wäre ein Fehlschlag, auch wenn es technisch läuft)
- Eine Mail ohne Termine.
- Eine Einladung, die vorgemerkte oder abgesagte Termine still auf „angefragt“ setzt.
- Ein halb gespeicherter Stand (die Hälfte der Änderungen im Plan, der Rest nicht).
- Eine Crew-Änderung erreicht den Plan, ohne dass der Planer davon eine Mail bekommt.

## Ansätze
**A – Gewählt: ein neuer Server-Weg `POST /crewsave` (Hook).** Die App sammelt die Änderungen im Browser; Speichern schickt sie in **einem** Aufruf. Der Server prüft jede Änderung (eigener Termin, erlaubter Übergang), schreibt alle in **einer** Transaktion und legt danach **einen** Mail-Auslöser für den Planer an. Alles oder nichts, wie `/notify` (v4.23).
**B – Verworfen: App schreibt Termin für Termin und schickt danach eine Sammelmail über `/notify`.** Nicht atomar (Abbruch nach der Hälfte = halber Stand), und jede Einzelschreibung feuert die Record-Hooks; die Einzelmails müssten dort mit Sonderlogik unterdrückt werden. Verletzt zwei Anti-Ziele.
**C – Verworfen: Server sammelt zeitverzögert (Cron schickt alle 10 Min. eine Sammelmail).** Der Plan würde sofort geändert, was der Nutzer ausdrücklich nicht will.

## Lösung

### 1. Einladung (App + Hook)
**App, Konsole (js/crewNotify.js):**
- Einlade-Vermerk aus `localStorage` (`tourplan_crew_invites*`, `_saveInvite`, `_loadInvites`) entfällt. Stattdessen beim Öffnen der Liste einmal `email_log` des Plans laden (`pbListAll('email_log', 'plan_id = "<pb-id>"')`, lesbar für Owner/superadmin, Regel `OWNER_ONLY`). „Eingeladen“ = jüngster Eintrag mit `email_type = "invite"` und `success` = `true` oder `skipped` für diese Person. Zuordnung: `crew_email` klein verglichen, ersatzweise `crew_name` (Live hat eine Einladung an eine abweichende Adresse derselben Person).
- Je Person: Zeile 1 Badge `📧 Eingeladen am TT.MM.JJJJ` (bei `skipped`: Zusatz „Test – nicht versendet“) oder `⚪ Noch nicht eingeladen`. Zeile 2 Status-Zählung mit Symbolen: `✎ n vorgemerkt · ⏳ n angefragt · ✅ n bestätigt · ✗ n abgesagt` (nur Arten mit n > 0; `pencil_declined` zählt zu abgesagt).
- Hauptknopf: nicht eingeladen → `📧 Einladen (N Termine)`; eingeladen → `📧 Erneut einladen (N)`. **N = 0 → Knopf gesperrt** mit Hinweis „Keine Termine in der Tabelle“.
- Bestehende Zusatzknöpfe bleiben (Erinnerung nur bei ≥ 1 angefragt, Update, Vormerkung mitteilen, Absagen). Die Erinnerung hängt nicht mehr am Browser-Vermerk, sondern an „eingeladen laut Log“ + ≥ 1 angefragt.
- Vorschau: Tabelle Datum · Position · Status aller Termine der Person (bzw. bei > 5 die Zählung, so wie die Mail sie zeigen wird).
- Senden: `sendCrewInvite` schickt **alle** Termine der Person als `mailSlots` mit `status` je Termin (`pencilled|pencil_declined|proposed|confirmed|declined|none`) und als `slots` **nur** die ohne Datensatz (die werden angefragt). Termine mit `cancelled|cancel_acked` stehen nicht in der Tabelle und fehlen.
- Nach dem Senden `email_log` neu laden (kein lokaler Vermerk).

**Hook `/notify`, Typ `invite`:**
- Schreibt Datensätze **nur** für Slots ohne vorhandenen Datensatz (→ `proposed`). Ein vorhandener Datensatz wird bei `invite` nie angefasst, egal welcher Status (bisher wurden `declined` und `proposed` neu gesetzt). `reminder` und `update` behalten ihr bisheriges Verhalten.
- Der v4.29-Filter, der vorgemerkte Termine aus `mailSlots` streicht, gilt für `invite` **nicht** mehr.
- `invite` ohne Termine (`mailSlots` leer **und** `slots` leer) → `400 keine Termine`. Gilt unabhängig davon, ob etwas übersprungen wurde (die Lücke, durch die Olivers leere Mail kam).
- Der Status in der Mail wird **serverseitig** aus dem Datensatz gelesen (Client-Angabe nur für Slots ohne Datensatz, dort immer „angefragt“), damit die Mail nie einen falschen Status zeigt.

**Hook Mailvorlage `invite`:**
- Betreff und Kopf unverändert („CREW INVITE · Tour“, „Du bist dabei.“), Satz „du wurdest für Tour eingeladen. Hier deine Termine und ihr Stand:“.
- ≤ 5 Termine: Tabelle DATUM · POSITION · STATUS. Statustexte: `Vorgemerkt – nur Info, halte dir den Tag frei` · `Angefragt – bitte bestätigen` · `Bestätigt` · `Abgesagt`.
- > 5: Zählung je Status + Satz der Regel „mehr als 5“.
- Hinweis „Bitte in der App bestätigen oder absagen“ nur, wenn ≥ 1 angefragt. Knopf „APP ÖFFNEN →“ (keine Aktions-URL).

### 2. Regel „mehr als 5“ (Hook, eine Stelle)
Eine Hilfsfunktion im Mail-Hook `listOrSummary(rows, groupBy)`: ≤ 5 → Tabelle, > 5 → Zählung je Gruppe + fester Satz. Angewendet auf: `invite` (Gruppe Status), `update` (Gruppe neu/entfernt/Statuswechsel), `cancellation`, `pencil_info`, `availability` und die neue Planer-Mail `crew_changes` (Gruppe Art der Änderung). Die Grenze 5 steht einmal als Konstante. Bei > 5 entfällt in `update` auch der „GESEHEN ✓“-Knopf (siehe 4).

### 3. Crew speichert gesammelt
**App (js/userView.js, js/render.js, js/dataService.js, index.html):**
- Ein Entwurf je Plan im Speicher **und** im `localStorage` (`tourplan_crew_draft_<pb-plan-id>`): Liste `{date, posId, to}`; `to` ∈ `confirmed | declined | pencil_declined | pencilled | cancel_acked`. Eine erneute Änderung am selben Termin ersetzt den Eintrag; zurück auf den Ausgangsstatus entfernt ihn.
- Alle Crew-Wege, die heute sofort schreiben, schreiben nur noch in den Entwurf: `confirmMySlot`, `declineMySlot`, `restoreMyPencil`, `declineAllMyPencilled`, `_bulkConfirmMySlots`, `toggleCancellation`/`sendCancellations`, `_ackMeineEntfallenen`, das Slot-Modal (`openSlotConfirmModal`) und die Zellen-Knöpfe in render.js. Auch Bereitschaft („📋 Bewerben“, `meinesMelden`, heute eigene Leiste + eigene BEREITSCHAFT-Mail) geht in denselben Entwurf und dieselbe Speicherung (Entscheidung Claude: „eine Mail mit allem“).
- Die Tabelle und „Meine Einsätze“ zeigen Entwurfsänderungen sofort, sichtbar markiert (gestrichelter Rahmen + „● ungespeichert“).
- Leiste fest unten, sobald der Entwurf ≥ 1 Eintrag hat: „n ungespeicherte Änderungen · 💾 Änderungen speichern · ↩ Verwerfen“. Verwerfen fragt über `showConfirm` (js/dialog.js) nach. **Nie** `confirm()/alert()/prompt()`.
- Beim Öffnen der App mit vorhandenem Entwurf: Dialog über `showConfirm` „Du hast ungespeicherte Änderungen“ → Speichern / Verwerfen. Einträge, deren Termin nicht mehr existiert oder deren Ausgangsstatus sich inzwischen geändert hat, werden vor dem Dialog verworfen und im Dialog genannt.
- Speichern = ein Aufruf `POST /crewsave`. Erfolg → Entwurf leeren, Status neu laden, Toast „Gespeichert – der Planer bekommt eine Mail ✓“. Fehler → Entwurf bleibt vollständig erhalten, Toast mit Grund.
- `logActivity` aus dem Crew-Pfad entfällt; die Aktivitätszeilen schreibt der Server (unten).
- Alte Mail-Links `?action=confirm|decline&aid=` und `?action=ackcancel&aids=` (bereits verschickte Mails): legen die Änderung in den Entwurf und öffnen die Leiste, schreiben nichts.

**Hook `POST /crewsave` (authentifiziert):**
- Body `{ planId, changes: [{date, posId, to}], availability: [{date, posId}] }`.
- Prüft: Konto angemeldet; Person steht in `crew_members` des Plans (gleiche Prüfung wie `availability` in `/notify`); je Änderung: Datensatz existiert mit `crew_email` = eigene Mail, Übergang laut `CREW_STATUS_TRANSITIONS` erlaubt (Handkopie wie bisher, `tests/statusguard.test.mjs`). Ausnahme wie heute: Slot ohne Datensatz, der in `plan_data` der Person gehört → Anlage als `confirmed` oder `declined`. Eine einzige unzulässige Änderung → `400` mit Liste, **nichts** wird geschrieben.
- Schreibt alle Änderungen in **einer** Transaktion (`responded_at` = jetzt, `changed_by` = Konto), dazu je Änderung eine `activity_log`-Zeile (Aktionen wie bisher: `confirmed`, `declined`, `pencil_declined`, `pencil_restored`, `cancel_acked`).
- Legt **einen** `crew_invites`-Datensatz Typ `crew_changes` an (Empfänger `ADMIN_EMAIL`, Inhalt: alle Änderungen + Bereitschaften), nach dem Commit → Mail „CREW-ÄNDERUNGEN · Name · Tour“ mit Liste bzw. Zählung (Regel „mehr als 5“). Fehlt `ADMIN_EMAIL`: Log-Zeile, Speichern gelingt trotzdem (wie heute).
- Leere Änderungsliste → `400`.

**Hook, Wegfall:**
- Die Einzelmails im `assignments`-Update-Hook für `declined`, `pencil_declined` und `pencilled ← pencil_declined` an den Planer entfallen.
- Der `assignments`-Guard weist **jede** Statusänderung eines Crew-Kontos über die normale API ab (`status_transition_denied`), ebenso jedes Anlegen durch ein Crew-Konto. Crew schreibt nur noch über `/crewsave` (läuft mit Server-Rechten in der Transaktion, wie `/notify`). Planer und Owner unverändert. Damit erreicht keine Crew-Änderung den Plan ohne Mail (Anti-Ziel 4), auch nicht aus einer alten, zwischengespeicherten App.
- `type availability` in `/notify` bleibt im Hook für alte Clients erlaubt, die App nutzt ihn nicht mehr.

### 4. Keine Schreib-Knöpfe in Mails
- ANFRAGE-Einzelmail (main.pb.js ~548): Knöpfe Bestätigen/Absagen → „APP ÖFFNEN →“.
- `update`-Mail: „ÄNDERUNGEN GESEHEN ✓“ → „APP ÖFFNEN →“. Das Quittieren (`cancel_acked`) läuft über den Entwurf.

### 5. `email_log` auch auf Test
`sendMail` schreibt auch ohne `RESEND_KEY` eine `email_log`-Zeile mit `success = "skipped"`, damit „Eingeladen“ auf Test prüfbar ist. Die Konsole (Tab E-Mail-Log) zeigt `skipped` als „⏭ nicht versendet (Test)“.

## Reihenfolge (zwingend)
1. Hook v4.30 auf **Test** (Admin-Auftrag `docs/admin-auftrag-hook-v4.30.md`), Rückmeldung.
2. App v1.5.0 auf Test (`main`), Nutzer prüft.
3. Hook v4.30 auf **Live**, Rückmeldung.
4. App v1.5.0 sofort danach live (`main:live`). Zwischen 3 und 4 kann eine alte App die Crew nicht speichern lassen (Guard). Das Fenster ist kurz und gewollt kürzer als jede Lücke ohne Planer-Mail.

## Prüfung
- Tests (Muster tests/*.test.mjs, echte Datenformen aus dem Provinz-Dump, ohne echte Adressen):
  - Einladung: Mailliste enthält vorgemerkte/abgesagte/bestätigte Termine mit Status; `slots` nur status-lose; 0 Termine → Knopf gesperrt und Hook 400.
  - Hook `invite` fasst vorhandene Datensätze nicht an (je Status ein Fall).
  - Regel „mehr als 5“: 5 → Tabelle, 6 → Zählung, je Mailtyp.
  - Konsole: „Eingeladen“ aus `email_log` (Treffer per Mail, per Name, `skipped`, `success=false` zählt nicht, `update` zählt nicht).
  - Entwurf: ersetzen, zurücknehmen, Persistenz, veraltete Einträge beim Öffnen.
  - `/crewsave`: alles oder nichts (eine verbotene Änderung → nichts geschrieben), fremder Termin → abgelehnt, genau ein `crew_invites`-Datensatz je Speichern.
  - Guard: Crew-PATCH auf `status` → abgelehnt; Planer-PATCH → erlaubt.
  - Kein Crew-Pfad ruft mehr `pbPatch`/`pbPost` auf `assignments` (Struktursperre über den Aufruf).
  - Keine Browser-Dialoge (bestehende Sperre).
  - Rot-Nachweise für Guard, Alles-oder-nichts und die 5er-Grenze.
- Klick-Durchlauf im Headless-Chrome gegen nachgebildete DB: Crew ändert 3 Termine, verwirft; ändert 7, lädt neu, Dialog, speichert → ein Aufruf.
- Auf Test nach dem Hook-Deploy echt: Crew-Testkonto speichert, `email_log` hat genau eine `crew_changes`-Zeile (`skipped`), Konsole zeigt „Eingeladen … Test – nicht versendet“.

## Präzisierungen nach Builder-Check (Entscheidungen Claude)
1. **Veraltete Einträge beim Speichern:** Jeder Entwurfseintrag trägt zusätzlich `from` (Status beim Ändern, `none` ohne Datensatz). `/crewsave` lehnt ab, wenn der aktuelle Status ≠ `from` ist, und antwortet `409 { stale: [{date, posId, now}] }`, ohne etwas zu schreiben. Die App entfernt genau diese Einträge, zeigt sie per `showAlert` („Der Planer hat inzwischen geändert: …“) und lässt den Rest im Entwurf; die Person speichert erneut. Andere Ablehnungen (fremder Termin, verbotener Übergang) → `400 { denied: [...] }`, Entwurf bleibt unverändert.
2. **Wer ist „Crew“ im Guard:** jedes Konto, das für den Plan **nicht** Planer ist (Planer = superadmin, manager, Plan-Owner — dieselbe Definition wie im bestehenden Guard). Ein Manager/Owner, der selbst in der Crew eines Plans steht, schreibt weiter direkt (Planer-Pfad); Entwurf und Leiste erscheinen nur bei `IS_CREW && !IS_MANAGER`, wie die heutigen Crew-Weichen.
3. **`email_log` lesen:** Einladen darf laut `/notify` nur Owner/superadmin; `OWNER_ONLY` deckt genau diese. Keine Regeländerung. Scheitert das Laden trotzdem, zeigt die Konsole „❔ Status unbekannt“ statt „Noch nicht eingeladen“ (nie eine falsche Aussage).
4. **Zuordnung:** `email_log.plan_id` = PB-Plan-ID = Tour. Name als Ersatz nur, wenn kein Eintrag per Adresse passt. `success=false` wird auf beiden Umgebungen geloggt wie bisher und zählt nicht als eingeladen.
5. **Bereitschaft im Entwurf:** eigener Eintragstyp `{date, posId, kind:'availability'}`; erneutes Tippen entfernt ihn. Server ignoriert Bereitschaften für Slots, die schon einen aktiven Datensatz haben (kein Fehler), und nennt sie nicht in der Mail.
6. **`cancelled`/`cancel_acked` bei der Einladung:** gelten als „kein aktiver Datensatz“. Steht die Person wieder in der Tabelle, setzt `invite` diesen Datensatz auf `proposed` (wie ein neuer Slot). Wer nur entfallene Termine hat, hat N = 0 → Einladen gesperrt (gewollt).

## Dem Builder überlassen
Genaue Farben/Abstände der Leiste und Markierung (Projekt-Stil, farbig auf dunkel), Aufteilung des Codes in Module, Wortlaut der Toasts.

## Offene Rückfrage an den Nutzer (nicht blockierend)
Pascal Smirat (Zusage 2026-08-18) und Peter Weist (Zusage 2026-09-07) wurden danach vom Superadmin-Konto auf „vorgemerkt“ gesetzt. Gewollt?
