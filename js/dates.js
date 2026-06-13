// ── Add Date Wizard ────────────────────────────────────────────────────────────
import { TOUR_DATES, IS_MANAGER } from './state.js';
import { sortInsert, showToast, esc } from './utils.js';
import { typeFromLabel } from './types.js';
import { _savePlanToLS, getActivePlanId } from './plans.js';
import { renderTable } from './render.js';
import { _queueGlobalCrewUpdate } from './userView.js';
import { eachDateInRange } from './pure.js';

// Global functions called: openModal, closeModal, showAlert, _askBlockAssign

export function openAddDate(){
  if(!IS_MANAGER)return;
  const typeOpts=TYPE_OPTS.map(o=>`<option value="${o.label}">${o.label}</option>`).join('');
  document.getElementById('sharedTitle').textContent='Datum hinzufügen';
  document.getElementById('sharedBody').innerHTML=`
    <div class="mf" style="display:flex;gap:8px;margin-bottom:14px;">
      <button id="adModeDay" class="mbtn primary" onclick="adSetMode('day')" style="flex:1;">Einzelner Tag</button>
      <button id="adModeRange" class="mbtn" onclick="adSetMode('range')" style="flex:1;">Datumsbereich</button>
    </div>
    <div id="adSingleFields">
      <div class="mf"><label class="ml">Datum</label><input type="date" id="adDate" class="mi"></div>
    </div>
    <div id="adRangeFields" style="display:none;">
      <div class="mf"><label class="ml">Von</label><input type="date" id="adDateFrom" class="mi"></div>
      <div class="mf"><label class="ml">Bis</label><input type="date" id="adDateTo" class="mi"></div>
    </div>
    <div class="mf">
      <label class="ml">Art / Kategorie</label>
      <select id="adTypeSelect" class="ms">${typeOpts}</select>
    </div>
    <div class="mf"><label class="ml">Ort / Venue</label><input type="text" id="adLoc" class="mi" placeholder="z.B. Berlin – Arena"></div>
    <div class="mactions">
      <button class="mbtn" onclick="closeModal('sharedModal')">Abbrechen</button>
      <button class="mbtn primary" onclick="confirmAddDate()">Hinzufügen</button>
    </div>`;
  openModal('sharedModal');
  setTimeout(()=>document.getElementById('adDate')?.focus(),50);
}

export function adSetMode(mode){
  document.getElementById('adSingleFields').style.display=mode==='day'?'':'none';
  document.getElementById('adRangeFields').style.display=mode==='range'?'':'none';
  document.getElementById('adModeDay').className='mbtn'+(mode==='day'?' primary':'');
  document.getElementById('adModeRange').className='mbtn'+(mode==='range'?' primary':'');
}

export async function confirmAddDate(){
  if(!IS_MANAGER)return;
  const isSingle=document.getElementById('adSingleFields').style.display!=='none';
  const typeLabel=document.getElementById('adTypeSelect')?.value||'';
  const lv=(document.getElementById('adLoc')?.value||'').trim();
  if(!typeLabel){await showAlert('Bitte Art/Kategorie wählen.');return;}
  if(!lv){await showAlert('Bitte Ort eingeben.');return;}
  const type=typeFromLabel(typeLabel);
  const addedDates=[];
  if(isSingle){
    const dv=document.getElementById('adDate')?.value;
    if(!dv){await showAlert('Bitte Datum wählen.');return;}
    if(!TOUR_DATES.find(r=>r.date===dv)){sortInsert({date:dv,type,typeLabel,loc:lv});addedDates.push(dv);}
  } else {
    const from=document.getElementById('adDateFrom')?.value;
    const to=document.getElementById('adDateTo')?.value;
    if(!from||!to){await showAlert('Bitte Von/Bis Datum wählen.');return;}
    if(from>to){await showAlert('Von-Datum muss vor Bis-Datum liegen.');return;}
    for(const ds of eachDateInRange(from,to)){
      if(!TOUR_DATES.find(r=>r.date===ds)){sortInsert({date:ds,type,typeLabel,loc:lv});addedDates.push(ds);}
    }
  }
  _queueGlobalCrewUpdate('Neue Tage hinzugefügt');
  closeModal('sharedModal');
  if(addedDates.length>0)_askBlockAssign(addedDates);
  else{_savePlanToLS(getActivePlanId());renderTable();}
}

export function _askBlockAssign(addedDates){
  const blockMap=new Map();
  TOUR_DATES.forEach(d=>{if(d.blockId)blockMap.set(d.blockId,d.blockName);});
  const blockOpts=`<option value="">— Kein Block —</option><option value="__new__">+ Neuer Block …</option>`+
    [...blockMap.entries()].map(([id,name])=>`<option value="${id}">${esc(name)}</option>`).join('');
  document.getElementById('sharedTitle').textContent='Tourblock zuweisen?';
  document.getElementById('sharedBody').innerHTML=`
    <div style="font-size:.72rem;color:var(--muted);margin-bottom:12px;">${addedDates.length} Tag(e) hinzugefügt. Tourblock zuweisen?</div>
    <div class="mf">
      <label class="ml">Tourblock</label>
      <select id="adBlockSel" class="mi" onchange="document.getElementById('adNewBlockRow').style.display=this.value==='__new__'?'':'none'">${blockOpts}</select>
    </div>
    <div id="adNewBlockRow" style="display:none;">
      <div class="mf"><label class="ml">Blockname</label><input type="text" id="adBlockName" class="mi" placeholder="z.B. Block 1 — Berlin"></div>
    </div>
    <div class="mactions">
      <button class="mbtn" onclick="window._skipBA()">Kein Block</button>
      <button class="mbtn primary" onclick="window._confirmBA2()">Zuweisen</button>
    </div>`;
  window._skipBA=()=>{closeModal('sharedModal');_savePlanToLS(getActivePlanId());renderTable();};
  window._confirmBA2=()=>{
    const sel=document.getElementById('adBlockSel').value;
    if(!sel){window._skipBA();return;}
    const name=sel==='__new__'?(document.getElementById('adBlockName').value.trim()||'Tourblock'):blockMap.get(sel)||'';
    const blockId=sel!=='__new__'?sel:(Date.now().toString(36)+Math.random().toString(36).slice(2));
    TOUR_DATES.forEach(d=>{if(addedDates.includes(d.date)){d.blockId=blockId;d.blockName=name;}});
    closeModal('sharedModal');_savePlanToLS(getActivePlanId());renderTable();
    showToast(`${addedDates.length} Tag(e) → ${name} ✓`,'#4ae8a0');
  };
  openModal('sharedModal');
}
