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

// E-Mail normalisieren (trim + lowercase) — PocketBase-Filter `=` ist case-sensitiv (SQLite
// BINARY), Mails werden daher überall klein gespeichert (v0.15.0). Genutzt beim Pool-Anlegen
// (createPoolMember) vor dem server-seitigen Dublettencheck.
export function normEmail(s){ return String(s==null?'':s).trim().toLowerCase(); }

// Rohe crew_members (aus allen Plänen) zu einer tour-übergreifenden Liste zusammenführen.
// Identität = E-MAIL (lowercase), wenn vorhanden — sonst normalisierter Name. So bleiben
// zwei GLEICHNAMIGE mit VERSCHIEDENEN Mails getrennt (z.B. „Marco Hoch" Admin vs. GL-Crew);
// früher wurden sie über den Namen verschmolzen und die falsche Mail übernommen (v0.19.1).
// Gleiche Mail (auch bei abweichender Schreibweise) → ein Eintrag. Rückgabe: [{name, email}]
// alphabetisch.
// ⚠️ `pool:true` markiert den Stammdatensatz (crew_members mit plan_id="__pool__"). Er gewinnt
// IMMER gegen einen Tour-Eintrag derselben Adresse.
//
// Ohne diesen Vorrang hing es an der Reihenfolge, die der Server liefert — und die kam aus
// `sort=-id`. PocketBase-IDs sind Zufallsketten, keine laufenden Nummern: Welcher Datensatz
// überlebte, war damit Würfeln. Folge (gemeldet am 15.08.2026): Eine frisch unter „Benutzer"
// angelegte Person war im Pool-Dialog der Tour nicht zu finden, weil ein älterer Tour-Eintrag
// mit derselben Adresse und einem anderen Namen sie verdeckte.
export function dedupKnownCrew(records){
  const byKey = new Map();
  for(const r of (records||[])){
    const name=String(r&&r.name!=null?r.name:'').trim();
    if(!name) continue;
    const email=String(r&&r.email!=null?r.email:'').trim();
    const pool=!!(r&&r.pool);
    const key = email ? ('e:'+email.toLowerCase()) : ('n:'+normCrewName(name));
    const da = byKey.get(key);
    // Erster Treffer bleibt — außer der neue ist der Pool-Eintrag und der bisherige nicht.
    if(!da || (pool && !da.pool)) byKey.set(key,{name,email,pool});
  }
  return [...byKey.values()].sort((a,b)=>normCrewName(a.name)<normCrewName(b.name)?-1:normCrewName(a.name)>normCrewName(b.name)?1:0);
}

// Vereintes Crew-Verzeichnis (v0.23.0): users ∪ crew_members per E-Mail zusammenführen.
// Schlüssel = normEmail(email), sonst 'n:'+normCrewName(name). plans = [{id,name}] löst Tour-Namen
// auf; crew_members mit plan_id="__pool__" = globaler Pool, sonst Tour-Zugehörigkeit.
// Rückgabe je Person: {key,name,email,role,account:{id,verified}|null,pool:{id}|null,
//   tours:[{crewMemberId,planId,planName,name}]} — alphabetisch nach Name.
export function mergeCrewDirectory(users, crewMembers, plans){
  const planName = {};
  for(const p of (plans||[])) if(p && p.id!=null) planName[p.id] = p.name || p.id;

  const byKey = new Map();
  const ensure = (key) => {
    if(!byKey.has(key)) byKey.set(key, {
      key, name:'', email:'', role:'',
      account:null, pool:null, tours:[],
      _nameUser:'', _namePool:'', _nameTour:'', _roleUser:'', _rolePool:'',
    });
    return byKey.get(key);
  };

  for(const u of (users||[])){
    if(!u) continue;
    const email = String(u.email==null?'':u.email).trim();
    if(!email) continue;                       // Konto ohne Mail nicht sinnvoll mergebar
    const e = ensure('e:'+normEmail(email));
    if(!e.email) e.email = email;
    e.account = { id: u.id, verified: !!u.verified };
    e._nameUser = String(u.name==null?'':u.name).trim();
    e._roleUser = String(u.role==null?'':u.role).trim();
  }

  for(const m of (crewMembers||[])){
    if(!m) continue;
    const name  = String(m.name==null?'':m.name).trim();
    const email = String(m.email==null?'':m.email).trim();
    if(!name && !email) continue;
    const key = email ? ('e:'+normEmail(email)) : ('n:'+normCrewName(name));
    const e = ensure(key);
    if(!e.email && email) e.email = email;
    if(m.plan_id === '__pool__'){
      e.pool = { id: m.id };
      if(name) e._namePool = name;
      const r = String(m.role==null?'':m.role).trim();
      if(r) e._rolePool = r;
    } else {
      e.tours.push({ crewMemberId: m.id, planId: m.plan_id, planName: planName[m.plan_id] || m.plan_id, name });
      if(name && !e._nameTour) e._nameTour = name;
    }
  }

  const out = [];
  for(const e of byKey.values()){
    e.name = e._namePool || e._nameTour || e._nameUser || '';
    e.role = e._roleUser || e._rolePool || 'crew';
    delete e._nameUser; delete e._namePool; delete e._nameTour; delete e._roleUser; delete e._rolePool;
    out.push(e);
  }
  return out.sort((a,b)=>{
    const an=normCrewName(a.name||a.email), bn=normCrewName(b.name||b.email);
    return an<bn?-1:an>bn?1:0;
  });
}

// Einen Crew-Namen in einem plan_data-Objekt ersetzen (crew[]/defaultCrew{}/assignments{}) —
// immutabel (gibt neues Objekt zurück, mutiert die Eingabe nicht). Andere Felder bleiben.
// Spiegelt die App-Mutationen aus crew.js renameCrew.
export function renameInPlanData(planData, oldName, newName){
  const pd = planData || {};
  const crew = (pd.crew||[]).map(n => n===oldName ? newName : n);
  const defaultCrew = {};
  for(const k of Object.keys(pd.defaultCrew||{})){
    defaultCrew[k] = pd.defaultCrew[k]===oldName ? newName : pd.defaultCrew[k];
  }
  const assignments = {};
  for(const d of Object.keys(pd.assignments||{})){
    const day = pd.assignments[d] || {};
    const nd = {};
    for(const p of Object.keys(day)) nd[p] = day[p]===oldName ? newName : day[p];
    assignments[d] = nd;
  }
  return Object.assign({}, pd, { crew, defaultCrew, assignments });
}

// Welche Tage kommen in den ICS-Export? NUR Tage mit mindestens einem BESTÄTIGTEN Einsatz.
// tourDates: [{date,...}] (Reihenfolge bleibt), positions: [{id,label,short}],
// statuses: assignmentStatuses = { date: { posId: {status, crewName} } }.
// opts.onlyCrew + opts.myName → nur eigene bestätigte Slots (sameCrew). opts.allowTypes
// (optional Set von r.type) → zusätzlicher Typ-Filter.
// Rückgabe: [{date, confirmed:[{posLabel, crewName}]}] — Tage ohne bestätigte Slots fallen raus.
// Kalender-Status eines Einsatzes → Klartext fürs Infofeld. Bewusst hier (statt in
// utils.js), damit Download UND Server-Feed dieselbe Formulierung nutzen können.
export const ICS_STATUS_LABEL = { confirmed:'Bestätigt', proposed:'Angefragt', pencilled:'Vorgemerkt' };

// Welche Status landen im Kalender — und in welcher Rangfolge sie den Tagesstatus
// bestimmen (bestätigt schlägt vorgemerkt). 'declined'/'cancelled'/'cancel_acked'
// fehlen bewusst: abgesagte Einsätze gehören in keinen Kalender.
const _ICS_RANK = { confirmed:2, pencilled:1 };

export function icsExportRows(tourDates, positions, statuses, opts){
  const o = opts || {};
  const posLabel = {};
  for(const p of (positions||[])) posLabel[p.id] = p.label || p.short || p.id;
  const out = [];
  for(const row of (tourDates||[])){
    if(o.allowTypes && !o.allowTypes.has(row.type)) continue;
    const day = (statuses||{})[row.date] || {};
    const slots = [];
    let best = 0, dayStatus = '';
    for(const posId of Object.keys(day)){
      const si = day[posId];
      const rank = si ? _ICS_RANK[si.status] : 0;
      if(!rank) continue;
      if(o.onlyCrew && !sameCrew(si.crewName, o.myName)) continue;
      slots.push({ posLabel: posLabel[posId] || posId, crewName: si.crewName || '', status: si.status });
      if(rank > best){ best = rank; dayStatus = si.status; }
    }
    if(slots.length) out.push({ date: row.date, status: dayStatus, slots });
  }
  return out;
}

// Persönlicher Crew-ICS: pro Tag NUR Band (SUMMARY) + Ort (LOCATION) + Art/Status
// (DESCRIPTION). KEINE Positions-/Crew-Namen. rows = icsExportRows-Ausgabe (Datum +
// Tagesstatus genutzt), dateMeta = { date: {loc, typeLabel, type} }.
// Rückgabe: kompletter .ics-Text.
export function crewIcsContent(band, rows, dateMeta){
  const esc = s => String(s==null?'':s).replace(/([,;\\])/g,'\\$1').replace(/\n/g,'\\n');
  const bandName = String(band||'Tour').trim() || 'Tour';
  const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Tour Crew Plan//v2.0//DE','CALSCALE:GREGORIAN','METHOD:PUBLISH'];
  for(const r of (rows||[])){
    const meta = (dateMeta||{})[r.date] || {};
    const loc = meta.loc || '';
    const art = meta.typeLabel || meta.type || '';
    const dtStart = String(r.date).replace(/-/g,'');
    const [y,m,d] = String(r.date).split('-').map(Number);
    const nx = new Date(y, (m||1)-1, (d||1)+1);
    const dtEnd = `${nx.getFullYear()}${String(nx.getMonth()+1).padStart(2,'0')}${String(nx.getDate()).padStart(2,'0')}`;
    // Sichtbarer Kalender-Titel = „Art: Ort" (Bandname wandert in die Beschreibung).
    const title = [art, loc].filter(Boolean).join(': ') || bandName;
    // Status ins Infofeld (v0.5.0): vorgemerkte Termine bleiben im Kalender, sind aber
    // als unverbindlich erkennbar — sichtbar im Text UND als VEVENT-STATUS.
    const stLabel = ICS_STATUS_LABEL[r.status] || '';
    const desc = 'Band: '+bandName+'\nArt: '+art+'\nOrt: '+loc + (stLabel ? '\nStatus: '+stLabel : '');
    lines.push(
      'BEGIN:VEVENT',
      `DTSTART;VALUE=DATE:${dtStart}`,
      `DTEND;VALUE=DATE:${dtEnd}`,
      `SUMMARY:${esc(title)}`,
      `LOCATION:${esc(loc)}`,
      `DESCRIPTION:${esc(desc)}`,
      `STATUS:${r.status === 'confirmed' ? 'CONFIRMED' : 'TENTATIVE'}`,
      `UID:${r.date}-${Math.random().toString(36).slice(2)}@tourcrewplan`,
      'END:VEVENT'
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

// Abo-URLs für den persönlichen Kalender-Feed (v0.27.0, ab v0.27.1 tour-spezifisch).
// baseUrl = POCKETBASE_URL (https://…), token = users.feed_token, planId = PB-Plan-ID der
// AKTUELLEN Tour → Feed enthält NUR die Termine dieser Tour. Rückgabe { https, webcal }:
//   https  → für Google Calendar („Per URL hinzufügen").
//   webcal → Ein-Tipp-Abo (Apple/iOS/Android/Outlook) — gleiche URL, nur webcal://-Schema.
export function feedUrls(baseUrl, token, planId){
  const base = String(baseUrl==null?'':baseUrl).replace(/\/+$/, '');
  const https = base + '/ics/' + encodeURIComponent(String(token==null?'':token))
                     + '/' + encodeURIComponent(String(planId==null?'':planId));
  const webcal = https.replace(/^https?:\/\//, 'webcal://');
  return { https, webcal };
}

// Umgebungs-Auswahl der PocketBase-API nach Hostname (v0.31.0). Test (GitHub Pages) und
// Live (Hetzner) laufen mit demselben Frontend-Code, aber je einer EIGENEN PocketBase.
// Sicherheits-Default „im Zweifel Test": NUR der exakte Live-Host bekommt die Live-API;
// GitHub Pages, localhost und jeder unbekannte Host fallen auf die Test-API zurück, damit
// nie versehentlich in die Live-DB geschrieben wird. Reines Leaf → in HTML-Kopf-Skripten
// wortgleich inline dupliziert (wie getNavUrl), hier die kanonische, getestete Fassung.
export function pickApiUrl(host){
  if (host === 'crewplanner.nyxlightwork.de' || host === 'www.crewplanner.nyxlightwork.de')
    return 'https://api.crewplanner.nyxlightwork.de';
  return 'https://api-test.crewplanner.nyxlightwork.de';
}

// „Heute"-Marker für die Tourtabelle (v0.25.0). Bestimmt, wo die Heute-Linie sitzt.
// dateList = alle Tourtag-Daten ("YYYY-MM-DD", Reihenfolge egal), todayISO = heute lokal.
// ISO-Strings vergleichen lexikografisch = chronologisch → robust auch unsortiert.
// Rückgabe { today, next }:
//   today = todayISO, falls heute ein exakter Tourtag ist, sonst null.
//   next  = kleinstes Datum > todayISO (nur relevant wenn today===null → Strich sitzt dann
//           zwischen letztem vergangenem und erstem kommendem Tag; vor Tourbeginn = erster Tag).
//   Nach Tourende (alle Tage < heute) → { today:null, next:null } (kein Strich).
export function todayMarkers(dateList, todayISO){
  let today = null, next = null;
  for(const raw of (dateList||[])){
    const d = String(raw==null?'':raw);
    if(!d) continue;
    if(d === todayISO){ today = todayISO; }
    else if(d > todayISO){ if(next === null || d < next) next = d; }
  }
  if(today !== null) next = null;   // exakter Tag hat Vorrang → kein separater „nextday"-Strich
  return { today, next };
}
