// ── NYX LIGHTWORK · Crewplaner E-Mail-Hook ──────────────────────────────────────
// PocketBase Goja JS Hook · Resend HTTP API (kein SMTP)
// Version: 1.7
console.log('[hook] main.pb.js v1.7 geladen');

var RESEND_API_KEY = 're_75ZvXHSz_2eCzUVHziYm6mj3sJwzavv2s';
var FROM_EMAIL     = 'Tour Crew Plan <noreply@crewplanner.nyxlightwork.de>';
var ADMIN_EMAIL    = 'madmaxmail@web.de';
var APP_URL        = 'https://crewplanner.nyxlightwork.de';

// ── 1. Crew-Einladung & Erinnerung (crew_invites) ─────────────────────────────
onRecordAfterCreateSuccess(function(e) {
  var r       = e.record;
  var name    = r.get('crew_name');
  var email   = r.get('crew_email');
  var type    = r.get('type');
  var plan    = r.get('plan_name') || 'Tour Plan';
  var appUrl  = r.get('app_url')   || APP_URL;

  var sendMail = function(to, subject, html) {
    try {
      var res = $http.send({
        url:    'https://api.resend.com/emails',
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject: subject, html: html })
      });
      if (res.statusCode >= 400) {
        console.error('[mail] Resend Fehler ' + res.statusCode + ':', res.raw);
      } else {
        console.log('[mail] Gesendet an ' + to + ' · ' + subject);
      }
    } catch (e) { console.error('[mail] sendMail Fehler:', e.message); }
  };

  var darkBg = '#0d0d1a';
  var goldColor = '#e8c84a';

  var btnHtml = function(url, label) {
    return '<table cellpadding="0" cellspacing="0" style="margin:32px 0;"><tr><td style="background:' + goldColor + ';border-radius:2px;"><a href="' + url + '" style="display:block;padding:13px 28px;font-family:\'Courier New\',Courier,monospace;font-size:11px;font-weight:bold;color:' + darkBg + ';text-decoration:none;letter-spacing:3px;">' + label + '</a></td></tr></table>';
  };

  var wrapTpl = function(content) {
    return '<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:' + darkBg + ';font-family:\'Courier New\',Courier,monospace;"><table width="100%" cellpadding="0" cellspacing="0" style="background:' + darkBg + ';padding:48px 20px;"><tr><td align="center"><table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;"><tr><td style="padding-bottom:28px;border-bottom:1px solid ' + goldColor + ';"><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-size:10px;letter-spacing:4px;color:' + goldColor + ';text-transform:uppercase;">nyx lightwork</td></tr></table></td></tr><tr><td style="padding:36px 0;">' + content + '</td></tr><tr><td style="padding-top:24px;border-top:1px solid #1a1a32;"><p style="font-size:9px;color:#2a2a4a;letter-spacing:2px;margin:0;text-transform:uppercase;">Tour Crew Plan &nbsp;·&nbsp; Nyx Lightwork &nbsp;·&nbsp; ' + APP_URL + '</p></td></tr></table></td></tr></table></body></html>';
  };

  if (type === 'invite') {
    var subject = 'CREW INVITE · ' + plan;
    var html = wrapTpl(
      '<h1 style="font-size:40px;font-weight:bold;color:#ffffff;margin:0 0 6px 0;letter-spacing:-1px;">Du bist dabei.</h1>' +
      '<p style="font-size:10px;color:#4a4a6a;letter-spacing:3px;margin:0 0 32px 0;">CREW INVITE · ' + plan.toUpperCase() + '</p>' +
      '<p style="font-size:13px;color:#9090b0;line-height:1.8;margin:0;">Hey ' + name + ',<br><br>du wurdest für <strong style="color:' + goldColor + ';">' + plan + '</strong> eingeladen.<br>Logge dich ein und bestätige oder lehne deine Einsätze ab.</p>' +
      btnHtml(appUrl, 'EINSÄTZE BESTÄTIGEN →')
    );
    sendMail(email, subject, html);

  } else if (type === 'reminder') {
    var subject = 'REMINDER · ' + plan;
    var html = wrapTpl(
      '<h1 style="font-size:40px;font-weight:bold;color:#ffffff;margin:0 0 6px 0;letter-spacing:-1px;">Noch ausstehend.</h1>' +
      '<p style="font-size:10px;color:#4a4a6a;letter-spacing:3px;margin:0 0 32px 0;">REMINDER · ' + plan.toUpperCase() + '</p>' +
      '<p style="font-size:13px;color:#9090b0;line-height:1.8;margin:0;">Hey ' + name + ',<br><br>es gibt noch offene Anfragen für <strong style="color:' + goldColor + ';">' + plan + '</strong>.<br>Bitte bestätige oder lehne deine Einsätze ab.</p>' +
      btnHtml(appUrl, 'JETZT BESTÄTIGEN →')
    );
    sendMail(email, subject, html);
  }

  try { $app.dao().deleteRecord(r); } catch (_) {}

}, 'crew_invites');

// ── 2. Anfrage an Crew-Mitglied (assignment proposed via CREATE) ───────────────
onRecordAfterCreateSuccess(function(e) {
  var r = e.record;
  console.log('[hook] CREATE assignments fired, status:', r.get('status'), 'id:', r.getId());
  if (r.get('status') !== 'proposed') return;

  var crewEmail = r.get('crew_email');
  var crewName  = r.get('crew_name');
  var posLabel  = r.get('pos_label') || r.get('pos_id');
  var date      = r.get('date');

  if (!crewEmail) { console.error('[mail] proposed create: keine crew_email', r.getId()); return; }

  var d = new Date(date);
  var fdate = isNaN(d) ? date : (d.getDate().toString().padStart(2,'0') + '.' + (d.getMonth()+1).toString().padStart(2,'0') + '.' + d.getFullYear());

  var sendMail = function(to, subject, html) {
    try {
      var res = $http.send({
        url: 'https://api.resend.com/emails', method: 'POST',
        headers: { 'Authorization': 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject: subject, html: html })
      });
      if (res.statusCode >= 400) { console.error('[mail] Resend Fehler ' + res.statusCode + ':', res.raw); }
      else { console.log('[mail] Gesendet an ' + to + ' · ' + subject); }
    } catch (err) { console.error('[mail] Fehler:', err.message); }
  };

  var darkBg = '#0d0d1a'; var goldColor = '#e8c84a';
  var subject = 'ANFRAGE · ' + posLabel + ' · ' + fdate;
  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:' + darkBg + ';font-family:\'Courier New\',Courier,monospace;">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:' + darkBg + ';padding:48px 20px;"><tr><td align="center"><table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;">' +
    '<tr><td style="padding-bottom:28px;border-bottom:1px solid ' + goldColor + ';"><span style="font-size:10px;letter-spacing:4px;color:' + goldColor + ';text-transform:uppercase;">nyx lightwork</span></td></tr>' +
    '<tr><td style="padding:36px 0;">' +
    '<h1 style="font-size:40px;font-weight:bold;color:#ffffff;margin:0 0 6px 0;letter-spacing:-1px;">Neue Anfrage.</h1>' +
    '<p style="font-size:10px;color:#4a4a6a;letter-spacing:3px;margin:0 0 32px 0;">ANFRAGE · ' + posLabel.toUpperCase() + '</p>' +
    '<p style="font-size:13px;color:#9090b0;line-height:1.8;margin:0 0 4px 0;">Hey ' + crewName + ',<br><br>du wurdest für folgenden Einsatz angefragt:</p>' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border:1px solid #1a1a32;border-radius:2px;">' +
    '<tr><td style="padding:11px 16px;font-size:9px;color:#4a4a6a;letter-spacing:2px;border-bottom:1px solid #1a1a32;">POSITION</td><td style="padding:11px 16px;font-size:13px;color:' + goldColor + ';border-bottom:1px solid #1a1a32;">' + posLabel + '</td></tr>' +
    '<tr><td style="padding:11px 16px;font-size:9px;color:#4a4a6a;letter-spacing:2px;">DATUM</td><td style="padding:11px 16px;font-size:13px;color:#ffffff;">' + fdate + '</td></tr>' +
    '</table>' +
    '<table cellpadding="0" cellspacing="0" style="margin:32px 0;"><tr><td style="background:' + goldColor + ';border-radius:2px;"><a href="' + APP_URL + '" style="display:block;padding:13px 28px;font-family:\'Courier New\',Courier,monospace;font-size:11px;font-weight:bold;color:' + darkBg + ';text-decoration:none;letter-spacing:3px;">BESTÄTIGEN / ABLEHNEN →</a></td></tr></table>' +
    '</td></tr><tr><td style="padding-top:24px;border-top:1px solid #1a1a32;"><p style="font-size:9px;color:#2a2a4a;letter-spacing:2px;margin:0;text-transform:uppercase;">Tour Crew Plan · Nyx Lightwork · ' + APP_URL + '</p></td></tr>' +
    '</table></td></tr></table></body></html>';

  sendMail(crewEmail, subject, html);

}, 'assignments');

// ── 3. Anfrage (proposed via UPDATE) oder Absage (declined) ───────────────────
onRecordAfterUpdateSuccess(function(e) {
  var r      = e.record;
  var status = r.get('status');
  console.log('[hook] UPDATE assignments fired, status:', status, 'id:', r.getId());

  var sendMail = function(to, subject, html) {
    try {
      var res = $http.send({
        url: 'https://api.resend.com/emails', method: 'POST',
        headers: { 'Authorization': 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject: subject, html: html })
      });
      if (res.statusCode >= 400) { console.error('[mail] Resend Fehler ' + res.statusCode + ':', res.raw); }
      else { console.log('[mail] Gesendet an ' + to + ' · ' + subject); }
    } catch (err) { console.error('[mail] Fehler:', err.message); }
  };

  var darkBg = '#0d0d1a'; var goldColor = '#e8c84a';
  var date = r.get('date');
  var d = new Date(date);
  var fdate = isNaN(d) ? date : (d.getDate().toString().padStart(2,'0') + '.' + (d.getMonth()+1).toString().padStart(2,'0') + '.' + d.getFullYear());
  var posLabel = r.get('pos_label') || r.get('pos_id');

  if (status === 'proposed') {
    var crewEmail = r.get('crew_email');
    var crewName  = r.get('crew_name');
    if (!crewEmail) { console.error('[mail] proposed update: keine crew_email', r.getId()); return; }

    var subject = 'ANFRAGE · ' + posLabel + ' · ' + fdate;
    var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:' + darkBg + ';font-family:\'Courier New\',Courier,monospace;">' +
      '<table width="100%" cellpadding="0" cellspacing="0" style="background:' + darkBg + ';padding:48px 20px;"><tr><td align="center"><table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;">' +
      '<tr><td style="padding-bottom:28px;border-bottom:1px solid ' + goldColor + ';"><span style="font-size:10px;letter-spacing:4px;color:' + goldColor + ';text-transform:uppercase;">nyx lightwork</span></td></tr>' +
      '<tr><td style="padding:36px 0;">' +
      '<h1 style="font-size:40px;font-weight:bold;color:#ffffff;margin:0 0 6px 0;letter-spacing:-1px;">Neue Anfrage.</h1>' +
      '<p style="font-size:10px;color:#4a4a6a;letter-spacing:3px;margin:0 0 32px 0;">ANFRAGE · ' + posLabel.toUpperCase() + '</p>' +
      '<p style="font-size:13px;color:#9090b0;line-height:1.8;margin:0 0 4px 0;">Hey ' + crewName + ',<br><br>du wurdest für folgenden Einsatz angefragt:</p>' +
      '<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border:1px solid #1a1a32;border-radius:2px;">' +
      '<tr><td style="padding:11px 16px;font-size:9px;color:#4a4a6a;letter-spacing:2px;border-bottom:1px solid #1a1a32;">POSITION</td><td style="padding:11px 16px;font-size:13px;color:' + goldColor + ';border-bottom:1px solid #1a1a32;">' + posLabel + '</td></tr>' +
      '<tr><td style="padding:11px 16px;font-size:9px;color:#4a4a6a;letter-spacing:2px;">DATUM</td><td style="padding:11px 16px;font-size:13px;color:#ffffff;">' + fdate + '</td></tr>' +
      '</table>' +
      '<table cellpadding="0" cellspacing="0" style="margin:32px 0;"><tr><td style="background:' + goldColor + ';border-radius:2px;"><a href="' + APP_URL + '" style="display:block;padding:13px 28px;font-family:\'Courier New\',Courier,monospace;font-size:11px;font-weight:bold;color:' + darkBg + ';text-decoration:none;letter-spacing:3px;">BESTÄTIGEN / ABLEHNEN →</a></td></tr></table>' +
      '</td></tr><tr><td style="padding-top:24px;border-top:1px solid #1a1a32;"><p style="font-size:9px;color:#2a2a4a;letter-spacing:2px;margin:0;text-transform:uppercase;">Tour Crew Plan · Nyx Lightwork · ' + APP_URL + '</p></td></tr>' +
      '</table></td></tr></table></body></html>';

    sendMail(crewEmail, subject, html);
    return;
  }

  if (status !== 'declined') return;

  var crewName = r.get('crew_name');
  var subject  = 'ABGELEHNT · ' + posLabel + ' · ' + fdate;
  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:' + darkBg + ';font-family:\'Courier New\',Courier,monospace;">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:' + darkBg + ';padding:48px 20px;"><tr><td align="center"><table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;">' +
    '<tr><td style="padding-bottom:28px;border-bottom:1px solid ' + goldColor + ';"><span style="font-size:10px;letter-spacing:4px;color:' + goldColor + ';text-transform:uppercase;">nyx lightwork</span></td></tr>' +
    '<tr><td style="padding:36px 0;">' +
    '<h1 style="font-size:40px;font-weight:bold;color:#e84a4a;margin:0 0 6px 0;letter-spacing:-1px;">Abgelehnt.</h1>' +
    '<p style="font-size:10px;color:#4a4a6a;letter-spacing:3px;margin:0 0 32px 0;">ABSAGE · ' + posLabel.toUpperCase() + '</p>' +
    '<p style="font-size:13px;color:#9090b0;line-height:1.8;margin:0 0 4px 0;"><strong style="color:#e84a4a;">' + crewName + '</strong> hat die folgende Anfrage abgelehnt:</p>' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border:1px solid #1a1a32;border-radius:2px;">' +
    '<tr><td style="padding:11px 16px;font-size:9px;color:#4a4a6a;letter-spacing:2px;border-bottom:1px solid #1a1a32;">POSITION</td><td style="padding:11px 16px;font-size:13px;color:' + goldColor + ';border-bottom:1px solid #1a1a32;">' + posLabel + '</td></tr>' +
    '<tr><td style="padding:11px 16px;font-size:9px;color:#4a4a6a;letter-spacing:2px;border-bottom:1px solid #1a1a32;">DATUM</td><td style="padding:11px 16px;font-size:13px;color:#ffffff;border-bottom:1px solid #1a1a32;">' + fdate + '</td></tr>' +
    '<tr><td style="padding:11px 16px;font-size:9px;color:#4a4a6a;letter-spacing:2px;">CREW</td><td style="padding:11px 16px;font-size:13px;color:#e84a4a;">' + crewName + '</td></tr>' +
    '</table>' +
    '<table cellpadding="0" cellspacing="0" style="margin:32px 0;"><tr><td style="background:#1a1a32;border:1px solid #2a2a4a;border-radius:2px;"><a href="' + APP_URL + '" style="display:block;padding:13px 28px;font-family:\'Courier New\',Courier,monospace;font-size:11px;font-weight:bold;color:#8080a0;text-decoration:none;letter-spacing:3px;">PLAN ÖFFNEN →</a></td></tr></table>' +
    '</td></tr><tr><td style="padding-top:24px;border-top:1px solid #1a1a32;"><p style="font-size:9px;color:#2a2a4a;letter-spacing:2px;margin:0;text-transform:uppercase;">Tour Crew Plan · Nyx Lightwork · ' + APP_URL + '</p></td></tr>' +
    '</table></td></tr></table></body></html>';

  sendMail(ADMIN_EMAIL, subject, html);

}, 'assignments');
