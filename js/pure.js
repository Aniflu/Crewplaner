// ── Reine Hilfsfunktionen (KEINE Imports!) ───────────────────────────────────
// Dependency-freies Leaf-Modul → headless in Node testbar (tests/pure.test.mjs).
// Hier nur zeitzonensichere Datums-Helfer + toleranter Namensvergleich.

// Lokales Datum → "YYYY-MM-DD" (NICHT toISOString — das rechnet in UTC und
// verschiebt bei UTC+x lokale Mitternacht auf den Vortag).
export function toISODate(d){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// Alle Kalendertage von fromISO bis einschließlich toISO als "YYYY-MM-DD".
// Leeres Array bei ungültigem/umgekehrtem Bereich.
export function eachDateInRange(fromISO, toISO){
  const out=[];
  if(!fromISO||!toISO) return out;
  const [fy,fm,fd]=fromISO.split('-').map(Number);
  const [ty,tm,td]=toISO.split('-').map(Number);
  const cur=new Date(fy, fm-1, fd);
  const end=new Date(ty, tm-1, td);
  while(cur<=end){
    out.push(toISODate(cur));
    cur.setDate(cur.getDate()+1);
  }
  return out;
}

// Crew-Namen tolerant vergleichen (trim + case-insensitiv)
// — Quelle: crew[] vs assignments.crew_name.
export function normCrewName(s){ return String(s==null?'':s).trim().toLowerCase(); }
export function sameCrew(a,b){ return normCrewName(a)===normCrewName(b); }

// Rohe crew_members (aus allen Plänen) zu einer tour-übergreifenden Liste zusammenführen:
// gleiche Namen (normCrewName) verschmelzen, dabei einen Eintrag MIT nicht-leerer E-Mail
// bevorzugen. Rückgabe: [{name, email}] alphabetisch (locale-unabhängig case-insensitiv).
export function dedupKnownCrew(records){
  const byKey = new Map();
  for(const r of (records||[])){
    const name=String(r&&r.name!=null?r.name:'').trim();
    if(!name) continue;
    const email=String(r&&r.email!=null?r.email:'').trim();
    const key=normCrewName(name);
    const prev=byKey.get(key);
    if(!prev){ byKey.set(key,{name,email}); continue; }
    // Ersten mit E-Mail behalten; sonst ersten Namen behalten.
    if(!prev.email && email){ prev.email=email; }
  }
  return [...byKey.values()].sort((a,b)=>normCrewName(a.name)<normCrewName(b.name)?-1:normCrewName(a.name)>normCrewName(b.name)?1:0);
}
