# Auftrag an den Admin — v0.8.3

> ✅ **Alle drei Punkte erledigt am 2026-08-14**, mit Messausgaben belegt — siehe
> `docs/admin-auftrag-v0.8.3-rueckmeldung.md`. D (Crew-Pool-Regel), B (Build Pack auf
> Dockerfile) und C (Rate-Limiting, umgesetzt über PocketBases eigene Engine statt Traefik).
> Dieses Dokument bleibt als Verlauf stehen.

**Datum:** 2026-08-14 · **Ersetzt nicht:** `docs/admin-auftrag-v0.8.2.md` (B und C daraus sind
weiterhin offen, siehe unten)

Drei Punkte. **D ist neu**, B und C stehen seit der Rückmeldung vom 13.08. offen. Alle drei
brauchen Server- bzw. Coolify-Zugang — deshalb dieser Auftrag.

Was **nicht** zu tun ist: Die Anwendung selbst ist bereits live. v0.8.3 wurde am 14.08. über den
`live`-Branch ausgerollt, Coolify hat automatisch deployt, nachgemessen und in Ordnung. Der
Anwendungs-Deploy läuft über Marco, nicht über dich.

---

## D · PocketBase-Regel — Crew-Pool für Manager öffnen

**Neu mit v0.8.3.** Ausführliche Fassung mit Begründung und Testschritten:
`docs/admin-runbook-crew-pool-manager.md`.

### Worum es geht

Crew-Mitglieder entstehen seit v0.8.3 nur noch **einmal global** im Crew-Pool (Name + E-Mail +
Rolle), Touren wählen daraus aus. Das Freitextfeld in der Tour ist entfallen. Damit kann der
Zustand „Name steht in der Tour, aber es gibt keinen `crew_members`-Datensatz" nicht mehr
entstehen — der war doppelt unsichtbar: keine Einladungs-/Anfragemail (der Hook steigt bei
leerer `crew_email` still aus) und seit v0.8.1 sah die Person die Tour überhaupt nicht, weil
`/myplan` und `/myplans` genau auf diesen Datensatz prüfen.

Pool-Einträge tragen `plan_id = "__pool__"`. Das ist **kein** `plans`-Record, also greift der
Eigentümer-Zweig der aktuellen Regel dort nie → Pool lesen und schreiben kann heute nur
`superadmin`. Ein Manager sieht eine leere Pool-Liste und bekommt beim Anlegen einen
Rechte-Fehler. Vorgabe ist aber: **Manager haben volle Personalhoheit** — wer eine Tour mit
Personal plant, muss das Personal auch anlegen können.

### Die Regel

Für `crew_members` auf **alle fünf** Regeln (`list`, `view`, `create`, `update`, `delete`):

```
@request.auth.role = "superadmin" || (plan_id = "__pool__" && @request.auth.role = "manager") || (@collection.plans.id ?= plan_id && @collection.plans.owner ?= @request.auth.id)
```

Der Manager-Zweig ist bewusst **auf Pool-Einträge begrenzt**: Manager bekommen den Pool
vollständig, aber keinen Zugriff auf die `crew_members` fremder Touren — sonst wäre Audit-Befund
K-3 (Rechteausweitung über selbst angelegte Einträge) wieder offen. Für Crew- und Booker-Konten
ändert sich nichts, „Crew sieht nur Namen" (v0.8.1) bleibt unangetastet.

Die Soll-Regel steht schon als `POOL_OR_OWNER` in `tools/check-pb-rules.mjs`; das Werkzeug meldet
die Abweichung, solange sie nicht gesetzt ist. Das ist gewollt und zeigt genau diesen Schritt an.

### ⚠️ Was die Regel mit sich bringt

`users.createRule` ist `@collection.crew_members.email ?= email` — wer in `crew_members` steht,
darf sich registrieren. Ein Manager, der jemanden in den Pool legt, **erteilt damit die
Registrierungsfreigabe**, mit der Rolle, die er dabei setzt (im Dialog wählbar bis „Manager").
Marco kennt und will das; es soll nur nicht unbemerkt passieren.

### Vorgehen — erst Test, dann Live

```bash
node tools/check-pb-rules.mjs --only=test --fix
node tools/check-pb-rules.mjs --only=test          # muss 0 Abweichungen melden
```

Dann auf Test mit einem echten **`manager`**-Konto durchspielen (nicht als Superadmin — der
funktioniert ohnehin und beweist nichts):

- Tour öffnen → „Crew hinzufügen" → Pool-Liste ist gefüllt
- „+ Neue Person anlegen" → Name, E-Mail, Rolle → wird angelegt und übernommen
- Konsole → Benutzer → „+ Neues Crew-Mitglied" funktioniert unverändert
- eine Anfrage an die neue Person senden → Mail kommt an

Erst wenn Test grün ist:

```bash
node tools/check-pb-rules.mjs --only=live --fix
node tools/check-pb-rules.mjs --only=live
```

Regeländerungen brauchen einen Superuser. Der beim v0.8.1-Rollout angelegte temporäre wurde
danach wieder gelöscht — also neu anlegen und hinterher entfernen, oder direkt im
PocketBase-Admin setzen.

---

## B · Coolify auf Dockerfile umstellen — weiterhin offen

Aus `docs/admin-auftrag-v0.8.2.md`. Am 13.08. nachgemessen: läuft weiter auf **Static**.

`dockerfile_location` steht korrekt, aber das ist nur ein Textfeld — der Umschalter **„Build
Pack"** in den General-Settings der App steht noch auf **Static**. Der Container liefert deshalb
Coolifys generische nginx-Config aus (kompletter Repo-Root), nicht das `Dockerfile`/`nginx.conf`
aus dem Repo:

```bash
$ curl -sI https://crewplanner.nyxlightwork.de/ | grep -iE 'strict-transport|frame-options'
# → keine Treffer

$ curl -s -o /dev/null -w "%{http_code}\n" https://crewplanner.nyxlightwork.de/.pb_hooks/main.pb.js
200   # sollte 404 sein
```

**Bitte:** Coolify → App „Crewplaner" → Settings → General → **Build Pack** auf „Dockerfile"
(Dropdown, nicht nur das Pfad-Feld), dann redeployen. Die Messblöcke stehen in
`docs/admin-auftrag-v0.8.2.md` unter B — bitte laufen lassen und **die Ausgabe mitschicken**.

Ein 404 in der Muss-200-Liste heißt: die App ist tot → melden, Marco macht `git revert`.

---

## C · Rate-Limiting am Login — weiterhin offen

Aus `docs/admin-auftrag-v0.8.2.md`. Am 13.08. nachgemessen: 15 Fehlversuche, 15× `400`, kein
einziges `429`. Der YAML-Vorschlag ist bisher nur im Auftragsdokument gelandet, nicht in
`/data/coolify/proxy/dynamic/pocketbase-fix.yaml` auf dem Server.

**Bitte:** Den Vorschlag aus `docs/admin-auftrag-v0.8.2.md` (Abschnitt C, „Vorschlag zum
Einfügen") tatsächlich in diese Datei eintragen — Hot-Reload, kein Neustart nötig. Dabei
`/viewplan/`, `/viewstatus/` und `/ics/` ausdrücklich **ausnehmen**: Dort ist der Zufalls-Token
die Zugangsberechtigung, und ein Kalender-Abo fragt regelmäßig ab. Eine Bremse auf `/ics/` bräche
die Abos der Crew lautlos — in der Kalender-App fehlen dann einfach Termine.

`sourceCriterion` bitte genau prüfen: Ein falsch gesetztes `ipStrategy.depth` ist der
wahrscheinlichste Weg, wie diese Änderung den Login für **alle** sperrt.

---

## Zum Schluss

Bitte bei allen drei Punkten die Messausgaben mitschicken statt nur „fertig" zu melden. Genau
das hat beim letzten Mal zu einem falschen Grün geführt.

Noch offen aus dem Audit vom 09.08., aber nicht Teil dieses Auftrags: die CSP (kommt als
eigener Push von Marcos Seite, erst nachdem B wirklich greift).
