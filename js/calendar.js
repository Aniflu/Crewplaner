// ── ICS Calendar Export ────────────────────────────────────────────────────
import { TOUR_DATES, POSITIONS } from './state.js';
import { showToast, getVal } from './utils.js';
import { openModal } from './modals.js';

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
  const rows=TOUR_DATES.filter(r=>inclTypes[r.type]);
  if(!rows.length){
    showToast('Keine Tage ausgewählt','#e84a4a');
    return;
  }

  const lines=[
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Tour Crew Plan//v2.0//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  rows.forEach(row=>{
    const dtStart=row.date.replace(/-/g,'');
    const [y,m,d]=row.date.split('-').map(Number);
    const nx=new Date(y,m-1,d+1);
    const dtEnd=`${nx.getFullYear()}${String(nx.getMonth()+1).padStart(2,'0')}${String(nx.getDate()).padStart(2,'0')}`;
    const summary=`${row.typeLabel} – ${row.loc}`;
    let desc=`Art: ${row.typeLabel}\\nOrt: ${row.loc}`;
    const crewList=POSITIONS.map(p=>{const v=getVal(row.date,p.id);return v?`${p.short}: ${v}`:null;}).filter(Boolean);
    if(crewList.length)desc+='\\n'+crewList.join('\\n');
    const uid=`${row.date}-${Math.random().toString(36).slice(2)}@tourcrewplan`;
    lines.push(
      'BEGIN:VEVENT',
      `DTSTART;VALUE=DATE:${dtStart}`,
      `DTEND;VALUE=DATE:${dtEnd}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${desc}`,
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
  showToast(`${rows.length} Termine exportiert ✓`,'#2d6a3f');
}
