// Crew Management
function renderCrew(){
  const el=document.getElementById('crewList');
  el.innerHTML='';
  const hdr=document.getElementById('crewHeading');
  if(hdr)hdr.textContent='Crew — '+crew.length;
  crew.forEach((name,i)=>{
    // count days assigned to this person
    let days=0;
    TOUR_DATES.forEach(r=>{POSITIONS.forEach(p=>{if(getVal(r.date,p.id)===name)days++;});});
    const d=document.createElement('div');
    d.className='crew-member';
    d.innerHTML=`<div class="crew-dot" style="background:${CREW_COLORS[i%CREW_COLORS.length]}"></div>`
      +`<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${name}</span>`
      +`<span class="crew-days">${String(days).padStart(2,'0')}d</span>`
      +`<button class="sm danger" onclick="removeCrew(${i})" title="Entfernen">×</button>`;
    el.appendChild(d);
  });
  // Positions list - use row-style format to match .sb-pos CSS
  const posEl=document.getElementById('posList');
  posEl.innerHTML=POSITIONS.map((p,i)=>
    `<div class="sb-pos" onclick="openRenamePos(${i})" title="Position umbenennen">
      <span class="sb-pos-short">${p.short||''}</span>
      <span class="sb-pos-label">${p.label}</span>
    </div>`).join('');
}

function addCrew(){const inp=document.getElementById('newCrewName');const n=inp.value.trim();if(!n)return;crew.push(n);inp.value='';renderCrew();}

function removeCrew(i){const name=crew[i];crew.splice(i,1);Object.keys(assignments).forEach(d=>{Object.keys(assignments[d]||{}).forEach(p=>{if(assignments[d][p]===name)delete assignments[d][p];});});renderCrew();renderTable();}
