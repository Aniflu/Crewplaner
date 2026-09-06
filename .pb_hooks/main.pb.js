// ── NYX LIGHTWORK · Crewplaner E-Mail-Hook ──────────────────────────────────────
// PocketBase Goja JS Hook · Resend HTTP API (kein SMTP)
// Version: 4.23
console.log('[hook] main.pb.js v4.23 geladen');

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
    // v0.8.0: Die Adresse stand hier fest verdrahtet — und die Hook-Datei wird über
    // crewplanner.nyxlightwork.de/.pb_hooks/main.pb.js öffentlich ausgeliefert. Zusammen mit
    // dem fehlenden Rate-Limiting am Login war das ein benanntes Angriffsziel. Jetzt kommt sie
    // ausschließlich aus der Umgebung. ⚠️ Ohne gesetztes ADMIN_EMAIL geht diese Mail NICHT
    // raus — die Variable muss in Coolify auf BEIDEN Instanzen gesetzt sein.
    var avAdmin = $os.getenv('ADMIN_EMAIL');
    if (!avAdmin) {
      console.error('[hook] ADMIN_EMAIL ist nicht gesetzt — Bereitschafts-Mail an den Planer entfaellt');
      return;
    }
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
    // v4.21: KEINE Terminlisten mehr. Vorher stand hier je Art eine Tabelle mit allen Daten —
    // bei einer 60-Tage-Tour wurde die Mail unlesbar lang, und aktuell bleibt sie ohnehin nicht:
    // Wer sie später öffnet, liest einen Stand von gestern. Der verlässliche Ort ist die App.
    // Deshalb nur noch: WAS für eine Änderung, plus der Weg dorthin.
    //
    // Die Einteilung in die vier Arten bleibt — sie steuert Satz und Knopf. Die `aids` der
    // entfallenen Termine werden weiter mitgegeben; der Knopf ist die Quittung („GESEHEN").
    var anz = function (n, ein, viele) { return n === 1 ? ein : n + ' ' + viele; };

    var upBody = '<h1 style="font-size:36px;font-weight:bold;color:#1a1a2e;margin:0 0 6px 0;">Es gab &Auml;nderungen.</h1>'+
      '<p style="font-size:10px;color:#e8c84a;letter-spacing:3px;margin:0 0 28px 0;text-transform:uppercase;">PLAN GE&Auml;NDERT · '+ePlan+'</p>'+
      '<p style="font-size:13px;color:#555570;line-height:1.8;margin:0 0 4px 0;">Hallo '+eName+',<br><br>in der Tour <strong style="color:#1a1a2e;">'+ePlan+'</strong> hat sich etwas ge&auml;ndert:</p>'+
      noteBlock(customMsg);

    if (upNew.length) {
      upBody += '<p style="font-size:13px;color:#2d6a3f;font-weight:bold;margin:24px 0 8px 0;">&#10133; '+
        anz(upNew.length, 'Ein neuer Termin', 'neue Termine')+' &mdash; bitte best&auml;tige, dass du Zeit hast.</p>'+
        mkBtn('https://crewplanner.nyxlightwork.de', 'TERMINE BEST&Auml;TIGEN &rarr;');
    }
    if (upRem.length) {
      upBody += '<p style="font-size:13px;color:#e84a4a;font-weight:bold;margin:24px 0 8px 0;">&#10134; '+
        anz(upRem.length, 'Ein Termin ist entfallen', 'Termine sind entfallen')+'.</p>';
      if (ackIds.length) {
        upBody += mkBtn('https://crewplanner.nyxlightwork.de?action=ackcancel&aids='+ackIds.join(','), '&Auml;NDERUNGEN GESEHEN &#10003;', '#f8f9fb', '#555570');
      }
    }
    // Statuswechsel: Der Termin bleibt bestehen, nur die Verbindlichkeit ändert sich.
    // Bewusst OHNE Aktions-Button — hier ist nichts zu bestätigen.
    if (upPen.length) {
      upBody += '<p style="font-size:13px;color:#7A5FB3;font-weight:bold;margin:24px 0 4px 0;">&#9998; '+
        anz(upPen.length, 'Ein Termin ist jetzt vorgemerkt', 'Termine sind jetzt vorgemerkt')+'.</p>'+
        '<p style="font-size:12px;color:#555570;line-height:1.7;margin:0 0 16px 0;">Du musst nichts tun &mdash; vorl&auml;ufig geplant, noch nicht verbindlich. Wir melden uns, sobald es fest wird.</p>';
    }
    if (upCnf.length) {
      upBody += '<p style="font-size:13px;color:#2d6a3f;font-weight:bold;margin:24px 0 4px 0;">&#10003; '+
        anz(upCnf.length, 'Ein Termin ist wieder fest', 'Termine sind wieder fest')+'.</p>';
    }

    upBody += '<p style="font-size:13px;color:#555570;line-height:1.8;margin:28px 0 0 0;border-top:1px solid #e8e8e8;padding-top:20px;">'+
      'Welche Tage betroffen sind, siehst du nach dem Einloggen &mdash; dort steht immer der aktuelle Stand.</p>'+
      mkBtn('https://crewplanner.nyxlightwork.de', 'PLAN &Ouml;FFNEN &rarr;', '#f8f9fb', '#555570');
    sendMail(email, 'ÄNDERUNG · ' + plan, wrap(upBody));
    console.log('[hook] update email sent to '+email+' ('+upNew.length+' neu, '+upRem.length+' entfernt, '+upPen.length+' vorgemerkt, '+upCnf.length+' bestätigt)');
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
  // v0.8.0: siehe Begründung beim Bereitschafts-Versand — keine fest verdrahtete Adresse
  // mehr in einer öffentlich ausgelieferten Datei.
  var adminEmail = $os.getenv('ADMIN_EMAIL');
  if (!adminEmail) {
    console.error('[hook] ADMIN_EMAIL ist nicht gesetzt — Absage-Meldung an den Planer entfaellt');
    return;
  }
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
// ── 3b. Registrierungs-Sperre: nur freigegebene E-Mail-Adressen (v4.13) ───────
// Ein Konto darf nur entstehen, wenn die Adresse vorher vom Planer angelegt wurde —
// also irgendwo in `crew_members` steht (globaler Pool ODER Crew einer Tour).
// Vorher war `users.createRule` leer: JEDE beliebige Adresse konnte sich selbst ein
// Konto anlegen.
//
// Zwei Ebenen bewusst: die `createRule` ist das harte Tor, DIESER Hook die dauerhafte
// zweite Schicht — Zugriffsregeln fallen bei Coolify-Redeploy/Schema-Reimport auf den
// permissiven Stand zurück (mehrfach passiert), Hook-Dateien überleben das.
// Zusätzlich prüft der Hook KLEINGESCHRIEBEN, die Regel kann das nicht (PB `=` ist
// case-sensitiv) — fängt also auch gemischtschreibende crew_members-Einträge.
// ⚠️ ACHTUNG, Abweichung von der Projekt-Regel „e.next() zuerst": Die gilt für BEOBACHTENDE
// Hooks (onRecord*Success). Dies ist ein BLOCKIERENDER Request-Hook — `e.next()` führt die
// Kette inkl. Anlegen aus. Die Prüfung MUSS also davor stehen, sonst ist der Datensatz
// bereits erzeugt und die Sperre wirkungslos.
onRecordCreateRequest(function(e) {
  var mail = '';
  try { mail = String(e.record.getString('email') || '').trim().toLowerCase(); } catch (err) { mail = ''; }
  if (!mail) throw new BadRequestError('not_allowlisted: E-Mail fehlt.');

  var allowed = null;
  try {
    allowed = $app.findFirstRecordByFilter('crew_members', 'email = {:m}', { m: mail });
  } catch (err) {
    // Kein Treffer wirft hier ebenfalls → als „nicht freigegeben" behandeln (im Zweifel NICHT anlegen).
    allowed = null;
  }
  if (!allowed) {
    // Kennung `not_allowlisted` → login.html erkennt sie und zeigt den freundlichen Hinweis.
    // Bewusst OHNE Auskunft darüber, ob die Adresse bereits ein Konto hat.
    console.log('[hook] Registrierung abgewiesen (nicht freigegeben): ' + mail);
    throw new BadRequestError('not_allowlisted: Diese E-Mail-Adresse ist nicht freigegeben.');
  }

  e.next();
}, 'users');


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

  // Rolle aus der Freigabeliste übernehmen. Das Konto entsteht mit Default-Rolle 'crew'
  // (login.html kann users.role nicht selbst setzen, updateRule = superadmin) — die vom
  // Planer hinterlegte Rolle greift genau hier.
  // v4.13: Quelle ist nicht mehr nur der globale Pool, sondern jeder crew_members-Eintrag
  // mit dieser Adresse (Pool ODER Tour-Crew) — passend zur Registrierungs-Sperre oben.
  // Der Pool hat Vorrang, weil dort die Rolle bewusst gesetzt wird.
  try {
    var email = (record.getString('email') || '').toLowerCase();
    if (email && record.getString('role') === 'crew') {
      var src = null;
      try {
        src = $app.findFirstRecordByFilter('crew_members', 'plan_id = "__pool__" && email = {:email}', { email: email });
      } catch(err2) { src = null; }
      if (!src || !src.getString('role')) {
        try {
          var any = $app.findFirstRecordByFilter('crew_members', 'email = {:email} && role != ""', { email: email });
          if (any) src = any;
        } catch(err3) {}
      }
      if (src) {
        var srcRole = src.getString('role');
        if (srcRole && srcRole !== 'crew') { record.set('role', srcRole); changed = true; }
      }
    }
  } catch(err) {
    // kein Treffer oder Query-Fehler → Default-Rolle behalten (kein harter Fehler)
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


// ── 4. Kurzlink über is.gd — ENTFERNT in v4.16 ───────────────────────────────
// Der Hook schickte bei jeder view_token-Änderung die VOLLSTÄNDIGE Ansichts-URL
// inklusive Token an is.gd. Der Token soll ein Geheimnis sein — ihn an einen fremden
// Dienst zu übertragen, der ihn dauerhaft speichert (und dessen kurze Adressen
// durchprobierbar sind), untergräbt genau das. Zudem funktionierte der Aufruf vom
// Server aus zuletzt ohnehin nicht mehr (Kurzlinks blieben leer, auch nach erneutem
// Anstoßen; is.gd ist von außen erreichbar, vom Server offenbar nicht).
//
// Die Konsole fällt sauber auf die lange URL zurück (admin.html: `view_shorturl || fullUrl`),
// der Booker-Link funktioniert also unverändert — nur länger.
// Das Feld `view_shorturl` bleibt im Schema, damit alte Datensätze nichts verlieren.


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
// ── 7c. Pläne für angemeldete Crew (v4.16) ───────────────────────────────────
// GET /myplans        → [{id, name}] der Touren, in denen der Anmeldete Crew ist
// GET /myplan/{id}    → { id, name, plan_data } EINER Tour
//
// Warum nicht direkt über die plans-REST-API: Dort kommt der komplette Datensatz
// zurück — inklusive `view_token`. Der soll ein echtes Geheimnis sein, und ein
// Crew-Mitglied hat keinen Grund, den öffentlichen Link seiner Tour zu kennen.
// Als verstecktes Feld geht es nicht: die Konsole braucht den Token, läuft aber als
// App-Rolle `superadmin`, nicht als PocketBase-Superuser.
//
// Zugriff: Owner ODER App-Rolle superadmin ODER als crew_members in DIESER Tour.
// Dieselbe Logik wie die plans-Regel — nur dass die Antwort hier gefiltert ist.
// Goja-Isolation: alle Helfer/Literale INNERHALB der Handler.
// ── 7b. CORS eingrenzen (v4.17, wirksam erst ab v4.18) ───────────────────────
// PocketBase antwortet standardmäßig JEDER Herkunft mit `Access-Control-Allow-Origin: *`
// (gemessen 2026-08-05: das `*` kommt zusammen mit `Vary: Origin` und den PB-Security-
// Headern, auch auf Hook-Routen, die Traefik nicht anfasst — es stammt also aus PocketBase,
// nicht aus dem Reverse-Proxy). Die Doku behauptete seit jeher, nur zwei Herkünfte seien
// erlaubt; das stimmte nicht.
//
// Praktisch war der Schaden gering (alle Collections verlangen Anmeldung, das Token liegt
// origin-isoliert im Browser-Speicher), aber „steht so in der Doku" ist kein Sicherheitsniveau.
//
// Die erlaubte Herkunft ergibt sich aus dem eigenen Hostnamen — so braucht es weder eine
// Umgebungsvariable noch unterschiedliche Hook-Dateien je Instanz:
//   api.crewplanner…      → nur  https://crewplanner.nyxlightwork.de (+ www)
//   api-test.crewplanner… → nur  https://aniflu.github.io  (+ localhost fürs Entwickeln)
//
// AUSNAHME: die token-geschützten öffentlichen Routen (/viewplan, /viewstatus, /ics) bleiben
// bei `*` — sie sind bewusst für jeden abrufbar, dort IST der Token die Zugangsberechtigung.
//
// ⚠️ REIHENFOLGE (Korrektur in v4.18, vom Admin am 2026-08-05 gemessen und behoben):
// Die Header müssen VOR `e.next()` gesetzt werden. `e.next()` arbeitet den kompletten Request
// ab; sobald der Handler den Body schreibt, sind die Header in Go raus (`WriteHeader` ist
// gefallen) und jedes spätere `Header().Set()`/`.Del()` läuft wirkungslos ins Leere — ohne
// Fehler, ohne Log-Eintrag. Genau so war v4.17: geladen, gelaufen, ohne jede Wirkung.
// Das ist DIESELBE Falle wie bei Hook v4.13: die Projektregel „e.next() zuerst" gilt nur für
// BEOBACHTENDE Hooks (onRecord*Success). Wer den Request beeinflusst — abweisen wie v4.13,
// Header setzen wie hier —, muss VOR e.next() handeln.
//
// Und die Falle IN der Korrektur: die Bedingungen dürfen nicht mit `return` abbrechen, sonst
// überspringen sie das `e.next()` und der Request wird nie abgearbeitet (die öffentlichen
// Routen wären als erste tot). Deshalb: eine Bedingung statt drei `return`s, und
// `return e.next()` als letzte Zeile — auf jedem Weg genau einmal.
//
// Bestätigt: PocketBases eigene CORS-Middleware läuft VOR den routerUse-Hooks, ein set/del
// davor gewinnt also gegen ihr `*`.
routerUse(function(e) {
  try {
    var pfad = '';
    try { pfad = String(e.request.url.path || ''); } catch (err0) { pfad = ''; }
    var oeffentlich = (pfad.indexOf('/viewplan/') === 0 || pfad.indexOf('/viewstatus/') === 0 || pfad.indexOf('/ics/') === 0);

    var origin = '';
    try { origin = String(e.request.header.get('Origin') || ''); } catch (err1) { origin = ''; }
    // Kein Origin = kein Browser-Aufruf (curl, Server) → CORS irrelevant, Header bleiben wie sie sind.

    var host = '';
    try { host = String(e.request.host || ''); } catch (err2) { host = ''; }

    if (!oeffentlich && origin) {

      var erlaubt;
      if (host.indexOf('api-test.') === 0) {
        erlaubt = ['https://aniflu.github.io', 'http://localhost:8080', 'http://127.0.0.1:8080'];
      } else {
        erlaubt = ['https://crewplanner.nyxlightwork.de', 'https://www.crewplanner.nyxlightwork.de'];
      }

      var ok = false;
      for (var i = 0; i < erlaubt.length; i++) { if (erlaubt[i] === origin) { ok = true; break; } }

      if (ok) {
        e.response.header().set('Access-Control-Allow-Origin', origin);
      } else {
        // Fremde Herkunft: Freigabe zurücknehmen. Der Browser blockiert das Auslesen dann.
        e.response.header().del('Access-Control-Allow-Origin');
      }
      e.response.header().set('Vary', 'Origin');
    }
  } catch (err) {
    // Nie den Request scheitern lassen, nur weil die Header-Feinjustierung klemmt.
    console.error('[hook] CORS-Middleware:', err.message || String(err));
  }
  return e.next();
});


routerAdd('GET', '/myplans', function(e) {
  var auth = e.auth;
  if (!auth) return e.string(401, 'unauthorized');
  var mail = (auth.getString('email') || '').toLowerCase();
  if (!mail) return e.string(401, 'unauthorized');

  var rows = [];
  try { rows = $app.findRecordsByFilter('crew_members', 'email = {:m}', '', 500, 0, { m: mail }); }
  catch (err) { rows = []; }

  var seen = {}, out = [];
  for (var i = 0; i < rows.length; i++) {
    var pid = rows[i].getString('plan_id');
    if (!pid || pid === '__pool__' || seen[pid]) continue;
    seen[pid] = true;
    try {
      var p = $app.findRecordById('plans', pid);
      if (p) out.push({ id: p.id, name: p.getString('name') || 'Tour Plan' });
    } catch (err2) { /* gelöschter Plan → überspringen */ }
  }
  out.sort(function(a, b) { return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0); });

  e.response.header().set('Content-Type', 'application/json; charset=utf-8');
  return e.string(200, JSON.stringify(out));
}, $apis.requireAuth());

routerAdd('GET', '/myplan/{id}', function(e) {
  var auth = e.auth;
  if (!auth) return e.string(401, 'unauthorized');
  var planId = e.request.pathValue('id');
  if (!planId) return e.string(404, 'not found');

  var plan;
  try { plan = $app.findRecordById('plans', planId); } catch (err) { plan = null; }
  if (!plan) return e.string(404, 'not found');

  var mail = (auth.getString('email') || '').toLowerCase();
  var darf = (plan.getString('owner') === auth.id) || (auth.getString('role') === 'superadmin');
  if (!darf) {
    try {
      var m = $app.findFirstRecordByFilter('crew_members',
        'plan_id = {:p} && email = {:m}', { p: planId, m: mail });
      darf = !!m;
    } catch (err2) { darf = false; }
  }
  // 404 statt 403 — verrät nicht, ob es die Tour überhaupt gibt.
  if (!darf) return e.string(404, 'not found');

  var pdText = '';
  try { pdText = plan.getString('plan_data') || ''; } catch (err3) { pdText = ''; }
  var pd = null;
  if (pdText) { try { pd = JSON.parse(pdText); } catch (err4) { pd = null; } }
  if (!pd) { try { pd = plan.get('plan_data') || null; } catch (err5) { pd = null; } }

  // v4.20: Zusätzlich der EIGENE Anzeigename. Im Crew-Pfad war das der einzige Grund, warum
  // `loadCrewMeta` die ganze crew_members-Collection des Plans lud — samt der Mailadressen
  // aller Kolleginnen und Kollegen. Die kommen damit gar nicht mehr beim Browser an.
  var myName = '';
  try {
    var me = $app.findFirstRecordByFilter('crew_members',
      'plan_id = {:p} && email = {:m}', { p: planId, m: mail });
    if (me) myName = me.getString('name') || '';
  } catch (err6) { myName = ''; }

  e.response.header().set('Content-Type', 'application/json; charset=utf-8');
  return e.string(200, JSON.stringify({
    id: plan.id, name: plan.getString('name'), plan_data: pd, myName: myName
  }));
}, $apis.requireAuth());


// ── 6c. Status EINER Tour für Angemeldete (v4.20) ────────────────────────────
// GET /planstatus/{id}  (authentifiziert)
//
// Warum: `loadAssignmentStatuses` las die assignments-Collection direkt. Deren listRule
// stand auf `@request.auth.id != ""` — jedes angemeldete Konto konnte damit ALLE Einsätze
// ALLER Touren abrufen, inklusive `crew_email` jeder Person (Audit-Befund K-2, ~913
// Datensätze in zwei Anfragen). Eine PB-Regel kann das nicht enger fassen: Regeln filtern
// DATENSÄTZE, nicht FELDER — „lesen ja, Mailadresse nein" ist als Regel nicht ausdrückbar.
// Deshalb, wie schon bei /viewstatus und /myplan: eine Route, die nur herausgibt, was die
// Anzeige braucht.
//
// Geliefert wird Datum, Position, Status und ANZEIGENAME. Bewusst NICHT: crew_email,
// Datensatz-IDs, responded_at — und ausschließlich für die EINE angefragte Tour.
// Zugriffsprüfung wortgleich zu /myplan, Ablehnung ebenfalls als 404.
// Goja-Isolation: alle Helfer/Literale INNERHALB des Handlers.
routerAdd('GET', '/planstatus/{id}', function(e) {
  var auth = e.auth;
  if (!auth) return e.string(401, 'unauthorized');
  var planId = e.request.pathValue('id');
  if (!planId) return e.string(404, 'not found');

  var plan;
  try { plan = $app.findRecordById('plans', planId); } catch (err) { plan = null; }
  if (!plan) return e.string(404, 'not found');

  var mail = (auth.getString('email') || '').toLowerCase();
  var darf = (plan.getString('owner') === auth.id) || (auth.getString('role') === 'superadmin');
  if (!darf) {
    try {
      var m = $app.findFirstRecordByFilter('crew_members',
        'plan_id = {:p} && email = {:m}', { p: planId, m: mail });
      darf = !!m;
    } catch (err2) { darf = false; }
  }
  if (!darf) return e.string(404, 'not found');

  var rows;
  try {
    rows = $app.findRecordsByFilter(
      'assignments',
      'plan_id = {:p} && status != "assigned" && status != "cancelled" && status != "cancel_acked"',
      'date', 5000, 0, { p: plan.id }
    );
  } catch (err3) { rows = []; }

  var statuses = {};
  for (var i = 0; i < rows.length; i++) {
    var d = rows[i].getString('date');
    var pos = rows[i].getString('pos_id');
    if (!d || !pos) continue;
    if (!statuses[d]) statuses[d] = {};
    // Genau diese drei Felder. crew_email gehört nicht dazu.
    statuses[d][pos] = {
      status: rows[i].getString('status'),
      crewName: rows[i].getString('crew_name'),
      proposedBy: rows[i].getString('proposed_by')
    };
  }

  // v4.21: Die EIGENEN entfallenen Einsätze mitliefern.
  //
  // Warum das sein muss: Beim Aufheben nimmt der Planer den Slot aus plan_data — für die Crew
  // verschwindet der Tag damit spurlos, `getVal` liefert nichts mehr. Der zurückbleibende
  // Datensatz steht auf 'cancelled' und wird vom Filter oben ausdrücklich ausgeschlossen.
  // Solange die Update-Mail die Daten aufzählte, fiel das nicht auf. Seit die Mail nur noch
  // „es gab Änderungen, bitte einloggen" sagt, wäre die Information sonst ersatzlos weg.
  //
  // ⚠️ Nur die EIGENEN, per E-Mail gefiltert. Diese Route gibt seit v0.8.1 bewusst keine
  // fremden Kontaktdaten heraus; hier kommt nichts über andere Personen dazu.
  // `aid` ist die Datensatz-ID für die Quittung (action=ackcancel), nichts Geheimes.
  var entfallen = [];
  try {
    var cRows = $app.findRecordsByFilter(
      'assignments',
      'plan_id = {:p} && crew_email = {:m} && status = "cancelled"',
      'date', 500, 0, { p: plan.id, m: mail }
    );
    for (var c = 0; c < cRows.length; c++) {
      entfallen.push({
        date: cRows[c].getString('date'),
        posId: cRows[c].getString('pos_id'),
        posLabel: cRows[c].getString('pos_label'),
        aid: cRows[c].id
      });
    }
  } catch (err4) { entfallen = []; }

  e.response.header().set('Content-Type', 'application/json; charset=utf-8');
  return e.string(200, JSON.stringify({ plan: plan.id, statuses: statuses, cancelled: entfallen }));
}, $apis.requireAuth());


// ── 6d. Ein Endpoint für alle Mail-auslösenden Vorgänge (v4.23) ──────────────
// POST /notify  (authentifiziert)
//
// Warum: Ein fachlicher Vorgang — „diese Person für 25 Termine anfragen und einladen" — war
// als 26 einzelne HTTP-Schreibvorgänge modelliert. Zwei Folgen, beide gemeldet:
//   1. PocketBase läuft mit `*:create` = 20 Anfragen / 5 Sekunden. Ab dem 21. kam 429
//      („Too many requests"), die Einladung ging nicht raus. Am Live-Log nachgemessen:
//      20 × POST 200 auf assignments/records, dann der 21. mit 429 — zweimal identisch.
//   2. Schlimmer: Der Vorgang konnte auf halber Strecke abbrechen. Termine standen auf
//      „angefragt", die Mail ging nie raus — die Person wusste von nichts.
//
// Hier ist es EIN Aufruf. Slots und Auslöse-Record entstehen in EINER Transaktion, und der
// Mail-Hook hängt an onRecordAfterCreateSuccess — er feuert also erst NACH dem Commit.
// Damit gilt: alle Termine und die Mail, oder nichts von beidem. Der halbe Zustand ist
// strukturell ausgeschlossen, nicht bloß unwahrscheinlicher.
//
// Die Typ-Tabelle IST die Rechteprüfung: ein Blick genügt, um zu sehen, wer was darf.
// Verstreute if-Zweige haben genau diese Eigenschaft nicht.
// Goja-Isolation: alle Helfer/Literale INNERHALB des Handlers.
routerAdd('POST', '/notify', function(e) {
  var auth = e.auth;
  if (!auth) return e.string(401, 'unauthorized');

  var body = {};
  try { body = e.requestInfo().body || {}; } catch (errB) { body = {}; }

  var typ    = String(body.type || '');
  var planId = String(body.planId || '');
  var name   = String(body.crewName || '');
  var mail   = String(body.crewEmail || '');
  var slots  = Array.isArray(body.slots) ? body.slots : [];
  var weg    = Array.isArray(body.removeSlots) ? body.removeSlots : [];
  var von    = String(body.proposedBy || 'bulk');
  var notiz  = String(body.customMessage || '');

  var TABELLE = {
    invite:       { wer: 'owner', slots: true,  loeschen: false },
    reminder:     { wer: 'owner', slots: true,  loeschen: false },
    update:       { wer: 'owner', slots: true,  loeschen: false },
    cancellation: { wer: 'owner', slots: false, loeschen: true  },
    availability: { wer: 'crew',  slots: false, loeschen: false },
    staff_invite: { wer: 'super', slots: false, loeschen: false }
  };
  var regel = TABELLE[typ];
  if (!regel) return e.string(400, 'unbekannter Typ');
  if (!name || !mail) return e.string(400, 'crewName und crewEmail sind Pflicht');

  var meineMail = (auth.getString('email') || '').toLowerCase();
  var istSuper  = auth.getString('role') === 'superadmin';

  // staff_invite gehört zu keiner Tour — nur superadmin, wie es die geltende
  // crew_invites.createRule ohne plan_id ohnehin schon einschränkt.
  if (regel.wer === 'super') {
    if (!istSuper) return e.string(404, 'not found');
  } else {
    if (!planId) return e.string(400, 'planId fehlt');
    var plan;
    try { plan = $app.findRecordById('plans', planId); } catch (err2) { plan = null; }
    if (!plan) return e.string(404, 'not found');

    var darf = istSuper || (plan.getString('owner') === auth.id);
    if (regel.wer === 'crew') {
      if (!darf) {
        try {
          var m = $app.findFirstRecordByFilter('crew_members',
            'plan_id = {:p} && email = {:m}', { p: planId, m: meineMail });
          darf = !!m;
        } catch (err3) { darf = false; }
      }
      // Nur für sich selbst — sonst könnte ein Crew-Konto im Namen einer anderen Person melden.
      if (!istSuper && mail.toLowerCase() !== meineMail) return e.string(404, 'not found');
    }
    if (!darf) return e.string(404, 'not found');
  }

  // Was der Typ nicht darf, wird verworfen statt abgelehnt: Ein Aufrufer, der versehentlich
  // Slots an eine Absage hängt, soll keine Termine anlegen — aber die Absage soll rausgehen.
  if (!regel.slots)    slots = [];
  if (!regel.loeschen) weg   = [];

  // Das Transportformat der Mail baut ab jetzt der Server, nicht der Browser. Das Feld
  // app_url ist bei 5000 Zeichen zu Ende — die Grenze gilt hier, also wird sie hier geprüft.
  // Vorher lag sie im Client (APP_URL_GRENZE) und schlug bei 59 Einsätzen zu.
  var planName = String(body.planName || '');
  var appUrl   = String(body.appUrl || '');
  var liste = [];
  for (var li = 0; li < slots.length; li++)
    liste.push({ date: slots[li].date, posLabel: slots[li].posLabel || slots[li].posId });
  for (var lj = 0; lj < weg.length; lj++)
    liste.push({ date: weg[lj].date, posLabel: weg[lj].posLabel || weg[lj].posId });
  var nutzlast = liste.length ? JSON.stringify(liste) : appUrl;
  if (nutzlast.length > 4900) return e.string(400, 'zu viele Termine fuer eine Mail');

  var angelegt = 0, aktualisiert = 0, geloescht = 0;

  try {
    $app.runInTransaction(function (tx) {
      var col = tx.findCollectionByNameOrId('assignments');

      for (var i = 0; i < slots.length; i++) {
        var s = slots[i];
        if (!s || !s.date || !s.posId) continue;
        var da = null;
        try {
          da = tx.findFirstRecordByFilter('assignments',
            'plan_id = {:p} && date = {:d} && pos_id = {:q}',
            { p: planId, d: String(s.date), q: String(s.posId) });
        } catch (err4) { da = null; }
        var r = da || new Record(col);
        if (!da) {
          r.set('plan_id', planId);
          r.set('date', String(s.date));
          r.set('pos_id', String(s.posId));
        }
        r.set('pos_label', String(s.posLabel || s.posId));
        r.set('crew_name', name);
        r.set('crew_email', mail);
        r.set('status', 'proposed');
        r.set('proposed_by', von);
        tx.save(r);
        if (da) { aktualisiert++; } else { angelegt++; }
      }

      for (var k = 0; k < weg.length; k++) {
        var w = weg[k];
        if (!w || !w.date || !w.posId) continue;
        var alt = [];
        try {
          alt = tx.findRecordsByFilter('assignments',
            'plan_id = {:p} && date = {:d} && pos_id = {:q}', '', 50, 0,
            { p: planId, d: String(w.date), q: String(w.posId) });
        } catch (err5) { alt = []; }
        for (var n = 0; n < alt.length; n++) { tx.delete(alt[n]); geloescht++; }
      }

      // Der Auslöse-Record ZULETZT und in derselben Transaktion. Der Mail-Hook feuert an
      // onRecordAfterCreateSuccess, also nach dem Commit: Bricht oben etwas ab, geht auch
      // keine Mail raus. Genau das war der Zweck der ganzen Übung.
      var iCol = tx.findCollectionByNameOrId('crew_invites');
      var inv  = new Record(iCol);
      inv.set('plan_id', planId);
      inv.set('crew_name', name);
      inv.set('crew_email', mail);
      inv.set('type', typ);
      inv.set('plan_name', planName || 'Tour Plan');
      inv.set('app_url', nutzlast);
      if (notiz) { inv.set('custom_message', notiz); }
      tx.save(inv);
    });
  } catch (errTx) {
    console.error('[hook] /notify Transaktion fehlgeschlagen:', String(errTx));
    return e.string(500, 'nicht gespeichert');
  }

  console.log('[hook] /notify ' + typ + ' · neu=' + angelegt + ' akt=' + aktualisiert + ' weg=' + geloescht);
  e.response.header().set('Content-Type', 'application/json; charset=utf-8');
  return e.string(200, JSON.stringify({
    ok: true, angelegt: angelegt, aktualisiert: aktualisiert, geloescht: geloescht
  }));
}, $apis.requireAuth());


// ── 7a. Plan für die öffentliche Ansicht (v4.15) ─────────────────────────────
// GET /viewplan/{token}  (unauthentifiziert — der view_token löst den Plan auf).
//
// Warum: `plans.listRule` endete auf `|| view_token != ""`, damit view.html den Plan
// ohne Anmeldung laden konnte. Dieser Zweig trifft aber auf JEDEN Plan mit Token zu —
// eine PB-Regel filtert pro Datensatz und kann den Token aus dem Request nicht an EINEN
// Datensatz binden. Folge (2026-08-04 vom Admin gefunden, nachgemessen): alle Pläne waren
// anonym vollständig abrufbar, inkl. `view_token` im Klartext — die Tokens waren also
// aufzählbar und damit nicht geheim.
//
// Diese Route liefert nur, was die Ansicht braucht: Plantitel + plan_data. BEWUSST NICHT
// dabei: view_token (sonst wäre wieder aufzählbar, was geheim sein soll), owner (interne
// User-ID), view_shorturl, id. Danach kann die listRule zugemacht werden.
// Goja-Isolation: alle Helfer/Literale INNERHALB des Handlers.
routerAdd('GET', '/viewplan/{token}', function(e) {
  var token = e.request.pathValue('token');
  if (!token) return e.string(404, 'not found');

  var plan;
  try { plan = $app.findFirstRecordByFilter('plans', 'view_token = {:t}', { t: token }); }
  catch (err) { plan = null; }
  if (!plan) return e.string(404, 'not found');

  // plan_data ist ein JSON-Feld → im Goja-Hook JSONRaw/[]byte. getString liefert den
  // JSON-TEXT (siehe v4.9.1), der hier unverändert durchgereicht wird.
  var pdText = '';
  try { pdText = plan.getString('plan_data') || ''; } catch (err) { pdText = ''; }
  var pd = null;
  if (pdText) { try { pd = JSON.parse(pdText); } catch (err2) { pd = null; } }
  if (!pd) { try { pd = plan.get('plan_data') || null; } catch (err3) { pd = null; } }

  e.response.header().set('Content-Type', 'application/json; charset=utf-8');
  e.response.header().set('Cache-Control', 'public, max-age=60');
  return e.string(200, JSON.stringify({ name: plan.getString('name'), plan_data: pd }));
});


// ── 7. Status für die öffentliche Ansicht (v4.14) ────────────────────────────
// GET /viewstatus/{token}  (unauthentifiziert — der geheime view_token IST die Auth).
//
// Warum: view.html hat die Bestätigungs-Status bis 2026-08-03 direkt aus der
// assignments-Collection gelesen. Damit die das ungeschützt konnte, war deren listRule
// LEER — und damit lagen 913 Datensätze inkl. aller Crew-MAILADRESSEN weltöffentlich.
// Die Regel ist jetzt zu; diese Route liefert stattdessen NUR das, was die Ansicht
// wirklich braucht: Datum, Position, Status, Anzeigename. KEINE E-Mail-Adressen,
// und nur für den EINEN Plan, zu dem der Token gehört.
//
// Abgesagte/entfernte Einsätze bleiben draußen (wie bisher in view-app.js gefiltert).
// Goja-Isolation: alle Helfer/Literale INNERHALB des Handlers.
routerAdd('GET', '/viewstatus/{token}', function(e) {
  var token = e.request.pathValue('token');
  if (!token) return e.string(404, 'not found');

  var plan;
  try { plan = $app.findFirstRecordByFilter('plans', 'view_token = {:t}', { t: token }); }
  catch (err) { plan = null; }
  if (!plan) return e.string(404, 'not found');

  var rows;
  try {
    rows = $app.findRecordsByFilter(
      'assignments',
      'plan_id = {:p} && status != "assigned" && status != "cancelled" && status != "cancel_acked"',
      'date', 5000, 0, { p: plan.id }
    );
  } catch (err) { rows = []; }

  var statuses = {};
  for (var i = 0; i < rows.length; i++) {
    var d = rows[i].getString('date');
    var pos = rows[i].getString('pos_id');
    if (!d || !pos) continue;
    if (!statuses[d]) statuses[d] = {};
    // BEWUSST nur diese drei Felder — crew_email gehört nicht in eine öffentliche Antwort.
    statuses[d][pos] = { status: rows[i].getString('status'), crewName: rows[i].getString('crew_name') };
  }

  e.response.header().set('Content-Type', 'application/json; charset=utf-8');
  e.response.header().set('Cache-Control', 'public, max-age=60');
  return e.string(200, JSON.stringify({ plan: plan.id, statuses: statuses }));
});


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

  var keys = Object.keys(days);

  // Kalendername = TOURNAME, nicht mehr das feste 'Crewplaner' (v4.22). Wer in zwei Touren
  // steht, bekam sonst zwei gleichnamige Abos nebeneinander — manche Clients lehnen das
  // zweite deshalb rundheraus ab. Alle Zeilen dieses Requests gehören zu EINER Tour (die
  // Abfrage filtert auf plan_id), der erste Treffer bestimmt also den Namen; ist der Feed
  // leer, bleibt es beim alten Titel.
  var kalName = keys.length ? (planMeta(days[keys[0]].planId).band || 'Crewplaner') : 'Crewplaner';

  // DTSTAMP ist nach RFC 5545 § 3.6.1 PFLICHT in jedem VEVENT — es fehlte bis v4.21 in
  // jedem einzelnen. Strikte Clients verweigern dann das ganze Abo („Der Kalender konnte
  // nicht hinzugefügt werden. Bitte überprüfen Sie die URL"), ohne zu sagen, woran es liegt.
  // Ein Wert für den ganzen Request: DTSTAMP meint den Zeitpunkt der ERZEUGUNG des Eintrags,
  // nicht den des Termins.
  var stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

  var out = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Crewplaner//Feed v4.22//DE',
             'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
             'X-WR-CALNAME:' + icsEsc(kalName), 'NAME:' + icsEsc(kalName)];
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
      'DTSTAMP:' + stamp,
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
