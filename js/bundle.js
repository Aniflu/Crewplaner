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

function addCrew(){if(!IS_MANAGER)return;const inp=document.getElementById('newCrewName');const n=inp.value.trim();if(!n)return;if(crew.includes(n)){showToast('Name bereits vorhanden','#e84a4a');return;}crew.push(n);inp.value='';_savePlanToLS(activePlanId);renderCrew();}

function removeCrew(i){if(!IS_MANAGER)return;const name=crew[i];crew.splice(i,1);Object.keys(assignments).forEach(d=>{Object.keys(assignments[d]||{}).forEach(p=>{if(assignments[d][p]===name)delete assignments[d][p];});});_savePlanToLS(activePlanId);renderCrew();renderTable();}


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
  const addedDates=[];
  if(isSingle){
    const dv=document.getElementById('adDate')?.value;
    if(!dv){await showAlert('Bitte Datum wählen.');return;}
    if(!TOUR_DATES.find(r=>r.date===dv)){sortInsert({date:dv,type,typeLabel,loc:lv});addedDates.push(dv);}
  } else {
    const from=document.getElementById('adDateFrom')?.value;
    const to=document.getElementById('adDateTo')?.value;
    if(!from||!to){await showAlert('Bitte Von/Bis Datum wählen.');return;}
    if(from>to){await showAlert('Von-Datum muss vor Bis-Datum liegen.');return;}
    const cur=new Date(...from.split('-').map((v,i)=>i===1?+v-1:+v));
    const end=new Date(...to.split('-').map((v,i)=>i===1?+v-1:+v));
    while(cur<=end){
      const ds=cur.toISOString().slice(0,10);
      if(!TOUR_DATES.find(r=>r.date===ds)){sortInsert({date:ds,type,typeLabel,loc:lv});addedDates.push(ds);}
      cur.setDate(cur.getDate()+1);
    }
  }
  if(typeof _queueGlobalCrewUpdate==='function')_queueGlobalCrewUpdate('Neue Tage hinzugefügt');
  closeModal('sharedModal');
  if(addedDates.length>0)_askBlockAssign(addedDates);
  else{_savePlanToLS(activePlanId);renderTable();}
}

function _askBlockAssign(addedDates){
  const blockMap=new Map();
  TOUR_DATES.forEach(d=>{if(d.blockId)blockMap.set(d.blockId,d.blockName);});
  const blockOpts=`<option value="">— Kein Block —</option><option value="__new__">+ Neuer Block …</option>`+
    [...blockMap.entries()].map(([id,name])=>`<option value="${id}">${esc(name)}</option>`).join('');
  document.getElementById('sharedTitle').textContent='Tourblock zuweisen?';
  document.getElementById('sharedBody').innerHTML=`
    <div style="font-size:.72rem;color:var(--muted);margin-bottom:12px;">${addedDates.length} Tag(e) hinzugefügt. Tourblock zuweisen?</div>
    <div class="mf">
      <label class="ml">Tourblock</label>
      <select id="adBlockSel" class="mi" onchange="document.getElementById('adNewBlockRow').style.display=this.value==='__new__'?'':'none'">${blockOpts}</select>
    </div>
    <div id="adNewBlockRow" style="display:none;">
      <div class="mf"><label class="ml">Blockname</label><input type="text" id="adBlockName" class="mi" placeholder="z.B. Block 1 — Berlin"></div>
    </div>
    <div class="mactions">
      <button class="mbtn" onclick="window._skipBA()">Kein Block</button>
      <button class="mbtn primary" onclick="window._confirmBA2()">Zuweisen</button>
    </div>`;
  window._skipBA=()=>{closeModal('sharedModal');_savePlanToLS(activePlanId);renderTable();};
  window._confirmBA2=()=>{
    const sel=document.getElementById('adBlockSel').value;
    if(!sel){window._skipBA();return;}
    const name=sel==='__new__'?(document.getElementById('adBlockName').value.trim()||'Tourblock'):blockMap.get(sel)||'';
    const blockId=sel!=='__new__'?sel:(Date.now().toString(36)+Math.random().toString(36).slice(2));
    TOUR_DATES.forEach(d=>{if(addedDates.includes(d.date)){d.blockId=blockId;d.blockName=name;}});
    closeModal('sharedModal');_savePlanToLS(activePlanId);renderTable();
    showToast(`${addedDates.length} Tag(e) → ${name} ✓`,'#4ae8a0');
  };
  openModal('sharedModal');
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
    if(logos.planer){const img=document.createElement('img');img.src=logos.planer;img.className='logo-planer';img.title='Planer-Logo';img.alt='Planer-Logo';area.appendChild(img);}
  } else if(type==='booking'){
    const area=document.getElementById('areaBooking');
    area.innerHTML='';
    if(logos.booking){const img=document.createElement('img');img.src=logos.booking;img.className='logo-booking';img.title='Booking-Logo';img.alt='Booking-Logo';area.appendChild(img);}
  } else if(type==='band'){
    const area=document.getElementById('areaBand');
    const existing=area.querySelector('.logo-band');
    if(existing)existing.remove();
    if(logos.band){const img=document.createElement('img');img.src=logos.band;img.className='logo-band';img.title='Band-Logo';img.alt='Band-Logo';area.insertBefore(img,area.firstChild);}
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


