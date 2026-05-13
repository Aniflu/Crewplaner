// Supabase Edge Function: send-notification
// Deploy: supabase functions deploy send-notification
// Secret nötig: RESEND_API_KEY (Dashboard → Settings → Edge Functions → Secrets)
// Resend kostenlos: https://resend.com (100 Mails/Tag gratis)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

interface NotifyPayload {
  type: 'proposed' | 'declined' | 'invite' | 'reminder';
  crewName: string;
  crewEmail?: string;
  position?: string;
  date?: string;
  planName: string;
  adminEmail: string;
  appUrl?: string;
}

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY nicht gesetzt');
    return new Response(JSON.stringify({ error: 'Mail-Service nicht konfiguriert' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }

  const payload: NotifyPayload = await req.json();
  const { type, crewName, crewEmail, position, date, planName, adminEmail, appUrl } = payload;

  const dateFormatted = date ? (() => { const [y,m,d] = date.split('-'); return `${d}.${m}.${y}`; })() : '';
  const loginUrl = appUrl || 'https://m4dm0nky.github.io/Personalplan/';

  let to: string;
  let subject: string;
  let html: string;

  if (type === 'invite') {
    if (!crewEmail) return new Response(JSON.stringify({ ok: true, skipped: true }), { headers: { 'Content-Type': 'application/json' } });
    to = crewEmail;
    subject = `Tourplan bereit – bitte eintragen`;
    html = `
      <div style="font-family:monospace;background:#1a1a2e;color:#c8cdd5;padding:24px;border-radius:8px;max-width:480px;">
        <h2 style="color:#e8c84a;margin:0 0 16px;">Tour/Crew · Einladung</h2>
        <p>Hallo <strong style="color:#fff;">${crewName}</strong>,</p>
        <p style="margin:12px 0;">der Tourplan <strong style="color:#fff;">${planName}</strong> ist fertig und wartet auf dich!</p>
        <p>Logge dich ein, um deine Einsätze zu sehen und zu bestätigen.</p>
        <div style="margin:20px 0;">
          <a href="${loginUrl}" style="background:#e8c84a;color:#1a1a2e;padding:10px 20px;border-radius:4px;text-decoration:none;font-weight:700;">→ Zum Tourplan</a>
        </div>
        <p style="margin-top:20px;font-size:11px;color:#5a6070;">Diese E-Mail wurde automatisch vom Tour Crew Plan versandt.</p>
      </div>`;
  } else if (type === 'reminder') {
    if (!crewEmail) return new Response(JSON.stringify({ ok: true, skipped: true }), { headers: { 'Content-Type': 'application/json' } });
    to = crewEmail;
    subject = `Erinnerung: Du hast dich noch nicht eingetragen`;
    html = `
      <div style="font-family:monospace;background:#1a1a2e;color:#c8cdd5;padding:24px;border-radius:8px;max-width:480px;">
        <h2 style="color:#e84a4a;margin:0 0 16px;">Tour/Crew · Erinnerung</h2>
        <p>Hallo <strong style="color:#fff;">${crewName}</strong>,</p>
        <p style="margin:12px 0;">du hast dich noch nicht in den Tourplan <strong style="color:#fff;">${planName}</strong> eingetragen!</p>
        <p>Bitte logge dich ein und bestätige deine Einsätze.</p>
        <div style="margin:20px 0;">
          <a href="${loginUrl}" style="background:#e84a4a;color:#fff;padding:10px 20px;border-radius:4px;text-decoration:none;font-weight:700;">→ Jetzt eintragen</a>
        </div>
        <p style="margin-top:20px;font-size:11px;color:#5a6070;">Diese E-Mail wurde automatisch vom Tour Crew Plan versandt.</p>
      </div>`;
  } else if (type === 'proposed') {
    if (!crewEmail) {
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    to = crewEmail;
    subject = `Einsatz-Anfrage: ${position} am ${dateFormatted}`;
    html = `
      <div style="font-family:monospace;background:#1a1a2e;color:#c8cdd5;padding:24px;border-radius:8px;max-width:480px;">
        <h2 style="color:#e8c84a;margin:0 0 16px;">Tour/Crew · Einsatz-Anfrage</h2>
        <p>Hallo <strong style="color:#fff;">${crewName}</strong>,</p>
        <p style="margin:12px 0;">du wurdest für folgenden Einsatz vorgeschlagen:</p>
        <table style="border-collapse:collapse;width:100%;margin:16px 0;">
          <tr><td style="color:#5a6070;padding:4px 0;width:120px;">Plan</td><td style="color:#fff;">${planName}</td></tr>
          <tr><td style="color:#5a6070;padding:4px 0;">Position</td><td style="color:#fff;">${position}</td></tr>
          <tr><td style="color:#5a6070;padding:4px 0;">Datum</td><td style="color:#e8c84a;font-weight:600;">${dateFormatted}</td></tr>
        </table>
        <p>Bitte melde dich in der App um zu bestätigen oder abzulehnen.</p>
        <p style="margin-top:20px;font-size:11px;color:#5a6070;">Diese E-Mail wurde automatisch vom Tour Crew Plan versandt.</p>
      </div>`;
  } else {
    to = adminEmail;
    subject = `Abgelehnt: ${crewName} – ${position} am ${dateFormatted}`;
    html = `
      <div style="font-family:monospace;background:#1a1a2e;color:#c8cdd5;padding:24px;border-radius:8px;max-width:480px;">
        <h2 style="color:#e84a4a;margin:0 0 16px;">Tour/Crew · Einsatz abgelehnt</h2>
        <p><strong style="color:#fff;">${crewName}</strong> hat den Einsatz abgelehnt:</p>
        <table style="border-collapse:collapse;width:100%;margin:16px 0;">
          <tr><td style="color:#5a6070;padding:4px 0;width:120px;">Plan</td><td style="color:#fff;">${planName}</td></tr>
          <tr><td style="color:#5a6070;padding:4px 0;">Position</td><td style="color:#fff;">${position}</td></tr>
          <tr><td style="color:#5a6070;padding:4px 0;">Datum</td><td style="color:#e84a4a;font-weight:600;">${dateFormatted}</td></tr>
        </table>
        <p>Bitte öffne den Plan und besetze die Position neu.</p>
      </div>`;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'Tour Crew Plan <onboarding@resend.dev>',
      to: [to],
      subject,
      html
    })
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Resend-Fehler:', err);
    return new Response(JSON.stringify({ error: err }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
});
