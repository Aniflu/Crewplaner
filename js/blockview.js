// ── Block View ─────────────────────────────────────────────────────────────────
// Gruppiert TOUR_DATES nach blockId und rendert Karten
import { TOUR_DATES, POSITIONS, crew, assignments, assignmentStatuses,
         IS_MANAGER, OFFEN, OFFDAY, REISE_TAG, CREW_COLORS } from './state.js';
import { getVal, isPending, esc, parseD, DE_DAYS } from './utils.js';

export function _blockGroups(){
  const groups=[];const map=new Map();
  TOUR_DATES.forEach(r=>{
    const key=r.blockId||'__unassigned__';
    if(!map.has(key)){
      const g={id:key,name:r.blockName||(key==='__unassigned__'?'Einzeltage':key),days:[]};
      map.set(key,g);groups.push(g);
    }
    map.get(key).days.push(r);
  });
  // sort: unassigned last
  return groups.sort((a,b)=>{
    if(a.id==='__unassigned__')return 1;
    if(b.id==='__unassigned__')return -1;
    return a.days[0].date.localeCompare(b.days[0].date);
  });
}

export function _fmtDateShort(s){const d=parseD(s);return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getFullYear()).slice(2)}`;}

export function _dayDiff(a,b){const da=parseD(a),db=parseD(b);return Math.round((db-da)/86400000)+1;}

export function renderBlockView(){
  const host=document.getElementById('blocksArea');if(!host)return;
  const groups=_blockGroups();
  if(!groups.length){
    host.innerHTML=`<div class="crew-empty"><strong>Keine Daten</strong>Noch keine Tourblöcke oder Tage angelegt.<br>Links über „▶▶ Tourblock einfügen" starten.</div>`;
    return;
  }

  let html='';
  // Legende oben
  html+=`<div class="bc-legend">
    <div class="li"><span class="ld" style="background:#4caf72"></span>Show</div>
    <div class="li"><span class="ld" style="background:#5a9fd4"></span>Reise</div>
    <div class="li"><span class="ld" style="background:#e8883a"></span>Aufbau / Probe</div>
    <div class="li"><span class="ld" style="background:#555"></span>OFF</div>
    <div class="li" style="color:#e07060;">⚠ Offen / unbesetzt</div>
  </div>`;

  groups.forEach(g=>{
    const days=g.days;
    const isUnassigned=g.id==='__unassigned__';
    const first=days[0].date, last=days[days.length-1].date;
    const spanDays=_dayDiff(first,last);

    // KPIs
    const cShow=days.filter(d=>d.type==='show').length;
    const cReise=days.filter(d=>d.type==='reise').length;
    const cPrep=days.filter(d=>d.type==='prep').length;
    const cOff=days.filter(d=>d.type==='off').length;

    // Strip: wenn Block zusammenhängend, nur blockDays; sonst alle Kalendertage zwischen first..last
    const stripCells=[];
    const dayMap=new Map(days.map(d=>[d.date,d]));
    let cur=first;
    while(cur<=last){
      const d=dayMap.get(cur);
      if(d){
        const dd=parseD(cur);
        const title=`${DE_DAYS[dd.getDay()]} ${_fmtDateShort(cur)} · ${d.typeLabel} · ${d.loc}`;
        stripCells.push(`<div class="bc-day ${d.type}" title="${title.replace(/"/g,'&quot;')}"></div>`);
      } else {
        stripCells.push(`<div class="bc-day off" style="opacity:.3" title="${cur} (Lücke)"></div>`);
      }
      const [y,m,dy]=cur.split('-').map(Number);
      const nx=new Date(y,m-1,dy+1);
      cur=`${nx.getFullYear()}-${String(nx.getMonth()+1).padStart(2,'0')}-${String(nx.getDate()).padStart(2,'0')}`;
      if(stripCells.length>400)break; // safety
    }

    // Venues (nur Show-Tage, Doppelte zusammenfassen)
    const venueCounts=new Map();
    days.filter(d=>d.type==='show').forEach(d=>{
      const key=d.loc||'–';
      venueCounts.set(key,(venueCounts.get(key)||0)+1);
    });
    const venueChips=[...venueCounts.entries()].map(([loc,n])=>
      `<span class="bc-venue ${n>1?'multi':''}" ${n>1?`data-count="×${n}"`:''}>${loc.replace(/</g,'&lt;')}</span>`
    ).join('');

    // Crew pro Position im Block: sammle Werte
    let openCount=0;
    const posRows=POSITIONS.map(p=>{
      const vals=new Map(); // name -> count
      let openDays=0;
      days.forEach(r=>{
        const v=getVal(r.date,p.id);
        if(v===OFFEN){openDays++;}
        else if(v){vals.set(v,(vals.get(v)||0)+1);}
      });
      openCount+=openDays;
      const names=[...vals.keys()];
      let valHtml='';
      if(names.length===0 && openDays===0){
        valHtml=`<div class="bc-pos-val empty">—</div>`;
      } else if(openDays>0 && names.length===0){
        valHtml=`<div class="bc-pos-val offen">⚠ Offen</div>`;
      } else if(names.length===1){
        const ci=crew.indexOf(names[0]);
        const col=ci>=0?CREW_COLORS[ci%CREW_COLORS.length]:'#888';
        const suffix=openDays>0?` <span class="bc-open" style="color:#e07060;margin-left:5px;">⚠${openDays}</span>`:'';
        valHtml=`<div class="bc-pos-val"><span class="bc-pos-dot" style="background:${col}"></span>${names[0]}${suffix}</div>`;
      } else {
        // mixed
        const parts=names.map((n,i)=>{
          const ci=crew.indexOf(n);
          const col=ci>=0?CREW_COLORS[ci%CREW_COLORS.length]:'#888';
          const cnt=vals.get(n);
          return `<span style="display:inline-flex;align-items:center;gap:4px;"><span class="bc-pos-dot" style="background:${col}"></span><span class="mx-name">${n}</span><span style="color:var(--muted);font-size:.55rem;">×${cnt}</span></span>`;
        }).join('<span class="mx-sep">·</span>');
        const suffix=openDays>0?` <span class="bc-open" style="color:#e07060;margin-left:5px;">⚠${openDays}</span>`:'';
        valHtml=`<div class="bc-pos-val mixed">${parts}${suffix}</div>`;
      }
      return `<div class="bc-pos-row"><div class="bc-pos-lbl">${p.short}</div>${valHtml}</div>`;
    }).join('');

    const rangeStr=days.length===1
      ? _fmtDateShort(first)
      : `${_fmtDateShort(first)} – ${_fmtDateShort(last)}`;

    html+=`<div class="block-card${isUnassigned?' unassigned':''}">
      <div class="bc-head">
        <div class="bc-head-row">
          <div class="bc-name">${g.name.replace(/</g,'&lt;')}</div>
          <div class="bc-id">${isUnassigned?'—':g.id.slice(-6).toUpperCase()}</div>
        </div>
        <div class="bc-dates">
          <span><strong>${rangeStr}</strong></span>
          <span class="bc-sep">│</span>
          <span><strong>${days.length}</strong> Tage${spanDays!==days.length?` (${spanDays} Kalendertage)`:''}</span>
        </div>
        <div class="bc-kpis">
          <div class="bc-kpi show"><span class="bc-kpi-val">${cShow}</span><span class="bc-kpi-lbl">Shows</span></div>
          <div class="bc-kpi reise"><span class="bc-kpi-val">${cReise}</span><span class="bc-kpi-lbl">Reise</span></div>
          <div class="bc-kpi prep"><span class="bc-kpi-val">${cPrep}</span><span class="bc-kpi-lbl">Prep</span></div>
          <div class="bc-kpi off"><span class="bc-kpi-val">${cOff}</span><span class="bc-kpi-lbl">Off</span></div>
        </div>
      </div>
      <div class="bc-strip">
        <div class="bc-strip-lbl"><span>Kalender-Strip</span><span>${_fmtDateShort(first)} → ${_fmtDateShort(last)}</span></div>
        <div class="bc-days">${stripCells.join('')}</div>
      </div>
      ${venueChips?`<div class="bc-venues">${venueChips}</div>`:''}
      <div class="bc-crew">
        <div class="bc-crew-lbl"><span>Crew-Besetzung</span>${openCount>0?`<span class="bc-open">⚠ ${openCount} offen</span>`:''}</div>
        ${posRows}
      </div>
    </div>`;
  });

  host.innerHTML=html;
}
