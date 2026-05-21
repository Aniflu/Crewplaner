// ── Table Rendering ────────────────────────────────────────────────────────────
// View state
let CURRENT_VIEW = 'table'; // 'table' | 'blocks' | 'crew'
const VIEW_KEY = 'tourplan_view';

function setView(v){
  if(!['table','blocks','crew'].includes(v))v='table';
  CURRENT_VIEW=v;
  try{localStorage.setItem(VIEW_KEY,v);}catch(e){}
  document.querySelectorAll('.vt-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===v));
  document.getElementById('viewTable').style.display = v==='table'?'':'none';
  document.getElementById('viewBlocks').style.display= v==='blocks'?'':'none';
  document.getElementById('viewCrew').style.display  = v==='crew' ?'':'none';
  renderTable();
}

function renderTable(){
  // Always update stats
  if(CURRENT_VIEW==='table'){renderHead();renderBody();}
  else if(CURRENT_VIEW==='blocks'){if(typeof renderBlockView==='function')renderBlockView();}
  else if(CURRENT_VIEW==='crew'){if(typeof renderCrewView==='function')renderCrewView();}
  updateStats();
  updateViewMeta();
}

function updateViewMeta(){
  const el=document.getElementById('viewMeta');if(!el)return;
  const shows=TOUR_DATES.filter(r=>r.type==='show').length;
  const total=TOUR_DATES.length;
  const blocks=new Set(TOUR_DATES.filter(r=>r.blockId).map(r=>r.blockId)).size;
  el.innerHTML=`<strong>${total}</strong> Tage · <strong>${shows}</strong> Shows · <strong>${blocks}</strong> Blöcke`;
}

function renderHead(){
  let h='<tr>';
  h+=`<th rowspan="2" style="left:0;text-align:left;vertical-align:middle;z-index:12;">Datum${SUPABASE_ENABLED?`<br><button onclick="requestAll(event)" style="margin-top:4px;background:rgba(74,232,160,.1);border:1px solid rgba(74,232,160,.3);color:#4ae8a0;padding:2px 6px;font-family:'IBM Plex Mono',monospace;font-size:.55rem;border-radius:3px;cursor:pointer;white-space:nowrap;">↗ Alle</button>`:''}  </th>`;
  h+='<th rowspan="2" style="left:88px;text-align:left;vertical-align:middle;z-index:12;">Art</th>';
  h+='<th rowspan="2" style="left:213px;text-align:left;vertical-align:middle;z-index:12;">Ort / Venue</th>';
  POSITIONS.forEach((p,i)=>{
    h+=`<th class="pos-h" style="cursor:pointer;" onclick="openPosMenu(event,${i})">${p.short} <span style="font-size:.5rem;opacity:.4;">▼</span></th>`;
  });
  h+=`<th class="pos-h" style="cursor:pointer;color:var(--muted);min-width:44px;" onclick="openAddPos()" rowspan="2" title="Position hinzufügen">+</th>`;
  h+='</tr><tr>';
  POSITIONS.forEach(p=>{
    const def=defaultCrew[p.id]||'';
    const ci=crew.indexOf(def);
    const dot=def&&ci>=0?CREW_COLORS[ci%CREW_COLORS.length]:'transparent';
    const hasOpen=Object.values(assignmentStatuses).some(day=>isPending(day[p.id]));
    const hasAny=SUPABASE_ENABLED&&TOUR_DATES.some(day=>{
      if(day.type==='off')return false;
      const si=assignmentStatuses[day.date]?.[p.id];
      if(si?.status==='confirmed'||si?.status==='proposed')return false;
      return !!getVal(day.date,p.id);
    });
    h+=`<th style="background:#12141a;border:1px solid var(--border);border-top:none;padding:3px;">
      <button onclick="openDefaultDD(event,'${p.id}')" style="width:100%;background:${def?'rgba(79,129,189,.14)':'transparent'};border:1px dashed ${def?'#4f81bd':'#2e3a45'};color:${def?'#a0c0e0':'#2e3a50'};padding:3px 5px;font-family:'IBM Plex Mono',monospace;font-size:.6rem;border-radius:3px;cursor:pointer;display:flex;align-items:center;gap:4px;justify-content:center;">
        ${def?`<div style="width:5px;height:5px;border-radius:50%;background:${dot};flex-shrink:0;"></div><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:85px;">${def}</span>`:'<span style="opacity:.4;font-size:.58rem;">● Standard…</span>'}
      </button>
      ${hasAny?`<button onclick="requestForPos(event,'${p.id}')" style="margin-top:3px;width:100%;background:rgba(74,232,160,.1);border:1px solid rgba(74,232,160,.3);color:#4ae8a0;padding:2px 5px;font-family:'IBM Plex Mono',monospace;font-size:.58rem;border-radius:3px;cursor:pointer;">↗ Anfragen</button>`:''}
      ${hasOpen?`<button onclick="bulkCancelPos(event,'${p.id}')" style="margin-top:3px;width:100%;background:rgba(232,74,74,.1);border:1px solid rgba(232,74,74,.3);color:#e84a4a;padding:2px 5px;font-family:'IBM Plex Mono',monospace;font-size:.58rem;border-radius:3px;cursor:pointer;">↩ Zurückziehen</button>`:''}
      </th>`;
  });
  h+='</tr>';
  document.getElementById('tHead').innerHTML=h;
}

function renderBody(){
  let b='',lastBlockId=null;
  TOUR_DATES.forEach(row=>{
    if(row.blockId&&row.blockId!==lastBlockId){lastBlockId=row.blockId;b+=`<tr class="month-sep"><td colspan="${3+POSITIONS.length+1}">${row.blockName||''}</td></tr>`;}
    const tOpt=TYPE_OPTS.find(t=>t.label===row.typeLabel);
    const tColor=tOpt?.color||'';
    const rowBg=tColor?colorToDarkBg(tColor):'';
    b+=`<tr class="row-${row.type}" style="${rowBg?'--row-bg:'+rowBg+';':''}" data-date="${row.date}">`;
    {const _dp=parseD(row.date);const _wd=DE_DAYS[_dp.getDay()];const _dt=`${String(_dp.getDate()).padStart(2,'0')}.${String(_dp.getMonth()+1).padStart(2,'0')}`;
    b+=`<td class="date-cell" onclick="openDateDD(event,'${row.date}')" style="cursor:pointer;" title="Klick für Optionen"><span class="wd">${_wd}</span><span class="dt">${_dt}</span></td>`;}
    b+=`<td class="type-cell"><button class="type-btn" style="${tColor?'color:'+tColor+';':''}" onclick="openTypeDD(event,'${row.date}')">${row.typeLabel}</button></td>`;
    b+=`<td class="loc-cell"><button class="loc-btn" onclick="startLocEdit(event,'${row.date}')" title="${row.loc}">${row.loc}</button></td>`;
    POSITIONS.forEach(p=>{
      const isOv=row.date in assignments&&p.id in(assignments[row.date]||{});
      const val=getVal(row.date,p.id);
      const isDef=!isOv&&!!val;
      let style='',cls='assign-btn',display='—';
      if(val===OFFEN){style='color:#e07060;border-color:rgba(220,80,60,.4);background:rgba(220,80,60,.07);font-weight:600;';display='⚠ Offen';}
      else if(isDef){style='color:#6a8aaa;font-style:italic;border-color:rgba(79,129,189,.12);background:rgba(79,129,189,.04);';display=val;}
      else if(isOv&&val){const ch=val!==(defaultCrew[p.id]||'');if(ch&&defaultCrew[p.id])style='font-weight:600;border-color:rgba(212,184,74,.4);background:rgba(212,184,74,.09);color:#d4c87a;';else cls+=' filled';display=val;}
      else if(isOv&&!val){style='color:#5a3a3a;border-color:rgba(200,100,100,.18);font-style:italic;';display='–';}
      // Status-Overlay aus Supabase
      const si=SUPABASE_ENABLED?(assignmentStatuses[row.date]?.[p.id]||null):null;
      if(si&&si.status!=='assigned'){
        const sn=si.crewName||val||'';
        if(si.status==='proposed'){display=`⏳ ${sn}`;style='color:#e8c84a;border-color:rgba(232,200,74,.35);background:rgba(232,200,74,.07);';}
        else if(si.status==='confirmed'){display=`✓ ${sn}`;style='color:#4ae8a0;border-color:rgba(74,232,160,.35);background:rgba(74,232,160,.07);';}
        else if(si.status==='declined'){display=`✗ ${sn}`;style='color:#e84a4a;border-color:rgba(232,74,74,.35);background:rgba(232,74,74,.07);';}
      }
      const myName=SUPABASE_ENABLED?(typeof getMyCrewName==='function'?getMyCrewName():null):null;
      const isMyProposed=!IS_MANAGER&&si&&si.status==='proposed'&&si.crewName===myName;
      const isOpenSlot=SUPABASE_ENABLED&&IS_CREW&&(!val||val===''||val===OFFEN)&&!si;
      b+=`<td class="assign-cell">`;
      if(isMyProposed){
        b+=`<div class="my-slot-wrap"><span class="my-slot-name">${si.crewName}</span><button class="slot-confirm" onclick="confirmMySlot('${row.date}','${p.id}')">✓</button><button class="slot-decline" onclick="declineMySlot('${row.date}','${p.id}')">✗</button></div>`;
      }else if(isOpenSlot){
        b+=`<button class="assign-btn slot-melden" onclick="meinesMelden('${row.date}','${p.id}')">Melden</button>`;
      }else if(IS_MANAGER||!SUPABASE_ENABLED){
        b+=`<button class="${cls}" style="${style}" onclick="openCrewDD(event,'${row.date}','${p.id}')">${display}</button>`;
      }else if(IS_BOOKER){
        b+=`<span class="${cls}" style="${style};cursor:default;">${display}</span>`;
      }else{
        b+=`<button class="${cls}" style="${style}" disabled>${display}</button>`;
      }
      b+=`</td>`;
    });
    b+=`<td style="border:1px solid #1e2023;min-width:44px;"></td></tr>`;
  });
  document.getElementById('tBody').innerHTML=b;
}

// ── Inline Loc Edit ────────────────────────────────────────────────────────────
function startLocEdit(e,dateStr){
  e.stopPropagation();
  const td=e.currentTarget.parentElement;
  const row=TOUR_DATES.find(r=>r.date===dateStr);
  const inp=document.createElement('input');inp.className='loc-input';inp.value=row.loc;
  const save=()=>{if(inp.value.trim())row.loc=inp.value.trim();renderTable();};
  inp.onblur=save;inp.onkeydown=ev=>{if(ev.key==='Enter')inp.blur();if(ev.key==='Escape')renderTable();ev.stopPropagation();};
  td.innerHTML='';td.appendChild(inp);inp.focus();inp.select();
}

// ── Sticky Column Fix ──────────────────────────────────────────────────────────
function fixStickyColumns(){
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
