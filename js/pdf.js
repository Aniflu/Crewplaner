// ── PDF Export ─────────────────────────────────────────────────────────────────
// Ops-Console Print-Look: Gold-Rail, Archivo Display, Mini-KPI, weiss auf dunkel invertiert.
// Drei Ansichten: Tabelle (volle Kreuztabelle), Blöcke (Tourblock-Zusammenfassung),
// Crew (Timeline pro Person).
import { TOUR_DATES, POSITIONS, crew, assignments, defaultCrew,
         assignmentStatuses, logos, IS_MANAGER, CREW_COLORS } from './state.js';
import { getVal, isPending, esc, parseD, fmtD, dw } from './utils.js';
import { TYPE_OPTS } from './types.js';
import { getPlansIndex, getActivePlanId } from './plans.js';

let PDF_VIEW='table'; // 'table' | 'blocks' | 'crew'

export function pdfSetView(v){
  PDF_VIEW=v;
  document.querySelectorAll('#pdfViewChoice .pvc').forEach(b=>{
    b.classList.toggle('active', b.dataset.view===v);
  });
  // Positionen-Filter nur für Tabelle relevant
  const posWrap=document.getElementById('pdfPosWrap');
  if(posWrap)posWrap.style.display = v==='table' ? '' : 'none';
}

export function openPDFFilter(){
  document.getElementById('pdfPosCbs').innerHTML=POSITIONS.map((p,i)=>
    `<label style="display:flex;align-items:center;gap:8px;font-size:11px;cursor:pointer;padding:2px 0;"><input type="checkbox" class="pdfcb" data-idx="${i}" checked style="accent-color:#d4a53a;"> <span style="color:#d4a53a;font-weight:600;letter-spacing:.1em;font-size:10px;text-transform:uppercase;min-width:44px;">${p.short||''}</span><span>${p.label}</span></label>`
  ).join('');
  document.getElementById('pdfCrewCbs').innerHTML=crew.map((name,i)=>{
    const col=CREW_COLORS[i%CREW_COLORS.length];
    return `<label style="display:flex;align-items:center;gap:8px;font-size:11px;cursor:pointer;padding:2px 0;"><input type="checkbox" class="pdfcrewcb" data-idx="${i}" checked style="accent-color:${col};"><span style="display:inline-block;width:8px;height:8px;background:${col};flex-shrink:0;"></span>${esc(name)}</label>`;
  }).join('');
  pdfSetView(PDF_VIEW);
  openModal('pdfModal');
}

export function pdfToggleAll(containerId, state){
  document.querySelectorAll('#'+containerId+' input[type="checkbox"]').forEach(cb=>cb.checked=state);
}

// ── Shared helpers ─────────────────────────────────────────────────────────────
const PDF_COLORS={
  accent:'#d4a53a',ink:'#0e1013',muted:'#6a6f78',mutedDim:'#a0a4ad',
  paper:'#ffffff',paperAlt:'#faf9f5',rule:'#d4d2ca',ruleSoft:'#e8e6de',
  show:'#2a9a56', reise:'#3f7fc4', prep:'#c77a30', off:'#8a8e96', warn:'#c94a3a'
};
function pdfTypeColor(t){return ({show:PDF_COLORS.show,reise:PDF_COLORS.reise,prep:PDF_COLORS.prep,off:PDF_COLORS.off})[t]||PDF_COLORS.ink;}
function pdfAbbr(n){if(!n)return '';const parts=n.trim().split(/\s+/);if(parts.length===1)return parts[0].slice(0,4).toUpperCase();return (parts[0][0]+parts[parts.length-1][0]).toUpperCase();}

function pdfSharedCSS(){
  return `*{box-sizing:border-box;margin:0;padding:0;}
@page{size:A4 landscape;margin:10mm;}
html,body{background:#fff;color:${PDF_COLORS.ink};font-family:'JetBrains Mono','IBM Plex Mono',ui-monospace,monospace;font-size:9pt;}
.page{padding:8mm 10mm;min-height:100vh;display:flex;flex-direction:column;page-break-after:always;}
.page:last-child{page-break-after:auto;}
.ph{display:grid;grid-template-columns:1fr auto 1fr;gap:20px;align-items:end;padding-bottom:8px;border-bottom:3px solid ${PDF_COLORS.accent};margin-bottom:4px;}
.ph-left img{max-height:36px;max-width:150px;object-fit:contain;object-position:left center;}
.ph-right{text-align:right;font-size:8pt;color:${PDF_COLORS.muted};letter-spacing:.18em;text-transform:uppercase;font-weight:600;}
.ph-right img{max-height:36px;max-width:150px;object-fit:contain;object-position:right center;margin-top:4px;display:block;margin-left:auto;}
.ph-title{font-family:'Archivo','Inter Tight',system-ui,sans-serif;font-size:22pt;font-weight:800;letter-spacing:.03em;text-transform:uppercase;line-height:1;}
.ph-title .sl{color:${PDF_COLORS.accent};}
.ph-sub{font-size:8pt;color:${PDF_COLORS.muted};letter-spacing:.22em;text-transform:uppercase;margin-top:3px;font-weight:600;}
.ph-plan{text-align:center;font-size:10pt;font-weight:600;letter-spacing:.08em;}
.ph-range{font-size:8pt;color:${PDF_COLORS.muted};letter-spacing:.16em;text-transform:uppercase;margin-top:2px;font-weight:600;}
.ph-right-stand{font-size:7.5pt;color:${PDF_COLORS.muted};font-weight:500;letter-spacing:.14em;}
.ph-right-seite{margin-top:3px;color:${PDF_COLORS.ink};font-weight:700;}
/* Mini KPI */
.kpi{display:grid;grid-template-columns:repeat(6,1fr);border-bottom:1px solid ${PDF_COLORS.rule};margin-bottom:6px;}
.kpi-cell{padding:4px 10px;border-right:1px solid ${PDF_COLORS.ruleSoft};display:flex;gap:8px;align-items:baseline;}
.kpi-cell:last-child{border-right:none;}
.kpi-val{font-family:'Archivo',sans-serif;font-size:15pt;font-weight:700;line-height:1;font-variant-numeric:tabular-nums;}
.kpi-lbl{font-size:7pt;color:${PDF_COLORS.muted};letter-spacing:.18em;text-transform:uppercase;font-weight:600;}
.kpi.show .kpi-val{color:${PDF_COLORS.show};}
.kpi.reise .kpi-val{color:${PDF_COLORS.reise};}
.kpi.prep .kpi-val{color:${PDF_COLORS.prep};}
.kpi.off .kpi-val{color:${PDF_COLORS.off};}
.kpi.warn .kpi-val{color:${PDF_COLORS.warn};}
/* Footer */
.ft{margin-top:auto;padding-top:8px;border-top:2px solid ${PDF_COLORS.accent};display:grid;grid-template-columns:1fr 1fr;gap:14px;font-size:8pt;}
.ft h4{font-size:7pt;color:${PDF_COLORS.muted};letter-spacing:.2em;text-transform:uppercase;font-weight:700;margin-bottom:4px;}
.ft-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:2px 14px;}
.ft-row{display:flex;justify-content:space-between;}
.ft-meta{text-align:right;font-size:7.5pt;color:${PDF_COLORS.muted};letter-spacing:.16em;text-transform:uppercase;}
.ft-meta .ft-brand{color:${PDF_COLORS.ink};font-weight:700;}
/* Print hint */
.hint{background:#f3f2ee;border:1px solid ${PDF_COLORS.rule};border-left:3px solid ${PDF_COLORS.accent};padding:8px 11px;margin-top:10px;font-size:8pt;color:${PDF_COLORS.ink};}
@media print{.hint{display:none;}}`;
}

function pdfHeaderHTML(planName,rangeStr,pageNo,pagesTotal){
  const lbPlanerHtml=logos.planer?`<img src="${logos.planer}">`:'';
  const lbBookingHtml=logos.booking?`<img src="${logos.booking}">`:'';
  const today=new Date(), dd=String(today.getDate()).padStart(2,'0'),mm=String(today.getMonth()+1).padStart(2,'0');
  return `<div class="ph">
    <div class="ph-left">
      <div class="ph-title">Tour<span class="sl">/</span>Crew</div>
      <div class="ph-sub">Personalplan · Saison ${today.getFullYear()}</div>
      ${lbPlanerHtml?`<div style="margin-top:6px;">${lbPlanerHtml}</div>`:''}
    </div>
    <div class="ph-plan">
      <div>${planName||'Aktueller Plan'}</div>
      <div class="ph-range">${rangeStr}</div>
    </div>
    <div class="ph-right">
      <div class="ph-right-stand">Stand ${dd}.${mm}.${today.getFullYear()}</div>
      <div class="ph-right-seite">Blatt ${pageNo}/${pagesTotal} · Vertraulich</div>
      ${lbBookingHtml}
    </div>
  </div>`;
}

function pdfKPIStripHTML(fd,totalOpen){
  const shows=fd.filter(r=>r.type==='show').length;
  const reise=fd.filter(r=>r.type==='reise').length;
  const prep=fd.filter(r=>r.type==='prep').length;
  const off=fd.filter(r=>r.type==='off').length;
  const pad=n=>String(n).padStart(2,'0');
  return `<div class="kpi">
    <div class="kpi-cell"><span class="kpi-val">${pad(fd.length)}</span><span class="kpi-lbl">Tage</span></div>
    <div class="kpi-cell show"><span class="kpi-val">${pad(shows)}</span><span class="kpi-lbl">Shows</span></div>
    <div class="kpi-cell reise"><span class="kpi-val">${pad(reise)}</span><span class="kpi-lbl">Reise</span></div>
    <div class="kpi-cell prep"><span class="kpi-val">${pad(prep)}</span><span class="kpi-lbl">Prep</span></div>
    <div class="kpi-cell off"><span class="kpi-val">${pad(off)}</span><span class="kpi-lbl">OFF</span></div>
    <div class="kpi-cell warn"><span class="kpi-val">${pad(Math.round(totalOpen))}</span><span class="kpi-lbl">Offen</span></div>
  </div>`;
}

function pdfFooterHTML(byPers,selCrew,viewLabel){
  const names=Object.keys(byPers).filter(n=>selCrew.has(n)&&byPers[n].total>0).sort((a,b)=>byPers[b].total-byPers[a].total);
  const rows=names.map(n=>{
    const ci=crew.indexOf(n),col=ci>=0?CREW_COLORS[ci%CREW_COLORS.length]:'#888';
    return `<div class="ft-row"><span><span style="display:inline-block;width:7px;height:7px;background:${col};margin-right:6px;vertical-align:middle;"></span>${esc(n)}</span><span style="font-variant-numeric:tabular-nums;font-weight:600;">${String(fmt(byPers[n].total)).padStart(2,'0')}d</span></div>`;
  }).join('');
  return `<div class="ft">
    <div>
      <h4>Einsätze pro Crew</h4>
      <div class="ft-grid">${rows||'<span style="color:#888;font-style:italic;">—</span>'}</div>
    </div>
    <div class="ft-meta">
      <div><span class="ft-brand">TOUR/CREW</span> · ${viewLabel}</div>
      <div style="margin-top:4px;">* Reise &amp; OFF = 0,5 Tage · Andere = 1,0 Tag</div>
    </div>
  </div>`;
}

// ── TABLE VIEW ─────────────────────────────────────────────────────────────────
function pdfRenderTable(fd,selPos,selCrew){
  const css=`
  table{width:100%;border-collapse:collapse;margin-top:4px;font-size:8pt;}
  thead th{background:#f3f2ee;padding:5px 6px;text-align:left;font-size:7pt;font-weight:600;color:${PDF_COLORS.muted};text-transform:uppercase;letter-spacing:.18em;border-bottom:1px solid ${PDF_COLORS.ink};}
  thead th.ch{text-align:center;color:${PDF_COLORS.ink};font-weight:700;letter-spacing:.12em;}
  tbody tr{border-bottom:.5px solid ${PDF_COLORS.ruleSoft};}
  tbody tr:nth-child(even) td{background:${PDF_COLORS.paperAlt};}
  .dtd{padding:4px 8px;white-space:nowrap;position:relative;padding-left:10px;}
  .dtd .dtd-bar{position:absolute;left:0;top:3px;bottom:3px;width:3px;}
  .dtd .wd{color:${PDF_COLORS.muted};font-size:7pt;letter-spacing:.1em;text-transform:uppercase;margin-right:6px;}
  .ttd{padding:4px 6px;font-size:7.5pt;font-weight:700;letter-spacing:.1em;text-transform:uppercase;white-space:nowrap;}
  .ttd::before{content:"■";margin-right:4px;font-size:8pt;}
  .ltd{padding:4px 6px;font-family:'Archivo',sans-serif;font-weight:500;font-size:10pt;}
  .ctd{padding:4px 6px;text-align:center;font-size:8pt;white-space:nowrap;border-left:.5px solid ${PDF_COLORS.ruleSoft};}
  .ctd .dot{display:inline-block;width:5px;height:5px;margin-right:4px;vertical-align:middle;}
  .mrow td{background:#f3f2ee;color:${PDF_COLORS.ink};font-size:7pt;font-weight:700;text-transform:uppercase;letter-spacing:.2em;padding:4px 8px;border-top:1px solid ${PDF_COLORS.rule};border-bottom:1px solid ${PDF_COLORS.rule};}
  .offen{color:${PDF_COLORS.warn};font-weight:700;}
  .totrow td{background:#0e1013;color:#fff;padding:5px 6px;font-weight:700;font-size:8pt;text-align:center;border-top:2px solid ${PDF_COLORS.accent};letter-spacing:.08em;}
  .totrow td:first-child{text-align:left;color:${PDF_COLORS.accent};font-size:7pt;text-transform:uppercase;letter-spacing:.2em;}`;

  const byPos={};
  selPos.forEach(p=>{
    byPos[p.id]={filled:0,open:0};
    fd.forEach(r=>{const v=getVal(r.date,p.id),w=dw(r);if(v===OFFEN)byPos[p.id].open+=w;else if(v&&selCrew.has(v))byPos[p.id].filled+=w;});
  });
  let lastBlockId=null, rows='';
  fd.forEach(r=>{
    if(r.blockId&&r.blockId!==lastBlockId){lastBlockId=r.blockId;rows+=`<tr class="mrow"><td colspan="${3+selPos.length}">${r.blockName||'Block'}</td></tr>`;}
    const d=parseD(r.date);
    const wd=DE_DAYS[d.getDay()].toUpperCase();
    const dt=`${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}`;
    const tc=pdfTypeColor(r.type);
    rows+=`<tr>
      <td class="dtd"><span class="dtd-bar" style="background:${tc}"></span><span class="wd">${wd}</span>${dt}</td>
      <td class="ttd" style="color:${tc}">${r.typeLabel}</td>
      <td class="ltd">${r.loc||''}</td>`;
    rows+=selPos.map(p=>{
      const v=getVal(r.date,p.id);
      if(v===OFFEN)return `<td class="ctd"><span class="offen">⚠ OFFEN</span></td>`;
      if(v&&selCrew.has(v)){
        const ci=crew.indexOf(v),col=ci>=0?CREW_COLORS[ci%CREW_COLORS.length]:'#888';
        return `<td class="ctd"><span class="dot" style="background:${col}"></span>${esc(v)}</td>`;
      }
      if(v)return `<td class="ctd" style="color:${PDF_COLORS.mutedDim};">–</td>`;
      return `<td class="ctd"></td>`;
    }).join('');
    rows+='</tr>';
  });
  const totRow=`<tr class="totrow"><td colspan="3">Tage pro Position</td>${selPos.map(p=>{const{filled,open}=byPos[p.id];return`<td>${fmt(filled)}T${open>0?` <span style="color:${PDF_COLORS.warn};">⚠${fmt(open)}</span>`:''}</td>`;}).join('')}</tr>`;

  return {css, body:`<table>
    <thead><tr><th>Datum</th><th>Art</th><th>Ort / Venue</th>${selPos.map(p=>`<th class="ch">${p.short||p.label}</th>`).join('')}</tr></thead>
    <tbody>${rows}${totRow}</tbody>
  </table>`};
}

// ── BLOCKS VIEW ────────────────────────────────────────────────────────────────
function pdfRenderBlocks(fd,selCrew){
  const css=`
  .blk-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:6px;}
  .blk{background:${PDF_COLORS.paperAlt};border:1px solid ${PDF_COLORS.rule};border-left:3px solid ${PDF_COLORS.accent};padding:10px 12px;break-inside:avoid;}
  .blk.unassigned{grid-column:1/-1;border-style:dashed;}
  .blk-head{display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px solid ${PDF_COLORS.rule};padding-bottom:4px;margin-bottom:6px;}
  .blk-name{font-family:'Archivo',sans-serif;font-size:13pt;font-weight:800;letter-spacing:.03em;text-transform:uppercase;line-height:1;}
  .blk-id{font-size:7pt;color:${PDF_COLORS.muted};letter-spacing:.2em;text-transform:uppercase;font-weight:600;}
  .blk-dates{font-size:8pt;color:${PDF_COLORS.muted};margin-bottom:5px;letter-spacing:.06em;}
  .blk-dates strong{color:${PDF_COLORS.ink};font-weight:600;}
  .blk-k{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:${PDF_COLORS.rule};margin-bottom:6px;border:1px solid ${PDF_COLORS.rule};}
  .blk-k-c{background:#fff;padding:4px 6px;display:flex;gap:6px;align-items:baseline;}
  .blk-k-v{font-family:'Archivo',sans-serif;font-size:11pt;font-weight:700;line-height:1;font-variant-numeric:tabular-nums;}
  .blk-k-l{font-size:6.5pt;color:${PDF_COLORS.muted};text-transform:uppercase;letter-spacing:.18em;font-weight:600;}
  .blk-k-c.show .blk-k-v{color:${PDF_COLORS.show};}
  .blk-k-c.reise .blk-k-v{color:${PDF_COLORS.reise};}
  .blk-k-c.prep .blk-k-v{color:${PDF_COLORS.prep};}
  .blk-k-c.off .blk-k-v{color:${PDF_COLORS.off};}
  .blk-strip{display:flex;gap:1px;height:10px;margin-bottom:6px;}
  .blk-strip .d{flex:1;min-width:0;}
  .blk-strip .d.show{background:${PDF_COLORS.show};}
  .blk-strip .d.reise{background:${PDF_COLORS.reise};}
  .blk-strip .d.prep{background:${PDF_COLORS.prep};}
  .blk-strip .d.off{background:#c8cbd1;}
  .blk-venues{display:flex;flex-wrap:wrap;gap:3px;margin-bottom:6px;}
  .blk-venue{font-family:'Archivo',sans-serif;font-weight:500;font-size:8pt;background:#fff;border:1px solid ${PDF_COLORS.rule};padding:2px 6px;letter-spacing:.02em;}
  .blk-crew{display:grid;grid-template-columns:repeat(2,1fr);gap:2px 10px;font-size:8pt;}
  .blk-crew-row{display:grid;grid-template-columns:56px 1fr;gap:6px;align-items:center;}
  .blk-crew-pos{color:${PDF_COLORS.accent};font-size:7.5pt;font-weight:700;letter-spacing:.1em;text-transform:uppercase;}
  .blk-crew-v{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .blk-crew-v.offen{color:${PDF_COLORS.warn};font-weight:700;}
  .blk-crew-v.empty{color:${PDF_COLORS.mutedDim};font-style:italic;}
  .blk-crew-v .dot{display:inline-block;width:5px;height:5px;margin-right:4px;vertical-align:middle;}`;

  // Group by blockId
  const groups=new Map();
  fd.forEach(r=>{
    const key=r.blockId||'_none_';
    if(!groups.has(key))groups.set(key,{id:key,name:r.blockName||(key==='_none_'?'Ohne Block':'Block'), rows:[]});
    groups.get(key).rows.push(r);
  });
  const blocks=[...groups.values()];

  const cards=blocks.map(bl=>{
    const rows=bl.rows;
    const shows=rows.filter(r=>r.type==='show').length;
    const reise=rows.filter(r=>r.type==='reise').length;
    const prep=rows.filter(r=>r.type==='prep').length;
    const off=rows.filter(r=>r.type==='off').length;
    const pad=n=>String(n).padStart(2,'0');
    const d0=parseD(rows[0].date), dN=parseD(rows[rows.length-1].date);
    const dateStr=`${String(d0.getDate()).padStart(2,'0')}.${String(d0.getMonth()+1).padStart(2,'0')} – ${String(dN.getDate()).padStart(2,'0')}.${String(dN.getMonth()+1).padStart(2,'0')}.${dN.getFullYear()}`;
    const strip=rows.map(r=>`<div class="d ${r.type}" title="${r.date} · ${r.typeLabel}"></div>`).join('');
    const venues=[...new Set(rows.map(r=>r.loc).filter(Boolean))].slice(0,8).map(v=>`<span class="blk-venue">${v}</span>`).join('');
    // Crew per position — summarize
    const posAgg={};
    POSITIONS.forEach(p=>{
      const vals=new Map(); let openCnt=0;
      rows.forEach(r=>{const v=getVal(r.date,p.id);if(v===OFFEN)openCnt++;else if(v&&selCrew.has(v))vals.set(v,(vals.get(v)||0)+1);});
      posAgg[p.id]={vals,openCnt};
    });
    const crewHtml=POSITIONS.map(p=>{
      const {vals,openCnt}=posAgg[p.id];
      let body='';
      if(vals.size===0 && openCnt===0) body=`<span class="empty">—</span>`;
      else if(vals.size===0) body=`<span class="offen">⚠ ${openCnt} offen</span>`;
      else {
        const entries=[...vals.entries()].sort((a,b)=>b[1]-a[1]);
        const main=entries[0];
        const ci=crew.indexOf(main[0]),col=ci>=0?CREW_COLORS[ci%CREW_COLORS.length]:'#888';
        if(entries.length===1 && openCnt===0){
          body=`<span><span class="dot" style="background:${col}"></span>${esc(main[0])}</span>`;
        } else {
          const extra=entries.length>1?` +${entries.length-1}`:'';
          const openTag=openCnt>0?` <span class="offen">⚠${openCnt}</span>`:'';
          body=`<span><span class="dot" style="background:${col}"></span>${esc(main[0])}${extra}${openTag}</span>`;
        }
      }
      return `<div class="blk-crew-row"><span class="blk-crew-pos">${p.short||p.label}</span><span class="blk-crew-v">${body}</span></div>`;
    }).join('');
    const cls=bl.id==='_none_'?'unassigned':'';
    return `<div class="blk ${cls}">
      <div class="blk-head">
        <div>
          <div class="blk-name">${bl.name}</div>
          <div class="blk-dates"><strong>${dateStr}</strong> · ${rows.length} Tage</div>
        </div>
        <div class="blk-id">#${bl.id==='_none_'?'—':bl.id.slice(0,6)}</div>
      </div>
      <div class="blk-k">
        <div class="blk-k-c show"><span class="blk-k-v">${pad(shows)}</span><span class="blk-k-l">Shows</span></div>
        <div class="blk-k-c reise"><span class="blk-k-v">${pad(reise)}</span><span class="blk-k-l">Reise</span></div>
        <div class="blk-k-c prep"><span class="blk-k-v">${pad(prep)}</span><span class="blk-k-l">Prep</span></div>
        <div class="blk-k-c off"><span class="blk-k-v">${pad(off)}</span><span class="blk-k-l">OFF</span></div>
      </div>
      <div class="blk-strip">${strip}</div>
      ${venues?`<div class="blk-venues">${venues}</div>`:''}
      <div class="blk-crew">${crewHtml}</div>
    </div>`;
  }).join('');

  return {css, body:`<div class="blk-grid">${cards}</div>`};
}

// ── CREW VIEW ──────────────────────────────────────────────────────────────────
function pdfRenderCrew(fd,selCrew){
  const css=`
  .crew-row{border:1px solid ${PDF_COLORS.rule};border-left:3px solid ${PDF_COLORS.accent};margin-bottom:8px;break-inside:avoid;background:${PDF_COLORS.paperAlt};}
  .crew-row.off{opacity:.6;}
  .cr-head{display:grid;grid-template-columns:180px 1fr auto;gap:12px;align-items:center;padding:8px 12px;border-bottom:1px solid ${PDF_COLORS.rule};background:#fff;}
  .cr-dot{width:10px;height:10px;display:inline-block;margin-right:8px;vertical-align:middle;}
  .cr-name{font-family:'Archivo',sans-serif;font-size:14pt;font-weight:800;letter-spacing:.03em;text-transform:uppercase;line-height:1;}
  .cr-pos{font-size:7pt;color:${PDF_COLORS.accent};letter-spacing:.14em;text-transform:uppercase;margin-top:2px;font-weight:700;}
  .cr-kpis{display:flex;gap:16px;font-size:8pt;color:${PDF_COLORS.muted};text-transform:uppercase;letter-spacing:.1em;font-weight:600;}
  .cr-kpis strong{color:${PDF_COLORS.ink};font-family:'Archivo',sans-serif;font-size:11pt;font-weight:700;margin-right:3px;}
  .cr-kpis .kshow strong{color:${PDF_COLORS.show};}
  .cr-kpis .kreise strong{color:${PDF_COLORS.reise};}
  .cr-kpis .kprep strong{color:${PDF_COLORS.prep};}
  .cr-tl{padding:8px 12px;}
  .cr-tl-bar{display:flex;gap:0;height:12px;border:1px solid ${PDF_COLORS.rule};overflow:hidden;}
  .cr-tl-c{flex:1;min-width:0;}
  .cr-tl-c.empty{background:#f5f4ee;}
  .cr-tl-c.show{background:${PDF_COLORS.show};}
  .cr-tl-c.reise{background:${PDF_COLORS.reise};}
  .cr-tl-c.prep{background:${PDF_COLORS.prep};}
  .cr-tl-c.off{background:#c8cbd1;}
  .cr-tl-lbls{display:flex;font-size:6.5pt;color:${PDF_COLORS.muted};letter-spacing:.14em;text-transform:uppercase;margin-top:4px;font-weight:600;}
  .cr-tl-lbl{flex:1;min-width:0;padding:0 3px;overflow:hidden;}
  .cr-assign{padding:6px 12px 10px;font-size:8pt;color:${PDF_COLORS.muted};display:flex;gap:10px;flex-wrap:wrap;}
  .cr-assign strong{color:${PDF_COLORS.ink};font-weight:600;}`;

  // Find dates per crew
  const byPerson=new Map();
  [...selCrew].forEach(name=>byPerson.set(name,{dates:new Map(),positions:new Set(),show:0,reise:0,prep:0,off:0}));
  fd.forEach(r=>{
    POSITIONS.forEach(p=>{
      const v=getVal(r.date,p.id);
      if(!v||v===OFFEN||!selCrew.has(v))return;
      const rec=byPerson.get(v);
      if(!rec)return;
      rec.positions.add(p.id);
      if(!rec.dates.has(r.date))rec.dates.set(r.date,r.type);
    });
  });
  byPerson.forEach(rec=>{
    rec.dates.forEach(t=>{rec[t]=(rec[t]||0)+1;});
  });

  // Month labels
  const monthsSet=new Set(); fd.forEach(r=>monthsSet.add(r.date.slice(0,7)));
  const months=[...monthsSet].sort();
  const monthLabels=months.map(ym=>{const[y,m]=ym.split('-');return {ym, label:DE_MON[parseInt(m,10)-1]+' '+y.slice(2)};});

  const rows=[...byPerson.entries()].sort((a,b)=>b[1].dates.size - a[1].dates.size).map(([name,rec])=>{
    const ci=crew.indexOf(name),col=ci>=0?CREW_COLORS[ci%CREW_COLORS.length]:'#888';
    const posList=[...rec.positions].map(pid=>{const p=POSITIONS.find(x=>x.id===pid);return p?(p.short||p.label):'';}).filter(Boolean).join(' · ');
    const cells=fd.map(r=>{const t=rec.dates.get(r.date);return t?`<div class="cr-tl-c ${t}" title="${r.date}"></div>`:`<div class="cr-tl-c empty"></div>`;}).join('');
    const lbls=monthLabels.map(ml=>{const n=fd.filter(r=>r.date.startsWith(ml.ym)).length;return `<div class="cr-tl-lbl" style="flex:${n||1};">${ml.label}</div>`;}).join('');
    const total=rec.dates.size;
    const assignList=[...rec.dates.keys()].slice(0,12).map(d=>{const dObj=parseD(d);return `<span>${String(dObj.getDate()).padStart(2,'0')}.${String(dObj.getMonth()+1).padStart(2,'0')}</span>`;}).join(' · ');
    return `<div class="crew-row">
      <div class="cr-head">
        <div><span class="cr-dot" style="background:${col}"></span><span style="display:inline-block;vertical-align:middle;"><div class="cr-name">${esc(name)}</div><div class="cr-pos">${esc(posList||'—')}</div></span></div>
        <div class="cr-kpis">
          <span class="kshow"><strong>${String(rec.show||0).padStart(2,'0')}</strong>Shows</span>
          <span class="kreise"><strong>${String(rec.reise||0).padStart(2,'0')}</strong>Reise</span>
          <span class="kprep"><strong>${String(rec.prep||0).padStart(2,'0')}</strong>Prep</span>
          <span><strong>${String(total).padStart(2,'0')}</strong>Gesamt</span>
        </div>
        <div></div>
      </div>
      <div class="cr-tl">
        <div class="cr-tl-bar">${cells}</div>
        ${monthLabels.length>1?`<div class="cr-tl-lbls">${lbls}</div>`:''}
      </div>
      ${total>0?`<div class="cr-assign"><strong>Einsätze:</strong> ${assignList}${total>12?` · <strong>+${total-12}</strong> weitere`:''}</div>`:''}
    </div>`;
  }).join('');

  return {css, body: rows || `<div style="padding:40px;text-align:center;color:${PDF_COLORS.muted};">Keine Zuweisungen für die gewählten Filter.</div>`};
}

// ── MAIN GENERATE ──────────────────────────────────────────────────────────────
export async function generatePDF(){
  // Fenster sofort öffnen (synchron, im User-Gesture-Kontext) → Popup-Blocker umgehen
  if(!POSITIONS?.length||!TOUR_DATES?.length){showToast('Kein Plan geladen','#e84a4a');return;}
  const win=window.open('','_blank');
  if(!win){showToast('Popup blockiert — Popups für diese Seite erlauben','#e84a4a');return;}

  const selPosRaw=[...document.querySelectorAll('.pdfcb')].filter(c=>c.checked).map(c=>POSITIONS[+c.dataset.idx]);
  const selCrewRaw=[...document.querySelectorAll('.pdfcrewcb')].filter(c=>c.checked).map(c=>crew[+c.dataset.idx]);
  const selPos=selPosRaw.length>0?selPosRaw:POSITIONS;
  const selCrew=selCrewRaw.length>0?new Set(selCrewRaw):new Set(crew);
  const typeSet=new Set();
  if(document.getElementById('pdfShow').checked)typeSet.add('show');
  if(document.getElementById('pdfReise').checked)typeSet.add('reise');
  if(document.getElementById('pdfPrep').checked)typeSet.add('prep');
  if(document.getElementById('pdfOff').checked)typeSet.add('off');

  closeModal('pdfModal');

  const fd=TOUR_DATES.filter(r=>typeSet.has(r.type));
  if(!fd.length){win.close();showToast('Keine Daten für die gewählten Filter','#e84a4a');return;}

  try{
    // byPers for footer
    const byPers={};
    fd.forEach(r=>{
      const w=dw(r);
      selPos.forEach(p=>{
        const v=getVal(r.date,p.id);
        if(!v||v===OFFEN||!selCrew.has(v))return;
        if(!byPers[v])byPers[v]={total:0,show:0,other:0};
        if(r.type==='show'){byPers[v].total+=w;byPers[v].show+=w;}else{byPers[v].total+=w;byPers[v].other+=w;}
      });
    });
    // totalOpen
    let totalOpen=0;
    selPos.forEach(p=>{fd.forEach(r=>{const v=getVal(r.date,p.id),w=dw(r);if(v===OFFEN)totalOpen+=w;});});

    const dates=fd.map(r=>r.date).sort();
    const s=parseD(dates[0]),e=parseD(dates[dates.length-1]);
    const rangeStr=`${String(s.getDate()).padStart(2,'0')}.${String(s.getMonth()+1).padStart(2,'0')} – ${String(e.getDate()).padStart(2,'0')}.${String(e.getMonth()+1).padStart(2,'0')}.${e.getFullYear()}`;

    let viewResult, viewLabel;
    if(PDF_VIEW==='blocks'){ viewResult=pdfRenderBlocks(fd,selCrew); viewLabel='Blöcke'; }
    else if(PDF_VIEW==='crew'){ viewResult=pdfRenderCrew(fd,selCrew); viewLabel='Crew-Timeline'; }
    else { viewResult=pdfRenderTable(fd,selPos,selCrew); viewLabel='Tabelle'; }

    const planName=(()=>{try{const p=(typeof getPlansIndex==='function')?getPlansIndex():[];const a=p.find(x=>x.id===getActivePlanId());return a?a.name:'';}catch(e){return '';}})();
    const html=`<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><title>Tour/Crew Plan</title>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Archivo:wght@500;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>${pdfSharedCSS()}${viewResult.css}</style></head><body>
<div class="page">
  ${pdfHeaderHTML(planName,rangeStr,1,1)}
  ${pdfKPIStripHTML(fd,totalOpen)}
  ${viewResult.body}
  ${pdfFooterHTML(byPers,selCrew,viewLabel)}
  <div class="hint"><strong>▶ Cmd+P / Strg+P</strong> → "Als PDF speichern" · <strong>Querformat A4</strong> · Kopf-/Fußzeilen im Druckdialog deaktivieren.</div>
</div>
<script>window.onload=()=>setTimeout(()=>window.print(),500);<\/script>
</body></html>`;
    win.document.write(html);
    win.document.close();
  }catch(err){
    win.document.write(`<pre style="font-family:monospace;padding:20px;color:red;">PDF-Fehler: ${err.message}\n\n${err.stack||''}</pre>`);
    win.document.close();
    console.error('generatePDF error:',err);
  }
}
