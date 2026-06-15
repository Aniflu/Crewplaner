// ── Multi-Plan System ──────────────────────────────────────────────────────────
import { TOUR_DATES, POSITIONS, crew, assignments, defaultCrew, logos,
         IS_MANAGER, CURRENT_USER_ID } from './state.js';
import { SUPABASE_ENABLED } from './config.js';
import { showToast, sortInsert } from './utils.js';
import { pbGet, pbPost, pbPatch, pbDelete, pbList } from './pb.js';
import { hasPermission } from './rbac.js';
import { renderTable, hasTableView } from './render.js';
import { renderCrew } from './crew.js';

const PLANS_INDEX_KEY = 'tourplan_plans';
export const PLAN_PREFIX = 'tourplan_plan_';
const LOGOS_KEY = 'tourplan_logos'; // Logos sind GLOBAL
export let activePlanId = null;

export function getActivePlanId() { return activePlanId; }
export function setActivePlanId(id) { activePlanId = id; }

export function getPlansIndex(){
  try{const r=localStorage.getItem(PLANS_INDEX_KEY);return r?JSON.parse(r):[];}catch(e){return[];}
}
export function savePlansIndex(list){
  try{localStorage.setItem(PLANS_INDEX_KEY,JSON.stringify(list));}catch(e){if(typeof showToast==='function')showToast('Speichern fehlgeschlagen (Speicher voll?)','#e84a4a');}
}
// Entfernt verwaiste tourplan_plan_* / tourplan_pb_* Keys, die nicht im Index stehen (Plan-Leichen)
export function _pruneOrphanPlans(){
  try{
    const ids=new Set(getPlansIndex().map(p=>p.id));
    Object.keys(localStorage).forEach(k=>{
      let id=null;
      if(k.startsWith(PLAN_PREFIX)) id=k.slice(PLAN_PREFIX.length);
      else if(k.startsWith('tourplan_pb_')) id=k.slice('tourplan_pb_'.length);
      if(id!==null && !ids.has(id)) localStorage.removeItem(k);
    });
  }catch(e){console.warn('[plans] _pruneOrphanPlans:',e);}
}
export function genPlanId(){return 'p'+Date.now().toString(36);}

export function renderPlanList(){
  const plans=getPlansIndex();
  const el=document.getElementById('planList');
  if(!el)return;
  if(!plans.length){el.innerHTML='<div style="font-size:.65rem;color:var(--muted);padding:4px 0;">Noch kein Plan gespeichert.</div>';return;}
  el.innerHTML=plans.map(p=>`
    <div class="plan-item${p.id===activePlanId?' active':''}">
      <span class="plan-item-name" onclick="switchPlan('${p.id}')" style="cursor:pointer;">${p.name}</span>
      <button class="sm" onclick="renamePlan('${p.id}')" title="Umbenennen" style="padding:1px 5px;flex-shrink:0;">✏</button>
      ${plans.length>1?`<button class="sm danger" onclick="deletePlan('${p.id}')" title="Löschen" style="padding:1px 5px;flex-shrink:0;">✕</button>`:''}
    </div>`).join('');
  // Aktiver Plan-Name im Header
  const nameEl=document.getElementById('activePlanName');
  if(nameEl){const active=plans.find(p=>p.id===activePlanId);nameEl.textContent=active?active.name:'';}
}

export function switchPlan(id){
  if(id===activePlanId)return;
  _savePlanToLS(activePlanId);
  activePlanId=id;
  // Globalen PB-Zeiger auf den Ziel-Plan setzen (oder löschen, wenn keiner) —
  // hält tourplan_active_pb_id konsistent mit dem aktiven Plan.
  const pb=localStorage.getItem('tourplan_pb_'+id);
  if(pb)localStorage.setItem('tourplan_active_pb_id',pb);
  else localStorage.removeItem('tourplan_active_pb_id');
  _loadPlanFromLS(id);
  renderPlanList();
  showToast('Plan geladen ✓','#4f81bd');
}

export async function deletePlan(id){
  if(!hasPermission('deletePlan'))return;
  const plans=getPlansIndex();
  const plan=plans.find(p=>p.id===id);
  if(!plan)return;
  const ok=await showConfirm(`Plan „${plan.name}" wirklich löschen?`,'Löschen');
  if(!ok)return;
  localStorage.removeItem(PLAN_PREFIX+id);
  const newList=plans.filter(p=>p.id!==id);
  savePlansIndex(newList);
  if(id===activePlanId){
    if(newList.length>0){activePlanId=newList[0].id;_loadPlanFromLS(activePlanId);}
    else{activePlanId=null;_resetToEmpty();}
  }
  renderPlanList();
  showToast('Plan gelöscht','#d4b84a');
}

export function renamePlan(id){
  const plans=getPlansIndex();const plan=plans.find(p=>p.id===id);if(!plan)return;
  document.getElementById('sharedTitle').textContent='Plan umbenennen';
  document.getElementById('sharedBody').innerHTML=`
    <div class="mf"><label class="ml">Name</label><input type="text" id="renamePlanInput" class="mi" value="${plan.name}"></div>
    <div class="mactions"><button class="mbtn" onclick="closeModal('sharedModal')">Abbrechen</button><button class="mbtn primary" onclick="confirmRenamePlan('${id}')">Speichern</button></div>`;
  openModal('sharedModal');setTimeout(()=>{const i=document.getElementById('renamePlanInput');if(i){i.focus();i.select();}},50);
}

export async function confirmRenamePlan(id){
  const name=(document.getElementById('renamePlanInput')?.value||'').trim();if(!name)return;
  const plans=getPlansIndex();const plan=plans.find(p=>p.id===id);
  if(plan){plan.name=name;savePlansIndex(plans);}
  closeModal('sharedModal');renderPlanList();
  if(typeof SUPABASE_ENABLED!=='undefined'&&SUPABASE_ENABLED){
    const pbId=localStorage.getItem('tourplan_pb_'+id);
    if(pbId){
      try{await pbPatch('/api/collections/plans/records/'+pbId,{name});}
      catch(e){showToast('Lokal gespeichert – PB-Sync fehlgeschlagen','#e8c84a');return;}
    }
  }
  showToast('Umbenannt ✓','#2d6a3f');
}

export function openNewPlan(){
  if(!hasPermission('createPlan'))return;
  document.getElementById('sharedTitle').textContent='Neuer Plan';
  document.getElementById('sharedBody').innerHTML=`
    <div class="mf"><label class="ml">Plan-Name</label><input type="text" id="newPlanName" class="mi" placeholder="z.B. Tour 2027 – Deutschland"></div>
    <div class="mactions">
      <button class="mbtn" onclick="closeModal('sharedModal')">Abbrechen</button>
      <button class="mbtn primary" onclick="confirmNewPlan()">Erstellen</button>
    </div>`;
  openModal('sharedModal');
  setTimeout(()=>document.getElementById('newPlanName')?.focus(),50);
}

export async function confirmNewPlan(){
  const name=(document.getElementById('newPlanName')?.value||'').trim();
  if(!name){await showAlert('Bitte Namen eingeben.');return;}
  closeModal('sharedModal');
  _savePlanToLS(activePlanId);
  const id=genPlanId();
  activePlanId=id;
  _resetToEmpty();
  const plans=getPlansIndex();
  plans.push({id,name,created:_today(),modified:_today()});
  savePlansIndex(plans);
  // Stale PB-Mapping des vorherigen Plans lösen, sonst überschreibt _savePlanToLS
  // den alten Plan-Record mit den leeren Daten des neuen Plans.
  localStorage.removeItem('tourplan_active_pb_id');
  // Neuen Plan direkt in PocketBase anlegen → erscheint sofort in admin.html.
  if(SUPABASE_ENABLED && CURRENT_USER_ID){
    try{
      const rec=await pbPost('/api/collections/plans/records',{name,owner:CURRENT_USER_ID});
      if(rec?.id){
        localStorage.setItem('tourplan_pb_'+id,rec.id);
        localStorage.setItem('tourplan_active_pb_id',rec.id);
      }
    }catch(e){
      // Sichtbar machen — ohne eigenen Record taucht der Plan nicht in der Admin-
      // Konsole auf; früher wurde der Fehler still verschluckt.
      console.warn('[plans] PB-Plan anlegen fehlgeschlagen:',e.message);
      showToast('Plan lokal erstellt, aber NICHT in PocketBase gespeichert — bitte erneut versuchen','#e84a4a');
    }
  }
  _savePlanToLS(id); // schreibt localStorage + (mit pbId) plan_data nach PocketBase
  renderPlanList();
  showToast(`Plan „${name}" erstellt ✓`,'#2d6a3f');
}

export function _today(){return new Date().toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'2-digit'});}

export function _resetToEmpty(){
  crew.length=0;
  POSITIONS.length=0;
  [{id:'gl',label:'GL',short:'GL'},{id:'sys',label:'System',short:'System'},
   {id:'lt1',label:'Licht 1',short:'Licht 1'},{id:'lt2',label:'Licht 2',short:'Licht 2'},
   {id:'lt3',label:'Licht 3',short:'Licht 3'},{id:'fm',label:'Follow Me',short:'Follow Me'}
  ].forEach(p=>POSITIONS.push(p));
  Object.keys(defaultCrew).forEach(k=>delete defaultCrew[k]);
  // Logos NICHT zurücksetzen — global
  TOUR_DATES.length=0;
  Object.keys(assignments).forEach(k=>delete assignments[k]);
  if(hasTableView()){renderCrew();renderTable();}
}

export function _savePlanToLS(id){
  if(!id)return;
  try{
    const data={version:3,crew,positions:POSITIONS,defaultCrew,tourDates:TOUR_DATES,assignments};
    localStorage.setItem(PLAN_PREFIX+id,JSON.stringify(data));
    const plans=getPlansIndex();
    const p=plans.find(x=>x.id===id);
    if(p){p.modified=_today();savePlansIndex(plans);}
    // Sync plan_data to PocketBase — STRIKT in den EIGENEN Record dieses Plans.
    // NIE auf tourplan_active_pb_id zurückfallen: das ist ein globaler Zeiger und
    // hat in v0.14.6 dazu geführt, dass ein Plan den Record eines ANDEREN Plans
    // überschrieb (Cross-Write → Datenverlust). Ohne eigene Zuordnung: neuen Record
    // anlegen, statt einen fremden zu patchen.
    // Gibt die PB-Sync-Promise zurück, damit bewusstes Speichern (savePlan) sie
    // awaiten und echten Erfolg/Fehler anzeigen kann. Auto-Save ignoriert den Rückgabewert.
    let pbPromise=Promise.resolve();
    if(typeof SUPABASE_ENABLED!=='undefined'&&SUPABASE_ENABLED){
      const pbId=localStorage.getItem('tourplan_pb_'+id);
      if(pbId){
        pbPromise=pbPatch('/api/collections/plans/records/'+pbId,{plan_data:JSON.stringify(data)});
      } else if(CURRENT_USER_ID){
        const planName=(p&&p.name)||'Plan';
        pbPromise=(async()=>{
          const rec=await pbPost('/api/collections/plans/records',{name:planName,owner:CURRENT_USER_ID,plan_data:JSON.stringify(data)});
          if(rec&&rec.id){
            localStorage.setItem('tourplan_pb_'+id,rec.id);
            localStorage.setItem('tourplan_active_pb_id',rec.id);
          }
        })();
      } else {
        console.warn('[plans] PB-Sync: kein pbId und kein User für',id);
      }
    }
    // verhindert "unhandled rejection" für Fire-and-forget-Aufrufer (Auto-Save)
    pbPromise.catch(e=>console.warn('[plans] PB-Sync fehlgeschlagen:',e));
    return pbPromise;
  }catch(e){if(typeof showToast==='function')showToast('Speichern fehlgeschlagen (Speicher voll?)','#e84a4a');return Promise.reject(e);}
}

export function _loadPlanFromLS(id){
  if(!id)return false;
  try{
    const raw=localStorage.getItem(PLAN_PREFIX+id);
    if(!raw)return false;
    const data=JSON.parse(raw);
    if(!data.tourDates)return false;
    crew.length=0;data.crew.forEach(cv=>crew.push(cv));
    if(data.positions){POSITIONS.length=0;data.positions.forEach(p=>POSITIONS.push(p));}
    Object.keys(defaultCrew).forEach(k=>delete defaultCrew[k]);if(data.defaultCrew)Object.assign(defaultCrew,data.defaultCrew);
    TOUR_DATES.length=0;data.tourDates.forEach(d=>TOUR_DATES.push(d));
    Object.keys(assignments).forEach(k=>delete assignments[k]);
    Object.assign(assignments,data.assignments||{});
    // Logos NICHT überschreiben — global
    if(hasTableView()){renderCrew();renderTable();}
    return true;
  }catch(e){return false;}
}
