// ── Dropdown Engine ────────────────────────────────────────────────────────────
import { TOUR_DATES, POSITIONS, crew, CREW_COLORS, assignments, defaultCrew,
         assignmentStatuses, IS_MANAGER, IS_CREW,
         OFFEN, OFFDAY, REISE_TAG, AUSSCHREIBEN, crewMeta,
         setAssignment, clearAssignmentSlot } from './state.js';
import { SUPABASE_ENABLED } from './config.js';
import { getVal, isPending, esc, showToast, sortInsert, fmtD } from './utils.js';
import { TYPE_OPTS, typeFromLabel, saveCustomType } from './types.js';
import { renderTable } from './render.js';
import { pbDelete } from './pb.js';
import { cancelProposal, bulkCancelProposals, bulkProposeCrew as proposeCrew, loadAssignmentStatuses } from './dataService.js';
import { _savePlanToLS, getActivePlanId } from './plans.js';
import { showPrompt, showConfirm } from './dialog.js';
import { hasPermission } from './rbac.js';
import { openBlockAssign } from './tourblock.js';
import { _queueCrewUpdate } from './userView.js';

export function showDD(rect,header,items){
  const menu=document.getElementById('ddMenu');
  menu.innerHTML=`<div class="dd-hdr">${header}</div>`;
  items.forEach(it=>{
    const d=document.createElement('div');
    d.className='dd-item'+(it.cls?' '+it.cls:'')+(it.selected?' selected':'');
    if(it.color)d.style.color=it.color;
    if(it.dot)d.innerHTML=`<div style="width:8px;height:8px;border-radius:50%;background:${it.dot};flex-shrink:0;"></div>${it.label}`;
    else d.textContent=it.label;
    d.onclick=it.action;menu.appendChild(d);
  });
  let left=rect.left,top=rect.bottom+4;
  if(left+210>innerWidth)left=Math.max(4,innerWidth-220);
  const menuH=Math.min(items.length*36+44, innerHeight-16);
  if(top+menuH>innerHeight){top=rect.top-menuH-4;if(top<8)top=8;}
  menu.style.left=left+'px';menu.style.top=top+'px';
  menu.style.maxHeight=menuH+'px';menu.style.overflowY='auto';
  menu.style.display='block';
  document.getElementById('ddOv').classList.add('open');
}
export function closeDD(){document.getElementById('ddOv').classList.remove('open');document.getElementById('ddMenu').style.display='none';}

// ── Type Dropdown ──────────────────────────────────────────────────────────────
export function openTypeDD(e,dateStr){
  if(!IS_MANAGER)return;
  e.stopPropagation();
  const row=TOUR_DATES.find(r=>r.date===dateStr);
  const rect=e.currentTarget.getBoundingClientRect();
  const items=TYPE_OPTS.map(o=>({
    label:o.label,selected:o.label===row.typeLabel,
    action:()=>{
      const oldLabel=row.typeLabel;
      row.type=o.type;row.typeLabel=o.label;saveCustomType(o.label,o.type);closeDD();
      _savePlanToLS(getActivePlanId());
      if(oldLabel!==o.label)_queueCrewUpdate(row.date,`Tagesart: ${oldLabel} → ${o.label}`);
      else renderTable();
    }
  }));
  items.push({label:'✏ Eigene Eingabe…',cls:'reset',action:async()=>{
    closeDD();
    const val=await showPrompt('Tagesart eingeben:',row.typeLabel);
    if(!val||!val.trim())return;
    const label=val.trim(),type=typeFromLabel(label);
    saveCustomType(label,type);
    const oldLabel=row.typeLabel;
    row.type=type;row.typeLabel=label;
    _savePlanToLS(getActivePlanId());
    if(oldLabel!==label)_queueCrewUpdate(row.date,`Tagesart: ${oldLabel} → ${label}`);
    else renderTable();
  }});
  showDD(rect,'Tagesart',items);
}

// ── Date Dropdown (löschen) ───────────────────────────────────────────────────
export function openDateDD(e,dateStr){
  if(!IS_MANAGER)return;
  e.stopPropagation();
  const row=TOUR_DATES.find(r=>r.date===dateStr);
  const items=[
    {label:'→ Block zuweisen…',action:()=>{closeDD();openBlockAssign(dateStr);}},
    {label:'🗑 Zeile löschen',cls:'danger',action:async()=>{
      const ok=await showConfirm('Zeile '+fmtD(dateStr)+' wirklich löschen?','Löschen');
      if(!ok)return;
      _queueCrewUpdate(dateStr,'Datum entfernt');
      const idx=TOUR_DATES.findIndex(r=>r.date===dateStr);
      if(idx>-1)TOUR_DATES.splice(idx,1);
      if(assignments[dateStr])delete assignments[dateStr];
      closeDD();_savePlanToLS(getActivePlanId());renderTable();
    }}
  ];
  if(row?.blockId)items.unshift({label:'✕ Aus Block entfernen',cls:'clear',action:()=>{row.blockId='';row.blockName='';closeDD();_savePlanToLS(getActivePlanId());renderTable();}});
  showDD(e.currentTarget.getBoundingClientRect(),fmtD(dateStr),items);
}

// ── Crew Assignment Dropdown ───────────────────────────────────────────────────
export function openCrewDD(e,dateStr,posId){
  if(!hasPermission('assignCrew'))return;
  e.stopPropagation();
  const pos=POSITIONS.find(p=>p.id===posId);
  const def=defaultCrew[posId]||'';
  const current=assignments[dateStr]?.[posId];
  const items=[];
  const si=assignmentStatuses[dateStr]?.[posId];
  if(isPending(si)){
    items.push({label:'✕ Anfrage zurückziehen',cls:'danger',action:async()=>{
      closeDD();
      try{
        await cancelProposal(dateStr,posId);
        const _email=crewMeta?.[si.crewName]?.email;
        if(_email&&si.crewName){const _lbl=(POSITIONS||[]).find(p=>p.id===posId)?.label||posId;_storePendingCancellation(si.crewName,_email,dateStr,_lbl);}
        if(assignmentStatuses[dateStr])delete assignmentStatuses[dateStr][posId];
        clearAssignmentSlot(dateStr, posId);
        showToast('Anfrage zurückgezogen ✓','#4ae8a0');
      }catch(err){
        console.error('cancelProposal failed:',err);
        showToast('Fehler: Anfrage konnte nicht zurückgezogen werden','#e84a4a');
      }
      renderTable();
    }});
  }
  if(si && !isPending(si)){
    items.push({label:'✕ Besetzung aufheben',cls:'danger',action:async()=>{
      closeDD();
      try{
        await cancelProposal(dateStr,posId);
        const _email=crewMeta?.[si.crewName]?.email;
        if(_email&&si.crewName){const _lbl=(POSITIONS||[]).find(p=>p.id===posId)?.label||posId;_storePendingCancellation(si.crewName,_email,dateStr,_lbl);}
        if(assignmentStatuses[dateStr])delete assignmentStatuses[dateStr][posId];
        clearAssignmentSlot(dateStr, posId);
        showToast('Besetzung aufgehoben ✓','#4ae8a0');
      }catch(err){
        showToast('Fehler: '+err.message,'#e84a4a');
      }
      renderTable();
    }});
  }
  // Anfragen ausschließlich über Crew-Notify-Modal (Einladen-Button)
  const _applyState=async(val)=>{
    closeDD();
    if(si){
      try{await cancelProposal(dateStr,posId);}catch(e){console.warn('cancelProposal:',e);}
      if(assignmentStatuses[dateStr])delete assignmentStatuses[dateStr][posId];
    }
    setAssign(dateStr,posId,val);
    renderTable();
  };
  if(def)items.push({label:`↩ Standard: ${def}`,cls:'reset',action:async()=>{
    closeDD();
    if(si){try{await cancelProposal(dateStr,posId);}catch(e){console.warn(e);}if(assignmentStatuses[dateStr])delete assignmentStatuses[dateStr][posId];}
    clearAssignmentSlot(dateStr, posId);
    renderTable();
  }});
  items.push({label:'— Nicht besetzt',cls:'clear',action:()=>_applyState('')});
  items.push({label:'⚠ Offen / Unbesetzt',cls:'offen',color:'#e07060',action:()=>_applyState(OFFEN)});
  items.push({label:'🏖 Offday',color:'#70ad47',action:()=>_applyState(OFFDAY)});
  items.push({label:'✈ Reisetag',color:'#4f81bd',action:()=>_applyState(REISE_TAG)});
  items.push({label:'📋 Ausschreiben',color:'#c07830',action:()=>_applyState(AUSSCHREIBEN)});
  crew.forEach((name,i)=>{
    const meta=SUPABASE_ENABLED?(crewMeta[name]||null):null;
    const hasEmail=!!(meta?.email);
    const label=hasEmail?`📧 ${name}`:name;
    items.push({label,dot:CREW_COLORS[i%CREW_COLORS.length],selected:current===name,action:()=>_applyState(name)});
  });
  showDD(e.currentTarget.getBoundingClientRect(),pos.label+(SUPABASE_ENABLED?' · 📧=Benachrichtigung':''),items);
}
export function setAssign(d,p,v){setAssignment(d,p,v);_savePlanToLS(getActivePlanId());renderTable();}

// ── Default Crew Dropdown ──────────────────────────────────────────────────────
export function openDefaultDD(e,posId){
  e.stopPropagation();
  const pos=POSITIONS.find(p=>p.id===posId);
  const cur=defaultCrew[posId]||'';
  const items=[{label:'— Kein Standard',cls:'clear',action:()=>{defaultCrew[posId]='';closeDD();_savePlanToLS(getActivePlanId());renderTable();}},
    ...crew.map((name,i)=>({label:name,dot:CREW_COLORS[i%CREW_COLORS.length],selected:name===cur,action:()=>{defaultCrew[posId]=name;closeDD();_savePlanToLS(getActivePlanId());renderTable();}}))];
  showDD(e.currentTarget.getBoundingClientRect(),`Standard: ${pos.label}`,items);
}

export async function bulkCancelPos(e,posId){
  e.stopPropagation();
  const pos=POSITIONS.find(p=>p.id===posId);
  const def=defaultCrew[posId]||'';
  const ok=await showConfirm(`Offene Anfragen von „${def}" für „${pos?.label}" zurückziehen?`,'Zurückziehen');
  if(!ok)return;
  try{
    await bulkCancelProposals(posId, def);
    Object.keys(assignmentStatuses).forEach(date=>{
      const si=assignmentStatuses[date]?.[posId];
      if(si&&si.crewName===def&&isPending(si)){
        delete assignmentStatuses[date][posId];
        clearAssignmentSlot(date, posId);
      }
    });
    showToast(`${pos?.label}: Anfragen von ${def} zurückgezogen`,'#4ae8a0');
  }catch(err){
    console.error('bulkCancelProposals failed:',err);
    showToast(`${pos?.label}: Fehler beim Zurückziehen`,'#e84a4a');
    await loadAssignmentStatuses();
  }
  renderTable();
}

export async function requestAll(e){
  if(!IS_MANAGER)return;
  e.stopPropagation();
  const _ok=await showConfirm('Alle leeren Slots mit Standard-Crew füllen?\nDas überschreibt deinen Plan und kann nicht rückgängig gemacht werden.','Übernehmen');
  if(!_ok)return;
  TOUR_DATES.forEach(day=>{
    POSITIONS.forEach(pos=>{
      const def=defaultCrew[pos.id];
      if(!def)return;
      if(day.date in assignments&&pos.id in(assignments[day.date]||{}))return;
      setAssignment(day.date, pos.id, def);
    });
  });
  _savePlanToLS(getActivePlanId());
  renderTable();
  showToast('Alle Standard-Zuweisungen übernommen ✓','#4ae8a0');
}

export function requestForPos(e,posId){
  if(!IS_MANAGER)return;
  e.stopPropagation();
  const def=defaultCrew[posId];
  if(!def)return;
  TOUR_DATES.forEach(day=>{
    if(day.date in assignments&&posId in(assignments[day.date]||{}))return;
    setAssignment(day.date, posId, def);
  });
  _savePlanToLS(getActivePlanId());
  renderTable();
  const pos=POSITIONS.find(p=>p.id===posId);
  showToast(`${pos?.label}: Standard übernommen ✓`,'#4ae8a0');
}
