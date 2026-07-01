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

// Rohe crew_members (aus allen Plänen) zu einer tour-übergreifenden Liste zusammenführen.
// Identität = E-MAIL (lowercase), wenn vorhanden — sonst normalisierter Name. So bleiben
// zwei GLEICHNAMIGE mit VERSCHIEDENEN Mails getrennt (z.B. „Marco Hoch" Admin vs. GL-Crew);
// früher wurden sie über den Namen verschmolzen und die falsche Mail übernommen (v0.19.1).
// Gleiche Mail (auch bei abweichender Schreibweise) → ein Eintrag. Rückgabe: [{name, email}]
// alphabetisch.
export function dedupKnownCrew(records){
  const byKey = new Map();
  for(const r of (records||[])){
    const name=String(r&&r.name!=null?r.name:'').trim();
    if(!name) continue;
    const email=String(r&&r.email!=null?r.email:'').trim();
    const key = email ? ('e:'+email.toLowerCase()) : ('n:'+normCrewName(name));
    if(!byKey.has(key)) byKey.set(key,{name,email});   // erster Treffer bleibt
  }
  return [...byKey.values()].sort((a,b)=>normCrewName(a.name)<normCrewName(b.name)?-1:normCrewName(a.name)>normCrewName(b.name)?1:0);
}
