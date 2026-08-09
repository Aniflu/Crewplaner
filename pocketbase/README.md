# PocketBase — Schema wiederherstellen

Hier liegt **bewusst keine Schema-Datei mehr.** Warum, und was stattdessen zu tun ist:

## Warum die alten Dateien weg sind (v0.8.0)

Es lagen zwei Schema-Dateien hier, beide wurden entfernt:

- `pb_schema.json` — enthielt veraltete Relation-IDs (`pbc_1736455494`) und war laut
  `CLAUDE.md` seit Langem nicht mehr importierbar. Eine Datei, die aussieht wie das, was man
  im Notfall braucht, es aber nicht ist, ist schlimmer als keine.
- `pb_schema_live_2026-07-28.json` — ein Komplettabzug der Live-Regeln vom 28.07.2026, also
  **vor** der Härtung vom 03.08. Darin steht `assignments.listRule: ""` — genau der Zustand,
  in dem 913 Zuweisungen inklusive zehn echter Mailadressen weltöffentlich lagen. Wer diese
  Datei zum Wiederherstellen benutzt hätte, hätte die Lücke wieder aufgerissen. Zusätzlich war
  sie über `crewplanner.nyxlightwork.de/pocketbase/…` **öffentlich abrufbar** und lieferte
  jedem das vollständige Regelwerk und die Feldstruktur aller acht Collections.

Beide bleiben über den Git-Verlauf erreichbar, falls sie je gebraucht werden.

## Der richtige Weg im Notfall

Wenn nach einem Coolify-Redeploy die Collections fehlen (Symptom: PB-Admin zeigt nichts,
`/api/collections` gibt 404, die Daten in SQLite sind aber noch da):

1. **Schema importieren** — das JSON steht in `CLAUDE.md`, Abschnitt
   „Collections nach Coolify-Redeploy weg". Beim Import „Merge with existing collections"
   anhaken und „Replace with original IDs" wählen.
   Alle Felder als **`text`** anlegen, nie als `relation` — sonst schlagen `plan_id="__pool__"`
   und `proposed_by="bulk"` fehl (die Feldtyp-Falle, dreimal passiert).

2. **Sofort danach die Zugriffsregeln nachziehen** — das ist der Schritt, der bisher
   fehlte:

   ```bash
   node tools/check-pb-rules.mjs        # zeigt die Abweichungen
   node tools/check-pb-rules.mjs --fix  # setzt sie auf den Soll-Stand zurück
   ```

   Das Import-JSON in `CLAUDE.md` ist **absichtlich permissiv** (`@request.auth.id != ""`
   für alles), damit die Wiederherstellung überhaupt durchläuft. Ohne Schritt 2 bleibt die
   Datenbank in genau diesem offenen Zustand stehen.

**Der maßgebliche Soll-Stand der Regeln lebt in `tools/check-pb-rules.mjs`** (Konstante
`SOLL`), nicht in einer Schema-Datei. Eine Regel ändern heißt: dort ändern, dann `--fix`.
