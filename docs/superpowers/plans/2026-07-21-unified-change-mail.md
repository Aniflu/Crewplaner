# Vereinheitlichte Änderungs-Mail + Aktivitäts-Log — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein „↻ Updates"-Button bündelt neue UND entfernte Termine in EINER dynamischen Änderungs-Mail (mit „GESEHEN ✓"-Quittung für Absagen); alle Crew-Reaktionen landen in einem Aktivitäts-Log mit Admin-Login-Popup.

**Architektur:** Soft-Cancel statt Löschen (`assignments.status: cancelled → cancel_acked`), Queue-Einträge mit `kind:'new'|'removed'`, Hook v4.10 rendert die zweiteilige Mail, Client schreibt `activity_log`-Records (neue Collection). Spec: `docs/superpowers/specs/2026-07-21-unified-change-mail-design.md`.

**Tech Stack:** Vanilla JS (ES6-Module), PocketBase REST, Goja-Hook, Node-Tests (`tests/run.mjs`), Headless-Chrome-Verifikation.

**Projektregeln:** Deutsch, `e.next()` im Hook, Goja-Isolation, alle PB-Felder als TEXT, Version am Ende beim User erfragen.

---

### Task 1: dataService — softCancelAssignment, ackCancelledAssignments, logActivity

**Files:**
- Modify: `js/dataService.js` (nach `promotePencilledToProposed`, ~Zeile 447)
- Test: `tests/dataservice.test.mjs`

- [ ] **Step 1: Failing Tests schreiben** — in `tests/dataservice.test.mjs` anhängen (Muster der bestehenden fetch-gemockten Tests dort übernehmen; `g.dataService` + `g.state`, fetch-Mock zeichnet Aufrufe auf):

```js
test('softCancelAssignment: patcht status=cancelled statt zu löschen, liefert Record', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  resetState(g); g.state.setAuthState('u1','admin@test.de','superadmin');
  localStorage.setItem('tourplan_active_pb_id','plan1');
  const calls = [];
  globalThis.fetch = async (url, opts={}) => {
    calls.push({ url:String(url), method: opts.method||'GET' });
    if (String(url).includes('/records?')) return { ok:true, json: async()=>({ items:[{ id:'rec1', status:'confirmed', crew_name:'Pascal' }] }) };
    return { ok:true, json: async()=>({ id:'rec1', status:'cancelled' }) };
  };
  const rec = await g.dataService.softCancelAssignment('2026-08-01','gl');
  ok(rec && rec.id==='rec1', 'liefert den Record');
  ok(calls.some(c=>c.method==='PATCH'), 'PATCH statt DELETE');
  ok(!calls.some(c=>c.method==='DELETE'), 'kein DELETE');
});

test('ackCancelledAssignments: quittiert NUR Records mit status=cancelled', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  resetState(g); g.state.setAuthState('u1','pascal@test.de','crew');
  const patched = [];
  globalThis.fetch = async (url, opts={}) => {
    const u = String(url);
    if ((opts.method||'GET')==='GET' && u.includes('/rec_c')) return { ok:true, json: async()=>({ id:'rec_c', status:'cancelled', crew_email:'pascal@test.de', date:'2026-08-01', pos_label:'GL', crew_name:'Pascal', plan_id:'plan1' }) };
    if ((opts.method||'GET')==='GET' && u.includes('/rec_p')) return { ok:true, json: async()=>({ id:'rec_p', status:'proposed', crew_email:'pascal@test.de' }) };
    if ((opts.method||'GET')==='PATCH') { patched.push(u); return { ok:true, json: async()=>({}) }; }
    return { ok:true, json: async()=>({}) };  // activity_log-POST u.a.
  };
  const n = await g.dataService.ackCancelledAssignments(['rec_c','rec_p']);
  eq(n, 1, 'nur der cancelled-Record wird quittiert');
  ok(patched.length===1 && patched[0].includes('rec_c'), 'PATCH nur auf rec_c');
});
```

- [ ] **Step 2: `node tests/run.mjs` → beide Tests FAILEN** (softCancelAssignment is not a function)

- [ ] **Step 3: Implementierung** — in `js/dataService.js` nach `promotePencilledToProposed` einfügen:

```js
// ── Soft-Cancel: Zuweisung entfernen, Record BEHALTEN (v0.30.0) ────────────────
// Statt zu löschen wird status='cancelled' gesetzt — nur so hat der „GESEHEN ✓"-
// Button in der Änderungs-Mail ein Ziel (aid). Liefert den gepatchten Record
// (für die Queue) oder null, wenn keiner existiert.
export async function softCancelAssignment(dateStr, posId) {
  if (!SUPABASE_ENABLED) return null;
  const planId = await _getActivePlanId();
  if (!planId) return null;
  const existing = await pbFirst('assignments',
    `plan_id = "${pbEscapeFilter(planId)}" && date = "${pbEscapeFilter(dateStr)}" && pos_id = "${pbEscapeFilter(posId)}"`);
  if (!existing) return null;
  await pbPatch('/api/collections/assignments/records/' + existing.id, {
    status: 'cancelled', responded_at: new Date().toISOString()
  });
  clearStatus(dateStr, posId);   // Zelle sofort „leer" (Cache), Record bleibt in PB
  return existing;
}

// ── Absage-Quittung („ÄNDERUNGEN GESEHEN ✓" aus der Mail) ─────────────────────
// Patcht NUR Records, die noch status='cancelled' haben (Guard: der Slot kann
// inzwischen neu besetzt sein — pbUpsert überschreibt cancelled-Records) und die
// der eingeloggten Crew gehören. Liefert die Anzahl quittierter Termine.
export async function ackCancelledAssignments(aids) {
  if (!SUPABASE_ENABLED || !aids?.length) return 0;
  const myEmail = (CURRENT_USER_EMAIL || '').toLowerCase();
  let n = 0;
  for (const aid of aids) {
    try {
      const rec = await pbGet('/api/collections/assignments/records/' + aid);
      if (!rec || rec.status !== 'cancelled') continue;
      if ((rec.crew_email || '').toLowerCase() !== myEmail) continue;
      await pbPatch('/api/collections/assignments/records/' + aid, {
        status: 'cancel_acked', responded_at: new Date().toISOString()
      });
      logActivity('cancel_acked', { planId: rec.plan_id, crewName: rec.crew_name,
        crewEmail: rec.crew_email, date: rec.date, posLabel: rec.pos_label });
      n++;
    } catch (e) { console.warn('ackCancelledAssignments:', e.message); }
  }
  return n;
}

// ── Aktivitäts-Log (fire-and-forget — darf NIE den Hauptflow brechen) ─────────
// action: 'confirmed' | 'declined' | 'cancel_acked'. ts client-seitig (die
// Collections haben KEIN created-Feld, siehe sort=-id-Gotcha).
export function logActivity(action, { planId, crewName, crewEmail, date, posLabel }) {
  if (!SUPABASE_ENABLED) return;
  pbPost('/api/collections/activity_log/records', {
    plan_id: planId || '', crew_name: crewName || '', crew_email: crewEmail || '',
    action, date: date || '', pos_label: posLabel || '',
    ts: new Date().toISOString()
  }).catch(e => console.warn('logActivity:', e.message));
}
```

- [ ] **Step 4: `node tests/run.mjs` → PASS**

- [ ] **Step 5: Commit** — `git add js/dataService.js tests/dataservice.test.mjs && git commit -m "feat: softCancel/ack/logActivity im dataService (Soft-Cancel statt Löschen)"`

---

### Task 2: cancelled/cancel_acked aus allen Status-Ladepfaden filtern

**Files:**
- Modify: `js/dataService.js:250-251` (loadAssignmentStatuses-Filter)
- Modify: `js/view-app.js` (öffentliche Ansicht, gleicher Filter)

- [ ] **Step 1:** In `loadAssignmentStatuses` (dataService.js) den Filter erweitern:

```js
    const data = await pbListAll('assignments',
      `plan_id = "${pbEscapeFilter(planId)}" && status != "assigned" && status != "cancelled" && status != "cancel_acked"`);
```

- [ ] **Step 2:** In `js/view-app.js` denselben Filter im `pbListAll('assignments', ...)`-Aufruf setzen (aktuell `plan_id="${plan.id}" && status!="assigned"`):

```js
      const aData = await pbListAll('assignments',
        `plan_id="${plan.id}" && status!="assigned" && status!="cancelled" && status!="cancel_acked"`, '-id');
```

- [ ] **Step 3:** `node tests/run.mjs` → 105+ grün (kein Test bricht)

- [ ] **Step 4: Commit** — `git commit -am "feat: cancelled/cancel_acked-Records aus Zellen-Rendering gefiltert"`

---

### Task 3: Queue — kind:'removed'-Einträge + Self-Heal-Fix + Modal-Anzeige

**Files:**
- Modify: `js/userView.js` (Queue-Funktionen ~Zeile 345-548)
- Test: `tests/queue.test.mjs`

- [ ] **Step 1: Failing Test** — in `tests/queue.test.mjs` (Muster der bestehenden Tests dort):

```js
test('removed-Slots überleben den Self-Heal (getVal ist für sie leer)', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  resetState(g); g.state.setAuthState('u1','a@test.de','superadmin');
  g.state.POSITIONS.push({ id:'gl', label:'GL' });
  g.state.TOUR_DATES.push({ date:'2026-08-01', type:'show', typeLabel:'Show' });
  localStorage.setItem('tourplan_active_pb_id','plan1');
  g.userView._queueRemovedSlot('Pascal','pascal@test.de','2026-08-01','gl','GL','rec1');
  g.userView._updateCrewUpdateBar();   // Self-Heal läuft hier
  const q = JSON.parse(localStorage.getItem('crewplan_updates_plan1') || '{}');
  ok(q['Pascal'], 'Eintrag existiert nach Self-Heal noch');
  eq(q['Pascal'].slots[0].kind, 'removed', 'kind=removed gespeichert');
  eq(q['Pascal'].slots[0].aid, 'rec1', 'aid für GESEHEN-Button gespeichert');
});
```

(Queue-Key prüfen: `_queuePlanKey()` in userView.js nachlesen — der Test muss denselben Key verwenden wie die Implementierung.)

- [ ] **Step 2: `node tests/run.mjs` → FAIL** (_queueRemovedSlot is not a function)

- [ ] **Step 3: Implementierung in `js/userView.js`:**

(a) Neue Export-Funktion nach `_queueGlobalCrewUpdate`:

```js
// Entfernten (vorher bestätigten/angefragten) Slot in die Updates-Queue legen
// (v0.30.0 — ersetzt das frühere Absage-Banner). aid = PB-Record-ID des
// soft-gecancelten assignments-Records (Ziel des „GESEHEN ✓"-Mail-Buttons).
export function _queueRemovedSlot(crewName, email, dateStr, posId, posLabel, aid) {
  if (!email) return;   // ohne Mail-Adresse nichts sendbar (wie bei Updates)
  const q = _getCrewUpdateQueue();
  if (!q[crewName]) q[crewName] = { email, slots: [] };
  const exists = q[crewName].slots.some(s => s.kind === 'removed' && s.date === dateStr && s.posId === posId);
  if (!exists) q[crewName].slots.push({ kind: 'removed', date: dateStr, posId, posLabel, aid, changes: ['Termin entfernt'] });
  _saveCrewUpdateQueue(q);
  _updateCrewUpdateBar();
}
```

(b) Self-Heal in `_updateCrewUpdateBar` (der Filter-Callback, ~Zeile 453): **vor** der informational-Prüfung:

```js
    const slots = orig.filter(s => {
      if (!valid.has(s.date)) return false;
      // removed-Slots sind per Definition nicht mehr in getVal → NICHT wegheilen.
      if (s.kind === 'removed') return true;
      if (entry.informational && s.posId) return getVal(s.date, s.posId) === name;
      return true;
    });
```

(c) `_mergeLiveNewSlots` (~Zeile 378): beim Push `kind: 'new'` ergänzen:

```js
        q[name].slots.push({ kind: 'new', date: s.date, posId: s.posId, posLabel: s.posLabel, changes: ['Neuer Termin'] });
```

(d) Modal-Anzeige in `_openUpdateQueueModal` (Slot-Zeile ~Zeile 532): Kennzeichnung vor dem Datum:

```js
        slots.forEach(slot => {
          const slotKey = `${slot.date}|${slot.posLabel}`;
          const isChecked = slot.selected !== false;
          const kindTag = slot.kind === 'removed'
            ? `<span style="color:var(--warn);font-weight:600;">➖ entfernt</span> · `
            : `<span style="color:var(--show);">➕ neu</span> · `;
          html += `<div style="display:flex;align-items:center;gap:8px;padding:2px 0 2px 14px;border-bottom:1px solid #2a2a3a;font-size:.64rem;color:#ccc;">
            <input type="checkbox" data-crew="${esc(name)}" data-key="${esc(slotKey)}" ${isChecked ? 'checked' : ''}
              onchange="_toggleSlotSelection(this)"
              style="width:14px;height:14px;accent-color:#4ae8a0;flex-shrink:0;cursor:pointer;">
            <span style="flex:1;">${kindTag}${esc(slot.date)} · ${esc(slot.posLabel||'')}</span>
            <span class="q-del" data-crew="${esc(name)}" data-key="${esc(slotKey)}" onclick="_deleteSlotFromQueue(this)" style="cursor:pointer;color:#e84a4a;margin-left:8px;font-size:.7rem;">✕</span>
          </div>`;
        });
```

- [ ] **Step 4: `node tests/run.mjs` → PASS**

- [ ] **Step 5: Commit** — `git commit -am "feat: Updates-Queue kennt entfernte Termine (kind:'removed', Self-Heal-sicher)"`

---

### Task 4: dropdown.js — Entfernen-Pfade auf Soft-Cancel + Queue umstellen

**Files:**
- Modify: `js/dropdown.js` (Imports + `_notifyIfWasActive` + die 4 Pfade)

- [ ] **Step 1: Imports ändern** — `_storePendingCancellation`-Import **entfernen**, stattdessen:

```js
import { _queueCrewUpdate, _queueRemovedSlot } from './userView.js';
```

und in der dataService-Importzeile `softCancelAssignment` ergänzen:

```js
import { cancelProposal, bulkCancelProposals, bulkProposeCrew as proposeCrew, loadAssignmentStatuses, confirmAssignment, pencilInAssignment, promotePencilledToProposed, softCancelAssignment } from './dataService.js';
```

- [ ] **Step 2: `_notifyIfWasActive` durch async `_removeAssignment` ersetzen** (in `openCrewDD`, ersetzt den v0.29.2-Helfer):

```js
  // Zuweisung entfernen (v0.30.0): War die Person bestätigt/angefragt (also schon
  // benachrichtigt) → Soft-Cancel (Record bleibt für die „GESEHEN ✓"-Quittung) +
  // Eintrag in die Updates-Queue („➖ entfernt"). Sonst (pencilled/declined/ohne
  // Record) → hartes Löschen wie bisher, keine Benachrichtigung nötig.
  const _removeAssignment = async () => {
    const wasActive = si && (si.status === 'confirmed' || si.status === 'proposed');
    if (wasActive) {
      const rec = await softCancelAssignment(dateStr, posId);
      const _email = crewMeta?.[si.crewName]?.email || rec?.crew_email || '';
      const _lbl = (POSITIONS || []).find(p => p.id === posId)?.label || posId;
      if (rec && si.crewName) _queueRemovedSlot(si.crewName, _email, dateStr, posId, _lbl, rec.id);
    } else if (si) {
      await cancelProposal(dateStr, posId);
    }
    if (assignmentStatuses[dateStr]) delete assignmentStatuses[dateStr][posId];
  };
```

- [ ] **Step 3: Die 4 Pfade umstellen** — überall wo bisher `await cancelProposal(dateStr,posId); _notifyIfWasActive(); if(assignmentStatuses...)delete...` steht, durch `await _removeAssignment();` ersetzen:
  - „✕ Anfrage zurückziehen" (isPending-Zweig)
  - „✕ Besetzung aufheben"
  - `_applyState` (der `if(si){...}`-Block wird zu `if(si){ try{ await _removeAssignment(); }catch(e){ console.warn('remove:',e); } }`)
  - „↩ Standard: X" (analog `_applyState`)
  Die Toasts der beiden benannten Buttons bleiben unverändert.

- [ ] **Step 4: `node tests/run.mjs` → grün** (Import-Guard prüft die neuen Imports)

- [ ] **Step 5: Commit** — `git commit -am "feat: Entfernen-Pfade nutzen Soft-Cancel + Updates-Queue statt Absage-Banner"`

---

### Task 5: Absage-Banner entfernen

**Files:**
- Modify: `index.html` (Banner-Markup `#cancellation-banner`, ~Zeile 435-440)
- Modify: `js/app.js:44,118-119` (Import + window-Registrierungen)
- Modify: `js/crewNotify.js` (`renderCancellationBanner`, `flushAllCancellations`, `clearAllCancellations` löschen)

- [ ] **Step 1:** `index.html`: den kompletten `<div id="cancellation-banner" ...>...</div>`-Block löschen.
- [ ] **Step 2:** `js/app.js`: Zeile 44 (`import { clearAllCancellations, flushAllCancellations } ...`) und die Registrierungen `window.clearAllCancellations` / `window.flushAllCancellations` löschen.
- [ ] **Step 3:** `js/crewNotify.js`: die drei Funktionen `renderCancellationBanner`, `flushAllCancellations`, `clearAllCancellations` löschen. `_loadCancellations`/`_storePendingCancellation`/`_clearPendingCancellations`/`sendCancellationSummary` BLEIBEN (werden vom Crew-Notify-Modal genutzt); in `_storePendingCancellation` und `_clearPendingCancellations` den Aufruf `renderCancellationBanner();` entfernen. Prüfen: `grep -rn "renderCancellationBanner" js/ index.html` → 0 Treffer.
- [ ] **Step 4:** `node tests/run.mjs` → grün (Reachability-Guard bestätigt: keine Orphans, keine toten onclicks)
- [ ] **Step 5: Commit** — `git commit -am "chore: Absage-Banner entfernt (ersetzt durch Updates-Queue)"`

---

### Task 6: Mail-Versand — removed-Slots mit kind/aid mitsenden

**Files:**
- Modify: `js/userView.js` `_sendUpdateForEntry` (~Zeile 790-820)

- [ ] **Step 1:** Funktion so umbauen, dass removed-Slots getrennt behandelt werden:

```js
async function _sendUpdateForEntry(name, entry, customText) {
  const removed = (entry.slots || []).filter(s => s.kind === 'removed');
  const normal  = (entry.slots || []).filter(s => s.kind !== 'removed');
  // removed-Slots gehen 1:1 in die Mail (Hook rendert den ➖-Abschnitt + GESEHEN-Button)
  const removedMail = removed.map(s => ({ date: s.date, posLabel: s.posLabel, kind: 'removed', aid: s.aid || '', changes: ['Termin entfernt'] }));

  if (entry.informational) {
    const allNew = _getNewSlotsForCrew(name, entry.email);
    const wanted = new Set(normal.map(s => s.date + '|' + (s.posId || '')));
    let newSlots = allNew.filter(s => wanted.has(s.date + '|' + s.posId));
    if (!newSlots.length && normal.length) newSlots = allNew;   // Fallback (Legacy ohne posId)
    if (newSlots.length) await bulkProposeCrew(newSlots);
    const mailSlots = newSlots.map(s => ({ date: s.date, posLabel: s.posLabel, kind: 'new', changes: ['Neuer Termin'] })).concat(removedMail);
    if (mailSlots.length) await sendUpdateNotice(name, entry.email, mailSlots, customText);
    return;
  }
  const newSlots = _getNewSlotsForCrew(name, entry.email);
  if (newSlots.length) await bulkProposeCrew(newSlots);
  const planId = localStorage.getItem('tourplan_active_pb_id');
  for (const slot of normal) {
    const day = assignmentStatuses[slot.date];
    const posId = day ? Object.keys(day).find(p => {
      const pos = POSITIONS.find(pp => pp.id === p);
      return (pos?.label || p) === slot.posLabel && day[p].crewName === name;
    }) : null;
    if (posId && planId) {
      const existing = await pbFirst('assignments',
        `plan_id = "${planId}" && date = "${slot.date}" && pos_id = "${posId}"`);
      if (existing) await pbPatch('/api/collections/assignments/records/'+existing.id,
        { status: 'proposed', proposed_by: 'update' });
    }
  }
  await sendUpdateNotice(name, entry.email, normal.concat(removedMail), customText);
}
```

- [ ] **Step 2:** `node tests/run.mjs` → grün
- [ ] **Step 3: Commit** — `git commit -am "feat: Änderungs-Mail transportiert entfernte Termine (kind/aid)"`

---

### Task 7: Mail-Quittung (action=ackcancel) + Aktivitäts-Log-Aufrufe

**Files:**
- Modify: `js/authService.js` `_handleEmailAction` (~Zeile 146-173)
- Modify: `js/dataService.js` (`confirmAssignment`/`declineAssignment` → logActivity bei IS_CREW)

- [ ] **Step 1:** `_handleEmailAction` erweitern (Guard + neuer Zweig; Import `ackCancelledAssignments, logActivity` aus dataService ergänzen):

```js
export async function _handleEmailAction() {
  const params = new URLSearchParams(window.location.search);
  const action = params.get('action');
  const aid    = params.get('aid');
  const aids   = params.get('aids');
  if (!action || (!aid && !aids) || !SUPABASE_ENABLED) return;
  history.replaceState({}, '', window.location.pathname);
  try {
    if (action === 'ackcancel') {
      const n = await ackCancelledAssignments((aids || '').split(',').filter(Boolean));
      showToast(n ? `${n} Änderung(en) als gesehen bestätigt ✓` : 'Nichts mehr zu bestätigen', n ? '#4ae8a0' : '#5a6070');
      await loadAssignmentStatuses();
      renderTable();
      return;
    }
    const record = await pbGet('/api/collections/assignments/records/' + aid);
    if (!record || (record.crew_email || '').toLowerCase() !== (CURRENT_USER_EMAIL || '').toLowerCase()) {
      showToast('Zugriff verweigert', '#e84a4a');
      return;
    }
    const payload = { responded_at: new Date().toISOString() };
    if (action === 'confirm') {
      payload.status = 'confirmed';
      await pbPatch('/api/collections/assignments/records/' + aid, payload);
      logActivity('confirmed', { planId: record.plan_id, crewName: record.crew_name, crewEmail: record.crew_email, date: record.date, posLabel: record.pos_label });
      showToast('Einsatz bestätigt ✓', '#4ae8a0');
    } else if (action === 'decline') {
      payload.status = 'declined';
      await pbPatch('/api/collections/assignments/records/' + aid, payload);
      logActivity('declined', { planId: record.plan_id, crewName: record.crew_name, crewEmail: record.crew_email, date: record.date, posLabel: record.pos_label });
      showToast('Einsatz abgelehnt', '#e84a4a');
    } else { return; }
    await loadAssignmentStatuses();
    renderTable();
  } catch(e) {
    showToast('Fehler: ' + e.message, '#e84a4a');
  }
}
```

- [ ] **Step 2:** In `confirmAssignment` (dataService, beide Erfolgspfade: PATCH-Zweig UND POST-Zweig) sowie `declineAssignment` (nach dem PATCH) je einen Log-Aufruf, aber NUR für Crew (Manager-Klicks sind keine Crew-Reaktion):

```js
      if (IS_CREW && !IS_MANAGER) logActivity('confirmed', { planId, crewName: existing.crew_name, crewEmail: existing.crew_email, date: dateStr, posLabel: existing.pos_label });
```

(analog `'declined'` in declineAssignment; im POST-Zweig von confirmAssignment `crewName`/`meta.email`/`pos?.label` verwenden.)

- [ ] **Step 3:** `node tests/run.mjs` → grün (Import-Guard!)
- [ ] **Step 4: Commit** — `git commit -am "feat: GESEHEN-Quittung per Mail-Link + Aktivitäts-Log bei Crew-Reaktionen"`

---

### Task 8: Hook v4.10 — zweiteilige Änderungs-Mail

**Files:**
- Modify: `.pb_hooks/main.pb.js` (Zeile 4 Versions-Log + update-Zweig Zeile 171-196)

- [ ] **Step 1:** Zeile 4: `console.log('[hook] main.pb.js v4.10 geladen');`

- [ ] **Step 2:** Den `type === 'update'`-Zweig ersetzen (Goja: nur `var`, alles inline, KEINE Template-Literale):

```js
  } else if (type === 'update') {
    var upSlots = [];
    try { upSlots = JSON.parse(appUrl || '[]'); } catch (_) {}
    // v4.10: Slots nach kind trennen — 'removed' = entfernte Termine (GESEHEN-Quittung),
    // alles andere (auch ohne kind, rückwärtskompatibel) = neue/geänderte Termine.
    var upNew = [], upRem = [], ackIds = [];
    for (var i = 0; i < upSlots.length; i++) {
      if (upSlots[i] && upSlots[i].kind === 'removed') {
        upRem.push(upSlots[i]);
        if (upSlots[i].aid) ackIds.push(upSlots[i].aid);
      } else { upNew.push(upSlots[i]); }
    }
    function upTable(rows, chgColor) {
      var out = '<table width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0 24px 0;border:1px solid #e8e8e8;border-radius:2px;">'+
        '<tr style="background:#f8f9fb;">'+
        '<td style="padding:10px 16px;font-size:9px;color:#999999;letter-spacing:2px;text-transform:uppercase;border-bottom:2px solid #e8e8e8;">DATUM</td>'+
        '<td style="padding:10px 16px;font-size:9px;color:#999999;letter-spacing:2px;text-transform:uppercase;border-bottom:2px solid #e8e8e8;">POSITION</td></tr>';
      for (var j = 0; j < rows.length; j++) {
        out += '<tr><td style="padding:10px 16px;font-size:13px;color:#1a1a2e;font-weight:bold;border-bottom:1px solid #e8e8e8;">'+fmtISO(rows[j].date)+'</td>'+
          '<td style="padding:10px 16px;font-size:13px;color:'+chgColor+';border-bottom:1px solid #e8e8e8;">'+esc(rows[j].posLabel||'')+'</td></tr>';
      }
      return out + '</table>';
    }
    var upBody = '<h1 style="font-size:36px;font-weight:bold;color:#1a1a2e;margin:0 0 6px 0;">Es gab &Auml;nderungen.</h1>'+
      '<p style="font-size:10px;color:#e8c84a;letter-spacing:3px;margin:0 0 28px 0;text-transform:uppercase;">PLAN GE&Auml;NDERT · '+ePlan+'</p>'+
      '<p style="font-size:13px;color:#555570;line-height:1.8;margin:0 0 4px 0;">Hallo '+eName+',<br><br>in der Tour <strong style="color:#1a1a2e;">'+ePlan+'</strong> haben sich folgende &Auml;nderungen ergeben:</p>'+
      noteBlock(customMsg);
    if (upNew.length) {
      upBody += '<p style="font-size:13px;color:#2d6a3f;font-weight:bold;margin:24px 0 0 0;">&#10133; Neue Termine &mdash; bitte best&auml;tige, dass du Zeit hast:</p>'+
        upTable(upNew, '#555570')+
        mkBtn('https://crewplanner.nyxlightwork.de', 'TERMINE BEST&Auml;TIGEN &rarr;');
    }
    if (upRem.length) {
      upBody += '<p style="font-size:13px;color:#e84a4a;font-weight:bold;margin:24px 0 0 0;">&#10134; Entfernte Termine &mdash; bitte best&auml;tige, dass du die &Auml;nderung gesehen hast:</p>'+
        upTable(upRem, '#e84a4a');
      if (ackIds.length) {
        upBody += mkBtn('https://crewplanner.nyxlightwork.de?action=ackcancel&aids='+ackIds.join(','), '&Auml;NDERUNGEN GESEHEN &#10003;', '#f8f9fb', '#555570');
      }
    }
    sendMail(email, 'ÄNDERUNG · ' + plan, wrap(upBody));
    console.log('[hook] update email sent to '+email+' ('+upNew.length+' neu, '+upRem.length+' entfernt)');
  } else if (type === 'love_invite') {
```

(Prüfen: `fmtISO`, `esc`, `mkBtn`, `noteBlock`, `wrap`, `sendMail` sind im selben Handler-Scope definiert — Goja-Isolation bleibt gewahrt, `function upTable` liegt INNERHALB des Callbacks.)

- [ ] **Step 3:** Syntax-Check: `node --check .pb_hooks/main.pb.js` → OK
- [ ] **Step 4: Commit** — `git commit -am "feat: Hook v4.10 — zweiteilige Änderungs-Mail (neu/entfernt + GESEHEN-Button)"`

---

### Task 9: activity_log-Collection anlegen + Doku

**Files:**
- PocketBase (Superuser-API — Credentials lt. Memory pb-admin-access, User hat der Anlage im Design zugestimmt)
- Modify: `docs/database-schema.md`, `CLAUDE.md` (Collections-Liste), `HANDOFF.md` (Collections-Block)

- [ ] **Step 1:** Collection per Superuser-API anlegen (alle Felder TEXT — Relation-Falle!):

```
POST /api/collections  (Authorization: Superuser-Token)
{ "name": "activity_log", "type": "base",
  "listRule": "@request.auth.id != \"\"", "viewRule": "@request.auth.id != \"\"",
  "createRule": "@request.auth.id != \"\"", "updateRule": null, "deleteRule": "@request.auth.role = \"superadmin\"",
  "fields": [
    {"name":"plan_id","type":"text"}, {"name":"crew_name","type":"text"},
    {"name":"crew_email","type":"text"}, {"name":"action","type":"text"},
    {"name":"date","type":"text"}, {"name":"pos_label","type":"text"},
    {"name":"ts","type":"text"} ] }
```

- [ ] **Step 2:** Verifizieren: als Superuser einen Test-Record POSTen + wieder DELETEn (200/204).
- [ ] **Step 3:** Doku: `docs/database-schema.md` neuen Abschnitt `activity_log` (Felder + Zweck + ⚠️ Redeploy-Reimport-Caveat), `CLAUDE.md` + `HANDOFF.md` Collections-Listen um `activity_log { plan_id, crew_name, crew_email, action, date, pos_label, ts }` ergänzen. Hinweis: `ts` client-gesetzt (ISO), Sortierung `-id`.
- [ ] **Step 4: Commit** — `git commit -am "docs: activity_log-Collection dokumentiert (live angelegt)"`

---

### Task 10: Admin-Konsole — Login-Popup + „Aktivität"-Tab

**Files:**
- Modify: `admin.html` (Nav ~Zeile 555-559, neue Section, Init-Aufruf, Popup-Modal)

- [ ] **Step 1:** Nav-Tab ergänzen (nach dem E-Mail-Log-Button, Zeile ~559):

```html
  <button class="nav-tab" data-tab="aktivitaet" onclick="switchTab('aktivitaet'); renderActivityLog()">Aktivität</button>
```

- [ ] **Step 2:** Neue Section (nach `tabWerkzeuge`-Schema, z.B. hinter dem E-Mail-Log-Bereich):

```html
  <!-- AKTIVITÄT -->
  <div class="section" id="tabAktivitaet">
    <div class="section-title">Aktivität</div>
    <div class="section-sub">Alle Crew-Reaktionen — zugesagt ✓ · abgelehnt ✗ · Absage gesehen 👁</div>
    <div id="activityList" style="font-family:var(--mono);font-size:.66rem;line-height:2;color:var(--ink-2);"></div>
  </div>
```

- [ ] **Step 3:** Popup-Modal (bei den anderen Modals, z.B. neben `cancelSelectModal`):

```html
<div class="modal-bg" id="activityPopupModal">
  <div class="modal-box" style="max-width:520px;">
    <div class="modal-title">Neue Crew-Reaktionen</div>
    <div id="activityPopupBody" style="font-family:var(--mono);font-size:.66rem;line-height:2;max-height:50vh;overflow-y:auto;color:var(--ink-2);"></div>
    <div class="mactions"><button class="mbtn primary" onclick="closeModal('activityPopupModal')">OK</button></div>
  </div>
</div>
```

- [ ] **Step 4:** JS (im großen Inline-Script von admin.html, bei den anderen Werkzeug-Funktionen):

```js
// ── Aktivitäts-Log (v0.30.0) ──────────────────────────────────────────────────
const ACTIVITY_SEEN_KEY = 'tourplan_activity_last_seen';
const ACTIVITY_LABEL = {
  confirmed:    { txt: 'hat zugesagt',            ic: '✓', col: 'var(--show)' },
  declined:     { txt: 'hat abgelehnt',           ic: '✗', col: 'var(--warn)' },
  cancel_acked: { txt: 'hat die Absage gesehen',  ic: '👁', col: 'var(--pencilled)' },
};
function _activityLine(r) {
  const l = ACTIVITY_LABEL[r.action] || { txt: r.action, ic: '·', col: 'var(--muted)' };
  const when = (r.ts || '').replace('T', ' ').substring(0, 16);
  return `<div><span style="color:var(--muted);">${esc(when)}</span> — <strong>${esc(r.crew_name)}</strong> ` +
    `<span style="color:${l.col};">${l.ic} ${esc(l.txt)}</span>` +
    (r.date ? ` · ${esc(_fmtDateDE(r.date))}${r.pos_label ? ' / ' + esc(r.pos_label) : ''}` : '') + `</div>`;
}
async function renderActivityLog() {
  const el = document.getElementById('activityList');
  try {
    const data = await pbGet('/api/collections/activity_log/records?perPage=200&sort=-id');
    const items = data?.items || [];
    el.innerHTML = items.length ? items.map(_activityLine).join('') :
      '<div style="color:var(--muted);">Noch keine Aktivität.</div>';
  } catch(e) { el.innerHTML = '<div style="color:var(--warn);">Fehler: ' + esc(e.message) + '</div>'; }
}
async function checkNewActivity() {
  try {
    const lastSeen = localStorage.getItem(ACTIVITY_SEEN_KEY) || '';
    const data = await pbGet('/api/collections/activity_log/records?perPage=50&sort=-id');
    const fresh = (data?.items || []).filter(r => (r.ts || '') > lastSeen);
    localStorage.setItem(ACTIVITY_SEEN_KEY, new Date().toISOString());
    if (!fresh.length) return;
    document.getElementById('activityPopupBody').innerHTML = fresh.map(_activityLine).join('');
    openModal('activityPopupModal');
  } catch(e) { console.warn('[aktivität]', e.message); }
}
```

- [ ] **Step 5:** In `_runAdminInit` (bzw. am Ende der Init-Kette, wo andere Loads laufen) `checkNewActivity();` aufrufen.
- [ ] **Step 6:** `node tests/run.mjs` → grün (Reachability: `renderActivityLog`/`checkNewActivity`/`cxlAddManual`-Muster — inline definierte Funktionen in admin.html sind für den Guard sichtbar).
- [ ] **Step 7: Commit** — `git commit -am "feat: Aktivitäts-Tab + Login-Popup mit neuen Crew-Reaktionen (admin)"`

---

### Task 11: Echt-Browser-Verifikation (Muster v0.29.2)

**Files:**
- Temporär: `_verify_unified.html` (danach löschen)

- [ ] **Step 1:** Harness bauen: echtes `state.js`+`dropdown.js` laden, bestätigten Slot setzen, fetch auf `window.__calls` mocken (PATCH/GET aufzeichnen, pbFirst-Antwort mit `{id:'rec1',status:'confirmed',...}`), Menü öffnen, „— Nicht besetzt" klicken. Erwartung in `document.title`: (a) PATCH mit `"status":"cancelled"` statt DELETE, (b) localStorage-Queue enthält `kind:'removed'`-Slot mit `aid:'rec1'`.
- [ ] **Step 2:** Headless-Chrome über lokalen `http.server` laufen lassen (Muster der v0.29.2-Verifikation, `<meta charset="UTF-8">` nicht vergessen!), Titel prüfen.
- [ ] **Step 3:** Harness löschen, `node tests/run.mjs` + `TZ=Europe/Berlin node tests/run.mjs` final grün.
- [ ] **Step 4: Commit** (falls Fixes nötig waren).

---

### Task 12: Version, Doku, Rollout

- [ ] **Step 1:** User nach Versionsnummer fragen (Vorschlag **v0.30.0** — Feature). NIEMALS selbst festlegen.
- [ ] **Step 2:** Version in `index.html` (tour-tag), `admin.html`, `login.html` (login-version), `CLAUDE.md` (Aktuelle Version + ausführlicher Changelog-Eintrag inkl. Hook v4.10 + activity_log + Banner-Entfall), `README.md` (nutzerfreundlicher Eintrag). Cache-Bust: `app.js?v=42→43` in index.html + Cache-Bust-Stand-Zeile in CLAUDE.md. CHANGELOG.md-Eintrag.
- [ ] **Step 3:** `node tests/run.mjs` final, `git add -A && git commit && git push origin main`.
- [ ] **Step 4:** Rollout-Hinweise an den User:
  - Hook v4.10 muss vom **Admin** deployt werden (curl + docker restart, Log: `[hook] main.pb.js v4.10 geladen`). Bis dahin kommt die Update-Mail im alten Format (ohne ➖-Abschnitt/GESEHEN-Button) — App-Seite funktioniert trotzdem.
  - End-to-End-Test: bestätigten Tag entfernen → „↻ Updates" → senden → Mail prüfen (beide Abschnitte) → GESEHEN klicken (Login als Crew) → als Admin einloggen → Popup zeigt die Quittung.

---

## Self-Review (erledigt)

- **Spec-Abdeckung:** Queue vereinheitlicht (T3/T4), Banner weg (T5), dynamische Mail (T6/T8), Soft-Cancel+Guard (T1/T2), Quittung (T7), Log+Popup+Tab (T1/T7/T9/T10), Rollout (T12). ✓
- **Platzhalter:** keine. Alle Code-Schritte enthalten vollständigen Code. ✓
- **Typ-Konsistenz:** `_queueRemovedSlot(crewName,email,dateStr,posId,posLabel,aid)` überall gleich; Mail-Slot-Format `{date,posLabel,kind,aid,changes}` in T6=T8; `ackCancelledAssignments(aids)→n` in T1=T7; `ts`-Feld T1=T9=T10. ✓
