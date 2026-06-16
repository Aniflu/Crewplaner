// ── Crew Management ────────────────────────────────────────────────────────────
import { crew, TOUR_DATES, POSITIONS, assignments, defaultCrew, crewMeta, IS_MANAGER, CREW_COLORS } from './state.js';
import { showToast, esc, getVal } from './utils.js';
import { _savePlanToLS, getActivePlanId } from './plans.js';
import { renderTable } from './render.js';
import { showPrompt } from './dialog.js';
import { renameCrewMember, deleteCrewMember } from './dataService.js';

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
      +(IS_MANAGER?`<button class="sm" onclick="renameCrew(${i})" title="Umbenennen">✏</button>`:'')
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
  _savePlanToLS(getActivePlanId());
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
  _savePlanToLS(getActivePlanId());
  renderCrew();
  renderTable();
  // PB-crew_members-Record mitlöschen (sonst bleibt eine Leiche → Dublette beim Neuanlegen)
  deleteCrewMember(name);
}

// ── Crew-Mitglied umbenennen — aktualisiert lokal (crew/defaultCrew/assignments/crewMeta)
// UND PB (crew_members + assignments), legt KEINE Dublette an.
export async function renameCrew(i){
  if(!IS_MANAGER)return;
  const oldName=crew[i];
  const val=await showPrompt('Crew-Mitglied umbenennen:',oldName);
  if(val===null)return;
  const n=(val||'').trim();
  if(!n||n===oldName)return;
  if(crew.includes(n)){showToast('Name bereits vorhanden','#e84a4a');return;}
  // lokal überall ersetzen
  crew[i]=n;
  Object.keys(defaultCrew).forEach(k=>{if(defaultCrew[k]===oldName)defaultCrew[k]=n;});
  Object.keys(assignments).forEach(d=>{Object.keys(assignments[d]||{}).forEach(p=>{if(assignments[d][p]===oldName)assignments[d][p]=n;});});
  if(crewMeta[oldName]){crewMeta[n]=crewMeta[oldName];delete crewMeta[oldName];}
  _savePlanToLS(getActivePlanId());
  renderCrew();
  renderTable();
  // PB: bestehende Records umbenennen (keine Dublette)
  try{
    await renameCrewMember(oldName,n);
    showToast(`Umbenannt → ${n} ✓`,'#4ae8a0');
  }catch(e){
    showToast('Lokal umbenannt, PB-Sync fehlgeschlagen: '+e.message,'#e84a4a');
  }
}
