// ── E-Mail-Log Tab (Admin) ────────────────────────────────────────────────────
// Client-Side Filtering: Lade 1x, filtere instant
import { SUPABASE_ENABLED } from './config.js';
import { pbList } from './pb.js';
import { esc } from './utils.js';

const EMAIL_TYPE_LABELS = {
  invite:       '📧 Einladung',
  reminder:     '🔔 Erinnerung',
  cancellation: '✕ Absage',
  update:       '↻ Update',
  love_invite:  '♥ Partner-Einladung',
  staff_invite: '👤 Staff-Einladung',
};

let _emailLogRecords = [];
let _emailLogStatus = 'all';
let _emailLogActiveDate = 'all';

export async function renderEmailLog() {
  const container = document.getElementById('emailLogBody');
  if (!container) return;
  if (!_wrkPbPlanId) {
    container.innerHTML = '<p style="font-size:.65rem;color:#5a6070;">Bitte zuerst einen Plan auswählen.</p>';
    document.getElementById('emailLogFilters').innerHTML = '';
    return;
  }
  container.innerHTML = '<p style="font-size:.65rem;color:#5a6070;">Lädt…</p>';
  try {
    const res = await pbList('email_log', 'plan_id="' + _wrkPbPlanId + '"', '-sent_at', 500);
    _emailLogRecords = res?.items || [];
    if (!_emailLogRecords.length) {
      document.getElementById('emailLogFilters').innerHTML = '';
      container.innerHTML = '<p style="font-size:.65rem;color:#5a6070;">Noch keine E-Mails für diesen Plan.</p>';
      return;
    }
    _renderEmailLogFilters();
    _applyEmailLogFilters();
  } catch (err) {
    document.getElementById('emailLogFilters').innerHTML = '';
    container.innerHTML = '<p style="font-size:.65rem;color:#e84a4a;">Fehler: ' + esc(err.message || String(err)) + '</p>';
  }
}

function _renderEmailLogFilters() {
  const filtersDiv = document.getElementById('emailLogFilters');
  filtersDiv.innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px;">
      <input id="elSearch" type="text" placeholder="🔍 Crew oder E-Mail…"
        oninput="_applyEmailLogFilters()"
        style="background:#12121f;border:1px solid #2a2a40;border-radius:3px;padding:5px 8px;font-family:'IBM Plex Mono',monospace;font-size:.65rem;color:#c8cdd5;flex:1;min-width:150px;">

      <select id="elType" onchange="_applyEmailLogFilters()"
        style="background:#12121f;border:1px solid #2a2a40;border-radius:3px;padding:5px 8px;font-family:'IBM Plex Mono',monospace;font-size:.65rem;color:#c8cdd5;">
        <option value="">Alle Typen</option>
        <option value="invite">📧 Einladung</option>
        <option value="reminder">🔔 Erinnerung</option>
        <option value="cancellation">✕ Absage</option>
        <option value="update">↻ Update</option>
        <option value="love_invite">♥ Partner</option>
        <option value="staff_invite">👤 Staff</option>
      </select>

      <button id="elStatusAll"  class="btn btn-sm" style="background:rgba(232,200,74,.15);border:1px solid rgba(232,200,74,.4);color:#e8c84a;" onclick="_setEmailLogStatus('all')">Alle</button>
      <button id="elStatusOk"   class="btn btn-sm" onclick="_setEmailLogStatus('ok')">✅ Erfolg</button>
      <button id="elStatusFail" class="btn btn-sm" onclick="_setEmailLogStatus('fail')">❌ Fehler</button>
    </div>

    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px;">
      <button id="elDate24h" class="btn btn-sm" onclick="_setEmailLogDate('24h')">24h</button>
      <button id="elDate7d"  class="btn btn-sm" onclick="_setEmailLogDate('7d')">7 Tage</button>
      <button id="elDate30d" class="btn btn-sm" onclick="_setEmailLogDate('30d')">30 Tage</button>
      <button id="elDateAll" class="btn btn-sm" style="background:rgba(232,200,74,.15);border:1px solid rgba(232,200,74,.4);color:#e8c84a;" onclick="_setEmailLogDate('all')">Alle</button>

      <span style="color:#5a6070;font-size:.6rem;margin-left:12px;">Von:</span>
      <input type="date" id="elDateFrom" onchange="_applyEmailLogFilters()"
        style="background:#12121f;border:1px solid #2a2a40;border-radius:3px;padding:5px 4px;font-family:'IBM Plex Mono',monospace;font-size:.65rem;color:#c8cdd5;">

      <span style="color:#5a6070;font-size:.6rem;">Bis:</span>
      <input type="date" id="elDateTo" onchange="_applyEmailLogFilters()"
        style="background:#12121f;border:1px solid #2a2a40;border-radius:3px;padding:5px 4px;font-family:'IBM Plex Mono',monospace;font-size:.65rem;color:#c8cdd5;">

      <span id="elCount" style="margin-left:auto;font-size:.6rem;color:#5a6070;"></span>
    </div>
  `;
  _updateDateButtonStates();
}

function _applyEmailLogFilters() {
  const search  = (document.getElementById('elSearch')?.value || '').toLowerCase();
  const type    = document.getElementById('elType')?.value || '';
  const status  = _emailLogStatus;
  const dateFrom = document.getElementById('elDateFrom')?.value;
  const dateTo   = document.getElementById('elDateTo')?.value;

  const filtered = _emailLogRecords.filter(rec => {
    if (search && !rec.crew_name.toLowerCase().includes(search)
                && !rec.crew_email.toLowerCase().includes(search)) return false;
    if (type && rec.email_type !== type) return false;
    if (status === 'ok'   && rec.success !== 'true')  return false;
    if (status === 'fail' && rec.success === 'true')  return false;
    if (dateFrom && rec.sent_at.substring(0, 10) < dateFrom) return false;
    if (dateTo   && rec.sent_at.substring(0, 10) > dateTo)   return false;
    return true;
  });

  document.getElementById('elCount').textContent = `${filtered.length} von ${_emailLogRecords.length} Einträgen`;
  _renderEmailLogTable(filtered);
}

function _renderEmailLogTable(records) {
  const container = document.getElementById('emailLogBody');
  if (!records.length) {
    container.innerHTML = '<p style="font-size:.65rem;color:#5a6070;">Keine Ergebnisse für diese Filter.</p>';
    return;
  }
  const rows = records.map(rec => {
    const d = new Date(rec.sent_at);
    const dateStr = d.getDate().toString().padStart(2,'0') + '.' +
      (d.getMonth()+1).toString().padStart(2,'0') + '. ' +
      d.getHours().toString().padStart(2,'0') + ':' +
      d.getMinutes().toString().padStart(2,'0');
    const label = EMAIL_TYPE_LABELS[rec.email_type] || rec.email_type;
    const status = rec.success === 'true'
      ? '<span style="color:#4ae8a0;">✅</span>'
      : '<span style="color:#e84a4a;">❌</span>';
    return '<tr>' +
      '<td style="color:#c8cdd5;">' + dateStr + '</td>' +
      '<td style="color:#c8cdd5;">' + esc(rec.crew_name) + '</td>' +
      '<td style="color:#c8cdd5;font-size:.65rem;">' + esc(rec.crew_email) + '</td>' +
      '<td style="color:#c8cdd5;">' + label + '</td>' +
      '<td>' + status + '</td>' +
      '</tr>';
  }).join('');
  container.innerHTML =
    '<table class="data-table" style="width:100%;">' +
    '<thead><tr>' +
    '<th>Datum</th><th>Crew</th><th>E-Mail</th><th>Typ</th><th>Status</th>' +
    '</tr></thead>' +
    '<tbody>' + rows + '</tbody>' +
    '</table>';
}

function _setEmailLogDate(range) {
  const now = new Date();
  const today = now.toISOString().substring(0, 10);
  let dateFrom = '';

  if (range === '24h') {
    const yesterday = new Date(now.getTime() - 24*60*60*1000).toISOString().substring(0, 10);
    dateFrom = yesterday;
  } else if (range === '7d') {
    const sevenDaysAgo = new Date(now.getTime() - 7*24*60*60*1000).toISOString().substring(0, 10);
    dateFrom = sevenDaysAgo;
  } else if (range === '30d') {
    const thirtyDaysAgo = new Date(now.getTime() - 30*24*60*60*1000).toISOString().substring(0, 10);
    dateFrom = thirtyDaysAgo;
  }

  _emailLogActiveDate = range;
  document.getElementById('elDateFrom').value = dateFrom;
  document.getElementById('elDateTo').value = today;
  _updateDateButtonStates();
  _applyEmailLogFilters();
}

function _setEmailLogStatus(val) {
  _emailLogStatus = val;
  document.getElementById('elStatusAll').style.background = val === 'all'
    ? 'rgba(232,200,74,.15)' : 'transparent';
  document.getElementById('elStatusAll').style.borderColor = val === 'all'
    ? 'rgba(232,200,74,.4)' : '#2a2a40';
  document.getElementById('elStatusAll').style.color = val === 'all' ? '#e8c84a' : '#c8cdd5';

  document.getElementById('elStatusOk').style.background = val === 'ok'
    ? 'rgba(232,200,74,.15)' : 'transparent';
  document.getElementById('elStatusOk').style.borderColor = val === 'ok'
    ? 'rgba(232,200,74,.4)' : '#2a2a40';
  document.getElementById('elStatusOk').style.color = val === 'ok' ? '#e8c84a' : '#c8cdd5';

  document.getElementById('elStatusFail').style.background = val === 'fail'
    ? 'rgba(232,200,74,.15)' : 'transparent';
  document.getElementById('elStatusFail').style.borderColor = val === 'fail'
    ? 'rgba(232,200,74,.4)' : '#2a2a40';
  document.getElementById('elStatusFail').style.color = val === 'fail' ? '#e8c84a' : '#c8cdd5';

  _applyEmailLogFilters();
}

function _updateDateButtonStates() {
  const btns = ['24h', '7d', '30d', 'all'];
  btns.forEach(btn => {
    const el = document.getElementById('elDate' + btn.replace('d', 'd').replace('h', 'h'));
    if (el) {
      const isActive = _emailLogActiveDate === btn;
      el.style.background = isActive ? 'rgba(232,200,74,.15)' : 'transparent';
      el.style.borderColor = isActive ? 'rgba(232,200,74,.4)' : '#2a2a40';
      el.style.color = isActive ? '#e8c84a' : '#c8cdd5';
    }
  });
}
