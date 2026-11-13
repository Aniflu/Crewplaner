// Tourvergleich (v1.2.1) – Admin-Tab: Personal-Raster zweier Touren und Tagestafel A | B.
// Hält eigene Bündel je Tour und fasst die Admin-Globals (TOUR_DATES, assignments, …) nicht an.
// Entwurfsmodus: Alle Klicks ändern nur die Arbeitskopie (draft). Erst 💾 Speichern (tvSave)
// liest den Plan frisch, prüft Fremdänderungen und schreibt je Tour einmal.
// Es werden hier NIE Mails verschickt; verdrängte Zusagen landen nur in der Update-Liste der Tour.
import { pbGet, pbPatch, pbListAll, pbEscapeFilter } from './pb.js';
import { esc } from './utils.js';
import { sameCrew, queueAddRemoved } from './pure.js';
import { OFFEN, AUSSCHREIBEN } from './state.js';
import { TYPE_COLOR_DEFAULTS } from './types.js';
import { removeAssignmentSlot } from './dataService.js';
import { openModal, closeModal } from './modals.js';
import {
  isPerson, effective, overlapDays, slotsOf, personMatrix, dayDemand,
  candidates, applySlot, planSwitch, planAssign, diffPlans, staleSlots
} from './tourvergleich.js';

const TOUR_COLOR = { A: '#2bb5a0', B: '#f08a3c' };
const STATUS_ICON = { confirmed: '✓', proposed: '⏳', pencilled: '✎' };
const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const AUSGEBLENDET = ['cancelled', 'cancel_acked', 'declined'];

const S = {
  b: { A: null, B: null },   // Bündel { pbId, name, orig (geladen), draft (Arbeitskopie), statuses, crewMeta }
  onlyOverlap: true, onlyShared: true,
  day: null,                 // geöffneter Tag (ISO)
  pick: null,                // { tour, posId } – gewählter Platz in der Tagestafel
  notices: [],               // Hinweise { ok, text } zur Update-Liste
  busy: false,               // Speichern läuft: weitere Klicks ignorieren
  prev: { A: '', B: '' },    // Tour-IDs der geladenen Bündel (Select zurücksetzen bei „Abbrechen“)
  plans: null
};
const $ = id => document.getElementById(id);
const other = t => (t === 'A' ? 'B' : 'A');
const copy = o => JSON.parse(JSON.stringify(o || {}));
const draftOf = t => S.b[t].draft;
const diffsOf = t => diffPlans(S.b[t].orig, S.b[t].draft);
const nChanges = () => (S.b.A && S.b.B) ? diffsOf('A').length + diffsOf('B').length : 0;
const chgSet = t => new Set(diffsOf(t).map(d => d.date + '|' + d.posId));

function toast(msg, color) {
  if (typeof window.adminToast === 'function') window.adminToast(msg, color);
  else if (typeof window.showToast === 'function') window.showToast(msg, color);
}

function fmtDay(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return WEEKDAYS[new Date(y, m - 1, d).getDay()] + ' ' + String(d).padStart(2, '0') + '.' + String(m).padStart(2, '0');
}
const tdInfo = (plan, date) => (plan.tourDates || []).find(t => t.date === date) || {};
const typeColor = (plan, date) => TYPE_COLOR_DEFAULTS[tdInfo(plan, date).type] || 'var(--off)';
const posOf = (plan, id) => (plan.positions || []).find(p => p.id === id) || { id, label: id, short: id };
const posShort = (plan, id) => { const p = posOf(plan, id); return p.short || p.label || id; };

// ── Laden ─────────────────────────────────────────────────────────────────────
// plan_data kommt als JSON-Text oder schon als Objekt; leer/kaputt → {}.
function parsePlanData(v) {
  if (!v) return {};
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v) || {}; } catch (_) { return {}; }
}

export async function loadBundle(pbId) {
  const rec = await pbGet('/api/collections/plans/records/' + pbId);
  const plan = parsePlanData(rec.plan_data);
  // Alle Seiten laden: bei mehr als einer Seite fehlten sonst Status → Zusage ohne Absage-Queue entfernt.
  const filter = `plan_id = "${pbEscapeFilter(pbId)}"`;
  const crewData = await pbListAll('crew_members', filter);
  const crewMeta = {};
  (crewData.items || []).forEach(m => { crewMeta[m.name] = { email: m.email || '', id: m.id }; });
  const asg = await pbListAll('assignments', filter);
  const statuses = {};
  (asg.items || []).forEach(a => {
    if (AUSGEBLENDET.includes(a.status)) return;
    (statuses[a.date] = statuses[a.date] || {})[a.pos_id] = {
      status: a.status, crewName: a.crew_name, crewEmail: a.crew_email, proposedBy: a.proposed_by, id: a.id
    };
  });
  return { pbId, name: rec.name || pbId, orig: plan, draft: copy(plan), statuses, crewMeta };
}

// Lädt die genannten Touren neu (orig = draft = frischer Stand).
async function reloadBundles(tours) {
  const ts = tours || ['A', 'B'];
  const loaded = await Promise.all(ts.map(t => loadBundle(S.b[t].pbId)));
  ts.forEach((t, i) => { S.b[t] = loaded[i]; });
}

export async function tvInit() {
  if (S.plans) return;
  const selA = $('tvSelA'), selB = $('tvSelB');
  if (!selA || !selB) return;
  try {
    const user = JSON.parse(localStorage.getItem('pb_user') || '{}');
    let url = '/api/collections/plans/records?perPage=200&sort=-id';
    if (user.role !== 'superadmin' && user.id) url += '&filter=' + encodeURIComponent(`owner="${user.id}"`);
    const data = await pbGet(url);
    S.plans = data.items || [];
    const opts = '<option value="">– Tour wählen –</option>' +
      S.plans.map(p => `<option value="${esc(p.id)}">${esc(p.name || p.id)}</option>`).join('');
    selA.innerHTML = opts; selB.innerHTML = opts;
  } catch (e) { toast('Pläne laden fehlgeschlagen: ' + e.message, 'var(--warn)'); }
}

export async function tvCompare() {
  const a = $('tvSelA').value, b = $('tvSelB').value;
  S.onlyOverlap = $('tvOnlyOverlap').checked;
  S.onlyShared = $('tvOnlyShared').checked;
  if (!a || !b) { toast('Bitte beide Touren wählen', 'var(--warn)'); return; }
  if (a === b) { toast('Bitte zwei verschiedene Touren wählen', 'var(--warn)'); return; }
  if (!confirmDiscard()) return;
  $('tvResult').innerHTML = '<div class="tv-note">Lade …</div>';
  try {
    const [A, B] = await Promise.all([loadBundle(a), loadBundle(b)]);
    S.b.A = A; S.b.B = B; S.day = null; S.pick = null; S.notices = [];
    S.prev = { A: a, B: b };
    render();
  } catch (e) { $('tvResult').innerHTML = ''; toast('Laden fehlgeschlagen: ' + e.message, 'var(--warn)'); }
}

// Für die Demo-/Sichtprüfung: zwei fertige Bündel direkt rendern.
export function tvRenderWithBundles(a, b) {
  // Bündel ohne orig/draft (alte Form mit `plan`) werden ergänzt.
  [a, b].forEach(x => { if (!x.orig) x.orig = x.plan; if (!x.draft) x.draft = copy(x.orig); });
  S.b.A = a; S.b.B = b; S.prev = { A: a.pbId, B: b.pbId }; S.day = null; S.pick = null; S.notices = [];
  render();
}

// ── Raster ────────────────────────────────────────────────────────────────────
function allDays() {
  const s = new Set([...(S.b.A.draft.tourDates || []).map(t => t.date), ...(S.b.B.draft.tourDates || []).map(t => t.date)]);
  return [...s].sort();
}

function summary(ov) {
  const { A, B } = S.b;
  const m = personMatrix(A.draft, B.draft, { days: ov, onlyShared: false });
  const people = new Set();
  let days = 0, cells = 0;
  ov.forEach(d => {
    let hit = false;
    m.people.forEach(p => { if (m.cells[p.name][d].state === 'conflict') { people.add(p.name); hit = true; cells++; } });
    if (hit) days++;
  });
  return { days, people: people.size, cells };
}

function noticeHtml() {
  return S.notices.map(n => `<div class="tv-sum ${n.ok ? 'ok' : 'bad'}" style="font-size:.8rem;display:block">${esc(n.text)}</div>`).join('');
}

function render() {
  const { A, B } = S.b;
  if (!A || !B) return;
  const ov = overlapDays(A.draft, B.draft);
  const days = S.onlyOverlap ? ov : allDays();
  const sm = summary(ov);
  let h = noticeHtml() + `<div class="tv-sum ${sm.days ? 'bad' : 'ok'}">` +
    (sm.days ? `⚠ ${sm.days} ${sm.days === 1 ? 'Konflikttag' : 'Konflikttage'} · ${sm.people} ${sm.people === 1 ? 'Person' : 'Personen'} doppelt` : '✓ keine Doppelbelegung') + '</div>';
  h += `<div class="tv-legend"><span class="tv-dot" style="background:${TOUR_COLOR.A}"></span>A: ${esc(A.name)}` +
       ` <span class="tv-dot" style="background:${TOUR_COLOR.B}"></span>B: ${esc(B.name)}</div>`;
  if (!ov.length) h += '<div class="tv-note">Die Touren überschneiden sich an keinem Tag.</div>';
  if (days.length) h += gridHtml(days);
  $('tvResult').innerHTML = h;
  renderBar(sm.cells);
  if (S.day) renderDay();
}

// Leiste unten: Zähler + Speichern/Verwerfen (beide gesperrt ohne Änderungen).
function renderBar(conflicts) {
  const bar = $('tvBar'); if (!bar) return;
  const n = nChanges();
  if (conflicts === undefined) conflicts = summary(overlapDays(S.b.A.draft, S.b.B.draft)).cells;
  bar.style.display = 'flex';
  bar.innerHTML = `<span class="tv-count${n ? ' dirty' : ''}">✎ ${n} ${n === 1 ? 'Änderung' : 'Änderungen'}</span>` +
    `<span class="tv-count${conflicts ? ' bad' : ''}">⚠ ${conflicts} ${conflicts === 1 ? 'Konflikt' : 'Konflikte'} übrig</span>` +
    `<span class="tv-bar-btns"><button class="btn btn-primary btn-sm" data-act="save"${n ? '' : ' disabled'}>💾 Speichern</button>` +
    `<button class="btn btn-ghost btn-sm" data-act="discard"${n ? '' : ' disabled'}>↩ Verwerfen</button></span>`;
}

function gridHtml(days) {
  const { A, B } = S.b;
  const m = personMatrix(A.draft, B.draft, { days, onlyShared: S.onlyShared });
  const diffs = [...diffsOf('A'), ...diffsOf('B')];
  let h = '<div class="tv-scroll"><table class="tv-grid"><thead><tr><th class="tv-name">Person</th>';
  days.forEach(d => {
    const ia = tdInfo(A.draft, d), ib = tdInfo(B.draft, d);
    const tip = `A: ${ia.typeLabel || '–'}${ia.loc ? ' · ' + ia.loc : ''} / B: ${ib.typeLabel || '–'}${ib.loc ? ' · ' + ib.loc : ''}`;
    h += `<th class="tv-dayh" data-act="day" data-date="${esc(d)}" title="${esc(tip)}">${esc(fmtDay(d))}` +
      `<div class="tv-bars"><i style="background:${ia.date ? typeColor(A.draft, d) : 'transparent'}"></i>` +
      `<i style="background:${ib.date ? typeColor(B.draft, d) : 'transparent'}"></i></div></th>`;
  });
  h += '</tr></thead><tbody>';
  m.people.forEach(p => {
    h += `<tr><th class="tv-name">${esc(p.name)}</th>`;
    days.forEach(d => {
      const c = m.cells[p.name][d];
      const aT = c.aPos.map(id => esc(posShort(A.draft, id))).join(', ');
      const bT = c.bPos.map(id => esc(posShort(B.draft, id))).join(', ');
      const cls = { conflict: 'tv-conflict', A: 'tv-a', B: 'tv-b', freeBoth: 'tv-free', freeA: 'tv-free', freeB: 'tv-free', none: 'tv-none' }[c.state];
      const inner = c.state === 'conflict'
        ? `<div class="tv-h ha">${aT}</div><div class="tv-h hb">${bT}</div><span class="tv-warn">⚠</span>`
        : c.state === 'A' ? `<div class="tv-h ha">${aT}</div>`
        : c.state === 'B' ? `<div class="tv-h hb">${bT}</div>` : '';
      // Menü für jede gemeinsame Person an einem Tag, den beide Touren haben; sonst direkt die Tagestafel.
      const menu = p.inA && p.inB && tdInfo(A.draft, d).date && tdInfo(B.draft, d).date;
      const chg = diffs.some(x => x.date === d && ((isPerson(x.before) && sameCrew(x.before, p.name)) || (isPerson(x.after) && sameCrew(x.after, p.name))));
      h += `<td class="tv-cell ${cls}${chg ? ' tv-chg' : ''}" data-act="${menu ? 'menu' : 'day'}" data-date="${esc(d)}" data-name="${esc(p.name)}">${inner}${chg ? '<span class="tv-pen">✎</span>' : ''}</td>`;
    });
    h += '</tr>';
  });
  if (!m.people.length) h += `<tr><td class="tv-note" colspan="${days.length + 1}">Keine gemeinsamen Personen.</td></tr>`;
  ['A', 'B'].forEach(t => {
    h += `<tr class="tv-foot"><th class="tv-name" style="color:${TOUR_COLOR[t]}">${t} offen</th>`;
    days.forEach(d => {
      const dm = dayDemand(S.b[t].draft, d);
      h += `<td class="tv-open ${dm.total ? (dm.open ? 'bad' : 'ok') : ''}">${dm.total ? dm.open : ''}</td>`;
    });
    h += '</tr>';
  });
  return h + '</tbody></table></div>';
}

// ── Tagestafel ────────────────────────────────────────────────────────────────
function statusOf(t, date, posId, person) {
  const st = S.b[t].statuses[date]?.[posId];
  if (!st || !person || !sameCrew(st.crewName, person)) return '';
  return STATUS_ICON[st.status] || '';
}

function dayColHtml(t, date) {
  const self = S.b[t].draft, oth = S.b[other(t)].draft;
  const chg = chgSet(t);
  let h = `<div class="tv-col" style="border-top:3px solid ${TOUR_COLOR[t]}"><div class="tv-coltitle" style="color:${TOUR_COLOR[t]}">${t}: ${esc(S.b[t].name)}</div>`;
  const ti = tdInfo(self, date);
  if (!ti.date) return h + '<div class="tv-note">Kein Tourtag in dieser Tour.</div></div>';
  h += `<div class="tv-sub">${esc(ti.typeLabel || '')}${ti.loc ? ' · ' + esc(ti.loc) : ''}</div>`;
  (self.positions || []).forEach(p => {
    const v = effective(self, date, p.id);
    const conflict = isPerson(v) && slotsOf(oth, date, v).length > 0;
    const sel = S.pick && S.pick.tour === t && S.pick.posId === p.id;
    const who = isPerson(v) ? esc(v) : (v === OFFEN ? '⚠ Offen' : (v ? esc(v) : '–'));
    const ch = chg.has(date + '|' + p.id);
    h += `<div class="tv-row${sel ? ' sel' : ''}${conflict ? ' conflict' : ''}${ch ? ' changed' : ''}" data-act="slot" data-tour="${t}" data-pos="${esc(p.id)}">` +
      `<span class="tv-pl">${esc(p.label || p.id)}</span><span class="tv-pn">${who}</span>` +
      `<span class="tv-ps">${ch ? '✎ ' : ''}${conflict ? '⚠ ' : ''}${statusOf(t, date, p.id, v)}</span></div>`;
    if (sel) h += candHtml(t, date, p.id);
  });
  return h + '</div>';
}

function candHtml(t, date, posId) {
  const self = S.b[t].draft, oth = S.b[other(t)].draft;
  let h = '<div class="tv-cands">';
  candidates(self, oth, date, posId).forEach(c => {
    const ic = c.kind === 'free' ? '🟢' : c.kind === 'other' ? '🟡' : '⚪';
    const info = c.kind === 'other' ? ` · bei ${other(t)} als ${c.otherPos.map(id => esc(posShort(oth, id))).join(', ')}`
      : c.kind === 'same' ? ' · schon eingeteilt' : '';
    h += `<button class="tv-cand" data-act="assign" data-name="${esc(c.name)}">${ic} ${esc(c.name)}<small>${info}</small></button>`;
  });
  h += '<button class="tv-cand" data-act="assign" data-name="__offen__">⚠ Offen</button>' +
       '<button class="tv-cand" data-act="assign" data-name="__stamm__">↩ Stammbesetzung</button></div>';
  return h;
}

function renderDay() {
  const { A, B } = S.b;
  const date = S.day;
  const ov = overlapDays(A.draft, B.draft);
  const m = personMatrix(A.draft, B.draft, { days: [date], onlyShared: false });
  const free = m.people.filter(p => ['freeBoth', 'freeA', 'freeB'].includes(m.cells[p.name][date].state));
  let h = `<div class="tv-daynav"><button class="btn btn-ghost btn-sm" data-act="shift" data-d="-1">‹</button>` +
    `<b>${esc(fmtDay(date))}</b><button class="btn btn-ghost btn-sm" data-act="shift" data-d="1">›</button>` +
    `<button class="btn btn-ghost btn-sm" data-act="close" style="margin-left:auto">✕</button></div>`;
  if (!ov.includes(date)) h += '<div class="tv-note">Dieser Tag liegt nur in einer der Touren.</div>';
  h += noticeHtml();
  h += `<div class="tv-cols">${dayColHtml('A', date)}${dayColHtml('B', date)}</div>`;
  h += '<div class="tv-freebar"><b>Frei an diesem Tag:</b> ' +
    (free.length ? free.map(p => esc(p.name)).join(' · ') : '–') + '</div>';
  $('tvDayBody').innerHTML = h;
}

export function tvOpenDay(date) {
  S.day = date; S.pick = null;
  hideMenu();
  renderDay();
  openModal('tvDayModal');
}
export function tvCloseDay() { S.day = null; S.pick = null; closeModal('tvDayModal'); }
export function tvShiftDay(dir) {
  const ov = overlapDays(S.b.A.draft, S.b.B.draft);
  if (!ov.length) return;
  const i = ov.indexOf(S.day);
  const next = i < 0 ? (dir > 0 ? ov.find(d => d > S.day) : [...ov].reverse().find(d => d < S.day)) : ov[i + dir];
  if (!next) return;
  S.day = next; S.pick = null;
  renderDay();
}
export function tvPickSlot(tour, date, posId) {
  const same = S.pick && S.pick.tour === tour && S.pick.posId === posId;
  S.day = date; S.pick = same ? null : { tour, posId };
  renderDay();
}
// Steps auf den Entwurf anwenden – kein Netz.
function applySteps(steps, date) {
  S.notices = [];
  steps.forEach(st => { S.b[st.tour].draft = applySlot(S.b[st.tour].draft, date, st.posId, st.value); });
  render();
}

// „→ zu X“ im Entwurf. Ohne freie Stammposition: Tafel mit Hinweis und vorgewähltem ersten offenen Platz.
export function tvMove(name, date, to) {
  hideMenu();
  if (S.busy) return;
  const { steps, needsPick } = planSwitch({ a: S.b.A.draft, b: S.b.B.draft, date, name, to });
  applySteps(steps, date);
  if (!needsPick) return;
  S.notices = [{ ok: false, text: `${name} hat in ${S.b[to].name} (${to}) keine freie Stammposition – bitte Platz wählen` }];
  tvOpenDay(date);
  const plan = S.b[to].draft;
  const first = (plan.positions || []).find(p => { const v = effective(plan, date, p.id); return v === '' || v === OFFEN || v === AUSSCHREIBEN; });
  if (first) S.pick = { tour: to, posId: first.id };
  renderDay();
}

// ── Verwerfen / Ungespeichertes ───────────────────────────────────────────────
export function tvHasUnsaved() { return nChanges() > 0; }

function resetDrafts() {
  ['A', 'B'].forEach(t => { if (S.b[t]) S.b[t].draft = copy(S.b[t].orig); });
  S.notices = []; S.pick = null;
}

// Rückfrage bei offenen Änderungen; bei OK wird der Entwurf verworfen (kein Schreibzugriff).
function confirmDiscard() {
  if (!tvHasUnsaved()) return true;
  if (!confirm('Ungespeicherte Änderungen verwerfen?')) return false;
  resetDrafts();
  return true;
}

export function tvDiscard() {
  if (S.busy) return;
  const n = nChanges();
  if (!n) return;
  if (!confirm(`Alle ${n} ${n === 1 ? 'Änderung' : 'Änderungen'} verwerfen?`)) return;
  resetDrafts();
  render();
}

// Tabwechsel (Hook in switchTab): true = darf wechseln.
export function tvLeaveCheck(name) {
  const sec = $('tabTourvergleich');
  if (name === 'tourvergleich' || !sec || !sec.classList.contains('active')) return true;
  if (!confirmDiscard()) return false;
  if (S.b.A && S.b.B) render();
  return true;
}

// Tour-Select geändert: bei Entwurf nachfragen, bei „Abbrechen“ alte Auswahl zurück.
export function tvSelChange() {
  if (!tvHasUnsaved()) return;
  if (confirmDiscard()) { render(); return; }
  $('tvSelA').value = S.prev.A; $('tvSelB').value = S.prev.B;
}

// ── Speichern ─────────────────────────────────────────────────────────────────
const SHOWN = { [OFFEN]: '⚠ Offen', [AUSSCHREIBEN]: '📢 Ausschreiben', '': '— leer' };
const shown = v => (v in SHOWN ? SHOWN[v] : (isPerson(v) ? esc(v) : esc(String(v).replace(/^__|__$/g, ''))));

// Absagen, die dieser Entwurf auslöst: aktive (bestätigt/angefragt) Zusagen am geänderten Platz.
function absagen() {
  const out = [];
  ['A', 'B'].forEach(t => diffsOf(t).forEach(d => {
    const si = S.b[t].statuses[d.date]?.[d.posId];
    if (si && (si.status === 'confirmed' || si.status === 'proposed') && !sameCrew(si.crewName, d.after))
      out.push({ t, name: si.crewName, date: d.date, posId: d.posId });
  }));
  return out;
}

// Bestätigungsdialog: Liste je Tour (Tag, Position, vorher → nachher), Absagen, Restkonflikte.
export function tvSaveAsk() {
  if (S.busy || !nChanges()) return;
  const conflicts = summary(overlapDays(S.b.A.draft, S.b.B.draft)).cells;
  let h = '<div class="modal-title">💾 Änderungen speichern</div>';
  ['A', 'B'].forEach(t => {
    const ds = diffsOf(t);
    if (!ds.length) return;
    h += `<div class="tv-sv-tour" style="color:${TOUR_COLOR[t]}">${t}: ${esc(S.b[t].name)}</div><ul class="tv-sv-list">` +
      ds.map(d => `<li><b>${esc(fmtDay(d.date))}</b> · ${esc(posOf(S.b[t].draft, d.posId).label || d.posId)}: ` +
        `${shown(d.before)} → ${shown(d.after)}</li>`).join('') + '</ul>';
  });
  const ab = absagen();
  if (ab.length) h += '<div class="tv-sum bad tv-sv-warn">Diese bestätigten/angefragten Leute bekommen eine Absage in die Update-Liste: ' +
    ab.map(x => `${esc(x.name)} (${esc(S.b[x.t].name)}, ${esc(fmtDay(x.date))} ${esc(posOf(S.b[x.t].draft, x.posId).label || x.posId)})`).join(' · ') + '</div>';
  if (conflicts) h += `<div class="tv-sum bad tv-sv-warn">Es gibt noch ${conflicts} ${conflicts === 1 ? 'Konflikt' : 'Konflikte'} – trotzdem speichern?</div>`;
  h += '<div class="tv-sv-btns"><button class="btn btn-ghost btn-sm" data-act="saveno">Abbrechen</button>' +
    '<button class="btn btn-primary btn-sm" data-act="saveok">💾 Speichern</button></div>';
  $('tvSaveBody').innerHTML = h;
  openModal('tvSaveModal');
}

// Je Tour: Plan frisch lesen → Schutzprüfung (Fremdänderung genau an einem geänderten Platz → Tour
// überspringen, Entwurf bleibt) → Absagen über removeAssignmentSlot + Update-Liste → alle Änderungen auf
// den frischen Plan → EIN Patch je Tour. Danach Bündel neu laden; eine übersprungene Tour behält
// orig UND draft (die Schutzprüfung greift dann bei jedem weiteren Speichern erneut, bis neu verglichen wird).
export async function tvSave() {
  if (S.busy) return;
  closeModal('tvSaveModal');
  S.busy = true;
  document.body.classList.add('tv-busy');
  S.notices = [];
  const skipped = [];
  try {
    for (const t of ['A', 'B']) {
      const b = S.b[t];
      const diffs = diffsOf(t);
      if (!diffs.length) continue;
      const rec = await pbGet('/api/collections/plans/records/' + b.pbId);
      const fresh = parsePlanData(rec.plan_data);
      const stale = staleSlots(b.orig, fresh, diffs);
      if (stale.length) {
        skipped.push(t);
        const s0 = stale[0];
        S.notices.push({ ok: false, text: `${b.name} wurde zwischendurch geändert (${fmtDay(s0.date)} ${posOf(b.draft, s0.posId).label || s0.posId}) – bitte neu vergleichen` });
        continue;
      }
      let next = fresh;
      for (const d of diffs) {
        const si = b.statuses[d.date]?.[d.posId];
        if (si && !sameCrew(si.crewName, d.after)) {
          const r = await removeAssignmentSlot(d.date, d.posId, { planId: b.pbId, statuses: b.statuses });
          if (r.wasActive && r.rec) {
            const email = (b.crewMeta[r.crewName] && b.crewMeta[r.crewName].email) || r.rec.crew_email;
            if (queueRemoved(b, r, email, d.date, d.posId)) {
              S.notices.push({ ok: true, text: `Absage für ${r.crewName} liegt in der Update-Liste von ${b.name} – Versand dort über „Updates senden“.` });
            } else {
              S.notices.push({ ok: false, text: `⚠ Keine Mailadresse für ${r.crewName} – Absage NICHT in der Update-Liste, bitte ${r.crewName} selbst informieren.` });
            }
          }
        }
        next = applySlot(next, d.date, d.posId, d.after);
      }
      await pbPatch('/api/collections/plans/records/' + b.pbId, { plan_data: JSON.stringify(next) });
    }
    await reloadBundles(['A', 'B'].filter(t => !skipped.includes(t)));
    S.pick = null;
    render();
    if (!skipped.length) toast('💾 Gespeichert', 'var(--show)');
  } catch (e) {
    toast('Speichern fehlgeschlagen: ' + (e && e.message || e), 'var(--warn)');
    try { await reloadBundles(); } catch (_) { /* Anzeige bleibt wie sie war */ }
    S.pick = null;
    render();
  } finally {
    S.busy = false;
    document.body.classList.remove('tv-busy');
  }
}

function queueRemoved(b, r, email, date, posId) {
  try {
    const key = 'crewplan_updates_' + b.pbId;
    const q = JSON.parse(localStorage.getItem(key) || '{}');
    if (!email) return false;
    queueAddRemoved(q, r.crewName, email, date, posId, posOf(b.draft, posId).label || posId, r.rec.id);
    localStorage.setItem(key, JSON.stringify(q));
    return true;
  } catch (_) { return false; /* ohne localStorage keine Update-Liste */ }
}

// ── Klick-Verteilung und Mini-Menü ────────────────────────────────────────────
function hideMenu() { const m = $('tvMenu'); if (m) m.style.display = 'none'; }

function showMenu(td, date, name) {
  const m = $('tvMenu'); if (!m) return;
  const at = t => (slotsOf(S.b[t].draft, date, name).length ? '✓ ' : '');
  const btn = t => `<button data-act="switch" data-to="${t}" data-date="${esc(date)}" data-name="${esc(name)}">${at(t)}→ ${esc(S.b[t].name)} (${t})</button>`;
  m.innerHTML = btn('A') + btn('B') + `<button data-act="day" data-date="${esc(date)}">📋 Tagestafel</button>`;
  const r = td.getBoundingClientRect();
  m.style.display = 'flex';
  m.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 230)) + 'px';
  m.style.top = (r.bottom + 4) + 'px';
}

function onClick(e) {
  const el = e.target.closest('[data-act]');
  if (!el) { hideMenu(); return; }
  const d = el.dataset;
  switch (d.act) {
    case 'day': tvOpenDay(d.date); break;
    case 'menu': showMenu(el, d.date, d.name); break;
    case 'switch': tvMove(d.name, d.date, d.to); break;
    case 'save': tvSaveAsk(); break;
    case 'discard': tvDiscard(); break;
    case 'saveok': tvSave(); break;
    case 'saveno': closeModal('tvSaveModal'); break;
    case 'shift': tvShiftDay(Number(d.d)); break;
    case 'close': tvCloseDay(); break;
    case 'slot': tvPickSlot(d.tour, S.day, d.pos); break;
    case 'assign': {
      if (!S.pick || S.busy) break;
      const { tour, posId } = S.pick;
      const name = d.name === '__stamm__' ? null : d.name;
      applySteps(planAssign({ self: S.b[tour].draft, other: S.b[other(tour)].draft, selfTour: tour, date: S.day, posId, name }), S.day);
      S.pick = null; renderDay();
      break;
    }
  }
}

if (typeof document !== 'undefined') {
  const hook = () => {
    ['tvResult', 'tvDayBody', 'tvMenu', 'tvBar', 'tvSaveBody'].forEach(id => { const el = $(id); if (el && !el._tv) { el._tv = 1; el.addEventListener('click', onClick); } });
    document.addEventListener('click', ev => { if (!ev.target.closest('#tvMenu, .tv-cell')) hideMenu(); });
    if (typeof window.addEventListener === 'function') window.addEventListener('beforeunload', ev => { if (tvHasUnsaved()) { ev.preventDefault(); ev.returnValue = ''; } });
    const mod = $('tvDayModal');
    if (mod && !mod._tv) { mod._tv = 1; mod.addEventListener('click', ev => { if (ev.target === mod) tvCloseDay(); }); }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook); else hook();
}
