// ── Crew Management ────────────────────────────────────────────────────────────
import { crew, TOUR_DATES, POSITIONS, assignments, defaultCrew, crewMeta, IS_MANAGER, CREW_COLORS } from './state.js';
import { showToast, esc, getVal, normCrewName } from './utils.js';
import { _savePlanToLS, getActivePlanId } from './plans.js';
import { renderTable } from './render.js';
import { showPrompt } from './dialog.js';
import { renameCrewMember, deleteCrewMember, loadAllKnownCrew, saveCrewLink } from './dataService.js';
import { openModal, closeModal } from './modals.js';

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

// ── Bekannte Crew aus früheren Touren übernehmen ──────────────────────────────
// Zeigt eine tour-übergreifende Liste (alle je angelegten Crew-Mitglieder, doppelte
// Namen zusammengefasst) zum Anhaken. Angehakte landen MIT E-Mail im aktuellen Plan.
let _importCandidates = [];   // [{name,email}] — die aktuell anzeigbaren (noch nicht im Plan)

export async function openImportCrewModal(){
  if(!IS_MANAGER)return;
  const body=document.getElementById('crewImportBody');
  if(body)body.innerHTML='<div style="font-size:.7rem;color:#888;">Lade bekannte Crew…</div>';
  openModal('crewImportModal');
  let known=[];
  try{ known=await loadAllKnownCrew(); }
  catch(e){ if(body)body.innerHTML=`<div style="font-size:.7rem;color:#e84a4a;">Fehler: ${esc(e.message)}</div>`; return; }
  // Bereits im Plan vorhandene Namen ausblenden.
  const have=new Set(crew.map(n=>normCrewName(n)));
  _importCandidates=known.filter(k=>!have.has(normCrewName(k.name)));
  _renderImportCrewList();
}

function _renderImportCrewList(){
  const body=document.getElementById('crewImportBody');
  if(!body)return;
  if(!_importCandidates.length){
    body.innerHTML='<div style="font-size:.7rem;color:#888;">Keine weiteren bekannten Crew-Mitglieder (alle schon im Plan).</div>';
    return;
  }
  body.innerHTML=_importCandidates.map((k,i)=>`
    <label style="display:flex;align-items:center;gap:8px;padding:5px 2px;border-bottom:1px solid #2a2a3a;font-size:.66rem;color:#ddd;cursor:pointer;">
      <input type="checkbox" data-i="${i}" checked style="width:14px;height:14px;accent-color:#4ae8a0;flex-shrink:0;">
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(k.name)}</span>
      <span style="color:#777;font-size:.6rem;">${k.email?esc(k.email):'keine E-Mail'}</span>
    </label>`).join('');
}

export function _importSelectAll(val){
  document.querySelectorAll('#crewImportBody input[type=checkbox]').forEach(cb=>{cb.checked=val;});
}

export function _closeImportCrew(){ closeModal('crewImportModal'); }

export async function confirmImportCrew(){
  if(!IS_MANAGER)return;
  const boxes=[...document.querySelectorAll('#crewImportBody input[type=checkbox]')];
  const chosen=boxes.filter(cb=>cb.checked).map(cb=>_importCandidates[+cb.dataset.i]).filter(Boolean);
  if(!chosen.length){ showToast('Nichts ausgewählt','#5a6070'); return; }
  let added=0;
  for(const k of chosen){
    if(!crew.some(n=>normCrewName(n)===normCrewName(k.name))){ crew.push(k.name); added++; }
  }
  _savePlanToLS(getActivePlanId());
  renderCrew();
  renderTable();
  closeModal('crewImportModal');
  showToast(`${added} übernommen — E-Mails werden verknüpft…`,'#e8c84a');
  // E-Mails im aktuellen Plan verknüpfen (crew_members-Record + crewMeta).
  let linked=0, failed=0;
  for(const k of chosen){
    if(!k.email)continue;
    try{ await saveCrewLink(k.name,k.email); linked++; }
    catch(e){ failed++; console.warn('Crew-Import Link fehlgeschlagen:',k.name,e.message); }
  }
  renderCrew();
  showToast(failed?`${added} übernommen, ${linked} verknüpft, ${failed} E-Mail-Fehler`:`${added} übernommen · ${linked} E-Mails verknüpft ✓`, failed?'#e8c84a':'#4ae8a0');
}
