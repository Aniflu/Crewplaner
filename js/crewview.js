// ── Crew View ──────────────────────────────────────────────────────────────────
// Pro Crew-Mitglied: Zeile mit Kennzahlen + Timeline über alle Tour-Tage
import { TOUR_DATES, POSITIONS, crew, assignments, assignmentStatuses,
         IS_MANAGER, CURRENT_USER_EMAIL, CREW_COLORS, DE_MON } from './state.js';
import { getVal, isPending, esc, fmtD, fmt, dw, parseD, DE_DAYS } from './utils.js';

export function renderCrewView(){
  const host=document.getElementById('crewArea');if(!host)return;
  if(!TOUR_DATES.length){
    host.innerHTML=`<div class="crew-empty"><strong>Keine Daten</strong>Noch keine Tour-Tage angelegt.</div>`;
    return;
  }

  // Alle Tour-Dates sortiert (für die Timeline)
  const dates=[...TOUR_DATES].sort((a,b)=>a.date.localeCompare(b.date));
  const firstD=dates[0].date, lastD=dates[dates.length-1].date;

  // Monats-Header berechnen
  const monthGroups=[];let curMonth='';
  dates.forEach(r=>{
    const d=parseD(r.date);
    const key=`${d.getFullYear()}-${d.getMonth()}`;
    if(key!==curMonth){
      curMonth=key;
      monthGroups.push({key,label:`${DE_MON[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,count:1});
    } else {
      monthGroups[monthGroups.length-1].count++;
    }
  });

  // Für jede Person: welche Tage (date -> {type, posShort})
  function daysFor(name){
    const map={};
    dates.forEach(r=>{
      for(const p of POSITIONS){
        const v=getVal(r.date,p.id);
        if(v===name){map[r.date]={type:r.type,pos:p.short,loc:r.loc,label:r.typeLabel};break;}
      }
    });
    return map;
  }

  // Kennzahlen
  function kpisFor(name){
    let show=0,reise=0,prep=0,off=0,total=0;
    const posSet=new Set();
    dates.forEach(r=>{
      const w=dw(r);
      for(const p of POSITIONS){
        const v=getVal(r.date,p.id);
        if(v===name){
          posSet.add(p.short);
          total+=w;
          if(r.type==='show')show+=w;
          else if(r.type==='reise')reise+=w;
          else if(r.type==='prep')prep+=w;
          else off+=w;
          break;
        }
      }
    });
    return {show,reise,prep,off,total,positions:[...posSet]};
  }

  let html='';
  // Legende
  html+=`<div class="bc-legend" style="padding:0 4px 4px;">
    <div class="li"><span class="ld" style="background:#4caf72"></span>Show</div>
    <div class="li"><span class="ld" style="background:#5a9fd4"></span>Reise</div>
    <div class="li"><span class="ld" style="background:#e8883a"></span>Aufbau / Probe</div>
    <div class="li"><span class="ld" style="background:#555"></span>OFF</div>
    <div class="li"><span class="ld" style="background:#121314;border:1px solid var(--border);"></span>Nicht eingesetzt</div>
  </div>`;

  // Sortiere Crew nach Gesamt-Tagen
  const crewSorted=[...crew].map(n=>({name:n,kpi:kpisFor(n)})).sort((a,b)=>b.kpi.total-a.kpi.total);

  crewSorted.forEach(({name,kpi},idx)=>{
    const ci=crew.indexOf(name);
    const col=CREW_COLORS[ci%CREW_COLORS.length];
    const dmap=daysFor(name);

    // Month header (proportional widths)
    const monthHdr=monthGroups.map(m=>
      `<div class="crew-tl-month" style="flex:${m.count};">${m.label}</div>`
    ).join('');

    // Day cells
    const cells=dates.map(r=>{
      const d=dmap[r.date];
      if(!d){
        return `<div class="crew-tl-cell empty" title="${fmtD(r.date)} · ${r.typeLabel} · nicht eingesetzt"></div>`;
      }
      const title=`${fmtD(r.date)} · ${d.pos} · ${d.label} · ${d.loc}`.replace(/"/g,'&quot;');
      return `<div class="crew-tl-cell assigned ${d.type}" title="${title}"></div>`;
    }).join('');

    const posList=kpi.positions.length?kpi.positions.join(' · '):'Nicht eingeteilt';

    html+=`<div class="crew-row">
      <div class="crew-row-head">
        <div class="crew-row-name">
          <div class="crew-row-dot" style="background:${col}"></div>
          <div class="crew-row-text">
            <strong>${esc(name)}</strong>
            <span class="crew-pos-list">${posList}</span>
          </div>
        </div>
        <div class="crew-row-kpis">
          <span class="kpi-show"><strong>${fmt(kpi.show)}</strong>Show</span>
          <span class="kpi-reise"><strong>${fmt(kpi.reise)}</strong>Reise</span>
          <span class="kpi-prep"><strong>${fmt(kpi.prep)}</strong>Prep</span>
          <span class="kpi-total"><strong>${fmt(kpi.total)}</strong>Gesamt</span>
        </div>
        <div style="font-size:.55rem;color:var(--muted);letter-spacing:.1em;text-transform:uppercase;">#${String(idx+1).padStart(2,'0')}</div>
      </div>
      <div class="crew-row-tl">
        <div class="crew-tl">
          <div class="crew-tl-months">${monthHdr}</div>
          <div class="crew-tl-bar">${cells}</div>
        </div>
      </div>
    </div>`;
  });

  if(!crewSorted.length){
    html+=`<div class="crew-empty"><strong>Keine Crew</strong>In der Sidebar Crew-Mitglieder anlegen.</div>`;
  }

  host.innerHTML=html;
}
