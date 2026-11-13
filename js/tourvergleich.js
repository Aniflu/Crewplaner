// Tourvergleich (v1.2.0): reine Logik zum Vergleichen zweier Touren (Pläne A und B).
// DOM-frei; Eingaben werden nie mutiert. Plan = geparste PB-Form
// { crew, positions, defaultCrew, tourDates, assignments }.
import { OFFEN, OFFDAY, REISE_TAG, AUSSCHREIBEN } from './state.js';
import { sameCrew, normCrewName } from './pure.js';

const PLATZHALTER = [OFFEN, OFFDAY, REISE_TAG, AUSSCHREIBEN];

// Echte Person = nicht leer und kein Platzhalter.
export function isPerson(v){ return !!v && !PLATZHALTER.includes(v); }

const _pos = plan => (plan && plan.positions) || [];
const _dates = plan => ((plan && plan.tourDates) || []).map(t => t.date);
const _hasDay = (plan, date) => _dates(plan).includes(date);

// Wie getVal (js/utils.js) für einen beliebigen Plan: Abweichung (auch '') vor Stammbesetzung.
export function effective(plan, date, posId){
  const day = plan && plan.assignments && plan.assignments[date];
  if(day && posId in day){
    const v = day[posId];
    return (v === null || v === undefined) ? '' : v;
  }
  return ((plan && plan.defaultCrew) || {})[posId] || '';
}

// Sortierte ISO-Daten, die in beiden Touren vorkommen.
export function overlapDays(a, b){
  const inB = new Set(_dates(b));
  return [...new Set(_dates(a))].filter(d => inB.has(d)).sort();
}

// posIds, auf denen `name` an `date` effektiv steht (leer, wenn der Tag nicht zur Tour gehört).
export function slotsOf(plan, date, name){
  if(!_hasDay(plan, date)) return [];
  return _pos(plan).map(p => p.id).filter(id => {
    const v = effective(plan, date, id);
    return isPerson(v) && sameCrew(v, name);
  });
}

// Personen-Raster. Zustand je Zelle: conflict | A | B | freeBoth | freeA | freeB | none.
export function personMatrix(a, b, { days, onlyShared } = {}){
  const list = [];
  const byKey = new Map();
  const add = (plan, which) => {
    ((plan && plan.crew) || []).forEach(n => {
      if(!isPerson(String(n == null ? '' : n).trim())) return;
      const key = normCrewName(n);
      let e = byKey.get(key);
      if(!e){ e = { name: String(n).trim(), inA: false, inB: false }; byKey.set(key, e); list.push(e); }
      e[which] = true;
    });
  };
  add(a, 'inA'); add(b, 'inB');   // Name aus A bevorzugt (A wird zuerst angelegt)
  const shared = list.filter(p => p.inA && p.inB);
  const rest = onlyShared ? [] : list.filter(p => !(p.inA && p.inB));
  const people = [...shared, ...rest];
  const cells = {};
  people.forEach(p => {
    cells[p.name] = {};
    (days || []).forEach(d => {
      const aPos = slotsOf(a, d, p.name), bPos = slotsOf(b, d, p.name);
      let state;
      if(aPos.length && bPos.length) state = 'conflict';
      else if(aPos.length) state = 'A';
      else if(bPos.length) state = 'B';
      else {
        const da = _hasDay(a, d), db = _hasDay(b, d);
        state = da && db ? 'freeBoth' : da ? 'freeA' : db ? 'freeB' : 'none';
      }
      cells[p.name][d] = { state, aPos, bPos };
    });
  });
  return { people, cells };
}

// Bedarf eines Tages: total = Positionen, open = Positionen ohne Person (leer/OFFEN/AUSSCHREIBEN).
export function dayDemand(plan, date){
  if(!_hasDay(plan, date)) return { total: 0, open: 0 };
  const ids = _pos(plan).map(p => p.id);
  const open = ids.filter(id => {
    const v = effective(plan, date, id);
    return v === '' || v === OFFEN || v === AUSSCHREIBEN;
  }).length;
  return { total: ids.length, open };
}

// Kandidaten für einen Slot aus der Crew von `self`: free → other → same.
// same = steht in self am Tag schon auf anderer Position; other = steht in der anderen Tour.
export function candidates(self, other, date, posId){
  const cur = effective(self, date, posId);
  const out = [];
  const seen = new Set();
  ((self && self.crew) || []).forEach(n => {
    const name = String(n == null ? '' : n).trim();
    const key = normCrewName(name);
    if(!isPerson(name) || seen.has(key)) return;
    seen.add(key);
    if(isPerson(cur) && sameCrew(cur, name)) return;
    const otherPos = slotsOf(other, date, name);
    const kind = slotsOf(self, date, name).length ? 'same' : otherPos.length ? 'other' : 'free';
    out.push({ name, kind, otherPos });
  });
  const rank = { free: 0, other: 1, same: 2 };
  return out.map((c, i) => [c, i]).sort((x, y) => rank[x[0].kind] - rank[y[0].kind] || x[1] - y[1]).map(x => x[0]);
}

// Besetzung eines Slots setzen (tiefe Kopie). Gleich der Stammbesetzung → Abweichung entfernen.
export function applySlot(planData, date, posId, value){
  const r = JSON.parse(JSON.stringify(planData || {}));
  if(!r.assignments) r.assignments = {};
  if(value === ((r.defaultCrew || {})[posId] || '')){
    if(r.assignments[date]){
      delete r.assignments[date][posId];
      if(!Object.keys(r.assignments[date]).length) delete r.assignments[date];
    }
  } else {
    if(!r.assignments[date]) r.assignments[date] = {};
    r.assignments[date][posId] = value;
  }
  return r;
}

// Konflikt auflösen: `name` bleibt in `keep`, alle Plätze in der anderen Tour werden OFFEN.
export function planMove({ a, b, date, name, keep }){
  const tour = keep === 'A' ? 'B' : 'A';
  const plan = tour === 'A' ? a : b;
  return slotsOf(plan, date, name).map(posId => ({ tour, posId, value: OFFEN }));
}

// Slot besetzen; steht die Person in der anderen Tour am Tag, werden dort deren Plätze OFFEN.
// name === null → zurück zur Stammbesetzung.
export function planAssign({ self, other, selfTour, date, posId, name }){
  const value = name === null ? (((self && self.defaultCrew) || {})[posId] || '') : name;
  const steps = [{ tour: selfTour, posId, value }];
  if(name !== null && isPerson(name)){
    const otherTour = selfTour === 'A' ? 'B' : 'A';
    slotsOf(other, date, name).forEach(p => steps.push({ tour: otherTour, posId: p, value: OFFEN }));
  }
  return steps;
}
