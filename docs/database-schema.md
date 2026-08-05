# Datenbank-Schema — Crewplanner

PocketBase-Collections (SQLite). Stand: v0.6.1 (2026-08-05)

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
| `feed_token` | Text (optional) | Nicht-erratbarer Schlüssel für den abonnierbaren Kalender-Feed (`/ics/{token}/{plan}`, seit v0.27.0). Wird beim User-Create vom Hook vergeben; ein Backfill vergibt ihn bestehenden Usern nach. ⚠️ Ein Coolify-Redeploy/Reimport löscht das Feld nicht, aber falls es fehlt: der Hook vergibt es selbstheilend beim nächsten Bootstrap. |

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

**API Rules (Stand 2026-08-05):**
- List/View: `@request.auth.id = owner || @request.auth.role = "superadmin"`
  → Crew liest Pläne **nicht** über diese Collection, sondern über die authentifizierten Hook-Routen `/myplans` und `/myplan/{id}` (v4.16) — die geben weder `view_token` noch `owner` heraus. Die öffentliche Ansicht nutzt `/viewplan/{token}`.
  → ⚠️ Die frühere Fassung endete auf `|| view_token != ""`. Das machte **alle** Pläne anonym lesbar, inklusive der Tokens im Klartext (Befund 2026-08-04) — eine PB-Regel filtert pro Datensatz und kann den Token aus dem Request nicht an *einen* Datensatz binden.
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
| `role` | Text (optional) | Nur bei Pool-Records: Rolle, die der User beim Erst-Login bekommt (v0.22.0). Fehlt → Default `crew`. **Feld am 2026-07-13 live angelegt** (fehlte vorher trotz v0.22.0-Notiz → `createPoolMember` schrieb `role`, PB verwarf es still). |

> **Globaler Crew-Pool (v0.22.0):** In der Admin-Konsole angelegte Crew-Mitglieder werden als
> `crew_members` mit `plan_id = "__pool__"` gespeichert (tour-übergreifend, **kein** Login-Konto).
> `loadAllKnownCrew` liest alle `crew_members` → Pool-Mitglieder erscheinen in „Aus Crew-Pool wählen".
> Beim Übernehmen in eine Tour entsteht ein zweiter Record mit der echten `plan_id`.
> Das Login-Konto entsteht erst beim ersten Login über den Einladungslink; der `users`-Create-Hook
> (main.pb.js, aktuell v4.10) übernimmt dann die im Pool gesetzte `role`.

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
| `status` | **Text** (kein Select — 2026-07-21 live geprüft, entgegen früherer Doku-Annahme) | `proposed` → `confirmed` / `declined` / `pencilled` (v0.29.0, „vorgemerkt"). Da es ein freies Textfeld ist, braucht ein neuer Status-Wert KEINE Schema-Änderung. |
| `proposed_by` | **Text** | Quelle der Anfrage: `'bulk'` / `'update'` / `'manual'` (NICHT E-Mail) |
| `responded_at` | DateTime | Zeitstempel der Antwort |

> ⚠️ `proposed_by` MUSS **Text** sein. Nach einem Coolify-Wipe/Reimport wurde es schon als `relation`
> angelegt → jeder Slot-Create wirft „Failed to create record" (Einladen/Update/Bestätigen kaputt).
> PB erlaubt keine Typ-Änderung am Feld → löschen + als Text neu anlegen.

**API Rule (Update, seit v0.26.0 gehärtet):**
`@request.auth.role = "superadmin" || (@request.auth.id != "" && crew_email = @request.auth.email) || (@collection.plans.id ?= plan_id && @collection.plans.owner ?= @request.auth.id)`
→ Crew ändert nur EIGENE Einsätze; Owner/superadmin alles. create/deleteRule unverändert (`auth != ""`).
⚠️ Coolify-Redeploy setzt die Regel zurück → neu setzen (Details: docs/security.md · CLAUDE.md).

**Hook-Trigger (Stand Hook v4.16, deployt 2026-08-04/05):**
- assignments-CREATE-Hook **entfernt** (v4.2) — keine per-Slot-Mails mehr. Mails laufen über `crew_invites` (Einladung/Erinnerung/Update/Absage, konsolidiert).
- UPDATE (status=declined) → Hook informiert den Admin („Abgelehnt").
- users-CREATE (v4.8+) → Auto-Verify **+** übernimmt die Rolle aus dem Crew-Pool (`crew_members` mit `plan_id="__pool__"`, gleiche E-Mail), falls dort ≠ `crew`; vergibt zusätzlich `feed_token` falls leer (v4.9).
- `routerAdd('GET','/ics/{token}/{plan}')` (v4.9.2, öffentlich, unauthentifiziert) → liefert den abonnierbaren ICS-Kalender-Feed einer Person für EINE Tour (Token→user, Plan-ID grenzt ein). Kein `/api`-Präfix, liegt am Route-Root.
- `type==='update'` (v4.10) → rendert die zweiteilige „Es gab Änderungen"-Mail: ➕-Abschnitt für neue Slots (`kind` fehlt oder ≠ `'removed'`, rückwärtskompatibel) und ➖-Abschnitt für entfernte Slots (`kind==='removed'`), Letzterer mit Button `?action=ackcancel&aids=id1,id2` (nur wenn `aid`-Werte vorhanden). Der App-seitige `ackcancel`-Zweig (authService.js) patcht die betroffenen `assignments` von `cancelled` → `cancel_acked`.

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

**API Rule (Create, seit v0.26.0 gehärtet):**
`@request.auth.role = "superadmin" || (@request.auth.id != "" && type = "availability") || (@collection.plans.id ?= plan_id && @collection.plans.owner ?= @request.auth.id)`
→ nur Owner/superadmin dürfen `invite`/`reminder`/`update`/`cancellation` (mailen an Fremde);
`availability` (Crew-Bereitschaft, mailt nur an Admin) bleibt jedem Eingeloggten erlaubt.
⚠️ Coolify-Redeploy setzt die Regel zurück → neu setzen.

**Hook-Trigger:** CREATE → sendet E-Mail via Resend HTTP API

---

### `email_log`

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | String (UUID) | Auto |
| `plan_id` | Text | Plan-Referenz (optional) |
| `crew_name` | Text | Empfänger-Name |
| `crew_email` | Text | Empfänger-E-Mail |
| `email_type` | Text | `invite` / `reminder` / `update` / `cancellation` / `availability` / `love_invite` / `staff_invite` |
| `sent_at` | Text | Zeitstempel |
| `success` | Text | Erfolg/Fehler des Versands |

Wird vom Hook nach jedem Mailversand geschrieben (seit v4.1); zeigt sich im „E-Mail-Log"-Tab der Konsole. `updateRule` leer (kein Patch nötig, nur Create + Read).

---

### `activity_log`

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | String (UUID) | Auto |
| `plan_id` | Text | Plan-Referenz |
| `crew_name` | Text | Name der reagierenden Person |
| `crew_email` | Text | E-Mail der Person |
| `action` | Text | `confirmed` (zugesagt) / `declined` (abgelehnt) / `cancel_acked` (Absage gesehen) |
| `date` | Text | Betroffener Termin (`YYYY-MM-DD`) |
| `pos_label` | Text | Positions-Bezeichnung |
| `ts` | Text | **Client-gesetzter** ISO-Zeitstempel — die Collections haben KEIN `created`-Feld (sort=-id-Gotcha); Recency-Vergleich läuft lexikografisch über `ts` |

**Crew-Reaktions-Log (v0.30.0):** Die App (`logActivity`, dataService.js) schreibt bei jeder
Crew-Reaktion eine Zeile — In-App-Zusagen/-Absagen (nur bei `IS_CREW`, Manager-Klicks loggen
nicht) sowie Mail-Button-Reaktionen (confirm/decline/ackcancel in authService.js). Die
Admin-Konsole zeigt den Bestand im „Aktivität"-Tab und beim Login ein Popup mit den Zeilen,
die neuer sind als `localStorage['tourplan_activity_last_seen']`. Fire-and-forget: ein
fehlgeschlagener Log-Write bricht nie den Hauptflow.
Rules: list/view/create `auth != ""`, delete nur superadmin. ⚠️ Coolify-Redeploy/Reimport-Caveat
wie bei allen Collections. **Am 2026-07-21 live angelegt** (per Superuser, mit Test-Record verifiziert).

**Verwandte `assignments.status`-Werte (v0.30.0):** `cancelled` (Zuweisung entfernt,
Quittung ausstehend — Soft-Cancel statt Löschen, damit der „GESEHEN ✓"-Mail-Button eine
Record-ID hat) und `cancel_acked` (Crew hat quittiert). Beide werden aus den Zellen-Ladepfaden
gefiltert (loadAssignmentStatuses/view-app.js) — die Tabelle zeigt sie nie an.

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
