// ── Table Rendering ────────────────────────────────────────────────────────────
import { SUPABASE_ENABLED } from './config.js';
import { TOUR_DATES, POSITIONS, assignments, assignmentStatuses, defaultCrew,
         crew, CREW_COLORS,
         IS_MANAGER, IS_CREW, IS_BOOKER,
         OFFEN, OFFDAY, REISE_TAG, AUSSCHREIBEN, CURRENT_USER_EMAIL,
         pendingCancellations } from './state.js';
import { getVal, isPending, esc, fmtDParts, parseD, DE_DAYS, colorToDarkBg, sameCrew } from './utils.js';
import { toISODate, todayMarkers } from './pure.js';
import { TYPE_OPTS } from './types.js';
import { _savePlanToLS, getActivePlanId } from './plans.js';
import { updateStats } from './stats.js';
import { autoSave } from './persistence.js';
import { renderBlockView } from './blockview.js';
import { renderCrewView } from './crewview.js';
import { getMyCrewName, _updateMeldungBar, _updateCrewUpdateBar,
         _getMeldungSent, _meldungDraft, _queueCrewUpdate } from './userView.js';

// Status-Icon etwas größer als der umgebende Zellentext (User-Wunsch v0.29.0) — nur das
// Symbol skaliert, Name/Layout bleiben unangetastet.
const _statIc=ch=>`<span style="font-size:1.4em;line-height:1;vertical-align:-2px;">${ch}</span>`;

// View state
export let CURRENT_VIEW = 'table'; // 'table' | 'blocks' | 'crew'
export const VIEW_KEY = 'tourplan_view';

export function getCurrentView() { return CURRENT_VIEW; }
export function setCurrentView(v) { CURRENT_VIEW = v; }

// true nur auf Seiten mit der Zuweisungstabelle (index.html) — nicht auf admin.html
export function hasTableView() { return !!document.getElementById('tBody'); }

export function setView(v){
  if(!['table','blocks','crew'].includes(v))v='table';
  CURRENT_VIEW=v;
  try{localStorage.setItem(VIEW_KEY,v);}catch(e){}
  document.querySelectorAll('.vt-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===v));
  document.getElementById('viewTable').style.display = v==='table'?'':'none';
  document.getElementById('viewBlocks').style.display= v==='blocks'?'':'none';
  document.getElementById('viewCrew').style.display  = v==='crew' ?'':'none';
  renderTable();
}

// Auto-Scroll zur Heute-Zeile nur EINMAL pro geladenem Plan (beim ersten Tabellen-Render),
// sonst würde die Ansicht bei jeder Zell-Änderung zurückspringen.
let _autoScrolledToday=false;

// Beim Plan-Wechsel (switchPlan / switchCrewPlan) zurücksetzen, damit der frisch geladene
// Plan ebenfalls einmalig zu „heute" scrollt (statt nur der erste Plan der Session).
export function resetTodayAutoScroll(){ _autoScrolledToday=false; }

export function renderTable(){
  // Always update stats
  if(CURRENT_VIEW==='table'){renderHead();renderBody();}
  else if(CURRENT_VIEW==='blocks'){renderBlockView();}
  else if(CURRENT_VIEW==='crew'){renderCrewView();}
  updateStats();
  _updateViewMeta();
  _updateMeldungBar();
  _updateCrewUpdateBar();
  if(CURRENT_VIEW==='table'&&!_autoScrolledToday&&typeof requestAnimationFrame==='function'){
    _autoScrolledToday=true;
    requestAnimationFrame(scrollToToday);
  }
}

// Springt zur Heute-Zeile (bzw. zum nächsten kommenden Tag, wenn heute kein Tourtag ist).
// No-op ohne Tabelle/passende Zeile (z.B. Tour vorbei, Block-/Crew-Ansicht).
export function scrollToToday(){
  const body=document.getElementById('tBody');
  if(!body)return;
  const el=body.querySelector('tr.is-today')||body.querySelector('tr.is-nextday');
  if(el&&typeof el.scrollIntoView==='function')el.scrollIntoView({block:'center',behavior:'smooth'});
}

function _updateViewMeta(){
  const el=document.getElementById('viewMeta');if(!el)return;
  const shows=TOUR_DATES.filter(r=>r.type==='show').length;
  const total=TOUR_DATES.length;
  const blocks=new Set(TOUR_DATES.filter(r=>r.blockId).map(r=>r.blockId)).size;
  el.innerHTML=`<strong>${total}</strong> Tage · <strong>${shows}</strong> Shows · <strong>${blocks}</strong> Blöcke`;
}

export function renderHead(){
  let h='<tr>';
  h+=`<th rowspan="2" style="left:0;text-align:left;vertical-align:middle;z-index:12;">Datum${IS_MANAGER?`<br><button onclick="requestAll(event)" style="margin-top:4px;background:rgba(74,232,160,.1);border:1px solid rgba(74,232,160,.3);color:#4ae8a0;padding:2px 6px;font-family:'IBM Plex Mono',monospace;font-size:.55rem;border-radius:3px;cursor:pointer;white-space:nowrap;">↓ Alle</button>`:''}</th>`;
  h+='<th rowspan="2" style="left:88px;text-align:left;vertical-align:middle;z-index:12;">Art</th>';
  h+='<th rowspan="2" style="left:213px;text-align:left;vertical-align:middle;z-index:12;">Ort / Venue</th>';
  POSITIONS.forEach((p,i)=>{
    h+=IS_MANAGER
      ?`<th class="pos-h" style="cursor:pointer;" onclick="openPosMenu(event,${i})">${esc(p.short)} <span style="font-size:.5rem;opacity:.4;">▼</span></th>`
      :`<th class="pos-h">${esc(p.short)}</th>`;
  });
  h+=IS_MANAGER?`<th class="pos-h" style="cursor:pointer;color:var(--muted);min-width:44px;" onclick="openAddPos()" rowspan="2" title="Position hinzufügen">+</th>`:'<th rowspan="2"></th>';
  h+='</tr><tr>';
  POSITIONS.forEach(p=>{
    const def=defaultCrew[p.id]||'';
    const ci=crew.indexOf(def);
    const dot=def&&ci>=0?CREW_COLORS[ci%CREW_COLORS.length]:'transparent';
    const hasOpen=!!def&&Object.values(assignmentStatuses).some(day=>{
      const si=day[p.id];
      return si&&sameCrew(si.crewName,def)&&isPending(si);
    });
    const hasAny=!!def&&TOUR_DATES.some(day=>!(day.date in assignments&&p.id in(assignments[day.date]||{})));
    if(IS_MANAGER){
      h+=`<th style="background:#12141a;border:1px solid var(--border);border-top:none;padding:3px;">
        <button onclick="openDefaultDD(event,'${p.id}')" style="width:100%;background:${def?'rgba(79,129,189,.14)':'transparent'};border:1px dashed ${def?'#4f81bd':'#2e3a45'};color:${def?'#a0c0e0':'#2e3a50'};padding:3px 5px;font-family:'IBM Plex Mono',monospace;font-size:.6rem;border-radius:3px;cursor:pointer;display:flex;align-items:center;gap:4px;justify-content:center;">
          ${def?`<div style="width:5px;height:5px;border-radius:50%;background:${dot};flex-shrink:0;"></div><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:85px;">${esc(def)}</span>`:'<span style="opacity:.4;font-size:.58rem;">● Standard…</span>'}
        </button>
        ${hasAny?`<button onclick="requestForPos(event,'${p.id}')" style="margin-top:3px;width:100%;background:rgba(74,232,160,.1);border:1px solid rgba(74,232,160,.3);color:#4ae8a0;padding:2px 5px;font-family:'IBM Plex Mono',monospace;font-size:.58rem;border-radius:3px;cursor:pointer;">↓ Übernehmen</button>`:''}
        ${hasOpen?`<button onclick="bulkCancelPos(event,'${p.id}')" style="margin-top:3px;width:100%;background:rgba(232,74,74,.1);border:1px solid rgba(232,74,74,.3);color:#e84a4a;padding:2px 5px;font-family:'IBM Plex Mono',monospace;font-size:.58rem;border-radius:3px;cursor:pointer;">↩ Zurückziehen</button>`:''}
        </th>`;
    } else {
      h+=`<th style="background:#12141a;border:1px solid var(--border);border-top:none;padding:3px;"></th>`;
    }
  });
  h+='</tr>';
  document.getElementById('tHead').innerHTML=h;
}

export function renderBody(){
  let b='',lastBlockId=null;
  const _meldungSentData=_getMeldungSent();
  const myName=SUPABASE_ENABLED?getMyCrewName():null;
  // „Heute"-Marker (v0.25.0): today = exakter Tourtag, sonst next = erster kommender Tag.
  const _todayISO=toISODate(new Date());
  const {today:_todayRow,next:_nextRow}=todayMarkers(TOUR_DATES.map(r=>r.date),_todayISO);
  TOUR_DATES.forEach(row=>{
    if(row.blockId&&row.blockId!==lastBlockId){lastBlockId=row.blockId;b+=`<tr class="month-sep"><td colspan="${3+POSITIONS.length+1}">${esc(row.blockName||'')}</td></tr>`;}
    const tOpt=TYPE_OPTS.find(t=>t.label===row.typeLabel);
    const tColor=tOpt?.color||'';
    const rowBg=tColor?colorToDarkBg(tColor):'';
    const _isToday=row.date===_todayRow;
    const _isNext=_todayRow===null&&row.date===_nextRow;
    const _isPast=row.date<_todayISO;
    const _todayCls=_isToday?' is-today':_isNext?' is-nextday':_isPast?' is-past':'';
    b+=`<tr class="row-${row.type}${_todayCls}" style="${rowBg?'--row-bg:'+rowBg+';':''}" data-date="${row.date}">`;
    {const _dp=parseD(row.date);const _wd=DE_DAYS[_dp.getDay()];const _dt=`${String(_dp.getDate()).padStart(2,'0')}.${String(_dp.getMonth()+1).padStart(2,'0')}`;
    const _badge=_isToday?`<span class="today-badge">HEUTE</span>`:'';
    b+=IS_MANAGER
      ?`<td class="date-cell" onclick="openDateDD(event,'${row.date}')" style="cursor:pointer;" title="Klick für Optionen"><span class="wd">${_wd}</span><span class="dt">${_dt}</span>${_badge}</td>`
      :`<td class="date-cell"><span class="wd">${_wd}</span><span class="dt">${_dt}</span>${_badge}</td>`;}
    b+=`<td class="type-cell">${IS_MANAGER?`<button class="type-btn" style="${tColor?'color:'+tColor+';':''}" onclick="openTypeDD(event,'${row.date}')">${esc(row.typeLabel)}</button>`:`<span class="type-btn" style="${tColor?'color:'+tColor+';':''}cursor:default;">${esc(row.typeLabel)}</span>`}</td>`;
    b+=`<td class="loc-cell">${IS_MANAGER?`<button class="loc-btn" onclick="startLocEdit(event,'${row.date}')" title="${esc(row.loc)}">${esc(row.loc)}</button>`:`<span class="loc-btn" style="cursor:default;">${esc(row.loc)}</span>`}</td>`;
    POSITIONS.forEach(p=>{
      const isOv=row.date in assignments&&p.id in(assignments[row.date]||{});
      const val=getVal(row.date,p.id);
      const isDef=!isOv&&!!val;
      // icHtml = vertrauenswürdiges, NIE zu escapendes Status-Icon-HTML (nur von uns gesetzt,
      // nie aus User-Input) — display bleibt reiner Text und wird an JEDER Ausgabestelle wie
      // bisher mit esc() behandelt (Crew-/Positionsnamen dürfen NIE ungeschützt in innerHTML,
      // siehe v0.23.3-Härtung). Getrennt halten, sonst killt esc() das Icon-<span> (v0.29.0-Bug).
      let style='',cls='assign-btn',display='—',icHtml='';
      if(val===OFFEN){style='color:#e07060;border-color:rgba(220,80,60,.4);background:rgba(220,80,60,.07);font-weight:600;';display='⚠ Offen';}
      else if(isDef){style='color:#6a8aaa;font-style:italic;border-color:rgba(79,129,189,.12);background:rgba(79,129,189,.04);';display=val;}
      else if(isOv&&val){const ch=val!==(defaultCrew[p.id]||'');if(ch&&defaultCrew[p.id])style='font-weight:600;border-color:rgba(212,184,74,.4);background:rgba(212,184,74,.09);color:#d4c87a;';else{cls+=' filled';style='border:1px solid rgba(150,185,210,.3);';}display=val;}
      else if(isOv&&!val){style='color:#5a3a3a;border-color:rgba(200,100,100,.18);font-style:italic;';display='–';}
      if(IS_BOOKER){style='';cls='assign-btn';}
      // Status-Overlay aus Supabase (hat Vorrang vor OFFDAY/REISE_TAG)
      const si=SUPABASE_ENABLED?(assignmentStatuses[row.date]?.[p.id]||null):null;
      if(si&&si.status!=='assigned'){
        const sn=si.crewName||val||'';
        if(si.status==='proposed'){icHtml=_statIc('⏳');display=sn;style='color:var(--accent);border-color:var(--accent-wash-2);background:var(--accent-wash);';}
        else if(si.status==='confirmed'){icHtml=_statIc('✓');display=sn;style='color:var(--show);border-color:var(--show-wash-2);background:var(--show-wash);';}
        else if(si.status==='pencilled'){icHtml=_statIc('✎');display=sn;style='color:var(--pencilled);border-color:var(--pencilled-wash-2);background:var(--pencilled-wash);';}
        else if(si.status==='declined'){icHtml=_statIc('✗');display=sn;style='color:var(--warn);border-color:var(--warn-wash-2);background:var(--warn-wash);';}
      } else if(val===OFFDAY){style='color:#70ad47;border-color:rgba(112,173,71,.4);background:rgba(112,173,71,.07);font-weight:600;';display='🏖 Offday';}
      else if(val===REISE_TAG){style='color:#4f81bd;border-color:rgba(79,129,189,.4);background:rgba(79,129,189,.07);font-weight:600;';display='✈ Reise';}
      else if(val===AUSSCHREIBEN){style='color:#c07830;border-color:rgba(192,120,48,.4);background:rgba(192,120,48,.07);font-weight:600;';display='📋 Ausschr.';}
      const isMyProposed=!IS_MANAGER&&si&&si.status==='proposed'&&si.crewName===myName;
      const isAusschreibenSlot=SUPABASE_ENABLED&&IS_CREW&&val===AUSSCHREIBEN&&!si;
      const isDrafted=isAusschreibenSlot&&!!_meldungDraft[row.date]?.has(p.id);
      const isSent=isAusschreibenSlot&&!!_meldungSentData[row.date]?.includes(p.id);
      b+=`<td class="assign-cell">`;
      if(isMyProposed){
        b+=`<button class="assign-btn" onclick="openSlotConfirmModal('${row.date}','${p.id}')" style="color:#e8c84a;border-color:rgba(232,200,74,.4);background:rgba(232,200,74,.07);">Bitte bestätigen</button>`;
      }else if(isDrafted){
        b+=`<button class="assign-btn slot-melden" onclick="meinesMelden('${row.date}','${p.id}')" style="color:#e8c84a;border-color:rgba(232,200,74,.4);background:rgba(232,200,74,.09);">✓ Gemerkt</button>`;
      }else if(isSent){
        b+=`<button class="assign-btn" disabled style="color:#e8c84a;opacity:.55;border-color:rgba(232,200,74,.25);background:rgba(232,200,74,.05);">📋 Gemeldet</button>`;
      }else if(isAusschreibenSlot){
        b+=`<button class="assign-btn slot-melden" onclick="meinesMelden('${row.date}','${p.id}')" style="color:#c07830;border-color:rgba(192,120,48,.4);background:rgba(192,120,48,.07);">📋 Bewerben</button>`;
      }else if(IS_CREW&&si&&si.crewName!==myName){
        if(si.status==='confirmed'){b+=`<span style="font-size:.6rem;color:var(--show);display:block;text-align:center;">${esc(si.crewName)}</span>`;}
        else if(si.status==='declined'){b+=`<span style="font-size:.6rem;color:var(--warn);display:block;text-align:center;">${esc(si.crewName)}</span>`;}
        else if(si.status==='pencilled'){b+=`<span style="font-size:.6rem;color:var(--pencilled);display:block;text-align:center;">${esc(si.crewName)}</span>`;}
        else{b+=`<span style="font-size:.6rem;color:var(--accent);display:block;text-align:center;">${esc(si.crewName)}</span>`;}
      }else if(IS_CREW&&si&&si.crewName===myName){
        const _pkey=row.date+'|'+p.id;
        const _isPending=pendingCancellations.has(_pkey);
        if(si.status==='confirmed'){
          const _ps=_isPending?'background:rgba(232,74,74,.12);border-color:rgba(232,74,74,.4);color:var(--warn);text-decoration:line-through;':'color:var(--show);border-color:var(--show-wash-2);background:var(--show-wash);';
          b+=`<button class="assign-btn" style="${_ps}" onclick="toggleCancellation('${row.date}','${p.id}')">${_isPending?'Absagen?':'✓ '+esc(si.crewName||myName)}</button>`;
        }else{
          b+=`<span class="${cls}" style="${style};cursor:default;">${icHtml?icHtml+' ':''}${esc(display)}</span>`;
        }
      }else if(IS_CREW&&!si&&val&&val!==OFFEN&&val!==OFFDAY&&val!==REISE_TAG&&val!==AUSSCHREIBEN){
        b+=`<span style="font-size:.6rem;color:#5a6070;display:block;text-align:center;">${esc(val)}</span>`;
      }else if(IS_MANAGER||!SUPABASE_ENABLED){
        b+=`<button class="${cls}" style="${style}" onclick="openCrewDD(event,'${row.date}','${p.id}')">${icHtml?icHtml+' ':''}${esc(display)}</button>`;
      }else if(IS_BOOKER){
        b+=`<span class="${cls}" style="${style};cursor:default;">${icHtml?icHtml+' ':''}${esc(display)}</span>`;
      }else if(!IS_CREW){
        b+=`<button class="${cls}" style="${style}" disabled>${icHtml?icHtml+' ':''}${esc(display)}</button>`;
      }
      b+=`</td>`;
    });
    b+=`<td style="border:1px solid #1e2023;min-width:44px;"></td></tr>`;
  });
  document.getElementById('tBody').innerHTML=b;
}

// ── Inline Loc Edit ────────────────────────────────────────────────────────────
export function startLocEdit(e,dateStr){
  e.stopPropagation();
  const td=e.currentTarget.parentElement;
  const row=TOUR_DATES.find(r=>r.date===dateStr);
  const oldLoc=row.loc;
  const inp=document.createElement('input');inp.className='loc-input';inp.value=row.loc;
  const save=()=>{
    const newLoc=inp.value.trim();
    if(!newLoc){renderTable();return;}
    row.loc=newLoc;
    _savePlanToLS(getActivePlanId());
    if(newLoc!==oldLoc)_queueCrewUpdate(dateStr,`Ort: ${oldLoc} → ${newLoc}`);
    else renderTable();
  };
  inp.onblur=save;inp.onkeydown=ev=>{if(ev.key==='Enter')inp.blur();if(ev.key==='Escape')renderTable();ev.stopPropagation();};
  td.innerHTML='';td.appendChild(inp);inp.focus();inp.select();
}

// ── Sticky Column Fix ──────────────────────────────────────────────────────────
export function fixStickyColumns(){
  const table = document.querySelector('table');
  if(!table) return;
  const firstTh = table.querySelector('thead th:first-child');
  const secTh = table.querySelector('thead th:nth-child(2)');
  if(!firstTh||!secTh) return;
  const w1 = firstTh.offsetWidth;
  const w2 = secTh.offsetWidth;
  document.querySelectorAll('thead th:nth-child(2), tbody td:nth-child(2)').forEach(el=>el.style.left=w1+'px');
  document.querySelectorAll('thead th:nth-child(3), tbody td:nth-child(3)').forEach(el=>el.style.left=(w1+w2)+'px');
}

// Wrap renderTable to trigger autoSave after each render
const _rt=renderTable;
window.renderTable=function(){_rt();autoSave();setTimeout(fixStickyColumns,0);};
