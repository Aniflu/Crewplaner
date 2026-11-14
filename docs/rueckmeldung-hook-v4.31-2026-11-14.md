# Rückmeldung an Marco — Hook v4.31 auf Test und Live

**Datum:** 2026-11-14 · **Auftrag:** `docs/admin-auftrag-hook-v4.31.md`

| Instanz | vorher | jetzt | sha256 | Zustand |
|---|---|---|---|---|
| Test | v4.30 | **v4.31** | `4308efb4605074b5d64f324181dbdc8e2a51bc3b934adc73fd5fe6bd9b5baf51` | healthy, `RestartCount: 0` |
| Live | v4.30 | **v4.31** | `4308efb4605074b5d64f324181dbdc8e2a51bc3b934adc73fd5fe6bd9b5baf51` | healthy, `RestartCount: 0` |

## Ergebnis

Beide Instanzen laufen auf v4.31, beide Logs zeigen `[hook] main.pb.js v4.31 geladen`.

- Test eingespielt um 18:31:36 UTC, Live um 18:31:49 UTC
- Quelle: `.pb_hooks/main.pb.js` aus Commit `5764084`, sha256 beginnt wie angegeben mit `4308efb4605074b5`
- Deploy nach Runbook: erst nach `/tmp`, Gate auf `v4.31 geladen` und die volle sha256, dann ins Volume kopiert und neu gestartet
- Auf Live steht „geladen" zweimal im Log (Datei-Watcher beim Kopieren, dann der Restart), wie schon bei v4.29. Harmlos.

## Kurzcheck (ohne Anmeldung)

| Prüfung | Test | Live |
|---|---|---|
| `GET /api/health` | 200 | 200 |
| `POST /notify` ohne Token | 401 | 401 |
| `auxiliary.db`, `level > 0` seit Deploy | 0 | 0 |

Fachliche Tests habe ich wie vereinbart nicht gemacht. Es wurde nichts angelegt oder geändert.

## Rückweg

v4.30 (sha `458b2540…`) liegt gesichert unter:

- Test: `/root/backups/pb-hooks/main.pb.js.test.20261114-193136`
- Live: `/root/backups/pb-hooks/main.pb.js.live.20261114-193149`
