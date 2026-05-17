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
  }catch(e){console.warn('View-Restore fehlgeschlagen:',e);}
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
    }catch(e){console.warn('Legacy-Migration fehlgeschlagen:',e);showToast('Plan-Migration fehlgeschlagen','#e84a4a');}
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

  // Erster Login für Manager/Superadmin → Demo-Plan laden
  if(plans.length===0&&(IS_MANAGER||IS_SUPERADMIN)){
    const _demoPlan={version:3,
      crew:['Marco Bauer','Lisa Hoffmann','Tim Schulz','Jana Keller','David Neumann','Sophie Braun'],
      positions:[
        {id:'gl',label:'GL',short:'GL'},{id:'sys',label:'System',short:'SYS'},
        {id:'lt1',label:'Licht 1',short:'LT1'},{id:'lt2',label:'Licht 2',short:'LT2'},
        {id:'foh',label:'FOH Sound',short:'FOH'},{id:'mon',label:'Monitor',short:'MON'}
      ],
      defaultCrew:{gl:'Marco Bauer',sys:'Lisa Hoffmann',foh:'Tim Schulz'},
      tourDates:[
        {date:'2026-07-14',type:'reise', typeLabel:'Reise',      loc:'Berlin → Hamburg'},
        {date:'2026-07-15',type:'prep',  typeLabel:'Aufbau',     loc:'Hamburg · Barclays Arena'},
        {date:'2026-07-16',type:'show',  typeLabel:'Show',       loc:'Hamburg · Barclays Arena'},
        {date:'2026-07-17',type:'reise', typeLabel:'Nightliner', loc:'Hamburg → Köln'},
        {date:'2026-07-18',type:'prep',  typeLabel:'Aufbau',     loc:'Köln · LANXESS Arena'},
        {date:'2026-07-19',type:'show',  typeLabel:'Show',       loc:'Köln · LANXESS Arena'},
        {date:'2026-07-20',type:'off',   typeLabel:'OFF',        loc:'Köln'},
        {date:'2026-07-21',type:'reise', typeLabel:'Nightliner', loc:'Köln → München'},
        {date:'2026-07-22',type:'prep',  typeLabel:'Aufbau',     loc:'München · Olympiahalle'},
        {date:'2026-07-23',type:'show',  typeLabel:'Show',       loc:'München · Olympiahalle'}
      ],
      assignments:{
        '2026-07-14':{gl:'Marco Bauer',sys:'Lisa Hoffmann',lt1:'Jana Keller',foh:'Tim Schulz'},
        '2026-07-15':{gl:'Marco Bauer',sys:'Lisa Hoffmann',lt1:'Jana Keller',lt2:'David Neumann',foh:'Tim Schulz',mon:'Sophie Braun'},
        '2026-07-16':{gl:'Marco Bauer',sys:'Lisa Hoffmann',lt1:'Jana Keller',lt2:'David Neumann',foh:'Tim Schulz',mon:'Sophie Braun'},
        '2026-07-17':{gl:'Marco Bauer',sys:'Lisa Hoffmann',foh:'Tim Schulz'},
        '2026-07-18':{gl:'Marco Bauer',sys:'Lisa Hoffmann',lt1:'Jana Keller',lt2:'David Neumann',foh:'Tim Schulz',mon:'Sophie Braun'},
        '2026-07-19':{gl:'Marco Bauer',sys:'Lisa Hoffmann',lt1:'Jana Keller',lt2:'David Neumann',foh:'Tim Schulz',mon:'Sophie Braun'},
        '2026-07-21':{gl:'Marco Bauer',sys:'Lisa Hoffmann',foh:'Tim Schulz'},
        '2026-07-22':{gl:'Marco Bauer',sys:'Lisa Hoffmann',lt1:'Jana Keller',lt2:'David Neumann',foh:'Tim Schulz',mon:'Sophie Braun'},
        '2026-07-23':{gl:'Marco Bauer',sys:'Lisa Hoffmann',lt1:'Jana Keller',lt2:'David Neumann',foh:'Tim Schulz',mon:'Sophie Braun'}
      }
    };
    const demoId=genPlanId();
    activePlanId=demoId;
    localStorage.setItem(PLAN_PREFIX+demoId,JSON.stringify(_demoPlan));
    savePlansIndex([{id:demoId,name:'🎸 Demo Tour — Europa 2026',created:_today(),modified:_today()}]);
    applyData(_demoPlan);
    renderPlanList();
    showToast('Willkommen! Demo-Plan geladen ✓','#e8c84a');
    return;
  }

  // Kein Plan vorhanden → leeren Standard-Plan erstellen
  const id=genPlanId();
  activePlanId=id;
  const name='Tour 2026';
  savePlansIndex([{id,name,created:_today(),modified:_today()}]);
  _savePlanToLS(id);
  renderCrew();renderTable();
  renderPlanList();
}

if (!window.__authGuarded) startApp();
