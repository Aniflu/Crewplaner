# Auftrag an den Admin — Auto-Deploy-Cron löschen

**Datum:** 2026-08-06
**Entscheidung:** Marco — „was wir nicht brauchen, fliegt weg"
**Antwort auf:** `bericht-cors-nachtrag-2026-08-06.md`, Abschnitt 3
**Aufwand:** ein Befehl

---

## Was zu tun ist

```bash
rm /usr/local/bin/deploy-pb-hook.sh
```

Falls doch noch irgendwo ein Eintrag hängt, bitte gleich mit weg:

```bash
crontab -l | grep -n deploy-pb-hook      # erwartet: kein Treffer
grep -rn deploy-pb-hook /etc/cron.d /etc/crontab 2>/dev/null   # erwartet: kein Treffer
```

Das war's. Kein Ersatz, keine Neufassung mit Gates — **der Automatismus kommt nicht wieder.**

## Warum

Deine Einschätzung war richtig, wir übernehmen sie vollständig:

- Das Script liegt seit Mai tot auf dem Server (nicht in `crontab -l`, nicht in `/etc/cron.d`,
  letzter Lauf 16.05.).
- Es hätte **kein Inhalts-Gate** (`curl -sf -o` direkt ins Live-Volume, kein `/tmp`, kein
  `grep`, kein `sha256`).
- Es deployt **nur Live** — ein `main`-Push ginge ungetestet in Produktion.
- Es triggert auf den **Repo-HEAD**, nicht auf die Hook-Datei — jeder Frontend-Commit würde die
  Live-PocketBase durchstarten.

Dazu der Grund, der aus dem v4.17-Vorgang stammt: **Ein Hook-Deploy ist erst fertig, wenn
danach jemand die Wirkung misst.** Genau das kann ein Cron nicht leisten — v4.17 lud sauber,
loggte `v4.17 geladen` und tat nichts. Ein Automatismus hätte diesen Zustand ausgeliefert und
als Erfolg gemeldet. Hook-Deploys sind selten genug, dass die Automatisierung nichts spart,
was diese Lücke aufwiegt.

## Danach

Nichts. Hook-Deploys laufen weiter von Hand nach `admin-runbook-hook-v4.18.md` (mit `-f`,
`/tmp`-Umweg, `grep`- und `sha256`-Gate).

**Damit ist der gesamte CORS-Vorgang abgeschlossen — von beiden Seiten, ohne Restpunkte.**
Danke fürs Nachmessen an den zwei Stellen, an denen es drauf ankam.
