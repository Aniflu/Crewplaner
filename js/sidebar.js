// ── Crew & Positionen Modal ─────────────────────────────────────────────────────
import { SUPABASE_ENABLED } from './config.js';
import { IS_MANAGER, IS_CREW } from './state.js';
import { renderTable } from './render.js';
import { openModal } from './modals.js';
import { renderCrew } from './crew.js';

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

// ── Mobiler Sidebar-Drawer (Off-Canvas) ─────────────────────────────────────────
// Getrennt von toggleSidebar (Desktop): toggelt nur die .open-Klasse auf Sidebar +
// Backdrop (Muster wie .modal-bg.open) — greift NICHT in die Grid-/Inline-Styles ein.
export function toggleDrawer(){
  const sb=document.getElementById('sidebar');
  const bd=document.getElementById('drawerBackdrop');
  if(!sb) return;
  const open=sb.classList.toggle('open');
  if(bd) bd.classList.toggle('open',open);
}
