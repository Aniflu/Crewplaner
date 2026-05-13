// ── Save / Load / AutoSave ─────────────────────────────────────────────────────
function collectData(){return{version:3,crew,positions:POSITIONS,defaultCrew,tourDates:TOUR_DATES,assignments};} // Logos sind global in LOGOS_KEY

function applyData(data){
  if(!data.tourDates)throw new Error('Ungültiges Format');
  crew.length=0;data.crew.forEach(c=>crew.push(c));
  if(data.positions){POSITIONS.length=0;data.positions.forEach(p=>POSITIONS.push(p));}
  Object.keys(defaultCrew).forEach(k=>delete defaultCrew[k]);if(data.defaultCrew)Object.assign(defaultCrew,data.defaultCrew);
  if(data.logos){logos.booking=data.logos.booking||'';logos.band=data.logos.band||'';logos.planer=data.logos.planer||'';applyAllLogos();saveLogosGlobal();} // Legacy JSON mit Logos
  TOUR_DATES.length=0;data.tourDates.forEach(d=>TOUR_DATES.push(d));
  Object.keys(assignments).forEach(k=>delete assignments[k]);
  Object.assign(assignments,data.assignments||{});
  renderCrew();renderTable();
}

let autoSaveTimer=null;
function autoSave(){
  clearTimeout(autoSaveTimer);
  autoSaveTimer=setTimeout(()=>{
    _savePlanToLS(activePlanId);
    renderPlanList();
    showToast('Auto-gespeichert ✓','#2d6a3f');
  },30000);
}

async function saveJSON(){
  const json=JSON.stringify(collectData(),null,2);
  const plans=getPlansIndex();
  const planName=plans.find(p=>p.id===activePlanId)?.name||'tourplan';
  const safeName=planName.replace(/[^a-zA-Z0-9äöüÄÖÜß\-_ ]/g,'_');
  if(window.showSaveFilePicker){try{const h=await window.showSaveFilePicker({suggestedName:`${safeName}.json`,types:[{description:'JSON',accept:{'application/json':['.json']}}]});const w=await h.createWritable();await w.write(json);await w.close();showToast('Gespeichert ✓','#2d6a3f');return;}catch(e){if(e.name==='AbortError')return;}}
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([json],{type:'application/json'}));a.download=`${safeName}.json`;a.click();showToast('Gespeichert ✓','#2d6a3f');
}

function loadJSON(){document.getElementById('fileInput').click();}

function onFileLoad(e){
  const file=e.target.files[0];if(!file)return;
  const r=new FileReader();
  r.onload=ev=>{
    try{
      const data=JSON.parse(ev.target.result);
      if(!data.tourDates)throw new Error('Ungültiges Format');
      const name=file.name.replace(/\.json$/i,'')||'Importierter Plan';
      _savePlanToLS(activePlanId);
      const id=genPlanId();
      activePlanId=id;
      applyData(data);
      const plans=getPlansIndex();
      plans.push({id,name,created:_today(),modified:_today()});
      savePlansIndex(plans);
      _savePlanToLS(id);
      renderPlanList();
      showToast(`„${name}" importiert ✓`,'#4caf72');
    }catch(err){showAlert('Fehler: '+err.message);}
  };
  r.readAsText(file);e.target.value='';
}
