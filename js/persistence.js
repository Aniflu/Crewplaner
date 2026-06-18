// ── Save / Load / AutoSave ─────────────────────────────────────────────────────
import { TOUR_DATES, POSITIONS, crew, assignments, defaultCrew, logos,
         setTourDates, setPositions, setCrew, setDefaultCrew, setLogos, loadAssignmentsData } from './state.js';
import { showToast } from './utils.js';
import { _savePlanToLS, getActivePlanId, setActivePlanId, renderPlanList, getPlansIndex, savePlansIndex, genPlanId, _today } from './plans.js';
import { renderCrew } from './crew.js';
import { renderTable } from './render.js';
import { applyAllLogos, saveLogosGlobal } from './logos.js';

export function collectData(){return{version:3,crew,positions:POSITIONS,defaultCrew,tourDates:TOUR_DATES,assignments};} // Logos sind global in LOGOS_KEY

export function applyData(data){
  if(!data.tourDates)throw new Error('Ungültiges Format');
  setCrew(data.crew || []);
  if(data.positions){setPositions(data.positions);}
  setDefaultCrew(data.defaultCrew || {});
  if(data.logos){setLogos(data.logos);applyAllLogos();saveLogosGlobal();} // Legacy JSON mit Logos
  setTourDates(data.tourDates);
  loadAssignmentsData(data.assignments || {});
  renderCrew();renderTable();
}

let autoSaveTimer=null;
export function autoSave(){
  clearTimeout(autoSaveTimer);
  autoSaveTimer=setTimeout(()=>{
    _savePlanToLS(getActivePlanId());
    renderPlanList();
    showToast('Auto-gespeichert ✓','#2d6a3f');
  },30000);
}

// Plan bewusst speichern: localStorage + PocketBase-Sync (über _savePlanToLS).
// Der „Speichern"-Button rief früher nur saveJSON() (= JSON-Datei-Download) auf und
// schrieb NICHTS nach PocketBase — daher lief PB aus dem Takt. (v0.14.7)
export async function savePlan(){
  const id=getActivePlanId();
  if(!id){showToast('Kein aktiver Plan zum Speichern','#e84a4a');return;}
  showToast('Speichere…','#e8c84a');
  try{
    await _savePlanToLS(id); // localStorage (synchron) + PB-Patch (awaited)
    showToast('Gespeichert ✓ (lokal + PocketBase)','#2d6a3f');
  }catch(e){
    // Ehrlich: lokal ist gespeichert, aber der PocketBase-Sync ist fehlgeschlagen.
    const msg=(e&&e.message)||'unbekannt';
    showToast('Lokal gespeichert — PocketBase-Sync FEHLGESCHLAGEN: '+msg+' (evtl. neu einloggen)','#e84a4a');
    console.error('[savePlan] PB-Sync fehlgeschlagen:',e);
  }
}

export async function saveJSON(){
  const json=JSON.stringify(collectData(),null,2);
  const plans=getPlansIndex();
  const planName=plans.find(p=>p.id===getActivePlanId())?.name||'tourplan';
  const safeName=planName.replace(/[^a-zA-Z0-9äöüÄÖÜß\-_ ]/g,'_');
  if(window.showSaveFilePicker){try{const h=await window.showSaveFilePicker({suggestedName:`${safeName}.json`,types:[{description:'JSON',accept:{'application/json':['.json']}}]});const w=await h.createWritable();await w.write(json);await w.close();showToast('Gespeichert ✓','#2d6a3f');return;}catch(e){if(e.name==='AbortError')return;}}
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([json],{type:'application/json'}));a.download=`${safeName}.json`;a.click();showToast('Gespeichert ✓','#2d6a3f');
}

export function loadJSON(){document.getElementById('fileInput').click();}

export function onFileLoad(e){
  const file=e.target.files[0];if(!file)return;
  const r=new FileReader();
  r.onload=ev=>{
    try{
      const data=JSON.parse(ev.target.result);
      if(!data.tourDates)throw new Error('Ungültiges Format');
      const name=file.name.replace(/\.json$/i,'')||'Importierter Plan';
      _savePlanToLS(getActivePlanId());
      const id=genPlanId();
      setActivePlanId(id);
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
