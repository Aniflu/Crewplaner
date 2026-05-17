// ── Dropdown Engine ────────────────────────────────────────────────────────────
function showDD(rect,header,items){
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
  if(left+210>innerWidth)left=innerWidth-220;
  if(top+items.length*36+40>innerHeight)top=rect.top-items.length*36-44;
  menu.style.left=left+'px';menu.style.top=top+'px';menu.style.display='block';
  document.getElementById('ddOv').classList.add('open');
}
function closeDD(){document.getElementById('ddOv').classList.remove('open');document.getElementById('ddMenu').style.display='none';}

// ── Type Dropdown ──────────────────────────────────────────────────────────────
function openTypeDD(e,dateStr){
  e.stopPropagation();
  const row=TOUR_DATES.find(r=>r.date===dateStr);
  const rect=e.currentTarget.getBoundingClientRect();
  const items=TYPE_OPTS.map(o=>({
    label:o.label,selected:o.label===row.typeLabel,
    action:()=>{row.type=o.type;row.typeLabel=o.label;saveCustomType(o.label,o.type);closeDD();renderTable();}
  }));
  items.push({label:'✏ Eigene Eingabe…',cls:'reset',action:async()=>{
    closeDD();
    const val=await showPrompt('Tagesart eingeben:',row.typeLabel);
    if(!val||!val.trim())return;
    const label=val.trim(),type=typeFromLabel(label);
    saveCustomType(label,type);
    row.type=type;row.typeLabel=label;
    renderTable();
  }});
  showDD(rect,'Tagesart',items);
}

// ── Date Dropdown (löschen) ───────────────────────────────────────────────────
function openDateDD(e,dateStr){
  e.stopPropagation();
  const items=[
    {label:'🗑 Zeile löschen',cls:'danger',action:async()=>{
      const ok=await showConfirm('Zeile '+fmtD(dateStr)+' wirklich löschen?','Löschen');
      if(!ok)return;
      const idx=TOUR_DATES.findIndex(r=>r.date===dateStr);
      if(idx>-1)TOUR_DATES.splice(idx,1);
      delete assignments[dateStr];
      closeDD();renderTable();
    }}
  ];
  showDD(e.currentTarget.getBoundingClientRect(),fmtD(dateStr),items);
}

// ── Crew Assignment Dropdown ───────────────────────────────────────────────────
function openCrewDD(e,dateStr,posId){
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
        const _email=crewMeta?.[si.crewName]?.email;
        if(_email&&si.crewName){const _lbl=(POSITIONS||[]).find(p=>p.id===posId)?.label||posId;_storePendingCancellation(si.crewName,_email,dateStr,_lbl);}
        await cancelProposal(dateStr,posId);
        if(assignmentStatuses[dateStr])delete assignmentStatuses[dateStr][posId];
        if(assignments[dateStr])delete assignments[dateStr][posId];
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
        const _email=crewMeta?.[si.crewName]?.email;
        if(_email&&si.crewName){const _lbl=(POSITIONS||[]).find(p=>p.id===posId)?.label||posId;_storePendingCancellation(si.crewName,_email,dateStr,_lbl);}
        await cancelProposal(dateStr,posId);
        if(assignmentStatuses[dateStr])delete assignmentStatuses[dateStr][posId];
        if(assignments[dateStr])delete assignments[dateStr][posId];
        showToast('Besetzung aufgehoben ✓','#4ae8a0');
      }catch(err){
        showToast('Fehler: '+err.message,'#e84a4a');
      }
      renderTable();
    }});
  }
  if(def)items.push({label:`↩ Standard: ${def}`,cls:'reset',action:()=>{if(!assignments[dateStr])assignments[dateStr]={};delete assignments[dateStr][posId];closeDD();renderTable();}});
  items.push({label:'— Nicht besetzt',cls:'clear',action:()=>{setAssign(dateStr,posId,'');closeDD();renderTable();}});
  items.push({label:'⚠ Offen / Unbesetzt',cls:'offen',color:'#e07060',action:()=>{setAssign(dateStr,posId,OFFEN);closeDD();renderTable();}});
  crew.forEach((name,i)=>{
    const meta=SUPABASE_ENABLED?(crewMeta[name]||null):null;
    const hasEmail=!!(meta?.email);
    const label=hasEmail?`📧 ${name}`:name;
    items.push({label,dot:CREW_COLORS[i%CREW_COLORS.length],selected:current===name,action:()=>{
      setAssign(dateStr,posId,name);
      proposeCrew(dateStr,posId,name,meta?.email||null).catch(e=>console.warn(e));
      closeDD();
    }});
  });
  showDD(e.currentTarget.getBoundingClientRect(),pos.label+(SUPABASE_ENABLED?' · 📧=Benachrichtigung':''),items);
}
function setAssign(d,p,v){if(!assignments[d])assignments[d]={};assignments[d][p]=v;renderTable();}

// ── Default Crew Dropdown ──────────────────────────────────────────────────────
function openDefaultDD(e,posId){
  e.stopPropagation();
  const pos=POSITIONS.find(p=>p.id===posId);
  const cur=defaultCrew[posId]||'';
  const items=[{label:'— Kein Standard',cls:'clear',action:()=>{defaultCrew[posId]='';closeDD();renderTable();}},
    ...crew.map((name,i)=>({label:name,dot:CREW_COLORS[i%CREW_COLORS.length],selected:name===cur,action:()=>{defaultCrew[posId]=name;closeDD();renderTable();}}))];
  showDD(e.currentTarget.getBoundingClientRect(),`Standard: ${pos.label}`,items);
}

async function bulkCancelPos(e,posId){
  e.stopPropagation();
  const pos=POSITIONS.find(p=>p.id===posId);
  const ok=await showConfirm(`Alle offenen Anfragen für "${pos?.label}" zurückziehen?`,'Zurückziehen');
  if(!ok)return;
  try{
    await bulkCancelProposals(posId);
    Object.keys(assignmentStatuses).forEach(date=>{
      const si=assignmentStatuses[date]?.[posId];
      if(isPending(si)){
        delete assignmentStatuses[date][posId];
        if(assignments[date])delete assignments[date][posId];
      }
    });
    showToast(`${pos?.label}: Alle Anfragen zurückgezogen`,'#4ae8a0');
  }catch(err){
    console.error('bulkCancelProposals failed:',err);
    showToast(`${pos?.label}: Fehler beim Zurückziehen`,'#e84a4a');
    await loadAssignmentStatuses();
  }
  renderTable();
}

async function requestForPos(e,posId){
  e.stopPropagation();
  const crewName=defaultCrew[posId];
  if(!crewName)return;
  if(!SUPABASE_ENABLED){showToast('Supabase nicht aktiv','#e84a4a');return;}
  if(Object.keys(crewMeta).length===0)await loadCrewMeta();
  if(!(crewMeta[crewName]||{}).email){showToast(`${crewName}: Keine E-Mail hinterlegt`,'#e84a4a');return;}
  const crewEmail=crewMeta[crewName]?.email||'';
  const slots=TOUR_DATES
    .filter(day=>day.type!=='off'&&!assignments[day.date]?.[posId]&&assignmentStatuses[day.date]?.[posId]?.status!=='confirmed')
    .map(day=>({date:day.date,posId,crewName,crewEmail}));
  if(!slots.length){showToast('Alle Tage bereits bestätigt ✓','#4ae8a0');return;}
  await bulkProposeCrew(slots);
  renderTable();
  showToast(`${crewName}: ${slots.length} Tage angefragt ✓`,'#4ae8a0');
}
