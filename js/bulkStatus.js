// ── Dialog „Status ändern" (v0.9.0) ──────────────────────────────────────────
// Ablauf: oben die AKTION wählen → Personen/Blöcke/Tage anhaken → AUSFÜHREN.
//
// Vorgeschichte, damit niemand zurückbaut: Bis v0.8.6 gab es zwei feste Modi
// („bestätigt → vorgemerkt" und zurück), und die Modus-Knöpfe setzten beim Klick die
// Auswahl zurück. Zwei Fehler daraus, beide von Marco gemeldet:
//   · Ein Klick auf den zweiten Modus sammelte nichts (es war noch nichts vorgemerkt) —
//     der Knopf stand auf 0 und tat beim Klicken nichts, ohne jeden Hinweis.
//   · Ein erneuter Klick auf den aktiven Modus verwarf die getroffene Auswahl und hakte
//     stillschweigend alles Offene an; das nächste AUSFÜHREN traf dann die ganze Tour.
// Beide sind mit dem Prüfstand tools/dialog-harness.mjs nachgestellt — er fährt echte
// Klicks im echten DOM. Reine Markup-Vergleiche (tests/bulkstatus.test.mjs) sahen sie nicht.
//
// Auswahl-Muster (alle/keine je Block und je Person, globales ALLE/KEINE) bewusst
// identisch zum Update-Queue-Modal in userView.js — der Manager kennt es von dort.
// Es wird NICHTS persistiert: eine Einmal-Aktion, die Auswahl lebt nur im offenen Dialog.
import { TOUR_DATES, POSITIONS, assignmentStatuses, crewMeta, IS_MANAGER, OFFEN } from './state.js';
import { esc, showToast, getVal } from './utils.js';
import { pencilInAssignment, confirmAssignment, loadAssignmentStatuses,
         proposeAssignmentBulk, removeAssignmentSlot } from './dataService.js';
import { renderTable } from './render.js';
import { openModal, closeModal } from './modals.js';
import { _queueStatusSlot, _queueRemovedSlot, _dateBlockId } from './userView.js';

// Die vier Aktionen.
//   ueberspringen  → dieser Slot steht bei der Aktion nicht zur Auswahl (nichts zu tun)
//   brauchtMail    → ohne hinterlegte Adresse nicht auswählbar (der Hook steigt still aus)
//   melden         → wann ein Eintrag in die Update-Queue gehört:
//                    'nie' | 'immer' | 'wenn-kommuniziert' (vorher proposed/confirmed/declined)
const AKTIONEN = {
  pencil: {
    label: '✎ VORMERKEN', titel: 'vorläufig vormerken', knopf: '✎ %n VORMERKEN',
    ueberspringen: (s) => s === 'pencilled',
    melden: 'wenn-kommuniziert',
  },
  confirm: {
    label: '✓ BESTÄTIGEN', titel: 'bestätigen', knopf: '✓ %n BESTÄTIGEN',
    ueberspringen: (s) => s === 'confirmed',
    melden: 'wenn-kommuniziert',
  },
  request: {
    label: '⏳ ANFRAGEN', titel: 'anfragen', knopf: '⏳ %n ANFRAGEN',
    ueberspringen: (s) => s === 'proposed',
    brauchtMail: true,
    melden: 'immer',
  },
  remove: {
    label: '✕ AUFHEBEN', titel: 'Besetzung aufheben', knopf: '✕ %n AUFHEBEN',
    ueberspringen: () => false,
    melden: 'wenn-kommuniziert',
  },
};

// Zustand eines Einsatzes für Anzeige und Vorauswahl. `null` = geplant, aber nie kommuniziert.
const ZUSTAND = {
  null:      { zeichen: '·', farbe: 'var(--muted)', titel: 'geplant, noch nicht angefragt' },
  proposed:  { zeichen: '⏳', farbe: 'var(--accent)', titel: 'angefragt, Antwort steht aus' },
  confirmed: { zeichen: '✓', farbe: 'var(--show)',   titel: 'bestätigt' },
  declined:  { zeichen: '✗', farbe: 'var(--warn)',   titel: 'abgelehnt' },
};
const _zustand = (s) => ZUSTAND[s == null ? 'null' : s] || ZUSTAND.null;

let _mode = 'pencil';          // Schlüssel in AKTIONEN
let _sel = new Set();          // ausgewählte Slots als 'name|date|posId'
let _onlyCrew = null;          // gesetzt beim Einstieg übers Zellen-Menü

const _key = (name, date, posId) => `${name}|${date}|${posId}`;

// Alle Slots einsammeln, die für die aktuelle Aktion in Frage kommen — gruppiert
// Person → Block → Tag. Rückgabe: { people: [{name, email, blocks:[{bid,label,slots}]}], total }
function _collect() {
  const akt = AKTIONEN[_mode];
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
      const status = si?.status ?? null;

      // Die Besetzung kommt aus getVal (schließt defaultCrew ein), NICHT aus
      // assignmentStatuses — sonst fehlten genau die frisch geplanten Zellen ohne Record.
      // Dieselbe Sicht benutzt crewNotify.js; beide Wege sehen so dieselben Slots.
      const name = getVal(r.date, p.id);
      if (!name || name === OFFEN) return;
      if (akt.ueberspringen(status)) return;      // schon im Zielzustand → nichts zu tun
      if (akt.brauchtMail && !crewMeta[name]?.email) return;

      if (_onlyCrew && name !== _onlyCrew) return;
      (byName[name] = byName[name] || {})[_dateBlockId(r.date)] =
        (byName[name][_dateBlockId(r.date)] || []);
      byName[name][_dateBlockId(r.date)].push({
        date: r.date, posId: p.id, posLabel: p.label || p.id, status,
      });
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
  const akt = AKTIONEN[_mode];

  if (!total) {
    // Sagen, WARUM nichts dasteht. Vorher stand hier „Keine vorgemerkten Einsätze" — der
    // Manager las das als „Dialog kaputt", weil der Knopf trotzdem klickbar aussah.
    const wer = _onlyCrew ? ' für ' + esc(_onlyCrew) : '';
    const grund = akt.brauchtMail
      ? ' Möglich ist auch, dass die Adressen fehlen — ohne E-Mail lässt sich niemand anfragen.'
      : '';
    body.innerHTML = `<div style="color:var(--muted);font-size:.68rem;padding:16px 0;line-height:1.6;">
      Kein Einsatz${wer}, den man ${esc(akt.titel)} könnte — alles ist schon in diesem Zustand.${grund}</div>`;
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
        // Das Zustandszeichen ist nicht schmückend, sondern die Sicherung: Ein grauer
        // Einsatz ist harmlos, ein grüner nicht — dort hat jemand fest zugesagt und erfährt
        // von der Rücknahme nichts (es geht keine Mail raus).
        const z = _zustand(s.status);
        html += `<div style="display:flex;align-items:center;gap:8px;padding:2px 0 2px 14px;border-bottom:1px solid var(--rule);font-size:.64rem;color:var(--ink-2);">
          <input type="checkbox" data-key="${esc(k)}" ${_sel.has(k) ? 'checked' : ''}
            onchange="_bulkStatusToggle(this)"
            style="width:14px;height:14px;accent-color:var(--accent);flex-shrink:0;cursor:pointer;">
          <span title="${esc(z.titel)}" style="color:${z.farbe};width:12px;flex-shrink:0;text-align:center;">${z.zeichen}</span>
          <span style="flex:1;">${esc(s.date)} · ${esc(s.posLabel)}</span>
        </div>`;
      }
    }
  }
  body.innerHTML = html;
  _updateApplyButton(_sel.size);

  const lbl = document.getElementById('bulkStatusMode');
  if (lbl) lbl.textContent = `${total} Einsatz/Einsätze zur Auswahl · Aktion: ${akt.titel}`;
}

// ⚠️ Der Knopf trägt IMMER die Zahl der Auswahl. Ein Knopf, der eine Zahl zeigt, aber nichts
// tut, hat den Manager glauben lassen, der Dialog hänge (v0.8.6).
function _updateApplyButton(n) {
  const btn = document.getElementById('btnBulkStatusApply');
  if (!btn) return;
  btn.textContent = AKTIONEN[_mode].knopf.replace('%n', String(n)) + ' →';
  btn.disabled = n === 0;
  btn.style.opacity = n === 0 ? '.45' : '1';
}

// „nur offene" — hakt gezielt die Einsätze ohne Status an.
//
// Ersetzt die automatische Vorauswahl aus v0.8.6. Die war der falsche Standard: Wer den Dialog
// öffnete, hatte ungefragt die halbe Tour angehakt, und ein Klick auf AUSFÜHREN traf alles.
// In einem Dialog, der Zusagen zurücknehmen kann, soll man sagen was man will — nicht
// widerrufen, was man nicht will.
export function _bulkStatusSelectOpen() {
  _sel = new Set();
  const { people } = _collect();
  for (const p of people)
    for (const b of p.blocks)
      for (const s of b.slots)
        if (s.status == null) _sel.add(_key(p.name, s.date, s.posId));
  _render();
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

// Aktion wechseln. Die Menge auswählbarer Slots ändert sich dabei, deshalb wird die Auswahl
// verworfen — aber NICHT stillschweigend: Genau das hat den Manager Arbeit gekostet, als ein
// erneuter Klick auf den aktiven Modus-Knopf seine Auswahl verwarf und er es nicht merkte.
// Ein Klick auf die bereits aktive Aktion tut deshalb gar nichts.
export function _bulkStatusSetMode(mode) {
  if (!AKTIONEN[mode]) return;
  if (mode === _mode && _sel.size) return;    // schon aktiv → Auswahl nicht wegwerfen
  const hatteAuswahl = _sel.size;
  _mode = mode;
  _sel = new Set();
  document.querySelectorAll('[data-bsmode]').forEach(el => {
    const active = el.dataset.bsmode === mode;
    el.style.background = active ? 'var(--accent)' : 'var(--panel2)';
    el.style.color      = active ? 'var(--on-accent)' : 'var(--muted)';
  });
  _render();
  if (hatteAuswahl) showToast('Aktion gewechselt — Auswahl zurückgesetzt', '#e8c84a');
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
const FERTIG = {
  pencil:  { text: 'vorgemerkt ✎',        farbe: '#7A5FB3' },
  confirm: { text: 'bestätigt ✓',         farbe: '#4ae8a0' },
  request: { text: 'angefragt ⏳ — Mail geht über „Updates senden" raus', farbe: '#e8c84a' },
  remove:  { text: 'aufgehoben ✕',        farbe: '#4ae8a0' },
};

export async function applyBulkStatus() {
  const n = _sel.size;
  // ⚠️ NICHT stumm zurückkehren. Genau das ließ den Dialog „hängen" aussehen (v0.8.6):
  // Klick auf den Knopf, nichts passiert, keine Erklärung.
  if (!n) { showToast('Nichts ausgewählt', '#5a6070'); return; }

  const akt = AKTIONEN[_mode];
  // Zustand VOR der Änderung mitnehmen — danach ist er überschrieben, und er entscheidet,
  // ob die Person überhaupt etwas zu erfahren hat (siehe unten).
  const targets = [];
  for (const k of _sel) {
    const [name, date, posId] = k.split('|');
    targets.push({ name, date, posId, vorher: (assignmentStatuses[date] || {})[posId]?.status ?? null });
  }

  showToast(`${n} Einsätze werden geändert…`, '#e8c84a');
  let done = 0;
  try {
    for (const t of targets) {
      const email = crewMeta[t.name]?.email || '';
      const posLabel = POSITIONS.find(p => p.id === t.posId)?.label || t.posId;

      if (_mode === 'remove') {
        const { wasActive, rec } = await removeAssignmentSlot(t.date, t.posId);
        // Die Person war schon benachrichtigt → sie muss erfahren, dass der Tag entfällt.
        // Das Einreihen macht der Aufrufer, nicht dataService (sonst Import-Zyklus).
        if (wasActive && rec) _queueRemovedSlot(t.name, email, t.date, t.posId, posLabel, rec.id);
      } else {
        if      (_mode === 'pencil')  await pencilInAssignment(t.date, t.posId, t.name, email);
        else if (_mode === 'confirm') await confirmAssignment(t.date, t.posId);
        else                          await proposeAssignmentBulk(t.date, t.posId, t.name, email);

        // Benachrichtigung nur vormerken — versendet wird erst per „Updates senden".
        //
        // ⚠️ Bei 'wenn-kommuniziert' NUR, wenn vorher überhaupt etwas rausgegangen war. Ein
        // Einsatz ohne Status kennt die Person nicht; sie bekäme eine Meldung über die
        // Änderung an etwas, von dem sie nie wusste. Der Einzelklick im Zellen-Menü reiht
        // dort ebenfalls nichts ein — beide Wege verhalten sich gleich.
        // Bei 'immer' (Anfragen) ist der Eintrag der ganze Zweck: Er trägt die gebündelte
        // Anfrage-Mail, weil der Hook wegen proposed_by='bulk' keine Einzelmail schickt.
        const melden = akt.melden === 'immer' || (akt.melden === 'wenn-kommuniziert' && t.vorher != null);
        if (melden) _queueStatusSlot(t.name, email, t.date, t.posId, posLabel,
                                     _mode === 'request' ? 'proposed' : (_mode === 'pencil' ? 'pencilled' : 'confirmed'));
      }
      done++;
    }
    showToast(`${done} Einsätze ${FERTIG[_mode].text}`, FERTIG[_mode].farbe);
  } catch (err) {
    // Teilerfolg ist möglich — deshalb Resync statt optimistischem Weiterlaufen.
    showToast(`Fehler nach ${done} von ${n}: ${err.message}`, '#e84a4a');
    try { await loadAssignmentStatuses(); } catch (_) { /* Resync darf den Abschluss nicht kippen */ }
  } finally {
    // ⚠️ Der Abschluss gehört in `finally`, und das Neuzeichnen in ein EIGENES try.
    //
    // Vorher standen beide ungeschützt hintereinander: Warf das Schließen, lief das
    // Neuzeichnen nie — und warf irgendetwas dahinter, blieb der Dialog stehen, obwohl die
    // Arbeit erledigt war. Gemeldet zu v0.9.0: Erfolgsmeldung kam, Dialog ging nicht zu,
    // Tabelle blieb alt; nach einem Neuladen war alles korrekt gespeichert.
    // Ein Dialog, den man nach getaner Arbeit nur noch per „Abbrechen" loswird, ist kaputt —
    // egal, was ihn festhält.
    try { closeBulkStatusModal(); } catch (e) { console.error('closeBulkStatusModal:', e); }
    try {
      renderTable();
    } catch (e) {
      console.error('renderTable nach applyBulkStatus:', e);
      // Nicht verschlucken: Die Daten stimmen, nur die Ansicht nicht. Wer das nicht erfährt,
      // hält die Änderung für verloren und macht sie ein zweites Mal.
      showToast('Gespeichert — die Ansicht konnte nicht aktualisiert werden. Bitte neu laden.', '#e8c84a');
    }
  }
}
