// ── Position Management ────────────────────────────────────────────────────────
function openPosMenu(e,idx){
  if(!IS_MANAGER)return;
  e.stopPropagation();
  const pos=POSITIONS[idx];
  const items=[{label:'✏ Umbenennen',action:()=>{closeDD();openRenamePos(idx);}}];
  if(POSITIONS.length>1)items.push({label:'✕ Spalte löschen',cls:'danger',action:async()=>{const ok=await showConfirm(`"${pos.label}" löschen?`,'Löschen');if(ok){Object.keys(assignments).forEach(d=>{delete assignments[d][pos.id];});POSITIONS.splice(idx,1);closeDD();_savePlanToLS(activePlanId);renderCrew();renderTable();}}});
  showDD(e.currentTarget.getBoundingClientRect(),pos.label,items);
}

function openRenamePos(idx){
  if(!IS_MANAGER)return;
  openSharedModal('Position umbenennen',POSITIONS[idx].label,v=>{POSITIONS[idx].label=v;POSITIONS[idx].short=v;_savePlanToLS(activePlanId);renderCrew();renderTable();});
}

function openAddPos(){
  if(!IS_MANAGER)return;
  openSharedModal('Neue Position','',v=>{POSITIONS.push({id:'pos_'+Date.now(),label:v,short:v});_savePlanToLS(activePlanId);renderCrew();renderTable();});
}
