# Datenbank-Schema — Tour Crew Plan

PocketBase-Collections (SQLite). Stand: v0.23.5

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
- List/View: `@request.auth.id = owner || @request.auth.role = "superadmin" || view_token != ""`
  → ⚠️ Crew (weder Owner noch superadmin) kann einen Plan nur lesen, wenn `view_token` **nicht leer** ist. Fehlt er → 404 → leere Tour. Jede Tour, die Crew sehen soll, braucht einen view_token („Öffentlicher Booker-Link").
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
| `plan_id` | Text | Plan-ID — **ODER Sentinel `"__pool__"`** für globale Pool-Mitglieder (siehe unten) |
| `name` | Text | Anzeigename der Crew-Person |
| `email` | Email | Für E-Mail-Zuordnung (klein gespeichert) |
| `sort_order` | Number | Reihenfolge in der Tabelle |
| `user_id` | Relation → `users` | Verknüpfter Login-Account (optional) |
| `role` | Text (optional) | Nur bei Pool-Records: Rolle, die der User beim Erst-Login bekommt (v0.22.0). Fehlt → Default `crew`. |

> **Globaler Crew-Pool (v0.22.0):** In der Admin-Konsole angelegte Crew-Mitglieder werden als
> `crew_members` mit `plan_id = "__pool__"` gespeichert (tour-übergreifend, **kein** Login-Konto).
> `loadAllKnownCrew` liest alle `crew_members` → Pool-Mitglieder erscheinen in „Aus Crew-Pool wählen".
> Beim Übernehmen in eine Tour entsteht ein zweiter Record mit der echten `plan_id`.
> Das Login-Konto entsteht erst beim ersten Login über den Einladungslink; der `users`-Create-Hook
> (main.pb.js v4.8) übernimmt dann die im Pool gesetzte `role`.

> ⚠️ **`plan_id` MUSS Text sein (v0.23.2):** Nach einem Coolify-Wipe/Reimport war `crew_members.plan_id`
> (und `assignments.plan_id`) als **`relation → plans`** angelegt. Der Sentinel `"__pool__"` ist kein
> echter plans-Record → `Failed to find all relation records` → Pool-Anlegen scheiterte. Dieselbe Falle
> wie bei `proposed_by`. Fix: Feld auf **Text** umbauen (Werte sichern, Feld ersetzen, zurückschreiben).

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
| `proposed_by` | **Text** | Quelle der Anfrage: `'bulk'` / `'update'` / `'manual'` (NICHT E-Mail) |
| `responded_at` | DateTime | Zeitstempel der Antwort |

> ⚠️ `proposed_by` MUSS **Text** sein. Nach einem Coolify-Wipe/Reimport wurde es schon als `relation`
> angelegt → jeder Slot-Create wirft „Failed to create record" (Einladen/Update/Bestätigen kaputt).
> PB erlaubt keine Typ-Änderung am Feld → löschen + als Text neu anlegen.

**Hook-Trigger (Stand Hook v4.8):**
- assignments-CREATE-Hook **entfernt** (v4.2) — keine per-Slot-Mails mehr. Mails laufen über `crew_invites` (Einladung/Erinnerung/Update/Absage, konsolidiert).
- UPDATE (status=declined) → Hook informiert den Admin („Abgelehnt").
- users-CREATE (v4.8) → Auto-Verify **+** übernimmt die Rolle aus dem Crew-Pool (`crew_members` mit `plan_id="__pool__"`, gleiche E-Mail), falls dort ≠ `crew`.

---

### `crew_invites`

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | String (UUID) | Auto |
| `plan_id` | Text | Plan-Referenz (optional) |
| `crew_name` | Text | Name der einzuladenden Person |
| `crew_email` | Email | Ziel-E-Mail |
| `type` | Select | `invite` / `reminder` / `update` / `cancellation` / `love_invite` / `staff_invite` |
| `plan_name` | Text | Für E-Mail-Template |
| `app_url` | URL | Login-URL in der E-Mail (bei `sendAdminInvite` ein JSON-Slot-Array → Hook v4.7 rendert Terminliste) |
| `custom_message` | Text (optional) | Freitext des Admins → Notiz-Block in der Mail (Hook v4.6) |

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
