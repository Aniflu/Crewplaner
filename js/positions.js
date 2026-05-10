// ── Position Management ────────────────────────────────────────────────────────
function openPosMenu(e,idx){
  e.stopPropagation();
  const pos=POSITIONS[idx];
  const items=[{label:'✏ Umbenennen',action:()=>{closeDD();openRenamePos(idx);}}];
  if(POSITIONS.length>1)items.push({label:'✕ Spalte löschen',cls:'danger',action:async()=>{const ok=await showConfirm(`"${pos.label}" löschen?`,'Löschen');if(ok){Object.keys(assignments).forEach(d=>{delete assignments[d][pos.id];});POSITIONS.splice(idx,1);closeDD();renderCrew();renderTable();}}});
  showDD(e.currentTarget.getBoundingClientRect(),pos.label,items);
}

function openRenamePos(idx){
  openSharedModal('Position umbenennen',POSITIONS[idx].label,v=>{POSITIONS[idx].label=v;POSITIONS[idx].short=v;renderCrew();renderTable();});
}

function openAddPos(){
  openSharedModal('Neue Position','',v=>{POSITIONS.push({id:'pos_'+Date.now(),label:v,short:v});renderCrew();renderTable();});
}
