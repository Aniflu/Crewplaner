// ── Tourblock Wizard ───────────────────────────────────────────────────────────
import { TOUR_DATES, POSITIONS, assignments, assignmentStatuses,
         IS_MANAGER, IS_CREW, OFFEN, OFFDAY, REISE_TAG, AUSSCHREIBEN } from './state.js';
import { getVal, isPending, esc, fmtD, parseD, DE_DAYS, sortInsert, showToast } from './utils.js';
import { TYPE_OPTS, typeFromLabel, saveCustomType } from './types.js';
import { _savePlanToLS, getActivePlanId } from './plans.js';
import { renderTable } from './render.js';

let tbDays=[];

export function openTourBlock(){if(!IS_MANAGER)return;document.getElementById('tbStep1').style.display='';document.getElementById('tbStep2').style.display='none';['tbName','tbLoc','tbStart','tbEnd'].forEach(id=>document.getElementById(id).value='');openModal('tbModal');}

export function tbBack(){document.getElementById('tbStep1').style.display='';document.getElementById('tbStep2').style.display='none';}

export async function tbStep2(){
  const start=document.getElementById('tbStart').value,end=document.getElementById('tbEnd').value,loc=document.getElementById('tbLoc').value.trim()||'–';
  if(!start||!end){await showAlert('Bitte Start- und Enddatum wählen.');return;}if(start>end){await showAlert('Startdatum muss vor Enddatum liegen.');return;}
  const blockName=document.getElementById('tbName').value.trim()||'Tourblock';const blockId=Date.now().toString(36)+Math.random().toString(36).slice(2);
  tbDays=[];let cur=start;
  while(cur<=end){tbDays.push({date:cur,type:'show',typeLabel:'Show',loc,blockName,blockId});const[y,m,d]=cur.split('-').map(Number),nx=new Date(y,m-1,d+1);cur=`${nx.getFullYear()}-${String(nx.getMonth()+1).padStart(2,'0')}-${String(nx.getDate()).padStart(2,'0')}`;}
  document.getElementById('tbStep2Sub').textContent=`${blockName} · ${tbDays.length} Tage`;
  tbRenderDays();document.getElementById('tbStep1').style.display='none';document.getElementById('tbStep2').style.display='';
}

export function tbRenderDays(){
  const TC={show:'#1a3825',reise:'#0e1a2e',prep:'#2a1800',off:'#1a1a1a'},TB={show:'#2d6a3f',reise:'#1a3a6a',prep:'#7a3a10',off:'#3a3a3a'};
  const typeSelectOpts=TYPE_OPTS.map(o=>`<option value="${o.label}">${o.label}</option>`).join('');
  document.getElementById('tbDayList').innerHTML=tbDays.map((day,i)=>{
    const d=parseD(day.date),dl=`${DE_DAYS[d.getDay()]} ${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.`;
    const rowBg=TC[day.type]||TC.off, rowBorder=TB[day.type]||TB.off;
    const tOpt=TYPE_OPTS.find(t=>t.label===day.typeLabel);
    const tColor=tOpt?.color||'#888';
    // Build select with current value selected
    const opts=TYPE_OPTS.map(o=>`<option value="${o.label}" ${o.label===day.typeLabel?'selected':''}>${o.label}</option>`).join('');
    return `<div class="tb-day" style="background:${rowBg};border:1px solid ${rowBorder};">
      <span style="font-size:.68rem;color:#6a7a8a;">${dl}</span>
      <select onchange="tbChangeType(${i},this.value)" style="background:#0d0f14;border:1px solid ${rowBorder};color:${tColor};padding:4px 5px;font-family:'IBM Plex Mono',monospace;font-size:.68rem;border-radius:3px;outline:none;width:130px;">${opts}</select>
      <input type="text" value="${day.loc}" onchange="tbChangeLoc(${i},this.value)" style="background:#0d0f14;border:1px solid var(--border);color:var(--text);padding:4px 7px;font-family:'IBM Plex Mono',monospace;font-size:.68rem;border-radius:3px;outline:none;width:100%;" placeholder="Ort / Venue">
    </div>`;
  }).join('');
}

export function tbChangeType(i,label){
  const type=typeFromLabel(label);
  tbDays[i].type=type;tbDays[i].typeLabel=label;
  tbRenderDays();
}

export function tbChangeLoc(i,val){tbDays[i].loc=val.trim()||'–';}

export function tbSetAll(t,tl){tbDays.forEach(d=>{d.type=t;d.typeLabel=tl;});tbRenderDays();}

export function tbConfirm(){let n=0;tbDays.forEach(day=>{if(TOUR_DATES.find(r=>r.date===day.date))return;sortInsert({date:day.date,type:day.type,typeLabel:day.typeLabel,loc:day.loc,blockName:day.blockName,blockId:day.blockId});n++;});if(n>0&&typeof _queueGlobalCrewUpdate==='function')_queueGlobalCrewUpdate('Neue Tage hinzugefügt');closeModal('tbModal');renderTable();showToast(`${n} Tage eingefügt ✓`,'#2d6a3f');}

// ── Einzelnes Datum einem Block zuweisen ──────────────────────────────────────
export function openBlockAssign(dateStr){
  if(!IS_MANAGER)return;
  const row=TOUR_DATES.find(r=>r.date===dateStr);
  if(!row)return;
  const blockMap=new Map();
  TOUR_DATES.forEach(d=>{if(d.blockId)blockMap.set(d.blockId,d.blockName);});
  const blockOpts=[...blockMap.entries()].map(([id,name])=>
    `<option value="${id}"${row.blockId===id?' selected':''}>${name}</option>`).join('');
  document.getElementById('sharedTitle').textContent='Block zuweisen — '+fmtD(dateStr);
  document.getElementById('sharedBody').innerHTML=`
    <div class="mf">
      <label class="ml">Tourblock</label>
      <select id="baBlock" class="mi">
        <option value="">— Kein Block —</option>
        ${blockOpts}
      </select>
    </div>
    <div class="mactions">
      <button class="mbtn" onclick="closeModal('sharedModal')">Abbrechen</button>
      <button class="mbtn primary" onclick="window._confirmBA('${dateStr}')">Zuweisen</button>
    </div>`;
  window._confirmBA=ds=>{
    const sel=document.getElementById('baBlock');
    const blockId=sel.value;
    const blockName=blockId?blockMap.get(blockId)||'':'';
    const r=TOUR_DATES.find(d=>d.date===ds);
    if(r){r.blockId=blockId;r.blockName=blockName;}
    closeModal('sharedModal');_savePlanToLS(getActivePlanId());renderTable();
    showToast(blockName?`${fmtD(ds)} → ${blockName} ✓`:`${fmtD(ds)} aus Block entfernt`,'#4ae8a0');
  };
  openModal('sharedModal');setTimeout(()=>document.getElementById('baBlock')?.focus(),50);
}

// ── Datumsbereich → vorhandene Tage einem Block zuweisen ───────────────────────
export function openBlockRange(){
  if(!IS_MANAGER)return;
  const sorted=[...TOUR_DATES].sort((a,b)=>a.date.localeCompare(b.date));
  const fmt=d=>{const dt=parseD(d.date),wd=DE_DAYS[dt.getDay()];return `<option value="${d.date}">${wd} ${String(dt.getDate()).padStart(2,'0')}.${String(dt.getMonth()+1).padStart(2,'0')} – ${d.typeLabel||''} ${d.loc?'('+d.loc+')':''}</option>`;};
  const dateOpts=sorted.map(fmt).join('');
  const blockMap=new Map();TOUR_DATES.forEach(d=>{if(d.blockId)blockMap.set(d.blockId,d.blockName);});
  const blockOpts=`<option value="__new__">— Neuer Block —</option>`+[...blockMap.entries()].map(([id,name])=>`<option value="${id}">${name}</option>`).join('');
  document.getElementById('sharedTitle').textContent='Datumsbereich → Tourblock';
  document.getElementById('sharedBody').innerHTML=`
    <div class="mf"><label class="ml">Vorhandener Block</label><select id="brEx" class="mi" onchange="window._brPick(this.value)">${blockOpts}</select></div>
    <div class="mf"><label class="ml">Blockname</label><input type="text" id="brName" class="mi" placeholder="z.B. Block 1"></div>
    <div class="mf"><label class="ml">Von</label><select id="brStart" class="mi">${dateOpts}</select></div>
    <div class="mf"><label class="ml">Bis</label><select id="brEnd" class="mi">${dateOpts}</select></div>
    <div class="mactions"><button class="mbtn" onclick="closeModal('sharedModal')">Abbrechen</button><button class="mbtn primary" onclick="window._confirmBR()">Zuweisen</button></div>`;
  const bm=Object.fromEntries(blockMap.entries());
  window._brPick=id=>{if(id!=='__new__')document.getElementById('brName').value=bm[id]||'';};
  window._confirmBR=async()=>{
    const name=document.getElementById('brName').value.trim()||'Tourblock';
    const start=document.getElementById('brStart').value,end=document.getElementById('brEnd').value;
    const exId=document.getElementById('brEx').value;
    if(start>end){await showAlert('Startdatum muss vor Enddatum liegen.');return;}
    const blockId=exId!=='__new__'?exId:Date.now().toString(36)+Math.random().toString(36).slice(2);
    let n=0;TOUR_DATES.forEach(d=>{if(d.date>=start&&d.date<=end){d.blockName=name;d.blockId=blockId;n++;}});
    closeModal('sharedModal');_savePlanToLS(getActivePlanId());renderTable();showToast(`${n} Tage → ${name} ✓`,'#2d6a3f');
  };
  openModal('sharedModal');setTimeout(()=>document.getElementById('brName')?.focus(),50);
}
