// ── Dropdown Engine ────────────────────────────────────────────────────────────
import { TOUR_DATES, POSITIONS, crew, CREW_COLORS, assignments, defaultCrew,
         assignmentStatuses, IS_MANAGER, IS_CREW,
         OFFEN, OFFDAY, REISE_TAG, AUSSCHREIBEN, crewMeta,
         setAssignment, clearAssignmentSlot } from './state.js';
import { SUPABASE_ENABLED } from './config.js';
import { getVal, isPending, isPencilled, esc, showToast, sortInsert, fmtD, sameCrew } from './utils.js';
import { TYPE_OPTS, typeFromLabel, saveCustomType } from './types.js';
import { renderTable } from './render.js';
import { pbDelete } from './pb.js';
import { cancelProposal, bulkCancelProposals, bulkProposeCrew as proposeCrew, loadAssignmentStatuses, confirmAssignment, pencilInAssignment, promotePencilledToProposed, softCancelAssignment } from './dataService.js';
import { _savePlanToLS, getActivePlanId } from './plans.js';
import { showPrompt, showConfirm } from './dialog.js';
import { hasPermission } from './rbac.js';
import { openBlockAssign } from './tourblock.js';
import { _queueCrewUpdate, _queueRemovedSlot } from './userView.js';

export function showDD(rect,header,items){
  const menu=document.getElementById('ddMenu');
  menu.innerHTML=`<div class="dd-hdr">${esc(header)}</div>`;
  items.forEach(it=>{
    const d=document.createElement('div');
    d.className='dd-item'+(it.cls?' '+it.cls:'')+(it.selected?' selected':'');
    if(it.color)d.style.color=it.color;
    // esc auf label/header: hier landen Crew-/Positionsnamen in innerHTML — konsistent mit
    // der esc-Härtung (v0.23.3), damit Namen mit <>&"' keinen HTML/XSS-Ausbruch erlauben.
    if(it.dot)d.innerHTML=`<div style="width:8px;height:8px;border-radius:50%;background:${esc(it.dot)};flex-shrink:0;"></div>${esc(it.label)}`;
    else d.textContent=it.label;
    d.onclick=it.action;menu.appendChild(d);
  });
  let left=rect.left,top=rect.bottom+4;
  if(left+210>innerWidth)left=Math.max(4,innerWidth-220);
  const menuH=Math.min(items.length*36+44, innerHeight-16);
  if(top+menuH>innerHeight){top=rect.top-menuH-4;if(top<8)top=8;}
  menu.style.left=left+'px';menu.style.top=top+'px';
  menu.style.maxHeight=menuH+'px';menu.style.overflowY='auto';
  menu.style.display='block';
  document.getElementById('ddOv').classList.add('open');
}
export function closeDD(){document.getElementById('ddOv').classList.remove('open');document.getElementById('ddMenu').style.display='none';}

// ── Type Dropdown ──────────────────────────────────────────────────────────────
export function openTypeDD(e,dateStr){
  if(!IS_MANAGER)return;
  e.stopPropagation();
  const row=TOUR_DATES.find(r=>r.date===dateStr);
  const rect=e.currentTarget.getBoundingClientRect();
  const items=TYPE_OPTS.map(o=>({
    label:o.label,selected:o.label===row.typeLabel,
    action:()=>{
      const oldLabel=row.typeLabel;
      row.type=o.type;row.typeLabel=o.label;saveCustomType(o.label,o.type);closeDD();
      _savePlanToLS(getActivePlanId());
      if(oldLabel!==o.label)_queueCrewUpdate(row.date,`Tagesart: ${oldLabel} → ${o.label}`);
      else renderTable();
    }
  }));
  items.push({label:'✏ Eigene Eingabe…',cls:'reset',action:async()=>{
    closeDD();
    const val=await showPrompt('Tagesart eingeben:',row.typeLabel);
    if(!val||!val.trim())return;
    const label=val.trim(),type=typeFromLabel(label);
    saveCustomType(label,type);
    const oldLabel=row.typeLabel;
    row.type=type;row.typeLabel=label;
    _savePlanToLS(getActivePlanId());
    if(oldLabel!==label)_queueCrewUpdate(row.date,`Tagesart: ${oldLabel} → ${label}`);
    else renderTable();
  }});
  showDD(rect,'Tagesart',items);
}

// ── Date Dropdown (löschen) ───────────────────────────────────────────────────
export function openDateDD(e,dateStr){
  if(!IS_MANAGER)return;
  e.stopPropagation();
  const row=TOUR_DATES.find(r=>r.date===dateStr);
  const items=[
    {label:'→ Block zuweisen…',action:()=>{closeDD();openBlockAssign(dateStr);}},
    {label:'🗑 Zeile löschen',cls:'danger',action:async()=>{
      const ok=await showConfirm('Zeile '+fmtD(dateStr)+' wirklich löschen?','Löschen');
      if(!ok)return;
      _queueCrewUpdate(dateStr,'Datum entfernt');
      const idx=TOUR_DATES.findIndex(r=>r.date===dateStr);
      if(idx>-1)TOUR_DATES.splice(idx,1);
      if(assignments[dateStr])delete assignments[dateStr];
      closeDD();_savePlanToLS(getActivePlanId());renderTable();
    }}
  ];
  if(row?.blockId)items.unshift({label:'✕ Aus Block entfernen',cls:'clear',action:()=>{row.blockId='';row.blockName='';closeDD();_savePlanToLS(getActivePlanId());renderTable();}});
  showDD(e.currentTarget.getBoundingClientRect(),fmtD(dateStr),items);
}

// ── Crew Assignment Dropdown ───────────────────────────────────────────────────
export function openCrewDD(e,dateStr,posId){
  if(!hasPermission('assignCrew'))return;
  e.stopPropagation();
  const pos=POSITIONS.find(p=>p.id===posId);
  const def=defaultCrew[posId]||'';
  const current=assignments[dateStr]?.[posId];
  const items=[];
  const si=assignmentStatuses[dateStr]?.[posId];
  // Händisch bestätigen — für jede GEPLANTE Person (Override oder Standard), die noch
  // nicht bestätigt ist. Deckt sowohl angefragte (proposed) Slots als auch nachträglich
  // eingetragene Slots OHNE Record ab — confirmAssignment legt dort einen bestätigten
  // Record an. Kein E-Mail-Versand bei confirmed.
  const planned=getVal(dateStr,posId);
  const alreadyConfirmed=si && si.status==='confirmed';
  if(planned && planned!==OFFEN && !alreadyConfirmed){
    const who=(si && si.crewName) || planned;
    items.push({label:'✓ Nur diesen Tag bestätigen',color:'#4ae8a0',action:async()=>{
      closeDD();
      try{
        await confirmAssignment(dateStr,posId);
        showToast('Bestätigt ✓','#4ae8a0');
      }catch(err){
        showToast('Fehler – nicht gespeichert: '+err.message,'#e84a4a');
        await loadAssignmentStatuses();
      }
      renderTable();
    }});
    items.push({label:`✓ Alle Termine von ${who} bestätigen`,color:'#4ae8a0',action:async()=>{
      closeDD();
      // Alle geplanten Slots dieser Person, die noch nicht bestätigt sind.
      const targets=[];
      TOUR_DATES.forEach(r=>{
        POSITIONS.forEach(p=>{
          if(sameCrew(getVal(r.date,p.id),who)){
            const s=assignmentStatuses[r.date]?.[p.id];
            if(!(s && s.status==='confirmed')) targets.push([r.date,p.id]);
          }
        });
      });
      showToast('Wird bestätigt…','#e8c84a');
      try{
        await Promise.all(targets.map(([d,p])=>confirmAssignment(d,p)));
        showToast(`${targets.length} Termin(e) bestätigt ✓`,'#4ae8a0');
      }catch(err){
        showToast('Fehler – bitte erneut versuchen: '+err.message,'#e84a4a');
        await loadAssignmentStatuses();
      }
      renderTable();
    }});
  }
  // Vorläufig vormerken — für Fernzukunft-Termine, die noch NICHT offiziell angefragt
  // werden sollen (kein Mailversand). Anbieten, sobald eine Person geplant ist — auch
  // wenn schon ein Status existiert (erlaubt das Zurücksetzen auf vorgemerkt).
  if(planned && planned!==OFFEN){
    items.push({label:'✎ Vorläufig vormerken',color:'var(--pencilled)',action:async()=>{
      closeDD();
      try{
        const who=planned;
        await pencilInAssignment(dateStr,posId,who,crewMeta?.[who]?.email||'');
        showToast('Vorgemerkt ✎','#7A5FB3');
      }catch(err){
        showToast('Fehler – nicht vorgemerkt: '+err.message,'#e84a4a');
        await loadAssignmentStatuses();
      }
      renderTable();
    }});
  }
  if(isPencilled(si)){
    items.push({label:'→ Jetzt anfragen',color:'var(--accent)',action:async()=>{
      closeDD();
      try{
        await promotePencilledToProposed(dateStr,posId);
        showToast('Angefragt ⏳ — Mail folgt über „Einladen"','var(--accent-b)');
      }catch(err){
        showToast('Fehler – nicht angefragt: '+err.message,'#e84a4a');
        await loadAssignmentStatuses();
      }
      renderTable();
    }});
    items.push({label:'✕ Vormerkung zurückziehen',cls:'danger',action:async()=>{
      closeDD();
      try{
        await cancelProposal(dateStr,posId);
        if(assignmentStatuses[dateStr])delete assignmentStatuses[dateStr][posId];
        showToast('Vormerkung zurückgezogen ✓','#4ae8a0');
      }catch(err){
        showToast('Fehler: '+(err&&err.message||'nicht zurückgezogen'),'#e84a4a');
        await loadAssignmentStatuses();
      }
      renderTable();
    }});
  }
  if(isPending(si)){
    items.push({label:'✕ Anfrage zurückziehen',cls:'danger',action:async()=>{
      closeDD();
      try{
        await _removeAssignment();
        setAssign(dateStr,posId,'');
        showToast('Anfrage zurückgezogen ✓','#4ae8a0');
      }catch(err){
        console.error('_removeAssignment failed:',err);
        showToast('Fehler: '+(err&&err.message||'Anfrage nicht zurückgezogen'),'#e84a4a');
        await loadAssignmentStatuses();
      }
      renderTable();
    }});
  }
  if(si && !isPending(si) && !isPencilled(si)){
    items.push({label:'✕ Besetzung aufheben',cls:'danger',action:async()=>{
      closeDD();
      try{
        await _removeAssignment();
        setAssign(dateStr,posId,'');
        showToast('Besetzung aufgehoben ✓','#4ae8a0');
      }catch(err){
        showToast('Fehler: '+(err&&err.message||'nicht aufgehoben'),'#e84a4a');
        await loadAssignmentStatuses();
      }
      renderTable();
    }});
  }
  // Zuweisung entfernen (v0.30.0): War die Person bestätigt/angefragt (also schon
  // benachrichtigt) → Soft-Cancel (Record bleibt für die „GESEHEN ✓"-Quittung) +
  // Eintrag in die Updates-Queue („➖ entfernt"). Sonst (pencilled/declined/ohne
  // Record) → hartes Löschen wie bisher, keine Benachrichtigung nötig.
  const _removeAssignment=async()=>{
    const wasActive=si && (si.status==='confirmed' || si.status==='proposed');
    if(wasActive){
      const rec=await softCancelAssignment(dateStr,posId);
      const _email=crewMeta?.[si.crewName]?.email||rec?.crew_email||'';
      const _lbl=(POSITIONS||[]).find(p=>p.id===posId)?.label||posId;
      if(rec && si.crewName)_queueRemovedSlot(si.crewName,_email,dateStr,posId,_lbl,rec.id);
    }else if(si){
      await cancelProposal(dateStr,posId);
    }
    if(assignmentStatuses[dateStr])delete assignmentStatuses[dateStr][posId];
  };
  // Anfragen ausschließlich über Crew-Notify-Modal (Einladen-Button)
  const _applyState=async(val)=>{
    closeDD();
    if(si){
      try{await _removeAssignment();}catch(e){console.warn('_removeAssignment:',e);}
    }
    setAssign(dateStr,posId,val);
    renderTable();
  };
  if(def)items.push({label:`↩ Standard: ${def}`,cls:'reset',action:async()=>{
    closeDD();
    if(si){try{await _removeAssignment();}catch(e){console.warn(e);}}
    clearAssignmentSlot(dateStr, posId);
    renderTable();
  }});
  items.push({label:'— Nicht besetzt',cls:'clear',action:()=>_applyState('')});
  items.push({label:'⚠ Offen / Unbesetzt',cls:'offen',color:'#e07060',action:()=>_applyState(OFFEN)});
  items.push({label:'🏖 Offday',color:'#70ad47',action:()=>_applyState(OFFDAY)});
  items.push({label:'✈ Reisetag',color:'#4f81bd',action:()=>_applyState(REISE_TAG)});
  items.push({label:'📋 Ausschreiben',color:'#c07830',action:()=>_applyState(AUSSCHREIBEN)});
  crew.forEach((name,i)=>{
    const meta=SUPABASE_ENABLED?(crewMeta[name]||null):null;
    const hasEmail=!!(meta?.email);
    const label=hasEmail?`📧 ${name}`:name;
    items.push({label,dot:CREW_COLORS[i%CREW_COLORS.length],selected:current===name,action:()=>_applyState(name)});
  });
  // Direkt als vorgemerkt zuweisen — für JEDE Person aus der Crew-Liste, unabhängig
  // vom aktuellen Zellstatus (leer oder bereits belegt). Ergänzt den Quick-Toggle oben,
  // der nur die bereits in der Zelle stehende Person betrifft.
  const _applyPencil=async(name)=>{
    closeDD();
    try{
      // Verdrängt das Vormerken eine ANDERE Person, die im Slot sitzt? Dann deren
      // Entfernung in die Update-Queue legen — Versand passiert NICHT automatisch,
      // sondern erst wenn der Manager „Updates senden" drückt. Wird dagegen dieselbe
      // Person als vorgemerkt gesetzt, gibt es nichts zu entfernen (kein Queue-Eintrag,
      // sonst falsche „Termin entfernt"-Notiz für jemanden, der weiter im Slot steht).
      if(si && si.crewName && !sameCrew(si.crewName,name)){
        try{await _removeAssignment();}catch(e){console.warn('_removeAssignment:',e);}
      }
      await pencilInAssignment(dateStr,posId,name,crewMeta?.[name]?.email||'');
      setAssign(dateStr,posId,name);
      showToast('Vorgemerkt ✎','#7A5FB3');
    }catch(err){
      showToast('Fehler – nicht vorgemerkt: '+err.message,'#e84a4a');
      await loadAssignmentStatuses();
      renderTable();
    }
  };
  crew.forEach((name,i)=>{
    items.push({label:`✎ Vorgemerkt: ${name}`,dot:CREW_COLORS[i%CREW_COLORS.length],color:'var(--pencilled)',action:()=>_applyPencil(name)});
  });
  showDD(e.currentTarget.getBoundingClientRect(),pos.label+(SUPABASE_ENABLED?' · 📧=Benachrichtigung':''),items);
}
export function setAssign(d,p,v){setAssignment(d,p,v);_savePlanToLS(getActivePlanId());renderTable();}

// ── Default Crew Dropdown ──────────────────────────────────────────────────────
export function openDefaultDD(e,posId){
  e.stopPropagation();
  const pos=POSITIONS.find(p=>p.id===posId);
  const cur=defaultCrew[posId]||'';
  const items=[{label:'— Kein Standard',cls:'clear',action:()=>{defaultCrew[posId]='';closeDD();_savePlanToLS(getActivePlanId());renderTable();}},
    ...crew.map((name,i)=>({label:name,dot:CREW_COLORS[i%CREW_COLORS.length],selected:name===cur,action:()=>{defaultCrew[posId]=name;closeDD();_savePlanToLS(getActivePlanId());renderTable();}}))];
  showDD(e.currentTarget.getBoundingClientRect(),`Standard: ${pos.label}`,items);
}

export async function bulkCancelPos(e,posId){
  e.stopPropagation();
  const pos=POSITIONS.find(p=>p.id===posId);
  const def=defaultCrew[posId]||'';
  if(!def)return;
  const ok=await showConfirm(`Offene Anfragen von „${def}" für „${pos?.label}" zurückziehen?`,'Zurückziehen');
  if(!ok)return;
  try{
    await bulkCancelProposals(posId, def);
    Object.keys(assignmentStatuses).forEach(date=>{
      const si=assignmentStatuses[date]?.[posId];
      if(si&&sameCrew(si.crewName,def)&&isPending(si)){
        delete assignmentStatuses[date][posId];
        clearAssignmentSlot(date, posId);
      }
    });
    showToast(`${pos?.label}: Anfragen von ${def} zurückgezogen`,'#4ae8a0');
  }catch(err){
    console.error('bulkCancelProposals failed:',err);
    showToast(`${pos?.label}: Fehler beim Zurückziehen`,'#e84a4a');
    await loadAssignmentStatuses();
  }
  renderTable();
}

export async function requestAll(e){
  if(!IS_MANAGER)return;
  e.stopPropagation();
  const _ok=await showConfirm('Alle leeren Slots mit Standard-Crew füllen?\nDas überschreibt deinen Plan und kann nicht rückgängig gemacht werden.','Übernehmen');
  if(!_ok)return;
  TOUR_DATES.forEach(day=>{
    POSITIONS.forEach(pos=>{
      const def=defaultCrew[pos.id];
      if(!def)return;
      if(day.date in assignments&&pos.id in(assignments[day.date]||{}))return;
      setAssignment(day.date, pos.id, def);
    });
  });
  _savePlanToLS(getActivePlanId());
  renderTable();
  showToast('Alle Standard-Zuweisungen übernommen ✓','#4ae8a0');
}

export function requestForPos(e,posId){
  if(!IS_MANAGER)return;
  e.stopPropagation();
  const def=defaultCrew[posId];
  if(!def)return;
  TOUR_DATES.forEach(day=>{
    if(day.date in assignments&&posId in(assignments[day.date]||{}))return;
    setAssignment(day.date, posId, def);
  });
  _savePlanToLS(getActivePlanId());
  renderTable();
  const pos=POSITIONS.find(p=>p.id===posId);
  showToast(`${pos?.label}: Standard übernommen ✓`,'#4ae8a0');
}
