// ── Constants & State ──────────────────────────────────────────────────────────
export const OFFEN     = '__offen__';
export const OFFDAY       = '__offday__';
export const REISE_TAG    = '__reise_tag__';
export const AUSSCHREIBEN = '__ausschreiben__';
export const CREW_COLORS = ['#4f81bd','#70ad47','#ed7d31','#c55a11','#7030a0','#c9211e','#2e75b6','#548235'];
export const DE_DAYS = ['So','Mo','Di','Mi','Do','Fr','Sa'];
export const DE_MON  = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
export const DE_MON_FULL = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];

export let POSITIONS = [
  {id:'gl',  label:'GL',        short:'GL'},
  {id:'sys', label:'System',    short:'System'},
  {id:'lt1', label:'Licht 1',   short:'Licht 1'},
  {id:'lt2', label:'Licht 2',   short:'Licht 2'},
  {id:'lt3', label:'Licht 3',   short:'Licht 3'},
  {id:'fm',  label:'Follow Me', short:'Follow Me'},
];
export let crew = ['Max Mustermann','Anna Bauer','Tom Richter','Sara Klein','Felix Wagner','Lena Braun'];
export let defaultCrew = {};
export let assignments  = {};
export let logos = {booking:'', band:'', planer:''};

// Supabase-Laufzeit-Caches (werden nach Login befüllt)
export let crewMeta = {};            // { "Max Mustermann": { email, userId } }
export let assignmentStatuses = {};  // { "2026-07-01": { "gl": { status, proposedBy, crewName } } }

// ── Role-Based Access Control ──────────────────────────────────────────
export let USER_ROLE     = 'crew';   // superadmin | manager | booker | crew
export let IS_SUPERADMIN = false;
export let IS_MANAGER    = false;
export let IS_BOOKER     = false;
export let IS_CREW       = false;
export let IS_ADMIN      = false;    // backwards compat: true wenn IS_MANAGER
export let CURRENT_USER_ID = null;
export let CURRENT_USER_EMAIL = null;

export let TOUR_DATES = [
  {date:'2026-06-23',type:'prep', typeLabel:'Option Vorbereitung', loc:'CAB'},
  {date:'2026-06-24',type:'prep', typeLabel:'Vorbereitung',        loc:'CAB'},
  {date:'2026-06-25',type:'prep', typeLabel:'Aufbau Tag 1',        loc:'BBM'},
  {date:'2026-06-26',type:'prep', typeLabel:'Aufbau Tag 2',        loc:'BBM'},
  {date:'2026-06-27',type:'prep', typeLabel:'Probe',               loc:'BBM'},
  {date:'2026-06-28',type:'prep', typeLabel:'Probe',               loc:'BBM'},
  {date:'2026-06-29',type:'prep', typeLabel:'Probe / Abbau',       loc:'BBM'},
  {date:'2026-06-30',type:'reise',typeLabel:'Reise',               loc:'Nightliner'},
  {date:'2026-07-01',type:'show', typeLabel:'Show',                loc:'Nürnberg – PSD Bank Arena'},
  {date:'2026-07-02',type:'show', typeLabel:'Show',                loc:'Luxemburg – Rockhal'},
  {date:'2026-07-03',type:'show', typeLabel:'Show',                loc:'Frankfurt – Festhalle'},
  {date:'2026-07-04',type:'reise',typeLabel:'Reise',               loc:'Nightliner'},
  {date:'2026-07-09',type:'reise',typeLabel:'Reise',               loc:'Nightliner'},
  {date:'2026-07-10',type:'show', typeLabel:'Show',                loc:'Dortmund – Westfalenpark'},
  {date:'2026-07-11',type:'show', typeLabel:'Show',                loc:'Köln – RheinEnergieStadion'},
  {date:'2026-07-12',type:'reise',typeLabel:'Reise',               loc:'Nightliner'},
  {date:'2026-07-16',type:'reise',typeLabel:'Reise',               loc:'Nightliner'},
  {date:'2026-07-17',type:'show', typeLabel:'Show',                loc:'Neu-Ulm – Wiley Sportpark'},
  {date:'2026-07-18',type:'show', typeLabel:'Show',                loc:'Gladbach – SparkassenPark'},
  {date:'2026-07-19',type:'reise',typeLabel:'Reise',               loc:'Nightliner'},
  {date:'2026-07-28',type:'reise',typeLabel:'Reise',               loc:'Nightliner'},
  {date:'2026-07-29',type:'show', typeLabel:'Show',                loc:'Ludwigsburg – KSK Music Open'},
  {date:'2026-07-30',type:'show', typeLabel:'Show',                loc:'Füssen – Barockgarten'},
  {date:'2026-07-31',type:'reise',typeLabel:'Reise',               loc:'Nightliner'},
  {date:'2026-08-12',type:'reise',typeLabel:'Reise',               loc:'Anreise'},
  {date:'2026-08-13',type:'show', typeLabel:'Show',                loc:'Berlin – Wuhlheide'},
  {date:'2026-08-14',type:'show', typeLabel:'Show',                loc:'Berlin – Wuhlheide'},
  {date:'2026-08-15',type:'show', typeLabel:'Show',                loc:'Berlin – Wuhlheide'},
  {date:'2026-08-16',type:'reise',typeLabel:'Reise',               loc:'Abreise'},
  {date:'2026-08-19',type:'reise',typeLabel:'Reise',               loc:'Nightliner'},
  {date:'2026-08-20',type:'show', typeLabel:'Show',                loc:'Hamburg – Trabrennbahn Bahrenfeld'},
  {date:'2026-08-21',type:'show', typeLabel:'Show',                loc:'Hamburg – Trabrennbahn Bahrenfeld'},
  {date:'2026-08-22',type:'show', typeLabel:'Show',                loc:'Rostock – IGA Park'},
  {date:'2026-08-23',type:'reise',typeLabel:'Reise',               loc:'Nightliner'},
  {date:'2026-09-02',type:'reise',typeLabel:'Reise',               loc:'Nightliner'},
  {date:'2026-09-03',type:'show', typeLabel:'Show',                loc:'Hannover – ZAG Arena'},
  {date:'2026-09-04',type:'show', typeLabel:'Show',                loc:'Hannover – ZAG Arena'},
  {date:'2026-09-05',type:'show', typeLabel:'Show',                loc:'Magdeburg – Getec Arena'},
  {date:'2026-09-06',type:'reise',typeLabel:'Reise',               loc:'Nightliner'},
  {date:'2026-09-09',type:'reise',typeLabel:'Reise',               loc:'Nightliner'},
  {date:'2026-09-10',type:'show', typeLabel:'Show',                loc:'Leipzig – Quarterback Immobilien Arena'},
  {date:'2026-09-11',type:'show', typeLabel:'Show',                loc:'Leipzig – Quarterback Immobilien Arena'},
  {date:'2026-09-12',type:'show', typeLabel:'Show',                loc:'Bremen – ÖVB-Arena'},
  {date:'2026-09-13',type:'reise',typeLabel:'Reise',               loc:'Nightliner'},
  {date:'2026-09-14',type:'reise',typeLabel:'Reise',               loc:'Nightliner'},
  {date:'2026-09-15',type:'show', typeLabel:'Show',                loc:'München – Olympiahalle'},
  {date:'2026-09-16',type:'show', typeLabel:'Show',                loc:'München – Olympiahalle'},
  {date:'2026-09-17',type:'off',  typeLabel:'OFF',                 loc:'Hotel 😎'},
  {date:'2026-09-18',type:'show', typeLabel:'Show',                loc:'München – Olympiahalle'},
  {date:'2026-09-19',type:'show', typeLabel:'Show',                loc:'Wien – Stadthalle (AT)'},
  {date:'2026-09-20',type:'show', typeLabel:'Show',                loc:'Graz – Stadthalle (AT)'},
  {date:'2026-09-21',type:'reise',typeLabel:'Reise',               loc:'Nightliner'},
  {date:'2026-09-24',type:'reise',typeLabel:'Reise',               loc:'Nightliner'},
  {date:'2026-09-25',type:'show', typeLabel:'Show',                loc:'Freiburg – SICK-Arena'},
  {date:'2026-09-26',type:'show', typeLabel:'Show',                loc:'Zürich – Hallenstadion (CH)'},
  {date:'2026-09-27',type:'show', typeLabel:'Show',                loc:'Zürich – Hallenstadion (CH)'},
  {date:'2026-09-29',type:'reise',typeLabel:'Reise',               loc:'Nightliner'},
];
