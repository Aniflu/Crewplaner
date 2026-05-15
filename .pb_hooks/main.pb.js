// ── NYX LIGHTWORK · Crewplaner E-Mail-Hook ──────────────────────────────────────
// PocketBase Goja JS Hook · Resend HTTP API (kein SMTP)

const RESEND_API_KEY = 're_75ZvXHSz_2eCzUVHziYm6mj3sJwzavv2s';
const FROM_EMAIL     = 'Tour Crew Plan <noreply@crewplanner.nyxlightwork.de>';
const ADMIN_EMAIL    = 'madmaxmail@web.de';
const APP_URL        = 'https://crewplanner.nyxlightwork.de';

// ── E-Mail senden via Resend REST API ─────────────────────────────────────────
function sendMail(to, subject, html) {
  try {
    const res = $http.send({
      url:    'https://api.resend.com/emails',
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + RESEND_API_KEY,
        'Content-Type':  'application/json'
      },
      body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html })
    });
    if (res.statusCode >= 400) {
      console.error('[mail] Resend Fehler ' + res.statusCode + ':', res.raw);
    } else {
      console.log('[mail] Gesendet an ' + to + ' · ' + subject);
    }
  } catch (e) {
    console.error('[mail] sendMail Fehler:', e.message);
  }
}

// ── HTML-Template (nyx lightwork dark style) ──────────────────────────────────
function tpl(content) {
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Tour Crew Plan</title>
</head>
<body style="margin:0;padding:0;background:#0d0d1a;font-family:'Courier New',Courier,monospace;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d1a;padding:48px 20px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

  <!-- HEADER -->
  <tr><td style="padding-bottom:28px;border-bottom:1px solid #e8c84a;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font-size:10px;letter-spacing:4px;color:#e8c84a;text-transform:uppercase;">nyx lightwork</td>
      <td align="right" style="font-size:10px;color:#2a2a4a;letter-spacing:2px;">TOUR / CREW</td>
    </tr></table>
  </td></tr>

  <!-- CONTENT -->
  <tr><td style="padding:36px 0;">
    ${content}
  </td></tr>

  <!-- FOOTER -->
  <tr><td style="padding-top:24px;border-top:1px solid #1a1a32;">
    <p style="font-size:9px;color:#2a2a4a;letter-spacing:2px;margin:0;text-transform:uppercase;">
      Tour Crew Plan &nbsp;·&nbsp; Nyx Lightwork &nbsp;·&nbsp; ${APP_URL}
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

function btn(url, label, gold) {
  const bg    = gold ? '#e8c84a' : '#1a1a32';
  const color = gold ? '#0d0d1a' : '#8080a0';
  const brd   = gold ? '' : 'border:1px solid #2a2a4a;';
  return `<table cellpadding="0" cellspacing="0" style="margin:32px 0;">
  <tr><td style="background:${bg};${brd}border-radius:2px;">
    <a href="${url}" style="display:block;padding:13px 28px;font-family:'Courier New',Courier,monospace;font-size:11px;font-weight:bold;color:${color};text-decoration:none;letter-spacing:3px;">${label}</a>
  </td></tr>
</table>`;
}

function infoRow(label, value, accent) {
  const c = accent || '#ffffff';
  return `<tr>
    <td style="padding:11px 16px;font-size:9px;color:#4a4a6a;letter-spacing:2px;border-bottom:1px solid #1a1a32;white-space:nowrap;">${label}</td>
    <td style="padding:11px 16px;font-size:13px;color:${c};border-bottom:1px solid #1a1a32;">${value}</td>
  </tr>`;
}

function infoTable(rows) {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border:1px solid #1a1a32;border-radius:2px;">
    ${rows}
  </table>`;
}

function fmtDate(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.getDate().toString().padStart(2,'0') + '.' +
         (d.getMonth()+1).toString().padStart(2,'0') + '.' +
         d.getFullYear();
}

// ── 1. Crew-Einladung & Erinnerung (crew_invites) ─────────────────────────────
onRecordAfterCreateSuccess((e) => {
  const r        = e.record;
  const name     = r.get('crew_name');
  const email    = r.get('crew_email');
  const type     = r.get('type');
  const plan     = r.get('plan_name') || 'Tour Plan';
  const appUrl   = r.get('app_url')   || APP_URL;

  if (type === 'invite') {
    const subject = 'CREW INVITE · ' + plan;
    const html = tpl(`
      <h1 style="font-size:40px;font-weight:bold;color:#ffffff;margin:0 0 6px 0;letter-spacing:-1px;">Du bist dabei.</h1>
      <p style="font-size:10px;color:#4a4a6a;letter-spacing:3px;margin:0 0 32px 0;">CREW INVITE · ${plan.toUpperCase()}</p>
      <p style="font-size:13px;color:#9090b0;line-height:1.8;margin:0;">
        Hey ${name},<br><br>
        du wurdest für <strong style="color:#e8c84a;">${plan}</strong> eingeladen.<br>
        Logge dich ein und bestätige oder lehne deine Einsätze ab.
      </p>
      ${btn(appUrl, 'EINSÄTZE BESTÄTIGEN →', true)}
    `);
    sendMail(email, subject, html);

  } else if (type === 'reminder') {
    const subject = 'REMINDER · ' + plan;
    const html = tpl(`
      <h1 style="font-size:40px;font-weight:bold;color:#ffffff;margin:0 0 6px 0;letter-spacing:-1px;">Noch ausstehend.</h1>
      <p style="font-size:10px;color:#4a4a6a;letter-spacing:3px;margin:0 0 32px 0;">REMINDER · ${plan.toUpperCase()}</p>
      <p style="font-size:13px;color:#9090b0;line-height:1.8;margin:0;">
        Hey ${name},<br><br>
        es gibt noch offene Anfragen für <strong style="color:#e8c84a;">${plan}</strong>.<br>
        Bitte bestätige oder lehne deine Einsätze ab.
      </p>
      ${btn(appUrl, 'JETZT BESTÄTIGEN →', true)}
    `);
    sendMail(email, subject, html);
  }

  // Temporären invite-Record löschen
  try { $app.dao().deleteRecord(r); } catch (_) {}

}, 'crew_invites');

// ── 2. Anfrage an Crew-Mitglied (assignment proposed) ─────────────────────────
onRecordAfterCreateSuccess((e) => {
  const r = e.record;
  if (r.get('status') !== 'proposed') return;

  const crewEmail = r.get('crew_email');
  const crewName  = r.get('crew_name');
  const posLabel  = r.get('pos_label') || r.get('pos_id');
  const date      = r.get('date');

  if (!crewEmail) {
    console.error('[mail] proposed: keine crew_email im Record', r.getId());
    return;
  }

  const fdate   = fmtDate(date);
  const subject = 'ANFRAGE · ' + posLabel + ' · ' + fdate;
  const html = tpl(`
    <h1 style="font-size:40px;font-weight:bold;color:#ffffff;margin:0 0 6px 0;letter-spacing:-1px;">Neue Anfrage.</h1>
    <p style="font-size:10px;color:#4a4a6a;letter-spacing:3px;margin:0 0 32px 0;">ANFRAGE · ${posLabel.toUpperCase()}</p>
    <p style="font-size:13px;color:#9090b0;line-height:1.8;margin:0 0 4px 0;">
      Hey ${crewName},<br><br>
      du wurdest für folgenden Einsatz angefragt:
    </p>
    ${infoTable(
      infoRow('POSITION', posLabel, '#e8c84a') +
      infoRow('DATUM',    fdate,    '#ffffff')
    )}
    ${btn(APP_URL, 'BESTÄTIGEN / ABLEHNEN →', true)}
  `);
  sendMail(crewEmail, subject, html);

}, 'assignments');

// ── 3. Absage an Admin (assignment declined) ──────────────────────────────────
onRecordAfterUpdateSuccess((e) => {
  const r = e.record;
  if (r.get('status') !== 'declined') return;

  const crewName = r.get('crew_name');
  const posLabel = r.get('pos_label') || r.get('pos_id');
  const fdate    = fmtDate(r.get('date'));

  const subject = 'ABGELEHNT · ' + posLabel + ' · ' + fdate;
  const html = tpl(`
    <h1 style="font-size:40px;font-weight:bold;color:#e84a4a;margin:0 0 6px 0;letter-spacing:-1px;">Abgelehnt.</h1>
    <p style="font-size:10px;color:#4a4a6a;letter-spacing:3px;margin:0 0 32px 0;">ABSAGE · ${posLabel.toUpperCase()}</p>
    <p style="font-size:13px;color:#9090b0;line-height:1.8;margin:0 0 4px 0;">
      <strong style="color:#e84a4a;">${crewName}</strong> hat die folgende Anfrage abgelehnt:
    </p>
    ${infoTable(
      infoRow('POSITION', posLabel, '#e8c84a') +
      infoRow('DATUM',    fdate,    '#ffffff') +
      infoRow('CREW',     crewName, '#e84a4a')
    )}
    ${btn(APP_URL, 'PLAN ÖFFNEN →', false)}
  `);
  sendMail(ADMIN_EMAIL, subject, html);

}, 'assignments');
