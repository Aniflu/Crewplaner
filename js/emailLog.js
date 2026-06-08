// ── E-Mail-Log Tab (nur Admin) ───────────────────────────────────────────────
const EMAIL_TYPE_LABELS = {
  invite:       '📧 Einladung',
  reminder:     '🔔 Erinnerung',
  cancellation: '✕ Absage',
  update:       '↻ Update',
  love_invite:  '♥ Partner-Einladung',
  staff_invite: '👤 Staff-Einladung',
};

async function renderEmailLog() {
  const container = document.getElementById('emailLogBody');
  if (!container) return;
  if (!_wrkPbPlanId) {
    container.innerHTML = '<p style="font-size:.65rem;color:#5a6070;">Bitte zuerst einen Plan auswählen.</p>';
    return;
  }
  container.innerHTML = '<p style="font-size:.65rem;color:#5a6070;">Lädt…</p>';
  try {
    const res = await pbList('email_log', 'plan_id="' + _wrkPbPlanId + '"', '-sent_at', 200);
    const records = res?.items || [];
    if (!records.length) {
      container.innerHTML = '<p style="font-size:.65rem;color:#5a6070;">Noch keine E-Mails für diesen Plan.</p>';
      return;
    }
    const rows = records.map(function(rec) {
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
        '<td style="color:#c8cdd5;">' + label + '</td>' +
        '<td>' + status + '</td>' +
        '</tr>';
    }).join('');
    container.innerHTML =
      '<table class="data-table" style="width:100%;">' +
      '<thead><tr>' +
      '<th>Datum</th><th>Crew</th><th>Typ</th><th>Status</th>' +
      '</tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
      '</table>';
  } catch (err) {
    container.innerHTML = '<p style="font-size:.65rem;color:#e84a4a;">Fehler: ' + esc(err.message || String(err)) + '</p>';
  }
}
