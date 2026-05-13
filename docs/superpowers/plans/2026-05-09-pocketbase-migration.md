# Pocketbase Migration — Supabase ersetzen

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Supabase (Auth + Postgres + Edge Functions) vollständig durch Pocketbase auf dem eigenen Server ersetzen — ohne Build-Schritt, ohne npm, ohne Änderung der App-Architektur.

**Architecture:** Pocketbase läuft als Single-Binary auf dem eigenen Server und stellt Auth-API, CRUD-REST-API und E-Mail-Hooks bereit. Der Vanilla-JS-Client kommuniziert per direktem `fetch()` mit Pocketbase (kein SDK). Die App bleibt auf GitHub Pages, CORS wird in Pocketbase konfiguriert.

**Tech Stack:** Pocketbase v0.22+ (Go, SQLite, JS-Hooks), Vanilla JS (fetch API), eigener SMTP-Server

---

## Dateiübersicht

| Datei | Änderung | Verantwortung |
|---|---|---|
| `js/pb.js` | NEU | fetch-Wrapper für Pocketbase REST-API (Auth-Header, Error-Handling) |
| `js/config.js` | ÄNDERN | `SUPABASE_URL`/`ANON_KEY` → `POCKETBASE_URL`, `MAIL_TOKEN` entfernen |
| `js/authService.js` | REWRITE | Pocketbase-Token statt Supabase-Session |
| `js/dataService.js` | REWRITE | Alle CRUD-Calls via `pb.js`-Helfer |
| `login.html` | ÄNDERN | Login-JS auf Pocketbase-REST umschreiben |
| `index.html` | ÄNDERN | Supabase-CDN entfernen, `pb.js` hinzufügen |
| `.pb_hooks/main.pb.js` | NEU | E-Mail-Hooks: `assignments`-Änderungen → SMTP |

**Nicht geändert:** `state.js`, `render.js`, `bundle.js`, `dropdown.js`, alle anderen JS-Dateien — die internen Schnittstellen (`loadCrewMeta`, `proposeCrew`, etc.) bleiben identisch.

---

## Task 1: Pocketbase Server Setup

**Files:**
- Serverinstallation (manuell auf dem eigenen Server)
- Collections werden über Admin-UI angelegt

### Schritt 1.1: Pocketbase herunterladen und starten

- [ ] **Pocketbase binary herunterladen:**

```bash
# Auf dem Server (Linux x86_64):
wget https://github.com/pocketbase/pocketbase/releases/latest/download/pocketbase_linux_amd64.zip
unzip pocketbase_linux_amd64.zip
chmod +x pocketbase
./pocketbase serve --http="0.0.0.0:8090"
```

Läuft auf Port 8090. Admin-UI: `http://deinserver:8090/_/`

- [ ] **Systemd-Service anlegen** (damit Pocketbase nach Neustart weiterläuft):

```ini
# /etc/systemd/system/pocketbase.service
[Unit]
Description=Pocketbase
After=network.target

[Service]
ExecStart=/opt/pocketbase/pocketbase serve --http="0.0.0.0:8090"
WorkingDirectory=/opt/pocketbase
Restart=always
User=www-data

[Install]
WantedBy=multi-user.target
```

```bash
systemctl enable pocketbase
systemctl start pocketbase
```

### Schritt 1.2: Admin-Konto und SMTP

- [ ] Admin-UI öffnen: `http://deinserver:8090/_/`
- [ ] Admin-Account anlegen (E-Mail + Passwort)
- [ ] Navigieren zu **Settings → Mail settings**:
  - SMTP Host: `mail.deinserver.de` (oder wie dein Mailserver heißt)
  - SMTP Port: `587` (oder `465` für SSL)
  - Username: `noreply@deinedomain.de`
  - Password: E-Mail-Passwort
  - Sender Address: `noreply@deinedomain.de`
  - Sender Name: `Tour Crew Plan`
  - Klick **Save**
- [ ] **Settings → Application → Application URL** setzen: `https://deinserver.de` (oder deine Domain)
- [ ] **Settings → CORS** → Allowed Origins hinzufügen: `https://m4dm0nky.github.io`

### Schritt 1.3: Collections anlegen

In der Admin-UI unter **Collections** jeweils "New collection" (Typ: **Base collection**):

- [ ] **`plans`** Collection erstellen mit Feldern:
  - `name` — Text, Required
  - `owner` — Relation → `users`, Required

- [ ] **`plan_members`** Collection erstellen:
  - `plan_id` — Relation → `plans`, Required
  - `user_id` — Relation → `users`, Required
  - `role` — Text (owner/member)

- [ ] **`crew_members`** Collection erstellen:
  - `plan_id` — Relation → `plans`, Required
  - `name` — Text, Required
  - `email` — Email (optional)
  - `sort_order` — Number
  - `user_id` — Relation → `users` (optional)

- [ ] **`assignments`** Collection erstellen:
  - `plan_id` — Relation → `plans`, Required
  - `date` — Text, Required (Format: `2026-07-01`)
  - `pos_id` — Text, Required (z.B. `gl`, `sys`)
  - `pos_label` — Text (z.B. `GL`, `System`) — für E-Mail-Hooks
  - `crew_name` — Text
  - `status` — Text (proposed/confirmed/declined/assigned)
  - `proposed_by` — Relation → `users` (optional)
  - `responded_at` — DateTime (optional)

### Schritt 1.4: Access Rules setzen

Für jede der 4 Collections in der Admin-UI unter **API Rules**:

- [ ] **`plans`**: List/View/Create/Update/Delete = `@request.auth.id != ""`
- [ ] **`plan_members`**: List/View/Create/Update/Delete = `@request.auth.id != ""`
- [ ] **`crew_members`**: List/View/Create/Update/Delete = `@request.auth.id != ""`
- [ ] **`assignments`**: List/View/Create/Update/Delete = `@request.auth.id != ""`

- [ ] **`users`** Collection (built-in): **Settings → Auth** sicherstellen:
  - Email/Password Auth: aktiviert
  - Email Verification: optional (für Test: deaktiviert)
  - Allow OAuth2: nicht nötig

### Schritt 1.5: Admin-User anlegen

- [ ] In der Admin-UI unter **Users** → New Record:
  - email: `madmaxmail@web.de`
  - password: sicheres Passwort wählen
  - verified: true (manuell setzen)

- [ ] **Test:** In neuem Browser-Tab:
```
POST https://deinserver:8090/api/collections/users/auth-with-password
{"identity": "madmaxmail@web.de", "password": "..."}
```
Erwartung: `{"token": "eyJ...", "record": {...}}` ✓

---

## Task 2: `js/pb.js` — REST Client Helper

**Files:**
- Create: `js/pb.js`
- Modify: `index.html` (Script-Tag hinzufügen)

### Schritt 2.1: Datei anlegen

- [ ] **`js/pb.js` erstellen** mit folgendem Inhalt:

```javascript
// ── Pocketbase REST Client ──────────────────────────────────────────────────────
// Thin fetch-wrapper: setzt Authorization-Header automatisch aus localStorage.
// Alle API-Routen: https://pocketbase.io/docs/api-records/

async function _pbFetch(method, path, body) {
  const token = localStorage.getItem('pb_token');
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (token) opts.headers['Authorization'] = 'Bearer ' + token;
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch(POCKETBASE_URL + path, opts);
  if (res.status === 204) return null;
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || 'Pocketbase Fehler ' + res.status);
  return json;
}

function pbGet(path)          { return _pbFetch('GET',    path);       }
function pbPost(path, body)   { return _pbFetch('POST',   path, body); }
function pbPatch(path, body)  { return _pbFetch('PATCH',  path, body); }
function pbDelete(path)       { return _pbFetch('DELETE', path);       }

// ── Liste mit Filter ───────────────────────────────────────────────────────────
function pbList(collection, filter, sort, perPage) {
  const params = new URLSearchParams({
    filter: filter || '',
    sort: sort || '-created',
    perPage: perPage || 200
  });
  return pbGet('/api/collections/' + collection + '/records?' + params);
}

// ── Ersten Treffer einer Filter-Abfrage holen ──────────────────────────────────
async function pbFirst(collection, filter) {
  const data = await pbList(collection, filter, '-created', 1);
  return data?.items?.[0] || null;
}

// ── Upsert: existierenden Record aktualisieren oder neuen anlegen ──────────────
async function pbUpsert(collection, filter, createData, updateData) {
  const existing = await pbFirst(collection, filter);
  if (existing) {
    return pbPatch(
      '/api/collections/' + collection + '/records/' + existing.id,
      updateData !== undefined ? updateData : createData
    );
  }
  return pbPost('/api/collections/' + collection + '/records', createData);
}
```

### Schritt 2.2: Script-Tag in index.html einfügen

- [ ] In `index.html` — **vor** `config.js`, **nach** `dialog.js`:

```html
<!-- Vorher: -->
<script src="js/dialog.js?v=22"></script>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="js/config.js?v=22"></script>

<!-- Nachher: -->
<script src="js/dialog.js?v=23"></script>
<script src="js/pb.js?v=23"></script>
<script src="js/config.js?v=23"></script>
```

Den Supabase-CDN-Script-Tag entfernen. Alle anderen `?v=22` → `?v=23` (alle Script-Tags in index.html).

### Schritt 2.3: Testen

- [ ] Browser-Konsole öffnen auf `http://localhost:8080`
- [ ] Eingabe:
```javascript
pbGet('/api/health')
```
Erwartung: `{"code": 200, "message": "API is healthy."}` ✓

- [ ] Commit:
```bash
git add js/pb.js index.html
git commit -m "feat: add Pocketbase REST client helper, remove Supabase CDN"
```

---

## Task 3: `js/config.js` Update

**Files:**
- Modify: `js/config.js`

### Schritt 3.1: Supabase-Konstanten ersetzen

- [ ] **`js/config.js`** vollständig ersetzen:

```javascript
// ── Pocketbase-Konfiguration ────────────────────────────────────────────────────
// POCKETBASE_URL: URL deines Pocketbase-Servers (kein Trailing-Slash)
// Beispiel: 'https://pb.deinedomain.de' oder 'http://deinserver:8090'

const POCKETBASE_URL = 'https://pb.deinedomain.de'; // ← ANPASSEN

// Feature-Flag: auf false setzen um Pocketbase zu deaktivieren (localStorage-Modus)
const SUPABASE_ENABLED = true;

// Admin-E-Mail — hat vollen Zugriff (Vorschlagen, Direkt besetzen, Crew verknüpfen)
const ADMIN_EMAIL = 'madmaxmail@web.de';
```

### Schritt 3.2: Testen

- [ ] Browser-Konsole:
```javascript
console.log(POCKETBASE_URL) // → 'https://pb.deinedomain.de'
console.log(typeof SUPABASE_URL) // → 'undefined'
```

- [ ] Commit:
```bash
git add js/config.js
git commit -m "config: replace Supabase constants with POCKETBASE_URL"
```

---

## Task 4: `login.html` Rewrite

**Files:**
- Modify: `login.html` (Script-Block ab Zeile 172, Supabase-Script-Tag entfernen)

### Schritt 4.1: Supabase-Script entfernen

- [ ] In `login.html` Zeile 8-9 ersetzen:

```html
<!-- Entfernen: -->
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="js/config.js?v=18"></script>

<!-- Ersetzen mit: -->
<script src="js/pb.js?v=23"></script>
<script src="js/config.js?v=23"></script>
```

### Schritt 4.2: Login-JS-Block ersetzen

- [ ] Den kompletten `<script>`-Block ab Zeile 172 durch folgenden Code ersetzen:

```javascript
<script>
  // Bereits eingeloggt → direkt weiterleiten
  (function() {
    const token = localStorage.getItem('pb_token');
    if (!token) return;
    pbGet('/api/collections/users/auth-refresh').then(data => {
      localStorage.setItem('pb_token', data.token);
      localStorage.setItem('pb_user', JSON.stringify(data.record));
      window.location.href = 'index.html';
    }).catch(() => {
      localStorage.removeItem('pb_token');
      localStorage.removeItem('pb_user');
    });
  })();

  document.getElementById('password').addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
  });

  async function doLogin() {
    const email    = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const btn = document.getElementById('btnLogin');

    document.getElementById('errorMsg').style.display  = 'none';
    document.getElementById('successMsg').style.display = 'none';

    if (!email || !password) { showError('Bitte E-Mail und Passwort eingeben.'); return; }

    btn.disabled = true;
    btn.textContent = 'Anmelden…';

    try {
      const data = await pbPost('/api/collections/users/auth-with-password', {
        identity: email, password
      });
      localStorage.setItem('pb_token', data.token);
      localStorage.setItem('pb_user', JSON.stringify(data.record));
      btn.textContent = 'Weiterleiten…';
      window.location.href = 'index.html';
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Anmelden';
      showError(_translateError(e.message));
    }
  }

  async function doPasswordReset() {
    const email = document.getElementById('email').value.trim();
    if (!email) { showError('Bitte zuerst E-Mail-Adresse eingeben.'); return; }
    try {
      await pbPost('/api/collections/users/request-password-reset', { email });
      document.getElementById('successMsg').textContent = 'Reset-Link wurde an ' + email + ' gesendet.';
      document.getElementById('successMsg').style.display = 'block';
    } catch (e) {
      showError('Fehler beim Senden des Reset-Links.');
    }
  }

  function showError(msg) {
    const el = document.getElementById('errorMsg');
    el.textContent = msg;
    el.style.display = 'block';
  }

  function _translateError(msg) {
    if (msg.includes('Failed to authenticate') || msg.includes('Invalid credentials'))
      return 'E-Mail oder Passwort falsch.';
    if (msg.includes('Too many requests')) return 'Zu viele Versuche. Bitte kurz warten.';
    return msg;
  }
</script>
```

### Schritt 4.3: Testen

- [ ] `http://localhost:8080/login.html` öffnen
- [ ] Mit `madmaxmail@web.de` + Passwort einloggen
- [ ] Erwartung: Weiterleitung zu `index.html` ✓
- [ ] `localStorage.getItem('pb_token')` in Konsole → JWT-String ✓
- [ ] Falsches Passwort → Fehlermeldung sichtbar ✓

- [ ] Commit:
```bash
git add login.html
git commit -m "feat: replace Supabase login with Pocketbase auth"
```

---

## Task 5: `js/authService.js` Rewrite

**Files:**
- Modify: `js/authService.js` (vollständiger Austausch)

### Schritt 5.1: authService.js ersetzen

- [ ] **`js/authService.js`** vollständig ersetzen mit:

```javascript
// ── Auth Service (Pocketbase) ──────────────────────────────────────────────────
window.__authGuarded = SUPABASE_ENABLED;

async function _authCheckAndStart() {
  try {
    const token   = localStorage.getItem('pb_token');
    const userStr = localStorage.getItem('pb_user');

    if (!token || !userStr) {
      window.location.href = 'login.html';
      return;
    }

    // Token beim Server erneuern (validiert + gibt frisches Token)
    let user;
    try {
      const data = await pbGet('/api/collections/users/auth-refresh');
      localStorage.setItem('pb_token', data.token);
      localStorage.setItem('pb_user', JSON.stringify(data.record));
      user = data.record;
    } catch (e) {
      // Token abgelaufen oder ungültig
      localStorage.removeItem('pb_token');
      localStorage.removeItem('pb_user');
      window.location.href = 'login.html';
      return;
    }

    CURRENT_USER_ID    = user.id;
    CURRENT_USER_EMAIL = user.email;
    IS_ADMIN           = user.email === ADMIN_EMAIL;
    _showUserBadge(user);
    document.body.style.visibility = 'visible';
    startApp();

    Promise.all([loadCrewMeta(), loadAssignmentStatuses()]).then(() => {
      renderTable();
      if (typeof checkAndOpenMySchedule === 'function') checkAndOpenMySchedule();
    });
  } catch (e) {
    console.error('Auth-Fehler:', e);
    document.body.style.visibility = 'visible';
    startApp();
  }
}

function _showUserBadge(user) {
  const el = document.getElementById('userBadge');
  if (!el) return;
  el.style.display = 'flex';
  const emailEl = el.querySelector('.user-email');
  if (emailEl) emailEl.textContent = user.email;
  const btnCL = document.getElementById('btnCrewLink');
  if (btnCL && user.email === ADMIN_EMAIL) btnCL.style.display = '';
  const btnCN = document.getElementById('btnCrewNotify');
  if (btnCN && user.email === ADMIN_EMAIL) btnCN.style.display = '';
}

async function logout() {
  localStorage.removeItem('pb_token');
  localStorage.removeItem('pb_user');
  window.location.href = 'login.html';
}

document.addEventListener('DOMContentLoaded', () => {
  if (!SUPABASE_ENABLED) return;
  document.body.style.visibility = 'hidden';
  _authCheckAndStart();
});
```

### Schritt 5.2: Testen

- [ ] Browser-Tab öffnen: `http://localhost:8080`
- [ ] Erwartung: nach Login wird `index.html` geladen, App startet normal ✓
- [ ] Konsole: kein Fehler, `CURRENT_USER_EMAIL` = `madmaxmail@web.de` ✓
- [ ] Logout-Button klicken → zurück zu `login.html` ✓

- [ ] Commit:
```bash
git add js/authService.js
git commit -m "feat: replace Supabase auth with Pocketbase token auth"
```

---

## Task 6: `js/dataService.js` Rewrite

**Files:**
- Modify: `js/dataService.js` (vollständiger Austausch)

Alle externen Funktionsnamen bleiben identisch (`loadCrewMeta`, `proposeCrew`, `confirmAssignment`, `declineAssignment`, `cancelProposal`, `bulkCancelProposals`, `bulkProposeCrew`, `sendCrewInvite`, `saveCrewLink`). Nur die Implementierung wechselt von Supabase zu Pocketbase.

### Schritt 6.1: dataService.js vollständig ersetzen

- [ ] **`js/dataService.js`** ersetzen mit:

```javascript
// ── Mail-Fehler sichtbar anzeigen (8s Toast) ───────────────────────────────────
function _showMailError(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = '📧 E-Mail Fehler: ' + msg;
  t.style.background = '#e84a4a';
  t.style.opacity = '1';
  clearTimeout(t._t);
  t._t = setTimeout(() => { t.style.opacity = '0'; }, 8000);
}

// ── Plan-Sync: erstellt/holt Pocketbase-Plan-ID für aktiven localStorage-Plan ──
// activePlanId kommt aus plans.js (globale Variable)
async function _getActivePlanId() {
  if (!SUPABASE_ENABLED || !CURRENT_USER_ID) return null;
  const key = 'tourplan_pb_' + (activePlanId || 'default');
  const stored = localStorage.getItem(key);
  if (stored) return stored;

  const plans = typeof getPlansIndex === 'function' ? getPlansIndex() : [];
  const planName = plans.find(p => p.id === activePlanId)?.name || 'Tour Plan';

  try {
    // Prüfen ob Plan schon existiert (z.B. nach Cache-Löschung)
    const existing = await pbFirst('plans',
      `name = "${planName.replace(/"/g, '\\"')}" && owner = "${CURRENT_USER_ID}"`);
    if (existing) {
      localStorage.setItem(key, existing.id);
      return existing.id;
    }

    const created = await pbPost('/api/collections/plans/records', {
      name: planName, owner: CURRENT_USER_ID
    });
    if (created?.id) {
      localStorage.setItem(key, created.id);
      await pbPost('/api/collections/plan_members/records', {
        plan_id: created.id, user_id: CURRENT_USER_ID, role: 'owner'
      });
      return created.id;
    }
  } catch (e) {
    console.warn('Plan-Sync-Fehler:', e.message);
  }
  return null;
}

// ── Crew-Meta laden (E-Mail + user_id pro Crew-Name) ──────────────────────────
async function loadCrewMeta() {
  if (!SUPABASE_ENABLED) return;
  const planId = await _getActivePlanId();
  if (!planId) return;

  try {
    const data = await pbList('crew_members', `plan_id = "${planId}"`);
    Object.keys(crewMeta).forEach(k => delete crewMeta[k]);
    (data?.items || []).forEach(row => {
      if (row.email || row.user_id) {
        crewMeta[row.name] = { email: row.email, userId: row.user_id };
      }
    });
  } catch (e) {
    console.warn('loadCrewMeta Fehler:', e.message);
  }
}

// ── Assignment-Status laden ────────────────────────────────────────────────────
async function loadAssignmentStatuses() {
  if (!SUPABASE_ENABLED) return;
  const planId = await _getActivePlanId();
  if (!planId) return;

  try {
    const data = await pbList('assignments',
      `plan_id = "${planId}" && status != "assigned"`);
    Object.keys(assignmentStatuses).forEach(k => delete assignmentStatuses[k]);
    (data?.items || []).forEach(row => {
      if (!assignmentStatuses[row.date]) assignmentStatuses[row.date] = {};
      assignmentStatuses[row.date][row.pos_id] = {
        status: row.status,
        proposedBy: row.proposed_by,
        crewName: row.crew_name
      };
    });
  } catch (e) {
    console.warn('loadAssignmentStatuses Fehler:', e.message);
  }
}

// ── Crew vorschlagen (Admin → Crew-Mitglied) ───────────────────────────────────
async function proposeCrew(dateStr, posId, crewName, crewEmail) {
  if (!SUPABASE_ENABLED) return;
  const planId = await _getActivePlanId();
  if (!planId) return;

  const pos = typeof POSITIONS !== 'undefined' ? POSITIONS.find(p => p.id === posId) : null;
  const posLabel = pos?.label || posId;

  try {
    await pbUpsert(
      'assignments',
      `plan_id = "${planId}" && date = "${dateStr}" && pos_id = "${posId}"`,
      {
        plan_id: planId, date: dateStr, pos_id: posId, pos_label: posLabel,
        crew_name: crewName, status: 'proposed', proposed_by: CURRENT_USER_ID
      },
      { crew_name: crewName, pos_label: posLabel, status: 'proposed', proposed_by: CURRENT_USER_ID }
    );
  } catch (e) {
    console.warn('proposeCrew Fehler:', e.message);
    return;
  }

  if (!assignmentStatuses[dateStr]) assignmentStatuses[dateStr] = {};
  assignmentStatuses[dateStr][posId] = { status: 'proposed', proposedBy: CURRENT_USER_ID, crewName };
  // E-Mail wird via Pocketbase-Hook automatisch gesendet (siehe .pb_hooks/main.pb.js)
}

// ── Slot bestätigen (Crew-Mitglied) ───────────────────────────────────────────
async function confirmAssignment(dateStr, posId) {
  if (!SUPABASE_ENABLED) return;
  const planId = await _getActivePlanId();
  if (!planId) return;

  try {
    const existing = await pbFirst('assignments',
      `plan_id = "${planId}" && date = "${dateStr}" && pos_id = "${posId}"`);
    if (existing) {
      await pbPatch('/api/collections/assignments/records/' + existing.id, {
        status: 'confirmed', responded_at: new Date().toISOString()
      });
    }
    if (assignmentStatuses[dateStr]?.[posId]) {
      assignmentStatuses[dateStr][posId].status = 'confirmed';
    }
  } catch (e) {
    console.warn('confirmAssignment Fehler:', e.message);
  }
}

// ── Slot ablehnen (Crew-Mitglied → E-Mail an Admin via Hook) ──────────────────
async function declineAssignment(dateStr, posId) {
  if (!SUPABASE_ENABLED) return;
  const planId = await _getActivePlanId();
  if (!planId) return;

  const si = assignmentStatuses[dateStr]?.[posId];

  try {
    const existing = await pbFirst('assignments',
      `plan_id = "${planId}" && date = "${dateStr}" && pos_id = "${posId}"`);
    if (existing) {
      await pbPatch('/api/collections/assignments/records/' + existing.id, {
        status: 'declined', responded_at: new Date().toISOString()
      });
    }
    if (si) si.status = 'declined';
    // E-Mail an Admin wird via Pocketbase-Hook automatisch gesendet
  } catch (e) {
    console.warn('declineAssignment Fehler:', e.message);
  }
}

// ── Anfrage zurückziehen (Admin) ──────────────────────────────────────────────
async function cancelProposal(dateStr, posId) {
  if (!SUPABASE_ENABLED) return;
  const planId = await _getActivePlanId();
  if (!planId) return;

  const existing = await pbFirst('assignments',
    `plan_id = "${planId}" && date = "${dateStr}" && pos_id = "${posId}"`);
  if (existing) {
    await pbDelete('/api/collections/assignments/records/' + existing.id);
  }
}

// ── Alle Anfragen einer Position zurückziehen (Admin) ─────────────────────────
async function bulkCancelProposals(posId) {
  if (!SUPABASE_ENABLED) return;
  const planId = await _getActivePlanId();
  if (!planId) return;

  const data = await pbList('assignments',
    `plan_id = "${planId}" && pos_id = "${posId}" && (status = "proposed" || status = "declined")`);
  await Promise.all((data?.items || []).map(row =>
    pbDelete('/api/collections/assignments/records/' + row.id)
  ));
}

// ── Crew für mehrere Slots auf einmal vorschlagen ─────────────────────────────
async function bulkProposeCrew(slots) {
  if (!SUPABASE_ENABLED || !slots.length) return;
  const planId = await _getActivePlanId();
  if (!planId) return;

  await Promise.all(slots.map(s => {
    const pos = typeof POSITIONS !== 'undefined' ? POSITIONS.find(p => p.id === s.posId) : null;
    return pbUpsert(
      'assignments',
      `plan_id = "${planId}" && date = "${s.date}" && pos_id = "${s.posId}"`,
      {
        plan_id: planId, date: s.date, pos_id: s.posId, pos_label: pos?.label || s.posId,
        crew_name: s.crewName, status: 'proposed', proposed_by: CURRENT_USER_ID
      },
      { crew_name: s.crewName, pos_label: pos?.label || s.posId, status: 'proposed', proposed_by: CURRENT_USER_ID }
    );
  }));

  slots.forEach(s => {
    if (!assignmentStatuses[s.date]) assignmentStatuses[s.date] = {};
    assignmentStatuses[s.date][s.posId] = {
      status: 'proposed', proposedBy: CURRENT_USER_ID, crewName: s.crewName
    };
  });
}

// ── Crew einladen / Erinnerung schicken (via Pocketbase API-Endpoint) ─────────
async function sendCrewInvite(crewName, crewEmail, type) {
  if (!SUPABASE_ENABLED || !crewEmail) return;
  const plans = typeof getPlansIndex === 'function' ? getPlansIndex() : [];
  const planName = plans.find(p => p.id === activePlanId)?.name || 'Tour Plan';
  const appUrl = window.location.origin + window.location.pathname;
  // Löst Hook in Pocketbase aus: POST /api/collections/crew_invites/records
  const planId = await _getActivePlanId();
  if (!planId) return;
  pbPost('/api/collections/crew_members/records', {}).catch(() => {}); // no-op placeholder
  // Direkter E-Mail-Aufruf via PHP-Endpoint (falls konfiguriert)
  if (typeof MAIL_ENDPOINT !== 'undefined' && MAIL_ENDPOINT) {
    fetch(MAIL_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, crewName, crewEmail, planName, adminEmail: ADMIN_EMAIL, appUrl })
    }).then(async r => {
      if (!r.ok) { const j = await r.json().catch(() => ({})); _showMailError(j.error || r.statusText); }
    }).catch(e => _showMailError(e.message));
  }
}

// ── Crew-Mitglied mit E-Mail verknüpfen (Admin) ───────────────────────────────
async function saveCrewLink(crewName, email) {
  if (!SUPABASE_ENABLED) return;
  const planId = await _getActivePlanId();
  if (!planId) return;

  try {
    await pbUpsert(
      'crew_members',
      `plan_id = "${planId}" && name = "${crewName.replace(/"/g, '\\"')}"`,
      { plan_id: planId, name: crewName, email, sort_order: crew.indexOf(crewName) },
      { email }
    );
    if (!crewMeta[crewName]) crewMeta[crewName] = {};
    crewMeta[crewName].email = email;
  } catch (e) {
    console.warn('saveCrewLink Fehler:', e.message);
  }
}
```

### Schritt 6.2: Testen

- [ ] Lokalen Server starten: `python3 -m http.server 8080`
- [ ] Einloggen als Admin (`madmaxmail@web.de`)
- [ ] Konsole: `await loadCrewMeta()` → kein Fehler ✓
- [ ] Konsole: `await loadAssignmentStatuses()` → kein Fehler ✓
- [ ] Einem Slot eine Crew zuweisen → Dropdown öffnet sich, Crew wählen → kein Fehler in Konsole ✓
- [ ] Im Pocketbase Admin-UI unter **assignments** → neuer Eintrag sichtbar ✓
- [ ] Slot-Farbe wechselt zu gelb (proposed) ✓

- [ ] Commit:
```bash
git add js/dataService.js
git commit -m "feat: replace Supabase data service with Pocketbase REST API"
```

---

## Task 7: E-Mail-Hooks `.pb_hooks/main.pb.js`

**Files:**
- Create: `.pb_hooks/main.pb.js`

Pocketbase führt JS-Hooks serverseitig aus (via Goja-Engine). Der Hook sendet E-Mails über den in Pocketbase konfigurierten SMTP-Server — kein externer Dienst (kein Resend) nötig.

### Schritt 7.1: Hook-Datei anlegen

- [ ] Verzeichnis und Datei erstellen:

```bash
mkdir -p .pb_hooks
```

- [ ] **`.pb_hooks/main.pb.js`** mit folgendem Inhalt anlegen:

```javascript
// ── Pocketbase JS Hooks — E-Mail-Benachrichtigungen ───────────────────────────
// Wird serverseitig in Pocketbase ausgeführt (Goja-Engine).
// Dokumentation: https://pocketbase.io/docs/js-overview/

// Helper: Datum von "2026-07-01" zu "01.07.2026" formatieren
function fmtDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return parts[2] + '.' + parts[1] + '.' + parts[0];
}

// Helper: E-Mail senden
function sendMail(to, subject, html) {
  try {
    const mail = $app.newMailClient();
    mail.send({
      from: { address: $app.settings().meta.senderAddress, name: 'Tour Crew Plan' },
      to: [{ address: to }],
      subject: subject,
      html: html
    });
  } catch (e) {
    console.error('Mail-Fehler:', e.message || String(e));
  }
}

// HTML-Template für Einsatz-Anfrage
function buildProposedHtml(crewName, planName, posLabel, dateStr) {
  const loginUrl = $app.settings().meta.appUrl || 'https://m4dm0nky.github.io/Personalplan/';
  return `<div style="font-family:monospace;background:#1a1a2e;color:#c8cdd5;padding:24px;border-radius:8px;max-width:480px;">
    <h2 style="color:#e8c84a;margin:0 0 16px;">Tour/Crew &middot; Einsatz-Anfrage</h2>
    <p>Hallo <strong style="color:#fff;">${crewName}</strong>,</p>
    <p style="margin:12px 0;">du wurdest f&uuml;r folgenden Einsatz vorgeschlagen:</p>
    <table style="border-collapse:collapse;width:100%;margin:16px 0;">
      <tr><td style="color:#5a6070;padding:4px 0;width:120px;">Plan</td><td style="color:#fff;">${planName}</td></tr>
      <tr><td style="color:#5a6070;padding:4px 0;">Position</td><td style="color:#fff;">${posLabel}</td></tr>
      <tr><td style="color:#5a6070;padding:4px 0;">Datum</td><td style="color:#e8c84a;font-weight:600;">${fmtDate(dateStr)}</td></tr>
    </table>
    <p>Bitte melde dich in der App um zu best&auml;tigen oder abzulehnen.</p>
    <div style="margin:20px 0;"><a href="${loginUrl}" style="background:#e8c84a;color:#1a1a2e;padding:10px 20px;border-radius:4px;text-decoration:none;font-weight:700;">Zum Tourplan &rarr;</a></div>
    <p style="font-size:11px;color:#5a6070;">Diese E-Mail wurde automatisch vom Tour Crew Plan versandt.</p>
  </div>`;
}

// HTML-Template für Ablehnung (geht an Admin)
function buildDeclinedHtml(crewName, planName, posLabel, dateStr) {
  return `<div style="font-family:monospace;background:#1a1a2e;color:#c8cdd5;padding:24px;border-radius:8px;max-width:480px;">
    <h2 style="color:#e84a4a;margin:0 0 16px;">Tour/Crew &middot; Einsatz abgelehnt</h2>
    <p><strong style="color:#fff;">${crewName}</strong> hat den Einsatz abgelehnt:</p>
    <table style="border-collapse:collapse;width:100%;margin:16px 0;">
      <tr><td style="color:#5a6070;padding:4px 0;width:120px;">Plan</td><td style="color:#fff;">${planName}</td></tr>
      <tr><td style="color:#5a6070;padding:4px 0;">Position</td><td style="color:#fff;">${posLabel}</td></tr>
      <tr><td style="color:#5a6070;padding:4px 0;">Datum</td><td style="color:#e84a4a;font-weight:600;">${fmtDate(dateStr)}</td></tr>
    </table>
    <p>Bitte &ouml;ffne den Plan und besetze die Position neu.</p>
  </div>`;
}

// ── Hook: Nach jedem assignments-Create ───────────────────────────────────────
onRecordAfterCreateSuccess((e) => {
  const rec = e.record;
  const status = rec.getString('status');
  if (status !== 'proposed') return;

  const planId   = rec.getString('plan_id');
  const crewName = rec.getString('crew_name');
  const dateStr  = rec.getString('date');
  const posLabel = rec.getString('pos_label') || rec.getString('pos_id');

  // Crew-E-Mail aus crew_members laden
  let crewEmail = '';
  try {
    const members = $app.findRecordsByFilter(
      'crew_members',
      `plan_id = "${planId}" && name = "${crewName}"`,
      '-created', 1, 0
    );
    if (members.length > 0) crewEmail = members[0].getString('email');
  } catch (e) {
    console.warn('crew_members lookup Fehler:', e.message);
  }
  if (!crewEmail) return;

  // Plan-Name laden
  let planName = 'Tour Plan';
  try {
    const plan = $app.findRecordById('plans', planId);
    planName = plan.getString('name');
  } catch (e) {}

  sendMail(
    crewEmail,
    `Einsatz-Anfrage: ${posLabel} am ${fmtDate(dateStr)}`,
    buildProposedHtml(crewName, planName, posLabel, dateStr)
  );
}, 'assignments');

// ── Hook: Nach jedem assignments-Update ───────────────────────────────────────
onRecordAfterUpdateSuccess((e) => {
  const rec        = e.record;
  const status     = rec.getString('status');
  const planId     = rec.getString('plan_id');
  const crewName   = rec.getString('crew_name');
  const dateStr    = rec.getString('date');
  const posLabel   = rec.getString('pos_label') || rec.getString('pos_id');

  if (status === 'declined') {
    // E-Mail an Admin
    let planName = 'Tour Plan';
    let adminEmail = '';
    try {
      const plan = $app.findRecordById('plans', planId);
      planName = plan.getString('name');
      const owner = $app.findRecordById('users', plan.getString('owner'));
      adminEmail = owner.getString('email');
    } catch (e) {}

    if (!adminEmail) return;
    sendMail(
      adminEmail,
      `Abgelehnt: ${crewName} – ${posLabel} am ${fmtDate(dateStr)}`,
      buildDeclinedHtml(crewName, planName, posLabel, dateStr)
    );
  }
}, 'assignments');
```

### Schritt 7.2: Hook auf den Server deployen

- [ ] Datei auf den Server kopieren (in dasselbe Verzeichnis wie die `pocketbase` Binary):

```bash
scp .pb_hooks/main.pb.js user@deinserver:/opt/pocketbase/.pb_hooks/
# Pocketbase neu starten damit Hook geladen wird:
systemctl restart pocketbase
```

- [ ] Server-Logs prüfen:
```bash
journalctl -u pocketbase -f
```
Erwartung: keine Fehler beim Start ✓

### Schritt 7.3: Testen

- [ ] Crew-Mitglied in der App mit `emailanmadmax@gmail.com` verknüpfen
- [ ] Diesem Crew-Mitglied einen Slot zuweisen
- [ ] Erwartung: E-Mail kommt an `emailanmadmax@gmail.com` an ✓
- [ ] Pocketbase-Logs prüfen: kein "Mail-Fehler" ✓

- [ ] Commit:
```bash
git add .pb_hooks/main.pb.js
git commit -m "feat: add Pocketbase JS hooks for email notifications"
```

---

## Task 8: Aufräumen + finaler Test

**Files:**
- Modify: `index.html` (Version-Strings, letzter Check)
- Remove: `supabase/` Verzeichnis (optional, kann archiviert werden)

### Schritt 8.1: index.html finalisieren

- [ ] Sicherstellen dass alle `?v=22` → `?v=23` in `index.html` geändert sind
- [ ] Kein `supabase` mehr in index.html vorhanden:
```bash
grep -n "supabase" index.html
```
Erwartung: keine Treffer ✓

### Schritt 8.2: Supabase-Abhängigkeiten prüfen

- [ ] Prüfen ob noch Supabase-Referenzen existieren:
```bash
grep -rn "supabase\|SUPABASE_URL\|SUPABASE_ANON_KEY\|getSupabase\|_sbClient\|_sbToken" js/ login.html index.html
```
Erwartung: Nur Kommentare oder `SUPABASE_ENABLED` (das Feature-Flag bleibt) ✓

### Schritt 8.3: Kompletter End-to-End-Test

- [ ] `http://localhost:8080/login.html` → einloggen
- [ ] Tagesart-Dropdown → eigene Eingabe → `showPrompt` öffnet sich ✓
- [ ] Zeile löschen → `showConfirm` (roter Streifen) ✓
- [ ] Crew zuweisen → kein JS-Fehler, Pocketbase-Eintrag angelegt ✓
- [ ] Anfrage zurückziehen → kein JS-Fehler, Pocketbase-Eintrag gelöscht ✓
- [ ] E-Mail an `emailanmadmax@gmail.com` kommt an ✓
- [ ] Logout → `login.html` ✓
- [ ] Direktlink `index.html` ohne Login → Redirect zu `login.html` ✓
- [ ] PDF-Export funktioniert ✓
- [ ] Plan wechseln funktioniert ✓

### Schritt 8.4: Deployen

- [ ] Commit + Push:
```bash
git add -A
git commit -m "chore: finalize Pocketbase migration, remove Supabase remnants"
git push origin main
```
Erwartung: GitHub Pages aktualisiert sich automatisch ✓

- [ ] `https://m4dm0nky.github.io/Personalplan/` im Browser testen (Live-URL)

---

## Zusammenfassung der Änderungen

| Datei | Was ändert sich |
|---|---|
| `js/pb.js` (NEU) | fetch-Wrapper, pbList/pbFirst/pbUpsert |
| `js/config.js` | Supabase → `POCKETBASE_URL` |
| `js/authService.js` | Supabase-Session → localStorage `pb_token` |
| `js/dataService.js` | Alle Supabase-Calls → pbGet/pbPost/pbPatch/pbDelete |
| `login.html` | Supabase-SDK → direktes fetch auf Pocketbase |
| `index.html` | Supabase-CDN entfernt, `pb.js` eingefügt |
| `.pb_hooks/main.pb.js` (NEU) | E-Mail-Hooks via Pocketbase SMTP |

**Was bleibt:** render.js, state.js, dropdown.js, bundle.js, alle anderen JS-Dateien — unverändert.
