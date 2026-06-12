# Datenbank-Schema — Tour Crew Plan

PocketBase-Collections (SQLite). Stand: v0.10.6

---

## Collections

### `users` (PocketBase Auth-Collection)

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | String (UUID) | Auto |
| `email` | Email | Login-Adresse |
| `role` | Select | `superadmin` / `manager` / `booker` / `crew` |
| `verified` | Bool | Muss `true` sein für Passwort-Reset-Mails; wird via Hook auto-gesetzt |
| `emailVisibility` | Bool | `true` = E-Mail in API-Responses sichtbar |

**API Rules:**
- Create: *(leer — public für Selbstregistrierung)*
- Update: `@request.auth.role = "superadmin"`
- Delete: `@request.auth.role = "superadmin"`

---

### `plans`

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | String (UUID) | Auto |
| `name` | Text | Plan-Name |
| `owner` | Relation → `users` | Plan-Eigentümer |
| `plan_data` | JSON / Text | Serialisierter Plan (Positionen, Tage, etc.) |
| `view_token` | Text | Token für öffentlichen Read-only-Link (view.html) |

**API Rules:**
- List/View: `@request.auth.role = "superadmin" || @request.auth.id = owner`
- Update: `@request.auth.id = owner || @request.auth.role = "superadmin"`

---

### `plan_members`

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | String (UUID) | Auto |
| `plan_id` | Relation → `plans` | |
| `user_id` | Relation → `users` | |
| `role` | Text | Rolle im Plan |

---

### `crew_members`

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | String (UUID) | Auto |
| `plan_id` | Relation → `plans` | |
| `name` | Text | Anzeigename der Crew-Person |
| `email` | Email | Für E-Mail-Zuordnung |
| `sort_order` | Number | Reihenfolge in der Tabelle |
| `user_id` | Relation → `users` | Verknüpfter Login-Account (optional) |

---

### `assignments`

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | String (UUID) | Auto |
| `plan_id` | Text | Plan-ID |
| `date` | Text | `YYYY-MM-DD` |
| `pos_id` | Text | Positions-ID (intern) |
| `pos_label` | Text | Positions-Bezeichnung (für E-Mail) |
| `crew_name` | Text | Name der zugewiesenen Crew |
| `crew_email` | Email | E-Mail für Hook-Benachrichtigung |
| `status` | Select | `proposed` → `confirmed` / `declined` |
| `proposed_by` | Text | E-Mail des Admins der die Anfrage gestellt hat |
| `responded_at` | DateTime | Zeitstempel der Antwort |

**Hook-Trigger:**
- CREATE → sendet Einladungs-Mail an `crew_email`
- UPDATE (status=declined) → sendet Absage-Mail an `proposed_by`

---

### `crew_invites`

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | String (UUID) | Auto |
| `plan_id` | Text | Plan-Referenz (optional) |
| `crew_name` | Text | Name der einzuladenden Person |
| `crew_email` | Email | Ziel-E-Mail |
| `type` | Select | `invite` / `reminder` / `cancellation` / `love_invite` / `staff_invite` |
| `plan_name` | Text | Für E-Mail-Template |
| `app_url` | URL | Login-URL in der E-Mail |

**Hook-Trigger:** CREATE → sendet E-Mail via Resend HTTP API, löscht Record danach

---

## Beziehungen (vereinfacht)

```
users
  └─ plans (owner)
       └─ plan_members (user_id)
       └─ crew_members (user_id → users, optional)
            └─ assignments (crew_email ↔ crew_members.email)
```

---

## Wichtige Hinweise

**sort=-created → 400-Fehler**
PocketBase erkennt `created` nach Schema-Import nicht als sortierbares Feld.
In `pb.js` ist Default-Sort auf `-id` gesetzt. Nie zurückändern.

**verified-Feld**
Kann nicht über die Collections-API gesetzt werden (auch nicht als superadmin).
Wird via `onRecordAfterCreateSuccess`-Hook in `main.pb.js` serverseitig gesetzt.

**plan_data**
Enthält den vollständigen serialisierten Plan-Zustand (Positionen, Tage, Tagesarten, Blöcke).
Wird bei jeder Plan-Speicherung in PB synchronisiert.
