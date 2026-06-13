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
