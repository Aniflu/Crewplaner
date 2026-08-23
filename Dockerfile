# Auslieferung der Live-App (Coolify baut daraus den Frontend-Container, Branch `live`).
#
# Audit-Befund K-1 (docs/audit-2026-08-09.md): Die Live-Domain lieferte bis v0.8.1 JEDE Datei
# des Repos aus — CLAUDE.md (164 KB) mitsamt der Chronik aller je gefundenen Lücken,
# .pb_hooks/main.pb.js, tools/, CHANGELOG.md. Ohne Anmeldung, mit einem Klick.
#
# ⚠️ HIER WIRD AUFGEZÄHLT, WAS RAUS SOLL — NICHT GEFILTERT, WAS NICHT RAUS SOLL.
# Das ist der ganze Punkt: Eine neue Datei im Repo ist damit standardmäßig NICHT öffentlich.
# Die Alternative (nginx-Regeln, die bestimmte Endungen mit 404 beantworten) muss bei jeder
# neuen Dateiendung nachgezogen werden und ist genau deshalb verworfen worden.
#
# Wer hier etwas ergänzt, veröffentlicht es. tests/delivery.test.mjs hält gegen.

FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf

WORKDIR /usr/share/nginx/html

# Die vier Oberflächen
COPY index.html admin.html login.html view.html ./

# Pflichtangaben. Diese beiden MÜSSEN öffentlich sein — § 5 DDG verlangt „ständig verfügbar",
# und der Footer jeder Oberfläche verlinkt sie. Fehlen sie hier, laufen die Links live ins 404.
COPY impressum.html datenschutz.html ./

# Stil, Symbol, Service Worker (sw.js hält die Module frisch, siehe v0.19.0)
COPY styles.css theme.css favicon.svg sw.js ./

# Anwendungscode und die selbstgehosteten Schriften (Geist / JetBrains Mono)
COPY js/     ./js/
COPY assets/ ./assets/

# Die beiden Anleitungen — der Hook verlinkt sie in den E-Mails an die Crew
# (crewplanner.nyxlightwork.de/docs/guide-crew.html, seit Hook v4.11).
COPY docs/guide-admin.html docs/guide-crew.html ./docs/
