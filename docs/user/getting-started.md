# Tour Crew Plan — Erste Schritte

Stand: v0.21.0

---

## Für Crew-Mitglieder

### 1. Einladung erhalten

Du bekommst eine E-Mail mit einem Link zum Setzen deines Passworts. Klick den Link — er öffnet die Login-Seite mit einem Formular "Passwort festlegen". Gib dein gewünschtes Passwort ein (mind. 8 Zeichen) und speichere.

### 2. Einloggen

Gehe zu https://crewplanner.nyxlightwork.de → Login mit E-Mail + Passwort.

### 3. Einsätze bestätigen oder ablehnen

Wenn der Admin dich für einen Einsatz einträgt, bekommst du eine E-Mail mit zwei Buttons:
- **BESTÄTIGEN** — du nimmst den Einsatz an
- **ABLEHNEN** — du lehnst ab (der Admin bekommt eine Benachrichtigung)

Du kannst auch direkt in der App auf deine Einsätze klicken und dort reagieren.

### 4. Passwort vergessen

Login-Seite → "Passwort vergessen" → E-Mail eingeben → Link kommt per E-Mail → neues Passwort setzen.

### 5. Mehrere Touren

Stehst du in mehr als einer Tour (z.B. AMK + Provinz), erscheinen in der Seitenleiste unter „Pläne" alle deine Touren — per Klick wechselst du zwischen ihnen. Die zuletzt gewählte Tour bleibt auch nach dem Neuladen erhalten.

### 6. Eigene Termine exportieren

In der Seitenleiste: **„📅 Meine Termine (.ics)"** (für den Kalender) und **„📄 Meine Termine (PDF)"**. Exportiert werden ausschließlich deine **eigenen bestätigten** Tage.

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

### Crew einladen

Admin-Konsole öffnen (Button oben rechts) → Werkzeuge-Tab → Crew-Einladung senden.

---

## Für Superadmin

### Admin-Konsole

Superadmin landet nach dem Login automatisch auf `admin.html`.

### Neuen Benutzer anlegen

Benutzer-Tab → "Neuer Benutzer" → E-Mail + Rolle eingeben → Erstellen.
Der neue User bekommt automatisch eine E-Mail mit einem Link zum Passwort-Setzen.

### Passwort-Reset für bestehenden User

Benutzer-Tab → 🔑 Reset neben dem User → Reset-Link wird per E-Mail gesendet.

### ♥ Liebeseinladung

"Neuer Benutzer"-Formular → E-Mail eingeben → ♥ Liebeseinladung → sendet eine warmherzige Onboarding-E-Mail (erstellt keinen Account — nur E-Mail).

### Rollen ändern

Benutzer-Tab → Rollen-Dropdown neben dem User → Rolle auswählen → wird sofort gespeichert.

### Benutzer löschen

Benutzer-Tab → Entfernen-Button → Bestätigung → User gelöscht.

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
