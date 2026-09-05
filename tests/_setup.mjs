// Minimale Browser-Stubs, damit der App-Modulgraph headless in Node lädt.
// Reicht für den Import + reine Logik-Funktionen — KEIN echtes DOM-Verhalten.

function memStore(){
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
    clear: () => m.clear(),
    key: i => [...m.keys()][i] ?? null,
    get length(){ return m.size; },
  };
}

// Chainbares Fake-Element: jeder Methodenaufruf/Property-Zugriff bleibt harmlos.
function fakeEl(){
  const el = {
    style: {}, dataset: {}, value: '', textContent: '', innerHTML: '',
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    appendChild(){}, removeChild(){}, insertAdjacentHTML(){},
    setAttribute(){}, removeAttribute(){}, getAttribute(){ return null; },
    addEventListener(){}, removeEventListener(){},
    querySelector(){ return null; }, querySelectorAll(){ return []; },
    focus(){}, blur(){}, click(){}, remove(){},
    getBoundingClientRect(){ return { top:0, left:0, width:0, height:0, bottom:0, right:0 }; },
  };
  return el;
}

globalThis.localStorage = memStore();
globalThis.window = globalThis;
globalThis.document = {
  getElementById(){ return fakeEl(); },
  querySelector(){ return fakeEl(); },
  querySelectorAll(){ return []; },
  createElement(){ return fakeEl(); },
  addEventListener(){}, removeEventListener(){},
  body: fakeEl(),
  documentElement: fakeEl(),
};
// navigator ist in Node 24 read-only → nur setzen wenn nötig/möglich
try{ if(!globalThis.navigator) globalThis.navigator = { userAgent:'node-test' }; }catch(_){ /* ok, Node liefert eigenes navigator */ }

// location gibt es in Node nicht. Ohne Stub scheitert z.B. sendCrewInvite an
// `window.location.origin` mit einem TypeError — ein Test würde dann „wirft" sehen und
// grün werden, ohne je den geprüften Weg erreicht zu haben.
if(!globalThis.location) globalThis.location = {
  origin: 'https://test.local', pathname: '/', href: 'https://test.local/', search: '', hash: '',
};
