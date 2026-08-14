# Admin-Runbook — Crew-Pool für Manager öffnen (v0.8.3)

> Status: **offen** — das Frontend ist ausgeliefert, diese Regel fehlt noch.
> Ohne sie funktioniert der Crew-Pool nur für `superadmin`.

## Warum

Mit v0.8.3 entstehen Crew-Mitglieder nur noch **einmal global** im Crew-Pool (Name + E-Mail +
Rolle), und Touren wählen daraus aus. Das Freitextfeld in der Tour ist entfallen — damit kann der
Zustand „Name in der Tour, aber kein `crew_members`-Datensatz" nicht mehr entstehen. Dieser
Zustand war doppelt unsichtbar: keine Anfrage-/Einladungsmail (der Hook steigt bei leerer
`crew_email` still aus) **und** seit v0.8.1 sah die Person die Tour überhaupt nicht, weil
`/myplan` und `/myplans` genau auf diesen Datensatz prüfen.

Vorgabe: **Manager haben volle Personalhoheit.** Wer eine Tour mit Personal plant, muss das
Personal auch anlegen können — nicht nur Superadmins.

Das geht heute nicht. Seit dem v0.8.1-Audit steht `crew_members` auf:

```
@request.auth.role = "superadmin" || (@collection.plans.id ?= plan_id && @collection.plans.owner ?= @request.auth.id)
```

Pool-Einträge tragen `plan_id = "__pool__"`, was **kein** `plans`-Record ist. Der
Eigentümer-Zweig greift dort also nie → Pool lesen und schreiben kann nur `superadmin`. Ein
Manager sieht im Pool-Dialog eine leere Liste und bekommt beim Anlegen einen Rechte-Fehler.

## Die Regel

Für `crew_members` auf **alle fünf** Regeln (`list`, `view`, `create`, `update`, `delete`):

```
@request.auth.role = "superadmin" || (plan_id = "__pool__" && @request.auth.role = "manager") || (@collection.plans.id ?= plan_id && @collection.plans.owner ?= @request.auth.id)
```

Der Manager-Zweig ist bewusst **auf Pool-Einträge begrenzt**. Manager bekommen den Pool
vollständig, aber keinen Zugriff auf die `crew_members` fremder Touren — sonst wäre Audit-Befund
K-3 (Rechteausweitung über selbst angelegte Einträge) wieder offen. Für Crew- und Booker-Konten
ändert sich nichts; „Crew sieht nur Namen" (v0.8.1) bleibt unangetastet.

Die Soll-Regel steht bereits als `POOL_OR_OWNER` in `tools/check-pb-rules.mjs` — das Werkzeug
meldet die Abweichung, solange sie nicht gesetzt ist. Das ist gewollt und zeigt genau diesen
offenen Schritt an.

## ⚠️ Was diese Regel mit sich bringt

`users.createRule` ist `@collection.crew_members.email ?= email`. Wer in `crew_members` steht,
darf sich registrieren. Ein Manager, der jemanden in den Pool legt, **erteilt damit die
Registrierungsfreigabe** — mit der Rolle, die er dabei setzt (im Tour-Dialog wählbar: Crew,
Booker, Manager). Das ist die direkte Bedeutung von „volle Personalhoheit" und so gewollt, soll
aber nicht unbemerkt passieren.

## Vorgehen

**Erst Test, dann Live** — wie beim v0.8.1-Rollout.

1. Regeln auf der **Test**-Instanz setzen:
   ```
   node tools/check-pb-rules.mjs --only=test --fix
   ```
   Danach ohne `--fix` gegenprüfen (muss 0 Abweichungen melden).

2. Auf Test mit einem echten **`manager`**-Konto durchspielen (nicht als Superadmin — der
   funktioniert ohnehin und beweist nichts):
   - Tour öffnen → „Crew hinzufügen" → Pool-Liste ist gefüllt
   - „+ Neue Person anlegen" → Name, E-Mail, Rolle → wird angelegt und übernommen
   - Konsole → Benutzer → „+ Neues Crew-Mitglied" (superadmin) funktioniert unverändert
   - eine Anfrage an die neue Person senden → Mail kommt an

3. Erst wenn Test grün ist, dasselbe auf **Live**:
   ```
   node tools/check-pb-rules.mjs --only=live --fix
   ```

4. Abschließend `node tools/check-crew-links.mjs` — findet Personen aus der Zeit vor dem Pool,
   die in einer Tour stehen, aber keinen `crew_members`-Datensatz haben. Reparatur: Konsole →
   Benutzer → im Verzeichnis die Adresse eintragen und speichern.

## Zugang

Regeländerungen brauchen einen Superuser. Der beim v0.8.1-Rollout angelegte temporäre Superuser
wurde danach wieder **gelöscht** — also entweder erneut einen temporären anlegen und hinterher
wieder entfernen, oder die Regeln direkt im PocketBase-Admin setzen.
