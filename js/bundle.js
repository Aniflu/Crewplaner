// Combined bundle from crew.js, dropdown.js, positions.js, modals.js, dates.js, logos.js, calendar.js

// === crew.js ===
// Crew Management
function renderCrew(){
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

function addCrew(){if(!IS_MANAGER)return;const inp=document.getElementById('newCrewName');const n=inp.value.trim();if(!n)return;crew.push(n);inp.value='';_savePlanToLS(activePlanId);renderCrew();}

function removeCrew(i){if(!IS_MANAGER)return;const name=crew[i];crew.splice(i,1);Object.keys(assignments).forEach(d=>{Object.keys(assignments[d]||{}).forEach(p=>{if(assignments[d][p]===name)delete assignments[d][p];});});_savePlanToLS(activePlanId);renderCrew();renderTable();}


// === dropdown.js ===
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
  if(!IS_MANAGER)return;
  e.stopPropagation();
  const row=TOUR_DATES.find(r=>r.date===dateStr);
  const rect=e.currentTarget.getBoundingClientRect();
  const items=TYPE_OPTS.map(o=>({
    label:o.label,selected:o.label===row.typeLabel,
    action:()=>{
      const oldLabel=row.typeLabel;
      row.type=o.type;row.typeLabel=o.label;saveCustomType(o.label,o.type);closeDD();
      _savePlanToLS(activePlanId);
      if(oldLabel!==o.label&&typeof _queueCrewUpdate==='function')_queueCrewUpdate(row.date,`Tagesart: ${oldLabel} → ${o.label}`);
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
    _savePlanToLS(activePlanId);
    if(oldLabel!==label&&typeof _queueCrewUpdate==='function')_queueCrewUpdate(row.date,`Tagesart: ${oldLabel} → ${label}`);
    else renderTable();
  }});
  showDD(rect,'Tagesart',items);
}

// ── Date Dropdown (löschen) ───────────────────────────────────────────────────
function openDateDD(e,dateStr){
  if(!IS_MANAGER)return;
  e.stopPropagation();
  const items=[
    {label:'🗑 Zeile löschen',cls:'danger',action:async()=>{
      const ok=await showConfirm('Zeile '+fmtD(dateStr)+' wirklich löschen?','Löschen');
      if(!ok)return;
      if(typeof _queueCrewUpdate==='function')_queueCrewUpdate(dateStr,'Datum entfernt');
      const idx=TOUR_DATES.findIndex(r=>r.date===dateStr);
      if(idx>-1)TOUR_DATES.splice(idx,1);
      delete assignments[dateStr];
      closeDD();_savePlanToLS(activePlanId);renderTable();
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
        await cancelProposal(dateStr,posId);
        const _email=crewMeta?.[si.crewName]?.email;
        if(_email&&si.crewName){const _lbl=(POSITIONS||[]).find(p=>p.id===posId)?.label||posId;_storePendingCancellation(si.crewName,_email,dateStr,_lbl);}
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
        await cancelProposal(dateStr,posId);
        const _email=crewMeta?.[si.crewName]?.email;
        if(_email&&si.crewName){const _lbl=(POSITIONS||[]).find(p=>p.id===posId)?.label||posId;_storePendingCancellation(si.crewName,_email,dateStr,_lbl);}
        if(assignmentStatuses[dateStr])delete assignmentStatuses[dateStr][posId];
        if(assignments[dateStr])delete assignments[dateStr][posId];
        showToast('Besetzung aufgehoben ✓','#4ae8a0');
      }catch(err){
        showToast('Fehler: '+err.message,'#e84a4a');
      }
      renderTable();
    }});
  }
  if(!si&&current&&current!==OFFEN&&current!==OFFDAY&&current!==REISE_TAG&&current!==AUSSCHREIBEN){
    const _reqMeta=SUPABASE_ENABLED?(crewMeta[current]||null):null;
    if(_reqMeta?.email){
      items.push({label:`📧 ${current} anfragen`,color:'#e8c84a',action:async()=>{
        closeDD();
        try{await proposeCrew(dateStr,posId,current,_reqMeta.email);showToast(`${current} angefragt ✓`,'#4ae8a0');renderTable();}
        catch(e){showToast('Anfrage-Fehler: '+e.message,'#e84a4a');}
      }});
    }
  }
  if(def)items.push({label:`↩ Standard: ${def}`,cls:'reset',action:()=>{if(!assignments[dateStr])assignments[dateStr]={};delete assignments[dateStr][posId];closeDD();renderTable();}});
  items.push({label:'— Nicht besetzt',cls:'clear',action:()=>{setAssign(dateStr,posId,'');closeDD();renderTable();}});
  items.push({label:'⚠ Offen / Unbesetzt',cls:'offen',color:'#e07060',action:()=>{setAssign(dateStr,posId,OFFEN);closeDD();renderTable();}});
  items.push({label:'🏖 Offday',color:'#70ad47',action:()=>{setAssign(dateStr,posId,OFFDAY);closeDD();renderTable();}});
  items.push({label:'✈ Reisetag',color:'#4f81bd',action:()=>{setAssign(dateStr,posId,REISE_TAG);closeDD();renderTable();}});
  items.push({label:'📋 Ausschreiben',color:'#c07830',action:()=>{setAssign(dateStr,posId,AUSSCHREIBEN);closeDD();renderTable();}});
  crew.forEach((name,i)=>{
    const meta=SUPABASE_ENABLED?(crewMeta[name]||null):null;
    const hasEmail=!!(meta?.email);
    const label=hasEmail?`📧 ${name}`:name;
    items.push({label,dot:CREW_COLORS[i%CREW_COLORS.length],selected:current===name,action:()=>{
      setAssign(dateStr,posId,name);
      closeDD();
    }});
  });
  showDD(e.currentTarget.getBoundingClientRect(),pos.label+(SUPABASE_ENABLED?' · 📧=Benachrichtigung':''),items);
}
function setAssign(d,p,v){if(!assignments[d])assignments[d]={};assignments[d][p]=v;_savePlanToLS(activePlanId);renderTable();}

// ── Default Crew Dropdown ──────────────────────────────────────────────────────
function openDefaultDD(e,posId){
  e.stopPropagation();
  const pos=POSITIONS.find(p=>p.id===posId);
  const cur=defaultCrew[posId]||'';
  const items=[{label:'— Kein Standard',cls:'clear',action:()=>{defaultCrew[posId]='';closeDD();_savePlanToLS(activePlanId);renderTable();}},
    ...crew.map((name,i)=>({label:name,dot:CREW_COLORS[i%CREW_COLORS.length],selected:name===cur,action:()=>{defaultCrew[posId]=name;closeDD();_savePlanToLS(activePlanId);renderTable();}}))];
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

function requestAll(e){
  if(!IS_MANAGER)return;
  e.stopPropagation();
  if(!confirm('Alle leeren Slots mit Standard-Crew füllen?\nDas überschreibt deinen Plan und kann nicht rückgängig gemacht werden.'))return;
  TOUR_DATES.forEach(day=>{
    POSITIONS.forEach(pos=>{
      const def=defaultCrew[pos.id];
      if(!def)return;
      if(day.date in assignments&&pos.id in(assignments[day.date]||{}))return;
      if(!assignments[day.date])assignments[day.date]={};
      assignments[day.date][pos.id]=def;
    });
  });
  _savePlanToLS(activePlanId);
  renderTable();
  showToast('Alle Standard-Zuweisungen übernommen ✓','#4ae8a0');
}

function requestForPos(e,posId){
  if(!IS_MANAGER)return;
  e.stopPropagation();
  const def=defaultCrew[posId];
  if(!def)return;
  TOUR_DATES.forEach(day=>{
    if(day.date in assignments&&posId in(assignments[day.date]||{}))return;
    if(!assignments[day.date])assignments[day.date]={};
    assignments[day.date][posId]=def;
  });
  _savePlanToLS(activePlanId);
  renderTable();
  const pos=POSITIONS.find(p=>p.id===posId);
  showToast(`${pos?.label}: Standard übernommen ✓`,'#4ae8a0');
}


// === positions.js ===
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


// === modals.js ===
// ── Modal Utilities ────────────────────────────────────────────────────────────
function openModal(id){document.getElementById(id).classList.add('open');}
function closeModal(id){document.getElementById(id).classList.remove('open');}

document.addEventListener('click',e=>{
  ['sharedModal','pdfModal','logoModal'].forEach(id=>{const el=document.getElementById(id);if(el.classList.contains('open')&&e.target===el)closeModal(id);});
});

// ── Shared Modal (Rename / Add Position) ──────────────────────────────────────
function openSharedModal(title,currentVal,onConfirm){
  document.getElementById('sharedTitle').textContent=title;
  document.getElementById('sharedBody').innerHTML=`
    <div class="mf"><label class="ml">Bezeichnung</label><input type="text" id="sharedInput" class="mi" value="${currentVal}"></div>
    <div class="mactions"><button class="mbtn" onclick="closeModal('sharedModal')">Abbrechen</button><button class="mbtn primary" onclick="window._confirmShared()">Speichern</button></div>`;
  window._confirmShared=()=>{const v=document.getElementById('sharedInput')?.value.trim();if(!v)return;closeModal('sharedModal');onConfirm(v);};
  openModal('sharedModal');setTimeout(()=>document.getElementById('sharedInput')?.focus(),50);
}


// === dates.js ===
// ── Add Date Wizard ────────────────────────────────────────────────────────────
function openAddDate(){if(!IS_MANAGER)return;
  const typeOpts=TYPE_OPTS.map(o=>`<option value="${o.label}">${o.label}</option>`).join('');
  document.getElementById('sharedTitle').textContent='Datum hinzufügen';
  document.getElementById('sharedBody').innerHTML=`
    <div class="mf" style="display:flex;gap:8px;margin-bottom:14px;">
      <button id="adModeDay" class="mbtn primary" onclick="adSetMode('day')" style="flex:1;">Einzelner Tag</button>
      <button id="adModeRange" class="mbtn" onclick="adSetMode('range')" style="flex:1;">Datumsbereich</button>
    </div>
    <div id="adSingleFields">
      <div class="mf"><label class="ml">Datum</label><input type="date" id="adDate" class="mi"></div>
    </div>
    <div id="adRangeFields" style="display:none;">
      <div class="mf"><label class="ml">Von</label><input type="date" id="adDateFrom" class="mi"></div>
      <div class="mf"><label class="ml">Bis</label><input type="date" id="adDateTo" class="mi"></div>
    </div>
    <div class="mf">
      <label class="ml">Art / Kategorie</label>
      <select id="adTypeSelect" class="ms">${typeOpts}</select>
    </div>
    <div class="mf"><label class="ml">Ort / Venue</label><input type="text" id="adLoc" class="mi" placeholder="z.B. Berlin – Arena"></div>
    <div class="mactions">
      <button class="mbtn" onclick="closeModal('sharedModal')">Abbrechen</button>
      <button class="mbtn primary" onclick="confirmAddDate()">Hinzufügen</button>
    </div>`;
  openModal('sharedModal');
  setTimeout(()=>document.getElementById('adDate')?.focus(),50);
}

function adSetMode(mode){
  document.getElementById('adSingleFields').style.display=mode==='day'?'':'none';
  document.getElementById('adRangeFields').style.display=mode==='range'?'':'none';
  document.getElementById('adModeDay').className='mbtn'+(mode==='day'?' primary':'');
  document.getElementById('adModeRange').className='mbtn'+(mode==='range'?' primary':'');
}

async function confirmAddDate(){if(!IS_MANAGER)return;
  const isSingle=document.getElementById('adSingleFields').style.display!=='none';
  const typeLabel=document.getElementById('adTypeSelect')?.value||'';
  const lv=(document.getElementById('adLoc')?.value||'').trim();
  if(!typeLabel){await showAlert('Bitte Art/Kategorie wählen.');return;}
  if(!lv){await showAlert('Bitte Ort eingeben.');return;}
  const type=typeFromLabel(typeLabel);
  if(isSingle){
    const dv=document.getElementById('adDate')?.value;
    if(!dv){await showAlert('Bitte Datum wählen.');return;}
    sortInsert({date:dv,type,typeLabel,loc:lv});
  } else {
    const from=document.getElementById('adDateFrom')?.value;
    const to=document.getElementById('adDateTo')?.value;
    if(!from||!to){await showAlert('Bitte Von/Bis Datum wählen.');return;}
    if(from>to){await showAlert('Von-Datum muss vor Bis-Datum liegen.');return;}
    const cur=new Date(...from.split('-').map((v,i)=>i===1?+v-1:+v));
    const end=new Date(...to.split('-').map((v,i)=>i===1?+v-1:+v));
    while(cur<=end){
      const ds=cur.toISOString().slice(0,10);
      if(!TOUR_DATES.find(r=>r.date===ds))sortInsert({date:ds,type,typeLabel,loc:lv});
      cur.setDate(cur.getDate()+1);
    }
  }
  if(typeof _queueGlobalCrewUpdate==='function')_queueGlobalCrewUpdate('Neue Tage hinzugefügt');
  closeModal('sharedModal');_savePlanToLS(activePlanId);renderTable();
}


// === logos.js ===
// ── Logo System ────────────────────────────────────────────────────────────────
function saveLogosGlobal(){try{localStorage.setItem(LOGOS_KEY,JSON.stringify({booking:logos.booking,band:logos.band,planer:logos.planer}));}catch(e){}}
function loadLogosGlobal(){try{const r=localStorage.getItem(LOGOS_KEY);if(r){const l=JSON.parse(r);logos.booking=l.booking||'';logos.band=l.band||'';logos.planer=l.planer||'';applyAllLogos();}}catch(e){}}

function openLogosModal(){
  updateLogoPreviews();
  openModal('logoModal');
}

function handleLogoUpload(type,input){
  const file=input.files[0];if(!file)return;
  const r=new FileReader();
  r.onload=e=>{logos[type]=e.target.result;applyLogoToHeader(type);updateLogoPreviews();saveLogosGlobal();showToast(`${type}-Logo gesetzt ✓`,'#2d6a3f');};
  r.readAsDataURL(file);input.value='';
}

function removeLogo(type){
  logos[type]='';applyLogoToHeader(type);updateLogoPreviews();saveLogosGlobal();showToast(`${type}-Logo entfernt`,'#d4b84a');
}

function updateLogoPreviews(){
  ['band','booking','planer'].forEach(type=>{
    const prev=document.getElementById('prev'+type.charAt(0).toUpperCase()+type.slice(1));
    const rm=document.getElementById('rm'+type.charAt(0).toUpperCase()+type.slice(1));
    if(logos[type]){prev.src=logos[type];prev.style.display='block';rm.style.display='block';}
    else{prev.src='';prev.style.display='none';rm.style.display='none';}
  });
}

function applyLogoToHeader(type){
  if(type==='planer'){
    const area=document.getElementById('areaPlaner');
    area.innerHTML='';
    if(logos.planer){const img=document.createElement('img');img.src=logos.planer;img.className='logo-planer';img.title='Planer-Logo';area.appendChild(img);}
  } else if(type==='booking'){
    const area=document.getElementById('areaBooking');
    area.innerHTML='';
    if(logos.booking){const img=document.createElement('img');img.src=logos.booking;img.className='logo-booking';img.title='Booking-Logo';area.appendChild(img);}
  } else if(type==='band'){
    const area=document.getElementById('areaBand');
    const existing=area.querySelector('.logo-band');
    if(existing)existing.remove();
    if(logos.band){const img=document.createElement('img');img.src=logos.band;img.className='logo-band';img.title='Band-Logo';area.insertBefore(img,area.firstChild);}
  }
}

function applyAllLogos(){['planer','booking','band'].forEach(t=>applyLogoToHeader(t));}

function loadLogo(type,input){handleLogoUpload(type,input);}
function applyLogo(type){applyLogoToHeader(type);}


// === calendar.js ===
// ── ICS Calendar Export ─────────────────────────────────────────────────────
function openCalendarExport(){openModal('calModal');}

function generateICS(){
  const inclTypes={
    show:document.getElementById('calShow').checked,
    reise:document.getElementById('calReise').checked,
    prep:document.getElementById('calPrep').checked,
    off:document.getElementById('calOff').checked,
  };
  const rows=TOUR_DATES.filter(r=>inclTypes[r.type]);
  if(!rows.length){showToast('Keine Tage ausgewählt','#e84a4a');return;}

  const lines=[
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Tour Crew Plan//v2.0//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  rows.forEach(row=>{
    const dtStart=row.date.replace(/-/g,'');
    const [y,m,d]=row.date.split('-').map(Number);
    const nx=new Date(y,m-1,d+1);
    const dtEnd=`${nx.getFullYear()}${String(nx.getMonth()+1).padStart(2,'0')}${String(nx.getDate()).padStart(2,'0')}`;
    const summary=`${row.typeLabel} – ${row.loc}`;
    let desc=`Art: ${row.typeLabel}\\nOrt: ${row.loc}`;
    const crewList=POSITIONS.map(p=>{const v=getVal(row.date,p.id);return v?`${p.short}: ${v}`:null;}).filter(Boolean);
    if(crewList.length)desc+='\\n'+crewList.join('\\n');
    const uid=`${row.date}-${Math.random().toString(36).slice(2)}@tourcrewplan`;
    lines.push(
      'BEGIN:VEVENT',
      `DTSTART;VALUE=DATE:${dtStart}`,
      `DTEND;VALUE=DATE:${dtEnd}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${desc}`,
      `UID:${uid}`,
      'END:VEVENT'
    );
  });

  lines.push('END:VCALENDAR');
  const content=lines.join('\r\n');
  const blob=new Blob([content],{type:'text/calendar;charset=utf-8'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='tourplan.ics';
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
  showToast(`${rows.length} Termine exportiert ✓`,'#2d6a3f');
}


