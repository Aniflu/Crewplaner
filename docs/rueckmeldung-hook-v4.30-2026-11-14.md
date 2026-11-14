# Rückmeldung an Marco — Hook v4.30 auf Test und Live

**Datum:** 2026-11-14 · **Auftrag:** `docs/admin-auftrag-hook-v4.30.md`

| Instanz | vorher | jetzt | sha256 | Zustand |
|---|---|---|---|---|
| Test | v4.29 | **v4.30** | `458b25406ca241527bb58ed3832eec89cac5d871351164fc4bcc1273be262a95` | healthy, `RestartCount: 0` |
| Live | v4.29 | **v4.30** | `458b25406ca241527bb58ed3832eec89cac5d871351164fc4bcc1273be262a95` | healthy, `RestartCount: 0` |

## Ergebnis

Beide Instanzen laufen auf v4.30, beide Logs zeigen `[hook] main.pb.js v4.30 geladen`.

- Test eingespielt um 16:37:28 UTC, Live um 16:37:55 UTC
- Quelle: `.pb_hooks/main.pb.js` aus Commit `c015602`. Der Hook ist byte-identisch mit dem aktuellen
  `main` (`cb7e397` hat nur den Auftrag hinzugefügt)
- Deploy nach Runbook: Die Datei kam zuerst nach `/tmp` und wurde erst nach dem Gate auf
  `v4.30 geladen` und die sha256 ins Volume kopiert. Danach folgte der Neustart.

## Kurzcheck (ohne Anmeldung)

| Prüfung | Test | Live |
|---|---|---|
| `GET /api/health` | 200 | 200 |
| `POST /notify` ohne Token | 401 | 401 |
| Frontend | – | 200 |
| `auxiliary.db`, `level > 0` seit Deploy | 0 | nur mein eigener 401-Kontrollaufruf |

Die fachlichen Tests habe ich wie vereinbart **nicht** gemacht, die liegen bei euch. Auf keiner
Instanz wurde ein Datensatz angelegt oder geändert.

## Rückweg

Ich habe v4.29 (sha `efe082b7…`) auf beiden Instanzen vor dem Kopieren gesichert:

- Test: `/root/backups/pb-hooks/main.pb.js.test.20261114-173728`
- Live: `/root/backups/pb-hooks/main.pb.js.live.20261114-173755`

Wenn etwas klemmt, sag Bescheid, dann spiele ich v4.29 auf der betroffenen Instanz zurück.
