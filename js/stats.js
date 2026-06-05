// ── Stats Bar ──────────────────────────────────────────────────────────────────
import { TOUR_DATES, POSITIONS, crew, assignments, assignmentStatuses, IS_MANAGER, CREW_COLORS, OFFEN } from './state.js';
import { getVal, dw, fmt, fmtD } from './utils.js';

export function calcByPos(){
  const res={};POSITIONS.forEach(p=>{res[p.id]={filled:0,open:0};});
  TOUR_DATES.forEach(r=>{POSITIONS.forEach(p=>{const v=getVal(r.date,p.id),w=dw(r);if(v===OFFEN)res[p.id].open+=w;else if(v)res[p.id].filled+=w;});});
  return res;
}

export function calcByPers(filterDates){
  const dates=filterDates||TOUR_DATES,res={};
  dates.forEach(r=>{const w=dw(r);POSITIONS.forEach(p=>{const v=getVal(r.date,p.id);if(!v||v===OFFEN)return;if(!res[v])res[v]={total:0,show:0,other:0};if(r.type==='show'){res[v].total+=w;res[v].show+=w;}else{res[v].total+=w;res[v].other+=w;}});});
  return res;
}

export function updateStats(){
  const shows=TOUR_DATES.filter(r=>r.type==='show').length;
  const reise=TOUR_DATES.filter(r=>r.type==='reise').length;
  const preps=TOUR_DATES.filter(r=>r.type==='prep').length;
  const off=TOUR_DATES.filter(r=>r.type==='off').length;
  const total=TOUR_DATES.length;
  const byPos=calcByPos(),byPers=calcByPers();
  let totalOpen=0;
  POSITIONS.forEach(p=>{const{open}=byPos[p.id]||{open:0};totalOpen+=open;});

  // KPI strip
  const kpiEl=document.getElementById('kpiStrip');
  if(kpiEl){
    const pad=n=>String(n).padStart(2,'0');
    kpiEl.innerHTML=`
      <div class="kpi-cell"><div class="kpi-label">Tage gesamt</div><div class="kpi-row"><span class="kpi-val">${pad(total)}</span><span class="kpi-unit">Tage</span></div></div>
      <div class="kpi-cell kpi-show"><div class="kpi-label">Shows</div><div class="kpi-row"><span class="kpi-val">${pad(shows)}</span><span class="kpi-unit">Tage</span></div></div>
      <div class="kpi-cell kpi-reise"><div class="kpi-label">Reise</div><div class="kpi-row"><span class="kpi-val">${pad(reise)}</span><span class="kpi-unit">Tage</span></div></div>
      <div class="kpi-cell kpi-prep"><div class="kpi-label">Aufbau / Probe</div><div class="kpi-row"><span class="kpi-val">${pad(preps)}</span><span class="kpi-unit">Tage</span></div></div>
      <div class="kpi-cell kpi-off"><div class="kpi-label">OFF</div><div class="kpi-row"><span class="kpi-val">${pad(off)}</span><span class="kpi-unit">Tage</span></div></div>
      <div class="kpi-cell kpi-warn"><div class="kpi-label">Offene Stellen</div><div class="kpi-row"><span class="kpi-val">${pad(Math.round(totalOpen))}</span><span class="kpi-unit">zu besetzen</span></div></div>
    `;
  }

  // Bottom stats bar - position + crew details
  let html=`<span class="stat-show"><strong>${shows}</strong> Shows</span><span class="stat-reise"><strong>${reise}</strong> Reise</span><span class="stat-prep"><strong>${preps}</strong> Aufbau</span><span style="color:var(--rule)">│</span>`;
  POSITIONS.forEach(p=>{const{filled,open}=byPos[p.id]||{filled:0,open:0};html+=`<span title="${p.label}${open>0?' · ⚠ '+fmt(open)+' offen':''}"><span style="color:var(--muted)">${p.short}:</span><strong style="color:${filled>0?'var(--ink)':'var(--muted)'}">${fmt(filled)}T</strong>${open>0?`<strong style="color:var(--warn);font-size:10px;"> ⚠${fmt(open)}</strong>`:''}</span>`;});
  if(totalOpen>0)html+=`<span style="color:var(--rule)">│</span><span style="color:var(--warn);font-weight:600;">⚠ ${fmt(totalOpen)} Tage offen</span>`;
  const names=Object.keys(byPers).sort((a,b)=>byPers[b].total-byPers[a].total);
  if(names.length){html+=`<span style="color:var(--rule)">│</span>`;names.forEach(name=>{const d=byPers[name].total,ci=crew.indexOf(name),col=ci>=0?CREW_COLORS[ci%CREW_COLORS.length]:'#888';html+=`<span title="${name}: ${fmt(d)} Tage"><span style="display:inline-block;width:5px;height:5px;border-radius:0;background:${col};margin-right:3px;vertical-align:middle;"></span><span style="color:var(--muted)">${name.split(' ')[0]}:</span><strong style="color:${col}">${fmt(d)}T</strong></span>`;});}
  document.getElementById('statsBar').innerHTML=html;
}
