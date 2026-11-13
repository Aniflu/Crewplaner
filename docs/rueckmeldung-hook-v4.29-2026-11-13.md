# Rückmeldung an Marco — Hook v4.29 auf Test deployt

**Datum:** 2026-11-13 · **Auftrag:** `docs/admin-auftrag-hook-v4.29.md`
**Umgebung:** **Test.** Live läuft unverändert auf **v4.28** und wartet auf deine Freigabe.

| Instanz | Version | sha256 | Zustand |
|---|---|---|---|
| Test | **v4.29** | `efe082b79fddd7d7baebcb17d31e3ffc7bc368379d90d76b2bf9fba85c099623` = GitHub `main` (`f5ab24c`) | healthy, `RestartCount: 0` |
| Live | v4.28 | `4e14619bf3d2672f58e39427f8b63b63a4fac170124f9fc8365ca1e70c83f89e` | healthy, `RestartCount: 0`, nicht angefasst |

> Server-Kennungen stehen hier als `«…»` — dieses Dokument kann so ins öffentliche Repo.

---

## Ergebnis in einem Satz

Alle **dreizehn** Messungen auf Test bestanden, Messung 2 (Zu- und Absagen) ohne Regression.
**Die App v1.4.0 kann auf Test.** Live deploye ich, sobald du es freigibst.

## Deploy

Nach `docs/admin-runbook-hook-deploy.md`: nach `/tmp` geladen, `// Version: 4.29`, `v4.29 geladen`
und `routerAdd` als Gate, **sha256 gegen `main` geprüft**, alte Fassung gesichert, kopiert,
Neustart. Keine Coolify-Deployments in der Warteschlange.

Rückweg-Stand (v4.28, sha `4e14619b…`): `/root/backups/pb-hooks/main.pb.js.test.20261113-220618`

## Messungen auf Test

Aufbau: ein eigener Testplan mit Planer-Konto (Owner) und Crew-Konto, beide auf
`@example.invalid`, Crew-Freigabe in `crew_members` für diesen Plan. Alle Statuswechsel als
echter `PATCH` mit dem Token der jeweiligen Rolle, `/notify` und `/planstatus` ebenso.

| # | Messung | Ergebnis |
|---|---|---|
| 1 | Log nach Neustart | `[hook] main.pb.js v4.29 geladen` ✅ |
| 2 | Crew: `proposed → confirmed` und `proposed → declined` | **200 / 200**, bei `declined` läuft der Mailpfad (`kein RESEND_KEY`), bei `confirmed` nicht ✅ |
| 3 | Planer setzt `pencilled`, Crew → `declined` (alte App) | **200**, Mailpfad läuft ✅ |
| 4 | Crew: `pencilled → pencil_declined` | **200**, Mailpfad läuft ✅ |
| 5 | Crew: `pencil_declined → pencilled` | **200**, Mailpfad läuft ✅ |
| 6 | Crew: `pencil_declined → confirmed` und `declined → pencilled` | beide **400** `Status_transition_denied` ✅ |
| 7 | `invite` mit Tag A (`pencilled`) + Tag B (ohne Record), beide in `slots` und `mailSlots` | A bleibt `pencilled` (unverändertes `updated`), B neu `proposed`; Antwort `angelegt: 1`; `app_url` enthält **nur** Tag B ✅ |
| 8 | `pencil_info` mit zwei `mailSlots` | `ok`, `angelegt/aktualisiert/geloescht` = 0, Schnappschuss aller Plan-`assignments` (id, status, updated) vorher = nachher; `crew_invites` +1 mit Typ `pencil_info` und beiden Terminen; Log `pencil_info email sent … (2 slots)` ✅ |
| 9 | `GET /planstatus/{id}` als Crew | `pencil_declined` steht in der Antwort ✅ |
| 10 | Planer ändert `pos_label` am `pencil_declined`-Einsatz | **200**, Log `UPDATE pencil_declined: Status unverändert, kein E-Mail gesendet`, kein Mailpfad ✅ |
| 11 | `pencil_info` ohne `mailSlots` und mit `[]` | beide **400** `mailSlots fehlen`, `crew_invites` unverändert ✅ |
| 12 | `invite` nur mit dem `pencilled`-Tag, einmal ohne, einmal mit `mailSlots` | beide `{"ok":true,"skipped":"keine Termine"}`, `assignments` und `crew_invites` unverändert ✅ |
| 13 | `auxiliary.db`, `level > 0` seit dem Deploy | **0** `ReferenceError`/`TypeError` ✅ (s. u.) |

### Kontrollproben

Ohne Gegenprobe beweist ein grünes Ergebnis wenig, deshalb lief neben jeder Messung eine mit:

- **Zu 6:** `pencilled → confirmed` als Crew → **400** `Status_transition_denied`. Damit ist auch
  die dritte im Auftrag verbotene Kante gemessen.
- **Zu 5:** Der „WIEDER FREI"-Zweig hängt am Vorzustand `pencil_declined`. Gegenprobe: der
  **Planer** setzt einen `declined`-Einsatz auf `pencilled` → **kein** Mailpfad im Log, nur
  `UPDATE assignments fired`. Der Zweig greift also wirklich nur nach einer Vormerkungs-Absage.
- **Zu 10:** Derselbe Datensatz hatte kurz vorher beim **echten** Wechsel auf `pencil_declined`
  den Mailpfad durchlaufen. Die Unterdrückung beim erneuten Speichern ist damit ein
  Unterschied, kein Dauerzustand.
- **Zu 7 (Statuszeilen und Entfallen bleiben):** zusätzlich ein `update` mit dem
  `pencilled`-Tag in `slots` und vier `mailSlots`: `added` für den vorgemerkten Tag,
  `status` und `removed` für denselben Tag, `added` für einen anderen Tag. In `app_url` landeten
  genau **`status`, `removed` und das fremde `added`** — nur das neue `added` des vorgemerkten
  Tages fiel raus. Der Einsatz blieb `pencilled`.
- **Zu 8/11:** Crew-Konto ruft `pencil_info` auf → **404** (owner-Typ, Typ-Tabelle greift).
- **Zu 9:** `/planstatus` für einen fremden Plan → **404**.
- **Route:** erfundene Route **404** neben `/notify` **200**.
- **Zu 13:** Mechanismus der Abfrage geprüft, nicht nur das Ergebnis: das echte Muster
  `status_transition_denied` findet **3** Einträge (die drei gewollten Ablehnungen), ein
  erfundenes Muster **0**, `data` ist in **64 von 64** Zeilen seit dem Deploy gefüllt. Alle 4
  Einträge mit `level > 0` sind erwartet: die 3 Ablehnungen aus Messung 6 und Kontrolle plus
  die erfundene Kontroll-Route.

### Was Test nicht zeigen kann: die Betreffzeilen

Test hat keinen `RESEND_KEY`, `sendMail` steigt vor dem Versand aus und loggt den Betreff nicht.
Gemessen ist also, **dass** der Mailpfad an den richtigen Stellen läuft und an den richtigen
Stellen nicht — **nicht**, welcher Betreff („VORMERKUNG ABGESAGT", „WIEDER FREI", „ABGELEHNT")
gewählt wird. Das ergibt sich aus dem Code (`status`-Zweige in Abschnitt 3) und steht erst auf
Live mit der ersten echten Mail an `ADMIN_EMAIL` fest. Dein Auftrag lässt das für Test
ausdrücklich zu; ich nenne es, damit „bestanden" nicht mehr behauptet als gemessen ist.

## Aufgeräumt

Test ist **exakt** auf Ausgangsstand, gegen einen vorher genommenen Schnappschuss verglichen:
840 `assignments` (768 confirmed / 20 pencilled / 48 cancelled / 4 cancel_acked), davon 43 mit
`changed_by`, 1 `users`, 2 `_superusers`, 24 `crew_members`, 0 `crew_invites`, 3 `plans`.

Gelöscht: 6 Test-Einsätze, 3 `crew_invites` (invite, pencil_info, update), 3 `crew_members`, der
Testplan, die zwei Konten auf `@example.invalid` und der temporäre Superuser. Niemandem konnte
Post zugehen (Fantasie-Adressen, kein `RESEND_KEY`).

**Auf Live wurde nichts angelegt, geändert oder neu gestartet.**

## Live — wartet auf Freigabe

Sobald du freigibst: Deploy nach Runbook mit sha-Gate, Baseline vorher/nachher, dann die
Messungen, die ohne Konto gehen (1, 13, Routen-Kontrollen, keine Regression). Die
Schreib-Messungen 2–12 brauchen ein angemeldetes Konto — **auf Live lege ich keins an**, gleiche
Linie wie bei v4.28. Dafür wird die erste echte Vormerkungs-Absage der Crew die Betreffzeile
liefern, die Test nicht zeigen kann.

## Was bei dir liegen bleibt

Aus dem „Danach"-Abschnitt deines Auftrags, bewusst **nicht** von mir gemacht: Hook-Version in
`docs/database-schema.md` und `docs/security.md`, Auftrag stempeln, README,
`node tools/check-pb-rules.mjs`. Am Auftragsdokument habe ich nichts geändert.
