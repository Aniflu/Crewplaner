// ── ICS Calendar Export ────────────────────────────────────────────────────
import { TOUR_DATES, POSITIONS, assignmentStatuses, crewMeta, IS_CREW,
         CURRENT_USER_EMAIL, CURRENT_USER_ID } from './state.js';
import { showToast } from './utils.js';
import { icsExportRows, ICS_STATUS_LABEL } from './pure.js';
import { openModal } from './modals.js';

// Eigener Crew-Name aus crewMeta (gleiche Logik wie getMyCrewName, ohne userView-Import).
function _myCrewName(){
  const email = (CURRENT_USER_EMAIL || '').toLowerCase();
  return Object.keys(crewMeta).find(n =>
    crewMeta[n]?.userId === CURRENT_USER_ID ||
    (crewMeta[n]?.email || '').toLowerCase() === email) || null;
}

export function openCalendarExport(){
  openModal('calModal');
}

export function generateICS(){
  const inclTypes={
    show:document.getElementById('calShow').checked,
    reise:document.getElementById('calReise').checked,
    prep:document.getElementById('calPrep').checked,
    off:document.getElementById('calOff').checked,
  };
  // Bestätigte UND vorgemerkte Termine (v0.5.0 — vorgemerkte tragen den Status im
  // Infofeld). Crew → nur eigene Tage; Manager → alle.
  const allow = new Set(Object.keys(inclTypes).filter(k => inclTypes[k]));
  const myName = IS_CREW ? _myCrewName() : null;
  const rows = icsExportRows(TOUR_DATES, POSITIONS, assignmentStatuses,
    { onlyCrew: IS_CREW, myName, allowTypes: allow });
  if(!rows.length){
    showToast('Keine bestätigten Termine','#e84a4a');
    return;
  }
  const dateMeta = {}; TOUR_DATES.forEach(r => { dateMeta[r.date] = r; });

  const lines=[
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Tour Crew Plan//v2.0//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  rows.forEach(({date, status, slots})=>{
    const row = dateMeta[date] || {};
    const dtStart=date.replace(/-/g,'');
    const [y,m,d]=date.split('-').map(Number);
    const nx=new Date(y,m-1,d+1);
    const dtEnd=`${nx.getFullYear()}${String(nx.getMonth()+1).padStart(2,'0')}${String(nx.getDate()).padStart(2,'0')}`;
    const summary=`${row.typeLabel||row.type||''} – ${row.loc||''}`;
    let desc=`Art: ${row.typeLabel||row.type||''}\\nOrt: ${row.loc||''}`;
    const stLabel = ICS_STATUS_LABEL[status] || '';
    if(stLabel) desc+=`\\nStatus: ${stLabel}`;
    // Pro Slot den eigenen Status mitschreiben — ein Tag kann bestätigte UND
    // vorgemerkte Positionen gleichzeitig haben.
    const crewList=slots.map(c=>`${c.posLabel}: ${c.crewName}${c.status==='pencilled'?' (vorgemerkt)':''}`);
    if(crewList.length)desc+='\\n'+crewList.join('\\n');
    const uid=`${date}-${Math.random().toString(36).slice(2)}@tourcrewplan`;
    lines.push(
      'BEGIN:VEVENT',
      `DTSTART;VALUE=DATE:${dtStart}`,
      `DTEND;VALUE=DATE:${dtEnd}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${desc}`,
      `STATUS:${status==='confirmed'?'CONFIRMED':'TENTATIVE'}`,
      `UID:${uid}`,
      'END:VEVENT'
    );
  });

  lines.push('END:VCALENDAR');
  const content=lines.join('\r\n');
  const blob=new Blob([content],{type:'text/calendar;charset=utf-8'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='tourplan.ics';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
  showToast(`${rows.length} bestätigte Termine exportiert ✓`,'#2d6a3f');
}
