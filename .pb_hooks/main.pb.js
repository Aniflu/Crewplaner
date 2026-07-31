// ── NYX LIGHTWORK · Crewplaner E-Mail-Hook ──────────────────────────────────────
// PocketBase Goja JS Hook · Resend HTTP API (kein SMTP)
// Version: 4.12
console.log('[hook] main.pb.js v4.12 geladen');

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

  // ISO "YYYY-MM-DD" → "DD.MM.YYYY" — direkt aus String, KEINE TZ-Konvertierung
  var fmtISO = function(s) {
    var p = String(s || '').split('-');
    if (p.length < 3 || p[0].length !== 4) return esc(s);
    return (p[2] || '').substring(0,2) + '.' + p[1] + '.' + p[0];
  };

  var sendMail = function(to, subject, html) {
    try {
      var _key  = $os.getenv('RESEND_KEY');
      // Test-Umgebung ohne RESEND_KEY (v0.31.0): Mailversand bewusst aus → still überspringen,
      // kein sinnloser 401-Call an Resend. Live hat den Key → unverändertes Verhalten.
      if (!_key) { console.log('[mail] kein RESEND_KEY — Mailversand übersprungen (Test-Umgebung)'); return; }
      var _from = 'Tour Crew Plan <noreply@crewplanner.nyxlightwork.de>';
      var res = $http.send({
        url: 'https://api.resend.com/emails', method: 'POST',
        headers: { 'Authorization': 'Bearer ' + _key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: _from, to: [to], subject: subject, html: html })
      });
      var _success = res.statusCode < 400;
      if (!_success) { console.error('[mail] Resend Fehler ' + res.statusCode + ':', res.raw); }
      else { console.log('[mail] Gesendet an ' + to + ' · ' + subject); }
      try {
        var _logCol = $app.findCollectionByNameOrId('email_log');
        var _logRec = new Record(_logCol);
        _logRec.set('plan_id',    r.get('plan_id') || '');
        _logRec.set('crew_name',  name);
        _logRec.set('crew_email', email);
        _logRec.set('email_type', type);
        _logRec.set('sent_at',    new Date().toISOString());
        _logRec.set('success',    _success ? 'true' : 'false');
        $app.save(_logRec);
        console.log('[mail] email_log gespeichert · ' + type);
      } catch (logErr) { console.error('[mail] email_log Fehler:', logErr.message || String(logErr)); }
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

  var _crewGuide = 'https://crewplanner.nyxlightwork.de/docs/guide-crew.html';

  // Optionaler Freitext des Admins (Feld custom_message auf crew_invites) als Notiz-Block
  var noteBlock = function(msg) {
    if (!msg) return '';
    var safe = esc(msg).replace(/\n/g, '<br>');
    return '<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;background:#fffdf5;border-left:3px solid #e8c84a;border-radius:2px;">' +
      '<tr><td style="padding:14px 18px;font-size:13px;color:#555570;line-height:1.7;">' + safe + '</td></tr></table>';
  };
  var customMsg = r.get('custom_message') || '';

  var eName = esc(name);
  var ePlan = esc(plan);

  if (type === 'invite') {
    // app_url kann eine reine URL ODER (neu) ein JSON-Slot-Array sein → dann Terminliste rendern.
    var invSlots = [];
    if (appUrl && appUrl.charAt(0) === '[') { try { invSlots = JSON.parse(appUrl); } catch (_) { invSlots = []; } }
    var invBtnUrl = (invSlots && invSlots.length) ? 'https://crewplanner.nyxlightwork.de' : appUrl;
    var invTable = '';
    if (invSlots && invSlots.length) {
      var invRows = '';
      for (var iv = 0; iv < invSlots.length; iv++) {
        var isv = invSlots[iv];
        invRows += '<tr><td style="padding:10px 16px;font-size:13px;color:#1a1a2e;font-weight:bold;border-bottom:1px solid #e8e8e8;">' + fmtISO(isv.date) + '</td>' +
          '<td style="padding:10px 16px;font-size:13px;color:#555570;border-bottom:1px solid #e8e8e8;">' + esc(isv.posLabel) + '</td></tr>';
      }
      invTable =
        '<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border:1px solid #e8e8e8;border-radius:2px;">' +
        '<tr style="background:#f8f9fb;"><td style="padding:10px 16px;font-size:9px;color:#999999;letter-spacing:2px;text-transform:uppercase;border-bottom:2px solid #e8e8e8;">DATUM</td>' +
        '<td style="padding:10px 16px;font-size:9px;color:#999999;letter-spacing:2px;text-transform:uppercase;border-bottom:2px solid #e8e8e8;">POSITION</td></tr>' +
        invRows + '</table>';
    }
    sendMail(email, 'CREW INVITE · ' + plan, wrap(
      '<h1 style="font-size:36px;font-weight:bold;color:#1a1a2e;margin:0 0 6px 0;">Du bist dabei.</h1>' +
      '<p style="font-size:10px;color:#e8c84a;letter-spacing:3px;margin:0 0 28px 0;text-transform:uppercase;">CREW INVITE · ' + ePlan + '</p>' +
      '<p style="font-size:13px;color:#555570;line-height:1.8;margin:0 0 4px 0;">Hey ' + eName + ',<br><br>du wurdest f&uuml;r <strong style="color:#1a1a2e;">' + ePlan + '</strong> eingeladen.' +
      (invTable ? ' Bitte best&auml;tige deine Eins&auml;tze:' : '') + '</p>' +
      invTable +
      noteBlock(customMsg) +
      mkBtn(invBtnUrl, 'EINS&Auml;TZE BEST&Auml;TIGEN &rarr;') +
      mkBtn(_crewGuide, 'ANLEITUNG &rarr;', '#f8f9fb', '#555570')
    ));
  } else if (type === 'reminder') {
    sendMail(email, 'REMINDER · ' + plan, wrap(
      '<h1 style="font-size:36px;font-weight:bold;color:#1a1a2e;margin:0 0 6px 0;">Noch ausstehend.</h1>' +
      '<p style="font-size:10px;color:#e8c84a;letter-spacing:3px;margin:0 0 28px 0;text-transform:uppercase;">REMINDER · ' + ePlan + '</p>' +
      '<p style="font-size:13px;color:#555570;line-height:1.8;margin:0 0 24px 0;">Hey ' + eName + ',<br><br>bitte bestätige oder lehne deine Einsätze für <strong style="color:#1a1a2e;">' + ePlan + '</strong> ab.</p>' +
      noteBlock(customMsg) +
      mkBtn(appUrl, 'JETZT BESTÄTIGEN →')
    ));
  } else if (type === 'cancellation') {
    var slots = [];
    // app_url field is intentionally reused to transport JSON slot data for cancellation mails
    try { slots = JSON.parse(appUrl || '[]'); } catch (_) {}
    var rowsHtml = '';
    for (var i = 0; i < slots.length; i++) {
      var s = slots[i];
      var fd2 = fmtISO(s.date);
      rowsHtml += '<tr><td style="padding:10px 16px;font-size:13px;color:#1a1a2e;font-weight:bold;border-bottom:1px solid #e8e8e8;">' + esc(s.posLabel) + '</td>' +
        '<td style="padding:10px 16px;font-size:13px;color:#555570;border-bottom:1px solid #e8e8e8;">' + fd2 + '</td></tr>';
    }
    sendMail(email, 'PLAN UPDATE · ' + plan, wrap(
      '<h1 style="font-size:36px;font-weight:bold;color:#e84a4a;margin:0 0 6px 0;">Plan ge&auml;ndert.</h1>' +
      '<p style="font-size:10px;color:#e8c84a;letter-spacing:3px;margin:0 0 28px 0;text-transform:uppercase;">PLAN UPDATE · ' + ePlan + '</p>' +
      '<p style="font-size:13px;color:#555570;line-height:1.8;margin:0 0 4px 0;">Hey ' + eName + ',<br><br>folgende Eins&auml;tze wurden aus deinem Plan entfernt:</p>' +
      noteBlock(customMsg) +
      '<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border:1px solid #e8e8e8;border-radius:2px;">' +
      '<tr style="background:#f8f9fb;"><td style="padding:10px 16px;font-size:9px;color:#999999;letter-spacing:2px;text-transform:uppercase;border-bottom:2px solid #e8e8e8;">POSITION</td>' +
      '<td style="padding:10px 16px;font-size:9px;color:#999999;letter-spacing:2px;text-transform:uppercase;border-bottom:2px solid #e8e8e8;">DATUM</td></tr>' +
      rowsHtml + '</table>' +
      mkBtn('https://crewplanner.nyxlightwork.de', 'APP &Ouml;FFNEN &rarr;', '#f8f9fb', '#555570')
    ));
    console.log('[hook] cancellation email sent to ' + email + ' (' + slots.length + ' slots)');
  } else if (type === 'availability') {
    var avSlots = [];
    try { avSlots = JSON.parse(appUrl || '[]'); } catch (_) {}
    var avRows = '';
    for (var i = 0; i < avSlots.length; i++) {
      var s = avSlots[i];
      var fdv = fmtISO(s.date);
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
    // v4.10: Slots nach kind trennen — 'removed' = entfernte Termine (GESEHEN-Quittung).
    // v4.12: 'status' = Statuswechsel bestätigt ⇄ vorgemerkt (Termin bleibt, nur die
    // Verbindlichkeit ändert sich). Alles andere (auch ohne kind, rückwärtskompatibel)
    // = neue/geänderte Termine.
    var upNew = [], upRem = [], upPen = [], upCnf = [], ackIds = [];
    for (var i = 0; i < upSlots.length; i++) {
      if (!upSlots[i]) continue;
      if (upSlots[i].kind === 'removed') {
        upRem.push(upSlots[i]);
        if (upSlots[i].aid) ackIds.push(upSlots[i].aid);
      } else if (upSlots[i].kind === 'status') {
        if (upSlots[i].to === 'confirmed') upCnf.push(upSlots[i]);
        else upPen.push(upSlots[i]);
      } else { upNew.push(upSlots[i]); }
    }
    function upTable(rows, chgColor) {
      var out = '<table width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0 24px 0;border:1px solid #e8e8e8;border-radius:2px;">'+
        '<tr style="background:#f8f9fb;">'+
        '<td style="padding:10px 16px;font-size:9px;color:#999999;letter-spacing:2px;text-transform:uppercase;border-bottom:2px solid #e8e8e8;">DATUM</td>'+
        '<td style="padding:10px 16px;font-size:9px;color:#999999;letter-spacing:2px;text-transform:uppercase;border-bottom:2px solid #e8e8e8;">POSITION</td></tr>';
      for (var j = 0; j < rows.length; j++) {
        out += '<tr><td style="padding:10px 16px;font-size:13px;color:#1a1a2e;font-weight:bold;border-bottom:1px solid #e8e8e8;">'+fmtISO(rows[j].date)+'</td>'+
          '<td style="padding:10px 16px;font-size:13px;color:'+chgColor+';border-bottom:1px solid #e8e8e8;">'+esc(rows[j].posLabel||'')+'</td></tr>';
      }
      return out + '</table>';
    }
    var upBody = '<h1 style="font-size:36px;font-weight:bold;color:#1a1a2e;margin:0 0 6px 0;">Es gab &Auml;nderungen.</h1>'+
      '<p style="font-size:10px;color:#e8c84a;letter-spacing:3px;margin:0 0 28px 0;text-transform:uppercase;">PLAN GE&Auml;NDERT · '+ePlan+'</p>'+
      '<p style="font-size:13px;color:#555570;line-height:1.8;margin:0 0 4px 0;">Hallo '+eName+',<br><br>in der Tour <strong style="color:#1a1a2e;">'+ePlan+'</strong> haben sich folgende &Auml;nderungen ergeben:</p>'+
      noteBlock(customMsg);
    if (upNew.length) {
      upBody += '<p style="font-size:13px;color:#2d6a3f;font-weight:bold;margin:24px 0 0 0;">&#10133; Neue Termine &mdash; bitte best&auml;tige, dass du Zeit hast:</p>'+
        upTable(upNew, '#555570')+
        mkBtn('https://crewplanner.nyxlightwork.de', 'TERMINE BEST&Auml;TIGEN &rarr;');
    }
    if (upRem.length) {
      upBody += '<p style="font-size:13px;color:#e84a4a;font-weight:bold;margin:24px 0 0 0;">&#10134; Entfernte Termine &mdash; bitte best&auml;tige, dass du die &Auml;nderung gesehen hast:</p>'+
        upTable(upRem, '#e84a4a');
      if (ackIds.length) {
        upBody += mkBtn('https://crewplanner.nyxlightwork.de?action=ackcancel&aids='+ackIds.join(','), '&Auml;NDERUNGEN GESEHEN &#10003;', '#f8f9fb', '#555570');
      }
    }
    // v4.12: Statuswechsel — der Termin bleibt bestehen, nur die Verbindlichkeit ändert
    // sich. Bewusst OHNE Aktions-Button: hier ist nichts zu bestätigen.
    if (upPen.length) {
      upBody += '<p style="font-size:13px;color:#7A5FB3;font-weight:bold;margin:24px 0 0 0;">&#9998; Jetzt vorgemerkt &mdash; vorl&auml;ufig geplant, noch nicht verbindlich:</p>'+
        upTable(upPen, '#7A5FB3')+
        '<p style="font-size:12px;color:#555570;line-height:1.7;margin:0 0 16px 0;">Du musst nichts tun. Die Termine bleiben in deinem Kalender, sind aber noch nicht fest &mdash; wir melden uns, sobald sie verbindlich werden.</p>';
    }
    if (upCnf.length) {
      upBody += '<p style="font-size:13px;color:#2d6a3f;font-weight:bold;margin:24px 0 0 0;">&#10003; Wieder verbindlich best&auml;tigt:</p>'+
        upTable(upCnf, '#2d6a3f')+
        '<p style="font-size:12px;color:#555570;line-height:1.7;margin:0 0 16px 0;">Diese Termine sind jetzt wieder fest eingeplant.</p>';
    }
    sendMail(email, 'ÄNDERUNG · ' + plan, wrap(upBody));
    console.log('[hook] update email sent to '+email+' ('+upNew.length+' neu, '+upRem.length+' entfernt, '+upPen.length+' vorgemerkt, '+upCnf.length+' bestätigt)');
  } else if (type === 'love_invite') {
    var _lGuide = 'https://crewplanner.nyxlightwork.de/docs/guide-admin.html';
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
    var _guideUrl = 'https://crewplanner.nyxlightwork.de/docs/guide-admin.html';
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


// ── 3. Anfrage (proposed via UPDATE) oder Absage (declined) ───────────────────
onRecordAfterUpdateSuccess(function(e) {
  e.next();
  var r      = e.record;
  var status = r.get('status');
  console.log('[hook] UPDATE assignments fired, status:', status, 'id:', r.id);

  var sendMail = function(to, subject, html) {
    var _key  = $os.getenv('RESEND_KEY');
    // Test-Umgebung ohne RESEND_KEY (v0.31.0): Mailversand bewusst aus → still überspringen.
    if (!_key) { console.log('[mail] kein RESEND_KEY — Mailversand übersprungen (Test-Umgebung)'); return; }
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
  var fmtISO = function(s) {
    var p = String(s || '').split('-');
    if (p.length < 3 || p[0].length !== 4) return esc(s);
    return (p[2] || '').substring(0,2) + '.' + p[1] + '.' + p[0];
  };

  var date     = r.get('date');
  var fdate    = fmtISO(date);
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

    // Keine per-Slot-Anfrage-Mail bei Bulk-Operationen (Einladen/Update/Queue senden
    // ihre eigene konsolidierte Mail). 'update' = Plan-Änderungs-Queue, 'bulk' = Invite/Update.
    var _pb = r.get('proposed_by');
    if (_pb === 'update' || _pb === 'bulk') {
      console.log('[hook] UPDATE re-proposed via bulk/plan-change, kein Anfrage-Mail', aid);
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

// ── 3. Auto-Verify + Pool-Rolle bei neuen Users ───────────────────────────────
onRecordAfterCreateSuccess(function(e) {
  e.next();
  var record = e.record;
  var changed = false;

  if (!record.getBool('verified')) { record.set('verified', true); changed = true; }

  // Persönlichen Kalender-Feed-Token vergeben (v4.9): nicht-erratbarer Schlüssel für
  // die öffentliche Abo-Route /ics/{token}. Nur setzen, wenn noch keiner existiert.
  if (!record.getString('feed_token')) {
    try { record.set('feed_token', $security.randomString(40)); changed = true; } catch(err) {}
  }

  // Rolle aus dem globalen Crew-Pool übernehmen (crew_members mit plan_id="__pool__"):
  // Ein Konto entsteht erst beim ersten Login über den Einladungslink (Default-Rolle 'crew').
  // Hat der Admin die Person im Pool mit einer ANDEREN Rolle angelegt, greift sie genau hier.
  try {
    var email = (record.getString('email') || '').toLowerCase();
    if (email && record.getString('role') === 'crew') {
      var pool = $app.findFirstRecordByFilter('crew_members', 'plan_id = "__pool__" && email = {:email}', { email: email });
      if (pool) {
        var poolRole = pool.getString('role');
        if (poolRole && poolRole !== 'crew') { record.set('role', poolRole); changed = true; }
      }
    }
  } catch(err) {
    // kein Pool-Treffer oder Query-Fehler → Default-Rolle behalten (kein harter Fehler)
  }

  if (changed) {
    try {
      $app.save(record);
      console.log('[hook] User post-create gesetzt (verify/role): ' + record.getString('email') + ' → ' + record.getString('role'));
    } catch(err) {
      console.error('[hook] User post-create Fehler:', err.message);
    }
  }
}, 'users');


// ── 4. Short-URL für View-Link (plans view_token Update) ─────────────────────
onRecordAfterUpdateSuccess(function(e) {
  e.next();
  var r = e.record;
  var token = r.get('view_token');
  if (!token) return;
  var existing = r.get('view_shorturl') || '';
  // Nur generieren wenn noch kein Short-URL gesetzt oder Token sich geändert hat
  if (existing && existing.indexOf('is.gd') !== -1) return;
  try {
    var fullUrl = 'https://crewplanner.nyxlightwork.de/view.html?token=' + token;
    var res = $http.send({
      url: 'https://is.gd/create.php?format=simple&url=' + encodeURIComponent(fullUrl),
      method: 'GET'
    });
    if (res.statusCode === 200 && res.raw && res.raw.indexOf('is.gd') !== -1) {
      r.set('view_shorturl', res.raw.trim());
      $app.save(r);
      console.log('[hook] Short-URL generiert: ' + res.raw.trim());
    }
  } catch(err) {
    console.error('[hook] Short-URL Fehler:', err.message);
  }
}, 'plans');


// ── 5. Kalender-Feed-Token: Backfill bestehender User (v4.9) ──────────────────
// Selbstheilend beim Start: alle users ohne feed_token bekommen einmalig einen
// nicht-erratbaren Token (neue User kriegen ihn bereits im CREATE-Hook oben).
onBootstrap(function(e) {
  e.next();
  try {
    var missing = $app.findRecordsByFilter('users', 'feed_token = ""', '', 500, 0);
    var n = 0;
    for (var i = 0; i < missing.length; i++) {
      try { missing[i].set('feed_token', $security.randomString(40)); $app.save(missing[i]); n++; } catch(err) {}
    }
    if (n) console.log('[hook] feed_token backfilled: ' + n + ' user');
  } catch(err) {
    console.error('[hook] feed_token backfill Fehler:', err.message);
  }
});


// ── 6. Öffentlicher, abonnierbarer Kalender-Feed pro Person + TOUR (v4.9.2) ───
// GET /ics/{token}/{plan}  (unauthentifiziert — der nicht-erratbare feed_token IST die Auth).
// Liefert den persönlichen ICS-Feed EINER Person für GENAU EINE Tour ({plan} = PB-Plan-ID):
// bestätigte Einsätze als STATUS:CONFIRMED, noch offene Anfragen als STATUS:TENTATIVE.
// Kalender-Apps holen die URL periodisch → automatische Aktualisierung. Goja-Isolation:
// alle Helfer + Literale INNERHALB des Handlers (kein Zugriff auf äußeren Scope).
routerAdd('GET', '/ics/{token}/{plan}', function(e) {
  var token = e.request.pathValue('token');
  var planFilter = e.request.pathValue('plan');
  if (!token || !planFilter) return e.string(404, 'not found');

  var user;
  try { user = $app.findFirstRecordByFilter('users', 'feed_token = {:t}', { t: token }); }
  catch(err) { user = null; }
  if (!user) return e.string(404, 'not found');

  var email = (user.getString('email') || '').toLowerCase();

  function icsEsc(s){ return String(s == null ? '' : s).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n'); }
  function ymd(iso){ return String(iso || '').replace(/-/g, ''); }
  function nextYmd(iso){
    var p = String(iso || '').split('-');
    var dt = new Date(Date.UTC(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10) + 1));
    var mm = ('0' + (dt.getUTCMonth() + 1)).slice(-2);
    var dd = ('0' + dt.getUTCDate()).slice(-2);
    return '' + dt.getUTCFullYear() + mm + dd;
  }

  var rows;
  try {
    rows = $app.findRecordsByFilter(
      'assignments',
      'crew_email = {:e} && plan_id = {:p} && (status = "confirmed" || status = "proposed" || status = "pencilled")',
      'date', 2000, 0, { e: email, p: planFilter }
    );
  } catch(err) { rows = []; }

  // Bandname + Ort/Art pro Datum liegen im plans.plan_data (JSON), NICHT im assignment.
  // Pro Plan einmal laden und cachen.
  var planCache = {};
  function planMeta(planId){
    if (planCache[planId]) return planCache[planId];
    var meta = { band: 'Tour', dates: {} };
    try {
      var plan = $app.findRecordById('plans', planId);
      if (plan) {
        meta.band = plan.getString('name') || 'Tour';
        // plan_data ist ein JSON-Feld → im Goja-Hook als JSONRaw([]byte). getString liefert
        // den JSON-TEXT (cast.ToString) → parsen. Fallback auf .get(), falls schon Objekt.
        var pd = null;
        try { var s = plan.getString('plan_data'); if (s) pd = JSON.parse(s); } catch(e2) {}
        if (!pd) { try { var g = plan.get('plan_data'); if (g && g.tourDates) pd = g; } catch(e3) {} }
        var td = (pd && pd.tourDates) || [];
        for (var j = 0; j < td.length; j++) {
          if (td[j] && td[j].date) meta.dates[td[j].date] = td[j];
        }
      }
    } catch(err) {}
    planCache[planId] = meta;
    return meta;
  }

  // Pro (plan_id + date) EIN Ganztags-Event (Positionen zusammengefasst, wie der Download).
  // Der höchste Rang des Tages bestimmt den Status: bestätigt schlägt angefragt schlägt
  // vorgemerkt. Vorgemerkte Termine bleiben seit v4.12 im Feed (vorher fielen sie raus und
  // verschwanden lautlos aus dem Kalender der Person) — sie tragen ihren Status im Infofeld.
  var RANK = { pencilled: 1, proposed: 2, confirmed: 3 };
  var LABEL = { pencilled: 'Vorgemerkt', proposed: 'Angefragt', confirmed: 'Bestätigt' };
  var days = {};
  for (var i = 0; i < rows.length; i++) {
    var planId = rows[i].getString('plan_id');
    var date   = rows[i].getString('date');
    if (!date) continue;
    var st = rows[i].getString('status');
    var rank = RANK[st] || 0;
    if (!rank) continue;
    var key = planId + '|' + date;
    if (!days[key]) days[key] = { planId: planId, date: date, rank: 0, status: '' };
    if (rank > days[key].rank) { days[key].rank = rank; days[key].status = st; }
  }

  var out = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Crewplaner//Feed v4.9//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Crewplaner'];
  var keys = Object.keys(days);
  for (var k = 0; k < keys.length; k++) {
    var d = days[keys[k]];
    var m = planMeta(d.planId);
    var dm = m.dates[d.date] || {};
    var loc = dm.loc || '';
    var art = dm.typeLabel || dm.type || '';
    var title = [art, loc].filter(Boolean).join(': ') || m.band;
    out.push(
      'BEGIN:VEVENT',
      'UID:' + d.planId + '-' + d.date + '@crewplanner',
      'DTSTART;VALUE=DATE:' + ymd(d.date),
      'DTEND;VALUE=DATE:' + nextYmd(d.date),
      'SUMMARY:' + icsEsc(title),
      'LOCATION:' + icsEsc(loc),
      'DESCRIPTION:' + icsEsc('Band: ' + m.band + '\nArt: ' + art + '\nOrt: ' + loc + '\nStatus: ' + (LABEL[d.status] || '')),
      'STATUS:' + (d.status === 'confirmed' ? 'CONFIRMED' : 'TENTATIVE'),
      'END:VEVENT'
    );
  }
  out.push('END:VCALENDAR');

  e.response.header().set('Content-Type', 'text/calendar; charset=utf-8');
  e.response.header().set('Content-Disposition', 'inline; filename="crewplanner.ics"');
  e.response.header().set('Cache-Control', 'public, max-age=1800');
  return e.string(200, out.join('\r\n'));
});
