# 🔒 Sicherheitsrichtlinie: Personalplan (Crew Scheduling)

## ⚠️ WICHTIG: DSGVO & Personendatenschutz
Dieses System verarbeitet **personenbezogene Daten** (Namen, E-Mails, Arbeitszeiten, Verfügbarkeit).

- **Grundsatz:** Datensparsamkeit (Mindestprinzip) — nur nötige Daten speichern
- **Recht:** DSGVO Artikel 32 (Sicherheit der Verarbeitung)
- **Zugriff:** Nur für autorisiertes Personal
- **Haftung:** Datenlecks können zu Bußgeldern führen (bis 20 Mio. EUR oder 4% des Umsatzes)

---

## 1. Personendaten-Schutz (DSGVO)

### Datenminimierung
Speichere **nur** die absolut notwendigen Felder:

```yaml
# ✅ ERLAUBT
crew:
  - id: uuid
  - name: string (required)
  - email: email (required)
  - phone: phone (optional, nur wenn needed)
  - roles: array (position-related)
  - availability: date range

# ❌ VERBOTEN
- geburtsdatum (nicht notwendig für Scheduling)
- adresse (nicht notwendig)
- nationale_id (NIEMALS speichern)
- foto (nur mit explizitem Consent)
```

### Verschlüsselung (Encryption at Rest)
Personendaten müssen in der Datenbank verschlüsselt gespeichert werden.

```bash
# Pocketbase mit SQLCipher (Encrypted SQLite)
docker run -e PB_ENCRYPTION=true \
  -e PB_ENCRYPTION_KEY="$(openssl rand -base64 32)" \
  pocketbase
```

**Wichtig:** Der Verschlüsselungsschlüssel muss:
- [ ] In einer `.env` Datei (nicht im Repo) gespeichert sein
- [ ] Regelmäßig rotiert werden (z.B. halbjährlich)
- [ ] Offline (Hardware-Token) als Backup vorhanden sein

---

## 2. Pocketbase Credentials & DB-Passwörter

Der Admin-Zugang zu Pocketbase ist **kritisch** und muss streng geschützt sein.

```bash
# .env.production (NIEMALS im Repo committen!)
PB_DATABASE_URL="postgres://crewplan_user:SECURE_PASS_32_CHARS@db.internal/crewplan"
PB_PUBLIC_URL="https://crewplanner.nyxlightwork.de"
PB_ADMIN_EMAIL="admin@your-company.com"
PB_ADMIN_PASSWORD="admin_password_SECURE_32_CHARS"
PB_SECRET_KEY="random_32_char_secret_for_jwt_signing"
```

### Admin Token Management
```bash
# Initiales Admin-Token generieren (lokal)
curl -X POST https://crewplanner.nyxlightwork.de/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "identity": "admin@your-company.com",
    "password": "SECURE_PASSWORD"
  }' | jq .token

# Token in .env.local speichern (NICHT .env im Repo!)
echo "PB_ADMIN_TOKEN=..." >> .env.local
# NIEMALS in git commiten!
```

**Best Practice:**
- [ ] Admin-Token nur in Deployment-Pipeline verwenden
- [ ] Token-TTL setzen (z.B. 24 Stunden)
- [ ] Alte Tokens regelmäßig löschen
- [ ] Audit-Log aller Admin-Aktionen aktivieren

---

## 3. .env Management für Deployment

### Separate Umgebungen
```bash
# .env.development (lokal, nur zum Testen)
NODE_ENV=development
PB_JWT_SECRET=dev_secret_short
DEBUG=true

# .env.production (sicherer Server, via GitHub Secrets)
NODE_ENV=production
PB_JWT_SECRET=${{ secrets.PB_JWT_SECRET }}
REDIS_URL=${{ secrets.REDIS_URL }}
DEBUG=false
```

### Docker Compose mit Secrets
```yaml
# docker-compose.prod.yml
version: '3.9'
services:
  pocketbase:
    image: pocketbase:latest
    environment:
      PB_DATABASE_URL: ${PB_DATABASE_URL}
      PB_SECRET_KEY: ${PB_SECRET_KEY}
    secrets:
      - db_password
    ports:
      - "8090:8090"

secrets:
  db_password:
    external: true  # Externe Secret von Docker Secrets Manager
```

---

## 4. SSH-Zugang Sicherheit (root@crewplanner.nyxlightwork.de)

Der Server darf **NUR** über SSH-Keys erreichbar sein. Passwort-Login ist VERBOTEN.

### SSH Server Config
```bash
# /etc/ssh/sshd_config (Server-Seite)
PermitRootLogin prohibit-password  # Nur mit Key, nicht mit Pass
PasswordAuthentication no           # Passwort-Auth deaktivieren
PubkeyAuthentication yes            # Nur SSH-Keys
AuthorizedKeysFile .ssh/authorized_keys
MaxAuthTries 3                      # Max 3 Versuche, dann sperren
Port 22

# Firewall-Regel: Nur von bekannten IPs
# ufw allow from 192.168.1.0/24 to any port 22
```

### Client-Seite SSH Setup
```bash
# Lokal: SSH-Key generieren (NIEMALS ohne Passwort!)
ssh-keygen -t ed25519 -C "crew-admin@your-company.com" -f ~/.ssh/crew-deploy

# Public Key zum Server hochladen (einmalig)
ssh-copy-id -i ~/.ssh/crew-deploy.pub root@crewplanner.nyxlightwork.de

# Deploy Script (nutze Key-Agent)
ssh -i ~/.ssh/crew-deploy root@crewplanner.nyxlightwork.de "cd /app && git pull && npm run build"
```

**Warnung:**
- [ ] Private Keys NIEMALS in Repos
- [ ] Keys mit Passwort schützen (`-N "passphrase"`)
- [ ] Keys auf Hardware-Token lagern (YubiKey, Ledger)
- [ ] SSH-Keys jährlich rotieren

---

## 5. E-Mail Webhook Sicherheit

Webhooks von Pocketbase (z.B. für Shift-Benachrichtigungen) müssen signiert werden.

```javascript
// webhook-handler.js
const crypto = require('crypto');

app.post('/webhooks/crew-update', (req, res) => {
  const signature = req.headers['x-pb-signature'];
  const secret = process.env.WEBHOOK_SECRET;
  
  // Validiere Signature
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(req.body))
    .digest('hex');
  
  if (signature !== expectedSig) {
    return res.status(403).json({ error: 'Invalid Signature' });
  }
  
  // Nur jetzt sichere DB-Operationen durchführen
  updateCrewAvailability(req.body.crew_id, req.body.status);
  res.json({ success: true });
});
```

**Best Practice:**
- [ ] HMAC-SHA256 für Signatur nutzen
- [ ] Request Timestamp validieren (nicht älter als 5 Min)
- [ ] Webhook-Secret in `.env` speichern
- [ ] Alle Webhook-Calls protokollieren (Audit-Log)

---

## 6. GitHub Secrets für CI/CD

Sensitive Credentials in GitHub Actions speichern, NICHT im Code.

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production  # Zusätzliche Schutz-Umgebung
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Deploy
        env:
          PB_DATABASE_URL: ${{ secrets.PB_DATABASE_URL }}
          PB_JWT_SECRET: ${{ secrets.PB_JWT_SECRET }}
          SSH_PRIVATE_KEY: ${{ secrets.SSH_PRIVATE_KEY }}
        run: |
          mkdir -p ~/.ssh
          echo "$SSH_PRIVATE_KEY" > ~/.ssh/deploy_key
          chmod 600 ~/.ssh/deploy_key
          ssh -i ~/.ssh/deploy_key root@crewplanner.nyxlightwork.de "cd /app && git pull && npm run deploy"
          rm ~/.ssh/deploy_key  # Cleanup
```

**Wichtig:**
- [ ] GitHub Secrets nutzen (Settings → Secrets and Variables)
- [ ] Environment Protection Rules aktivieren (nur Team-Leads können deployen)
- [ ] Secrets maskieren in Logs (GitHub macht das automatisch)
- [ ] Secrets rotieren nach Security-Incidents

---

## 7. Access Control (RBAC)

Implementiere strikte Rollen mit minimalen Berechtigungen.

```yaml
# Rollen und ihre Berechtigungen
roles:
  admin:
    permissions:
      - "tours:*"           # Vollzugriff auf Touren
      - "crews:*"           # Vollzugriff auf Crew-Daten
      - "users:*"           # Vollzugriff auf User-Management
      - "settings:*"        # Server-Einstellungen
      - "logs:view"         # Audit-Logs
  
  manager:
    permissions:
      - "tours:create"      # Neue Touren erstellen
      - "tours:edit_own"    # Nur eigene Touren bearbeiten
      - "crews:read"        # Crew-Daten lesen
      - "crews:edit_assign" # Crew zu Touren zuweisen
      - "reports:export"    # CSV-Export für Reports
  
  crew:
    permissions:
      - "tours:read_own"    # Nur eigene Touren sehen
      - "tours:respond"     # Einladungen akzeptieren/ablehnen
```

**Implementierung in Pocketbase:**
```javascript
// pocketbase rules.js
// Crew sieht nur ihre eigenen Touren
const crew = $authModel;
const isCrewAssigned = await db.getFirstRecord('crew_slots', 
  `tour_id = "${$id}" && crew_id = "${crew.id}"`
);

$allow = isCrewAssigned || $authModel.role === 'admin';
```

**Audit-Logging:**
```javascript
// Jede Berechtigungs-Änderung protokollieren
db.createRecord('audit_log', {
  user_id: $authModel.id,
  action: 'permission_change',
  old_role: 'manager',
  new_role: 'admin',
  timestamp: new Date(),
  reason: 'Promotion by admin@company.com'
});
```

---

## 8. Compliance Checklist

Vor jedem Deployment überprüfen:

- [ ] `.env` Datei in `.gitignore`?
- [ ] Keine Passwörter im Code? (`grep -r "password\|secret\|token" src/`)
- [ ] DSGVO-Audit durchgeführt? (Datenliste, Zwecke, Speicherdauer)
- [ ] Datenschutzerklärung aktualisiert?
- [ ] Consent für E-Mail-Benachrichtigungen eingeholt?
- [ ] Datenschutz-Impact-Assessment (DPIA) durchgeführt?
- [ ] Encryption-Keys in separatem Vault?
- [ ] SSH-Keys nur auf Hardware-Token?
- [ ] Audit-Logs mindestens 90 Tage aufbewahrt?
- [ ] Regelmäßige Penetration Tests geplant?

---

## 🆘 Sicherheits-Incident Response

Falls ein Datenleck verdächtigt wird:

1. **SOFORT:** Alle Credentials rotieren (Passwörter, Keys, Tokens)
2. **Kontakt:** DSGVO-Datenschutzbeauftragten benachrichtigen
3. **Logs:** Alle Zugriffe der letzten 30 Tage analysieren
4. **Betroffene:** Innerhalb 72 Stunden benachrichtigen (DSGVO Pflicht)
5. **Audit:** Externe Security-Analyse durchführen
6. **Follow-up:** Post-Incident Review und Verbesserungen

**Notfall-Kontakt:** security@your-company.com | +49-XXX-XXXXXXX
