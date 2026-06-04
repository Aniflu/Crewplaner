// ── Init ───────────────────────────────────────────────────────────────────────
// Wird von authService.js nach Session-Check aufgerufen (oder direkt wenn Auth deaktiviert)
import { TOUR_DATES, POSITIONS, crew, assignments, IS_MANAGER, IS_CREW,
         IS_SUPERADMIN, IS_BOOKER, SUPABASE_ENABLED, activePlanId } from './state.js';
import { showToast, esc } from './utils.js';
import { loadCustomTypes, renderTypeList, TYPE_OPTS } from './types.js';
import { renderTable } from './render.js';
import { renderBlockView } from './blockview.js';
import { updateStats } from './stats.js';
import { loadLogosGlobal } from './logos.js';
import { getPlansIndex, renderPlanList, applyData, genPlanId, savePlansIndex } from './plans.js';

export function startApp(){
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
      crew:['Max Berger','Anna Weis','Felix Braun','Mia Schäfer','Lars König','Nina Vogel'],
      positions:[
        {id:'gl', label:'Gewerkeleitung', short:'GL'},
        {id:'lt', label:'Lichttechniker',  short:'LT'},
        {id:'vt', label:'Videotechniker',  short:'VT'},
        {id:'foh',label:'Tontechniker FOH',short:'FOH'},
        {id:'mon',label:'Monitortechniker',short:'MON'},
        {id:'bel',label:'Beleuchter',      short:'BEL'}
      ],
      defaultCrew:{gl:'Max Berger',lt:'Anna Weis',foh:'Lars König'},
      tourDates:[
        // Vorbereitung
        {date:'2027-04-01',type:'prep', typeLabel:'Vorbereitung',loc:'Lager / Depot'},
        {date:'2027-04-02',type:'prep', typeLabel:'Aufbau',      loc:'Hamburg · Barclays Arena'},
        {date:'2027-04-03',type:'prep', typeLabel:'Probe',       loc:'Hamburg · Barclays Arena'},
        {date:'2027-04-04',type:'prep', typeLabel:'Probe',       loc:'Hamburg · Barclays Arena'},
        // Block 1
        {date:'2027-04-05',type:'show', typeLabel:'Show',        loc:'Hamburg · Barclays Arena',   blockId:'b1',blockName:'Block 1 — Hamburg'},
        {date:'2027-04-06',type:'reise',typeLabel:'Nightliner',  loc:'Hamburg → Köln',             blockId:'b1',blockName:'Block 1 — Hamburg'},
        {date:'2027-04-07',type:'prep', typeLabel:'Aufbau',      loc:'Köln · LANXESS Arena',       blockId:'b2',blockName:'Block 2 — Köln'},
        {date:'2027-04-08',type:'show', typeLabel:'Show',        loc:'Köln · LANXESS Arena',       blockId:'b2',blockName:'Block 2 — Köln'},
        {date:'2027-04-09',type:'reise',typeLabel:'Nightliner',  loc:'Köln → Berlin',              blockId:'b2',blockName:'Block 2 — Köln'},
        // Block 2
        {date:'2027-04-10',type:'prep', typeLabel:'Aufbau',      loc:'Berlin · Mercedes-Benz Arena',blockId:'b3',blockName:'Block 3 — Berlin'},
        {date:'2027-04-11',type:'show', typeLabel:'Show',        loc:'Berlin · Mercedes-Benz Arena',blockId:'b3',blockName:'Block 3 — Berlin'},
        {date:'2027-04-12',type:'show', typeLabel:'Show',        loc:'Berlin · Mercedes-Benz Arena',blockId:'b3',blockName:'Block 3 — Berlin'},
        {date:'2027-04-13',type:'off',  typeLabel:'Ruhetag',     loc:'Berlin 🏨',                  blockId:'b3',blockName:'Block 3 — Berlin'},
        {date:'2027-04-14',type:'reise',typeLabel:'Nightliner',  loc:'Berlin → München',           blockId:'b3',blockName:'Block 3 — Berlin'},
        // Block 3
        {date:'2027-04-15',type:'prep', typeLabel:'Aufbau',      loc:'München · Olympiahalle',     blockId:'b4',blockName:'Block 4 — München'},
        {date:'2027-04-16',type:'show', typeLabel:'Show',        loc:'München · Olympiahalle',     blockId:'b4',blockName:'Block 4 — München'},
        {date:'2027-04-17',type:'show', typeLabel:'Show',        loc:'München · Olympiahalle',     blockId:'b4',blockName:'Block 4 — München'},
        {date:'2027-04-18',type:'off',  typeLabel:'Abbau / Abreise',loc:'München',                 blockId:'b4',blockName:'Block 4 — München'}
      ],
      assignments:{
        // Vorbereitung — volle Besetzung
        '2027-04-01':{gl:'Max Berger',lt:'Anna Weis',vt:'Mia Schäfer',foh:'Lars König',mon:'Nina Vogel',bel:'Felix Braun'},
        '2027-04-02':{gl:'Max Berger',lt:'Anna Weis',vt:'Mia Schäfer',foh:'Lars König',mon:'Nina Vogel',bel:'Felix Braun'},
        '2027-04-03':{gl:'Max Berger',lt:'Anna Weis',vt:'Mia Schäfer',foh:'Lars König',mon:'Nina Vogel',bel:'Felix Braun'},
        '2027-04-04':{gl:'Max Berger',lt:'Anna Weis',vt:'Mia Schäfer',foh:'Lars König',mon:'Nina Vogel',bel:'Felix Braun'},
        // Block 1
        '2027-04-05':{gl:'Max Berger',lt:'Anna Weis',vt:'Mia Schäfer',foh:'Lars König',mon:'Nina Vogel',bel:'Felix Braun'},
        '2027-04-06':{gl:'Max Berger',foh:'Lars König'},
        '2027-04-07':{gl:'Max Berger',lt:'Anna Weis',vt:'Mia Schäfer',foh:'Lars König',mon:'Nina Vogel',bel:'Felix Braun'},
        '2027-04-08':{gl:'Max Berger',lt:'Anna Weis',vt:'Mia Schäfer',foh:'Lars König',mon:'Nina Vogel',bel:'Felix Braun'},
        '2027-04-09':{gl:'Max Berger',foh:'Lars König'},
        // Block 2
        '2027-04-10':{gl:'Max Berger',lt:'Anna Weis',vt:'Mia Schäfer',foh:'Lars König',mon:'Nina Vogel',bel:'Felix Braun'},
        '2027-04-11':{gl:'Max Berger',lt:'Anna Weis',vt:'Mia Schäfer',foh:'Lars König',mon:'Nina Vogel',bel:'Felix Braun'},
        '2027-04-12':{gl:'Max Berger',lt:'Anna Weis',vt:'Mia Schäfer',foh:'Lars König',mon:'Nina Vogel',bel:'Felix Braun'},
        '2027-04-13':{gl:'Max Berger',foh:'Lars König'},
        '2027-04-14':{gl:'Max Berger',foh:'Lars König'},
        // Block 3
        '2027-04-15':{gl:'Max Berger',lt:'Anna Weis',vt:'Mia Schäfer',foh:'Lars König',mon:'Nina Vogel',bel:'Felix Braun'},
        '2027-04-16':{gl:'Max Berger',lt:'Anna Weis',vt:'Mia Schäfer',foh:'Lars König',mon:'Nina Vogel',bel:'Felix Braun'},
        '2027-04-17':{gl:'Max Berger',lt:'Anna Weis',vt:'Mia Schäfer',foh:'Lars König',mon:'Nina Vogel',bel:'Felix Braun'},
        '2027-04-18':{gl:'Max Berger',foh:'Lars König'}
      }
    };
    const demoId=genPlanId();
    activePlanId=demoId;
    localStorage.setItem(PLAN_PREFIX+demoId,JSON.stringify(_demoPlan));
    savePlansIndex([{id:demoId,name:'🎸 Demo Tour — Europa 2027',created:_today(),modified:_today()}]);
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

export function _checkPendingAction(){
  const pa=localStorage.getItem('tourplan_pending_action');
  if(!pa)return;
  localStorage.removeItem('tourplan_pending_action');
  setTimeout(()=>{
    if(pa==='openTourBlock'&&typeof openTourBlock==='function')openTourBlock();
    else if(pa==='openBlockRange'&&typeof openBlockRange==='function')openBlockRange();
    else if(pa==='openAddDate'&&typeof openAddDate==='function')openAddDate();
    else if(pa==='openCrewModal'&&typeof openCrewModal==='function')openCrewModal();
  },400);
}
