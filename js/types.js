// ── Day Type Options & Custom Types ───────────────────────────────────────────
import { TOUR_DATES } from './state.js';
import { renderTable } from './render.js';
import { closeModal, openModal } from './modals.js';
import { showAlert, showConfirm } from './dialog.js';

export const TYPE_COLOR_DEFAULTS = {show:'#4caf72', reise:'#5a9fd4', prep:'#e8883a', off:'#888888'};
export const TYPE_WEIGHT_DEFAULTS = {show:1.0, reise:0.5, prep:1.0, off:0.5};

export const DEFAULT_TYPE_OPTS = [
  {v:'show|Show',    label:'Show',         type:'show',  color:'#4caf72', weight:1.0},
  {v:'reise|Reise',  label:'Reise',        type:'reise', color:'#5a9fd4', weight:0.5},
  {v:'reise|Nightliner',label:'Nightliner',type:'reise', color:'#5a9fd4', weight:0.5},
  {v:'prep|Aufbau',  label:'Aufbau',       type:'prep',  color:'#e8883a', weight:1.0},
  {v:'prep|Probe',   label:'Probe',        type:'prep',  color:'#e8883a', weight:1.0},
  {v:'prep|Abbau',   label:'Abbau',        type:'prep',  color:'#e8883a', weight:1.0},
  {v:'prep|Vorbereitung',  label:'Vorbereitung',  type:'prep', color:'#e8883a', weight:1.0},
  {v:'prep|Nachbereitung', label:'Nachbereitung', type:'prep', color:'#e8883a', weight:1.0},
  {v:'prep|Packen',        label:'Packen',        type:'prep', color:'#e8883a', weight:1.0},
  {v:'off|OFF',      label:'OFF',          type:'off',   color:'#888888', weight:0.5},
  {v:'off|Anreise',  label:'Anreise',      type:'off',   color:'#888888', weight:0.5},
  {v:'off|Abreise',  label:'Abreise',      type:'off',   color:'#888888', weight:0.5},
];
// Dynamische Liste — wird aus localStorage ergänzt
export let TYPE_OPTS = DEFAULT_TYPE_OPTS.map(o=>({...o}));
export const TYPES_KEY = 'tourplan_custom_types';

// Fallback-Felder für alte Einträge ohne color/weight
function _fillTypeDefaults(entry){
  if(entry.color===undefined) entry.color = TYPE_COLOR_DEFAULTS[entry.type]||'#888888';
  if(entry.weight===undefined) entry.weight = TYPE_WEIGHT_DEFAULTS[entry.type]??1.0;
  return entry;
}

export function loadCustomTypes(){
  try{
    const raw=localStorage.getItem(TYPES_KEY);
    if(!raw) return;
    const saved=JSON.parse(raw);
    // Migration: wenn gespeicherte Daten Default-Labels enthalten → vollständige Liste
    const hasDefaults=saved.some(s=>DEFAULT_TYPE_OPTS.find(d=>d.label===s.label));
    if(hasDefaults){
      // Neues Format: gespeicherte Liste direkt verwenden
      TYPE_OPTS=saved.map(s=>{_fillTypeDefaults(s);return s;});
    } else {
      // Altes Format (nur Custom-Typen): auf Defaults aufbauen
      saved.forEach(c=>{
        _fillTypeDefaults(c);
        if(!TYPE_OPTS.find(t=>t.label===c.label)) TYPE_OPTS.push(c);
        else {const ex=TYPE_OPTS.find(t=>t.label===c.label);if(ex){ex.color=c.color;ex.weight=c.weight;ex.type=c.type;}}
      });
    }
  }catch(e){}
}

function _saveAllTypes(){
  try{localStorage.setItem(TYPES_KEY,JSON.stringify(TYPE_OPTS));}catch(e){}
}
// Alias für Rückwärtskompatibilität
const _saveAllCustomTypes=_saveAllTypes;

// Für Rückwärtskompatibilität (wird noch aus tourblock/dates aufgerufen)
export function saveCustomType(label,type){
  if(TYPE_OPTS.find(t=>t.label===label)) return;
  const color=TYPE_COLOR_DEFAULTS[type]||'#888888';
  const weight=TYPE_WEIGHT_DEFAULTS[type]??1.0;
  const entry={v:`${type}|${label}`,label,type,color,weight};
  TYPE_OPTS.push(entry);
  _saveAllCustomTypes();
}

// Neuen Typ anlegen
export function addType(label,type,color,weight){
  if(!label.trim()) return;
  const existing=TYPE_OPTS.find(t=>t.label===label);
  if(existing){
    existing.type=type; existing.color=color; existing.weight=weight;
    existing.v=`${type}|${label}`;
  } else {
    TYPE_OPTS.push({v:`${type}|${label}`,label,type,color,weight});
  }
  _saveAllTypes();
}

// Typ bearbeiten
export function editType(oldLabel,newLabel,type,color,weight){
  const idx=TYPE_OPTS.findIndex(t=>t.label===oldLabel);
  if(idx<0) return;
  TYPE_OPTS[idx]={v:`${type}|${newLabel}`,label:newLabel,type,color,weight};
  if(oldLabel!==newLabel){
    TOUR_DATES.forEach(r=>{if(r.typeLabel===oldLabel){r.typeLabel=newLabel;r.type=type;}});
  }
  _saveAllTypes();
  renderTable();
}

// Typ löschen (alle Typen, auch Defaults)
export async function deleteType(label){
  const ok=await showConfirm(`Tagesart „${label}" wirklich löschen?`,'Löschen');
  if(!ok) return;
  const idx=TYPE_OPTS.findIndex(t=>t.label===label);
  if(idx>=0) TYPE_OPTS.splice(idx,1);
  _saveAllTypes();
  renderTypeManagerList();
}

// Kategorie-Typ aus Label ableiten
export function typeFromLabel(label){
  const known=TYPE_OPTS.find(t=>t.label===label);
  if(known) return known.type;
  const l=label.toLowerCase();
  if(l.includes('show')) return 'show';
  if(l.includes('reis')||l.includes('liner')||l.includes('fahrt')) return 'reise';
  if(l.includes('auf')||l.includes('prob')||l.includes('pack')||l.includes('ab')) return 'prep';
  return 'off';
}


// ── Typ hinzufügen / bearbeiten Modal ─────────────────────────────────────────
export function openAddType(){
  _openTypeModal('Neue Tagesart', '', 'off', '#888888', 0.5, null);
}

export function openEditType(label){
  const t=TYPE_OPTS.find(x=>x.label===label);
  if(!t) return;
  _openTypeModal('Tagesart bearbeiten', t.label, t.type, t.color||'#888888', t.weight??0.5, label);
}

function _openTypeModal(title, label, type, color, weight, editingLabel){
  document.getElementById('sharedTitle').textContent=title;
  document.getElementById('sharedBody').innerHTML=`
    <div class="mf">
      <label class="ml">Bezeichnung</label>
      <input type="text" id="typeLabel" class="mi" value="${label}">
    </div>
    <div class="mf">
      <label class="ml">Basis-Typ (Zeilen-Farbe)</label>
      <select id="typeBase" class="ms">
        <option value="show"  ${type==='show' ?'selected':''}>Show (grün)</option>
        <option value="reise" ${type==='reise'?'selected':''}>Reise (blau)</option>
        <option value="prep"  ${type==='prep' ?'selected':''}>Aufbau / Probe (orange)</option>
        <option value="off"   ${type==='off'  ?'selected':''}>OFF / Sonstiges (grau)</option>
      </select>
    </div>
    <div class="mf" style="display:flex;gap:12px;align-items:flex-end;">
      <div style="flex:1;">
        <label class="ml">Textfarbe</label>
        <input type="color" id="typeColor" value="${color}" style="width:100%;height:36px;border-radius:4px;border:1px solid var(--border);background:var(--surface2);cursor:pointer;padding:2px;">
      </div>
      <div style="flex:1;">
        <label class="ml">Berechnungstage</label>
        <input type="number" id="typeWeight" class="mi" value="${weight}" min="0" max="3" step="0.5" style="text-align:center;">
      </div>
    </div>
    <div style="font-size:.6rem;color:var(--muted);margin-top:-6px;margin-bottom:12px;">z.B. 1.0 = ganzer Tag · 0.5 = halber Tag · 1.5 = eineinhalb Tage</div>
    <div class="mactions">
      <button class="mbtn" onclick="closeModal('sharedModal')">Abbrechen</button>
      <button class="mbtn primary" onclick="_confirmTypeModal('${editingLabel||''}')">Speichern</button>
    </div>`;
  openModal('sharedModal');
  setTimeout(()=>document.getElementById('typeLabel')?.focus(),50);
}

export async function _confirmTypeModal(editingLabel){
  const label=(document.getElementById('typeLabel')?.value||'').trim();
  const type=document.getElementById('typeBase')?.value||'off';
  const color=document.getElementById('typeColor')?.value||'#888888';
  const weight=parseFloat(document.getElementById('typeWeight')?.value)||0.5;
  if(!label){await showAlert('Bitte Bezeichnung eingeben.');return;}
  if(editingLabel){
    editType(editingLabel,label,type,color,weight);
  } else {
    addType(label,type,color,weight);
  }
  closeModal('sharedModal');
  renderTypeManagerList();
}

// ── Typ-Manager Popup ──────────────────────────────────────────────────────────
export function openTypeManager(){
  renderTypeManagerList();
  openModal('typeManagerModal');
}

export function renderTypeManagerList(){
  const el=document.getElementById('typeManagerList');
  if(!el) return;
  el.innerHTML=TYPE_OPTS.map(t=>{
    const w=t.weight!==undefined?t.weight:TYPE_WEIGHT_DEFAULTS[t.type]??1.0;
    const safeLabel=t.label.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    return `<div class="type-list-item">
      <div class="type-list-dot" style="background:${t.color||'#888'};"></div>
      <span class="type-list-label">${t.label}</span>
      <span class="type-list-weight">${w}T</span>
      <button class="sm" onclick="openEditType('${safeLabel}')" title="Bearbeiten" style="padding:1px 5px;flex-shrink:0;">✏</button>
      <button class="sm danger" onclick="deleteType('${safeLabel}')" title="Löschen" style="padding:1px 5px;flex-shrink:0;">✕</button>
    </div>`;
  }).join('');
}

// Alias — wird noch aus init.js aufgerufen
export function renderTypeList(){ renderTypeManagerList(); }
