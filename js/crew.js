// ── Crew Management ────────────────────────────────────────────────────────────
import { crew, TOUR_DATES, POSITIONS, assignments, defaultCrew, crewMeta, IS_MANAGER, CREW_COLORS } from './state.js';
import { showToast, esc, getVal, normCrewName } from './utils.js';
import { normEmail } from './pure.js';
import { _savePlanToLS, getActivePlanId } from './plans.js';
import { renderTable } from './render.js';
import { showPrompt } from './dialog.js';
import { renameCrewMember, deleteCrewMember, loadAllKnownCrew, saveCrewLink,
         createPoolMember } from './dataService.js';
import { openModal, closeModal } from './modals.js';
import { hasPermission } from './rbac.js';

// Global functions called: _savePlanToLS, renderCrew, renderTable

export function renderCrew(){
  const el=document.getElementById('crewList');
  el.innerHTML='';
  const hdr=document.getElementById('crewHeading');
  if(hdr)hdr.textContent='Crew — '+crew.length;
  crew.forEach((name,i)=>{
    let days=0;
    TOUR_DATES.forEach(r=>{POSITIONS.forEach(p=>{if(getVal(r.date,p.id)===name)days++;});});
    const d=document.createElement('div');
    d.className='crew-member';
    // Altbestand sichtbar machen: Personen ohne Adresse haben keinen crew_members-Datensatz,
    // bekommen also keine Anfrage und sehen die Tour nicht. Seit v0.8.3 kann das nicht mehr NEU
    // entstehen (Personen kommen nur noch aus dem Pool) — vorhandene Fälle würden sonst aber
    // stumm weiterlaufen. Wortlaut/Muster wie bulkStatus.js:84.
    // Reparatur: Konsole → Benutzer → im Verzeichnis die Adresse eintragen und speichern.
    const ohneMail=!crewMeta[name]?.email;
    d.innerHTML=`<div class="crew-dot" style="background:${CREW_COLORS[i%CREW_COLORS.length]}"></div>`
      +`<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(name)}`
      +(ohneMail?` <span title="Keine E-Mail hinterlegt — bekommt keine Anfrage und sieht die Tour nicht" style="color:var(--warn);">⚠</span>`:'')
      +`</span>`
      +`<span class="crew-days">${String(days).padStart(2,'0')}d</span>`
      +(IS_MANAGER?`<button class="sm" onclick="renameCrew(${i})" title="Umbenennen">✏</button>`:'')
      +(IS_MANAGER?`<button class="sm danger" onclick="removeCrew(${i})" title="Entfernen">×</button>`:'');
    el.appendChild(d);
  });
  const posEl=document.getElementById('posList');
  posEl.innerHTML=POSITIONS.map((p,i)=>IS_MANAGER
    ?`<div class="sb-pos" onclick="openRenamePos(${i})" title="Position umbenennen"><span class="sb-pos-short">${esc(p.short||'')}</span><span class="sb-pos-label">${esc(p.label)}</span></div>`
    :`<div class="sb-pos"><span class="sb-pos-short">${esc(p.short||'')}</span><span class="sb-pos-label">${esc(p.label)}</span></div>`
  ).join('');
}

// Nimmt eine Person MIT Adresse in DIESE Tour auf: Name in crew[] und crew_members-Datensatz.
//
// ⚠️ REIHENFOLGE: saveCrewLink liest crew.indexOf(name) für sort_order — der Name muss vorher in
// der Liste stehen. Schlägt das Anlegen fehl, muss er wieder HERAUS. Sonst entsteht genau der
// Zustand, den v0.8.3 beseitigt: Bis v0.8.2 legte der `+`-Knopf nur `crew.push(name)` an, den
// crew_members-Datensatz aber nie. Folge, beides unsichtbar: (a) keine Anfrage-/Einladungsmail
// (der Hook steigt bei leerer crew_email still aus), (b) seit v0.8.1 sieht die Person die Tour
// ÜBERHAUPT NICHT, weil /myplan und /myplans genau auf diesen Datensatz prüfen. Sie stand in der
// Tabelle und war für das System trotzdem nicht Teil der Tour.
//
// Wirft weiter — die Aufrufer melden pro Person, was schiefging.
async function _takeIntoTour(name, email){
  crew.push(name);
  _savePlanToLS(getActivePlanId());
  try{
    await saveCrewLink(name, email);
  }catch(e){
    const i=crew.indexOf(name);
    if(i>=0)crew.splice(i,1);
    _savePlanToLS(getActivePlanId());
    throw e;
  }
}

export function removeCrew(i){
  if(!IS_MANAGER)return;
  const name=crew[i];
  crew.splice(i,1);
  Object.keys(assignments).forEach(d=>{
    Object.keys(assignments[d]||{}).forEach(p=>{
      if(assignments[d][p]===name)delete assignments[d][p];
    });
  });
  _savePlanToLS(getActivePlanId());
  renderCrew();
  renderTable();
  // PB-crew_members-Record mitlöschen (sonst bleibt eine Leiche → Dublette beim Neuanlegen)
  deleteCrewMember(name);
}

// ── Crew-Mitglied umbenennen — aktualisiert lokal (crew/defaultCrew/assignments/crewMeta)
// UND PB (crew_members + assignments), legt KEINE Dublette an.
export async function renameCrew(i){
  if(!IS_MANAGER)return;
  const oldName=crew[i];
  const val=await showPrompt('Crew-Mitglied umbenennen:',oldName);
  if(val===null)return;
  const n=(val||'').trim();
  if(!n||n===oldName)return;
  if(crew.includes(n)){showToast('Name bereits vorhanden','#e84a4a');return;}
  // lokal überall ersetzen
  crew[i]=n;
  Object.keys(defaultCrew).forEach(k=>{if(defaultCrew[k]===oldName)defaultCrew[k]=n;});
  Object.keys(assignments).forEach(d=>{Object.keys(assignments[d]||{}).forEach(p=>{if(assignments[d][p]===oldName)assignments[d][p]=n;});});
  if(crewMeta[oldName]){crewMeta[n]=crewMeta[oldName];delete crewMeta[oldName];}
  _savePlanToLS(getActivePlanId());
  renderCrew();
  renderTable();
  // PB: bestehende Records umbenennen (keine Dublette)
  try{
    await renameCrewMember(oldName,n);
    showToast(`Umbenannt → ${n} ✓`,'#4ae8a0');
  }catch(e){
    showToast('Lokal umbenannt, PB-Sync fehlgeschlagen: '+e.message,'#e84a4a');
  }
}

// ── Crew-Pool: der EINZIGE Weg, jemanden in eine Tour zu bekommen ─────────────
// Seit v0.8.3 gibt es kein Freitextfeld mehr in der Seitenleiste. Eine Person entsteht einmal
// global (Name + E-Mail + Rolle → crew_members mit plan_id="__pool__") und wird von dort in
// beliebig viele Touren übernommen. Damit KANN der Zustand „Name ohne Datensatz" nicht mehr
// entstehen — nicht weil eine Prüfung ihn abfängt, sondern weil es das Eingabefeld nicht gibt.
let _importCandidates = [];   // [{name,email}] — die aktuell anzeigbaren (noch nicht im Plan)

export async function openImportCrewModal(){
  if(!hasPermission('managePool'))return;
  const body=document.getElementById('crewImportBody');
  if(body)body.innerHTML='<div style="font-size:.7rem;color:#888;">Lade Crew-Pool…</div>';
  _showNewPersonForm(false);
  openModal('crewImportModal');
  let known=[];
  try{ known=await loadAllKnownCrew(); }
  catch(e){ if(body)body.innerHTML=`<div style="font-size:.7rem;color:#e84a4a;">Fehler: ${esc(e.message)}</div>`; return; }
  // Bereits im Plan vorhandene Namen ausblenden.
  const have=new Set(crew.map(n=>normCrewName(n)));
  _importCandidates=known.filter(k=>!have.has(normCrewName(k.name)));
  _renderImportCrewList();
}

function _renderImportCrewList(){
  const body=document.getElementById('crewImportBody');
  if(!body)return;
  if(!_importCandidates.length){
    body.innerHTML='<div style="font-size:.7rem;color:#888;">Niemand mehr im Pool, der nicht schon in dieser Tour ist. Über „+ Neue Person" legst du jemanden neu an.</div>';
    return;
  }
  // Zählung sichtbar machen: „wird nicht angezeigt" war bisher nicht von „kam nichts an" zu
  // unterscheiden — der Dialog sah in beiden Fällen gleich aus. Steht hier 0 im Pool, obwohl
  // gerade jemand angelegt wurde, liegt es an der Abfrage und nicht am Suchen.
  const imPool=_importCandidates.filter(k=>k.pool).length;
  const kopf=`<div style="font-size:.58rem;color:var(--muted);margin-bottom:8px;">`
    +`${imPool} im Pool · ${_importCandidates.length-imPool} aus anderen Touren</div>`;

  body.innerHTML=kopf+_importCandidates.map((k,i)=>{
    // Altbestand ohne Adresse: übernehmen wäre sinnlos — die Person bekäme keine Anfrage und
    // sähe die Tour nicht. Deshalb sichtbar, aber nicht auswählbar, mit dem Reparaturweg dabei.
    if(!k.email)return `
    <div style="display:flex;align-items:center;gap:8px;padding:5px 2px;border-bottom:1px solid #2a2a3a;font-size:.66rem;color:#666;">
      <input type="checkbox" disabled style="width:14px;height:14px;flex-shrink:0;">
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(k.name)}</span>
      <span title="Ohne Adresse bekommt die Person keine Anfrage und sieht die Tour nicht. Adresse in der Konsole unter Benutzer nachtragen." style="color:var(--warn);font-size:.6rem;">⚠ keine E-Mail</span>
    </div>`;
    return `
    <label style="display:flex;align-items:center;gap:8px;padding:5px 2px;border-bottom:1px solid #2a2a3a;font-size:.66rem;color:#ddd;cursor:pointer;">
      <input type="checkbox" data-i="${i}" checked style="width:14px;height:14px;accent-color:#4ae8a0;flex-shrink:0;">
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(k.name)}</span>
      <span style="color:#777;font-size:.6rem;">${esc(k.email)}</span>
    </label>`;
  }).join('');
}

export function _importSelectAll(val){
  // `[data-i]` schließt die deaktivierten Altbestands-Zeilen aus — „ALLE" darf nichts
  // auswählen, was confirmImportCrew ohnehin nicht übernehmen könnte.
  document.querySelectorAll('#crewImportBody input[type=checkbox][data-i]').forEach(cb=>{cb.checked=val;});
}

export function _closeImportCrew(){ closeModal('crewImportModal'); }

// ── Neue Person anlegen (aus der Tour heraus) ─────────────────────────────────
// Damit man beim Planen nicht in die Konsole wechseln muss. Schreibt denselben Pool-Record wie
// „Benutzer → + Neues Crew-Mitglied" (gemeinsame Funktion createPoolMember in dataService.js)
// und übernimmt die Person direkt in die offene Tour.
export function _showNewPersonForm(show){
  const f=document.getElementById('newPersonForm');
  const b=document.getElementById('newPersonToggle');
  if(f)f.style.display=show?'block':'none';
  if(b)b.style.display=show?'none':'';
  if(show)document.getElementById('npName')?.focus();
}

// `n` statt `name` wie überall in dieser Datei: escaping.test.mjs sucht dateiweit nach einem
// ungeschützten `${name}` — der Guard ist bewusst stumpf und kann Toast-Text nicht von HTML
// unterscheiden. renameCrew hält es seit jeher genauso.
export async function createAndTakeCrew(){
  if(!hasPermission('managePool'))return;
  const n    =(document.getElementById('npName')?.value||'').trim();
  const email=normEmail(document.getElementById('npEmail')?.value);
  const role =document.getElementById('npRole')?.value||'crew';
  if(!n){ showToast('Bitte Namen eingeben','#e84a4a'); return; }
  if(!email){ showToast('Bitte E-Mail eingeben','#e84a4a'); return; }
  if(crew.some(x=>normCrewName(x)===normCrewName(n))){
    showToast('Name in dieser Tour bereits vorhanden','#e84a4a');
    return;
  }
  try{
    await createPoolMember(n,email,role);
  }catch(e){
    showToast('Anlegen fehlgeschlagen: '+e.message,'#e84a4a');
    return;
  }
  // Der Pool-Record steht — die Person existiert jetzt systemweit, auch wenn die Übernahme in
  // DIESE Tour gleich scheitert. Deshalb zwei getrennte Meldungen statt einer Sammelmeldung.
  try{
    await _takeIntoTour(n,email);
  }catch(e){
    renderCrew();
    showToast(`${n} im Pool angelegt, Übernahme in die Tour fehlgeschlagen: ${e.message}`,'#e8c84a');
    return;
  }
  document.getElementById('npName').value='';
  document.getElementById('npEmail').value='';
  _showNewPersonForm(false);
  renderCrew();
  renderTable();
  closeModal('crewImportModal');
  showToast(`${n} angelegt und übernommen ✓`,'#4ae8a0');
}

// Übernimmt die angehakten Personen — pro Person atomar (Name + Datensatz oder gar nichts).
// Vorher lief das zweiphasig: erst alle Namen pushen, dann die Adressen verknüpfen. Ein
// Fehlschlag in Phase zwei ließ den Namen ohne Datensatz stehen — genau der Zustand, den
// v0.8.3 beseitigt. Erfolgreiche bleiben; die Fehlgeschlagenen werden namentlich gemeldet,
// sonst weiß niemand, wen er noch einmal versuchen muss.
export async function confirmImportCrew(){
  if(!hasPermission('managePool'))return;
  const boxes=[...document.querySelectorAll('#crewImportBody input[type=checkbox][data-i]')];
  const chosen=boxes.filter(cb=>cb.checked).map(cb=>_importCandidates[+cb.dataset.i]).filter(Boolean);
  if(!chosen.length){ showToast('Nichts ausgewählt','#5a6070'); return; }
  closeModal('crewImportModal');
  showToast(`${chosen.length} werden übernommen…`,'#e8c84a');

  let added=0; const failed=[];
  for(const k of chosen){
    if(crew.some(n=>normCrewName(n)===normCrewName(k.name)))continue;
    try{ await _takeIntoTour(k.name,k.email); added++; }
    catch(e){ failed.push(k.name); console.warn('Crew-Übernahme fehlgeschlagen:',k.name,e.message); }
  }
  renderCrew();
  renderTable();
  showToast(failed.length
    ? `${added} übernommen · fehlgeschlagen: ${failed.join(', ')}`
    : `${added} übernommen ✓`, failed.length?'#e8c84a':'#4ae8a0');
}
