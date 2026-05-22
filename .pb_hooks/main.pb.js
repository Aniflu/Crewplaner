// ── NYX LIGHTWORK · Crewplaner E-Mail-Hook ──────────────────────────────────────
// PocketBase Goja JS Hook · Resend HTTP API (kein SMTP)
// Version: 4.0
console.log('[hook] main.pb.js v4.0 geladen');

// ── 1. Crew-Einladung & Erinnerung (crew_invites) ─────────────────────────────
onRecordAfterCreateSuccess(function(e) {
  e.next();
  try {
  var r      = e.record;
  var name   = r.get('crew_name');
  var email  = r.get('crew_email');
  var type   = r.get('type');
  var plan   = r.get('plan_name') || 'Tour Plan';
  var appUrl = r.get('app_url')   || 'https://crewplanner.nyxlightwork.de';
  console.log('[hook] crew_invites type:', type, 'email:', email);

  var esc = function(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  };

  var sendMail = function(to, subject, html) {
    try {
      var _key  = $os.getenv('RESEND_KEY');
      var _from = 'Tour Crew Plan <noreply@crewplanner.nyxlightwork.de>';
      var res = $http.send({
        url: 'https://api.resend.com/emails', method: 'POST',
        headers: { 'Authorization': 'Bearer ' + _key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: _from, to: [to], subject: subject, html: html })
      });
      if (res.statusCode >= 400) { console.error('[mail] Resend Fehler ' + res.statusCode + ':', res.raw); }
      else { console.log('[mail] Gesendet an ' + to + ' · ' + subject); }
    } catch (err) { console.error('[mail] Fehler:', err.message || String(err)); }
  };

  var mkBtn = function(url, label, bg, color) {
    var _bg    = bg    || '#e8c84a';
    var _color = color || '#0d0d1a';
    return '<table cellpadding="0" cellspacing="0" style="margin:8px 0;"><tr><td style="background:' + _bg + ';border-radius:2px;"><a href="' + url + '" style="display:block;padding:13px 28px;font-family:\'Courier New\',Courier,monospace;font-size:11px;font-weight:bold;color:' + _color + ';text-decoration:none;letter-spacing:3px;">' + label + '</a></td></tr></table>';
  };

  var wrap = function(content) {
    return '<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"></head>' +
      '<body style="margin:0;padding:0;background:#f8f9fb;font-family:\'Courier New\',Courier,monospace;">' +
      '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fb;padding:48px 20px;"><tr><td align="center">' +
      '<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #e8e8e8;border-radius:4px;">' +
      '<tr><td style="padding:28px 36px;border-bottom:2px solid #e8c84a;">' +
      '<span style="font-size:10px;letter-spacing:4px;color:#e8c84a;text-transform:uppercase;">nyx lightwork</span></td></tr>' +
      '<tr><td style="padding:36px 36px;">' + content + '</td></tr>' +
      '<tr><td style="padding:20px 36px;border-top:1px solid #e8e8e8;">' +
      '<p style="font-size:9px;color:#999999;letter-spacing:2px;margin:0;text-transform:uppercase;">Tour Crew Plan · Nyx Lightwork · https://crewplanner.nyxlightwork.de</p>' +
      '</td></tr></table></td></tr></table></body></html>';
  };

  var _crewGuide = 'https://aniflu.github.io/Crewplaner/docs/guide-crew.html';

  var eName = esc(name);
  var ePlan = esc(plan);

  if (type === 'invite') {
    sendMail(email, 'CREW INVITE · ' + plan, wrap(
      '<h1 style="font-size:36px;font-weight:bold;color:#1a1a2e;margin:0 0 6px 0;">Du bist dabei.</h1>' +
      '<p style="font-size:10px;color:#e8c84a;letter-spacing:3px;margin:0 0 28px 0;text-transform:uppercase;">CREW INVITE · ' + ePlan + '</p>' +
      '<p style="font-size:13px;color:#555570;line-height:1.8;margin:0 0 24px 0;">Hey ' + eName + ',<br><br>du wurdest f&uuml;r <strong style="color:#1a1a2e;">' + ePlan + '</strong> eingeladen.</p>' +
      mkBtn(appUrl, 'EINST&Auml;TZE BEST&Auml;TIGEN &rarr;') +
      mkBtn(_crewGuide, 'ANLEITUNG &rarr;', '#f8f9fb', '#555570')
    ));
  } else if (type === 'reminder') {
    sendMail(email, 'REMINDER · ' + plan, wrap(
      '<h1 style="font-size:36px;font-weight:bold;color:#1a1a2e;margin:0 0 6px 0;">Noch ausstehend.</h1>' +
      '<p style="font-size:10px;color:#e8c84a;letter-spacing:3px;margin:0 0 28px 0;text-transform:uppercase;">REMINDER · ' + ePlan + '</p>' +
      '<p style="font-size:13px;color:#555570;line-height:1.8;margin:0 0 24px 0;">Hey ' + eName + ',<br><br>bitte bestätige oder lehne deine Einsätze für <strong style="color:#1a1a2e;">' + ePlan + '</strong> ab.</p>' +
      mkBtn(appUrl, 'JETZT BESTÄTIGEN →')
    ));
  } else if (type === 'cancellation') {
    var slots = [];
    // app_url field is intentionally reused to transport JSON slot data for cancellation mails
    try { slots = JSON.parse(appUrl || '[]'); } catch (_) {}
    var rowsHtml = '';
    for (var i = 0; i < slots.length; i++) {
      var s = slots[i];
      var d2 = new Date(s.date);
      var fd2 = isNaN(d2.getTime()) ? esc(s.date) : (('0'+d2.getDate()).slice(-2) + '.' + ('0'+(d2.getMonth()+1)).slice(-2) + '.' + d2.getFullYear());
      rowsHtml += '<tr><td style="padding:10px 16px;font-size:13px;color:#1a1a2e;font-weight:bold;border-bottom:1px solid #e8e8e8;">' + esc(s.posLabel) + '</td>' +
        '<td style="padding:10px 16px;font-size:13px;color:#555570;border-bottom:1px solid #e8e8e8;">' + fd2 + '</td></tr>';
    }
    sendMail(email, 'ABSAGE · ' + plan, wrap(
      '<h1 style="font-size:36px;font-weight:bold;color:#e84a4a;margin:0 0 6px 0;">Leider abgesagt.</h1>' +
      '<p style="font-size:10px;color:#e8c84a;letter-spacing:3px;margin:0 0 28px 0;text-transform:uppercase;">ABSAGE · ' + ePlan + '</p>' +
      '<p style="font-size:13px;color:#555570;line-height:1.8;margin:0 0 4px 0;">Hey ' + eName + ',<br><br>folgende Eins&auml;tze wurden leider abgesagt:</p>' +
      '<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border:1px solid #e8e8e8;border-radius:2px;">' +
      '<tr style="background:#f8f9fb;"><td style="padding:10px 16px;font-size:9px;color:#999999;letter-spacing:2px;text-transform:uppercase;border-bottom:2px solid #e8e8e8;">POSITION</td>' +
      '<td style="padding:10px 16px;font-size:9px;color:#999999;letter-spacing:2px;text-transform:uppercase;border-bottom:2px solid #e8e8e8;">DATUM</td></tr>' +
      rowsHtml + '</table>'
    ));
    console.log('[hook] cancellation email sent to ' + email + ' (' + slots.length + ' slots)');
  } else if (type === 'availability') {
    var avSlots = [];
    try { avSlots = JSON.parse(appUrl || '[]'); } catch (_) {}
    var avRows = '';
    for (var i = 0; i < avSlots.length; i++) {
      var s = avSlots[i];
      var dv = new Date(s.date);
      var fdv = isNaN(dv.getTime()) ? esc(s.date) : (('0'+dv.getDate()).slice(-2)+'.'+('0'+(dv.getMonth()+1)).slice(-2)+'.'+dv.getFullYear());
      avRows += '<tr><td style="padding:10px 16px;font-size:13px;color:#1a1a2e;font-weight:bold;border-bottom:1px solid #e8e8e8;">'+esc(s.posLabel)+'</td>'+
        '<td style="padding:10px 16px;font-size:13px;color:#555570;border-bottom:1px solid #e8e8e8;">'+fdv+'</td></tr>';
    }
    var avAdmin = $os.getenv('ADMIN_EMAIL') || 'madmaxmail@web.de';
    sendMail(avAdmin, 'BEREITSCHAFT · ' + name + ' · ' + plan, wrap(
      '<h1 style="font-size:36px;font-weight:bold;color:#1a1a2e;margin:0 0 6px 0;">Bereit.</h1>'+
      '<p style="font-size:10px;color:#e8c84a;letter-spacing:3px;margin:0 0 28px 0;text-transform:uppercase;">BEREITSCHAFTSMELDUNG · '+ePlan+'</p>'+
      '<p style="font-size:13px;color:#555570;line-height:1.8;margin:0 0 4px 0;">'+eName+' ist verfügbar für:</p>'+
      '<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border:1px solid #e8e8e8;border-radius:2px;">'+
      '<tr style="background:#f8f9fb;"><td style="padding:10px 16px;font-size:9px;color:#999999;letter-spacing:2px;text-transform:uppercase;border-bottom:2px solid #e8e8e8;">POSITION</td>'+
      '<td style="padding:10px 16px;font-size:9px;color:#999999;letter-spacing:2px;text-transform:uppercase;border-bottom:2px solid #e8e8e8;">DATUM</td></tr>'+
      avRows+'</table>'+
      mkBtn('https://crewplanner.nyxlightwork.de', 'PLAN ÖFFNEN →', '#f8f9fb', '#555570')
    ));
    console.log('[hook] availability email sent to admin for '+name+' ('+avSlots.length+' slots)');
  } else if (type === 'update') {
    var upSlots = [];
    try { upSlots = JSON.parse(appUrl || '[]'); } catch (_) {}
    var upRows = '';
    for (var i = 0; i < upSlots.length; i++) {
      var s = upSlots[i];
      var dv = new Date(s.date);
      var fdv = isNaN(dv.getTime()) ? esc(s.date) : (('0'+dv.getDate()).slice(-2)+'.'+('0'+(dv.getMonth()+1)).slice(-2)+'.'+dv.getFullYear());
      var chg = Array.isArray(s.changes) ? s.changes.map(function(c){return esc(c);}).join(', ') : '';
      upRows += '<tr><td style="padding:10px 16px;font-size:13px;color:#1a1a2e;font-weight:bold;border-bottom:1px solid #e8e8e8;">'+fdv+'</td>'+
        '<td style="padding:10px 16px;font-size:13px;color:#555570;border-bottom:1px solid #e8e8e8;">'+esc(s.posLabel)+'</td>'+
        '<td style="padding:10px 16px;font-size:12px;color:#e84a4a;font-weight:bold;border-bottom:1px solid #e8e8e8;">'+chg+'</td></tr>';
    }
    sendMail(email, 'ÄNDERUNG · ' + plan, wrap(
      '<h1 style="font-size:36px;font-weight:bold;color:#e84a4a;margin:0 0 6px 0;">Achtung.</h1>'+
      '<p style="font-size:10px;color:#e8c84a;letter-spacing:3px;margin:0 0 28px 0;text-transform:uppercase;">PLAN GEÄNDERT · '+ePlan+'</p>'+
      '<p style="font-size:13px;color:#555570;line-height:1.8;margin:0 0 4px 0;">Hey '+eName+',<br><br>folgende Einss&auml;tze haben sich ge&auml;ndert. Bitte logge dich ein und best&auml;tige erneut:</p>'+
      '<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border:1px solid #e8e8e8;border-radius:2px;">'+
      '<tr style="background:#f8f9fb;">'+
      '<td style="padding:10px 16px;font-size:9px;color:#999999;letter-spacing:2px;text-transform:uppercase;border-bottom:2px solid #e8e8e8;">DATUM</td>'+
      '<td style="padding:10px 16px;font-size:9px;color:#999999;letter-spacing:2px;text-transform:uppercase;border-bottom:2px solid #e8e8e8;">POSITION</td>'+
      '<td style="padding:10px 16px;font-size:9px;color:#e84a4a;letter-spacing:2px;text-transform:uppercase;border-bottom:2px solid #e8e8e8;">&Auml;NDERUNG</td></tr>'+
      upRows+'</table>'+
      mkBtn('https://crewplanner.nyxlightwork.de','JETZT &Uuml;BERPR&Uuml;FEN &rarr;')
    ));
    console.log('[hook] update email sent to '+email+' ('+upSlots.length+' slots)');
  } else if (type === 'love_invite') {
    var _lGuide = 'https://aniflu.github.io/Crewplaner/docs/guide-admin.html';
    sendMail(email, '♥ Du wirst gebraucht · ' + plan, wrap(
      '<div style="text-align:center;padding:8px 0 24px 0;"><div style="font-size:64px;line-height:1;">♥</div></div>' +
      '<h1 style="font-size:32px;font-weight:bold;color:#1a1a2e;margin:0 0 6px 0;text-align:center;">Ich hab dich lieb.</h1>' +
      '<p style="font-size:10px;color:#e8c84a;letter-spacing:3px;margin:0 0 28px 0;text-transform:uppercase;text-align:center;">EINLADUNG · ' + ePlan + '</p>' +
      '<p style="font-size:13px;color:#555570;line-height:1.9;margin:0 0 24px 0;">Hey ' + eName + ',<br><br>' +
      'ich hab dich lieb &mdash; und deswegen will ich, dass du dabei bist. ♥<br><br>' +
      'Du wirst Superadmin bei <strong style="color:#1a1a2e;">' + ePlan + '</strong>. ' +
      'Erstell dir ein Konto und ich zeig dir den Rest:</p>' +
      mkBtn(appUrl, 'KONTO ERSTELLEN &rarr;') +
      mkBtn(_lGuide, 'ANLEITUNG &rarr;', '#f8f9fb', '#555570')
    ));
  } else if (type === 'staff_invite') {
    var _guideUrl = 'https://aniflu.github.io/Crewplaner/docs/guide-admin.html';
    sendMail(email, 'EINLADUNG · ' + plan, wrap(
      '<h1 style="font-size:36px;font-weight:bold;color:#1a1a2e;margin:0 0 6px 0;">Du wurdest eingeladen.</h1>' +
      '<p style="font-size:10px;color:#e8c84a;letter-spacing:3px;margin:0 0 28px 0;text-transform:uppercase;">EINLADUNG · ' + ePlan + '</p>' +
      '<p style="font-size:13px;color:#555570;line-height:1.8;margin:0 0 24px 0;">Hey ' + eName + ',<br><br>du wurdest f&uuml;r <strong style="color:#1a1a2e;">' + ePlan + '</strong> eingeladen. Erstelle zuerst dein Konto &mdash; die Anleitung hilft dir beim Einstieg:</p>' +
      mkBtn(appUrl, 'KONTO ERSTELLEN &rarr;') +
      mkBtn(_guideUrl, 'ANLEITUNG LESEN &rarr;', '#f8f9fb', '#555570')
    ));
  }
  } catch(outerErr) { console.error('[hook] crew_invites UNCAUGHT:', String(outerErr)); }

}, 'crew_invites');


// ── 2. Anfrage an Crew-Mitglied (assignment proposed via CREATE) ───────────────
onRecordAfterCreateSuccess(function(e) {
  e.next();
  var r = e.record;
  console.log('[hook] CREATE assignments fired, status:', r.get('status'), 'id:', r.id);
  if (r.get('status') !== 'proposed') return;

  var crewEmail = r.get('crew_email');
  var crewName  = r.get('crew_name');
  var posLabel  = r.get('pos_label') || r.get('pos_id');
  var date      = r.get('date');
  var aid       = r.id;
  if (!crewEmail) { console.error('[mail] proposed create: keine crew_email', aid); return; }

  var esc = function(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  };
  var eCrewName = esc(crewName);
  var ePosLabel = esc(posLabel);

  var d = new Date(date);
  var fdate = isNaN(d) ? esc(date) : (('0'+d.getDate()).slice(-2) + '.' + ('0'+(d.getMonth()+1)).slice(-2) + '.' + d.getFullYear());

  var sendMail = function(to, subject, html) {
    var _key  = $os.getenv('RESEND_KEY');
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

  var confirmUrl = 'https://crewplanner.nyxlightwork.de?action=confirm&aid=' + aid;
  var declineUrl = 'https://crewplanner.nyxlightwork.de?action=decline&aid=' + aid;

  sendMail(crewEmail, 'ANFRAGE · ' + posLabel + ' · ' + fdate,
    '<!DOCTYPE html><html><head><meta charset="UTF-8"></head>' +
    '<body style="margin:0;padding:0;background:#f8f9fb;font-family:\'Courier New\',Courier,monospace;">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fb;padding:48px 20px;"><tr><td align="center">' +
    '<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e8e8e8;border-radius:4px;">' +
    '<tr><td style="padding:28px 36px;border-bottom:2px solid #e8c84a;"><span style="font-size:10px;letter-spacing:4px;color:#e8c84a;text-transform:uppercase;">nyx lightwork</span></td></tr>' +
    '<tr><td style="padding:36px 36px;">' +
    '<h1 style="font-size:36px;color:#1a1a2e;margin:0 0 6px 0;">Neue Anfrage.</h1>' +
    '<p style="font-size:10px;color:#e8c84a;letter-spacing:3px;margin:0 0 28px 0;text-transform:uppercase;">CREW ANFRAGE</p>' +
    '<p style="font-size:13px;color:#555570;line-height:1.8;margin:0 0 4px 0;">Hey ' + eCrewName + ',<br><br>du wurdest angefragt:</p>' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border:1px solid #e8e8e8;border-radius:2px;">' +
    '<tr style="background:#f8f9fb;"><td style="padding:11px 16px;font-size:9px;color:#999999;letter-spacing:2px;text-transform:uppercase;border-bottom:1px solid #e8e8e8;">POSITION</td>' +
    '<td style="padding:11px 16px;font-size:13px;color:#1a1a2e;font-weight:bold;border-bottom:1px solid #e8e8e8;">' + ePosLabel + '</td></tr>' +
    '<tr><td style="padding:11px 16px;font-size:9px;color:#999999;letter-spacing:2px;text-transform:uppercase;">DATUM</td>' +
    '<td style="padding:11px 16px;font-size:13px;color:#1a1a2e;">' + fdate + '</td></tr>' +
    '</table>' +
    '<table cellpadding="0" cellspacing="0"><tr>' +
    '<td style="padding-right:12px;"><table cellpadding="0" cellspacing="0"><tr><td style="background:#e8c84a;border-radius:2px;"><a href="' + confirmUrl + '" style="display:block;padding:13px 24px;font-family:\'Courier New\',Courier,monospace;font-size:11px;font-weight:bold;color:#0d0d1a;text-decoration:none;letter-spacing:3px;">✓ BESTÄTIGEN →</a></td></tr></table></td>' +
    '<td><table cellpadding="0" cellspacing="0"><tr><td style="background:#ffffff;border:1px solid #e8e8e8;border-radius:2px;"><a href="' + declineUrl + '" style="display:block;padding:13px 24px;font-family:\'Courier New\',Courier,monospace;font-size:11px;font-weight:bold;color:#555570;text-decoration:none;letter-spacing:3px;">✗ ABLEHNEN →</a></td></tr></table></td>' +
    '</tr></table>' +
    '</td></tr>' +
    '<tr><td style="padding:20px 36px;border-top:1px solid #e8e8e8;"><p style="font-size:9px;color:#999999;letter-spacing:2px;margin:0;text-transform:uppercase;">Tour Crew Plan · Nyx Lightwork · https://crewplanner.nyxlightwork.de</p></td></tr>' +
    '</table></td></tr></table></body></html>'
  );
}, 'assignments');

// ── 3. Anfrage (proposed via UPDATE) oder Absage (declined) ───────────────────
onRecordAfterUpdateSuccess(function(e) {
  e.next();
  var r      = e.record;
  var status = r.get('status');
  console.log('[hook] UPDATE assignments fired, status:', status, 'id:', r.id);

  var sendMail = function(to, subject, html) {
    var _key  = $os.getenv('RESEND_KEY');
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

  var esc = function(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  };

  var date     = r.get('date');
  var d        = new Date(date);
  var fdate    = isNaN(d) ? esc(date) : (('0'+d.getDate()).slice(-2) + '.' + ('0'+(d.getMonth()+1)).slice(-2) + '.' + d.getFullYear());
  var posLabel = r.get('pos_label') || r.get('pos_id');
  var ePosLabel = esc(posLabel);
  var aid      = r.id;

  if (status === 'proposed') {
    var crewEmail = r.get('crew_email');
    var crewName  = r.get('crew_name');
    if (!crewEmail) { console.error('[mail] proposed update: keine crew_email', aid); return; }

    // Kein doppeltes E-Mail wenn der Status schon 'proposed' war (z.B. pbUpsert ohne Status-Änderung)
    try {
      var orig = r.originalCopy();
      if (orig && orig.get('status') === 'proposed') {
        console.log('[hook] UPDATE proposed: Status unverändert, kein E-Mail gesendet', aid);
        return;
      }
    } catch(_) {}

    // Kein Anfrage-Mail wenn re-proposed durch Plan-Änderung — Update-Mail wird separat gesendet
    if (r.get('proposed_by') === 'update') {
      console.log('[hook] UPDATE re-proposed via plan-change, kein Anfrage-Mail', aid);
      return;
    }

    var eCrewName2 = esc(crewName);
    var confirmUrl2 = 'https://crewplanner.nyxlightwork.de?action=confirm&aid=' + aid;
    var declineUrl2 = 'https://crewplanner.nyxlightwork.de?action=decline&aid=' + aid;

    sendMail(crewEmail, 'ANFRAGE · ' + posLabel + ' · ' + fdate,
      '<!DOCTYPE html><html><head><meta charset="UTF-8"></head>' +
      '<body style="margin:0;padding:0;background:#f8f9fb;font-family:\'Courier New\',Courier,monospace;">' +
      '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fb;padding:48px 20px;"><tr><td align="center">' +
      '<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e8e8e8;border-radius:4px;">' +
      '<tr><td style="padding:28px 36px;border-bottom:2px solid #e8c84a;"><span style="font-size:10px;letter-spacing:4px;color:#e8c84a;text-transform:uppercase;">nyx lightwork</span></td></tr>' +
      '<tr><td style="padding:36px 36px;">' +
      '<h1 style="font-size:36px;color:#1a1a2e;margin:0 0 6px 0;">Neue Anfrage.</h1>' +
      '<p style="font-size:10px;color:#e8c84a;letter-spacing:3px;margin:0 0 28px 0;text-transform:uppercase;">CREW ANFRAGE</p>' +
      '<p style="font-size:13px;color:#555570;line-height:1.8;margin:0 0 4px 0;">Hey ' + eCrewName2 + ',<br><br>du wurdest angefragt:</p>' +
      '<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border:1px solid #e8e8e8;border-radius:2px;">' +
      '<tr style="background:#f8f9fb;"><td style="padding:11px 16px;font-size:9px;color:#999999;letter-spacing:2px;text-transform:uppercase;border-bottom:1px solid #e8e8e8;">POSITION</td>' +
      '<td style="padding:11px 16px;font-size:13px;color:#1a1a2e;font-weight:bold;border-bottom:1px solid #e8e8e8;">' + ePosLabel + '</td></tr>' +
      '<tr><td style="padding:11px 16px;font-size:9px;color:#999999;letter-spacing:2px;text-transform:uppercase;">DATUM</td>' +
      '<td style="padding:11px 16px;font-size:13px;color:#1a1a2e;">' + fdate + '</td></tr>' +
      '</table>' +
      '<table cellpadding="0" cellspacing="0"><tr>' +
      '<td style="padding-right:12px;"><table cellpadding="0" cellspacing="0"><tr><td style="background:#e8c84a;border-radius:2px;"><a href="' + confirmUrl2 + '" style="display:block;padding:13px 24px;font-family:\'Courier New\',Courier,monospace;font-size:11px;font-weight:bold;color:#0d0d1a;text-decoration:none;letter-spacing:3px;">✓ BESTÄTIGEN →</a></td></tr></table></td>' +
      '<td><table cellpadding="0" cellspacing="0"><tr><td style="background:#ffffff;border:1px solid #e8e8e8;border-radius:2px;"><a href="' + declineUrl2 + '" style="display:block;padding:13px 24px;font-family:\'Courier New\',Courier,monospace;font-size:11px;font-weight:bold;color:#555570;text-decoration:none;letter-spacing:3px;">✗ ABLEHNEN →</a></td></tr></table></td>' +
      '</tr></table>' +
      '</td></tr>' +
      '<tr><td style="padding:20px 36px;border-top:1px solid #e8e8e8;"><p style="font-size:9px;color:#999999;letter-spacing:2px;margin:0;text-transform:uppercase;">Tour Crew Plan · Nyx Lightwork · https://crewplanner.nyxlightwork.de</p></td></tr>' +
      '</table></td></tr></table></body></html>'
    );
    return;
  }

  if (status !== 'declined') return;

  var crewName = r.get('crew_name');
  var eCrewName3 = esc(crewName);
  var adminEmail = $os.getenv('ADMIN_EMAIL') || 'madmaxmail@web.de';
  sendMail(adminEmail, 'ABGELEHNT · ' + posLabel + ' · ' + fdate,
    '<!DOCTYPE html><html><head><meta charset="UTF-8"></head>' +
    '<body style="margin:0;padding:0;background:#f8f9fb;font-family:\'Courier New\',Courier,monospace;">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fb;padding:48px 20px;"><tr><td align="center">' +
    '<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e8e8e8;border-radius:4px;">' +
    '<tr><td style="padding:28px 36px;border-bottom:2px solid #e8c84a;"><span style="font-size:10px;letter-spacing:4px;color:#e8c84a;text-transform:uppercase;">nyx lightwork</span></td></tr>' +
    '<tr><td style="padding:36px 36px;">' +
    '<h1 style="font-size:36px;color:#e84a4a;margin:0 0 6px 0;">Abgelehnt.</h1>' +
    '<p style="font-size:10px;color:#e8c84a;letter-spacing:3px;margin:0 0 28px 0;text-transform:uppercase;">CREW ABSAGE</p>' +
    '<p style="font-size:13px;color:#555570;line-height:1.8;margin:0 0 4px 0;"><strong style="color:#e84a4a;">' + eCrewName3 + '</strong> hat abgelehnt:</p>' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border:1px solid #e8e8e8;border-radius:2px;">' +
    '<tr style="background:#f8f9fb;"><td style="padding:11px 16px;font-size:9px;color:#999999;letter-spacing:2px;text-transform:uppercase;border-bottom:1px solid #e8e8e8;">POSITION</td>' +
    '<td style="padding:11px 16px;font-size:13px;color:#1a1a2e;font-weight:bold;border-bottom:1px solid #e8e8e8;">' + ePosLabel + '</td></tr>' +
    '<tr style="background:#f8f9fb;"><td style="padding:11px 16px;font-size:9px;color:#999999;letter-spacing:2px;text-transform:uppercase;border-bottom:1px solid #e8e8e8;">DATUM</td>' +
    '<td style="padding:11px 16px;font-size:13px;color:#1a1a2e;border-bottom:1px solid #e8e8e8;">' + fdate + '</td></tr>' +
    '<tr><td style="padding:11px 16px;font-size:9px;color:#999999;letter-spacing:2px;text-transform:uppercase;">CREW</td>' +
    '<td style="padding:11px 16px;font-size:13px;color:#e84a4a;font-weight:bold;">' + eCrewName3 + '</td></tr>' +
    '</table>' +
    '<table cellpadding="0" cellspacing="0"><tr><td style="background:#f8f9fb;border:1px solid #e8e8e8;border-radius:2px;"><a href="https://crewplanner.nyxlightwork.de" style="display:block;padding:13px 24px;font-family:\'Courier New\',Courier,monospace;font-size:11px;font-weight:bold;color:#555570;text-decoration:none;letter-spacing:3px;">PLAN ÖFFNEN →</a></td></tr></table>' +
    '</td></tr>' +
    '<tr><td style="padding:20px 36px;border-top:1px solid #e8e8e8;"><p style="font-size:9px;color:#999999;letter-spacing:2px;margin:0;text-transform:uppercase;">Tour Crew Plan · Nyx Lightwork · https://crewplanner.nyxlightwork.de</p></td></tr>' +
    '</table></td></tr></table></body></html>'
  );
}, 'assignments');

// ── 3. Auto-Verify bei neuen Users ────────────────────────────────────────────
onRecordAfterCreateSuccess(function(e) {
  e.next();
  var record = e.record;
  if (record.getBool('verified')) return;
  record.set('verified', true);
  try {
    $app.save(record);
    console.log('[hook] User auto-verified: ' + record.getString('email'));
  } catch(err) {
    console.error('[hook] Auto-verify Fehler:', err.message);
  }
}, 'users');

