// ── Crew Management ────────────────────────────────────────────────────────────
import { crew, TOUR_DATES, POSITIONS, assignments, IS_MANAGER, CREW_COLORS } from './state.js';
import { showToast, esc, getVal } from './utils.js';

// Global functions called: _savePlanToLS, renderCrew, renderTable

export function renderCrew(){
  const el=document.getElementById('crewList');
  el.innerHTML='';
  const hdr=document.getElementById('crewHeading');
  if(hdr)hdr.textContent='Crew — '+crew.length;
  crew.forEach((name,i)=>{
    let days=0;
    TOUR_DATES.forEach(r=>{POSITIONS.forEach(p=>{if(getVal(r.date,p.id)===name)days++;});});
    const d=document.createElement('div');
    d.className='crew-member';
    d.innerHTML=`<div class="crew-dot" style="background:${CREW_COLORS[i%CREW_COLORS.length]}"></div>`
      +`<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(name)}</span>`
      +`<span class="crew-days">${String(days).padStart(2,'0')}d</span>`
      +(IS_MANAGER?`<button class="sm danger" onclick="removeCrew(${i})" title="Entfernen">×</button>`:'');
    el.appendChild(d);
  });
  const posEl=document.getElementById('posList');
  posEl.innerHTML=POSITIONS.map((p,i)=>IS_MANAGER
    ?`<div class="sb-pos" onclick="openRenamePos(${i})" title="Position umbenennen"><span class="sb-pos-short">${esc(p.short||'')}</span><span class="sb-pos-label">${esc(p.label)}</span></div>`
    :`<div class="sb-pos"><span class="sb-pos-short">${esc(p.short||'')}</span><span class="sb-pos-label">${esc(p.label)}</span></div>`
  ).join('');
}

export function addCrew(){
  if(!IS_MANAGER)return;
  const inp=document.getElementById('newCrewName');
  const n=inp.value.trim();
  if(!n)return;
  if(crew.includes(n)){
    showToast('Name bereits vorhanden','#e84a4a');
    return;
  }
  crew.push(n);
  inp.value='';
  _savePlanToLS(activePlanId);
  renderCrew();
}

export function removeCrew(i){
  if(!IS_MANAGER)return;
  const name=crew[i];
  crew.splice(i,1);
  Object.keys(assignments).forEach(d=>{
    Object.keys(assignments[d]||{}).forEach(p=>{
      if(assignments[d][p]===name)delete assignments[d][p];
    });
  });
  _savePlanToLS(activePlanId);
  renderCrew();
  renderTable();
}
