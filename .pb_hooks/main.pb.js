// ── NYX LIGHTWORK · Crewplaner E-Mail-Hook ──────────────────────────────────────
// PocketBase Goja JS Hook · Resend HTTP API (kein SMTP)
// Version: 1.9
console.log('[hook] main.pb.js v1.9 geladen');

// ── 1. Crew-Einladung & Erinnerung (crew_invites) ─────────────────────────────
onRecordAfterCreateSuccess(function(e) {
  var r      = e.record;
  var name   = r.get('crew_name');
  var email  = r.get('crew_email');
  var type   = r.get('type');
  var plan   = r.get('plan_name') || 'Tour Plan';
  var appUrl = r.get('app_url')   || 'https://crewplanner.nyxlightwork.de';

  var sendMail = function(to, subject, html) {
    var _key  = 're_75ZvXHSz_2eCzUVHziYm6mj3sJwzavv2s';
    var _from = 'Tour Crew Plan <noreply@crewplanner.nyxlightwork.de>';
    try {
      var res = $http.send({
        url: 'https://api.resend.com/emails', method: 'POST',
        headers: { 'Authorization': 'Bearer ' + _key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: _from, to: [to], subject: subject, html: html })
      });
      if (res.statusCode >= 400) { console.error('[mail] Resend Fehler ' + res.statusCode + ':', res.raw); }
      else { console.log('[mail] Gesendet an ' + to + ' · ' + subject); }
    } catch (err) { console.error('[mail] Fehler:', err.message); }
  };

  var mkBtn = function(url, label) {
    return '<table cellpadding="0" cellspacing="0" style="margin:32px 0;"><tr><td style="background:#e8c84a;border-radius:2px;"><a href="' + url + '" style="display:block;padding:13px 28px;font-family:\'Courier New\',Courier,monospace;font-size:11px;font-weight:bold;color:#0d0d1a;text-decoration:none;letter-spacing:3px;">' + label + '</a></td></tr></table>';
  };

  var wrap = function(content) {
    return '<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#0d0d1a;font-family:\'Courier New\',Courier,monospace;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d1a;padding:48px 20px;"><tr><td align="center"><table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;"><tr><td style="padding-bottom:28px;border-bottom:1px solid #e8c84a;"><span style="font-size:10px;letter-spacing:4px;color:#e8c84a;text-transform:uppercase;">nyx lightwork</span></td></tr><tr><td style="padding:36px 0;">' + content + '</td></tr><tr><td style="padding-top:24px;border-top:1px solid #1a1a32;"><p style="font-size:9px;color:#2a2a4a;letter-spacing:2px;margin:0;text-transform:uppercase;">Tour Crew Plan · Nyx Lightwork · https://crewplanner.nyxlightwork.de</p></td></tr></table></td></tr></table></body></html>';
  };

  if (type === 'invite') {
    sendMail(email, 'CREW INVITE · ' + plan, wrap(
      '<h1 style="font-size:40px;font-weight:bold;color:#ffffff;margin:0 0 6px 0;">Du bist dabei.</h1>' +
      '<p style="font-size:10px;color:#4a4a6a;letter-spacing:3px;margin:0 0 32px 0;">CREW INVITE · ' + plan.toUpperCase() + '</p>' +
      '<p style="font-size:13px;color:#9090b0;line-height:1.8;margin:0;">Hey ' + name + ',<br><br>du wurdest für <strong style="color:#e8c84a;">' + plan + '</strong> eingeladen.</p>' +
      mkBtn(appUrl, 'EINSÄTZE BESTÄTIGEN →')
    ));
  } else if (type === 'reminder') {
    sendMail(email, 'REMINDER · ' + plan, wrap(
      '<h1 style="font-size:40px;font-weight:bold;color:#ffffff;margin:0 0 6px 0;">Noch ausstehend.</h1>' +
      '<p style="font-size:10px;color:#4a4a6a;letter-spacing:3px;margin:0 0 32px 0;">REMINDER · ' + plan.toUpperCase() + '</p>' +
      '<p style="font-size:13px;color:#9090b0;line-height:1.8;margin:0;">Hey ' + name + ',<br><br>bitte bestätige oder lehne deine Einsätze für <strong style="color:#e8c84a;">' + plan + '</strong> ab.</p>' +
      mkBtn(appUrl, 'JETZT BESTÄTIGEN →')
    ));
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
  var fdate = isNaN(d) ? date : (('0'+d.getDate()).slice(-2) + '.' + ('0'+(d.getMonth()+1)).slice(-2) + '.' + d.getFullYear());

  var sendMail = function(to, subject, html) {
    var _key  = 're_75ZvXHSz_2eCzUVHziYm6mj3sJwzavv2s';
    var _from = 'Tour Crew Plan <noreply@crewplanner.nyxlightwork.de>';
    try {
      var res = $http.send({
        url: 'https://api.resend.com/emails', method: 'POST',
        headers: { 'Authorization': 'Bearer ' + _key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: _from, to: [to], subject: subject, html: html })
      });
      if (res.statusCode >= 400) { console.error('[mail] Resend Fehler ' + res.statusCode + ':', res.raw); }
      else { console.log('[mail] Gesendet an ' + to + ' · ' + subject); }
    } catch (err) { console.error('[mail] Fehler:', err.message); }
  };

  sendMail(crewEmail, 'ANFRAGE · ' + posLabel + ' · ' + fdate,
    '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#0d0d1a;font-family:\'Courier New\',Courier,monospace;">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d1a;padding:48px 20px;"><tr><td align="center"><table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;">' +
    '<tr><td style="padding-bottom:28px;border-bottom:1px solid #e8c84a;"><span style="font-size:10px;letter-spacing:4px;color:#e8c84a;text-transform:uppercase;">nyx lightwork</span></td></tr>' +
    '<tr><td style="padding:36px 0;"><h1 style="font-size:40px;color:#ffffff;margin:0 0 6px 0;">Neue Anfrage.</h1>' +
    '<p style="font-size:13px;color:#9090b0;line-height:1.8;margin:0 0 4px 0;">Hey ' + crewName + ',<br><br>du wurdest angefragt:</p>' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border:1px solid #1a1a32;">' +
    '<tr><td style="padding:11px 16px;font-size:9px;color:#4a4a6a;">POSITION</td><td style="padding:11px 16px;font-size:13px;color:#e8c84a;">' + posLabel + '</td></tr>' +
    '<tr><td style="padding:11px 16px;font-size:9px;color:#4a4a6a;">DATUM</td><td style="padding:11px 16px;font-size:13px;color:#ffffff;">' + fdate + '</td></tr>' +
    '</table>' +
    '<table cellpadding="0" cellspacing="0" style="margin:32px 0;"><tr><td style="background:#e8c84a;border-radius:2px;"><a href="https://crewplanner.nyxlightwork.de" style="display:block;padding:13px 28px;font-family:\'Courier New\',Courier,monospace;font-size:11px;font-weight:bold;color:#0d0d1a;text-decoration:none;letter-spacing:3px;">BESTÄTIGEN / ABLEHNEN →</a></td></tr></table>' +
    '</td></tr><tr><td style="padding-top:24px;border-top:1px solid #1a1a32;"><p style="font-size:9px;color:#2a2a4a;margin:0;">Tour Crew Plan · Nyx Lightwork · https://crewplanner.nyxlightwork.de</p></td></tr>' +
    '</table></td></tr></table></body></html>'
  );
}, 'assignments');

// ── 3. Anfrage (proposed via UPDATE) oder Absage (declined) ───────────────────
onRecordAfterUpdateSuccess(function(e) {
  var r      = e.record;
  var status = r.get('status');
  console.log('[hook] UPDATE assignments fired, status:', status, 'id:', r.getId());

  var sendMail = function(to, subject, html) {
    var _key  = 're_75ZvXHSz_2eCzUVHziYm6mj3sJwzavv2s';
    var _from = 'Tour Crew Plan <noreply@crewplanner.nyxlightwork.de>';
    try {
      var res = $http.send({
        url: 'https://api.resend.com/emails', method: 'POST',
        headers: { 'Authorization': 'Bearer ' + _key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: _from, to: [to], subject: subject, html: html })
      });
      if (res.statusCode >= 400) { console.error('[mail] Resend Fehler ' + res.statusCode + ':', res.raw); }
      else { console.log('[mail] Gesendet an ' + to + ' · ' + subject); }
    } catch (err) { console.error('[mail] Fehler:', err.message); }
  };

  var date     = r.get('date');
  var d        = new Date(date);
  var fdate    = isNaN(d) ? date : (('0'+d.getDate()).slice(-2) + '.' + ('0'+(d.getMonth()+1)).slice(-2) + '.' + d.getFullYear());
  var posLabel = r.get('pos_label') || r.get('pos_id');

  if (status === 'proposed') {
    var crewEmail = r.get('crew_email');
    var crewName  = r.get('crew_name');
    if (!crewEmail) { console.error('[mail] proposed update: keine crew_email', r.getId()); return; }

    sendMail(crewEmail, 'ANFRAGE · ' + posLabel + ' · ' + fdate,
      '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#0d0d1a;font-family:\'Courier New\',Courier,monospace;">' +
      '<table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d1a;padding:48px 20px;"><tr><td align="center"><table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;">' +
      '<tr><td style="padding-bottom:28px;border-bottom:1px solid #e8c84a;"><span style="font-size:10px;letter-spacing:4px;color:#e8c84a;text-transform:uppercase;">nyx lightwork</span></td></tr>' +
      '<tr><td style="padding:36px 0;"><h1 style="font-size:40px;color:#ffffff;margin:0 0 6px 0;">Neue Anfrage.</h1>' +
      '<p style="font-size:13px;color:#9090b0;line-height:1.8;margin:0 0 4px 0;">Hey ' + crewName + ',<br><br>du wurdest angefragt:</p>' +
      '<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border:1px solid #1a1a32;">' +
      '<tr><td style="padding:11px 16px;font-size:9px;color:#4a4a6a;">POSITION</td><td style="padding:11px 16px;font-size:13px;color:#e8c84a;">' + posLabel + '</td></tr>' +
      '<tr><td style="padding:11px 16px;font-size:9px;color:#4a4a6a;">DATUM</td><td style="padding:11px 16px;font-size:13px;color:#ffffff;">' + fdate + '</td></tr>' +
      '</table>' +
      '<table cellpadding="0" cellspacing="0" style="margin:32px 0;"><tr><td style="background:#e8c84a;border-radius:2px;"><a href="https://crewplanner.nyxlightwork.de" style="display:block;padding:13px 28px;font-family:\'Courier New\',Courier,monospace;font-size:11px;font-weight:bold;color:#0d0d1a;text-decoration:none;letter-spacing:3px;">BESTÄTIGEN / ABLEHNEN →</a></td></tr></table>' +
      '</td></tr><tr><td style="padding-top:24px;border-top:1px solid #1a1a32;"><p style="font-size:9px;color:#2a2a4a;margin:0;">Tour Crew Plan · Nyx Lightwork · https://crewplanner.nyxlightwork.de</p></td></tr>' +
      '</table></td></tr></table></body></html>'
    );
    return;
  }

  if (status !== 'declined') return;

  var crewName = r.get('crew_name');
  sendMail('madmaxmail@web.de', 'ABGELEHNT · ' + posLabel + ' · ' + fdate,
    '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#0d0d1a;font-family:\'Courier New\',Courier,monospace;">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d1a;padding:48px 20px;"><tr><td align="center"><table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;">' +
    '<tr><td style="padding-bottom:28px;border-bottom:1px solid #e8c84a;"><span style="font-size:10px;letter-spacing:4px;color:#e8c84a;text-transform:uppercase;">nyx lightwork</span></td></tr>' +
    '<tr><td style="padding:36px 0;"><h1 style="font-size:40px;color:#e84a4a;margin:0 0 6px 0;">Abgelehnt.</h1>' +
    '<p style="font-size:13px;color:#9090b0;line-height:1.8;margin:0 0 4px 0;"><strong style="color:#e84a4a;">' + crewName + '</strong> hat abgelehnt:</p>' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border:1px solid #1a1a32;">' +
    '<tr><td style="padding:11px 16px;font-size:9px;color:#4a4a6a;">POSITION</td><td style="padding:11px 16px;font-size:13px;color:#e8c84a;">' + posLabel + '</td></tr>' +
    '<tr><td style="padding:11px 16px;font-size:9px;color:#4a4a6a;">DATUM</td><td style="padding:11px 16px;font-size:13px;color:#ffffff;">' + fdate + '</td></tr>' +
    '<tr><td style="padding:11px 16px;font-size:9px;color:#4a4a6a;">CREW</td><td style="padding:11px 16px;font-size:13px;color:#e84a4a;">' + crewName + '</td></tr>' +
    '</table>' +
    '<table cellpadding="0" cellspacing="0" style="margin:32px 0;"><tr><td style="background:#1a1a32;border:1px solid #2a2a4a;border-radius:2px;"><a href="https://crewplanner.nyxlightwork.de" style="display:block;padding:13px 28px;font-family:\'Courier New\',Courier,monospace;font-size:11px;font-weight:bold;color:#8080a0;text-decoration:none;letter-spacing:3px;">PLAN ÖFFNEN →</a></td></tr></table>' +
    '</td></tr><tr><td style="padding-top:24px;border-top:1px solid #1a1a32;"><p style="font-size:9px;color:#2a2a4a;margin:0;">Tour Crew Plan · Nyx Lightwork · https://crewplanner.nyxlightwork.de</p></td></tr>' +
    '</table></td></tr></table></body></html>'
  );
}, 'assignments');
