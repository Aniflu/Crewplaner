// ── Logo System ────────────────────────────────────────────────────────────────
import { logos } from './state.js';
import { showToast } from './utils.js';
import { openModal } from './modals.js';

// Global constants
const LOGOS_KEY = 'tourplan_logos';

export function saveLogosGlobal(){
  try{
    localStorage.setItem(LOGOS_KEY,JSON.stringify({booking:logos.booking,band:logos.band,planer:logos.planer}));
  }catch(e){}
}

export function loadLogosGlobal(){
  try{
    const r=localStorage.getItem(LOGOS_KEY);
    if(r){
      const l=JSON.parse(r);
      logos.booking=l.booking||'';
      logos.band=l.band||'';
      logos.planer=l.planer||'';
      applyAllLogos();
    }
  }catch(e){}
}

export function openLogosModal(){
  updateLogoPreviews();
  openModal('logoModal');
}

export function handleLogoUpload(type,input){
  const file=input.files[0];
  if(!file)return;
  const r=new FileReader();
  r.onload=e=>{
    logos[type]=e.target.result;
    applyLogoToHeader(type);
    updateLogoPreviews();
    saveLogosGlobal();
    showToast(`${type}-Logo gesetzt ✓`,'#2d6a3f');
  };
  r.readAsDataURL(file);
  input.value='';
}

export function removeLogo(type){
  logos[type]='';
  applyLogoToHeader(type);
  updateLogoPreviews();
  saveLogosGlobal();
  showToast(`${type}-Logo entfernt`,'#d4b84a');
}

export function updateLogoPreviews(){
  ['band','booking','planer'].forEach(type=>{
    const prev=document.getElementById('prev'+type.charAt(0).toUpperCase()+type.slice(1));
    const rm=document.getElementById('rm'+type.charAt(0).toUpperCase()+type.slice(1));
    if(logos[type]){
      prev.src=logos[type];
      prev.style.display='block';
      rm.style.display='block';
    }
    else{
      prev.src='';
      prev.style.display='none';
      rm.style.display='none';
    }
  });
}

export function applyLogoToHeader(type){
  if(type==='planer'){
    const area=document.getElementById('areaPlaner');
    area.innerHTML='';
    if(logos.planer){
      const img=document.createElement('img');
      img.src=logos.planer;
      img.className='logo-planer';
      img.title='Planer-Logo';
      img.alt='Planer-Logo';
      area.appendChild(img);
    }
  } else if(type==='booking'){
    const area=document.getElementById('areaBooking');
    area.innerHTML='';
    if(logos.booking){
      const img=document.createElement('img');
      img.src=logos.booking;
      img.className='logo-booking';
      img.title='Booking-Logo';
      img.alt='Booking-Logo';
      area.appendChild(img);
    }
  } else if(type==='band'){
    const area=document.getElementById('areaBand');
    const existing=area.querySelector('.logo-band');
    if(existing)existing.remove();
    if(logos.band){
      const img=document.createElement('img');
      img.src=logos.band;
      img.className='logo-band';
      img.title='Band-Logo';
      img.alt='Band-Logo';
      area.insertBefore(img,area.firstChild);
    }
  }
}

export function applyAllLogos(){
  ['planer','booking','band'].forEach(t=>applyLogoToHeader(t));
}

export function loadLogo(type,input){
  handleLogoUpload(type,input);
}

export function applyLogo(type){
  applyLogoToHeader(type);
}
