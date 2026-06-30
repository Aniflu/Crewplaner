// Lädt den echten App-Modulgraphen headless (Stubs via _setup.mjs) — geteilt von allen Tests.
import './_setup.mjs';

let _cache; // undefined = noch nicht geladen, null = Load fehlgeschlagen
export async function loadGraph(){
  if(_cache !== undefined) return _cache;
  try{
    const m = {};
    m.state     = await import('../js/state.js');
    m.utils     = await import('../js/utils.js');
    m.types     = await import('../js/types.js');
    m.crew      = await import('../js/crew.js');
    m.crewNotify= await import('../js/crewNotify.js');
    m.userView  = await import('../js/userView.js');
    m.plans     = await import('../js/plans.js');
    m.dataService = await import('../js/dataService.js');
    m.stats     = await import('../js/stats.js');
    _cache = m;
  }catch(e){
    console.log('      (Graph-Load fehlgeschlagen: ' + e.message + ')');
    _cache = null;
  }
  return _cache;
}

// State zwischen Tests sauber zurücksetzen (Module sind Singletons!)
export function resetState(g){
  const s = g.state;
  s.TOUR_DATES.length = 0;
  s.POSITIONS.length = 0;
  s.crew.length = 0;
  for(const o of [s.assignments, s.assignmentStatuses, s.defaultCrew, s.crewMeta])
    Object.keys(o).forEach(k => delete o[k]);
  s.setAuthState(null, '', 'manager'); // Default: Manager (für gated Funktionen)
}
