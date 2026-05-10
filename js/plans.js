// ── Multi-Plan System ──────────────────────────────────────────────────────────
const PLANS_INDEX_KEY = 'tourplan_plans';
const PLAN_PREFIX = 'tourplan_plan_';
const LOGOS_KEY = 'tourplan_logos'; // Logos sind GLOBAL
let activePlanId = null;

function getPlansIndex(){
  try{const r=localStorage.getItem(PLANS_INDEX_KEY);return r?JSON.parse(r):[];}catch(e){return[];}
}
function savePlansIndex(list){
  try{localStorage.setItem(PLANS_INDEX_KEY,JSON.stringify(list));}catch(e){}
}
function genPlanId(){return 'p'+Date.now().toString(36);}

function renderPlanList(){
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

function switchPlan(id){
  if(id===activePlanId)return;
  _savePlanToLS(activePlanId);
  activePlanId=id;
  _loadPlanFromLS(id);
  renderPlanList();
  showToast('Plan geladen ✓','#4f81bd');
}

async function deletePlan(id){
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

function renamePlan(id){
  const plans=getPlansIndex();const plan=plans.find(p=>p.id===id);if(!plan)return;
  document.getElementById('sharedTitle').textContent='Plan umbenennen';
  document.getElementById('sharedBody').innerHTML=`
    <div class="mf"><label class="ml">Name</label><input type="text" id="renamePlanInput" class="mi" value="${plan.name}"></div>
    <div class="mactions"><button class="mbtn" onclick="closeModal('sharedModal')">Abbrechen</button><button class="mbtn primary" onclick="confirmRenamePlan('${id}')">Speichern</button></div>`;
  openModal('sharedModal');setTimeout(()=>{const i=document.getElementById('renamePlanInput');if(i){i.focus();i.select();}},50);
}

function confirmRenamePlan(id){
  const name=(document.getElementById('renamePlanInput')?.value||'').trim();if(!name)return;
  const plans=getPlansIndex();const plan=plans.find(p=>p.id===id);
  if(plan){plan.name=name;savePlansIndex(plans);}
  closeModal('sharedModal');renderPlanList();showToast('Umbenannt ✓','#2d6a3f');
}

function openNewPlan(){
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

async function confirmNewPlan(){
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
  _savePlanToLS(id);
  renderPlanList();
  showToast(`Plan „${name}" erstellt ✓`,'#2d6a3f');
}

function _today(){return new Date().toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'2-digit'});}

function _resetToEmpty(){
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
  renderCrew();renderTable();
}

function _savePlanToLS(id){
  if(!id)return;
  try{
    const data={version:3,crew,positions:POSITIONS,defaultCrew,tourDates:TOUR_DATES,assignments};
    localStorage.setItem(PLAN_PREFIX+id,JSON.stringify(data));
    const plans=getPlansIndex();
    const p=plans.find(x=>x.id===id);
    if(p){p.modified=_today();savePlansIndex(plans);}
  }catch(e){console.warn(e);}
}

function _loadPlanFromLS(id){
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
    renderCrew();renderTable();
    return true;
  }catch(e){return false;}
}
