# Crewplanner — Erste Schritte

Stand: v0.6.1 (2026-08-07)

---

## Für Crew-Mitglieder

### 1. Einladung erhalten

Du bekommst eine E-Mail mit einem Link zum Setzen deines Passworts. Klick den Link — er öffnet die Login-Seite mit einem Formular "Passwort festlegen". Gib dein gewünschtes Passwort ein (mind. 8 Zeichen) und speichere.

> **Seit v0.5.1:** Ein Konto lässt sich nur mit einer E-Mail-Adresse anlegen, die der Planer
> vorher eingetragen hat. Steht „Diese E-Mail-Adresse ist nicht freigegeben", melde dich bei
> deinem Planer — er trägt dich ein, dann klappt es.

### 2. Einloggen

Gehe zu https://crewplanner.nyxlightwork.de → Login mit E-Mail + Passwort.

### 3. Einsätze bestätigen oder ablehnen

Wenn der Admin dich für einen Einsatz einträgt, bekommst du eine E-Mail mit zwei Buttons:
- **BESTÄTIGEN** — du nimmst den Einsatz an
- **ABLEHNEN** — du lehnst ab (der Admin bekommt eine Benachrichtigung)

Du kannst auch direkt in der App auf deine Einsätze klicken und dort reagieren.

Ändert sich später etwas an deinem Plan — egal ob ein Termin **hinzukommt** oder **wegfällt** —
bekommst du dafür genau **eine** Mail „Es gab Änderungen": neue Termine bitten dich um eine
Zusage, entfernte Termine bitten dich nur um eine kurze Bestätigung „gesehen" (Button
„ÄNDERUNGEN GESEHEN ✓"). Es gibt also keine getrennten Wege mehr für „neu" und „abgesagt".

### 4. Passwort vergessen

Login-Seite → "Passwort vergessen" → E-Mail eingeben → Link kommt per E-Mail → neues Passwort setzen.

### 5. Mehrere Touren

Stehst du in mehr als einer Tour (z.B. AMK + Provinz), erscheinen in der Seitenleiste unter „Pläne" alle deine Touren — per Klick wechselst du zwischen ihnen. Die zuletzt gewählte Tour bleibt auch nach dem Neuladen erhalten.

### 6. Eigene Termine exportieren

In der Seitenleiste: **„📅 Meine Termine (.ics)"** (einmaliger Download für den Kalender) und **„📄 Meine Termine (PDF)"**. Exportiert werden ausschließlich deine **eigenen** Tage.

Seit v0.5.0 sind auch **vorgemerkte** Termine dabei — sie tragen im Infofeld „Status: Vorgemerkt"
statt „Status: Bestätigt". Vorgemerkt heißt: grob eingeplant, noch nicht verbindlich; du musst
nichts tun. Wird daraus ein fester Termin, ändert sich der Status beim nächsten Abruf von selbst
(auch im abonnierten Kalender — derselbe Termin, kein zweiter Eintrag).

### 7. Kalender abonnieren (aktualisiert sich automatisch)

Statt eines einmaligen Downloads kannst du deinen Kalender auch **abonnieren** — er aktualisiert sich danach von selbst, sobald sich deine Einsätze ändern. Sidebar → **„📆 Kalender abonnieren"** öffnet einen Link zum Ein-Tipp-Abo (Apple/iPhone/Android/Outlook) sowie eine URL für Google Kalender („Per URL"). Der Feed gilt immer nur für die **gerade geöffnete Tour** — bist du in mehreren Touren, wechsle links die Tour und abonniere für jede einzeln.

### 8. Hell/Dunkel umschalten

Oben im Header gibt es einen ☀/☾-Knopf — er schaltet zwischen hellem und dunklem Erscheinungsbild um. Deine Wahl wird gespeichert und bleibt beim nächsten Besuch erhalten.

---

## Für Manager

### Einloggen

https://crewplanner.nyxlightwork.de → Login → du landest auf der Tour-Tabelle.

### Tour-Plan öffnen / erstellen

In der Sidebar links: Plan auswählen oder neuen Plan erstellen. Ein Plan enthält alle Tourdaten, Positionen und Crew-Zuordnungen.

### Crew zuweisen

1. In der Tabelle auf eine Zelle (Position + Tag) klicken → Dropdown öffnet sich
2. Crew-Mitglied auswählen → Anfrage wird gestellt (Status: ⏳)
3. Crew bekommt automatisch eine E-Mail
4. Nach Bestätigung wird die Zelle grün (✓), nach Ablehnung rot (✗)

Für Termine weit in der Zukunft gibt es zusätzlich **„Vorgemerkt"** (✎, violett) — eine grobe
Vorplanung, wenn Termine/Besetzung noch nicht verbindlich feststehen; es wird **keine**
Anfrage-Mail verschickt. Im Zellen-Menü kannst du jede Person direkt über **„✎ Vorgemerkt: Name"**
vormerken (auch in einer leeren Zelle). Über „→ Jetzt anfragen" wird daraus später eine normale
Anfrage.

Entfernst du eine bereits bestätigte oder angefragte Person aus einem Tag, landet das
automatisch in der Sidebar unter **„↻ Updates"** — von dort verschickst du gesammelt die
„Es gab Änderungen"-Mail (siehe Crew-Abschnitt oben).

### Status am Stück umstellen (seit v0.5.0)

Einzelne Zellen umzustellen ist bei 30–60 Tourtagen mühsam. Der Sidebar-Knopf
**„✎ Status umstellen"** zeigt alle bestätigten Einsätze nach **Person → Tourblock → Tag**
gruppiert, mit „alle/keine" auf jeder Ebene — anhaken, umstellen, fertig. Der Umschalter oben
im Dialog geht auch zurück (vorgemerkt → bestätigt). Aus einer Zelle heraus geht derselbe
Dialog über „✎ Termine von {Name} umstellen…", dann ist die Person schon vorausgewählt.

Die Crew wird **nicht** sofort benachrichtigt: Die Änderungen landen in „↻ Updates" und gehen
erst per Knopfdruck raus.

### Öffentlicher Link für Booker/Veranstalter

Admin-Konsole → Plan auswählen → **„Öffentlicher Booker-Link"**. Der Link zeigt die Tour
read-only (Termine, Orte, Besetzung mit Namen, Status-Farben) — **ohne Login**. Wer den Link
hat, sieht die Tour; behandle ihn also wie ein Geheimnis. E-Mail-Adressen deiner Crew stehen
**nicht** darin.

### Crew einladen

Admin-Konsole öffnen (Button oben rechts) → Werkzeuge-Tab → Crew-Einladung senden.

---

## Für Superadmin

### Admin-Konsole

Superadmin landet nach dem Login automatisch auf `admin.html`.

### Neues Crew-Mitglied anlegen

„Crew & Benutzer"-Tab → „+ Neues Crew-Mitglied" → Name, E-Mail, Rolle eingeben → Anlegen.
Die Person landet im **globalen Crew-Pool** (tour-übergreifend verfügbar über „Aus Crew-Pool wählen") —
**es entsteht dabei noch KEIN Login-Konto**. Das Konto entsteht erst, wenn die Person zu einer Tour
eingeladen wird und sich über den Einladungslink zum ersten Mal einloggt; die im Pool hinterlegte
Rolle wird dabei automatisch übernommen.

### Vereintes Crew-Verzeichnis

Der „Crew & Benutzer"-Tab zeigt EINE Liste aller Personen (per E-Mail zusammengeführt aus Konto,
Pool und allen Touren) mit Badges, welche davon zutreffen. Name/E-Mail/Rolle sind direkt editierbar —
eine Änderung propagiert automatisch ins Konto, den Pool und alle Touren, in denen die Person steht.

### Passwort-Reset für bestehenden User

Crew & Benutzer-Tab → 🔑 Reset neben dem User → Reset-Link wird per E-Mail gesendet.

### Rollen ändern

Crew & Benutzer-Tab → Rollen-Dropdown neben dem Eintrag → Rolle auswählen → wird sofort gespeichert.

### Benutzer/Crew-Mitglied entfernen

Crew & Benutzer-Tab → Entfernen-Button → Bestätigung → Eintrag gelöscht.

### Aktivität-Tab

Zeigt ein Protokoll aller Crew-Reaktionen (zugesagt, abgelehnt, Absage gesehen) — sowohl aus
der App als auch per Mail-Button. Beim nächsten Login erscheint zusätzlich ein Popup mit den
Zeilen, die seit dem letzten Besuch neu dazugekommen sind.

---

## Rollen-Übersicht

| Rolle | Was er/sie sieht | Was er/sie kann |
|---|---|---|
| `superadmin` | Admin-Konsole + Tour-App | Alles |
| `manager` | Tour-App + Werkzeuge-Tab in Konsole | Tour-Planung, Crew verwalten, E-Mails senden |
| `booker` | Tour-App (read-only) | Nur ansehen |
| `crew` | Tour-App (eigene Slots) | Eigene Einsätze bestätigen/ablehnen |

---

## Technische Hinweise (für Entwickler)

- Kein Framework, kein Build-Step — HTML/CSS/Vanilla JS direkt bearbeiten und pushen
- Lokale Entwicklung: `python3 -m http.server 8080`
- Deploy: `git push origin main` → GitHub Pages aktualisiert sich ~1 Min später
- Hook-Deploy: Siehe HANDOFF.md oder CLAUDE.md
