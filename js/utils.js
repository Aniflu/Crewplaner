// ── Helpers ────────────────────────────────────────────────────────────────────
function parseD(s){const[y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d);}
function fmtD(s){const d=parseD(s);return `${DE_DAYS[d.getDay()]} ${d.getDate()}. ${DE_MON[d.getMonth()]}`;}
function fmtDParts(s){const d=parseD(s);return {wd:DE_DAYS[d.getDay()],dt:`${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}`};}
function sortInsert(row){const i=TOUR_DATES.findIndex(r=>r.date>row.date);if(i===-1)TOUR_DATES.push(row);else TOUR_DATES.splice(i,0,row);}
function getVal(dateStr,posId){const ov=dateStr in assignments&&posId in(assignments[dateStr]||{});if(!ov)return defaultCrew[posId]||'';const v=assignments[dateStr][posId];if(v===''||v===null||v===undefined)return '';return v;}
function dw(row){
  const opt=TYPE_OPTS.find(t=>t.label===row.typeLabel);
  if(opt&&opt.weight!==undefined)return opt.weight;
  return (row.type==='reise'||row.type==='off')?0.5:1;
}
function fmt(n){return n%1===0?n:n.toFixed(1);}

// Erzeugt aus einer hellen Akzentfarbe einen dunklen Zeilen-Hintergrund (gleicher Farbton, ~9% Helligkeit)
function colorToDarkBg(hex){
  if(!hex||hex.length<7)return '';
  const r=parseInt(hex.slice(1,3),16)/255,g=parseInt(hex.slice(3,5),16)/255,b=parseInt(hex.slice(5,7),16)/255;
  const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
  let h=0,s=0,l=(max+min)/2;
  if(d>0){
    s=d/(1-Math.abs(2*l-1));
    if(max===r)h=((g-b)/d+6)%6;
    else if(max===g)h=(b-r)/d+2;
    else h=(r-g)/d+4;
    h*=60;
  }
  const nS=Math.min(s*0.65,0.55),nL=0.09;
  const c=(1-Math.abs(2*nL-1))*nS,x=c*(1-Math.abs((h/60)%2-1)),m=nL-c/2;
  let r2,g2,b2;
  if(h<60){r2=c;g2=x;b2=0;}else if(h<120){r2=x;g2=c;b2=0;}
  else if(h<180){r2=0;g2=c;b2=x;}else if(h<240){r2=0;g2=x;b2=c;}
  else if(h<300){r2=x;g2=0;b2=c;}else{r2=c;g2=0;b2=x;}
  const hex2=v=>Math.round((v+m)*255).toString(16).padStart(2,'0');
  return `#${hex2(r2)}${hex2(g2)}${hex2(b2)}`;
}
function isPending(si){return!!(si&&(si.status==='proposed'||si.status==='declined'));}
function showToast(msg,color='#4f81bd'){const t=document.getElementById('toast');t.textContent=msg;t.style.background=color;t.style.opacity='1';clearTimeout(t._t);t._t=setTimeout(()=>{t.style.opacity='0';},2200);}
