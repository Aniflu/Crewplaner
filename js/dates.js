// ── Add Date Wizard ────────────────────────────────────────────────────────────
function openAddDate(){if(!IS_MANAGER)return;
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

function adSetMode(mode){
  document.getElementById('adSingleFields').style.display=mode==='day'?'':'none';
  document.getElementById('adRangeFields').style.display=mode==='range'?'':'none';
  document.getElementById('adModeDay').className='mbtn'+(mode==='day'?' primary':'');
  document.getElementById('adModeRange').className='mbtn'+(mode==='range'?' primary':'');
}

async function confirmAddDate(){if(!IS_MANAGER)return;
  const isSingle=document.getElementById('adSingleFields').style.display!=='none';
  const typeLabel=document.getElementById('adTypeSelect')?.value||'';
  const lv=(document.getElementById('adLoc')?.value||'').trim();
  if(!typeLabel){await showAlert('Bitte Art/Kategorie wählen.');return;}
  if(!lv){await showAlert('Bitte Ort eingeben.');return;}
  const type=typeFromLabel(typeLabel);
  if(isSingle){
    const dv=document.getElementById('adDate')?.value;
    if(!dv){await showAlert('Bitte Datum wählen.');return;}
    sortInsert({date:dv,type,typeLabel,loc:lv});
  } else {
    const from=document.getElementById('adDateFrom')?.value;
    const to=document.getElementById('adDateTo')?.value;
    if(!from||!to){await showAlert('Bitte Von/Bis Datum wählen.');return;}
    if(from>to){await showAlert('Von-Datum muss vor Bis-Datum liegen.');return;}
    const cur=new Date(...from.split('-').map((v,i)=>i===1?+v-1:+v));
    const end=new Date(...to.split('-').map((v,i)=>i===1?+v-1:+v));
    while(cur<=end){
      const ds=cur.toISOString().slice(0,10);
      if(!TOUR_DATES.find(r=>r.date===ds))sortInsert({date:ds,type,typeLabel,loc:lv});
      cur.setDate(cur.getDate()+1);
    }
  }
  if(typeof _queueGlobalCrewUpdate==='function')_queueGlobalCrewUpdate('Neue Tage hinzugefügt');
  closeModal('sharedModal');_savePlanToLS(activePlanId);renderTable();
}
