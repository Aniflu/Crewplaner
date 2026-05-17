// ── Init ───────────────────────────────────────────────────────────────────────
// Wird von authService.js nach Session-Check aufgerufen (oder direkt wenn Auth deaktiviert)
function startApp(){
  loadCustomTypes();
  renderTypeList();
  loadLogosGlobal();
  // View aus localStorage wiederherstellen
  try{
    const savedView=localStorage.getItem(VIEW_KEY);
    if(savedView&&['table','blocks','crew'].includes(savedView)){CURRENT_VIEW=savedView;}
    document.querySelectorAll('.vt-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===CURRENT_VIEW));
    document.getElementById('viewTable').style.display = CURRENT_VIEW==='table'?'':'none';
    document.getElementById('viewBlocks').style.display= CURRENT_VIEW==='blocks'?'':'none';
    document.getElementById('viewCrew').style.display  = CURRENT_VIEW==='crew' ?'':'none';
  }catch(e){}
  const plans=getPlansIndex();

  // Migration: alter tourplan_v3 Key → ersten Plan erstellen
  const legacyKey='tourplan_v3';
  const legacy=localStorage.getItem(legacyKey);
  if(legacy&&plans.length===0){
    try{
      const data=JSON.parse(legacy);
      if(data.tourDates){
        const id=genPlanId();
        const name='Tour 2026';
        localStorage.setItem(PLAN_PREFIX+id,legacy);
        savePlansIndex([{id,name,created:_today(),modified:_today()}]);
        activePlanId=id;
        applyData(data);
        renderPlanList();
        showToast('Alter Plan migriert ✓','#4f81bd');
        return;
      }
    }catch(e){}
  }

  // Von admin.html: Plan direkt aktivieren
  const pendingPlan=localStorage.getItem('tourplan_active_plan');
  localStorage.removeItem('tourplan_active_plan');

  if(plans.length>0){
    const startId=(pendingPlan&&plans.find(p=>p.id===pendingPlan))?pendingPlan:plans[0].id;
    activePlanId=startId;
    if(_loadPlanFromLS(activePlanId)){
      renderPlanList();
      showToast('Plan geladen ✓','#4f81bd');
      return;
    }
  }

  // Kein Plan vorhanden → Standard-Plan erstellen
  const id=genPlanId();
  activePlanId=id;
  const name='Tour 2026';
  savePlansIndex([{id,name,created:_today(),modified:_today()}]);
  _savePlanToLS(id);
  renderCrew();renderTable();
  renderPlanList();
}

if (!window.__authGuarded) startApp();
