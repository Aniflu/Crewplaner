# Auftrag an den Admin — Hook v4.23 deployen (POST /notify)

**Datum:** 2026-09-06 · **Betrifft:** `.pb_hooks/main.pb.js` (v4.22 → v4.23)
**Frontend:** v0.11.0 liegt auf `main` (Test) — **noch NICHT auf `live`.**

---

## ⚠️ Reihenfolge — das ist der ganze Auftrag

**Der Hook muss vor dem Frontend live sein.** Das Frontend v0.11.0 ruft `POST /notify` auf;
gibt es die Route noch nicht, antwortet PocketBase mit 404 und **jede** Einladung, jedes
Update, jede Absage und jede Bereitschaftsmeldung schlägt fehl.

Dieses Projekt hat die Falle schon einmal getreten — im Hook steht die Warnung wörtlich am
`/myplans`-Umbau: „⚠️ Diese Umstellung MUSS vor dem Zumachen der Regel ausgerollt sein, sonst
findet kein Crew-Mitglied mehr seine Tour (dieselbe Falle wie beim v4.16-Rollout)."

Deshalb liegt v0.11.0 bewusst **nur auf `main`**. Der Live-Push nach `live` erfolgt erst,
wenn der Hook auf beiden Instanzen läuft.

## Was zu tun ist

1. `.pb_hooks/main.pb.js` (Stand `main`) auf **Test** und **Live** ziehen, PocketBase je neu
   starten — derselbe Weg wie bei v4.22.
2. Prüfen, dass die Route da ist:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://api-test.crewplanner.nyxlightwork.de/notify
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://api.crewplanner.nyxlightwork.de/notify
```

**Erwartet: `401`** (nicht 404). 401 heißt: Route existiert und verlangt Anmeldung — genau
richtig. Ein 404 heißt: Hook nicht geladen, **dann nicht weitermachen**.

3. Bescheid geben. Danach: Abnahme auf Test, dann `main` → `live`, dann die Regelhärtung.

## Was sich ändert

**Neu:** eine Route `POST /notify` (authentifiziert). Sie schreibt Termine und den
Mail-Auslöser in **einer** Transaktion.

**Unverändert:** das gesamte Mail-Rendering. Die rund 250 Zeilen HTML-Aufbau und der
`crew_invites`-Create-Hook sind nicht angefasst — die neue Route legt am Ende denselben
Record an wie bisher der Browser, also feuert derselbe Versandweg. Ebenso unverändert:
Kalender-Feed, `/myplans`, `/myplan`, `/planstatus`, `/viewplan`, `/viewstatus`, CORS.

**Additiv:** Solange das alte Frontend läuft, ruft niemand die Route auf. Der Deploy kann für
sich genommen nichts brechen.

## Warum

Beim Einladen eines neu angelegten Crew-Mitglieds in „Provinz 2027" kam „Too many requests".
Am Live-Log nachgemessen: PocketBase läuft mit `*:create` = 20 Anfragen / 5 Sekunden, und in
**beiden** gemeldeten Versuchen steht dasselbe Muster — 20 × `POST 200` auf
`assignments/records`, dann der 21. mit **429**.

v0.10.6 hält die Grenze seither ein. Die Ursache blieb aber: Ein fachlicher Vorgang war als
26 einzelne Schreibvorgänge modelliert, und der konnte **auf halber Strecke abbrechen** —
Termine angefragt, Mail nie raus, die Person wusste von nichts. Genau das ist mit einer
Transaktion nicht mehr möglich.

## Rollback

v4.22 sichern, bevor v4.23 kopiert wird (wie bei v4.22 geschehen: Backups lagen unter
`/root/backups/pb-hooks/`). Zurück geht es mit einem Kopierbefehl plus Neustart — solange das
Frontend v0.11.0 **nicht** auf `live` steht, ist der Rückweg folgenlos.

## Danach (nicht Teil dieses Auftrags)

- Abnahme auf Test: echter Einladen-Vorgang mit 25 Terminen, eine Anfrage statt 26, kein 429.
  Dafür wird auf der Test-Instanz ein Plan mit passendem Konto gebraucht — die Test-DB hat
  einen einzigen `users`-Datensatz, der zu keinem `assignments` passt. **Wird vorher
  abgestimmt.**
- `main` → `live`.
- `crew_invites.createRule` zumachen (danach kann kein Browser mehr direkt eine Mail
  auslösen). Die Regel muss nach jedem Redeploy/Reimport neu gesetzt werden.
