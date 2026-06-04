// ── Crew & Positionen Modal ─────────────────────────────────────────────────────
import { IS_MANAGER, IS_CREW, SUPABASE_ENABLED } from './state.js';
import { renderTable } from './render.js';

export function openCrewModal(){
  renderCrew();
  openModal('crewModal');
}

// ── Sidebar Toggle ─────────────────────────────────────────────────────────────
export function toggleSidebar(){
  const sb=document.getElementById('sidebar'),layout=document.getElementById('mainLayout'),btn=document.getElementById('btnSidebar');
  const vis=sb.style.display!=='none';
  sb.style.display=vis?'none':'';
  layout.style.gridTemplateColumns=vis?'1fr':'240px 1fr';
  btn.textContent=vis?'▶ Sidebar einblenden':'◀ Sidebar ausblenden';
  // Floating button to reopen sidebar
  let fab=document.getElementById('fabSidebar');
  if(!fab){
    fab=document.createElement('button');
    fab.id='fabSidebar';
    fab.innerHTML='&#9654; Crew';
    fab.title='Sidebar einblenden';
    fab.style.cssText='position:fixed;left:0;top:50%;transform:translateY(-50%);z-index:200;padding:10px 7px;font-size:.65rem;font-family:IBM Plex Mono,monospace;font-weight:600;writing-mode:vertical-rl;text-orientation:mixed;border-radius:0 6px 6px 0;background:#1a1f2e;border:1px solid #4f81bd;border-left:none;color:#4f81bd;cursor:pointer;display:none;';
    fab.onmouseenter=function(){this.style.background='#4f81bd';this.style.color='#fff';};
    fab.onmouseleave=function(){this.style.background='#1a1f2e';this.style.color='#4f81bd';};
    fab.onclick=toggleSidebar;
    document.body.appendChild(fab);
  }
  fab.style.display=vis?'flex':'none';
}
