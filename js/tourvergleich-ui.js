// Tourvergleich (v1.2.0) – Admin-Tab: Personal-Raster zweier Touren und Tagestafel A | B.
// Hält eigene Bündel je Tour und fasst die Admin-Globals (TOUR_DATES, assignments, …) nicht an.
// Jeder Klick schreibt direkt: Plan frisch lesen → einen Platz ändern → plan_data patchen.
// Es werden hier NIE Mails verschickt; verdrängte Zusagen landen nur in der Update-Liste der Tour.
import { pbGet, pbPatch, pbListAll, pbEscapeFilter } from './pb.js';
import { esc } from './utils.js';
import { sameCrew, queueAddRemoved } from './pure.js';
import { OFFEN } from './state.js';
import { TYPE_COLOR_DEFAULTS } from './types.js';
import { removeAssignmentSlot } from './dataService.js';
import { openModal, closeModal } from './modals.js';
import {
  isPerson, effective, overlapDays, slotsOf, personMatrix, dayDemand,
  candidates, applySlot, planMove, planAssign
} from './tourvergleich.js';

const TOUR_COLOR = { A: '#2bb5a0', B: '#f08a3c' };
const STATUS_ICON = { confirmed: '✓', proposed: '⏳', pencilled: '✎' };
const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const AUSGEBLENDET = ['cancelled', 'cancel_acked', 'declined'];

const S = {
  b: { A: null, B: null },   // Bündel { pbId, name, plan, statuses, crewMeta }
  onlyOverlap: true, onlyShared: true,
  day: null,                 // geöffneter Tag (ISO)
  pick: null,                // { tour, posId } – gewählter Platz in der Tagestafel
  notices: [],               // Hinweise { ok, text } zur Update-Liste
  busy: false,               // Speichern läuft: weitere Klicks ignorieren
  plans: null
};
const $ = id => document.getElementById(id);
const other = t => (t === 'A' ? 'B' : 'A');

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
  return { pbId, name: rec.name || pbId, plan, statuses, crewMeta };
}

async function reloadBundles() {
  const [a, b] = await Promise.all([loadBundle(S.b.A.pbId), loadBundle(S.b.B.pbId)]);
  S.b.A = a; S.b.B = b;
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
  $('tvResult').innerHTML = '<div class="tv-note">Lade …</div>';
  try {
    const [A, B] = await Promise.all([loadBundle(a), loadBundle(b)]);
    S.b.A = A; S.b.B = B; S.day = null; S.pick = null; S.notices = [];
    render();
  } catch (e) { $('tvResult').innerHTML = ''; toast('Laden fehlgeschlagen: ' + e.message, 'var(--warn)'); }
}

// Für die Demo-/Sichtprüfung: zwei fertige Bündel direkt rendern.
export function tvRenderWithBundles(a, b) {
  S.b.A = a; S.b.B = b; S.day = null; S.pick = null; S.notices = [];
  render();
}

// ── Raster ────────────────────────────────────────────────────────────────────
function allDays() {
  const s = new Set([...(S.b.A.plan.tourDates || []).map(t => t.date), ...(S.b.B.plan.tourDates || []).map(t => t.date)]);
  return [...s].sort();
}

function summary(ov) {
  const { A, B } = S.b;
  const m = personMatrix(A.plan, B.plan, { days: ov, onlyShared: false });
  const people = new Set();
  let days = 0;
  ov.forEach(d => {
    let hit = false;
    m.people.forEach(p => { if (m.cells[p.name][d].state === 'conflict') { people.add(p.name); hit = true; } });
    if (hit) days++;
  });
  return { days, people: people.size };
}

function noticeHtml() {
  return S.notices.map(n => `<div class="tv-sum ${n.ok ? 'ok' : 'bad'}" style="font-size:.8rem;display:block">${esc(n.text)}</div>`).join('');
}

function render() {
  const { A, B } = S.b;
  if (!A || !B) return;
  const ov = overlapDays(A.plan, B.plan);
  const days = S.onlyOverlap ? ov : allDays();
  const sm = summary(ov);
  let h = noticeHtml() + `<div class="tv-sum ${sm.days ? 'bad' : 'ok'}">` +
    (sm.days ? `⚠ ${sm.days} ${sm.days === 1 ? 'Konflikttag' : 'Konflikttage'} · ${sm.people} ${sm.people === 1 ? 'Person' : 'Personen'} doppelt` : '✓ keine Doppelbelegung') + '</div>';
  h += `<div class="tv-legend"><span class="tv-dot" style="background:${TOUR_COLOR.A}"></span>A: ${esc(A.name)}` +
       ` <span class="tv-dot" style="background:${TOUR_COLOR.B}"></span>B: ${esc(B.name)}</div>`;
  if (!ov.length) h += '<div class="tv-note">Die Touren überschneiden sich an keinem Tag.</div>';
  if (days.length) h += gridHtml(days);
  $('tvResult').innerHTML = h;
  if (S.day) renderDay();
}

function gridHtml(days) {
  const { A, B } = S.b;
  const m = personMatrix(A.plan, B.plan, { days, onlyShared: S.onlyShared });
  let h = '<div class="tv-scroll"><table class="tv-grid"><thead><tr><th class="tv-name">Person</th>';
  days.forEach(d => {
    const ia = tdInfo(A.plan, d), ib = tdInfo(B.plan, d);
    const tip = `A: ${ia.typeLabel || '–'}${ia.loc ? ' · ' + ia.loc : ''} / B: ${ib.typeLabel || '–'}${ib.loc ? ' · ' + ib.loc : ''}`;
    h += `<th class="tv-dayh" data-act="day" data-date="${esc(d)}" title="${esc(tip)}">${esc(fmtDay(d))}` +
      `<div class="tv-bars"><i style="background:${ia.date ? typeColor(A.plan, d) : 'transparent'}"></i>` +
      `<i style="background:${ib.date ? typeColor(B.plan, d) : 'transparent'}"></i></div></th>`;
  });
  h += '</tr></thead><tbody>';
  m.people.forEach(p => {
    h += `<tr><th class="tv-name">${esc(p.name)}</th>`;
    days.forEach(d => {
      const c = m.cells[p.name][d];
      const aT = c.aPos.map(id => esc(posShort(A.plan, id))).join(', ');
      const bT = c.bPos.map(id => esc(posShort(B.plan, id))).join(', ');
      const cls = { conflict: 'tv-conflict', A: 'tv-a', B: 'tv-b', freeBoth: 'tv-free', freeA: 'tv-free', freeB: 'tv-free', none: 'tv-none' }[c.state];
      const inner = c.state === 'conflict'
        ? `<div class="tv-h ha">${aT}</div><div class="tv-h hb">${bT}</div><span class="tv-warn">⚠</span>`
        : c.state === 'A' ? `<div class="tv-h ha">${aT}</div>`
        : c.state === 'B' ? `<div class="tv-h hb">${bT}</div>` : '';
      h += `<td class="tv-cell ${cls}" data-act="${c.state === 'conflict' ? 'menu' : 'day'}" data-date="${esc(d)}" data-name="${esc(p.name)}">${inner}</td>`;
    });
    h += '</tr>';
  });
  if (!m.people.length) h += `<tr><td class="tv-note" colspan="${days.length + 1}">Keine gemeinsamen Personen.</td></tr>`;
  ['A', 'B'].forEach(t => {
    h += `<tr class="tv-foot"><th class="tv-name" style="color:${TOUR_COLOR[t]}">${t} offen</th>`;
    days.forEach(d => {
      const dm = dayDemand(S.b[t].plan, d);
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
  const self = S.b[t].plan, oth = S.b[other(t)].plan;
  let h = `<div class="tv-col" style="border-top:3px solid ${TOUR_COLOR[t]}"><div class="tv-coltitle" style="color:${TOUR_COLOR[t]}">${t}: ${esc(S.b[t].name)}</div>`;
  const ti = tdInfo(self, date);
  if (!ti.date) return h + '<div class="tv-note">Kein Tourtag in dieser Tour.</div></div>';
  h += `<div class="tv-sub">${esc(ti.typeLabel || '')}${ti.loc ? ' · ' + esc(ti.loc) : ''}</div>`;
  (self.positions || []).forEach(p => {
    const v = effective(self, date, p.id);
    const conflict = isPerson(v) && slotsOf(oth, date, v).length > 0;
    const sel = S.pick && S.pick.tour === t && S.pick.posId === p.id;
    const who = isPerson(v) ? esc(v) : (v === OFFEN ? '⚠ Offen' : (v ? esc(v) : '–'));
    h += `<div class="tv-row${sel ? ' sel' : ''}${conflict ? ' conflict' : ''}" data-act="slot" data-tour="${t}" data-pos="${esc(p.id)}">` +
      `<span class="tv-pl">${esc(p.label || p.id)}</span><span class="tv-pn">${who}</span>` +
      `<span class="tv-ps">${conflict ? '⚠ ' : ''}${statusOf(t, date, p.id, v)}</span></div>`;
    if (sel) h += candHtml(t, date, p.id);
  });
  return h + '</div>';
}

function candHtml(t, date, posId) {
  const self = S.b[t].plan, oth = S.b[other(t)].plan;
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
  const ov = overlapDays(A.plan, B.plan);
  const m = personMatrix(A.plan, B.plan, { days: [date], onlyShared: false });
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
  const ov = overlapDays(S.b.A.plan, S.b.B.plan);
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
export function tvMove(name, date, keep) {
  hideMenu();
  const steps = planMove({ a: S.b.A.plan, b: S.b.B.plan, date, name, keep });
  return tvApply(steps, date);
}

// ── Speichern ─────────────────────────────────────────────────────────────────
// Je Schritt: Plan frisch lesen, einen Platz ändern, patchen. So bleiben Änderungen, die
// zwischenzeitlich anderswo am Plan passiert sind, erhalten.
async function tvApply(steps, date) {
  if (S.busy) return;
  S.busy = true;
  document.body.classList.add('tv-busy');
  S.notices = [];
  try {
    for (const st of steps) {
      const b = S.b[st.tour];
      const rec = await pbGet('/api/collections/plans/records/' + b.pbId);
      const fresh = parsePlanData(rec.plan_data);
      const si = b.statuses[date]?.[st.posId];
      if (si && !sameCrew(si.crewName, st.value)) {
        const r = await removeAssignmentSlot(date, st.posId, { planId: b.pbId, statuses: b.statuses });
        if (r.wasActive && r.rec) {
          const email = (b.crewMeta[r.crewName] && b.crewMeta[r.crewName].email) || r.rec.crew_email;
          if (queueRemoved(b, r, email, date, st.posId)) {
            S.notices.push({ ok: true, text: `Absage für ${r.crewName} liegt in der Update-Liste von ${b.name} – Versand dort über „Updates senden“.` });
          } else {
            S.notices.push({ ok: false, text: `⚠ Keine Mailadresse für ${r.crewName} – Absage NICHT in der Update-Liste, bitte ${r.crewName} selbst informieren.` });
          }
        }
      }
      const next = applySlot(fresh, date, st.posId, st.value);
      await pbPatch('/api/collections/plans/records/' + b.pbId, { plan_data: JSON.stringify(next) });
      b.plan = next;
    }
    S.pick = null;
    render();
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
    queueAddRemoved(q, r.crewName, email, date, posId, posOf(b.plan, posId).label || posId, r.rec.id);
    localStorage.setItem(key, JSON.stringify(q));
    return true;
  } catch (_) { return false; /* ohne localStorage keine Update-Liste */ }
}

// ── Klick-Verteilung und Mini-Menü ────────────────────────────────────────────
function hideMenu() { const m = $('tvMenu'); if (m) m.style.display = 'none'; }

function showMenu(td, date, name) {
  const m = $('tvMenu'); if (!m) return;
  m.innerHTML = `<button data-act="move" data-keep="A" data-date="${esc(date)}" data-name="${esc(name)}">→ nur ${esc(S.b.A.name)} (A)</button>` +
    `<button data-act="move" data-keep="B" data-date="${esc(date)}" data-name="${esc(name)}">→ nur ${esc(S.b.B.name)} (B)</button>` +
    `<button data-act="day" data-date="${esc(date)}">📋 Tagestafel</button>`;
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
    case 'move': tvMove(d.name, d.date, d.keep); break;
    case 'shift': tvShiftDay(Number(d.d)); break;
    case 'close': tvCloseDay(); break;
    case 'slot': tvPickSlot(d.tour, S.day, d.pos); break;
    case 'assign': {
      if (!S.pick) break;
      const { tour, posId } = S.pick;
      const name = d.name === '__stamm__' ? null : d.name;
      tvApply(planAssign({ self: S.b[tour].plan, other: S.b[other(tour)].plan, selfTour: tour, date: S.day, posId, name }), S.day);
      break;
    }
  }
}

if (typeof document !== 'undefined') {
  const hook = () => {
    ['tvResult', 'tvDayBody', 'tvMenu'].forEach(id => { const el = $(id); if (el && !el._tv) { el._tv = 1; el.addEventListener('click', onClick); } });
    document.addEventListener('click', ev => { if (!ev.target.closest('#tvMenu, .tv-cell')) hideMenu(); });
    const mod = $('tvDayModal');
    if (mod && !mod._tv) { mod._tv = 1; mod.addEventListener('click', ev => { if (ev.target === mod) tvCloseDay(); }); }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook); else hook();
}
