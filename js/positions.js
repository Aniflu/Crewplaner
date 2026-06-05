// ── Position Management ────────────────────────────────────────────────────────
import { POSITIONS, assignments, IS_MANAGER } from './state.js';
import { _savePlanToLS, getActivePlanId } from './plans.js';
import { renderCrew } from './crew.js';
import { renderTable } from './render.js';
import { closeDD, showDD } from './dropdown.js';
import { openSharedModal } from './modals.js';
import { showConfirm } from './dialog.js';

export function openPosMenu(e,idx){
  if(!IS_MANAGER)return;
  e.stopPropagation();
  const pos=POSITIONS[idx];
  const items=[{label:'✏ Umbenennen',action:()=>{closeDD();openRenamePos(idx);}}];
  if(POSITIONS.length>1)items.push({label:'✕ Spalte löschen',cls:'danger',action:async()=>{const ok=await showConfirm(`"${pos.label}" löschen?`,'Löschen');if(ok){Object.keys(assignments).forEach(d=>{delete assignments[d][pos.id];});POSITIONS.splice(idx,1);closeDD();_savePlanToLS(getActivePlanId());renderCrew();renderTable();}}});
  showDD(e.currentTarget.getBoundingClientRect(),pos.label,items);
}

export function openRenamePos(idx){
  if(!IS_MANAGER)return;
  openSharedModal('Position umbenennen',POSITIONS[idx].label,v=>{POSITIONS[idx].label=v;POSITIONS[idx].short=v;_savePlanToLS(getActivePlanId());renderCrew();renderTable();});
}

export function openAddPos(){
  if(!IS_MANAGER)return;
  openSharedModal('Neue Position','',v=>{POSITIONS.push({id:'pos_'+Date.now(),label:v,short:v});_savePlanToLS(getActivePlanId());renderCrew();renderTable();});
}
