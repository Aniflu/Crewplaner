# Design: E-Mail-Log

**Datum:** 2026-05-28  
**Status:** Approved

## Zusammenfassung

Admin soll sehen können, welche E-Mails wann an welche Crew-Mitglieder geschickt wurden. Daten werden in PocketBase persistent gespeichert und sind geräteübergreifend abrufbar.

## Scope

- E-Mail-Typen: `invite`, `reminder`, `cancellation`, `update`
- Max. ~50 Einträge pro Tour (10 Personen × 5 Mails)
- Nur aktiver Plan wird angezeigt (kein plan-übergreifender Filter nötig)
- Sichtbar für: manager, superadmin

---

## 1. PocketBase Collection: `email_log`

Neue Collection, manuell über PB Admin UI anzulegen.

| Feld | Typ | Required |
|---|---|---|
| `plan_id` | text | ja |
| `crew_name` | text | ja |
| `crew_email` | email | ja |
| `email_type` | text | ja |
| `sent_at` | date | ja |
| `success` | bool | ja |

**`email_type` Werte:** `invite` | `reminder` | `cancellation` | `update`

**API Rules:**
- List/View: `@request.auth.id != ""`
- Create: `@request.auth.id != ""`
- Update: `""` (gesperrt)
- Delete: `@request.auth.role = "manager" || @request.auth.role = "superadmin"`

---

## 2. Hook-Änderungen (`main.pb.js`)

Die bestehende `sendMail`-Hilfsfunktion im `crew_invites`-Hook wird nach dem Resend-Call um einen `$app.save()`-Call erweitert.

```js
var success = res.statusCode < 400;
var logRec = new Record($app.findCollectionByNameOrId('email_log'));
logRec.set('plan_id',    r.get('plan_id') || '');
logRec.set('crew_name',  name);
logRec.set('crew_email', email);
logRec.set('email_type', type);
logRec.set('sent_at',    new Date().toISOString());
logRec.set('success',    success);
$app.save(logRec);
```

- Gilt für alle 4 Typen automatisch (ein Hook, alle Typen)
- Fehlgeschlagene Mails (`success: false`) werden ebenfalls geloggt
- Kein separater Hook nötig

---

## 3. Frontend — neuer Tab in `admin.html`

### Neue Datei: `js/emailLog.js`

Enthält:
- `renderEmailLog()` — lädt Records via `pbList('email_log', { filter: 'plan_id="..."', sort: '-sent_at' })` und rendert die Tabelle ins Tab-Body-Element
- Typ-Labels: `invite` → "Einladung", `reminder` → "Erinnerung", `cancellation` → "Absage", `update` → "Update"
- Status-Icons: `success=true` → ✅, `success=false` → ❌

### Tab-Eintrag in `admin.html`

Neuer Tab "E-Mail-Log" neben den bestehenden Tabs, nur sichtbar wenn `IS_MANAGER` oder `IS_SUPERADMIN`.

Beim Tab-Klick wird `renderEmailLog()` aufgerufen.

### Tabellenformat

| Datum | Crew | Typ | Status |
|---|---|---|---|
| 28.05. 14:32 | Max | 📧 Einladung | ✅ |
| 27.05. 09:15 | Lisa | 🔔 Erinnerung | ✅ |
| 26.05. 18:44 | Tom | ✕ Absage | ❌ |

Datum-Format: `DD.MM. HH:MM`

---

## Implementierungsreihenfolge

1. PocketBase Collection `email_log` manuell anlegen (einmaliger manueller Schritt)
2. Hook `main.pb.js` erweitern + deployen
3. `js/emailLog.js` erstellen
4. Tab in `admin.html` einbinden + `emailLog.js` laden
5. Version erhöhen (User entscheidet Nummer)

---

## Collection-Import JSON (für PB Admin → Import collections)

```json
[{"name":"email_log","type":"base","listRule":"@request.auth.id != \"\"","viewRule":"@request.auth.id != \"\"","createRule":"@request.auth.id != \"\"","updateRule":"","deleteRule":"@request.auth.role = \"manager\" || @request.auth.role = \"superadmin\"","fields":[{"name":"plan_id","type":"text","required":true},{"name":"crew_name","type":"text","required":true},{"name":"crew_email","type":"email","required":true},{"name":"email_type","type":"text","required":true},{"name":"sent_at","type":"date","required":true},{"name":"success","type":"bool","required":true}]}]
```
