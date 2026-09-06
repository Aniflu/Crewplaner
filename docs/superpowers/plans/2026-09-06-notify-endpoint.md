# /notify-Endpoint — Implementierungsplan

> **Für agentische Ausführung:** Dieser Plan wird Aufgabe für Aufgabe abgearbeitet, jede mit
> eigenem Testzyklus und Commit. Schritte sind als Checkboxen geführt.

**Ziel:** Alle sechs Mail-auslösenden Vorgänge laufen über einen authentifizierten
Hook-Endpoint, der Datensätze und Mail-Auslöser in einer Transaktion schreibt.

**Architektur:** Eine neue Route `POST /notify` in `.pb_hooks/main.pb.js` mit Typ-Tabelle
(Rechte + erlaubte Schreibvorgänge je Typ). Sie schreibt Slots und den `crew_invites`-Record
in `$app.runInTransaction`; der bestehende Mail-Hook feuert danach unverändert. Das Frontend
ruft an neun Stellen nur noch diese Route auf.

**Tech-Stack:** PocketBase v0.23-API (Goja-JS-Hooks), ES-Module im Browser, Node-Testrunner
ohne npm (`node tests/run.mjs`).

**Spec:** `docs/superpowers/specs/2026-09-06-notify-endpoint-design.md`

## Globale Randbedingungen

- **Der Hook muss vor dem Frontend live sein.** Route additiv deployen, verifizieren, erst
  dann das Frontend umstellen. (Im Hook steht die Warnung am `/myplans`-Umbau wörtlich.)
- **Goja-Isolation:** Alle Helfer und Literale *innerhalb* des Handlers definieren — Muster
  aller bestehenden Routen.
- **Ablehnung als 404**, nie 403 — wortgleich zu `/myplan` und `/planstatus`.
- **Antwort enthält niemals** Mailadressen oder Datensatz-IDs.
- **Nach jedem Fix:** Version hochziehen, Changelog in `README.md`, Nummer in `index.html`,
  `login.html`, `admin.html` (prüft `tests/version.test.mjs`), committen, pushen.
- **Zielversion dieses Umbaus:** v0.11.0 (neues Verhalten, nicht nur ein Fix).
- **Test-Instanz hat kein `RESEND_KEY`** → Mailversand wird übersprungen, Records werden
  geschrieben. Abnahme dort ist gefahrlos.

---

## Task 1: Route `/notify` im Hook (additiv)

**Dateien:**
- Ändern: `.pb_hooks/main.pb.js` (neue Route hinter `/planstatus`, vor `/viewplan`)
- Test: `tests/notify.test.mjs` (neu)

**Schnittstellen:**
- Produziert: `POST /notify` mit Body
  `{type, planId, crewName, crewEmail, slots?, removeSlots?, proposedBy?, customMessage?}`
  → `200 {ok:true, angelegt:N, aktualisiert:N, geloescht:N}` · `400` · `404`
- `slots[]`: `{date, posId, posLabel}` — was angefragt werden soll
- `removeSlots[]`: `{date, posId}` — was gelöscht werden soll (nur `cancellation`)
- `mailSlots` gibt es **nicht**: Der Server baut `app_url` selbst aus `slots`/`removeSlots`.

- [ ] **Schritt 1: Wächter-Tests schreiben** (`tests/notify.test.mjs`)

```js
// Hook-Code läuft in Goja, nicht in Node — die Suite kann ihn nicht ausführen. Diese Wächter
// belegen die STRUKTUR (Rechte vor Schreibzugriff, Transaktion, keine Datenlecks); dass der
// Endpoint WIRKT, zeigt erst die Abnahme auf der Test-Instanz (Task 2).
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { test, ok, eq } from './_assert.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const hook = readFileSync(join(root, '.pb_hooks/main.pb.js'), 'utf8');
const route = hook.split("routerAdd('POST', '/notify'")[1] || '';

test('die /notify-Route existiert und verlangt Anmeldung', () => {
  ok(route, "routerAdd('POST', '/notify' fehlt in main.pb.js");
  ok(/\$apis\.requireAuth\(\)/.test(route.slice(0, 9000)), 'Route ohne requireAuth');
});

test('alle sechs Mail-Typen sind in der Typ-Tabelle vertreten', () => {
  for (const t of ['invite','reminder','update','cancellation','availability','staff_invite'])
    ok(new RegExp("'" + t + "'").test(route.slice(0, 9000)), `Typ ${t} fehlt in der Tabelle`);
});

test('geschrieben wird nur in einer Transaktion', () => {
  ok(/runInTransaction/.test(route.slice(0, 9000)),
     'ohne Transaktion kann wieder ein halber Zustand entstehen');
});

test('die Rechteprüfung steht VOR dem Schreiben', () => {
  const teil = route.slice(0, 9000);
  const pruef = teil.search(/darf/);
  const schreib = teil.search(/runInTransaction/);
  ok(pruef > -1 && schreib > -1 && pruef < schreib,
     'die Berechtigung muss geprüft sein, bevor irgendetwas geschrieben wird');
});

test('die Antwort gibt weder Mailadresse noch Datensatz-ID heraus', () => {
  const antwort = (route.match(/JSON\.stringify\(\{[^}]*\}\)/g) || []).join(' ');
  ok(!/email/i.test(antwort), 'keine Mailadresse in der Antwort');
  ok(!/\bid\b/.test(antwort), 'keine Datensatz-ID in der Antwort');
});
```

- [ ] **Schritt 2: Tests laufen lassen — müssen fehlschlagen**

Ausführen: `node tests/run.mjs 2>&1 | grep -A2 "✗"`
Erwartet: alle fünf rot, „routerAdd('POST', '/notify' fehlt in main.pb.js".

- [ ] **Schritt 3: Route implementieren**

In `.pb_hooks/main.pb.js` **nach** dem Ende der `/planstatus/{id}`-Route einfügen:

```js
// ── 6d. Ein Endpoint für alle Mail-auslösenden Vorgänge (v4.23) ───────────────
// POST /notify (authentifiziert)
//
// Warum: Ein fachlicher Vorgang („diese Person für 25 Termine anfragen und einladen") war
// als 26 einzelne HTTP-Schreibvorgänge modelliert. PocketBase läuft mit `*:create` = 20 pro
// 5 Sekunden — ab dem 21. kam 429, die Einladung ging nicht raus. Vor allem aber konnte der
// Vorgang auf halber Strecke abbrechen: Slots angefragt, Mail nie verschickt.
//
// Hier ist es EIN Aufruf. Slots und Auslöse-Record entstehen in EINER Transaktion; der
// Mail-Hook hängt an onRecordAfterCreateSuccess und feuert erst nach dem Commit. Also:
// alle Termine und die Mail — oder nichts von beidem.
//
// Goja-Isolation: alle Helfer INNERHALB des Handlers.
routerAdd('POST', '/notify', function(e) {
  var auth = e.auth;
  if (!auth) return e.string(401, 'unauthorized');

  var body = {};
  try { body = e.requestInfo().body || {}; } catch (err) { body = {}; }

  var typ   = String(body.type || '');
  var planId = String(body.planId || '');
  var name  = String(body.crewName || '');
  var mail  = String(body.crewEmail || '');
  var slots = Array.isArray(body.slots) ? body.slots : [];
  var weg   = Array.isArray(body.removeSlots) ? body.removeSlots : [];
  var von   = String(body.proposedBy || 'bulk');
  var notiz = String(body.customMessage || '');

  // Typ-Tabelle: wer darf, und was darf geschrieben werden. Eine Tabelle statt verstreuter
  // if-Zweige — sie IST die Rechteprüfung, und man sieht auf einen Blick, was fehlt.
  var TABELLE = {
    invite:       { wer: 'owner', slots: true,  loeschen: false },
    reminder:     { wer: 'owner', slots: true,  loeschen: false },
    update:       { wer: 'owner', slots: true,  loeschen: false },
    cancellation: { wer: 'owner', slots: false, loeschen: true  },
    availability: { wer: 'crew',  slots: false, loeschen: false },
    staff_invite: { wer: 'super', slots: false, loeschen: false }
  };
  var regel = TABELLE[typ];
  if (!regel) return e.string(400, 'unbekannter Typ');
  if (!name || !mail) return e.string(400, 'crewName und crewEmail sind Pflicht');

  var meineMail = (auth.getString('email') || '').toLowerCase();
  var istSuper  = auth.getString('role') === 'superadmin';

  // staff_invite hat keine Tour — nur superadmin, entsprechend der geltenden createRule.
  if (regel.wer === 'super') {
    if (!istSuper) return e.string(404, 'not found');
  } else {
    if (!planId) return e.string(400, 'planId fehlt');
    var plan;
    try { plan = $app.findRecordById('plans', planId); } catch (err2) { plan = null; }
    if (!plan) return e.string(404, 'not found');

    var darf = istSuper || (plan.getString('owner') === auth.id);
    if (regel.wer === 'crew') {
      // Crew meldet NUR für sich selbst — sonst könnte ein Konto im Namen anderer melden.
      if (!darf) {
        try {
          var m = $app.findFirstRecordByFilter('crew_members',
            'plan_id = {:p} && email = {:m}', { p: planId, m: meineMail });
          darf = !!m;
        } catch (err3) { darf = false; }
      }
      if (mail.toLowerCase() !== meineMail && !istSuper) return e.string(404, 'not found');
    }
    if (!darf) return e.string(404, 'not found');
  }

  if (!regel.slots)    slots = [];
  if (!regel.loeschen) weg   = [];

  // Der Server baut das Transportformat der Mail — nicht mehr der Browser. Das Feld app_url
  // ist bei 5000 Zeichen zu Ende; die Grenze gilt hier, also wird sie hier geprüft.
  var planName = String(body.planName || '');
  var appUrl   = String(body.appUrl || '');
  var listeFuerMail = [];
  for (var li = 0; li < slots.length; li++)
    listeFuerMail.push({ date: slots[li].date, posLabel: slots[li].posLabel || slots[li].posId });
  for (var lj = 0; lj < weg.length; lj++)
    listeFuerMail.push({ date: weg[lj].date, posLabel: weg[lj].posLabel || weg[lj].posId });
  var nutzlast = listeFuerMail.length ? JSON.stringify(listeFuerMail) : appUrl;
  if (nutzlast.length > 4900) return e.string(400, 'zu viele Termine für eine Mail');

  var angelegt = 0, aktualisiert = 0, geloescht = 0;

  try {
    $app.runInTransaction(function (tx) {
      var col = tx.findCollectionByNameOrId('assignments');

      for (var i = 0; i < slots.length; i++) {
        var s = slots[i];
        if (!s || !s.date || !s.posId) continue;
        var da = null;
        try {
          da = tx.findFirstRecordByFilter('assignments',
            'plan_id = {:p} && date = {:d} && pos_id = {:q}',
            { p: planId, d: String(s.date), q: String(s.posId) });
        } catch (err4) { da = null; }
        var r = da || new Record(col);
        if (!da) { r.set('plan_id', planId); r.set('date', String(s.date)); r.set('pos_id', String(s.posId)); }
        r.set('pos_label', String(s.posLabel || s.posId));
        r.set('crew_name', name);
        r.set('crew_email', mail);
        r.set('status', 'proposed');
        r.set('proposed_by', von);
        tx.save(r);
        if (da) aktualisiert++; else angelegt++;
      }

      for (var k = 0; k < weg.length; k++) {
        var w = weg[k];
        if (!w || !w.date || !w.posId) continue;
        var alt = [];
        try {
          alt = tx.findRecordsByFilter('assignments',
            'plan_id = {:p} && date = {:d} && pos_id = {:q}', '', 50, 0,
            { p: planId, d: String(w.date), q: String(w.posId) });
        } catch (err5) { alt = []; }
        for (var n = 0; n < alt.length; n++) { tx.delete(alt[n]); geloescht++; }
      }

      // Der Auslöse-Record ZULETZT und in derselben Transaktion: Der Mail-Hook feuert an
      // onRecordAfterCreateSuccess, also erst nach dem Commit. Bricht oben etwas ab, geht
      // auch keine Mail — genau das war das Ziel.
      var iCol = tx.findCollectionByNameOrId('crew_invites');
      var inv  = new Record(iCol);
      inv.set('plan_id', planId);
      inv.set('crew_name', name);
      inv.set('crew_email', mail);
      inv.set('type', typ);
      inv.set('plan_name', planName || 'Tour Plan');
      inv.set('app_url', nutzlast);
      if (notiz) inv.set('custom_message', notiz);
      tx.save(inv);
    });
  } catch (errTx) {
    console.error('[hook] /notify Transaktion fehlgeschlagen:', String(errTx));
    return e.string(500, 'nicht gespeichert');
  }

  e.response.header().set('Content-Type', 'application/json; charset=utf-8');
  return e.string(200, JSON.stringify({
    ok: true, angelegt: angelegt, aktualisiert: aktualisiert, geloescht: geloescht
  }));
}, $apis.requireAuth());
```

- [ ] **Schritt 4: Tests laufen lassen — müssen grün sein**

Ausführen: `node tests/run.mjs 2>&1 | tail -2`
Erwartet: alle grün, fünf Tests mehr als vorher.

- [ ] **Schritt 5: Committen**

```bash
git add .pb_hooks/main.pb.js tests/notify.test.mjs
git commit -m "feat(hook): POST /notify — ein Endpoint für alle Mail-auslösenden Vorgänge"
```

---

## Task 2: Hook deployen und auf der Test-Instanz nachmessen

**Dateien:** keine (Deployment + Messung)

**Schnittstellen:**
- Konsumiert: die Route aus Task 1
- Produziert: die Gewissheit, dass sie wirkt — Voraussetzung für jede Frontend-Umstellung

- [ ] **Schritt 1: Hook auf beide Umgebungen ausrollen**

Nach dem üblichen Weg (Hook-Deploy wie bei v4.22). Die Route ist additiv — solange kein
Frontend sie aufruft, kann nichts brechen.

- [ ] **Schritt 2: Erreichbarkeit prüfen**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://api-test.crewplanner.nyxlightwork.de/notify
```
Erwartet: `401` (nicht 404) — die Route existiert und verlangt Anmeldung.

- [ ] **Schritt 3: Testdaten klären — FREIGABE EINHOLEN**

Die Test-DB hat einen einzigen `users`-Datensatz, der zu keinem `assignments` passt: „eine
grüne Messung auf Test kann heißen: nichts gemessen." Für eine belastbare Abnahme braucht es
dort einen Plan mit passendem Konto. **Das ist ein schreibender Eingriff in die Test-DB —
vorher fragen.**

- [ ] **Schritt 4: Echten Vorgang durchspielen**

Mit einem Manager-Token der Test-Instanz `POST /notify` mit `type: 'invite'` und 25 Slots
aufrufen. Prüfen:
- Antwort `200 {ok:true, angelegt:25, …}`
- `assignments` enthält 25 neue Records mit `status: 'proposed'`
- **kein 429** im Log (`/api/logs?filter=data.status=429`)
- `email_log` zeigt den Versuch; ohne `RESEND_KEY` geht keine echte Mail raus
- Zweiter Aufruf mit denselben Slots → `angelegt: 0, aktualisiert: 25` (idempotent)

- [ ] **Schritt 5: Fehlerfall prüfen**

Aufruf mit fremder `planId` (Tour, die dem Konto nicht gehört) → **404**, und in
`assignments` ist nichts entstanden.

---

## Task 3: Client-Funktion `notify()` im Frontend

**Dateien:**
- Ändern: `js/dataService.js` (`_pbRoute` um POST erweitern, `notify()` ergänzen)
- Test: `tests/notify.test.mjs` (erweitern)

**Schnittstellen:**
- Produziert: `export async function notify(nutzlast)` — POST auf `/notify`, wirft bei
  Fehlern mit `err.status`; Rückgabe `{ok, angelegt, aktualisiert, geloescht}`

- [ ] **Schritt 1: Failing Test**

```js
test('notify() schickt EINEN POST auf /notify statt vieler Einzelanfragen', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  resetState(g); primePlan(g);
  let aufrufe = [];
  globalThis.fetch = async (url, opts) => {
    aufrufe.push(String(url) + ' ' + ((opts && opts.method) || 'GET'));
    return { status:200, ok:true, json: async () => ({ ok:true, angelegt:25 }) };
  };
  const res = await g.dataService.notify({ type:'invite', planId:'PLAN1',
    crewName:'Neu', crewEmail:'neu@x.de', slots:[{date:'2027-06-01',posId:'gl'}] });
  eq(res.angelegt, 25, 'die Antwort des Servers kommt durch');
  eq(aufrufe.length, 1, 'genau eine Anfrage — das ist der ganze Punkt');
  ok(/\/notify POST$/.test(aufrufe[0]), 'POST auf /notify');
});

test('notify() reicht einen Fehler mit Status weiter', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  resetState(g); primePlan(g);
  globalThis.fetch = async () => ({ status:404, ok:false, json: async () => ({}) });
  let e = null;
  try { await g.dataService.notify({ type:'invite', planId:'X', crewName:'A', crewEmail:'a@b.de' }); }
  catch(err) { e = err; }
  ok(e && e.status === 404, 'der Aufrufer kann auf den Status reagieren');
});
```

- [ ] **Schritt 2: Rot sehen** — `node tests/run.mjs` · erwartet: `notify is not a function`

- [ ] **Schritt 3: Implementieren** in `js/dataService.js`

`_pbRoute` bekommt Methode und Body (bisher nur GET):

```js
async function _pbRoute(path, method, body) {
  const token = localStorage.getItem('pb_token');
  const opts = { method: method || 'GET', headers: {} };
  if (token) opts.headers.Authorization = 'Bearer ' + token;
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(POCKETBASE_URL + path, opts);
  if (!res.ok) {
    const err = new Error('Route ' + path + ' → HTTP ' + res.status);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// ── Ein Vorgang, eine Anfrage (v0.11.0) ───────────────────────────────────────
// Ersetzt alle bisherigen `pbPost` auf crew_invites samt vorgelagerter Slot-Anlage. Der
// Server schreibt Slots und Auslöse-Record in EINER Transaktion — ein halber Zustand
// (Termine angefragt, Mail nie raus) ist damit ausgeschlossen, nicht bloß seltener.
export async function notify(nutzlast) {
  return _pbRoute('/notify', 'POST', nutzlast);
}
```

- [ ] **Schritt 4: Grün sehen** — `node tests/run.mjs 2>&1 | tail -2`

- [ ] **Schritt 5: Committen**

```bash
git add js/dataService.js tests/notify.test.mjs
git commit -m "feat: notify() — ein Aufruf statt Slot-Anlage plus Mail-Record"
```

---

## Task 4: Die vier Sendefunktionen in `dataService.js` umstellen

**Dateien:**
- Ändern: `js/dataService.js` — `sendCrewInvite`, `sendUpdateNotice`,
  `sendCancellationNotice`, `sendAvailabilityNotice`

**Schnittstellen:**
- Konsumiert: `notify()` aus Task 3
- Produziert: unveränderte äußere Signaturen — die Aufrufer in `crewNotify.js` und
  `userView.js` müssen nichts wissen

- [ ] **Schritt 1: Failing Test**

```js
test('sendCrewInvite legt keinen crew_invites-Record mehr selbst an', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  resetState(g); primePlan(g);
  const pfade = [];
  globalThis.fetch = async (url, opts) => {
    pfade.push(String(url));
    return { status:200, ok:true, json: async () => ({ ok:true, items:[], totalPages:1 }) };
  };
  await g.dataService.sendCrewInvite('Neu', 'neu@x.de', 'invite');
  ok(pfade.some(p => p.endsWith('/notify')), 'geht über /notify');
  ok(!pfade.some(p => /crew_invites\/records/.test(p)), 'kein direkter Record mehr');
});
```

- [ ] **Schritt 2: Rot sehen** — erwartet: „kein direkter Record mehr" schlägt fehl.

- [ ] **Schritt 3: Umstellen.** Jede der vier Funktionen behält ihre Signatur und ihr
`try/catch` samt `_showMailError`; ersetzt wird nur der Rumpf. Muster am Beispiel
`sendCancellationNotice`:

```js
export async function sendCancellationNotice(crewName, crewEmail, slots) {
  if (!SUPABASE_ENABLED || !crewEmail) return;
  const planId = await _getActivePlanId();
  if (!planId) return;
  const plans = typeof getPlansIndex === 'function' ? getPlansIndex() : [];
  const planName = plans.find(p => p.id === activePlanId)?.name || 'Tour Plan';
  try {
    await notify({ type: 'cancellation', planId, crewName, crewEmail, planName,
                   removeSlots: slots });
  } catch (e) {
    console.warn('sendCancellationNotice Fehler:', e.message);
    _showMailError(e.message);
    throw e;
  }
}
```

Entsprechend: `sendCrewInvite` → `type` aus dem Parameter, `appUrl` weiterhin mitgeben;
`sendUpdateNotice` → `type:'update'`, `slots`, `proposedBy:'update'`;
`sendAvailabilityNotice` → `type:'availability'`, `slots`.
Die Längenprüfung `APP_URL_GRENZE`/`_schlankeSlots` in `sendUpdateNotice` **entfällt** — sie
lebt jetzt im Hook.

- [ ] **Schritt 4: Grün sehen** — `node tests/run.mjs 2>&1 | tail -2`

- [ ] **Schritt 5: Committen**

```bash
git add js/dataService.js tests/notify.test.mjs
git commit -m "refactor: dataService-Mailwege laufen über /notify"
```

---

## Task 5: `crewNotify.js` und `userView.js` umstellen

**Dateien:**
- Ändern: `js/crewNotify.js` (`sendInvite`, `sendUpdate`)
- Ändern: `js/userView.js` (Update-Queue ~Z. 940–965, Bereitschaft ~Z. 1054)

**Schnittstellen:**
- Konsumiert: die Funktionen aus Task 4

- [ ] **Schritt 1: Failing Test** — die Einladung darf keine Slot-Anlage mehr vorweg fahren:

```js
test('sendInvite fährt keine eigene Slot-Anlage mehr vorweg', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  resetState(g); primePlan(g);
  g.state.crewMeta['Neu'] = { email: 'neu@x.de' };
  g.state.POSITIONS.push({ id:'gl', label:'GL' });
  g.state.TOUR_DATES.push({ date:'2027-06-01', loc:'X' });
  g.state.assignments['2027-06-01'] = { gl: 'Neu' };
  const posts = [];
  globalThis.fetch = async (url, opts) => {
    if (((opts && opts.method) || 'GET') !== 'GET') posts.push(String(url));
    return { status:200, ok:true, json: async () => ({ ok:true, items:[], totalPages:1 }) };
  };
  await g.crewNotify.sendInvite('Neu', 'invite');
  eq(posts.filter(p => /assignments\/records/.test(p)).length, 0,
     'die Slots schreibt der Server, nicht der Browser');
});
```

- [ ] **Schritt 2: Rot sehen**

- [ ] **Schritt 3: Umstellen.** In `sendInvite` entfällt der `bulkProposeCrew`-Block samt
Fortschrittsanzeige; die ermittelten Slots gehen als `slots` an `sendCrewInvite`:

```js
export async function sendInvite(crewName, type) {
  const meta = crewMeta[crewName] || {};
  if (!meta.email) { showToast('Keine E-Mail hinterlegt', '#e84a4a'); return; }
  const allSlots = _getAllSlotsForCrew(crewName, meta.email).filter(s => {
    const existing = assignmentStatuses[s.date]?.[s.posId];
    return !existing || existing.status !== 'confirmed';
  });
  try {
    await sendCrewInvite(crewName, meta.email, type, allSlots);
  } catch (e) {
    showToast(`${crewName}: nicht gesendet — ${_einladungsFehlerText(e)}`, '#e84a4a');
    _renderCrewNotifyList();
    throw e;
  }
  // Der Server hat die Slots geschrieben — lokalen Status nachziehen, damit die Liste stimmt.
  allSlots.forEach(s => {
    if (!assignmentStatuses[s.date]) assignmentStatuses[s.date] = {};
    assignmentStatuses[s.date][s.posId] = { status:'proposed', proposedBy:'bulk', crewName };
  });
  _saveInvite(crewName);
  showToast(`${crewName}: ${type === 'reminder' ? 'Erinnerung' : 'Einladung'} gesendet ✓`, '#4ae8a0');
  _renderCrewNotifyList();
}
```

`sendUpdate` analog (`sendUpdateNotice` bekommt die Slots, `bulkProposeCrew` entfällt).
In `userView.js` ebenso: die beiden `bulkProposeCrew`-Aufrufe entfallen, die PATCH-Schleife
für `proposed_by:'update'` wird zu `slots` mit `proposedBy:'update'`.

- [ ] **Schritt 4: Grün sehen** — `node tests/run.mjs 2>&1 | tail -2`

- [ ] **Schritt 5: Committen**

```bash
git add js/crewNotify.js js/userView.js tests/notify.test.mjs
git commit -m "refactor: Einladen/Update/Bereitschaft ohne eigene Slot-Anlage"
```

---

## Task 6: `admin.html` umstellen (fünf Stellen)

**Dateien:**
- Ändern: `admin.html` — `sendStaffInvite` (~1367), `sendAdminEmail` (~1604),
  `sendAdminInvite` (~1638–1660), `sendAdminUpdate` (~1686), Absage (~1766–1783)
- Ändern: `js/admin-app.js` (`window.notify = notify;`)

**Schnittstellen:**
- Konsumiert: `notify()` aus Task 3, über `window` bereitgestellt

- [ ] **Schritt 1: Failing Test** — der Vollständigkeits-Wächter:

```js
test('kein Frontend-Weg legt noch selbst einen Mail-Auslöser an', () => {
  const treffer = [];
  for (const f of ['admin.html','js/dataService.js','js/userView.js','js/crewNotify.js'])
    if (/crew_invites\/records/.test(readFileSync(join(root, f), 'utf8'))) treffer.push(f);
  eq(treffer.length, 0,
     'Rest-Aufrufstellen: ' + treffer.join(', ') + ' — mit gehärteter createRule fallen die aus');
});
```

- [ ] **Schritt 2: Rot sehen** — erwartet: `admin.html` wird gemeldet.

- [ ] **Schritt 3: Umstellen.** Jede der fünf Stellen ersetzt ihren `pbPost` durch `notify`.
Beispiel `sendAdminInvite` — die ganze Anlege-Schleife samt Fortschrittsanzeige entfällt:

```js
    sender: async (customText) => {
      const neue = slots.filter(s => !s.hasRecord);
      await notify({
        type: 'invite', planId: _wrkPbPlanId, crewName, crewEmail: meta.email,
        planName: _wrkPlanName,
        slots: neue.map(s => ({ date: s.date, posId: s.posId, posLabel: s.posLabel })),
        ...(customText ? { customMessage: customText } : {})
      });
      adminToast(`Einladung gesendet an ${crewName} ✓ (${slots.length} Termine)`, 'var(--show)');
    }
```

Bei der Absage entfällt die `pbDelete`-Schleife; die Slots gehen als `removeSlots` mit. Der
lokale `_wrkAssignmentStatuses`-Abgleich bleibt.

- [ ] **Schritt 4: Grün sehen** — `node tests/run.mjs 2>&1 | tail -2`

- [ ] **Schritt 5: Committen**

```bash
git add admin.html js/admin-app.js tests/notify.test.mjs
git commit -m "refactor: Admin-Ansicht sendet über /notify"
```

---

## Task 7: Version, Changelog, Auslieferung

**Dateien:**
- Ändern: `README.md`, `index.html`, `login.html`, `admin.html`

- [ ] **Schritt 1: Changelog-Eintrag** `**v0.11.0** — refactor: …` oben in `README.md`
- [ ] **Schritt 2: Nummer** in `index.html`, `login.html`, `admin.html` auf v0.11.0
- [ ] **Schritt 3: Volle Suite** — `node tests/run.mjs` und `TZ=Europe/Berlin node tests/run.mjs`, beide grün
- [ ] **Schritt 4: Committen und nach `main` pushen**
- [ ] **Schritt 5: Auf der Test-Umgebung abnehmen** — einladen, Netzwerk-Tab: **eine**
  Anfrage statt 26, kein 429
- [ ] **Schritt 6: Nach `live` pushen** und die Auslieferung per `curl` bestätigen

---

## Task 8: `crew_invites.createRule` härten

**Dateien:** keine (Server-Einstellung)

**Voraussetzung:** Task 6 grün — der Vollständigkeits-Wächter beweist, dass keine
Aufrufstelle mehr direkt schreibt.

- [ ] **Schritt 1: Regel setzen** auf beiden Instanzen: `createRule` = leer (nur Server).
  Bisher: `superadmin || (auth.id != "" && type = "availability") || plan-owner`.
- [ ] **Schritt 2: Gegenprobe** — mit einem normalen Konto direkt einen `crew_invites`-Record
  anlegen: muss **403** ergeben.
- [ ] **Schritt 3: Funktionsprobe** — Einladung und Bereitschaftsmeldung über die App: müssen
  weiterhin gehen (die laufen über den Hook, der die Regel nicht durchläuft).
- [ ] **Schritt 4: Runbook ergänzen** — `docs/admin-runbook-golive.md`: Diese Regel nach
  jedem Redeploy/Reimport neu setzen, sonst steht sie wieder offen.

---

## Selbstprüfung des Plans

**Spec-Abdeckung:** Vertrag → Task 1 · Typ-Tabelle → Task 1 · Transaktion → Task 1 ·
Idempotenz → Task 1/2 · `removeSlots` → Task 1, 6 · `proposedBy` → Task 1, 5 ·
Reihenfolge Hook-vor-Frontend → Task 2 vor 3–6 · neun Aufrufstellen → Task 4, 5, 6 ·
Wächter Ebene 1 → Task 1 · Ebene 2 → Task 6 · Ebene 3 → Task 2 · Regelhärtung → Task 8 ·
Drossel bleibt → unberührt.

**Offen und bewusst nicht enthalten:** `assignments.createRule` (erst zumachbar, wenn auch
Vormerkungen serverseitig laufen), das Wachsen von `crew_invites`.

**Namensgleichheit geprüft:** `notify()` heißt in Task 3, 4, 5, 6 gleich; die Body-Felder
`slots`/`removeSlots`/`proposedBy`/`planName`/`appUrl`/`customMessage` sind in Task 1
definiert und werden in Task 4–6 genau so verwendet.
