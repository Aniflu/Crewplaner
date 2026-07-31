// ── Sammel-Statuswechsel: bestätigt ⇄ vorgemerkt (v0.50.0) ────────────────────
// Der Manager wählt Personen → Tourblöcke → einzelne Tage und schaltet deren Einsätze
// in einem Rutsch um. Ersetzt das Zelle-für-Zelle-Vormerken, das bei 30–60 Tourtagen
// praktisch unbenutzbar war.
//
// Auswahl-Muster (alle/keine je Block und je Person, globales ALLE/KEINE) bewusst
// identisch zum Update-Queue-Modal in userView.js — der Manager kennt es von dort.
// Anders als die Queue wird hier NICHTS persistiert: eine Einmal-Aktion, der
// Auswahlzustand lebt nur solange der Dialog offen ist.
import { TOUR_DATES, POSITIONS, assignmentStatuses, crewMeta, IS_MANAGER } from './state.js';
import { esc, showToast } from './utils.js';
import { pencilInAssignment, confirmAssignment, loadAssignmentStatuses } from './dataService.js';
import { renderTable } from './render.js';
import { openModal, closeModal } from './modals.js';
import { _queueStatusSlot, _dateBlockId } from './userView.js';

// Modus → { von, nach }. `von` ist der Quellstatus, der überhaupt zur Auswahl steht.
const MODES = {
  pencil:  { from: 'confirmed', to: 'pencilled', label: '✓ bestätigt → ✎ vorgemerkt' },
  confirm: { from: 'pencilled', to: 'confirmed', label: '✎ vorgemerkt → ✓ bestätigt' },
};

let _mode = 'pencil';
let _sel = new Set();          // ausgewählte Slots als 'name|date|posId'
let _onlyCrew = null;          // gesetzt beim Einstieg übers Zellen-Menü

const _key = (name, date, posId) => `${name}|${date}|${posId}`;

// Alle Slots im aktuellen Quellstatus einsammeln — gruppiert Person → Block → Tag.
// Rückgabe: { people: [{name, email, blocks: [{bid, label, slots:[…]}]}], total }
function _collect() {
  const from = MODES[_mode].from;
  const blockLabel = {}; const blockOrder = []; const seen = new Set();
  TOUR_DATES.forEach(r => {
    const bid = r.blockId || '';
    if (bid && r.blockName) blockLabel[bid] = r.blockName;
    if (!seen.has(bid)) { seen.add(bid); blockOrder.push(bid); }
  });

  const byName = {};
  TOUR_DATES.forEach(r => {
    POSITIONS.forEach(p => {
      const si = (assignmentStatuses[r.date] || {})[p.id];
      if (!si || si.status !== from || !si.crewName) return;
      if (_onlyCrew && si.crewName !== _onlyCrew) return;
      const name = si.crewName;
      (byName[name] = byName[name] || {})[_dateBlockId(r.date)] =
        (byName[name][_dateBlockId(r.date)] || []);
      byName[name][_dateBlockId(r.date)].push({ date: r.date, posId: p.id, posLabel: p.label || p.id });
    });
  });

  let total = 0;
  const people = Object.keys(byName).sort().map(name => {
    const blocks = blockOrder.filter(bid => byName[name][bid]).map(bid => {
      const slots = byName[name][bid];
      total += slots.length;
      return { bid, label: bid ? (blockLabel[bid] || 'Block') : 'Ohne Block', slots };
    });
    return { name, email: crewMeta[name]?.email || '', blocks };
  });
  return { people, total };
}

const _BTN = "background:var(--panel2);color:var(--accent);border:1px solid var(--rule-2);border-radius:3px;padding:1px 7px;font-family:inherit;font-size:.58rem;letter-spacing:.5px;cursor:pointer;";

function _render() {
  const body = document.getElementById('bulkStatusBody');
  if (!body) return;
  const { people, total } = _collect();
  const m = MODES[_mode];

  if (!total) {
    const was = m.from === 'confirmed' ? 'bestätigten' : 'vorgemerkten';
    const wer = _onlyCrew ? ' für ' + esc(_onlyCrew) : '';
    body.innerHTML = `<div style="color:var(--muted);font-size:.68rem;padding:16px 0;">
      Keine ${was} Einsätze${wer} in dieser Tour.</div>`;
    _updateApplyButton(0);
    return;
  }

  let html = '';
  for (const p of people) {
    const noMail = p.email ? '' : ` <span style="color:var(--warn);">(keine E-Mail — wird nicht benachrichtigt)</span>`;
    html += `<div style="margin:14px 0 4px;display:flex;align-items:center;gap:6px;border-bottom:1px solid var(--accent-wash-2);padding-bottom:3px;">
      <span style="color:var(--accent);font-size:.72rem;letter-spacing:1px;flex:1;">${esc(p.name)}${noMail}</span>
      <button data-crew="${esc(p.name)}" data-val="1" onclick="_bulkStatusGrpSel(this)" style="${_BTN}">alle</button>
      <button data-crew="${esc(p.name)}" data-val="0" onclick="_bulkStatusGrpSel(this)" style="${_BTN}">keine</button>
    </div>`;
    for (const b of p.blocks) {
      html += `<div style="display:flex;align-items:center;gap:6px;margin:6px 0 2px;">
        <span style="color:var(--ink-2);font-size:.64rem;flex:1;">▣ ${esc(b.label)} · ${b.slots.length} Tag(e)</span>
        <button data-crew="${esc(p.name)}" data-block="${esc(b.bid)}" data-val="1" onclick="_bulkStatusGrpSel(this)" style="${_BTN}">alle</button>
        <button data-crew="${esc(p.name)}" data-block="${esc(b.bid)}" data-val="0" onclick="_bulkStatusGrpSel(this)" style="${_BTN}">keine</button>
      </div>`;
      for (const s of b.slots) {
        const k = _key(p.name, s.date, s.posId);
        html += `<div style="display:flex;align-items:center;gap:8px;padding:2px 0 2px 14px;border-bottom:1px solid var(--rule);font-size:.64rem;color:var(--ink-2);">
          <input type="checkbox" data-key="${esc(k)}" ${_sel.has(k) ? 'checked' : ''}
            onchange="_bulkStatusToggle(this)"
            style="width:14px;height:14px;accent-color:var(--accent);flex-shrink:0;cursor:pointer;">
          <span style="flex:1;">${esc(s.date)} · ${esc(s.posLabel)}</span>
        </div>`;
      }
    }
  }
  body.innerHTML = html;
  _updateApplyButton(_sel.size);

  const lbl = document.getElementById('bulkStatusMode');
  if (lbl) lbl.textContent = m.label;
}

function _updateApplyButton(n) {
  const btn = document.getElementById('btnBulkStatusApply');
  if (!btn) return;
  btn.textContent = (_mode === 'pencil' ? `✎ ${n} VORMERKEN` : `✓ ${n} BESTÄTIGEN`) + ' →';
  btn.disabled = n === 0;
  btn.style.opacity = n === 0 ? '.45' : '1';
}

// ── Auswahl-Helfer (window-registriert, von den Knöpfen im Markup gerufen) ─────
export function _bulkStatusToggle(cb) {
  const k = cb.dataset.key;
  if (cb.checked) _sel.add(k); else _sel.delete(k);
  _updateApplyButton(_sel.size);
}

export function _bulkStatusGrpSel(btn) {
  const crewName = btn.dataset.crew;
  const block = btn.dataset.block;               // undefined = ganze Person
  const on = btn.dataset.val === '1';
  const { people } = _collect();
  const p = people.find(x => x.name === crewName); if (!p) return;
  for (const b of p.blocks) {
    if (block !== undefined && b.bid !== block) continue;
    for (const s of b.slots) {
      const k = _key(crewName, s.date, s.posId);
      if (on) _sel.add(k); else _sel.delete(k);
    }
  }
  _render();
}

export function _bulkStatusSelectAll(on) {
  const { people } = _collect();
  _sel = new Set();
  if (on) for (const p of people) for (const b of p.blocks) for (const s of b.slots) _sel.add(_key(p.name, s.date, s.posId));
  _render();
}

export function _bulkStatusSetMode(mode) {
  if (!MODES[mode]) return;
  _mode = mode;
  _sel = new Set();                 // Quellstatus wechselt → alte Auswahl ist gegenstandslos
  document.querySelectorAll('[data-bsmode]').forEach(el => {
    const active = el.dataset.bsmode === mode;
    el.style.background = active ? 'var(--accent)' : 'var(--panel2)';
    el.style.color      = active ? 'var(--on-accent)' : 'var(--muted)';
  });
  _render();
}

// ── Öffnen / Schließen ────────────────────────────────────────────────────────
// prefillCrew: über das Zellen-Menü übergeben → Dialog zeigt nur diese Person.
export function openBulkStatusModal(prefillCrew) {
  if (!IS_MANAGER) return;
  _onlyCrew = prefillCrew || null;
  _sel = new Set();
  const hint = document.getElementById('bulkStatusHint');
  if (hint) hint.textContent = _onlyCrew ? `Nur ${_onlyCrew}` : 'Alle Personen dieser Tour';
  _bulkStatusSetMode('pencil');     // rendert mit
  openModal('bulkStatusModal');
}

export function closeBulkStatusModal() { closeModal('bulkStatusModal'); }

// ── Anwenden ──────────────────────────────────────────────────────────────────
export async function applyBulkStatus() {
  const n = _sel.size;
  if (!n) return;
  const { to } = MODES[_mode];
  const targets = [];
  for (const k of _sel) {
    const [name, date, posId] = k.split('|');
    targets.push({ name, date, posId });
  }

  showToast(`${n} Einsätze werden umgestellt…`, '#e8c84a');
  let done = 0;
  try {
    for (const t of targets) {
      const email = crewMeta[t.name]?.email || '';
      if (to === 'pencilled') await pencilInAssignment(t.date, t.posId, t.name, email);
      else                    await confirmAssignment(t.date, t.posId);
      // Benachrichtigung nur vormerken — versendet wird erst per „Updates senden".
      const posLabel = POSITIONS.find(p => p.id === t.posId)?.label || t.posId;
      _queueStatusSlot(t.name, email, t.date, t.posId, posLabel, to);
      done++;
    }
    showToast(`${done} Einsätze ${to === 'pencilled' ? 'vorgemerkt ✎' : 'bestätigt ✓'}`,
              to === 'pencilled' ? '#7A5FB3' : '#4ae8a0');
  } catch (err) {
    // Teilerfolg ist möglich — deshalb Resync statt optimistischem Weiterlaufen.
    showToast(`Fehler nach ${done} von ${n}: ${err.message}`, '#e84a4a');
    await loadAssignmentStatuses();
  }
  closeBulkStatusModal();
  renderTable();
}
