# Datenbank-Schema Dokumentation: Personalplan (Crewplanner)

## 1. Überblick
Das Datenmodell des **Personalplan (Crewplanner)** basiert auf **Pocketbase Collections**. Es handelt sich um ein skalierables, relationales Datenmodell, das speziell für die Verwaltung von Touren, Crews und Zuordnungen optimiert ist. Pocketbase fungiert hier als vollwertige Backend-API, kombiniert mit einer eingebetteten Datenbank. Die Architektur nutzt eingebettete Relationen (Foreign Keys) für einfache Abfragen und eine dedizierte `audit_log` Collection zur Transparenz und Sicherheit.

## 2. Collections detailliert

### `tours`
- `id`: String (Unique, UUID)
- `name`: Text (Unique) — Tour-Name
- `date_start`, `date_end`: DateTime
- `status`: Text (draft, active, completed, cancelled)
- `description`: Text (Rich/Markdown)
- `created_by`: Relation zu `users`
- `created_at`: DateTime (Auto-Timestamp)

### `crews`
- `id`: String (Unique, UUID)
- `name`: Text — Crew-Mitglied Name
- `email`: Text — E-Mail für Benachrichtigungen
- `phone`: Text (optional)
- `available_roles`: Text (JSON Array: ["Captain", "First Officer", ...])
- `created_at`: DateTime (Auto)

### `crew_assignments`
- `id`: String (Unique, UUID)
- `tour_id`: Relation zu `tours` (Required)
- `crew_id`: Relation zu `crews` (Required)
- `position`: Text — Zugewiesene Position
- `status`: Text (pending, accepted, declined)
- `created_at`: DateTime (Auto)

### `users` (Admins)
- `id`: String (Unique, UUID)
- `email`: Text (Auth Provider)
- `role`: Text (admin, moderator, guest)
- `last_login`: DateTime
- `created_at`: DateTime (Auto)

### `audit_log` (Optional)
- `id`: String (Unique, UUID)
- `user_id`: Relation zu `users` (Optional)
- `action`: Text (CREATE, UPDATE, DELETE)
- `table`: Text (Collection Name)
- `record_id`: String (Referenced ID)
- `timestamp`: DateTime (Auto)

## 3. Beziehungen (ER-Modell)

```
┌─────────────┐
│   tours     │ 1
└──────┬──────┘
       │
       │ 1:N (1 Tour → N Assignments)
       │
┌──────▼──────────────────┐
│  crew_assignments       │ M
└──────┬──────────────────┘
       │
       │ N:M (N Crews ← → M Touren)
       │
┌──────▼──────┐
│   crews     │ N
└─────────────┘

┌─────────────┐
│   users     │ (Admin Management)
└──────┬──────┘
       │ created_by
       │
┌──────▼──────┐
│   tours     │
└─────────────┘
```

## 4. Beispiel-Queries

### Alle Crews für eine Tour
```
GET /api/collections/crew_assignments/records?tour_id=t-123&fields=crew_id,position,status
```
Zeigt alle Crew-Zuordnungen für eine spezifische Tour mit ihrem Status.

### Alle Touren eines Crew-Mitglieds
```
GET /api/collections/crew_assignments/records?crew_id=c-456
```
Zeigt die Historie einer Crew-Person über verschiedene Touren hinweg.

### Status-Summary (Anzahl pro Status)
```
SELECT status, COUNT(*) as count 
FROM crew_assignments 
WHERE tour_id = 't-123' 
GROUP BY status
```
Überblick: Wie viele Crews haben zugesagt/abgelehnt/sind noch ausstehend?

## 5. Migrations & Versionierung

### Backup vor Schema-Änderungen
```bash
# Pocketbase Admin: Collections → Export
# Oder via CLI:
pb_admin export --output backup_$(date +%Y%m%d).zip
```

### Best Practices
- **Immer Backup machen** vor dem Löschen oder Ändern von Feldern
- **Nicht löschbar:** Wenn Daten existieren, Felder beibehalten (nullable machen statt löschen)
- **Versionierung:** Wichtige Schema-Änderungen dokumentieren im `CHANGELOG.md`
- **Audit-Trail:** Alle Admin-Änderungen werden im `audit_log` protokolliert

### Beispiel: Neues Feld hinzufügen
```yaml
# crews: Neues Feld "availability_notes"
1. Gehe zu Pocketbase Admin → Collections → crews
2. Klicke "Add Field" → Text
3. Name: availability_notes
4. Optional: true (macht es nicht zwingend)
5. Save
```

**Keine Downtime nötig!** Pocketbase-Änderungen sind live nach dem Save.

---

Dieses Dokument dient als Single Source of Truth für Entwickler und Administratoren. Änderungen müssen im `docs/database-schema.md` dokumentiert werden.
